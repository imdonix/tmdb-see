import type {
  SearchProviderMeta,
  SearchRequest,
  SearchResponse,
  SearchSort,
  SortOrder,
  TorrentDetail,
  TorrentItem,
  MediaTarget,
} from "@tmdb-see/shared";
import { cacheTorrent, getCachedTorrent } from "../db/torrents";
import { ApiError } from "../lib/errors";
import { providerManager } from "../providers/manager";
import type {
  ProviderAdapter,
  ProviderSearchOptions,
  ProviderSearchResult,
  ProviderTorrent,
} from "../providers/types";
import { publicTorrent } from "../providers/types";
import { buildQbitTags, torrentFilename } from "../utils/qbit-tags";
import { recordEvent } from "./events";
import { getQbitByRef, addToQbit } from "./qbit";
import { getPrivateSettings } from "./settings";

export interface InternalSearchOptions {
  query: string;
  providerIds?: string[];
  category?: string;
  where?: string;
  page?: number;
  pageSize?: number;
  sortBy?: SearchSort;
  sortOrder?: SortOrder;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function sortItems(items: ProviderTorrent[], sortBy: SearchSort, sortOrder: SortOrder): ProviderTorrent[] {
  const direction = sortOrder === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    let comparison = 0;
    switch (sortBy) {
      case "title":
        comparison = a.title.localeCompare(b.title);
        break;
      case "size":
        comparison = (a.size ?? 0) - (b.size ?? 0);
        break;
      case "date":
        comparison =
          new Date(a.publishedAt ?? 0).getTime() - new Date(b.publishedAt ?? 0).getTime();
        break;
      case "leechers":
        comparison = a.leechers - b.leechers;
        break;
      case "seeders":
      default:
        comparison = a.seeders - b.seeders;
        break;
    }
    if (comparison !== 0) return comparison * direction;
    const priorityA = providerManager.priorityFor(a.providerId);
    const priorityB = providerManager.priorityFor(b.providerId);
    if (priorityA !== priorityB) return priorityA - priorityB;
    return a.title.localeCompare(b.title);
  });
}

function cacheItems(items: ProviderTorrent[]): void {
  for (const item of items) {
    try {
      cacheTorrent(item.providerId, item.id, item);
    } catch {
      // Cache failures must not break search.
    }
  }
}

