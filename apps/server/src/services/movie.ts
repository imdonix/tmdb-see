import type {
  AiMatch,
  MovieDetails,
  MovieDownloadState,
  MovieOverview,
  MovieResolution,
  Quality,
} from "@tmdb-see/shared";
import { isQbitComplete } from "@tmdb-see/shared";
import { getMovieDownloadRow, updateMovieDownload, upsertMovieDownload } from "../db/movies";
import { cacheTorrent } from "../db/torrents";
import { ApiError } from "../lib/errors";
import { Mutex } from "../lib/mutex";
import { logger } from "../lib/logger";
import { providerManager } from "../providers/manager";
import type { ProviderTorrent } from "../providers/types";
import { autoVerify, aiStatus, isVerified, shouldAutoVerify } from "./ai";
import { recordEvent } from "./events";
import { addToQbit, getQbitByRef, logQbitError } from "./qbit";
import { getPrivateSettings } from "./settings";
import { getMovieDetails } from "./tmdb";
import {
  detectResolution,
  isCamRelease,
  matchesQuality,
  movieYearMatches,
  titleLooksLikeContent,
} from "../utils/media";
import { movieSavePath } from "../utils/naming";
import { buildQbitTags, torrentFilename } from "../utils/qbit-tags";

const RESOLUTION_ORDER: Quality[] = ["2160p", "1080p", "720p", "480p", "SD"];
const DEFAULT_ORDER: Quality[] = ["1080p", "2160p", "720p", "480p", "SD"];
const releaseCache = new Map<string, { at: number; items: ProviderTorrent[]; errors: string[] }>();
const RELEASE_TTL = 10 * 60 * 1000;
const downloadMutex = new Mutex();

function parseAi(json: string | null): AiMatch | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as AiMatch;
  } catch {
    return null;
  }
}

function providerName(providerId: string): string {
  return providerManager.getAdapter(providerId)?.name ?? providerId;
}

function buildResolutions(items: ProviderTorrent[]): MovieResolution[] {
  const byQuality = new Map<
    Quality,
    {
      releases: number;
      seeders: number;
      providers: Map<string, { releases: number; seeders: number }>;
    }
  >();

  for (const item of items) {
    const quality = item.quality || detectResolution(item.title);
    if (!quality) continue;
    const bucket = byQuality.get(quality) ?? {
      releases: 0,
      seeders: 0,
      providers: new Map<string, { releases: number; seeders: number }>(),
    };
    bucket.releases += 1;
    bucket.seeders = Math.max(bucket.seeders, item.seeders);
    const provider = bucket.providers.get(item.providerId) ?? { releases: 0, seeders: 0 };
    provider.releases += 1;
    provider.seeders = Math.max(provider.seeders, item.seeders);
    bucket.providers.set(item.providerId, provider);
    byQuality.set(quality, bucket);
  }

  if (byQuality.size === 0 && items.length > 0) {
    const bestSeeders = Math.max(...items.map((item) => item.seeders));
    const providers = new Map<string, { releases: number; seeders: number }>();
    for (const item of items) {
      const entry = providers.get(item.providerId) ?? { releases: 0, seeders: 0 };
      entry.releases += 1;
      entry.seeders = Math.max(entry.seeders, item.seeders);
      providers.set(item.providerId, entry);
    }
    return [
      {
        quality: "Auto",
        releases: items.length,
        seeders: bestSeeders,
        providers: [...providers].map(([providerId, value]) => ({
          providerId,
          providerName: providerName(providerId),
          providerKind: items.find((item) => item.providerId === providerId)?.providerKind ?? "ncore",
          ...value,
        })),
      },
    ];
  }

  return RESOLUTION_ORDER.filter((quality) => byQuality.has(quality)).map((quality) => {
    const bucket = byQuality.get(quality)!;
    return {
      quality,
      releases: bucket.releases,
      seeders: bucket.seeders,
      providers: [...bucket.providers].map(([providerId, value]) => ({
        providerId,
        providerName: providerName(providerId),
        providerKind:
          items.find((item) => item.providerId === providerId)?.providerKind ?? "ncore",
        ...value,
      })),
    };
  });
}

