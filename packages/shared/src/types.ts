export type MediaType = "movie" | "tv";
export type ProviderKind = "ncore" | "torznab";
export type SeriesQuality = "2160p" | "1080p" | "720p";
export type Quality = "2160p" | "1080p" | "720p" | "480p" | "SD" | "Auto";

export interface MediaTarget {
  type: MediaType;
  tmdbId: number;
  title: string;
  year?: string;
  season?: number;
  episode?: number;
  quality?: string;
}

export interface ProviderCapabilities {
  browse: boolean;
  details: boolean;
  download: boolean;
  activity: boolean;
  recommended: boolean;
  categories: boolean;
}

export interface ProviderHealth {
  ok: boolean;
  message: string;
  latencyMs?: number;
  checkedAt?: string;
}

export interface ProviderCategory {
  value: string;
  label: string;
  group?: string;
}

export interface ProviderSummary {
  id: string;
  name: string;
  kind: ProviderKind;
  enabled: boolean;
  priority: number;
  capabilities: ProviderCapabilities;
  categories: ProviderCategory[];
  health?: ProviderHealth | null;
}

export interface ProviderAdminView extends ProviderSummary {
  config: Record<string, unknown>;
}

export interface AiMatch {
  verified: boolean;
  confidence: number;
  reason: string;
  cached?: boolean;
  model?: string;
}

export interface TorrentItem {
  providerId: string;
  providerName: string;
  providerKind: ProviderKind;
  id: string;
  title: string;
  size?: number;
  sizeLabel?: string;
  seeders: number;
  leechers: number;
  category?: string;
  categoryLabel?: string;
  publishedAt?: string;
  sourceUrl?: string;
  quality?: Quality | "";
  ai?: AiMatch | null;
}

export interface TorrentDetail extends TorrentItem {
  description?: string;
  infoHash?: string;
  magnet?: string;
  downloadAvailable: boolean;
  raw?: Record<string, unknown>;
}

export type SearchSort = "seeders" | "leechers" | "size" | "date" | "title";
export type SortOrder = "asc" | "desc";

export interface SearchRequest {
  query: string;
  providerIds?: string[];
  category?: string;
  where?: string;
  page?: number;
  pageSize?: number;
  sortBy?: SearchSort;
  sortOrder?: SortOrder;
  target?: MediaTarget;
}

export interface SearchProviderMeta {
  providerId: string;
  providerName: string;
  providerKind: ProviderKind;
  ok: boolean;
  count: number;
  page: number;
  totalPages?: number;
  hasMore: boolean;
  latencyMs: number;
  error?: string;
}

