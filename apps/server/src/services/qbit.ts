import type { LiveQbit, QbitTorrent } from "@tmdb-see/shared";
import { config } from "../config";
import { ApiError } from "../lib/errors";
import { logger } from "../lib/logger";
import { parseQbitRef } from "../utils/qbit-tags";
import { getPrivateSettings } from "./settings";

interface QbitConfig {
  host: string;
  username: string;
  password: string;
}

interface RawQbitTorrent {
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
  save_path: string;
  added_on: number;
  completion_on: number;
  num_seeds: number;
  num_leechs: number;
}

/**
 * Extract the session cookie name/value from qBittorrent's Set-Cookie headers.
 *
 * qBittorrent 4.x uses `SID`; 5.x uses `QBT_SID_<webui-port>`. The name has to
 * be preserved because the server expects the same one back.
 */
export function sessionCookie(setCookies: string[]): string {
  for (const value of setCookies) {
    const match = value.match(/((?:QBT_)?SID(?:_\d+)?)=([^;]+)/);
    if (match) return `${match[1]}=${match[2]}`;
  }
  return "";
}

class QbitClient {
  private readonly config: QbitConfig;
  private cookie = "";
  private loginPromise: Promise<void> | null = null;
  private listCache: { at: number; value: QbitTorrent[] } | null = null;

  constructor(config: QbitConfig) {
    this.config = { ...config, host: config.host.replace(/\/$/, "") };
  }

  private get host(): string {
    return this.config.host;
  }

