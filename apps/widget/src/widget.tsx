import * as React from "react";
import {
  ArrowDownToLine,
  Check,
  CheckCheck,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  Server,
  Sparkles,
  Tv,
} from "lucide-react";
import type {
  AiMatch,
  FollowDetailResponse,
  FollowItem,
  FollowItemStatus,
  FollowSummary,
  MovieDownloadState,
  MovieOverview,
  SeriesQuality,
  TvSeason,
} from "@tmdb-see/shared";
import { formatBytes, formatEta, formatPercent, formatRelative, formatSpeed, qbitStateLabel } from "@tmdb-see/shared";
import { Badge } from "@tmdb-see/ui/badge";
import { Button } from "@tmdb-see/ui/button";
import { Input } from "@tmdb-see/ui/input";
import { Progress } from "@tmdb-see/ui/progress";
import { cn } from "@tmdb-see/ui/utils";

const QUALITY_STYLES: Record<string, string> = {
  "2160p": "border-violet-400/30 bg-violet-400/10 text-violet-200",
  "1080p": "border-sky-400/30 bg-sky-400/10 text-sky-200",
  "720p": "border-amber-400/30 bg-amber-400/10 text-amber-200",
  "480p": "border-border bg-secondary text-muted-foreground",
  SD: "border-border bg-secondary text-muted-foreground",
  Auto: "border-primary/30 bg-primary/10 text-primary",
};

const API_KEY_STORAGE = "see.apiKey";
const AUTH_EVENT = "see:auth";
const AUTH_INVALID_EVENT = "see:auth-invalid";

function storedApiKey(): string {
  try {
    return localStorage.getItem(API_KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

function storeApiKey(value: string): void {
  try {
    localStorage.setItem(API_KEY_STORAGE, value);
  } catch {
    // storage can be blocked; the current render still works
  }
}

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const apiKey = storedApiKey();
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(apiKey ? { "x-api-key": apiKey } : {}),
      ...init?.headers,
    },
  });
  if (response.status === 401) {
    try {
      window.dispatchEvent(new Event(AUTH_INVALID_EVENT));
    } catch {
      // ignore
    }
  }
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
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return payload as T;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-lg border border-emerald-300/25 bg-gradient-to-br from-emerald-300 to-teal-600 text-emerald-950",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none">
        <path
          d="M4.6 12.4C6.5 8.9 9.3 7 12.8 7c3.4 0 6.1 1.7 7.8 4.8-1.7 3.5-4.4 5.2-7.8 5.2-3.4 0-6.2-1.6-8.2-4.6Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <circle cx="12.8" cy="11.9" r="2.1" fill="currentColor" />
      </svg>
    </span>
  );
}

function Shell({
  title,
  subtitle,
  href,
  hrefLabel,
  children,
}: {
  title: string;
  subtitle?: string;
  href: string;
  hrefLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/90 bg-gradient-to-b from-card/95 to-background/95 shadow-[0_18px_50px_-24px_rgba(0,0,0,.8)] backdrop-blur">
      <div className="flex min-h-11 items-center gap-2 border-b border-border/70 px-3.5 py-2.5">
        <BrandMark />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold leading-tight">{title}</div>
          {subtitle && <div className="truncate text-[10px] text-muted-foreground">{subtitle}</div>}
        </div>
        <a
          href="/see"
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border/70 bg-background/30 px-1.5 py-1 text-[10px] font-medium text-muted-foreground transition hover:border-primary/30 hover:text-primary"
        >
          See - Dashboard <ExternalLink className="size-3" />
        </a>
        <a
          href={href}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium text-muted-foreground transition hover:text-primary"
        >
          {hrefLabel} <ExternalLink className="size-3" />
        </a>
      </div>
      <div className="p-3.5">{children}</div>
    </div>
  );
}

function Message({ tone, children }: { tone: "error" | "success" | "muted"; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div
      className={cn(
        "mt-2.5 rounded-lg border px-2.5 py-2 text-[11px] leading-relaxed",
        tone === "error"
          ? "border-red-400/30 bg-red-400/10 text-red-200"
          : tone === "success"
            ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
            : "border-border/70 bg-muted/20 text-muted-foreground",
      )}
    >
      {children}
    </div>
  );
}

