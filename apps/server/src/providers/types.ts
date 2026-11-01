import type {
  ProviderCapabilities,
  ProviderCategory,
  ProviderHealth,
  ProviderKind,
  SearchSort,
  SortOrder,
  TorrentItem,
  TrackerActivityItem,
} from "@tmdb-see/shared";

export interface ProviderSearchOptions {
  query: string;
  page: number;
  pageSize: number;
  category?: string;
  where?: string;
  sortBy: SearchSort;
  sortOrder: SortOrder;
}

export interface ProviderTorrent extends TorrentItem {
  /** Internal only. Must never be returned by the public API. */
  downloadUrl?: string;
  magnet?: string;
  infoHash?: string;
  description?: string;
  raw?: Record<string, unknown>;
}

export interface ProviderSearchResult {
  items: ProviderTorrent[];
  totalPages?: number;
  hasMore: boolean;
}

export interface ProviderDownload {
  data?: Uint8Array;
  magnet?: string;
  filename: string;
}

export interface ProviderAdapter {
  readonly id: string;
  readonly name: string;
  readonly kind: ProviderKind;
  readonly capabilities: ProviderCapabilities;
  search(options: ProviderSearchOptions): Promise<ProviderSearchResult>;
  getTorrent?(torrentId: string): Promise<ProviderTorrent | null>;
  download(torrent: ProviderTorrent): Promise<ProviderDownload>;
  categories(): Promise<ProviderCategory[]>;
  test(): Promise<ProviderHealth>;
  activity?(): Promise<TrackerActivityItem[]>;
  recommended?(): Promise<ProviderTorrent[]>;
}

export function publicTorrent(torrent: ProviderTorrent): TorrentItem {
  const { downloadUrl: _downloadUrl, magnet: _magnet, infoHash: _infoHash, description: _description, raw: _raw, ...rest } = torrent;
  return rest;
}
