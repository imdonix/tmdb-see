import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Clapperboard,
  Gauge,
  HardDriveDownload,
  RadioTower,
  RefreshCw,
  Search,
  Server,
  Sparkles,
  Tv,
  WifiOff,
} from "lucide-react";
import {
  formatBytes,
  formatPercent,
  formatRelative,
  formatSpeed,
  isQbitComplete,
  qbitStateLabel,
  tmdbImage,
} from "@tmdb-see/shared";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Progress,
  Skeleton,
  cn,
} from "@tmdb-see/ui";
import { api, errorText } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { ProviderBadge } from "@/components/provider-badge";
import { ErrorBanner } from "@/components/error-banner";

function QueueRow({ torrent }: { torrent: Awaited<ReturnType<typeof api.overview>>["qbit"][number] }) {
  const complete = isQbitComplete(torrent);
  const href =
    torrent.ref?.providerId && torrent.ref?.torrentId
      ? `/torrents/${encodeURIComponent(torrent.ref.providerId)}/${encodeURIComponent(torrent.ref.torrentId)}`
      : null;
  const content = (
    <div className="group flex items-start gap-3 rounded-lg border border-transparent px-2 py-2.5 transition hover:border-border/70 hover:bg-muted/25">
      <div
        className={cn(
          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border",
          complete
            ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-700 dark:text-emerald-300"
            : "border-sky-400/20 bg-sky-400/10 text-sky-700 dark:text-sky-300",
        )}
      >
        {complete ? <CheckCircle2 className="size-4" /> : <ArrowDownToLine className="size-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="truncate text-sm font-medium leading-5" title={torrent.name}>
            {torrent.name}
          </p>
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
            {formatPercent(torrent.progress)}
          </span>
        </div>
        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <Badge variant={complete ? "success" : "secondary"} className="px-1.5 py-0 text-[9px]">
            {qbitStateLabel(torrent.state)}
          </Badge>
          {torrent.ref?.providerId && (
            <span className="truncate">{torrent.ref.providerName ?? torrent.ref.providerId}</span>
          )}
          <span className="tabular-nums">
            {formatBytes(torrent.downloaded)} / {formatBytes(torrent.size)}
          </span>
          {!complete && torrent.dlspeed > 0 && (
            <span className="ml-auto hidden tabular-nums text-sky-700 sm:inline dark:text-sky-300">
              ↓ {formatSpeed(torrent.dlspeed)}
            </span>
          )}
        </div>
        <Progress
          value={Math.round(torrent.progress * 100)}
          className="mt-2 h-1 bg-secondary/80"
          indicatorClassName={complete ? "bg-emerald-400" : "bg-sky-400"}
        />
      </div>
    </div>
  );
  return href ? <Link to={href}>{content}</Link> : content;
}

export function OverviewPage() {
  const overview = useQuery({
    queryKey: ["overview"],
    queryFn: api.overview,
    refetchInterval: 5_000,
  });

  const data = overview.data;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Mission control"
        title="What's the deal"
        description="Everything in flight across your providers, qBittorrent, and tracked series — in one place."
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <a href="/" title="Open TMDB through the proxy">
                <Clapperboard /> TMDB
              </a>
            </Button>
            <Button size="sm" asChild>
              <Link to="/search">
                <Search /> Search releases
              </Link>
            </Button>
          </>
        }
      />

      <ErrorBanner message={overview.error ? errorText(overview.error) : data?.qbitError} />

      {!data ? (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((key) => (
              <Skeleton key={key} className="h-28 rounded-xl" />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-96 rounded-xl lg:col-span-2" />
            <Skeleton className="h-96 rounded-xl" />
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Active queue"
              value={data.stats.activeDownloads}
              hint={
                <span className="flex items-center gap-1.5">
                  <Gauge className="size-3" /> {formatSpeed(data.stats.downloadSpeed)} down
                </span>
              }
              icon={<HardDriveDownload />}
              accent="sky"
            />
            <StatCard
              label="Completed"
              value={data.stats.completedDownloads}
              hint={
                <span className="flex items-center gap-1.5">
                  <ArrowUpRight className="size-3" /> {formatSpeed(data.stats.uploadSpeed)} up
                </span>
              }
              icon={<CheckCircle2 />}
              accent="primary"
            />
            <StatCard
              label="Series followed"
              value={data.stats.activeFollows}
              hint={
                data.stats.wantedEpisodes > 0
                  ? `${data.stats.wantedEpisodes} episodes still wanted`
                  : "Everything tracked is present"
              }
              icon={<Tv />}
              accent="violet"
            />
            <StatCard
              label="Providers online"
              value={`${data.stats.providersOnline}/${data.stats.providers}`}
              hint={data.ai.enabled && data.ai.configured ? "AI verification is on" : "AI verification is off"}
              icon={<RadioTower />}
              accent={data.stats.providersOnline > 0 ? "primary" : "red"}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <Card className="overflow-hidden">
                <CardHeader className="flex-row items-center justify-between gap-3 pb-1">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="size-4 text-primary" /> Live queue
                    </CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatSpeed(data.stats.downloadSpeed)} down · {formatSpeed(data.stats.uploadSpeed)} up
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/downloads">
                      All downloads <ArrowUpRight />
                    </Link>
                  </Button>
                </CardHeader>
                <CardContent className="pt-2">
                  {data.qbit.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
                      <WifiOff className="mx-auto mb-2 size-5 opacity-60" />
                      {data.qbitError ? "qBittorrent is not connected" : "Queue is empty"}
                    </div>
                  ) : (
                    <div className="divide-y divide-border/40">
                      {data.qbit.slice(0, 6).map((torrent) => (
                        <QueueRow key={torrent.hash} torrent={torrent} />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex-row items-center justify-between gap-3 pb-1">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Tv className="size-4 text-violet-600 dark:text-violet-300" /> Series needing attention
                    </CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Missing episodes and recent follow errors
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/follows">
                      Manage <ArrowUpRight />
                    </Link>
                  </Button>
                </CardHeader>
                <CardContent className="pt-2">
                  {data.follows.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
                      No series are waiting for releases.
                    </div>
                  ) : (
                    <div className="divide-y divide-border/40">
                      {data.follows.map((follow) => {
                        const poster = tmdbImage(follow.posterPath, "w185");
                        return (
                          <Link
                            key={follow.id}
                            to={`/follows?id=${follow.tmdbId}`}
                            className="group flex items-center gap-3 py-3 transition"
                          >
                            <div className="h-14 w-10 shrink-0 overflow-hidden rounded-md border border-border/70 bg-muted">
                              {poster ? (
                                <img
                                  src={poster}
                                  alt=""
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                  onError={(event) => {
                                    event.currentTarget.style.visibility = "hidden";
                                  }}
                                />
                              ) : (
                                <div className="flex h-full items-center justify-center">
                                  <Tv className="size-4 text-muted-foreground" />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium group-hover:text-primary">
                                {follow.name}
                                {follow.year ? ` (${follow.year})` : ""}
                              </p>
                              <p className="mt-0.5 text-[11px] text-muted-foreground">
                                {follow.counts.wanted > 0
                                  ? `${follow.counts.wanted} missing · ${follow.quality}`
                                  : `${follow.quality} · checked ${formatRelative(follow.lastCheckAt)}`}
                              </p>
                              {follow.lastError && (
                                <p className="mt-1 line-clamp-1 text-[11px] text-amber-700 dark:text-amber-300">{follow.lastError}</p>
                              )}
                            </div>
                            <Badge variant="outline" className="shrink-0">
                              {follow.counts.wanted > 0 ? `${follow.counts.wanted} wanted` : "error"}
                            </Badge>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Server className="size-4 text-primary" /> Providers
                  </CardTitle>
                  <Button variant="ghost" size="icon-sm" asChild>
                    <Link to="/settings" title="Configure providers">
                      <ArrowUpRight />
                    </Link>
                  </Button>
                </CardHeader>
                <CardContent className="space-y-2 pt-0">
                  {data.providers.map((provider) => (
                    <div
                      key={provider.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          className={cn(
                            "size-2 shrink-0 rounded-full",
                            provider.health?.ok
                              ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.6)]"
                              : provider.health
                                ? "bg-red-400"
                                : "bg-muted-foreground/40",
                          )}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{provider.name}</p>
                          <p className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
                            {provider.categories.length} categories
                          </p>
                        </div>
                      </div>
                      <ProviderBadge name={provider.kind} kind={provider.kind} showIcon={false} />
                    </div>
                  ))}
                  {data.providers.length === 0 && (
                    <p className="py-3 text-center text-xs text-muted-foreground">
                      No providers configured.
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card className={cn(data.ai.enabled && data.ai.configured && "border-primary/25")}>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Bot className="size-4 text-emerald-600 dark:text-emerald-300" /> AI verifier
                  </CardTitle>
                  <Badge variant={data.ai.enabled && data.ai.configured ? "success" : "muted"}>
                    {data.ai.enabled && data.ai.configured ? "active" : "off"}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <div className="flex items-center gap-2 text-sm">
                    <Sparkles className="size-3.5 text-primary" />
                    <span className="truncate font-mono text-xs">{data.ai.model || "no model"}</span>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {data.ai.verifyDownloads || data.ai.verifyFollows
                      ? `Checks ${[
                          data.ai.verifyDownloads ? "movie" : "",
                          data.ai.verifyFollows ? "series" : "",
                        ]
                          .filter(Boolean)
                          .join(" and ")} releases before sending them to qBittorrent.`
                      : "Configure the verifier to filter releases before they are scheduled."}
                  </p>
                  <Button variant="outline" size="sm" className="w-full" asChild>
                    <Link to="/settings">Configure AI</Link>
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <RefreshCw className="size-4 text-muted-foreground" /> Recent events
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 pt-0">
                  {data.events.length === 0 ? (
                    <p className="py-3 text-xs text-muted-foreground">No events yet.</p>
                  ) : (
                    data.events.slice(0, 7).map((event) => (
                      <div key={event.id} className="flex gap-2.5 rounded-md px-1 py-2 text-xs">
                        <span
                          className={cn(
                            "mt-1 size-1.5 shrink-0 rounded-full",
                            event.level === "error"
                              ? "bg-red-400"
                              : event.level === "warning"
                                ? "bg-amber-400"
                                : event.level === "success"
                                  ? "bg-emerald-400"
                                  : "bg-sky-400",
                          )}
                        />
                        <div className="min-w-0">
                          <p className="line-clamp-2 leading-relaxed text-foreground/90">{event.message}</p>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">
                            {formatRelative(event.createdAt)} · {event.type}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}

      {overview.isFetching && !overview.isLoading && (
        <div className="flex items-center justify-end gap-2 text-[11px] text-muted-foreground">
          <RefreshCw className="size-3 animate-spin" /> refreshing
        </div>
      )}
    </div>
  );
}
