import type { OverviewResponse } from "@tmdb-see/shared";
import { isQbitComplete } from "@tmdb-see/shared";
import { config } from "../config";
import { listFollowRows, followCounts } from "../db/follows";
import { providerManager } from "../providers/manager";
import { aiStatus } from "./ai";
import { recentEvents } from "./events";
import { followSummary } from "./follow";
import { listQbitTorrents } from "./qbit";

let healthCheckedAt = 0;
let healthPromise: Promise<void> | null = null;

async function refreshProviderHealth(): Promise<void> {
  if (Date.now() - healthCheckedAt < 5 * 60_000) return;
  if (healthPromise) return healthPromise;
  healthPromise = providerManager
    .checkAllHealth()
    .then(() => {
      healthCheckedAt = Date.now();
    })
    .finally(() => {
      healthPromise = null;
    });
  return healthPromise;
}

export async function getOverview(): Promise<OverviewResponse> {
  let qbitError: string | undefined;
  let torrents = [] as Awaited<ReturnType<typeof listQbitTorrents>>;
  try {
    torrents = await listQbitTorrents();
  } catch (error) {
    qbitError = error instanceof Error ? error.message : String(error);
  }

  await refreshProviderHealth().catch(() => undefined);
  const providers = await providerManager.listPublic();
  const providerNames = new Map(providers.map((provider) => [provider.id, provider.name]));
  const enriched = torrents.map((torrent) => ({
    ...torrent,
    ref: torrent.ref
      ? {
          ...torrent.ref,
          providerName: providerNames.get(torrent.ref.providerId ?? ""),
          providerKind: providerManager.getAdapter(torrent.ref.providerId ?? "")?.kind,
        }
      : undefined,
  }));

  const completed = enriched.filter((torrent) => isQbitComplete(torrent));
  const active = enriched.filter((torrent) => !isQbitComplete(torrent));
  const queued = enriched.filter((torrent) =>
    ["queuedDL", "queuedUP", "pausedDL", "pausedUP", "stalledDL", "stalledUP"].includes(torrent.state),
  );

  const followRows = listFollowRows();
  const summaries = followRows.map(followSummary);
  const wantedEpisodes = followRows.reduce((total, row) => total + followCounts(row).wanted, 0);
  const attention = summaries.filter((follow) => follow.lastError || follow.counts.wanted > 0);

  const sortedTorrents = [...enriched].sort((a, b) => {
    const aComplete = isQbitComplete(a) ? 1 : 0;
    const bComplete = isQbitComplete(b) ? 1 : 0;
    if (aComplete !== bComplete) return aComplete - bComplete;
    return b.addedOn - a.addedOn;
  });
  const ai = aiStatus();

  return {
    stats: {
      activeDownloads: active.length,
      completedDownloads: completed.length,
      queuedDownloads: queued.length,
      downloadSpeed: enriched.reduce((total, torrent) => total + torrent.dlspeed, 0),
      uploadSpeed: enriched.reduce((total, torrent) => total + torrent.upspeed, 0),
      activeFollows: summaries.filter((follow) => follow.status === "active").length,
      wantedEpisodes,
      attentionFollows: attention.length,
      providers: providers.length,
      providersOnline: providers.filter((provider) => provider.health?.ok).length,
      aiEnabled: ai.enabled && ai.configured,
    },
    qbit: sortedTorrents.slice(0, 8),
    follows: attention.sort((a, b) => b.counts.wanted - a.counts.wanted).slice(0, 6),
    events: recentEvents(10),
    providers,
    ai,
    version: config.version,
    uptimeSeconds: Math.round(process.uptime()),
    ...(qbitError ? { qbitError } : {}),
  };
}
