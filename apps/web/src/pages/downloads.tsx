import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  CheckCircle2,
  Download,
  Gauge,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import type { QbitTorrent } from "@tmdb-see/shared";
import {
  formatBytes,
  formatEta,
  formatPercent,
  formatSpeed,
  isQbitComplete,
  qbitStateLabel,
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
  Input,
  Label,
  Progress,
  Skeleton,
  Switch,
  Tabs,
  TabsList,
  TabsTrigger,
  cn,
} from "@tmdb-see/ui";
import { toast } from "sonner";
import { api, errorText } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { ErrorBanner } from "@/components/error-banner";
import { EmptyState } from "@/components/empty-state";
import { ProviderBadge } from "@/components/provider-badge";

function DeleteDialog({
  torrent,
  onConfirm,
  pending,
}: {
  torrent: QbitTorrent;
  onConfirm: (deleteFiles: boolean) => void;
  pending: boolean;
}) {
  const [deleteFiles, setDeleteFiles] = React.useState(true);
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" title="Delete torrent">
          <Trash2 className="text-red-600 dark:text-red-300" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{torrent.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the torrent from qBittorrent. Choose whether the downloaded files should be deleted too.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
          <Label htmlFor={`delete-files-${torrent.hash}`} className="text-foreground">
            Delete downloaded files from disk
          </Label>
          <Switch
            id={`delete-files-${torrent.hash}`}
            checked={deleteFiles}
            onCheckedChange={setDeleteFiles}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            className="bg-red-500 text-white hover:bg-red-500/90"
            onClick={() => onConfirm(deleteFiles)}
          >
            {pending ? <Loader2 className="animate-spin" /> : <Trash2 />} Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function TorrentCard({ torrent }: { torrent: QbitTorrent }) {
  const queryClient = useQueryClient();
  const complete = isQbitComplete(torrent);
  const paused = torrent.state.startsWith("paused");
  const href =
    torrent.ref?.providerId && torrent.ref?.torrentId
      ? `/torrents/${encodeURIComponent(torrent.ref.providerId)}/${encodeURIComponent(torrent.ref.torrentId)}`
      : null;

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["qbit"] }),
      queryClient.invalidateQueries({ queryKey: ["overview"] }),
      href
        ? queryClient.invalidateQueries({
            queryKey: ["qbit-ref", torrent.ref?.providerId, torrent.ref?.torrentId],
          })
        : Promise.resolve(),
    ]);
  };

  const control = useMutation({
    mutationFn: (action: "pause" | "resume" | "recheck") => api.qbitAction(torrent.hash, action),
    onSuccess: async (_result, action) => {
      toast.success(action === "recheck" ? "Recheck started" : action === "pause" ? "Torrent paused" : "Torrent resumed");
      await invalidate();
    },
    onError: (error) => toast.error(errorText(error)),
  });

  const remove = useMutation({
    mutationFn: (deleteFiles: boolean) => api.deleteQbitTorrent(torrent.hash, deleteFiles),
    onSuccess: async () => {
      toast.success("Torrent deleted");
      await invalidate();
    },
    onError: (error) => toast.error(errorText(error)),
  });

  return (
    <Card className="gap-3 py-4">
      <CardContent className="space-y-3 px-4 sm:px-5">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border",
              complete
                ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-700 dark:text-emerald-300"
                : "border-sky-400/20 bg-sky-400/10 text-sky-700 dark:text-sky-300",
            )}
          >
            {complete ? <CheckCircle2 className="size-4" /> : <Download className="size-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                {href ? (
                  <Link to={href} className="line-clamp-2 text-sm font-medium hover:text-primary">
                    {torrent.name}
                  </Link>
                ) : (
                  <p className="line-clamp-2 text-sm font-medium">{torrent.name}</p>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Badge variant={complete ? "success" : paused ? "warning" : "sky"}>
                    {qbitStateLabel(torrent.state)}
                  </Badge>
                  {torrent.ref?.providerId && (
                    <ProviderBadge
                      name={torrent.ref.providerName ?? torrent.ref.providerId}
                      kind={torrent.ref.providerKind ?? (torrent.ref.providerId === "ncore" ? "ncore" : "torznab")}
                      showIcon={false}
                    />
                  )}
                  {torrent.ref?.tmdbId && (
                    <Badge variant="outline">
                      <a
                        href={`/${torrent.ref.mediaType === "tv" ? "tv" : "movie"}/${torrent.ref.tmdbId}`}
                        className="inline-flex items-center gap-1"
                      >
                        TMDB #{torrent.ref.tmdbId} <ArrowUpRight className="size-3" />
                      </a>
                    </Badge>
                  )}
                  {torrent.ref?.season !== undefined && (
                    <Badge variant="muted">
                      S{String(torrent.ref.season).padStart(2, "0")}
                      {torrent.ref.episode ? `E${String(torrent.ref.episode).padStart(2, "0")}` : " pack"}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title={paused ? "Resume" : "Pause"}
                  onClick={() => control.mutate(paused ? "resume" : "pause")}
                  disabled={control.isPending}
                >
                  {paused ? <Play /> : <Pause />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Recheck"
                  onClick={() => control.mutate("recheck")}
                  disabled={control.isPending}
                >
                  <RefreshCw />
                </Button>
                <DeleteDialog
                  torrent={torrent}
                  pending={remove.isPending}
                  onConfirm={(deleteFiles) => remove.mutate(deleteFiles)}
                />
              </div>
            </div>

            <div className="mt-3 grid gap-2 text-[11px] text-muted-foreground sm:grid-cols-2">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span>{complete ? "Completed" : `${formatPercent(torrent.progress)} downloaded`}</span>
                  <span className="tabular-nums">
                    {formatBytes(torrent.downloaded)} / {formatBytes(torrent.size)}
                  </span>
                </div>
                <Progress
                  value={complete ? 100 : Math.round(torrent.progress * 100)}
                  className="h-1.5"
                  indicatorClassName={complete ? "bg-emerald-400" : "bg-sky-400"}
                />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:justify-end">
                <span className="inline-flex items-center gap-1 text-sky-700 dark:text-sky-300">
                  <ArrowDown className="size-3" /> {formatSpeed(torrent.dlspeed)}
                </span>
                <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                  <ArrowUp className="size-3" /> {formatSpeed(torrent.upspeed)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Gauge className="size-3" /> {formatEta(torrent.eta)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Upload className="size-3" /> {torrent.ratio.toFixed(2)}
                </span>
                <span className="tabular-nums">
                  {torrent.numSeeds} seeds · {torrent.numLeechs} peers
                </span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function DownloadsPage() {
  const [filter, setFilter] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const query = useQuery({
    queryKey: ["qbit"],
    queryFn: api.qbitTorrents,
    refetchInterval: 3_000,
    retry: false,
  });
  const torrents = query.data?.torrents ?? [];
  const filtered = torrents.filter((torrent) => {
    if (search && !torrent.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === "active") return !isQbitComplete(torrent);
    if (filter === "complete") return isQbitComplete(torrent);
    if (filter === "paused") return torrent.state.startsWith("paused");
    return true;
  });
  const active = torrents.filter((torrent) => !isQbitComplete(torrent));
  const totalDown = torrents.reduce((total, torrent) => total + torrent.dlspeed, 0);
  const totalUp = torrents.reduce((total, torrent) => total + torrent.upspeed, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="qBittorrent"
        title="Downloads"
        description="Live progress from qBittorrent, including releases scheduled by See and everything else in your queue."
        actions={
          <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1 text-sky-700 dark:text-sky-300">
              <ArrowDown className="size-3.5" /> {formatSpeed(totalDown)}
            </span>
            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
              <ArrowUp className="size-3.5" /> {formatSpeed(totalUp)}
            </span>
          </div>
        }
      />

      <ErrorBanner message={query.error ? errorText(query.error) : null} />

      {query.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : torrents.length === 0 ? (
        <EmptyState
          icon={<Download />}
          title={query.error ? "qBittorrent is unreachable" : "No torrents in qBittorrent"}
          description={
            query.error
              ? "Check the qBittorrent connection in Settings → Connections."
              : "Send something from Search, a torrent detail page, or the TMDB widget."
          }
          action={
            <Button asChild variant="outline">
              <Link to="/search">Go to search</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Tabs value={filter} onValueChange={setFilter}>
              <TabsList>
                <TabsTrigger value="all">All {torrents.length}</TabsTrigger>
                <TabsTrigger value="active">Active {active.length}</TabsTrigger>
                <TabsTrigger value="complete">
                  Complete {torrents.filter((torrent) => isQbitComplete(torrent)).length}
                </TabsTrigger>
                <TabsTrigger value="paused">
                  Paused {torrents.filter((torrent) => torrent.state.startsWith("paused")).length}
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Filter torrents…"
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>

          <div className="space-y-2">
            {filtered.map((torrent) => (
              <TorrentCard key={torrent.hash} torrent={torrent} />
            ))}
            {filtered.length === 0 && (
              <div className="rounded-xl border border-dashed border-border/70 py-12 text-center text-sm text-muted-foreground">
                No torrents match this filter.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
