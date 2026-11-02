import type {
  AiMatch,
  FollowCheckResult,
  FollowDetailResponse,
  FollowItem,
  FollowSummary,
  QbitTorrent,
  SeriesQuality,
  TvSeason,
} from "@tmdb-see/shared";
import { isQbitComplete } from "@tmdb-see/shared";
import {
  deleteFollowRow,
  ensureWantedEpisodeRows,
  followCounts,
  getFollowItemRow,
  getFollowRow,
  getFollowRowByTmdb,
  insertFollow,
  listActiveFollowRows,
  listFollowItemRows,
  listFollowRows,
  markEpisodesCoveredBy,
  markFollowCheck,
  markSeasonSkipped,
  unskipSeason,
  updateFollowItemProgress,
  updateFollowRow,
  upsertFollowItemRow,
  type FollowItemRow,
  type FollowRow,
} from "../db/follows";
import { cacheTorrent } from "../db/torrents";
import { ApiError } from "../lib/errors";
import { logger } from "../lib/logger";
import { providerManager } from "../providers/manager";
import type { ProviderTorrent } from "../providers/types";
import { parseEpisodeFromTitle, seasonPackLabel } from "../utils/episode";
import {
  buildSeriesSearchPattern,
  matchesQuality,
  titleLooksLikeSeries,
} from "../utils/media";
import { seriesEpisodeFolderName, seriesRootSavePath, seriesSavePath } from "../utils/naming";
import { buildQbitTags, torrentFilename } from "../utils/qbit-tags";
import { autoVerify, isVerified, shouldAutoVerify } from "./ai";
import { recordEvent } from "./events";
import {
  addToQbit,
  deleteQbitTorrent,
  getQbitByRef,
  listQbitTorrents,
  logQbitError,
  toLiveQbit,
} from "./qbit";
import { getPrivateSettings } from "./settings";
import { getSeriesDetails } from "./tmdb";

interface Candidate {
  torrent: ProviderTorrent;
  season: number;
  /** Inclusive last season; equals `season` for single-season candidates. */
  seasonEnd: number;
  episode: number;
  seeders: number;
}

const checking = new Set<number>();
let lastGlobalSync = 0;
let globalSyncPromise: Promise<void> | null = null;
let lastSyncFailed = false;

function parseAi(json: string | null): AiMatch | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as AiMatch;
  } catch {
    return null;
  }
}

function providerName(providerId: string | null): string | undefined {
  if (!providerId) return undefined;
  return providerManager.getAdapter(providerId)?.name ?? providerId;
}

function providerKind(providerId: string | null): "ncore" | "torznab" | undefined {
  if (!providerId) return undefined;
  return providerManager.getAdapter(providerId)?.kind;
}

export function followSummary(row: FollowRow): FollowSummary {
  let skipped: number[] = [];
  try {
    const parsed = JSON.parse(row.skipped_seasons) as unknown;
    if (Array.isArray(parsed)) skipped = parsed.filter((value): value is number => Number.isFinite(value));
  } catch {
    skipped = [];
  }
  return {
    id: row.id,
    tmdbId: row.tmdb_id,
    name: row.name,
    year: row.year ?? "",
    quality: row.quality,
    searchPattern: row.search_pattern,
    status: row.status,
    posterPath: row.poster_path || undefined,
    skippedSeasons: skipped,
    lastCheckAt: row.last_check_at || undefined,
    lastError: row.last_error || undefined,
    createdAt: row.created_at,
    counts: followCounts(row),
  };
}

function followItem(row: FollowItemRow, qbit: QbitTorrent | null): FollowItem {
  return {
    id: row.id,
    followId: row.follow_id,
    season: row.season,
    episode: row.episode,
    status: row.status,
    providerId: row.provider_id || undefined,
    providerName: providerName(row.provider_id),
    providerKind: providerKind(row.provider_id),
    torrentId: row.torrent_id || undefined,
    torrentTitle: row.torrent_title || undefined,
    qbitHash: row.qbit_hash || undefined,
    coveredBy: row.covered_by || undefined,
    ai: parseAi(row.ai_json),
    updatedAt: row.updated_at,
    createdAt: row.created_at,
    qbit: qbit ? toLiveQbit(qbit) : null,
  };
}