export interface SearchResponse {
  items: TorrentItem[];
  providers: SearchProviderMeta[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface TvSeason {
  season_number: number;
  episode_count: number;
  name: string;
  air_date?: string;
  poster_path?: string;
}

export interface MovieDetails {
  tmdbId: number;
  name: string;
  year: string;
  releaseDate: string;
  posterPath?: string;
  searchPattern: string;
}

export interface ResolutionProvider {
  providerId: string;
  providerName: string;
  providerKind: ProviderKind;
  releases: number;
  seeders: number;
}

export interface MovieResolution {
  quality: Quality;
  releases: number;
  seeders: number;
  providers: ResolutionProvider[];
}

export type MovieDownloadStatus = "downloading" | "completed" | "missing" | "failed";

export interface MovieDownloadState {
  tmdbId: number;
  providerId: string;
  providerName?: string;
  torrentId: string;
  torrentTitle: string;
  quality: Quality | string;
  qbitHash?: string;
  status: MovieDownloadStatus;
  createdAt: string;
  updatedAt: string;
  progress: number;
  state?: string;
  size?: number;
  downloaded?: number;
  dlspeed?: number;
  eta?: number;
  ratio?: number;
  ai?: AiMatch | null;
}

export interface MovieOverview {
  movie: MovieDetails;
  resolutions: MovieResolution[];
  download: MovieDownloadState | null;
  searchError?: string;
  aiEnabled: boolean;
}

export type FollowStatus = "active" | "paused";
export type FollowItemStatus =
  | "wanted"
  | "found"
  | "downloading"
  | "completed"
  | "failed"
  | "cannot_find"
  | "skipped"
  | "missing";

export interface FollowCounts {
  wanted: number;
  found: number;
  completed: number;
  total: number;
}

export interface FollowSummary {
  id: number;
  tmdbId: number;
  name: string;
  year: string;
  quality: SeriesQuality;
  searchPattern: string;
  status: FollowStatus;
  posterPath?: string;
  skippedSeasons: number[];
  lastCheckAt?: string;
  lastError?: string;
  createdAt: string;
  counts: FollowCounts;
}

export interface LiveQbit {
  hash: string;
  name: string;
  progress: number;
  state: string;
  size: number;
  downloaded: number;
  uploaded: number;
  dlspeed: number;
  upspeed: number;
  eta: number;
  ratio: number;
  numSeeds: number;
  numLeechs: number;
  savePath?: string;
  addedOn?: number;
  completionOn?: number;
}

export interface FollowItem {
  id: number;
  followId: number;
  season: number;
  episode: number;
  status: FollowItemStatus;
  providerId?: string;
  providerName?: string;
  providerKind?: ProviderKind;
  torrentId?: string;
  torrentTitle?: string;
  qbitHash?: string;
  coveredBy?: number;
  ai?: AiMatch | null;
  updatedAt: string;
  createdAt: string;
  qbit?: LiveQbit | null;
}

export interface FollowDetailResponse {
  follow: FollowSummary | null;
  items: FollowItem[];
  seasons: TvSeason[];
  name: string;
  year: string;
}

export interface FollowCheckResult {
  followId: number;
  tmdbId: number;
  searched: number;
  matched: number;
  scheduled: number;
  alreadyHave: number;
  upgraded: number;
  error?: string;
  lastCheckAt: string;
}

export interface FollowCheckResponse {
  result: FollowCheckResult;
  follow: FollowSummary | null;
  items: FollowItem[];
}

export interface QbitRef {
  providerId?: string;
  providerName?: string;
  providerKind?: ProviderKind;
  torrentId?: string;
  tmdbId?: number;
  mediaType?: MediaType;
  followId?: number;
  season?: number;
  episode?: number;
}

export interface QbitTorrent {
  hash: string;
  name: string;
  progress: number;
  state: string;
  size: number;
  downloaded: number;
  uploaded: number;
  dlspeed: number;
  upspeed: number;
  eta: number;
  ratio: number;
  tags: string;
  category: string;
  savePath: string;
  addedOn: number;
  completionOn: number;
  numSeeds: number;
  numLeechs: number;
  ref?: QbitRef;
}

export interface AiVerifyItem {
  id?: string;
  providerId?: string;
  title: string;
  size?: number;
}

export interface AiVerifyRequest {
  target: MediaTarget;
  items: AiVerifyItem[];
}

export interface AiVerifyResult extends AiMatch {
  index: number;
  title: string;
}

export interface AiVerifyResponse {
  results: AiVerifyResult[];
  model: string;
  cachedCount: number;
}

export interface AiStatus {
  enabled: boolean;
  configured: boolean;
  baseUrl: string;
  model: string;
  verifyDownloads: boolean;
  verifyFollows: boolean;
  threshold: number;
  health?: ProviderHealth | null;
}

export interface AppSettings {
  tmdb: {
    language: string;
    hasApiKey: boolean;
  };
  qbit: {
    host: string;
    username: string;
    hasPassword: boolean;
    savePath: string;
    organize: boolean;
  };
  ai: Omit<AiStatus, "health" | "configured"> & {
    hasApiKey: boolean;
  };
  app: {
    followIntervalMinutes: number;
    defaultQuality: SeriesQuality;
    searchPageSize: number;
  };
}

export interface SettingsUpdate {
  tmdb?: {
    apiKey?: string;
    language?: string;
  };
  qbit?: {
    host?: string;
    username?: string;
    password?: string;
    savePath?: string;
    organize?: boolean;
  };
  ai?: {
    enabled?: boolean;
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    verifyDownloads?: boolean;
    verifyFollows?: boolean;
    threshold?: number;
  };
  app?: {
    followIntervalMinutes?: number;
    defaultQuality?: SeriesQuality;
    searchPageSize?: number;
  };
}

export interface ProviderWrite {
  id?: string;
  name: string;
  kind: ProviderKind;
  enabled?: boolean;
  priority?: number;
  config: Record<string, unknown>;
}

export interface AppEvent {
  id: number;
  level: "info" | "success" | "warning" | "error";
  type: string;
  message: string;
  meta?: Record<string, unknown> | null;
  createdAt: string;
}

export interface OverviewStats {
  activeDownloads: number;
  completedDownloads: number;
  queuedDownloads: number;
  downloadSpeed: number;
  uploadSpeed: number;
  activeFollows: number;
  wantedEpisodes: number;
  attentionFollows: number;
  providers: number;
  providersOnline: number;
  aiEnabled: boolean;
}

export interface OverviewResponse {
  stats: OverviewStats;
  qbit: QbitTorrent[];
  follows: FollowSummary[];
  events: AppEvent[];
  providers: ProviderSummary[];
  ai: AiStatus;
  version: string;
  uptimeSeconds: number;
  qbitError?: string;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  version: string;
  db: "ok" | "error";
  uptimeSeconds: number;
}

export interface TrackerActivityItem {
  id: string;
  torrentId?: string;
  title: string;
  status?: string;
  uploaded?: string;
  downloaded?: string;
  remaining?: string;
  rate?: number;
  startedAt?: string;
  updatedAt?: string;
  seeders?: number;
  leechers?: number;
}

export interface TrackerMeta {
  provider: ProviderSummary;
  kind: "activity" | "recommended";
  items: TorrentItem[];
  activity?: TrackerActivityItem[];
}

export interface ApiErrorBody {
  error: string;
  details?: unknown;
}