async function searchMovieReleases(movie: MovieDetails): Promise<{
  items: ProviderTorrent[];
  errors: string[];
}> {
  const key = `${movie.name}\u0000${movie.year}`;
  const hit = releaseCache.get(key);
  if (hit && Date.now() - hit.at < RELEASE_TTL) return { items: hit.items, errors: hit.errors };

  const patterns = [
    movie.searchPattern,
    movie.name.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim(),
  ].filter((value, index, all) => value && all.indexOf(value) === index);

  const adapters = providerManager.getEnabledAdapters();
  if (adapters.length === 0) throw new ApiError(503, "No torrent providers are enabled.");

  const itemsByKey = new Map<string, ProviderTorrent>();
  const errors: string[] = [];

  await Promise.all(
    adapters.map(async (adapter) => {
      let successes = 0;
      let providerError = "";
      const pages = adapter.kind === "ncore" ? 3 : 1;
      for (const pattern of patterns) {
        for (let page = 1; page <= pages; page += 1) {
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
            if (result.items.length === 0) break;
            for (const item of result.items) {
              if (!titleLooksLikeContent(item.title, movie.name)) continue;
              if (!movieYearMatches(item.title, movie.name, movie.year)) continue;
              itemsByKey.set(`${item.providerId}:${item.id}`, item);
            }
            if (!result.hasMore) break;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            providerError = message;
            logger.warn("Movie release search failed", {
              provider: adapter.name,
              pattern,
              page,
              error: message,
            });
            break;
          }
        }
      }
      if (successes === 0 && providerError) errors.push(`${adapter.name}: ${providerError}`);
    }),
  );

  const items = [...itemsByKey.values()];
  for (const item of items) {
    try {
      cacheTorrent(item.providerId, item.id, item);
    } catch {
      // ignore cache errors
    }
  }
  if (errors.length === 0 || items.length > 0) {
    if (releaseCache.size > 100) releaseCache.clear();
    releaseCache.set(key, { at: Date.now(), items, errors });
  }
  return { items, errors };
}

function candidateScore(item: ProviderTorrent): [number, number, number, number] {
  return [
    isCamRelease(item.title) ? 0 : 1,
    item.seeders,
    -providerManager.priorityFor(item.providerId),
    new Date(item.publishedAt ?? 0).getTime(),
  ];
}

function orderCandidates(items: ProviderTorrent[]): ProviderTorrent[] {
  return [...items].sort((a, b) => {
    const left = candidateScore(a);
    const right = candidateScore(b);
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) return right[index] - left[index];
    }
    return a.title.localeCompare(b.title);
  });
}

function bestAvailableQuality(items: ProviderTorrent[]): Quality | "" {
  for (const quality of DEFAULT_ORDER) {
    if (items.some((item) => detectResolution(item.title) === quality)) return quality;
  }
  return items.length > 0 ? "Auto" : "";
}

export async function getMovieOverview(tmdbId: number): Promise<MovieOverview> {
  const movie = await getMovieDetails(tmdbId);
  const overview: MovieOverview = {
    movie,
    resolutions: [],
    download: null,
    aiEnabled: aiStatus().enabled,
  };

  try {
    const releases = await searchMovieReleases(movie);
    overview.resolutions = buildResolutions(releases.items);
    if (releases.items.length === 0 && releases.errors.length > 0) {
      overview.searchError = releases.errors.join(" · ");
    }
  } catch (error) {
    overview.searchError = error instanceof Error ? error.message : String(error);
  }

  try {
    overview.download = await getMovieDownloadState(tmdbId);
  } catch (error) {
    logQbitError("movie overview", error);
  }
  return overview;
}