function buildItemQbitMap(items: FollowItemRow[], torrents: QbitTorrent[]): Map<number, QbitTorrent> {
  const byHash = new Map(torrents.map((torrent) => [torrent.hash, torrent]));
  const byRef = new Map(
    torrents
      .filter((torrent) => torrent.ref?.providerId && torrent.ref?.torrentId)
      .map((torrent) => [`${torrent.ref!.providerId}:${torrent.ref!.torrentId}`, torrent]),
  );
  const result = new Map<number, QbitTorrent>();
  for (const item of items) {
    const torrent =
      (item.qbit_hash ? byHash.get(item.qbit_hash) : undefined) ??
      (item.provider_id && item.torrent_id
        ? byRef.get(`${item.provider_id}:${item.torrent_id}`)
        : undefined);
    if (torrent) result.set(item.id, torrent);
  }
  return result;
}

async function qbitSnapshot(): Promise<QbitTorrent[]> {
  try {
    return await listQbitTorrents();
  } catch (error) {
    logQbitError("follow qbit snapshot", error);
    return [];
  }
}

async function syncAllFollowItemsFromQbit(): Promise<void> {
  if (globalSyncPromise) return globalSyncPromise;
  if (Date.now() - lastGlobalSync < (lastSyncFailed ? 30_000 : 10_000)) return;
  globalSyncPromise = (async () => {
    try {
      const torrents = await listQbitTorrents();
      lastGlobalSync = Date.now();
      lastSyncFailed = false;
      const byHash = new Map(torrents.map((torrent) => [torrent.hash, torrent]));
      const byRef = new Map(
        torrents
          .filter((torrent) => torrent.ref?.providerId && torrent.ref?.torrentId)
          .map((torrent) => [`${torrent.ref!.providerId}:${torrent.ref!.torrentId}`, torrent]),
      );
      for (const follow of listFollowRows()) {
        for (const item of listFollowItemRows(follow.id)) {
          if (!["downloading", "found"].includes(item.status)) continue;
          const torrent =
            (item.qbit_hash ? byHash.get(item.qbit_hash) : undefined) ??
            (item.provider_id && item.torrent_id
              ? byRef.get(`${item.provider_id}:${item.torrent_id}`)
              : undefined);
          if (torrent) {
            const status = isQbitComplete(torrent) ? "completed" : "downloading";
            if (status !== item.status || item.qbit_hash !== torrent.hash) {
              updateFollowItemProgress({ id: item.id, status, qbitHash: torrent.hash });
            }
          } else if (
            item.status === "downloading" &&
            Date.now() - new Date(item.updated_at).getTime() > 3 * 60 * 1000
          ) {
            updateFollowItemProgress({ id: item.id, status: "missing" });
          }
        }
      }
    } catch (error) {
      lastGlobalSync = Date.now();
      lastSyncFailed = true;
      logQbitError("follow status sync", error);
    }
  })().finally(() => {
    globalSyncPromise = null;
  });
  return globalSyncPromise;
}

async function syncFollowFromQbit(followId: number): Promise<void> {
  try {
    const torrents = await listQbitTorrents();
    const byHash = new Map(torrents.map((torrent) => [torrent.hash, torrent]));
    const byRef = new Map(
      torrents
        .filter((torrent) => torrent.ref?.providerId && torrent.ref?.torrentId)
        .map((torrent) => [`${torrent.ref!.providerId}:${torrent.ref!.torrentId}`, torrent]),
    );
    for (const item of listFollowItemRows(followId)) {
      if (!["downloading", "found"].includes(item.status)) continue;
      const torrent =
        (item.qbit_hash ? byHash.get(item.qbit_hash) : undefined) ??
        (item.provider_id && item.torrent_id
          ? byRef.get(`${item.provider_id}:${item.torrent_id}`)
          : undefined);
      if (torrent) {
        const status = isQbitComplete(torrent) ? "completed" : "downloading";
        if (status !== item.status || item.qbit_hash !== torrent.hash) {
          updateFollowItemProgress({ id: item.id, status, qbitHash: torrent.hash });
        }
      } else if (
        item.status === "downloading" &&
        Date.now() - new Date(item.updated_at).getTime() > 3 * 60 * 1000
      ) {
        updateFollowItemProgress({ id: item.id, status: "missing" });
      }
    }
  } catch (error) {
    logQbitError("follow item sync", error);
  }
}

