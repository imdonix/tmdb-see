export const APP_NAME = "See";
export const APP_VERSION = "0.1.0";
export const DASHBOARD_BASE = "/see";
export const WIDGET_TAG = "tmdb-see";

export const QUALITY_ORDER = ["2160p", "1080p", "720p", "480p", "SD"] as const;
export const SERIES_QUALITIES = ["2160p", "1080p", "720p"] as const;

export const QBIT_STATE_LABELS: Record<string, string> = {
  error: "Error",
  missingFiles: "Missing files",
  uploading: "Seeding",
  pausedUP: "Paused (seed)",
  stoppedUP: "Paused (seed)",
  queuedUP: "Queued (seed)",
  stalledUP: "Stalled (seed)",
  checkingUP: "Checking (seed)",
  forcedUP: "Forced (seed)",
  allocating: "Allocating",
  downloading: "Downloading",
  metaDL: "Fetching metadata",
  pausedDL: "Paused",
  stoppedDL: "Paused",
  queuedDL: "Queued",
  stalledDL: "Stalled",
  checkingDL: "Checking",
  forcedDL: "Forced download",
  checkingResumeData: "Checking resume data",
  moving: "Moving",
  unknown: "Unknown",
};

export function formatBytes(bytes?: number | null, digits = 1): string {
  if (bytes === undefined || bytes === null || !Number.isFinite(bytes) || bytes <= 0) return "—";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  const fixed = value >= 100 || index === 0 ? 0 : digits;
  return `${value.toFixed(fixed)} ${units[index]}`;
}

export function formatSpeed(bytesPerSecond?: number | null): string {
  if (!bytesPerSecond || bytesPerSecond <= 0) return "—";
  return `${formatBytes(bytesPerSecond)}/s`;
}

export function formatEta(seconds?: number | null): string {
  if (seconds === undefined || seconds === null || seconds < 0 || seconds >= 8640000) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours < 24) return restMinutes ? `${hours}h ${restMinutes}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export function formatPercent(progress: number): string {
  return `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`;
}

export function formatDate(value?: string | number | Date | null, withTime = false): string {
  if (value === undefined || value === null || value === "") return "—";
  const date = value instanceof Date ? value : typeof value === "number" ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

export function formatRelative(value?: string | number | Date | null): string {
  if (value === undefined || value === null || value === "") return "never";
  const date = value instanceof Date ? value : typeof value === "number" ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return "never";
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60000);
  if (Math.abs(minutes) < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(date);
}

export function qbitStateLabel(state: string): string {
  return QBIT_STATE_LABELS[state] ?? state.replace(/([a-z])([A-Z])/g, "$1 $2");
}

/**
 * qBittorrent < 5 reports paused torrents as `pausedDL`/`pausedUP`; 5.x uses
 * `stoppedDL`/`stoppedUP`.
 */
export function isQbitPaused(state?: string | null): boolean {
  const value = state ?? "";
  return value.startsWith("paused") || value.startsWith("stopped");
}

export function isQbitComplete(torrent: { progress?: number; state?: string }): boolean {
  if (["error", "missingFiles"].includes(torrent.state ?? "")) return false;
  if ((torrent.progress ?? 0) >= 0.999) return true;
  return [
    "uploading",
    "pausedUP",
    "stoppedUP",
    "queuedUP",
    "stalledUP",
    "forcedUP",
    "checkingUP",
  ].includes(torrent.state ?? "");
}

export function tmdbImage(path?: string | null, size: "w185" | "w342" | "w500" | "original" = "w342"): string | null {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `https://image.tmdb.org/t/p/${size}${path.startsWith("/") ? path : `/${path}`}`;
}

export function truncate(value: string, max = 80): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function searchHref(params: {
  query?: string;
  targetType?: string;
  targetTmdbId?: number | string;
  targetTitle?: string;
  targetYear?: string;
  providerId?: string;
}): string {
  const search = new URLSearchParams();
  if (params.query) search.set("q", params.query);
  if (params.targetType) search.set("targetType", params.targetType);
  if (params.targetTmdbId) search.set("targetTmdbId", String(params.targetTmdbId));
  if (params.targetTitle) search.set("targetTitle", params.targetTitle);
  if (params.targetYear) search.set("targetYear", params.targetYear);
  if (params.providerId) search.set("provider", params.providerId);
  const qs = search.toString();
  return `${DASHBOARD_BASE}/search${qs ? `?${qs}` : ""}`;
}
