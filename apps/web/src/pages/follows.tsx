import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  Bell,
  BellOff,
  Check,
  ExternalLink,
  Loader2,
  Pencil,
  RefreshCw,
  Tv,
} from "lucide-react";
import type { FollowItem, FollowItemStatus, SeriesQuality } from "@tmdb-see/shared";
import {
  formatPercent,
  formatRelative,
  qbitStateLabel,
  tmdbImage,
} from "@tmdb-see/shared";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Progress,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
} from "@tmdb-see/ui";
import { toast } from "sonner";
import { api, errorText } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ErrorBanner } from "@/components/error-banner";
import { QualityBadge } from "@/components/quality-badge";
import { FollowStatusBadge } from "@/components/status-badges";
import { AiBadge } from "@/components/ai-badge";
import { ProviderBadge } from "@/components/provider-badge";

const DONE_STATUSES: FollowItemStatus[] = ["completed", "skipped"];
const WANTED_STATUSES: FollowItemStatus[] = ["wanted", "cannot_find", "failed", "missing"];
const ACTIVE_STATUSES: FollowItemStatus[] = ["found", "downloading"];

function targetQuery(follow: { tmdbId: number; name: string; year: string }, item: FollowItem): string {
  return new URLSearchParams({
    targetType: "tv",
    targetTmdbId: String(follow.tmdbId),
    targetTitle: follow.name,
    targetYear: follow.year,
    targetSeason: String(item.season),
    ...(item.episode ? { targetEpisode: String(item.episode) } : {}),
  }).toString();
}

function EpisodeRow({
  item,
  follow,
}: {
  item: FollowItem;
  follow: { tmdbId: number; name: string; year: string };
}) {
  const label =
    item.episode > 0
      ? `S${String(item.season).padStart(2, "0")}E${String(item.episode).padStart(2, "0")}`
      : `S${String(item.season).padStart(2, "0")} pack`;
  const href =
    item.providerId && item.torrentId
      ? `/torrents/${encodeURIComponent(item.providerId)}/${encodeURIComponent(item.torrentId)}?${targetQuery(follow, item)}`
      : null;

  return (
    <div className="flex flex-col gap-2 border-b border-border/40 py-3 last:border-0 sm:flex-row sm:items-center">
      <div className="flex w-full items-center gap-2 sm:w-40 sm:shrink-0">
        <span className="font-mono text-xs font-semibold text-foreground/90">{label}</span>
        <FollowStatusBadge status={item.status} />
      </div>
      <div className="min-w-0 flex-1">
        {item.torrentTitle ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {href ? (
              <Link to={href} className="line-clamp-1 text-xs text-muted-foreground hover:text-primary">
                {item.torrentTitle}
              </Link>
            ) : (
              <span className="line-clamp-1 text-xs text-muted-foreground">{item.torrentTitle}</span>
            )}
            {item.providerId && (
              <ProviderBadge
                name={item.providerName ?? item.providerId}
                kind={item.providerKind ?? (item.providerId === "ncore" ? "ncore" : "torznab")}
                showIcon={false}
              />
            )}
            <AiBadge match={item.ai} />
          </div>
        ) : item.coveredBy ? (
          <span className="text-xs text-muted-foreground">Covered by season pack</span>
        ) : item.status === "cannot_find" ? (
          <span className="text-xs text-muted-foreground">No matching release found</span>
        ) : item.status === "skipped" ? (
          <span className="text-xs text-muted-foreground">Season marked as already owned</span>
        ) : (
          <span className="text-xs text-muted-foreground">Waiting for a matching release</span>
        )}
        {item.qbit && (
          <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
            <Progress
              value={Math.round(item.qbit.progress * 100)}
              className="h-1 max-w-40 bg-secondary"
              indicatorClassName={item.qbit.progress >= 0.999 ? "bg-emerald-400" : "bg-sky-400"}
            />
            <span className="tabular-nums">
              {formatPercent(item.qbit.progress)} · {qbitStateLabel(item.qbit.state)}
            </span>
          </div>
        )}
      </div>
      {item.updatedAt && (
        <span className="shrink-0 text-[10px] text-muted-foreground/70">{formatRelative(item.updatedAt)}</span>
      )}
    </div>
  );
}