export async function getMovieDownloadState(tmdbId: number): Promise<MovieDownloadState | null> {
  const row = getMovieDownloadRow(tmdbId);
  if (!row) return null;
  const state: MovieDownloadState = {
    tmdbId: row.tmdb_id,
    providerId: row.provider_id,
    providerName: providerName(row.provider_id),
    torrentId: row.torrent_id,
    torrentTitle: row.torrent_title,
    quality: row.quality,
    qbitHash: row.qbit_hash ?? undefined,
    status: row.status as MovieDownloadState["status"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    progress: 0,
    ai: parseAi(row.ai_json),
  };

  try {
    const torrent = await getQbitByRef(row.provider_id, row.torrent_id);
    if (!torrent) {
      const recentlyUpdated = Date.now() - new Date(row.updated_at).getTime() < 2 * 60 * 1000;
      if (!recentlyUpdated) {
        state.status = "missing";
        updateMovieDownload(tmdbId, { status: "missing" });
      }
      return state;
    }
    const completed = isQbitComplete(torrent);
    state.qbitHash = torrent.hash;
    state.status = completed ? "completed" : "downloading";
    state.state = torrent.state;
    state.size = torrent.size;
    state.downloaded = torrent.downloaded;
    state.dlspeed = torrent.dlspeed;
    state.eta = torrent.eta;
    state.ratio = torrent.ratio;
    state.progress = completed ? 100 : Math.round(torrent.progress * 100);
    if (row.status !== state.status || row.qbit_hash !== torrent.hash) {
      updateMovieDownload(tmdbId, { status: state.status, qbit_hash: torrent.hash });
    }
    return state;
  } catch (error) {
    logQbitError("movie download state", error);
    return state;
  }
}

export async function downloadMovie(
  tmdbId: number,
  requestedQuality: string,
  requestedProviderId?: string,
): Promise<MovieDownloadState> {
  return downloadMutex.run(async () => {
    const movie = await getMovieDetails(tmdbId);
    const releases = await searchMovieReleases(movie);
    if (releases.items.length === 0) {
      throw new ApiError(
        404,
        releases.errors.length
          ? `No releases found: ${releases.errors.join(" · ")}`
          : `No releases found for ${movie.name}`,
      );
    }

    let pool = releases.items;
    if (requestedProviderId) {
      pool = pool.filter((item) => item.providerId === requestedProviderId);
      if (pool.length === 0) throw new ApiError(404, "The selected provider has no releases for this movie");
    }

    const quality: Quality | "" = requestedQuality
      ? (requestedQuality as Quality)
      : bestAvailableQuality(pool);

    if (!quality) throw new ApiError(404, `No releases found for ${movie.name}`);

    let candidates = pool.filter((item) =>
      quality === "Auto" ? true : detectResolution(item.title) === quality || matchesQuality(item.title, quality),
    );
    if (candidates.length === 0) {
      throw new ApiError(404, `No ${quality} release found for ${movie.name}`);
    }
    candidates = orderCandidates(candidates);

    let aiMatch: AiMatch | null = null;
    if (shouldAutoVerify("downloads")) {
      const verificationItems = candidates.slice(0, 8).map((item) => ({
        id: item.id,
        providerId: item.providerId,
        title: item.title,
        size: item.size,
      }));
      const verdicts = await autoVerify(
        "downloads",
        { type: "movie", tmdbId, title: movie.name, year: movie.year, quality },
        verificationItems,
      );
      if (verdicts) {
        const threshold = getPrivateSettings().ai.threshold;
        const verified = candidates.filter((item) => {
          const verdict = verdicts.get(`${item.providerId}:${item.id}`);
          return isVerified(verdict, threshold);
        });
        if (verified.length === 0) {
          const reasons = verificationItems
            .slice(0, 3)
            .map((item) => `${item.title}: ${verdicts.get(`${item.providerId}:${item.id}`)?.reason ?? "rejected"}`)
            .join(" · ");
          throw new ApiError(
            409,
            `AI could not confirm any matching release. ${reasons || "Try another quality or adjust the AI threshold."}`,
          );
        }
        candidates = verified;
        const bestVerdict = verdicts.get(`${candidates[0].providerId}:${candidates[0].id}`);
        aiMatch = bestVerdict ?? null;
      }
    }

    const best = candidates[0];

    const existing = getMovieDownloadRow(tmdbId);
    if (existing) {
      try {
        const inQbit = await getQbitByRef(existing.provider_id, existing.torrent_id);
        if (inQbit) return (await getMovieDownloadState(tmdbId))!;
        if (existing.status === "downloading") {
          const created = new Date(existing.created_at).getTime();
          if (Date.now() - created < 2 * 60 * 1000) {
            return (await getMovieDownloadState(tmdbId))!;
          }
        }
      } catch (error) {
        logQbitError("movie duplicate check", error);
      }
    }

    const adapter = providerManager.getAdapter(best.providerId);
    if (!adapter) throw new ApiError(404, "The provider for this release is no longer available");
    const download = await adapter.download(best);
    const folder = movieSavePath(movie.name, movie.year);
    await addToQbit({
      data: download.data,
      magnet: download.magnet,
      filename: torrentFilename(best.title, best.id),
      providerId: best.providerId,
      torrentId: best.id,
      tmdbId,
      mediaType: "movie",
      tags: buildQbitTags({
        providerId: best.providerId,
        torrentId: best.id,
        tmdbId,
        mediaType: "movie",
      }),
      relativeSavePath: folder,
    });

    let qbitHash: string | undefined;
    try {
      const torrent = await getQbitByRef(best.providerId, best.id);
      qbitHash = torrent?.hash;
    } catch (error) {
      logQbitError("movie hash lookup", error);
    }

    upsertMovieDownload({
      tmdbId,
      providerId: best.providerId,
      torrentId: best.id,
      torrentTitle: best.title,
      quality,
      qbitHash,
      status: "downloading",
      aiJson: aiMatch ? JSON.stringify(aiMatch) : null,
    });
    recordEvent("success", "movie", `Downloading ${movie.name}`, {
      title: best.title,
      provider: adapter.name,
      quality,
      ai: aiMatch?.verified ?? null,
    });
    return (await getMovieDownloadState(tmdbId))!;
  });
}

export function clearMovieReleaseCache(): void {
  releaseCache.clear();
}