function AiLine({ match }: { match?: AiMatch | null }) {
  if (!match) return null;
  return (
    <div
      className={cn(
        "mt-2 flex items-start gap-1.5 rounded-md border px-2 py-1.5 text-[10px] leading-relaxed",
        match.verified
          ? "border-emerald-400/20 bg-emerald-400/8 text-emerald-200"
          : "border-red-400/20 bg-red-400/8 text-red-200",
      )}
      title={match.reason}
    >
      {match.verified ? <CheckCheck className="mt-0.5 size-3 shrink-0" /> : <Sparkles className="mt-0.5 size-3 shrink-0" />}
      <span className="line-clamp-2">
        AI {match.verified ? "confirmed" : "rejected"} · {Math.round(match.confidence * 100)}% — {match.reason}
      </span>
    </div>
  );
}

function StateBadge({ status }: { status: FollowItemStatus }) {
  const variant =
    status === "completed"
      ? "success"
      : status === "downloading"
        ? "sky"
        : status === "cannot_find" || status === "failed"
          ? "danger"
          : status === "skipped"
            ? "muted"
            : status === "found"
              ? "warning"
              : "outline";
  return <Badge variant={variant}>{status === "cannot_find" ? "cannot find" : status}</Badge>;
}

function MovieDownloadBlock({
  download,
  onOpen,
}: {
  download: MovieDownloadState;
  onOpen: string | null;
}) {
  const complete = download.status === "completed" || download.progress >= 99.9;
  const progress = complete ? 100 : Math.min(100, Math.max(0, download.progress));
  return (
    <div className="mt-3 rounded-lg border border-border/70 bg-muted/15 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge className={cn("border", QUALITY_STYLES[download.quality] ?? QUALITY_STYLES.Auto)}>
            {download.quality}
          </Badge>
          <Badge variant={download.status === "missing" ? "warning" : complete ? "success" : "secondary"}>
            {download.status === "missing"
              ? "removed from qBittorrent"
              : complete
                ? "ready to watch"
                : qbitStateLabel(download.state ?? "downloading")}
          </Badge>
          {download.providerName && (
            <span className="text-[10px] text-muted-foreground">{download.providerName}</span>
          )}
        </div>
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">{formatPercent(progress / 100)}</span>
      </div>
      <Progress
        value={progress}
        className="mt-2 h-1.5"
        indicatorClassName={complete ? "bg-emerald-400" : "bg-sky-400"}
      />
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        <span className="tabular-nums">
          {formatBytes(download.downloaded ?? 0)} / {formatBytes(download.size ?? 0)}
        </span>
        {!complete && download.dlspeed ? <span className="text-sky-300">↓ {formatSpeed(download.dlspeed)}</span> : null}
        {!complete && download.eta ? <span>ETA {formatEta(download.eta)}</span> : null}
      </div>
      <p className="mt-1 line-clamp-1 text-[10px] text-muted-foreground/80" title={download.torrentTitle}>
        {download.torrentTitle}
      </p>
      <AiLine match={download.ai} />
      <div className="mt-2 flex items-center gap-1.5">
        {onOpen && (
          <a
            href={onOpen}
            className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-background/30 px-2 py-1 text-[10px] font-medium transition hover:border-primary/30 hover:text-primary"
          >
            Open release <ExternalLink className="size-2.5" />
          </a>
        )}
        <a
          href="/see/downloads"
          className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-background/30 px-2 py-1 text-[10px] font-medium transition hover:border-primary/30 hover:text-primary"
        >
          All downloads
        </a>
      </div>
    </div>
  );
}