function applySkippedSeasons(row: FollowRow, seasons: TvSeason[]): void {
  const skipped = new Set(followSummary(row).skippedSeasons);
  const episodeCounts = new Map<number, number>();
  for (const season of seasons) episodeCounts.set(season.season_number, season.episode_count);
  for (const season of skipped) {
    if (!episodeCounts.has(season)) episodeCounts.set(season, 30);
  }
  for (const [season, count] of episodeCounts) {
    if (skipped.has(season)) markSeasonSkipped(row.id, season, count);
    else unskipSeason(row.id, season);
  }
}

export async function listFollows(): Promise<FollowSummary[]> {
  await syncAllFollowItemsFromQbit();
  return listFollowRows().map(followSummary);
}

export async function getFollowDetail(tmdbId: number): Promise<FollowDetailResponse> {
  await syncAllFollowItemsFromQbit();
  const follow = getFollowRowByTmdb(tmdbId);
  let name = follow?.name ?? "";
  let year = follow?.year ?? "";
  let seasons: TvSeason[] = [];
  try {
    const details = await getSeriesDetails(tmdbId);
    name = details.name;
    year = details.year;
    seasons = details.seasons;
    if (follow) {
      if (follow.name !== details.name || follow.year !== details.year || follow.poster_path !== details.posterPath) {
        updateFollowRow(follow.id, { name: details.name, year: details.year, poster_path: details.posterPath });
      }
    }
  } catch (error) {
    logger.warn("TMDB series lookup failed", { tmdbId, error: String(error) });
  }

  if (!follow) {
    return { follow: null, items: [], seasons, name, year };
  }

  const items = listFollowItemRows(follow.id);
  const torrents = await qbitSnapshot();
  const qbitMap = buildItemQbitMap(items, torrents);
  return {
    follow: followSummary(getFollowRow(follow.id)!),
    items: items.map((item) => followItem(item, qbitMap.get(item.id) ?? null)),
    seasons,
    name,
    year,
  };
}

export async function createFollow(
  tmdbId: number,
  qualityInput: string,
  skippedSeasonsInput: number[],
): Promise<FollowSummary> {
  const settings = getPrivateSettings();
  const quality: SeriesQuality = ["2160p", "1080p", "720p"].includes(qualityInput)
    ? (qualityInput as SeriesQuality)
    : settings.app.defaultQuality;
  const skippedSeasons = [
    ...new Set(
      (skippedSeasonsInput ?? [])
        .map(Number)
        .filter((value) => Number.isFinite(value) && value >= 1),
    ),
  ];

  const existing = getFollowRowByTmdb(tmdbId);
  if (existing) {
    const nextSkipped = JSON.stringify(skippedSeasons);
    const pattern = buildSeriesSearchPattern(existing.name);
    const changed =
      existing.quality !== quality ||
      existing.search_pattern !== pattern ||
      existing.skipped_seasons !== nextSkipped;
    if (changed) {
      const updated = updateFollowRow(existing.id, {
        quality,
        search_pattern: pattern,
        skipped_seasons: nextSkipped,
      });
      try {
        const details = await getSeriesDetails(tmdbId);
        updateFollowRow(existing.id, {
          name: details.name,
          year: details.year,
          poster_path: details.posterPath,
          search_pattern: buildSeriesSearchPattern(details.name),
        });
        applySkippedSeasons(getFollowRow(existing.id)!, details.seasons);
      } catch {
        if (updated) applySkippedSeasons(updated, []);
      }
    }
    const loaded = getFollowRow(existing.id)!;
    return followSummary(loaded);
  }

  const details = await getSeriesDetails(tmdbId);
  const row = insertFollow({
    tmdbId,
    name: details.name,
    year: details.year,
    quality,
    searchPattern: buildSeriesSearchPattern(details.name),
    status: "active",
    posterPath: details.posterPath,
    skippedSeasons,
  });
  for (const season of details.seasons) {
    if (season.episode_count > 0) ensureWantedEpisodeRows(row.id, season.season_number, season.episode_count);
  }
  applySkippedSeasons(getFollowRow(row.id)!, details.seasons);
  recordEvent("success", "follow", `Following ${details.name}`, { tmdbId, quality });
  return followSummary(getFollowRow(row.id)!);
}

