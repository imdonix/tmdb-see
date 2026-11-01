import type {
  AiVerifyRequest,
  AiVerifyResponse,
  AppEvent,
  AppSettings,
  FollowCheckResponse,
  FollowDetailResponse,
  FollowSummary,
  HealthResponse,
  MediaTarget,
  MovieDownloadState,
  MovieOverview,
  OverviewResponse,
  ProviderAdminView,
  ProviderHealth,
  ProviderSummary,
  ProviderWrite,
  QbitTorrent,
  SearchRequest,
  SearchResponse,
  SettingsUpdate,
  TorrentDetail,
  TorrentItem,
} from "@tmdb-see/shared";

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }
  if (!response.ok) {
    const errorBody = payload as { error?: string; details?: unknown } | null;
    throw new ApiError(
      response.status,
      errorBody?.error || `Request failed (${response.status})`,
      errorBody?.details,
    );
  }
  return payload as T;
}

export function torrentFileUrl(providerId: string, torrentId: string): string {
  return `/api/torrents/${encodeURIComponent(providerId)}/${encodeURIComponent(torrentId)}/file`;
}

export const api = {
  health: () => request<HealthResponse>("/health"),
  overview: () => request<OverviewResponse>("/overview"),
  events: (limit = 50) => request<{ events: AppEvent[] }>(`/events?limit=${limit}`),

  settings: () => request<AppSettings>("/settings"),
  updateSettings: (input: SettingsUpdate) =>
    request<AppSettings>("/settings", { method: "PATCH", body: JSON.stringify(input) }),
  testQbit: (overrides?: { host?: string; username?: string; password?: string }) =>
    request<{ health: ProviderHealth }>("/settings/test/qbit", {
      method: "POST",
      body: JSON.stringify(overrides ?? {}),
    }),
  testTmdb: () => request<{ health: ProviderHealth }>("/settings/test/tmdb", { method: "POST" }),

  providers: () => request<{ providers: ProviderSummary[] }>("/providers"),
  adminProviders: () => request<{ providers: ProviderAdminView[] }>("/providers/admin"),
  createProvider: (input: ProviderWrite) =>
    request<{ provider: ProviderAdminView }>("/providers", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateProvider: (id: string, input: Partial<ProviderWrite>) =>
    request<{ provider: ProviderAdminView }>(`/providers/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  deleteProvider: (id: string) =>
    request<{ message: string }>(`/providers/${encodeURIComponent(id)}`, { method: "DELETE" }),
  testProvider: (id: string) =>
    request<{ health: ProviderHealth }>(`/providers/${encodeURIComponent(id)}/test`, {
      method: "POST",
    }),

  search: (input: SearchRequest) =>
    request<SearchResponse>("/search", { method: "POST", body: JSON.stringify(input) }),
  torrent: (providerId: string, torrentId: string) =>
    request<{ torrent: TorrentDetail }>(
      `/torrents/${encodeURIComponent(providerId)}/${encodeURIComponent(torrentId)}`,
    ),
  grab: (providerId: string, torrentId: string, target?: MediaTarget) =>
    request<{ item: TorrentItem; alreadyInQbit: boolean; message: string }>(
      `/torrents/${encodeURIComponent(providerId)}/${encodeURIComponent(torrentId)}/grab`,
      { method: "POST", body: JSON.stringify({ target }) },
    ),

  movie: (tmdbId: number) => request<MovieOverview>(`/movies/${tmdbId}`),
  movieDownload: (tmdbId: number) => request<{ download: MovieDownloadState | null }>(`/movies/${tmdbId}/download`),
  downloadMovie: (tmdbId: number, input: { quality?: string; providerId?: string }) =>
    request<{ download: MovieDownloadState }>(`/movies/${tmdbId}/download`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  follows: () => request<{ follows: FollowSummary[] }>("/follows"),
  follow: (tmdbId: number) => request<FollowDetailResponse>(`/follows/${tmdbId}`),
  createFollow: (input: { tmdbId: number; quality?: string; skippedSeasons?: number[] }) =>
    request<{ follow: FollowSummary }>("/follows", { method: "POST", body: JSON.stringify(input) }),
  updateFollow: (
    tmdbId: number,
    input: { quality?: string; status?: string; skippedSeasons?: number[] },
  ) =>
    request<{ follow: FollowSummary }>(`/follows/${tmdbId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  deleteFollow: (tmdbId: number) =>
    request<{ message: string }>(`/follows/${tmdbId}`, { method: "DELETE" }),
  checkFollow: (tmdbId: number) =>
    request<FollowCheckResponse>(`/follows/${tmdbId}/check`, { method: "POST" }),
  checkAllFollows: () =>
    request<{ message: string }>("/follows/check-all", { method: "POST" }),

  qbitTorrents: () => request<{ torrents: QbitTorrent[] }>("/qbit/torrents"),
  qbitByRef: (providerId: string, torrentId: string) =>
    request<{ torrent: QbitTorrent | null }>(
      `/qbit/torrents/by-ref/${encodeURIComponent(providerId)}/${encodeURIComponent(torrentId)}`,
    ),
  qbitAction: (hash: string, action: "pause" | "resume" | "recheck") =>
    request<{ message: string }>(`/qbit/torrents/${encodeURIComponent(hash)}/${action}`, {
      method: "POST",
    }),
  deleteQbitTorrent: (hash: string, deleteFiles = true) =>
    request<{ message: string }>(`/qbit/torrents/${encodeURIComponent(hash)}?deleteFiles=${deleteFiles}`, {
      method: "DELETE",
    }),

  verifyAi: (input: AiVerifyRequest) =>
    request<AiVerifyResponse>("/ai/verify", { method: "POST", body: JSON.stringify(input) }),
  testAi: (overrides?: { baseUrl?: string; apiKey?: string; model?: string }) =>
    request<{ health: ProviderHealth }>("/ai/test", {
      method: "POST",
      body: JSON.stringify(overrides ?? {}),
    }),
};

export function errorText(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}