function MoviePanel({ tmdbId }: { tmdbId: string }) {
  const [overview, setOverview] = React.useState<MovieOverview | null>(null);
  const [quality, setQuality] = React.useState("");
  const [providerId, setProviderId] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getJson<MovieOverview>(`/api/movies/${tmdbId}`);
      setOverview(data);
      setQuality((current) => {
        if (current && data.resolutions.some((entry) => entry.quality === current)) return current;
        if (data.download?.quality && data.resolutions.some((entry) => entry.quality === data.download?.quality)) {
          return data.download.quality;
        }
        return data.resolutions.find((entry) => entry.quality === "1080p")?.quality ?? data.resolutions[0]?.quality ?? "";
      });
      setProviderId(data.download?.providerId ?? "");
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setLoading(false);
    }
  }, [tmdbId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const downloading = overview?.download?.status === "downloading";
  React.useEffect(() => {
    if (!downloading) return;
    const timer = window.setInterval(() => {
      void getJson<{ download: MovieDownloadState | null }>(`/api/movies/${tmdbId}/download`)
        .then((data) => {
          setOverview((current) => (current ? { ...current, download: data.download } : current));
        })
        .catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [downloading, tmdbId]);

  const movie = overview?.movie;
  const resolution = overview?.resolutions.find((entry) => entry.quality === quality);
  const activeProvider = resolution?.providers.find((entry) => entry.providerId === providerId);
  const download = overview?.download ?? null;
  const complete = download?.status === "completed" || (download?.progress ?? 0) >= 99.9;
  const locked = download?.status === "downloading" || complete;
  const searchQuery = movie
    ? `q=${encodeURIComponent(`${movie.name} ${movie.year}`.trim())}&targetType=movie&targetTmdbId=${tmdbId}&targetTitle=${encodeURIComponent(movie.name)}&targetYear=${encodeURIComponent(movie.year)}`
    : "";

  const submit = async () => {
    if (!quality) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await getJson<{ download: MovieDownloadState }>(`/api/movies/${tmdbId}/download`, {
        method: "POST",
        body: JSON.stringify({ quality, ...(providerId ? { providerId } : {}) }),
      });
      setOverview((current) => (current ? { ...current, download: result.download } : current));
      setMessage(
        result.download.status === "completed"
          ? "Already downloaded."
          : "Added to qBittorrent — it will keep going in the background.",
      );
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell
      title="Download movie"
      subtitle={movie ? `${movie.name}${movie.year ? ` (${movie.year})` : ""}` : "Searching providers…"}
      href={searchQuery ? `/see/search?${searchQuery}` : "/see/search"}
      hrefLabel="Open search"
    >
      {loading ? (
        <div className="flex items-center gap-2 py-4 text-[11px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Checking your providers…
        </div>
      ) : error && !overview ? (
        <Message tone="error">{error}</Message>
      ) : !overview ? (
        <Message tone="error">Could not load this movie.</Message>
      ) : (
        <>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {overview.movie.name}
            {overview.movie.year ? ` (${overview.movie.year})` : ""} — pick a resolution and let qBittorrent
            handle the rest.
          </p>

          <div className="mt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Resolution
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {overview.resolutions.map((entry) => (
              <button
                key={entry.quality}
                type="button"
                disabled={locked}
                onClick={() => {
                  setQuality(entry.quality);
                  if (providerId && !entry.providers.some((provider) => provider.providerId === providerId)) {
                    setProviderId("");
                  }
                }}
                className={cn(
                  "cursor-pointer rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
                  quality === entry.quality
                    ? "border-primary/50 bg-primary/15 text-primary"
                    : "border-border/80 bg-background/30 text-foreground/80 hover:border-primary/30",
                )}
                title={`${entry.releases} release(s) · best ${entry.seeders} seeders`}
              >
                {entry.quality}
              </button>
            ))}
            {overview.resolutions.length === 0 && (
              <span className="text-[11px] text-muted-foreground">No releases found yet.</span>
            )}
          </div>

          {resolution && resolution.providers.length > 1 && (
            <div className="mt-2 flex flex-wrap items-center gap-1">
              <span className="mr-1 text-[9px] uppercase tracking-wider text-muted-foreground">Source</span>
              <button
                type="button"
                disabled={locked}
                onClick={() => setProviderId("")}
                className={cn(
                  "cursor-pointer rounded-full border px-2 py-0.5 text-[9px] font-medium transition disabled:opacity-50",
                  providerId === ""
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border/70 text-muted-foreground hover:text-foreground",
                )}
              >
                Best
              </button>
              {resolution.providers.map((provider) => (
                <button
                  key={provider.providerId}
                  type="button"
                  disabled={locked}
                  onClick={() => setProviderId(provider.providerId)}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-medium transition disabled:opacity-50",
                    providerId === provider.providerId
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border/70 text-muted-foreground hover:text-foreground",
                  )}
                  title={`${provider.releases} releases · best ${provider.seeders} seeders`}
                >
                  {provider.providerId === "ncore" ? <Server className="size-2.5" /> : <Search className="size-2.5" />}
                  {provider.providerName}
                </button>
              ))}
            </div>
          )}

          <div className="mt-2 text-[10px] text-muted-foreground">
            {resolution
              ? `${resolution.releases} release${resolution.releases === 1 ? "" : "s"} · best ${resolution.seeders} seeders${
                  activeProvider ? ` · ${activeProvider.providerName}` : ""
                }`
              : overview.searchError || "No matching releases on the enabled providers."}
          </div>

          {overview.searchError && overview.resolutions.length > 0 && (
            <Message tone="muted">{overview.searchError}</Message>
          )}

          {download && (
            <MovieDownloadBlock
              download={download}
              onOpen={
                download.providerId && download.torrentId
                  ? `/see/torrents/${encodeURIComponent(download.providerId)}/${encodeURIComponent(download.torrentId)}`
                  : null
              }
            />
          )}

          {message && <Message tone="success">{message}</Message>}
          {error && <Message tone="error">{error}</Message>}

          <Button
            className="mt-3 w-full bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={busy || locked || !quality || overview.resolutions.length === 0}
            onClick={() => void submit()}
          >
            {busy ? (
              <Loader2 className="animate-spin" />
            ) : complete ? (
              <Check />
            ) : download?.status === "downloading" ? (
              <ArrowDownToLine />
            ) : (
              <ArrowDownToLine />
            )}
            {busy
              ? "Starting…"
              : complete
                ? "Downloaded"
                : download?.status === "downloading"
                  ? `Downloading ${Math.round(download.progress)}%`
                  : download?.status === "missing"
                    ? "Download again"
                    : "Download movie now"}
          </Button>
        </>
      )}
    </Shell>
  );
}

function FollowItemRow({
  item,
  tmdbId,
  showName,
  year,
}: {
  item: FollowItem;
  tmdbId: number;
  showName: string;
  year: string;
}) {
  const label =
    item.episode > 0
      ? `S${String(item.season).padStart(2, "0")}E${String(item.episode).padStart(2, "0")}`
      : `S${String(item.season).padStart(2, "0")} pack`;
  const href =
    item.providerId && item.torrentId
      ? `/see/torrents/${encodeURIComponent(item.providerId)}/${encodeURIComponent(item.torrentId)}?${new URLSearchParams(
          {
            targetType: "tv",
            targetTmdbId: String(tmdbId),
            targetTitle: showName,
            targetYear: year,
            targetSeason: String(item.season),
            ...(item.episode ? { targetEpisode: String(item.episode) } : {}),
          },
        ).toString()}`
      : null;
  return (
    <div className="flex items-start gap-2 border-b border-border/40 py-2 last:border-0">
      <div className="flex w-[128px] shrink-0 items-center gap-1.5">
        <span className="w-[62px] font-mono text-[10px] font-semibold">{label}</span>
        <StateBadge status={item.status} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {item.torrentTitle ? (
            href ? (
              <a href={href} className="line-clamp-1 text-[10px] text-muted-foreground hover:text-primary" title={item.torrentTitle}>
                {item.torrentTitle}
              </a>
            ) : (
              <span className="line-clamp-1 text-[10px] text-muted-foreground" title={item.torrentTitle}>
                {item.torrentTitle}
              </span>
            )
          ) : item.coveredBy ? (
            <span className="text-[10px] text-muted-foreground">Covered by season pack</span>
          ) : null}
          {item.ai && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[8px] font-semibold",
                item.ai.verified
                  ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
                  : "border-red-400/25 bg-red-400/10 text-red-200",
              )}
              title={item.ai.reason}
            >
              <CheckCheck className="size-2.5" />
              AI {Math.round(item.ai.confidence * 100)}%
            </span>
          )}
        </div>
        {item.qbit && item.qbit.progress < 1 && (
          <div className="mt-1 flex items-center gap-1.5">
            <Progress
              value={Math.round(item.qbit.progress * 100)}
              className="h-0.5 max-w-24 bg-secondary"
              indicatorClassName="bg-sky-400"
            />
            <span className="text-[9px] text-muted-foreground">{formatPercent(item.qbit.progress)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function FollowPanel({ tmdbId }: { tmdbId: string }) {
  const [detail, setDetail] = React.useState<FollowDetailResponse | null>(null);
  const [quality, setQuality] = React.useState<SeriesQuality>("1080p");
  const [skipped, setSkipped] = React.useState<number[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [checking, setChecking] = React.useState(false);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getJson<FollowDetailResponse>(`/api/follows/${tmdbId}`);
      setDetail(data);
      if (data.follow) {
        setQuality(data.follow.quality);
        setSkipped(data.follow.skippedSeasons);
      }
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setLoading(false);
    }
  }, [tmdbId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const follow = detail?.follow ?? null;
  const seasons = detail?.seasons ?? [];
  const followItems = (detail?.items ?? []).filter(
    (item) =>
      ["skipped", "cannot_find", "downloading", "found", "completed", "failed", "missing"].includes(item.status) ||
      Boolean(item.torrentId),
  );

  const toggleSeason = (season: number) => {
    setSkipped((current) =>
      current.includes(season)
        ? current.filter((value) => value !== season)
        : [...current, season].sort((a, b) => a - b),
    );
  };

  const start = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await getJson<{ follow: FollowSummary }>("/api/follows", {
        method: "POST",
        body: JSON.stringify({ tmdbId: Number(tmdbId), quality, skippedSeasons: skipped }),
      });
      setMessage("Following — searching your providers in the background…");
      window.setTimeout(() => void load(), 3500);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  };

  const saveSkips = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await getJson(`/api/follows/${tmdbId}`, {
        method: "PATCH",
        body: JSON.stringify({ skippedSeasons: skipped }),
      });
      setMessage("Skipped seasons updated");
      await load();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  };

  const checkNow = async () => {
    setChecking(true);
    setError("");
    setMessage("");
    try {
      const result = await getJson<{ result: { error?: string; scheduled: number; alreadyHave: number } }>(
        `/api/follows/${tmdbId}/check`,
        { method: "POST" },
      );
      setMessage(
        result.result.error
          ? result.result.error
          : `Check complete — ${result.result.scheduled} queued, ${result.result.alreadyHave} already present.`,
      );
      await load();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setChecking(false);
    }
  };

  const stop = async () => {
    if (!window.confirm("Stop following this series?")) return;
    setBusy(true);
    setError("");
    try {
      await getJson(`/api/follows/${tmdbId}`, { method: "DELETE" });
      setMessage("Unfollowed");
      await load();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell
      title="Follow series"
      subtitle={detail?.name ? `${detail.name}${detail.year ? ` (${detail.year})` : ""}` : "Loading series…"}
      href={follow ? `/see/follows?id=${tmdbId}` : "/see/follows"}
      hrefLabel={follow ? "Manage" : "Open follows"}
    >
      {loading ? (
        <div className="flex items-center gap-2 py-4 text-[11px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {follow
              ? "Auto-download new episodes and season packs. Skipped seasons are treated as already owned."
              : "Auto-download episodes from your providers. Skip seasons you already have — they are treated as already downloaded."}
          </p>

          <div className="mt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Quality
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {(["2160p", "1080p", "720p"] as SeriesQuality[]).map((entry) => (
              <button
                key={entry}
                type="button"
                disabled={Boolean(follow)}
                onClick={() => setQuality(entry)}
                className={cn(
                  "cursor-pointer rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
                  quality === entry
                    ? "border-primary/50 bg-primary/15 text-primary"
                    : "border-border/80 bg-background/30 text-foreground/80 hover:border-primary/30",
                )}
              >
                {entry}
              </button>
            ))}
          </div>

          <div className="mt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Skip seasons (already have)
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {seasons.length === 0 ? (
              <span className="text-[10px] text-muted-foreground">No season data.</span>
            ) : (
              seasons.map((season: TvSeason) => {
                const selected = skipped.includes(season.season_number);
                return (
                  <button
                    key={season.season_number}
                    type="button"
                    onClick={() => toggleSeason(season.season_number)}
                    title={selected ? `S${String(season.season_number).padStart(2, "0")} skipped (treated as owned)` : "Not skipped"}
                    className={cn(
                      "flex min-w-[42px] cursor-pointer flex-col items-center rounded-lg border px-2 py-1 text-[10px] transition",
                      selected
                        ? "border-amber-400/40 bg-amber-400/10 text-amber-200"
                        : "border-border/80 bg-background/30 text-foreground/80 hover:border-primary/30",
                    )}
                  >
                    <span className={cn("font-semibold", selected && "line-through")}>
                      S{String(season.season_number).padStart(2, "0")}
                    </span>
                    <span className="text-[8px] opacity-70">{season.episode_count}ep</span>
                  </button>
                );
              })
            )}
          </div>
          <p className="mt-1.5 text-[9px] leading-relaxed text-muted-foreground/80">
            Highlighted seasons are ignored by the scanner, as if already downloaded.
          </p>

          {follow ? (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <Badge className={cn("border", QUALITY_STYLES[follow.quality] ?? QUALITY_STYLES.Auto)}>
                  {follow.quality}
                </Badge>
                <Badge variant={follow.status === "active" ? "success" : "muted"}>{follow.status}</Badge>
                <span className="text-[10px] text-muted-foreground">
                  {follow.counts.completed} completed · {follow.counts.wanted} wanted
                </span>
                <span className="ml-auto text-[9px] text-muted-foreground">
                  Last check: {formatRelative(follow.lastCheckAt)}
                </span>
              </div>
              {follow.skippedSeasons.length > 0 && (
                <div className="mt-1 text-[10px] text-amber-200/80">
                  Skipping {follow.skippedSeasons.map((season) => `S${String(season).padStart(2, "0")}`).join(", ")}
                </div>
              )}
              {follow.lastError && <Message tone="error">{follow.lastError}</Message>}

              {followItems.length > 0 && (
                <div className="see-scroll mt-2 max-h-48 overflow-y-auto rounded-lg border border-border/60 bg-background/20 px-2">
                  {followItems.map((item) => (
                    <FollowItemRow
                      key={item.id}
                      item={item}
                      tmdbId={follow.tmdbId}
                      showName={follow.name}
                      year={follow.year}
                    />
                  ))}
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" onClick={() => void checkNow()} disabled={checking || busy}>
                  {checking ? <Loader2 className="animate-spin" /> : <RefreshCw />} Check now
                </Button>
                <Button size="sm" variant="outline" onClick={() => void saveSkips()} disabled={busy}>
                  {busy ? <Loader2 className="animate-spin" /> : <Check />} Save skips
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <a href={`/see/follows?id=${tmdbId}`}>Manage</a>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-300 hover:bg-red-400/10"
                  onClick={() => void stop()}
                  disabled={busy}
                >
                  Unfollow
                </Button>
              </div>
            </>
          ) : (
            <Button className="mt-3 w-full" onClick={() => void start()} disabled={busy || seasons.length === 0}>
              {busy ? <Loader2 className="animate-spin" /> : <Tv />} Follow series
            </Button>
          )}

          {message && <Message tone="success">{message}</Message>}
          {error && <Message tone="error">{error}</Message>}
        </>
      )}
    </Shell>
  );
}

function WidgetLogin({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [value, setValue] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const key = value.trim();
    if (!key) {
      setError("Enter the API key from the See server logs.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await getJson<{ ok: boolean }>("/api/auth/verify", {
        method: "POST",
        body: JSON.stringify({ apiKey: key }),
      });
      storeApiKey(key);
      window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail: { authenticated: true } }));
      onAuthenticated();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="see-widget overflow-hidden rounded-xl border border-border/90 bg-gradient-to-b from-card/95 to-background/95 shadow-[0_18px_50px_-24px_rgba(0,0,0,.8)] backdrop-blur">
      <div className="flex min-h-11 items-center gap-2 border-b border-border/70 px-3.5 py-2.5">
        <BrandMark />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold leading-tight">See - Login</div>
          <div className="truncate text-[10px] text-muted-foreground">Unlock the widget and dashboard.</div>
        </div>
        <a
          href="/see"
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium text-muted-foreground transition hover:text-primary"
        >
          Dashboard <ExternalLink className="size-3" />
        </a>
      </div>
      <form onSubmit={(event) => void submit(event)} className="space-y-2 p-3.5">
        <label
          htmlFor="see-widget-key"
          className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
        >
          API key
        </label>
        <Input
          id="see-widget-key"
          type="password"
          autoComplete="current-password"
          spellCheck={false}
          placeholder="Paste your API key"
          className="h-8 font-mono text-[11px]"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        {error && (
          <div className="rounded-md border border-red-400/30 bg-red-400/10 px-2 py-1.5 text-[10px] text-red-200">
            {error}
          </div>
        )}
        <Button type="submit" size="sm" className="w-full" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null} Sign in
        </Button>
        <p className="text-[9px] leading-relaxed text-muted-foreground/80">
          The key is printed in the See logs as <code className="font-mono">See API key: …</code>
        </p>
      </form>
    </div>
  );
}