export async function updateFollow(
  tmdbId: number,
  patch: { quality?: string; status?: string; skippedSeasons?: number[] },
): Promise<FollowSummary> {
  const follow = getFollowRowByTmdb(tmdbId);
  if (!follow) throw new ApiError(404, "Not following this series");
  const updates: Partial<FollowRow> = {};
  if (patch.quality && ["2160p", "1080p", "720p"].includes(patch.quality)) {
    updates.quality = patch.quality as SeriesQuality;
  }
  if (patch.status && ["active", "paused"].includes(patch.status)) {
    updates.status = patch.status as FollowRow["status"];
  }
  if (patch.skippedSeasons) {
    updates.skipped_seasons = JSON.stringify(
      [...new Set(patch.skippedSeasons.map(Number).filter((value) => Number.isFinite(value) && value >= 1))],
    );
  }
  updateFollowRow(follow.id, updates);
  if (patch.skippedSeasons || patch.quality) {
    let seasons: TvSeason[] = [];
    try {
      seasons = (await getSeriesDetails(tmdbId)).seasons;
    } catch {
      seasons = [];
    }
    applySkippedSeasons(getFollowRow(follow.id)!, seasons);
  }
  return followSummary(getFollowRow(follow.id)!);
}

export async function unfollow(tmdbId: number): Promise<void> {
  const follow = getFollowRowByTmdb(tmdbId);
  if (!follow) return;
  deleteFollowRow(follow.id);
  recordEvent("info", "follow", `Unfollowed ${follow.name}`, { tmdbId });
}

async function searchSeriesTorrents(pattern: string): Promise<{ items: ProviderTorrent[]; errors: string[] }> {
  const adapters = providerManager.getEnabledAdapters();
  if (adapters.length === 0) throw new ApiError(503, "No torrent providers are enabled.");
  const items = new Map<string, ProviderTorrent>();
  const errors: string[] = [];

  await Promise.all(
    adapters.map(async (adapter) => {
      const maxPages = adapter.kind === "ncore" ? 3 : 1;
      let successes = 0;
      let lastError = "";
      for (let page = 1; page <= maxPages; page += 1) {
        try {
          const result = await adapter.search({
            query: pattern,
            page,
            pageSize: 100,
            where: "name",
            sortBy: "seeders",
            sortOrder: "desc",
          });
          successes += 1;
          for (const item of result.items) {
            items.set(`${item.providerId}:${item.id}`, item);
            try {
              cacheTorrent(item.providerId, item.id, item);
            } catch {
              // ignore
            }
          }
          if (!result.hasMore || result.items.length === 0) break;
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
          logger.warn("Follow search failed", { provider: adapter.name, page, error: lastError });
          break;
        }
      }
      if (successes === 0 && lastError) errors.push(`${adapter.name}: ${lastError}`);
    }),
  );
  if (errors.length === adapters.length) throw new Error(errors.join(" · "));
  return { items: [...items.values()], errors };
}

function seasonHasMissingEpisodes(season: number, items: FollowItemRow[], seasons: TvSeason[]): boolean {
  const acquired = new Set<number>();
  for (const item of items) {
    if (item.season !== season || item.episode <= 0) continue;
    if (item.covered_by) {
      acquired.add(item.episode);
      continue;
    }
    if (["completed", "downloading", "found"].includes(item.status)) acquired.add(item.episode);
    else return true;
  }
  const tmdbSeason = seasons.find((candidate) => candidate.season_number === season);
  if (tmdbSeason) {
    for (let episode = 1; episode <= tmdbSeason.episode_count; episode += 1) {
      if (!acquired.has(episode)) return true;
    }
  }
  return false;
}

function seasonIndividualReleases(season: number, items: FollowItemRow[]): FollowItemRow[] {
  return items.filter(
    (item) =>
      item.season === season &&
      item.episode > 0 &&
      !item.covered_by &&
      ["completed", "downloading", "found"].includes(item.status) &&
      Boolean(item.torrent_id || item.qbit_hash),
  );
}