  private async login(): Promise<void> {
    if (!this.host) throw new ApiError(503, "qBittorrent is not configured");
    if (this.loginPromise) return this.loginPromise;
    this.loginPromise = (async () => {
      const body = new URLSearchParams();
      if (this.config.username) body.set("username", this.config.username);
      if (this.config.password) body.set("password", this.config.password);
      const response = await fetch(`${this.host}/api/v2/auth/login`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          referer: this.host,
        },
        body,
        signal: AbortSignal.timeout(15_000),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`qBittorrent login failed (${response.status})`);
      if (/fails/i.test(text)) throw new Error("qBittorrent rejected the username or password");
      const headers = response.headers as Headers & { getSetCookie?: () => string[] };
      const cookies = headers.getSetCookie?.() ?? [response.headers.get("set-cookie") ?? ""];
      this.cookie = sessionCookie(cookies);
    })().finally(() => {
      this.loginPromise = null;
    });
    return this.loginPromise;
  }

  private async request(path: string, init?: RequestInit, retry = true): Promise<Response> {
    if (!this.cookie) await this.login();
    const headers = new Headers(init?.headers);
    headers.set("Referer", this.host);
    if (this.cookie) headers.set("Cookie", this.cookie);
    const response = await fetch(`${this.host}${path}`, {
      ...init,
      headers,
      signal: init?.signal ?? AbortSignal.timeout(30_000),
    });
    if (response.status === 403 && retry) {
      this.cookie = "";
      await this.login();
      return this.request(path, init, false);
    }
    return response;
  }

  async test(): Promise<{ ok: boolean; message: string; latencyMs: number }> {
    const started = Date.now();
    try {
      this.cookie = "";
      await this.login();
      const response = await this.request("/api/v2/app/version");
      const version = (await response.text()).trim();
      if (!response.ok) throw new Error(`qBittorrent version request failed (${response.status})`);
      return { ok: true, message: `Connected to qBittorrent ${version || ""}`.trim(), latencyMs: Date.now() - started };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        latencyMs: Date.now() - started,
      };
    }
  }

  async addTorrent(input: {
    data?: Uint8Array;
    magnet?: string;
    filename: string;
    tags: string;
    savePath?: string;
    rename?: string;
  }): Promise<void> {
    const form = new FormData();
    if (input.data) {
      const blob = new Blob([input.data as unknown as BlobPart], { type: "application/x-bittorrent" });
      form.append("torrents", new File([blob], input.filename, { type: "application/x-bittorrent" }));
    } else if (input.magnet) {
      form.append("urls", input.magnet);
    } else {
      throw new Error("No torrent file or magnet supplied");
    }
    if (input.tags) form.append("tags", input.tags);
    if (input.savePath) {
      form.append("autoTMM", "false");
      form.append("savepath", input.savePath);
      // Single episodes get their own episode folder; movies and season packs
      // are flattened directly into the movie/season folder.
      if (input.rename) {
        form.append("rename", input.rename);
        form.append("contentLayout", "Subfolder");
      } else {
        form.append("contentLayout", "NoSubfolder");
      }
    }

    const response = await this.request("/api/v2/torrents/add", { method: "POST", body: form });
    const text = (await response.text()).trim();
    if (!response.ok || /fails/i.test(text)) {
      throw new Error(`qBittorrent refused the torrent: ${text || response.status}`);
    }
    this.listCache = null;
  }

  async list(force = false): Promise<QbitTorrent[]> {
    if (!force && this.listCache && Date.now() - this.listCache.at < 2_000) {
      return this.listCache.value;
    }
    const response = await this.request("/api/v2/torrents/info");
    if (!response.ok) throw new Error(`qBittorrent torrent list failed (${response.status})`);
    const raw = (await response.json()) as RawQbitTorrent[];
    const value = raw.map((torrent) => this.mapTorrent(torrent));
    this.listCache = { at: Date.now(), value };
    return value;
  }

  private mapTorrent(torrent: RawQbitTorrent): QbitTorrent {
    return {
      hash: torrent.hash,
      name: torrent.name,
      progress: torrent.progress,
      state: torrent.state,
      size: torrent.size,
      downloaded: torrent.downloaded,
      uploaded: torrent.uploaded,
      dlspeed: torrent.dlspeed,
      upspeed: torrent.upspeed,
      eta: torrent.eta,
      ratio: torrent.ratio,
      tags: torrent.tags ?? "",
      category: torrent.category ?? "",
      savePath: torrent.save_path ?? "",
      addedOn: torrent.added_on ?? 0,
      completionOn: torrent.completion_on ?? 0,
      numSeeds: torrent.num_seeds ?? 0,
      numLeechs: torrent.num_leechs ?? 0,
      ref: parseQbitRef(torrent.tags ?? ""),
    };
  }

  async getByRef(providerId: string, torrentId: string): Promise<QbitTorrent | null> {
    const torrents = await this.list();
    return (
      torrents.find(
        (torrent) => torrent.ref?.providerId === providerId && torrent.ref?.torrentId === torrentId,
      ) ?? null
    );
  }

  async getByHash(hash: string): Promise<QbitTorrent | null> {
    const torrents = await this.list();
    return torrents.find((torrent) => torrent.hash === hash) ?? null;
  }

  async delete(hash: string, deleteFiles: boolean): Promise<void> {
    const body = new URLSearchParams({ hashes: hash, deleteFiles: String(deleteFiles) });
    const response = await this.request("/api/v2/torrents/delete", { method: "POST", body });
    if (!response.ok) throw new Error(`qBittorrent delete failed (${response.status})`);
    this.listCache = null;
  }

  async control(action: "stop" | "start" | "recheck", hash: string): Promise<void> {
    const body = new URLSearchParams({ hashes: hash });
    const response = await this.request(`/api/v2/torrents/${action}`, { method: "POST", body });
    if (!response.ok) throw new Error(`qBittorrent ${action} failed (${response.status})`);
    this.listCache = null;
  }

  async listFiles(hash: string): Promise<unknown[]> {
    const response = await this.request(`/api/v2/torrents/files?hash=${encodeURIComponent(hash)}`);
    if (!response.ok) return [];
    return (await response.json()) as unknown[];
  }
}

let cachedClient: { signature: string; client: QbitClient } | null = null;

function currentConfig(): QbitConfig {
  const settings = getPrivateSettings();
  return {
    host: settings.qbit.host || config.qbit.host,
    username: settings.qbit.username || config.qbit.user,
    password: settings.qbit.password || config.qbit.pass,
  };
}