export function FollowsPage() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const followsQuery = useQuery({
    queryKey: ["follows"],
    queryFn: api.follows,
    refetchInterval: 30_000,
  });

  const follows = followsQuery.data?.follows ?? [];
  const requestedId = Number(params.get("id"));
  const selectedTmdbId =
    follows.find((follow) => follow.tmdbId === requestedId)?.tmdbId ?? follows[0]?.tmdbId ?? null;

  const detailQuery = useQuery({
    queryKey: ["follow", selectedTmdbId],
    queryFn: () => api.follow(selectedTmdbId!),
    enabled: Boolean(selectedTmdbId),
    refetchInterval: 20_000,
  });
  const detail = detailQuery.data;

  const [filter, setFilter] = React.useState("all");
  const [editOpen, setEditOpen] = React.useState(false);
  const [editQuality, setEditQuality] = React.useState<SeriesQuality>("1080p");
  const [editStatus, setEditStatus] = React.useState("active");
  const [editSkips, setEditSkips] = React.useState<number[]>([]);

  React.useEffect(() => {
    if (!detail?.follow) return;
    setEditQuality(detail.follow.quality);
    setEditStatus(detail.follow.status);
    setEditSkips(detail.follow.skippedSeasons);
  }, [detail?.follow]);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["follows"] }),
      queryClient.invalidateQueries({ queryKey: ["follow", selectedTmdbId] }),
      queryClient.invalidateQueries({ queryKey: ["overview"] }),
    ]);
  };

  const checkOne = useMutation({
    mutationFn: (tmdbId: number) => api.checkFollow(tmdbId),
    onSuccess: async (response) => {
      await invalidate();
      if (response.result.error) toast.warning(response.result.error);
      else
        toast.success(
          `Check finished: ${response.result.scheduled} queued, ${response.result.alreadyHave} already present`,
        );
    },
    onError: (error) => toast.error(errorText(error)),
  });

  const checkAll = useMutation({
    mutationFn: api.checkAllFollows,
    onSuccess: () => {
      toast.success("Checking every active series in the background");
      window.setTimeout(() => void invalidate(), 4_000);
      window.setTimeout(() => void invalidate(), 12_000);
    },
    onError: (error) => toast.error(errorText(error)),
  });

  const saveEdit = useMutation({
    mutationFn: () =>
      api.updateFollow(selectedTmdbId!, {
        quality: editQuality,
        status: editStatus,
        skippedSeasons: editSkips,
      }),
    onSuccess: async () => {
      setEditOpen(false);
      await invalidate();
      toast.success("Follow updated");
    },
    onError: (error) => toast.error(errorText(error)),
  });

  const unfollow = useMutation({
    mutationFn: () => api.deleteFollow(selectedTmdbId!),
    onSuccess: async () => {
      toast.success("Unfollowed");
      const next = new URLSearchParams(params);
      next.delete("id");
      setParams(next, { replace: true });
      await invalidate();
    },
    onError: (error) => toast.error(errorText(error)),
  });

  const items = detail?.items ?? [];
  const filteredItems = items.filter((item) => {
    if (filter === "wanted") return WANTED_STATUSES.includes(item.status);
    if (filter === "active") return ACTIVE_STATUSES.includes(item.status);
    if (filter === "done") return DONE_STATUSES.includes(item.status);
    return true;
  });
  const counts = {
    all: items.length,
    wanted: items.filter((item) => WANTED_STATUSES.includes(item.status)).length,
    active: items.filter((item) => ACTIVE_STATUSES.includes(item.status)).length,
    done: items.filter((item) => DONE_STATUSES.includes(item.status)).length,
  };
  const poster = tmdbImage(detail?.follow?.posterPath, "w342");

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Series automation"
        title="Follows"
        description="Pick a quality once. See checks every provider for new episodes and season packs, then sends them to qBittorrent."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => checkAll.mutate()}
            disabled={checkAll.isPending || follows.length === 0}
          >
            {checkAll.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Check all
          </Button>
        }
      />

      <ErrorBanner message={followsQuery.error ? errorText(followsQuery.error) : null} />

      {followsQuery.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="space-y-2 lg:col-span-2">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
          <Skeleton className="h-96 rounded-xl lg:col-span-3" />
        </div>
      ) : follows.length === 0 ? (
        <EmptyState
          icon={<Bell />}
          title="No series followed yet"
          description="Open a TV show on the TMDB proxy and use the See widget to follow it with a quality and optional skipped seasons."
          action={
            <Button asChild>
              <a href="/tv">Browse TV shows</a>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="space-y-2 lg:col-span-2">
            {follows.map((follow) => {
              const image = tmdbImage(follow.posterPath, "w185");
              const selected = follow.tmdbId === selectedTmdbId;
              return (
                <Link
                  key={follow.id}
                  to={`/follows?id=${follow.tmdbId}`}
                  replace
                  className={cn(
                    "flex gap-3 rounded-xl border p-3 transition",
                    selected
                      ? "border-primary/35 bg-primary/8 shadow-[0_0_0_1px_color-mix(in_oklab,var(--primary)_10%,transparent)]"
                      : "border-border/70 bg-card/40 hover:border-border hover:bg-card/70",
                  )}
                >
                  <div className="h-[72px] w-12 shrink-0 overflow-hidden rounded-lg border border-border/60 bg-muted">
                    {image ? (
                      <img
                        src={image}
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
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-medium">
                        {follow.name}
                        {follow.year ? ` (${follow.year})` : ""}
                      </p>
                      <QualityBadge quality={follow.quality} />
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <Badge variant={follow.status === "active" ? "success" : "muted"}>{follow.status}</Badge>
                      {follow.counts.wanted > 0 && (
                        <Badge variant="warning">{follow.counts.wanted} wanted</Badge>
                      )}
                    </div>
                    <p className="mt-1.5 text-[10px] text-muted-foreground">
                      {follow.counts.completed} completed · checked {formatRelative(follow.lastCheckAt)}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="lg:col-span-3">
            {!detail || !detail.follow ? (
              <Card>
                <CardContent className="py-16 text-center text-sm text-muted-foreground">
                  {detailQuery.isLoading ? "Loading series…" : "Select a series to inspect its episodes."}
                </CardContent>
              </Card>
            ) : (
              <Card className="overflow-hidden">
                <div className="relative border-b border-border/60">
                  {poster && (
                    <div className="absolute inset-0 opacity-20">
                      <img
                        src={poster}
                        alt=""
                        className="h-full w-full object-cover object-top blur-2xl"
                        onError={(event) => {
                          event.currentTarget.style.visibility = "hidden";
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-card via-card/70 to-transparent" />
                    </div>
                  )}
                  <div className="relative flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
                    <div className="h-28 w-20 shrink-0 overflow-hidden rounded-lg border border-border/70 shadow-lg">
                      {poster ? (
                        <img
                          src={poster}
                          alt=""
                          className="h-full w-full object-cover"
                          onError={(event) => {
                            event.currentTarget.style.visibility = "hidden";
                          }}
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center bg-muted">
                          <Tv className="size-5 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-semibold tracking-tight">
                          {detail.follow.name}
                          {detail.follow.year ? ` (${detail.follow.year})` : ""}
                        </h2>
                        <QualityBadge quality={detail.follow.quality} />
                        <Badge variant={detail.follow.status === "active" ? "success" : "muted"}>
                          {detail.follow.status}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Search: <span className="font-mono text-foreground/80">{detail.follow.searchPattern}</span> ·
                        Last check {formatRelative(detail.follow.lastCheckAt)}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => checkOne.mutate(detail.follow!.tmdbId)} disabled={checkOne.isPending}>
                          {checkOne.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                          Check now
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                          <Pencil /> Edit
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                          <a href={`/tv/${detail.follow.tmdbId}`}>
                            <ExternalLink /> TMDB
                          </a>
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-red-400/30 text-red-600 hover:bg-red-400/10 dark:text-red-300"
                            >
                              <BellOff /> Unfollow
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Stop following {detail.follow.name}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Episode tracking is removed. Torrents already in qBittorrent are left alone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-red-500 text-white hover:bg-red-500/90"
                                onClick={() => unfollow.mutate()}
                              >
                                Unfollow
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </div>
                </div>

                <CardContent className="p-4 sm:p-5">
                  {detail.follow.lastError && (
                    <div className="mb-3 rounded-lg border border-amber-400/25 bg-amber-400/8 px-3 py-2 text-xs text-amber-700 dark:text-amber-200">
                      {detail.follow.lastError}
                    </div>
                  )}
                  <Tabs value={filter} onValueChange={setFilter}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <TabsList>
                        <TabsTrigger value="all">All {counts.all}</TabsTrigger>
                        <TabsTrigger value="wanted">Wanted {counts.wanted}</TabsTrigger>
                        <TabsTrigger value="active">Active {counts.active}</TabsTrigger>
                        <TabsTrigger value="done">Done {counts.done}</TabsTrigger>
                      </TabsList>
                      <span className="text-[10px] text-muted-foreground">
                        Skipped seasons are treated as already owned
                      </span>
                    </div>
                    <TabsContent value={filter} className="mt-1">
                      {detailQuery.isLoading ? (
                        <div className="space-y-2 py-3">
                          <Skeleton className="h-10" />
                          <Skeleton className="h-10" />
                        </div>
                      ) : filteredItems.length === 0 ? (
                        <div className="py-10 text-center text-xs text-muted-foreground">
                          Nothing in this category.
                        </div>
                      ) : (
                        <div className="thin-scrollbar max-h-[32rem] overflow-y-auto pr-1">
                          {filteredItems.map((item) => (
                            <EpisodeRow key={item.id} item={item} follow={detail.follow!} />
                          ))}
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit follow</DialogTitle>
            <DialogDescription>
              Quality changes affect future checks. Skipped seasons are never downloaded.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Quality</Label>
                <Select value={editQuality} onValueChange={(value) => setEditQuality(value as SeriesQuality)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2160p">2160p</SelectItem>
                    <SelectItem value="1080p">1080p</SelectItem>
                    <SelectItem value="720p">720p</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={editStatus} onValueChange={setEditStatus}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Skip seasons (already owned)</Label>
              <div className="flex flex-wrap gap-2">
                {(detail?.seasons ?? []).map((season) => {
                  const selected = editSkips.includes(season.season_number);
                  return (
                    <button
                      key={season.season_number}
                      type="button"
                      onClick={() =>
                        setEditSkips((current) =>
                          current.includes(season.season_number)
                            ? current.filter((value) => value !== season.season_number)
                            : [...current, season.season_number].sort((a, b) => a - b),
                        )
                      }
                      className={cn(
                        "flex cursor-pointer flex-col items-center rounded-lg border px-3 py-2 text-xs transition",
                        selected
                          ? "border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-200"
                          : "border-border/70 bg-muted/20 text-muted-foreground hover:border-border hover:text-foreground",
                      )}
                      title={selected ? "Skipped (treated as owned)" : "Not skipped"}
                    >
                      <span className={cn(selected && "line-through")}>
                        S{String(season.season_number).padStart(2, "0")}
                      </span>
                      <span className="mt-0.5 text-[9px] opacity-70">{season.episode_count}ep</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => saveEdit.mutate()} disabled={saveEdit.isPending}>
              {saveEdit.isPending ? <Loader2 className="animate-spin" /> : <Check />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {detailQuery.error && <ErrorBanner message={errorText(detailQuery.error)} />}
    </div>
  );
}