async function removeIndividualEpisodes(items: FollowItemRow[]): Promise<void> {
  for (const item of items) {
    let hash = item.qbit_hash ?? "";
    if (!hash && item.provider_id && item.torrent_id) {
      try {
        const torrent = await getQbitByRef(item.provider_id, item.torrent_id);
        hash = torrent?.hash ?? "";
      } catch (error) {
        logQbitError("season pack upgrade lookup", error);
      }
    }
    if (!hash && item.torrent_title) {
      try {
        const torrents = await listQbitTorrents();
        const match = torrents.find(
          (torrent) =>
            torrent.name.toLowerCase() === item.torrent_title!.toLowerCase() ||
            torrent.name.toLowerCase().includes(item.torrent_title!.toLowerCase()),
        );
        hash = match?.hash ?? "";
      } catch (error) {
        logQbitError("season pack upgrade scan", error);
      }
    }
    if (!hash) {
      logger.warn("No qBittorrent hash for season-pack upgrade", {
        item: item.id,
        title: item.torrent_title,
      });
      continue;
    }
    try {
      await deleteQbitTorrent(hash, true);
      recordEvent("info", "follow", `Removed individual episode in favor of season pack`, {
        title: item.torrent_title,
      });
    } catch (error) {
      logger.warn("Could not delete individual episode during upgrade", {
        hash,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

async function grabRelease(
  follow: FollowRow,
  torrent: ProviderTorrent,
  season: number,
  episode: number,
  ai: AiMatch | null,
  seasonEnd = season,
): Promise<FollowItemRow> {
  const adapter = providerManager.getAdapter(torrent.providerId);
  if (!adapter) throw new Error("Provider is no longer available");
  const download = await adapter.download(torrent);
  // A pack spanning several seasons carries its own season structure, so it is
  // saved at the series root instead of being flattened into the first season.
  const multiSeasonPack = episode === 0 && seasonEnd > season;
  const seasonPath = multiSeasonPack
    ? seriesRootSavePath(follow.name, follow.year ?? "")
    : seriesSavePath(follow.name, follow.year ?? "", season);
  const episodeFolder =
    episode > 0 ? seriesEpisodeFolderName(follow.name, follow.year ?? "", season, episode) : undefined;
  await addToQbit({
    data: download.data,
    magnet: download.magnet,
    filename: torrentFilename(torrent.title, torrent.id),
    providerId: torrent.providerId,
    torrentId: torrent.id,
    tmdbId: follow.tmdb_id,
    mediaType: "tv",
    followId: follow.id,
    season,
    episode,
    tags: buildQbitTags({
      providerId: torrent.providerId,
      torrentId: torrent.id,
      tmdbId: follow.tmdb_id,
      mediaType: "tv",
      followId: follow.id,
      season,
      episode,
    }),
    relativeSavePath: seasonPath,
    rename: episodeFolder,
  });

  let qbitHash = "";
  try {
    const qt = await getQbitByRef(torrent.providerId, torrent.id);
    qbitHash = qt?.hash ?? "";
  } catch (error) {
    logQbitError("follow hash lookup", error);
  }

  return upsertFollowItemRow({
    followId: follow.id,
    season,
    episode,
    status: "downloading",
    providerId: torrent.providerId,
    torrentId: torrent.id,
    torrentTitle: torrent.title,
    qbitHash: qbitHash || null,
    aiJson: ai ? JSON.stringify(ai) : null,
  });
}

export async function checkFollow(followId: number): Promise<FollowCheckResult> {
  if (checking.has(followId)) throw new ApiError(409, "A check is already running for this series");
  checking.add(followId);
  try {
    const follow = getFollowRow(followId);
    if (!follow) throw new ApiError(404, "Follow not found");
    const result: FollowCheckResult = {
      followId: follow.id,
      tmdbId: follow.tmdb_id,
      searched: 0,
      matched: 0,
      scheduled: 0,
      alreadyHave: 0,
      upgraded: 0,
      lastCheckAt: new Date().toISOString(),
    };

    let details;
    try {
      details = await getSeriesDetails(follow.tmdb_id);
    } catch (error) {
      logger.warn("Follow TMDB refresh failed", { followId, error: String(error) });
      details = null;
    }

    if (details) {
      if (
        follow.name !== details.name ||
        follow.year !== details.year ||
        follow.poster_path !== details.posterPath ||
        follow.search_pattern !== buildSeriesSearchPattern(details.name)
      ) {
        updateFollowRow(follow.id, {
          name: details.name,
          year: details.year,
          poster_path: details.posterPath,
          search_pattern: buildSeriesSearchPattern(details.name),
        });
      }
      for (const season of details.seasons) {
        if (season.episode_count > 0) {
          ensureWantedEpisodeRows(follow.id, season.season_number, season.episode_count);
        }
      }
      applySkippedSeasons(getFollowRow(follow.id)!, details.seasons);
    }

    const refreshed = getFollowRow(follow.id)!;
    await syncFollowFromQbit(follow.id);
    let items = listFollowItemRows(follow.id);

    const skipped = new Set(followSummary(refreshed).skippedSeasons);
    const seasons = details?.seasons ?? [];
    const latestSeason = seasons.reduce(
      (max, season) =>
        season.season_number >= 1 && season.episode_count > 0
          ? Math.max(max, season.season_number)
          : max,
      1,
    );
    const done = new Set<string>();
    const seasonPackDone = new Set<number>();
    const keyOf = (season: number, episode: number) => `${season}:${episode}`;

    for (const item of items) {
      if (skipped.has(item.season) || item.status === "skipped") {
        if (item.episode === 0) seasonPackDone.add(item.season);
        else done.add(keyOf(item.season, item.episode));
        continue;
      }
      if (item.episode === 0 && ["completed", "downloading", "found"].includes(item.status)) {
        seasonPackDone.add(item.season);
      }
      if (
        item.episode > 0 &&
        (["completed", "downloading", "found"].includes(item.status) || Boolean(item.covered_by))
      ) {
        done.add(keyOf(item.season, item.episode));
      }
    }
    for (const item of items) {
      if (item.episode > 0 && seasonPackDone.has(item.season)) done.add(keyOf(item.season, item.episode));
    }

    let search;
    try {
      search = await searchSeriesTorrents(refreshed.search_pattern);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      markFollowCheck(follow.id, message);
      recordEvent("error", "follow", `Check failed for ${refreshed.name}`, { error: message });
      result.error = message;
      result.lastCheckAt = new Date().toISOString();
      return result;
    }
    result.searched = search.items.length;

    const packs: Candidate[] = [];
    const episodes: Candidate[] = [];
    for (const torrent of search.items) {
      if (!titleLooksLikeSeries(torrent.title, refreshed.name)) continue;
      if (!matchesQuality(torrent.title, refreshed.quality)) continue;
      const parsed = parseEpisodeFromTitle(torrent.title);
      if (!parsed) continue;
      result.matched += 1;
      const seasonEnd =
        parsed.episode === 0
          ? Math.max(
              parsed.season,
              parsed.seasonEnd ?? parsed.season,
              parsed.complete ? latestSeason : parsed.season,
            )
          : parsed.season;
      const candidate: Candidate = {
        torrent,
        season: parsed.season,
        seasonEnd,
        episode: parsed.episode,
        seeders: torrent.seeders,
      };
      if (parsed.episode === 0) packs.push(candidate);
      else episodes.push(candidate);
    }

    packs.sort((a, b) => {
      if (a.seeders !== b.seeders) return b.seeders - a.seeders;
      return providerManager.priorityFor(a.torrent.providerId) - providerManager.priorityFor(b.torrent.providerId);
    });
    episodes.sort((a, b) => {
      if (a.seeders !== b.seeders) return b.seeders - a.seeders;
      return providerManager.priorityFor(a.torrent.providerId) - providerManager.priorityFor(b.torrent.providerId);
    });

    const bestPack = new Map<number, Candidate>();
    for (const candidate of packs) {
      const existing = bestPack.get(candidate.season);
      // A complete-series pack deserves preference over a single-season pack
      // for the same starting season, but never let a dead torrent win.
      if (!existing || (candidate.seasonEnd > existing.seasonEnd && candidate.seeders > 0)) {
        bestPack.set(candidate.season, candidate);
      }
    }
    const bestEpisode = new Map<string, Candidate>();
    for (const candidate of episodes) {
      const key = keyOf(candidate.season, candidate.episode);
      if (!bestEpisode.has(key)) bestEpisode.set(key, candidate);
    }

    const verdicts = new Map<string, AiMatch>();
    let aiRejectedAll = false;
    if (shouldAutoVerify("follows") && (bestPack.size > 0 || bestEpisode.size > 0)) {
      const selected = [...new Map(
        [...bestPack.values(), ...bestEpisode.values()].map((candidate) => [
          `${candidate.torrent.providerId}:${candidate.torrent.id}`,
          candidate,
        ]),
      ).values()].slice(0, 12);
      const verification = await autoVerify(
        "follows",
        {
          type: "tv",
          tmdbId: refreshed.tmdb_id,
          title: refreshed.name,
          year: refreshed.year ?? undefined,
          quality: refreshed.quality,
        },
        selected.map((candidate) => ({
          id: candidate.torrent.id,
          providerId: candidate.torrent.providerId,
          title: candidate.torrent.title,
          size: candidate.torrent.size,
        })),
      );
      if (verification) {
        const threshold = getPrivateSettings().ai.threshold;
        let rejected = 0;
        for (const candidate of selected) {
          const key = `${candidate.torrent.providerId}:${candidate.torrent.id}`;
          const verdict = verification.get(key) ?? null;
          if (verdict) {
            verdicts.set(key, verdict);
            if (!isVerified(verdict, threshold)) rejected += 1;
          }
        }
        if (rejected > 0) {
          recordEvent("warning", "ai", `AI rejected ${rejected} candidate release(s) for ${refreshed.name}`, {
            tmdbId: refreshed.tmdb_id,
          });
        }
        const anyAllowed = [...bestPack.values(), ...bestEpisode.values()].some((candidate) => {
          const key = `${candidate.torrent.providerId}:${candidate.torrent.id}`;
          const verdict = verdicts.get(key);
          return !verdict || isVerified(verdict, threshold);
        });
        aiRejectedAll = verdicts.size > 0 && !anyAllowed;
      }
    }
    const allowed = (candidate: Candidate): boolean => {
      const verdict = verdicts.get(`${candidate.torrent.providerId}:${candidate.torrent.id}`);
      return !verdict || isVerified(verdict, getPrivateSettings().ai.threshold);
    };

    // 1) Season packs. Remove individual episode torrents/files before adding
    // the pack, otherwise flattening both onto the same season folder can
    // delete files that the pack itself uses. Removed episodes stay retriable
    // if the pack cannot be queued. A complete-series pack (S01-S04) covers
    // every season in its range and is stored at the series root.
    const orderedPacks = [...bestPack.values()].sort(
      (a, b) => a.season - b.season || b.seasonEnd - a.seasonEnd,
    );
    for (const candidate of orderedPacks) {
      const coveredSeasons: number[] = [];
      for (let season = candidate.season; season <= candidate.seasonEnd; season += 1) {
        if (!skipped.has(season)) coveredSeasons.push(season);
      }
      if (coveredSeasons.length === 0) {
        result.alreadyHave += 1;
        continue;
      }
      const remainingSeasons = coveredSeasons.filter((season) => !seasonPackDone.has(season));
      if (remainingSeasons.length === 0) {
        result.alreadyHave += 1;
        continue;
      }
      if (!allowed(candidate)) continue;
      const missing = remainingSeasons.some((season) => seasonHasMissingEpisodes(season, items, seasons));
      const individuals = remainingSeasons.flatMap((season) => seasonIndividualReleases(season, items));
      if (!missing && individuals.length === 0) continue;

      const verdict = verdicts.get(`${candidate.torrent.providerId}:${candidate.torrent.id}`) ?? null;
      if (individuals.length > 0) {
        await removeIndividualEpisodes(individuals);
        for (const item of individuals) {
          upsertFollowItemRow({
            followId: refreshed.id,
            season: item.season,
            episode: item.episode,
            status: "wanted",
          });
          done.delete(keyOf(item.season, item.episode));
        }
      }
      const label = seasonPackLabel(candidate.season, candidate.seasonEnd);
      try {
        const packItem = await grabRelease(
          refreshed,
          candidate.torrent,
          candidate.season,
          0,
          verdict,
          candidate.seasonEnd,
        );
        result.scheduled += 1;
        if (individuals.length > 0) result.upgraded += 1;
        for (const season of remainingSeasons) {
          seasonPackDone.add(season);
          markEpisodesCoveredBy(refreshed.id, season, packItem.id);
          for (const item of items) {
            if (item.season === season && item.episode > 0) done.add(keyOf(season, item.episode));
          }
        }
        recordEvent("success", "follow", `Season pack queued for ${refreshed.name} ${label}`, {
          title: candidate.torrent.title,
          provider: providerName(candidate.torrent.providerId),
        });
      } catch (error) {
        logger.warn("Could not grab season pack", {
          season: candidate.season,
          seasonEnd: candidate.seasonEnd,
          error: String(error),
        });
        upsertFollowItemRow({
          followId: refreshed.id,
          season: candidate.season,
          episode: 0,
          status: "failed",
          providerId: candidate.torrent.providerId,
          torrentId: candidate.torrent.id,
          torrentTitle: candidate.torrent.title,
          aiJson: verdict ? JSON.stringify(verdict) : null,
        });
        recordEvent("error", "follow", `Season pack failed for ${refreshed.name} ${label}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // 2) Individual episodes.
    for (const [key, candidate] of bestEpisode) {
      if (skipped.has(candidate.season) || seasonPackDone.has(candidate.season) || done.has(key)) {
        if (done.has(key) || seasonPackDone.has(candidate.season)) result.alreadyHave += 1;
        continue;
      }
      if (!allowed(candidate)) continue;
      const existing = getFollowItemRow(refreshed.id, candidate.season, candidate.episode);
      if (existing && ["completed", "downloading", "found"].includes(existing.status)) {
        result.alreadyHave += 1;
        continue;
      }
      if (!existing) {
        upsertFollowItemRow({
          followId: refreshed.id,
          season: candidate.season,
          episode: candidate.episode,
          status: "wanted",
        });
      }
      const verdict = verdicts.get(`${candidate.torrent.providerId}:${candidate.torrent.id}`) ?? null;
      try {
        await grabRelease(refreshed, candidate.torrent, candidate.season, candidate.episode, verdict);
        result.scheduled += 1;
        done.add(key);
      } catch (error) {
        logger.warn("Could not grab episode", {
          season: candidate.season,
          episode: candidate.episode,
          error: String(error),
        });
        upsertFollowItemRow({
          followId: refreshed.id,
          season: candidate.season,
          episode: candidate.episode,
          status: "failed",
          providerId: candidate.torrent.providerId,
          torrentId: candidate.torrent.id,
          torrentTitle: candidate.torrent.title,
          aiJson: verdict ? JSON.stringify(verdict) : null,
        });
      }
    }

    // 3) Mark remaining requested episodes as not found. Keep failed/missing rows retriable.
    items = listFollowItemRows(refreshed.id);
    for (const item of items) {
      if (item.episode <= 0) continue;
      if (skipped.has(item.season) || item.status === "skipped") continue;
      if (["completed", "downloading", "found", "failed", "missing"].includes(item.status)) continue;
      if (item.covered_by) continue;
      if (seasonPackDone.has(item.season) || done.has(keyOf(item.season, item.episode))) continue;
      upsertFollowItemRow({
        followId: refreshed.id,
        season: item.season,
        episode: item.episode,
        status: "cannot_find",
      });
    }

    const lastError = aiRejectedAll
      ? "AI rejected every candidate release; try another quality or lower the AI threshold."
      : "";
    markFollowCheck(refreshed.id, lastError || null);
    result.lastCheckAt = new Date().toISOString();
    if (lastError) result.error = lastError;
    if (result.scheduled > 0 || result.upgraded > 0 || lastError) {
      recordEvent(
        result.scheduled > 0 ? "success" : "warning",
        "follow",
        `Checked ${refreshed.name}: ${result.scheduled} scheduled, ${result.alreadyHave} already present`,
        { searched: result.searched, matched: result.matched, upgraded: result.upgraded },
      );
    } else {
      logger.debug("Follow check completed without changes", {
        followId: refreshed.id,
        searched: result.searched,
        matched: result.matched,
      });
    }
    return result;
  } finally {
    checking.delete(followId);
  }
}

export async function checkAllFollows(): Promise<FollowCheckResult[]> {
  const follows = listActiveFollowRows();
  const results: FollowCheckResult[] = [];
  for (const follow of follows) {
    try {
      results.push(await checkFollow(follow.id));
    } catch (error) {
      logger.warn("Scheduled follow check failed", {
        follow: follow.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}

export function scheduleFollowCheck(followId: number): void {
  setTimeout(() => {
    void checkFollow(followId).catch((error) => {
      logger.warn("Background follow check failed", {
        followId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, 50);
}

export async function syncFollowTracking(): Promise<void> {
  await syncAllFollowItemsFromQbit();
}