function getClient(): QbitClient {
  const cfg = currentConfig();
  if (!cfg.host) throw new ApiError(503, "qBittorrent is not configured. Add its URL in Settings → Connections.");
  const signature = `${cfg.host}\u0000${cfg.username}\u0000${cfg.password}`;
  if (!cachedClient || cachedClient.signature !== signature) {
    cachedClient = { signature, client: new QbitClient(cfg) };
  }
  return cachedClient.client;
}

export function invalidateQbitClient(): void {
  cachedClient = null;
}

export interface QbitAddInput {
  data?: Uint8Array;
  magnet?: string;
  filename: string;
  providerId: string;
  torrentId: string;
  tmdbId?: number;
  mediaType?: "movie" | "tv";
  followId?: number;
  season?: number;
  episode?: number;
  tags: string;
  relativeSavePath?: string;
  rename?: string;
}

export function resolveSavePath(relative?: string): string {
  const settings = getPrivateSettings();
  if (!settings.qbit.organize || !relative) return "";
  const base = settings.qbit.savePath;
  if (!base) return "";
  return `${base.replace(/\/+$/, "")}/${relative.replace(/^\/+/, "")}`;
}

export async function addToQbit(input: QbitAddInput): Promise<void> {
  const client = getClient();
  await client.addTorrent({
    data: input.data,
    magnet: input.magnet,
    filename: input.filename,
    tags: input.tags,
    savePath: resolveSavePath(input.relativeSavePath),
    rename: input.rename,
  });
}

export async function listQbitTorrents(force = false): Promise<QbitTorrent[]> {
  return getClient().list(force);
}

export async function getQbitByRef(providerId: string, torrentId: string): Promise<QbitTorrent | null> {
  return getClient().getByRef(providerId, torrentId);
}

export async function getQbitByHash(hash: string): Promise<QbitTorrent | null> {
  return getClient().getByHash(hash);
}

export async function deleteQbitTorrent(hash: string, deleteFiles: boolean): Promise<void> {
  await getClient().delete(hash, deleteFiles);
  invalidateQbitClientCache();
}

export async function controlQbitTorrent(
  action: "stop" | "start" | "recheck",
  hash: string,
): Promise<void> {
  await getClient().control(action, hash);
  invalidateQbitClientCache();
}

export async function testQbit(overrides?: Partial<QbitConfig>): Promise<{
  ok: boolean;
  message: string;
  latencyMs: number;
  checkedAt: string;
}> {
  const cfg = { ...currentConfig(), ...overrides };
  const client = new QbitClient(cfg);
  const result = await client.test();
  return { ...result, checkedAt: new Date().toISOString() };
}

export function qbitConfigured(): boolean {
  return Boolean(currentConfig().host);
}

export function toLiveQbit(torrent: QbitTorrent): LiveQbit {
  return {
    hash: torrent.hash,
    name: torrent.name,
    progress: torrent.progress,
    state: torrent.state,
    size: torrent.size,
    downloaded: torrent.downloaded,
    uploaded: torrent.uploaded,
    dlspeed: torrent.dlspeed,
    upspeed: torrent.upspeed,
    eta: torrent.eta,
    ratio: torrent.ratio,
    numSeeds: torrent.numSeeds,
    numLeechs: torrent.numLeechs,
    savePath: torrent.savePath,
    addedOn: torrent.addedOn,
    completionOn: torrent.completionOn,
  };
}

function invalidateQbitClientCache(): void {
  try {
    // A mutation makes the next read stale; a fresh login is not necessary.
    const client = getClient() as unknown as { listCache: { at: number; value: QbitTorrent[] } | null };
    client.listCache = null;
  } catch {
    // ignore
  }
}

export function logQbitError(context: string, error: unknown): void {
  logger.warn(`qBittorrent error during ${context}`, {
    error: error instanceof Error ? error.message : String(error),
  });
}
