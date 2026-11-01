import * as React from "react";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowDownToLine,
  ArrowUp,
  ArrowDown,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Filter,
  Loader2,
  Search as SearchIcon,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import type { AiMatch, MediaTarget, SearchSort, SortOrder, TorrentItem } from "@tmdb-see/shared";
import {
  formatBytes,
  formatDate,
  pluralize,
} from "@tmdb-see/shared";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  Skeleton,
  cn,
} from "@tmdb-see/ui";
import { toast } from "sonner";
import { api, errorText } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ErrorBanner } from "@/components/error-banner";
import { ProviderBadge } from "@/components/provider-badge";
import { QualityBadge } from "@/components/quality-badge";
import { AiBadge } from "@/components/ai-badge";

const SORT_OPTIONS: Array<{ value: SearchSort; label: string }> = [
  { value: "seeders", label: "Seeders" },
  { value: "leechers", label: "Leechers" },
  { value: "size", label: "Size" },
  { value: "date", label: "Upload date" },
  { value: "title", label: "Title" },
];

const WHERE_OPTIONS = [
  { value: "name", label: "Name" },
  { value: "leiras", label: "Description" },
  { value: "imdb", label: "IMDb" },
  { value: "cimke", label: "Label" },
];

function ResultRow({
  item,
  ai,
  grabbing,
  onGrab,
  target,
}: {
  item: TorrentItem;
  ai?: AiMatch;
  grabbing: boolean;
  onGrab: () => void;
  target: MediaTarget | null;
}) {
  const targetQuery = target
    ? `?${new URLSearchParams({
        targetType: target.type,
        targetTmdbId: String(target.tmdbId),
        targetTitle: target.title,
        ...(target.year ? { targetYear: target.year } : {}),
        ...(target.season ? { targetSeason: String(target.season) } : {}),
        ...(target.episode ? { targetEpisode: String(target.episode) } : {}),
      }).toString()}`
    : "";
  const detailHref = `/torrents/${encodeURIComponent(item.providerId)}/${encodeURIComponent(item.id)}${targetQuery}`;

  return (
    <div className="group rounded-xl border border-border/70 bg-card/50 p-4 transition hover:border-primary/25 hover:bg-card/80">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <Link
            to={detailHref}
            className="line-clamp-2 text-sm font-medium leading-relaxed transition group-hover:text-primary sm:text-[15px]"
          >
            {item.title}
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <ProviderBadge name={item.providerName} kind={item.providerKind} />
            {item.categoryLabel && <Badge variant="muted">{item.categoryLabel}</Badge>}
            <QualityBadge quality={item.quality} />
            {ai && <AiBadge match={ai} />}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-300">
              <ArrowUp className="size-3" /> {item.seeders}
            </span>
            <span className="inline-flex items-center gap-1 font-medium text-red-600 dark:text-red-300/90">
              <ArrowDown className="size-3" /> {item.leechers}
            </span>
            <span>{item.size ? formatBytes(item.size) : item.sizeLabel || "—"}</span>
            {item.publishedAt && <span>{formatDate(item.publishedAt)}</span>}
            <span className="font-mono text-[10px] text-muted-foreground/60">#{item.id.slice(0, 12)}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
          <Button size="sm" variant="outline" asChild>
            <Link to={detailHref}>Details</Link>
          </Button>
          <Button size="sm" onClick={onGrab} disabled={grabbing}>
            {grabbing ? <Loader2 className="animate-spin" /> : <ArrowDownToLine />} Grab
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const providersQuery = useQuery({
    queryKey: ["providers"],
    queryFn: api.providers,
    staleTime: 60_000,
  });
  const providers = providersQuery.data?.providers ?? [];
  const allProviderIds = React.useMemo(() => providers.map((provider) => provider.id), [providers]);

  const providersParam = params.get("providers");
  const selectedProviderIds = React.useMemo(() => {
    if (!providersParam) return allProviderIds;
    const requested = providersParam.split(",").filter(Boolean);
    const filtered = requested.filter((id) => allProviderIds.includes(id));
    return filtered.length > 0 ? filtered : allProviderIds;
  }, [providersParam, allProviderIds]);
  const singleProvider = selectedProviderIds.length === 1
    ? providers.find((provider) => provider.id === selectedProviderIds[0])
    : null;
  const category = params.get("category") ?? "";
  const where = params.get("where") ?? "name";
  const sortBy = (params.get("sort") as SearchSort) || "seeders";
  const sortOrder = (params.get("order") as SortOrder) || "desc";
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
  const q = params.get("q") ?? "";
  const browse = params.get("browse") === "1";

  const target = React.useMemo<MediaTarget | null>(() => {
    const type = params.get("targetType");
    const title = params.get("targetTitle");
    const tmdbId = Number(params.get("targetTmdbId"));
    if (!type || !title || !Number.isFinite(tmdbId) || tmdbId <= 0) return null;
    return {
      type: type === "tv" ? "tv" : "movie",
      tmdbId,
      title,
      year: params.get("targetYear") ?? undefined,
      season: params.get("targetSeason") ? Number(params.get("targetSeason")) : undefined,
      episode: params.get("targetEpisode") ? Number(params.get("targetEpisode")) : undefined,
    };
  }, [params]);

  const [queryInput, setQueryInput] = React.useState(q);
  const [aiResults, setAiResults] = React.useState<Record<string, AiMatch>>({});
  const previousKey = React.useRef("");

  React.useEffect(() => {
    setQueryInput(q);
  }, [q]);

  const shouldSearch =
    Boolean(providersQuery.data) && (q.trim().length > 0 || Boolean(category) || browse);

  const searchRequest = React.useMemo(
    () => ({
      query: q.trim(),
      providerIds:
        selectedProviderIds.length > 0 && selectedProviderIds.length !== allProviderIds.length
          ? selectedProviderIds
          : undefined,
      category: singleProvider && category ? category : undefined,
      where: singleProvider?.kind === "ncore" ? where : undefined,
      page,
      sortBy,
      sortOrder,
    }),
    [q, selectedProviderIds, allProviderIds.length, singleProvider, category, where, page, sortBy, sortOrder],
  );

  const search = useQuery({
    queryKey: ["search", searchRequest],
    queryFn: () => api.search(searchRequest),
    enabled: shouldSearch,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });

  const resultKey = JSON.stringify(searchRequest);
  React.useEffect(() => {
    if (previousKey.current !== resultKey) {
      previousKey.current = resultKey;
      setAiResults({});
    }
  }, [resultKey]);

  const grab = useMutation({
    mutationFn: (item: TorrentItem) => api.grab(item.providerId, item.id, target ?? undefined),
    onSuccess: (result) => {
      toast.success(result.alreadyInQbit ? "Already in qBittorrent" : "Sent to qBittorrent");
    },
    onError: (error) => toast.error(errorText(error)),
  });

  const verify = useMutation({
    mutationFn: async () => {
      if (!target || !search.data) throw new Error("No AI target is attached to this search");
      const items = search.data.items.slice(0, 12);
      return api.verifyAi({
        target,
        items: items.map((item) => ({
          id: item.id,
          providerId: item.providerId,
          title: item.title,
          size: item.size,
        })),
      });
    },
    onSuccess: (response) => {
      const map: Record<string, AiMatch> = {};
      const items = search.data?.items.slice(0, 12) ?? [];
      response.results.forEach((result, index) => {
        const item = items[index];
        if (!item) return;
        map[`${item.providerId}:${item.id}`] = {
          verified: result.verified,
          confidence: result.confidence,
          reason: result.reason,
          cached: result.cached,
          model: result.model,
        };
      });
      setAiResults(map);
      toast.success(
        response.cachedCount > 0
          ? `AI checked ${response.results.length} releases (${response.cachedCount} cached)`
          : `AI checked ${response.results.length} releases`,
      );
    },
    onError: (error) => toast.error(errorText(error)),
  });

  const updateParams = (patch: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    if (resetPage) next.delete("page");
    setParams(next, { replace: false });
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    updateParams({ q: queryInput.trim(), browse: queryInput.trim() ? null : "1" });
  };

  const toggleProvider = (id: string) => {
    const current = selectedProviderIds;
    const next = current.includes(id) ? current.filter((value) => value !== id) : [...current, id];
    if (next.length === 0) {
      toast.error("Keep at least one provider selected");
      return;
    }
    updateParams({
      providers: next.length === allProviderIds.length ? null : next.join(","),
      category: null,
      page: "1",
    }, false);
  };

  const clearFilters = () => {
    const next = new URLSearchParams(params);
    for (const key of ["category", "where", "sort", "order", "page"]) next.delete(key);
    setParams(next, { replace: false });
  };

  const results = search.data?.items ?? [];
  const providerMetas = search.data?.providers ?? [];
  const totalPages = providerMetas.reduce((max, meta) => Math.max(max, meta.totalPages ?? 1), 1);
  const hasFilters = Boolean(category) || sortBy !== "seeders" || sortOrder !== "desc" || where !== "name" || Boolean(providersParam);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Multi-provider search"
        title="Find a release"
        description="Search every enabled torrent provider at once. Filter, inspect, and hand the best release to qBittorrent."
        actions={
          <Button variant="outline" size="sm" asChild>
            <a href="/" title="Open TMDB">
              Browse TMDB
            </a>
          </Button>
        }
      />

      {providersQuery.error && <ErrorBanner message={errorText(providersQuery.error)} />}

      <Card className="gap-4 py-4">
        <CardContent className="space-y-4 px-4 sm:px-5">
          <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={queryInput}
                onChange={(event) => setQueryInput(event.target.value)}
                placeholder="Movie, series, release group…"
                autoFocus
                autoComplete="off"
                spellCheck={false}
                className="h-11 pr-10 pl-9 text-base sm:text-sm"
                enterKeyHint="search"
              />
              {queryInput && (
                <button
                  type="button"
                  onClick={() => {
                    setQueryInput("");
                    updateParams({ q: null, browse: null });
                  }}
                  className="absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer text-muted-foreground transition hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <Button type="submit" size="lg" className="h-11">
              {search.isFetching ? <Loader2 className="animate-spin" /> : <SearchIcon />}
              Search
            </Button>
          </form>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/70">
              Providers
            </span>
            {providers.map((provider) => {
              const selected = selectedProviderIds.includes(provider.id);
              return (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => toggleProvider(provider.id)}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition",
                    selected
                      ? "border-primary/30 bg-primary/12 text-primary"
                      : "border-border/70 bg-transparent text-muted-foreground hover:border-border hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      provider.health?.ok ? "bg-emerald-400" : provider.health ? "bg-red-400" : "bg-muted-foreground/50",
                    )}
                  />
                  {provider.name}
                </button>
              );
            })}
            {providers.length === 0 && !providersQuery.isLoading && (
              <Link to="/settings" className="text-xs text-primary hover:underline">
                Configure a provider
              </Link>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <Filter className="size-3.5" /> Filters
            </div>
            {singleProvider && (
              <Select
                value={category || "all"}
                onValueChange={(value) =>
                  updateParams({ category: value === "all" ? null : value })
                }
              >
                <SelectTrigger size="sm" className="w-[170px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {Object.entries(
                    singleProvider.categories.reduce<Record<string, typeof singleProvider.categories>>(
                      (groups, entry) => {
                        const key = entry.group || "Other";
                        groups[key] = groups[key] ?? [];
                        groups[key].push(entry);
                        return groups;
                      },
                      {},
                    ),
                  ).map(([group, entries]) => (
                    <SelectGroup key={group}>
                      <SelectLabel>{group}</SelectLabel>
                      {entries.map((entry) => (
                        <SelectItem key={entry.value} value={entry.value}>
                          {entry.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            )}
            {singleProvider?.kind === "ncore" && (
              <Select value={where} onValueChange={(value) => updateParams({ where: value })}>
                <SelectTrigger size="sm" className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WHERE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={sortBy} onValueChange={(value) => updateParams({ sort: value })}>
              <SelectTrigger size="sm" className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortOrder} onValueChange={(value) => updateParams({ order: value })}>
              <SelectTrigger size="sm" className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="desc">Descending</SelectItem>
                <SelectItem value="asc">Ascending</SelectItem>
              </SelectContent>
            </Select>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <SlidersHorizontal /> Clear
              </Button>
            )}
          </div>

          {target && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-primary/6 px-3 py-2 text-xs">
              <Sparkles className="size-3.5 text-primary" />
              <span className="text-muted-foreground">AI target</span>
              <span className="font-medium">
                {target.title}
                {target.year ? ` (${target.year})` : ""}
                {target.type === "tv" && target.season
                  ? ` · S${String(target.season).padStart(2, "0")}${target.episode ? `E${String(target.episode).padStart(2, "0")}` : ""}`
                  : ""}
              </span>
              <Button
                variant="secondary"
                size="sm"
                className="ml-auto h-7"
                onClick={() => verify.mutate()}
                disabled={verify.isPending || results.length === 0}
              >
                {verify.isPending ? <Loader2 className="animate-spin" /> : <CheckCheck />}
                Verify top {Math.min(12, results.length)} results
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {search.error && <ErrorBanner message={errorText(search.error)} />}

      {(providerMetas.length > 0 || search.isFetching) && (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          {providerMetas.map((meta) => (
            <span
              key={meta.providerId}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-1",
                meta.ok ? "border-border/70 bg-card/50" : "border-amber-400/25 bg-amber-400/8 text-amber-700 dark:text-amber-200",
              )}
              title={meta.error}
            >
              <span className={cn("size-1.5 rounded-full", meta.ok ? "bg-emerald-400" : "bg-amber-400")} />
              {meta.providerName}: {meta.count} · {meta.latencyMs}ms
              {!meta.ok && " · error"}
            </span>
          ))}
          {search.isFetching && (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="size-3 animate-spin" /> searching
            </span>
          )}
        </div>
      )}

      {providerMetas.some((meta) => !meta.ok) && results.length === 0 && !search.isFetching && (
        <ErrorBanner
          message={providerMetas
            .filter((meta) => !meta.ok)
            .map((meta) => `${meta.providerName}: ${meta.error ?? "search failed"}`)
            .join(" · ")}
        />
      )}

      {!shouldSearch && !search.isLoading ? (
        <EmptyState
          icon={<SearchIcon />}
          title="Search across your providers"
          description="Type a release name, or browse a provider category. Toggle providers above to control the sources."
          action={
            providers.length > 0 ? (
              <Button variant="outline" size="sm" onClick={() => updateParams({ browse: "1", q: null })}>
                Browse all releases
              </Button>
            ) : undefined
          }
        />
      ) : search.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((key) => (
            <Skeleton key={key} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : results.length === 0 ? (
        <EmptyState
          icon={<SearchIcon />}
          title="No releases found"
          description="Try a broader title, another category, or a different provider."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              Page {page}
              {totalPages > 1 ? ` of ${totalPages}` : ""} · {pluralize(results.length, "result")}
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="icon-sm"
                disabled={page <= 1}
                onClick={() => updateParams({ page: String(page - 1) }, false)}
                aria-label="Previous page"
              >
                <ChevronLeft />
              </Button>
              <span className="min-w-8 text-center text-xs tabular-nums text-muted-foreground">{page}</span>
              <Button
                variant="outline"
                size="icon-sm"
                disabled={!search.data?.hasMore}
                onClick={() => updateParams({ page: String(page + 1) }, false)}
                aria-label="Next page"
              >
                <ChevronRight />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            {results.map((item) => (
              <ResultRow
                key={`${item.providerId}:${item.id}`}
                item={item}
                ai={aiResults[`${item.providerId}:${item.id}`]}
                grabbing={grab.isPending && grab.variables?.id === item.id}
                onGrab={() => grab.mutate(item)}
                target={target}
              />
            ))}
          </div>

          <div className="flex items-center justify-center gap-2 pb-4">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => updateParams({ page: String(page - 1) }, false)}
            >
              <ChevronLeft /> Previous
            </Button>
            <span className="px-2 text-xs text-muted-foreground">Page {page}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={!search.data?.hasMore}
              onClick={() => updateParams({ page: String(page + 1) }, false)}
            >
              Next <ChevronRight />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
