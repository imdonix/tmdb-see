import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCheck,
  Download,
  ExternalLink,
  Loader2,
  Rocket,
  Server,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { AiMatch, MediaTarget } from "@tmdb-see/shared";
import {
  formatBytes,
  formatDate,
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
  CardHeader,
  CardTitle,
  Input,
  Label,
  Progress,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from "@tmdb-see/ui";
import { toast } from "sonner";
import { api, errorText, torrentFileUrl } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { ErrorBanner } from "@/components/error-banner";
import { ProviderBadge } from "@/components/provider-badge";
import { QualityBadge } from "@/components/quality-badge";
import { AiBadge } from "@/components/ai-badge";
import { EmptyState } from "@/components/empty-state";

function targetFromParams(params: URLSearchParams): MediaTarget | null {
  const type = params.get("targetType");
  const title = params.get("targetTitle");
  if (!type || !title) return null;
  return {
    type: type === "tv" ? "tv" : "movie",
    tmdbId: Number(params.get("targetTmdbId") ?? "0") || 0,
    title,
    year: params.get("targetYear") ?? undefined,
    season: params.get("targetSeason") ? Number(params.get("targetSeason")) : undefined,
    episode: params.get("targetEpisode") ? Number(params.get("targetEpisode")) : undefined,
  };
}

export function TorrentPage() {
  const { providerId = "", torrentId = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const initialTarget = React.useMemo(() => targetFromParams(params), [params]);

  const torrentQuery = useQuery({
    queryKey: ["torrent", providerId, torrentId],
    queryFn: () => api.torrent(providerId, torrentId),
    enabled: Boolean(providerId && torrentId),
  });
  const torrent = torrentQuery.data?.torrent;

  const qbitQuery = useQuery({
    queryKey: ["qbit-ref", providerId, torrentId],
    queryFn: () => api.qbitByRef(providerId, torrentId),
    enabled: Boolean(providerId && torrentId),
    refetchInterval: 3_000,
    retry: false,
  });
  const qbit = qbitQuery.data?.torrent ?? null;

  const [target, setTarget] = React.useState<MediaTarget | null>(initialTarget);
  const [targetType, setTargetType] = React.useState<"movie" | "tv">(initialTarget?.type ?? "movie");
  const [targetTitle, setTargetTitle] = React.useState(initialTarget?.title ?? "");
  const [targetYear, setTargetYear] = React.useState(initialTarget?.year ?? "");
  const [targetTmdbId, setTargetTmdbId] = React.useState(
    initialTarget?.tmdbId ? String(initialTarget.tmdbId) : "",
  );
  const [targetSeason, setTargetSeason] = React.useState(
    initialTarget?.season ? String(initialTarget.season) : "",
  );
  const [targetEpisode, setTargetEpisode] = React.useState(
    initialTarget?.episode ? String(initialTarget.episode) : "",
  );
  const [aiMatch, setAiMatch] = React.useState<AiMatch | null>(null);

  React.useEffect(() => {
    if (initialTarget) setTarget(initialTarget);
  }, [initialTarget]);

  const grab = useMutation({
    mutationFn: () => api.grab(providerId, torrentId, target ?? undefined),
    onSuccess: (result) => {
      toast.success(result.message);
      void queryClient.invalidateQueries({ queryKey: ["qbit-ref", providerId, torrentId] });
      void queryClient.invalidateQueries({ queryKey: ["qbit"] });
    },
    onError: (error) => toast.error(errorText(error)),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteQbitTorrent(qbit!.hash, true),
    onSuccess: () => {
      toast.success("Torrent and files deleted");
      void queryClient.invalidateQueries({ queryKey: ["qbit-ref", providerId, torrentId] });
      void queryClient.invalidateQueries({ queryKey: ["qbit"] });
    },
    onError: (error) => toast.error(errorText(error)),
  });

  const verify = useMutation({
    mutationFn: async () => {
      if (!torrent) throw new Error("Torrent is not loaded");
      if (!targetTitle.trim()) throw new Error("Enter the expected movie or series title");
      const nextTarget: MediaTarget = {
        type: targetType,
        tmdbId: Number(targetTmdbId) || 0,
        title: targetTitle.trim(),
        year: targetYear.trim() || undefined,
        season: targetType === "tv" && targetSeason ? Number(targetSeason) : undefined,
        episode: targetType === "tv" && targetEpisode ? Number(targetEpisode) : undefined,
      };
      setTarget(nextTarget);
      return api.verifyAi({
        target: nextTarget,
        items: [{ id: torrent.id, providerId: torrent.providerId, title: torrent.title, size: torrent.size }],
      });
    },
    onSuccess: (response) => {
      const result = response.results[0];
      if (!result) return;
      setAiMatch({
        verified: result.verified,
        confidence: result.confidence,
        reason: result.reason,
        cached: result.cached,
        model: result.model,
      });
    },
    onError: (error) => toast.error(errorText(error)),
  });

  if (torrentQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (!torrent) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft /> Back
        </Button>
        <ErrorBanner message={torrentQuery.error ? errorText(torrentQuery.error) : "Torrent not found"} />
        <EmptyState
          icon={<Server />}
          title="Release not available"
          description="The provider may be offline or the cached search result expired. Run the search again."
          action={
            <Button asChild>
              <Link to="/search">Search again</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const complete = qbit ? isQbitComplete(qbit) : false;

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate(-1)}>
        <ArrowLeft /> Back
      </Button>

      <PageHeader
        eyebrow={`${torrent.providerName} · #${torrent.id.slice(0, 12)}`}
        title={torrent.title}
        description={
          [torrent.categoryLabel, torrent.quality, formatBytes(torrent.size)]
            .filter(Boolean)
            .join(" · ") || "Release details and download controls"
        }
        actions={
          <>
            {!torrent.magnet && (
              <Button variant="outline" size="sm" asChild>
                <a href={torrentFileUrl(torrent.providerId, torrent.id)}>
                  <Download /> .torrent
                </a>
              </Button>
            )}
            <Button size="sm" onClick={() => grab.mutate()} disabled={grab.isPending || Boolean(qbit)}>
              {grab.isPending ? <Loader2 className="animate-spin" /> : <Rocket />}
              {qbit ? "In qBittorrent" : "Send to qBittorrent"}
            </Button>
          </>
        }
      />

      {torrentQuery.error && <ErrorBanner message={errorText(torrentQuery.error)} />}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {qbit && (
            <Card className={complete ? "border-emerald-400/25" : "border-sky-400/20"}>
              <CardHeader className="flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {complete ? "Ready to watch" : "Download in progress"}
                    {complete && <Badge variant="success">complete</Badge>}
                  </CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {qbitStateLabel(qbit.state)} · {formatPercent(qbit.progress)}
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="border-red-400/30 text-red-600 hover:bg-red-400/10 dark:text-red-300">
                      <Trash2 /> Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this torrent?</AlertDialogTitle>
                      <AlertDialogDescription>
                        The torrent and its downloaded files will be removed from qBittorrent and disk.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-red-500 text-white hover:bg-red-500/90"
                        onClick={() => remove.mutate()}
                      >
                        Delete everything
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardHeader>
              <CardContent className="space-y-3">
                <Progress
                  value={complete ? 100 : Math.round(qbit.progress * 100)}
                  indicatorClassName={complete ? "bg-emerald-400" : "bg-sky-400"}
                />
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  {[
                    ["Downloaded", `${formatBytes(qbit.downloaded)} / ${formatBytes(qbit.size)}`],
                    ["↓ Speed", formatSpeed(qbit.dlspeed)],
                    ["↑ Speed", formatSpeed(qbit.upspeed)],
                    ["ETA", formatEta(qbit.eta)],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
                      <div className="mt-0.5 font-medium tabular-nums">{value}</div>
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/downloads">View all downloads</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Release metadata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { label: "Size", value: formatBytes(torrent.size) },
                  { label: "Seeders", value: String(torrent.seeders), className: "text-emerald-700 dark:text-emerald-300" },
                  { label: "Leechers", value: String(torrent.leechers), className: "text-red-600 dark:text-red-300" },
                  {
                    label: "Published",
                    value: torrent.publishedAt ? formatDate(torrent.publishedAt) : "—",
                  },
                ].map((entry) => (
                  <div
                    key={entry.label}
                    className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5"
                  >
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {entry.label}
                    </div>
                    <div className={`mt-1 text-sm font-medium tabular-nums ${entry.className ?? ""}`}>
                      {entry.value}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <ProviderBadge name={torrent.providerName} kind={torrent.providerKind} />
                {torrent.categoryLabel && <Badge variant="muted">{torrent.categoryLabel}</Badge>}
                <QualityBadge quality={torrent.quality} />
                {qbit && <Badge variant={complete ? "success" : "sky"}>{qbitStateLabel(qbit.state)}</Badge>}
              </div>

              {torrent.description && (
                <div className="rounded-lg border border-border/60 bg-muted/15 p-3 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
                  {torrent.description}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {!torrent.magnet && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={torrentFileUrl(torrent.providerId, torrent.id)}>
                      <Download /> Download torrent file
                    </a>
                  </Button>
                )}
                {torrent.sourceUrl && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={torrent.sourceUrl} target="_blank" rel="noreferrer">
                      <ExternalLink /> Open source
                    </a>
                  </Button>
                )}
                {torrent.magnet && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={torrent.magnet}>
                      <ExternalLink /> Magnet
                    </a>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className={aiMatch?.verified ? "border-emerald-400/25" : aiMatch ? "border-red-400/25" : ""}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" /> AI verifier
                {aiMatch && <AiBadge match={aiMatch} className="ml-auto" />}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Ask Ollama whether this release is actually the title you are looking for. Useful for remakes,
                similarly named films, and ambiguous series releases.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>Target type</Label>
                  <Select
                    value={targetType}
                    onValueChange={(value) => setTargetType(value as "movie" | "tv")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="movie">Movie</SelectItem>
                      <SelectItem value="tv">Series</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Year</Label>
                  <Input
                    value={targetYear}
                    onChange={(event) => setTargetYear(event.target.value)}
                    placeholder="1999"
                    inputMode="numeric"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Expected title</Label>
                <Input
                  value={targetTitle}
                  onChange={(event) => setTargetTitle(event.target.value)}
                  placeholder="Fight Club"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <Label>TMDB ID</Label>
                  <Input
                    value={targetTmdbId}
                    onChange={(event) => setTargetTmdbId(event.target.value)}
                    placeholder="550"
                    inputMode="numeric"
                  />
                </div>
                {targetType === "tv" && (
                  <>
                    <div className="space-y-1.5">
                      <Label>Season</Label>
                      <Input
                        value={targetSeason}
                        onChange={(event) => setTargetSeason(event.target.value)}
                        placeholder="1"
                        inputMode="numeric"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Episode</Label>
                      <Input
                        value={targetEpisode}
                        onChange={(event) => setTargetEpisode(event.target.value)}
                        placeholder="1"
                        inputMode="numeric"
                      />
                    </div>
                  </>
                )}
              </div>
              <Button className="w-full" onClick={() => verify.mutate()} disabled={verify.isPending}>
                {verify.isPending ? <Loader2 className="animate-spin" /> : <CheckCheck />}
                Check with AI
              </Button>
              {aiMatch && (
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs leading-relaxed">
                  <div className="mb-1 font-medium">
                    {aiMatch.verified ? "Confirmed match" : "Not a match"} ·{" "}
                    {Math.round(aiMatch.confidence * 100)}% confidence
                  </div>
                  <p className="text-muted-foreground">{aiMatch.reason}</p>
                </div>
              )}
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                AI is configured in{" "}
                <Link to="/settings" className="text-primary hover:underline">
                  Settings → AI
                </Link>
                .
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Source</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <div className="flex items-center justify-between gap-3">
                <span>Provider</span>
                <ProviderBadge name={torrent.providerName} kind={torrent.providerKind} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Release ID</span>
                <span className="font-mono text-foreground/80">{torrent.id.slice(0, 18)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Seeders</span>
                <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                  <ArrowUp className="size-3" /> {torrent.seeders}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Leechers</span>
                <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-300">
                  <ArrowDown className="size-3" /> {torrent.leechers}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