export function Widget({ contentType, tmdbId }: { contentType: string; tmdbId: string }) {
  const [auth, setAuth] = React.useState<"checking" | "anonymous" | "authenticated">(() =>
    storedApiKey() ? "checking" : "anonymous",
  );

  React.useEffect(() => {
    let cancelled = false;
    const check = () => {
      const key = storedApiKey();
      if (!key) {
        setAuth("anonymous");
        return;
      }
      setAuth("checking");
      fetch("/api/auth/session", { headers: { "x-api-key": key } })
        .then((response) => {
          if (!cancelled) setAuth(response.ok ? "authenticated" : "anonymous");
        })
        .catch(() => {
          if (!cancelled) setAuth("anonymous");
        });
    };
    check();
    const onAuth = () => check();
    const onInvalid = () => setAuth("anonymous");
    window.addEventListener(AUTH_EVENT, onAuth);
    window.addEventListener(AUTH_INVALID_EVENT, onInvalid);
    window.addEventListener("storage", onAuth);
    return () => {
      cancelled = true;
      window.removeEventListener(AUTH_EVENT, onAuth);
      window.removeEventListener(AUTH_INVALID_EVENT, onInvalid);
      window.removeEventListener("storage", onAuth);
    };
  }, []);

  if (!tmdbId) {
    return (
      <div className="see-widget rounded-xl border border-red-400/30 bg-card p-4 text-xs text-red-200">
        Missing widget config. Open this page through the See TMDB proxy.
      </div>
    );
  }
  if (auth === "checking") {
    return (
      <div className="see-widget flex items-center gap-2 rounded-xl border border-border/90 bg-card/80 px-3.5 py-4 text-[11px] text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Checking your session…
      </div>
    );
  }
  if (auth === "anonymous") {
    return <WidgetLogin onAuthenticated={() => setAuth("authenticated")} />;
  }
  if (contentType === "tv") return <FollowPanel tmdbId={tmdbId} />;
  return <MoviePanel tmdbId={tmdbId} />;
}