export async function searchProviders(options: InternalSearchOptions): Promise<{
  items: ProviderTorrent[];
  metas: SearchProviderMeta[];
  hasMore: boolean;
}> {
  const settings = getPrivateSettings();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = clamp(options.pageSize ?? settings.app.searchPageSize, 1, 100);
  const sortBy = options.sortBy ?? "seeders";
  const sortOrder = options.sortOrder ?? "desc";

  const allAdapters = new Map(providerManager.getEnabledAdapters().map((adapter) => [adapter.id, adapter]));
  let adapters: ProviderAdapter[];
  if (options.providerIds && options.providerIds.length > 0) {
    adapters = options.providerIds
      .map((id) => allAdapters.get(id))
      .filter((adapter): adapter is ProviderAdapter => Boolean(adapter));
    if (adapters.length === 0) {
      throw new ApiError(400, "None of the requested providers are enabled");
    }
  } else {
    adapters = [...allAdapters.values()];
  }

  if (adapters.length === 0) {
    throw new ApiError(503, "No torrent providers are enabled. Add one in Settings → Providers.");
  }

  const searches = adapters.map(async (adapter) => {
    const started = Date.now();
    const providerOptions: ProviderSearchOptions = {
      query: options.query,
      page,
      pageSize,
      category: options.category,
      where: options.where,
      sortBy,
      sortOrder,
    };
    try {
      const result = await adapter.search(providerOptions);
      cacheItems(result.items);
      return {
        adapter,
        result,
        latencyMs: Date.now() - started,
        error: "",
      };
    } catch (error) {
      return {
        adapter,
        result: { items: [], hasMore: false } as ProviderSearchResult,
        latencyMs: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  const settled = await Promise.all(searches);
  const items = sortItems(
    settled.flatMap((entry) => entry.result.items),
    sortBy,
    sortOrder,
  );

  const metas: SearchProviderMeta[] = settled.map((entry) => ({
    providerId: entry.adapter.id,
    providerName: entry.adapter.name,
    providerKind: entry.adapter.kind,
    ok: !entry.error,
    count: entry.result.items.length,
    page,
    totalPages: entry.result.totalPages,
    hasMore: entry.result.hasMore,
    latencyMs: entry.latencyMs,
    ...(entry.error ? { error: entry.error } : {}),
  }));

  return {
    items,
    metas,
    hasMore: metas.some((meta) => meta.hasMore),
  };
}

export async function searchPublic(request: SearchRequest): Promise<SearchResponse> {
  const settings = getPrivateSettings();
  const page = Math.max(1, request.page ?? 1);
  const pageSize = clamp(request.pageSize ?? settings.app.searchPageSize, 1, 100);
  const result = await searchProviders({
    query: request.query ?? "",
    providerIds: request.providerIds,
    category: request.category,
    where: request.where,
    page,
    pageSize,
    sortBy: request.sortBy,
    sortOrder: request.sortOrder,
  });
  return {
    items: result.items.map((item) => publicTorrent(item)),
    providers: result.metas,
    page,
    pageSize,
    hasMore: result.hasMore,
  };
}

export async function getInternalTorrent(
  providerId: string,
  torrentId: string,
): Promise<ProviderTorrent | null> {
  const adapter = providerManager.getAdapter(providerId);
  if (adapter?.getTorrent) {
    try {
      const fresh = await adapter.getTorrent(torrentId);
      if (fresh) {
        cacheTorrent(providerId, torrentId, fresh);
        return fresh;
      }
    } catch {
      // Fall back to a cached search result if the provider is transiently down.
    }
  }
  return getCachedTorrent<ProviderTorrent>(providerId, torrentId);
}

export async function getTorrentDetail(
  providerId: string,
  torrentId: string,
): Promise<TorrentDetail | null> {
  const torrent = await getInternalTorrent(providerId, torrentId);
  if (!torrent) return null;
  return {
    ...publicTorrent(torrent),
    description: torrent.description,
    infoHash: torrent.infoHash,
    magnet: torrent.magnet,
    downloadAvailable: Boolean(torrent.downloadUrl || torrent.magnet || torrent.providerKind === "ncore"),
  };
}

export async function downloadTorrentFile(
  providerId: string,
  torrentId: string,
): Promise<{ data: Uint8Array; filename: string }> {
  const adapter = providerManager.getAdapter(providerId);
  if (!adapter) throw new ApiError(404, "Provider not found");
  const torrent = await getInternalTorrent(providerId, torrentId);
  if (!torrent) throw new ApiError(404, "Torrent not found. Search for it again.");
  const download = await adapter.download(torrent);
  if (!download.data) throw new ApiError(400, "This result does not provide a .torrent file");
  return { data: download.data, filename: torrentFilename(torrent.title, torrent.id) };
}

export async function grabTorrent(input: {
  providerId: string;
  torrentId: string;
  target?: MediaTarget;
}): Promise<{ item: TorrentItem; alreadyInQbit: boolean }> {
  const adapter = providerManager.getAdapter(input.providerId);
  if (!adapter) throw new ApiError(404, "Provider not found");
  const torrent = await getInternalTorrent(input.providerId, input.torrentId);
  if (!torrent) throw new ApiError(404, "Torrent not found. Search for it again.");

  const existing = await getQbitByRef(input.providerId, input.torrentId).catch(() => null);
  if (existing) {
    return { item: publicTorrent(torrent), alreadyInQbit: true };
  }

  const download = await adapter.download(torrent);
  const tags = buildQbitTags({
    providerId: input.providerId,
    torrentId: input.torrentId,
    tmdbId: input.target?.tmdbId,
    mediaType: input.target?.type,
    season: input.target?.season,
    episode: input.target?.episode,
  });
  await addToQbit({
    data: download.data,
    magnet: download.magnet,
    filename: torrentFilename(torrent.title, torrent.id),
    providerId: input.providerId,
    torrentId: input.torrentId,
    tmdbId: input.target?.tmdbId,
    mediaType: input.target?.type,
    season: input.target?.season,
    episode: input.target?.episode,
    tags,
  });
  recordEvent("success", "download", `Sent ${torrent.title} to qBittorrent`, {
    provider: adapter.name,
    torrentId: torrent.id,
  });
  return { item: publicTorrent(torrent), alreadyInQbit: false };
}
