import type {
  ProviderCapabilities,
  ProviderCategory,
  ProviderHealth,
  SearchSort,
  TrackerActivityItem,
} from "@tmdb-see/shared";
import { detectResolution } from "../utils/media";
import { parseSize } from "../utils/size";
import type {
  ProviderAdapter,
  ProviderDownload,
  ProviderSearchOptions,
  ProviderSearchResult,
  ProviderTorrent,
} from "./types";

export interface NcoreConfig {
  baseUrl: string;
  username: string;
  password: string;
}

const CAPABILITIES: ProviderCapabilities = {
  browse: true,
  details: true,
  download: true,
  activity: true,
  recommended: true,
  categories: true,
};

export const NCORE_CATEGORIES: ProviderCategory[] = [
  { value: "all_own", label: "All", group: "General" },
  { value: "hd_hun", label: "HD (Hun)", group: "Movies" },
  { value: "hd", label: "HD", group: "Movies" },
  { value: "xvid_hun", label: "SD (Hun)", group: "Movies" },
  { value: "xvid", label: "SD", group: "Movies" },
  { value: "dvd_hun", label: "DVD (Hun)", group: "Movies" },
  { value: "dvd", label: "DVD", group: "Movies" },
  { value: "dvd9_hun", label: "DVD9 (Hun)", group: "Movies" },
  { value: "dvd9", label: "DVD9", group: "Movies" },
  { value: "hdser_hun", label: "HD Series (Hun)", group: "Series" },
  { value: "hdser", label: "HD Series", group: "Series" },
  { value: "xvidser_hun", label: "SD Series (Hun)", group: "Series" },
  { value: "xvidser", label: "SD Series", group: "Series" },
  { value: "dvdser_hun", label: "DVD Series (Hun)", group: "Series" },
  { value: "dvdser", label: "DVD Series", group: "Series" },
  { value: "mp3_hun", label: "MP3 (Hun)", group: "Music" },
  { value: "mp3", label: "MP3", group: "Music" },
  { value: "lossless_hun", label: "Lossless (Hun)", group: "Music" },
  { value: "lossless", label: "Lossless", group: "Music" },
  { value: "clip", label: "Music Video", group: "Music" },
  { value: "game_iso", label: "Game ISO", group: "Games" },
  { value: "game_rip", label: "Game Rip", group: "Games" },
  { value: "console", label: "Console", group: "Games" },
  { value: "ebook_hun", label: "eBook (Hun)", group: "Books" },
  { value: "ebook", label: "eBook", group: "Books" },
  { value: "iso", label: "Program ISO", group: "Apps" },
  { value: "misc", label: "Program Misc", group: "Apps" },
  { value: "mobil", label: "Mobile", group: "Apps" },
];

const CATEGORY_LABELS = new Map(NCORE_CATEGORIES.map((category) => [category.value, category.label]));

const SORT_MAP: Record<SearchSort, string> = {
  seeders: "seeders",
  leechers: "leechers",
  size: "size",
  date: "fid",
  title: "name",
};

const WHERE_VALUES = new Set(["name", "leiras", "imdb", "cimke"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

function normalizeDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

export class NcoreProvider implements ProviderAdapter {
  readonly id: string;
  readonly name: string;
  readonly kind = "ncore" as const;
  readonly capabilities = CAPABILITIES;

  private readonly config: NcoreConfig;
  private token = "";
  private loginPromise: Promise<void> | null = null;

  constructor(id: string, name: string, config: NcoreConfig) {
    this.id = id;
    this.name = name;
    this.config = { ...config, baseUrl: config.baseUrl.replace(/\/$/, "") };
  }

  private get configured(): boolean {
    return Boolean(this.config.baseUrl && this.config.username && this.config.password);
  }

  private async login(): Promise<void> {
    if (!this.configured) throw new Error("nCore provider is missing its base URL or credentials");
    if (this.loginPromise) return this.loginPromise;

    this.loginPromise = (async () => {
      const response = await fetch(`${this.config.baseUrl}/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: this.config.username, password: this.config.password }),
        signal: AbortSignal.timeout(15_000),
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`nCore login failed (${response.status}): ${text.slice(0, 200)}`);
      }
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error("nCore login returned invalid JSON");
      }
      const token = asString(asRecord(payload)?.token);
      if (!token) throw new Error("nCore login did not return a token");
      this.token = token;
    })().finally(() => {
      this.loginPromise = null;
    });

    return this.loginPromise;
  }

  private async request(path: string, init?: RequestInit, retry = true): Promise<Response> {
    if (!this.token) await this.login();
    const headers = new Headers(init?.headers);
    headers.set("X-Ncore-Auth", this.token);
    const response = await fetch(`${this.config.baseUrl}${path}`, {
      ...init,
      headers,
      signal: init?.signal ?? AbortSignal.timeout(30_000),
    });
    if ((response.status === 401 || response.status === 403) && retry) {
      this.token = "";
      await this.login();
      return this.request(path, init, false);
    }
    return response;
  }

  private async json(path: string, init?: RequestInit): Promise<unknown> {
    const response = await this.request(path, init);
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`nCore API ${response.status}: ${text.slice(0, 300)}`);
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`nCore API returned non-JSON: ${text.slice(0, 200)}`);
    }
  }

  private normalizeTorrent(value: unknown): ProviderTorrent | null {
    const raw = asRecord(value);
    if (!raw) return null;
    const id = asString(raw.ID ?? raw.id);
    const title = asString(raw.Title ?? raw.title);
    if (!id || !title) return null;
    const sizeLabel = asString(raw.Size ?? raw.size);
    const category = asString(raw.Type ?? raw.type);
    const sourceUrl = asString(raw.URL ?? raw.url);
    const date = normalizeDate(raw.Date ?? raw.date);
    return {
      providerId: this.id,
      providerName: this.name,
      providerKind: "ncore",
      id,
      title,
      size: parseSize(raw.Size ?? raw.size),
      sizeLabel: sizeLabel || undefined,
      seeders: asNumber(raw.Seeders ?? raw.seeders),
      leechers: asNumber(raw.Leechers ?? raw.leechers),
      category: category || undefined,
      categoryLabel: category ? CATEGORY_LABELS.get(category) ?? category : undefined,
      publishedAt: date,
      sourceUrl: sourceUrl || undefined,
      quality: detectResolution(title),
      raw,
    };
  }

  async search(options: ProviderSearchOptions): Promise<ProviderSearchResult> {
    const where = options.where && WHERE_VALUES.has(options.where) ? options.where : "name";
    const type = options.category || "all_own";
    const payload = {
      pattern: options.query,
      type,
      where,
      sort_by: SORT_MAP[options.sortBy] ?? "seeders",
      sort_order: options.sortOrder.toUpperCase() === "ASC" ? "ASC" : "DESC",
      page: options.page,
    };
    const data = await this.json("/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const record = asRecord(data) ?? {};
    const list = Array.isArray(record.Torrents)
      ? record.Torrents
      : Array.isArray(record.torrents)
        ? record.torrents
        : [];
    const totalPages = asNumber(record.NumOfPages ?? record.numOfPages) || undefined;
    const items = list
      .map((item) => this.normalizeTorrent(item))
      .filter((item): item is ProviderTorrent => Boolean(item));
    return {
      items,
      totalPages,
      hasMore: totalPages ? options.page < totalPages : items.length >= options.pageSize,
    };
  }

  async getTorrent(torrentId: string): Promise<ProviderTorrent | null> {
    const data = await this.json(`/torrent/${encodeURIComponent(torrentId)}`);
    return this.normalizeTorrent(data);
  }

  async download(torrent: ProviderTorrent): Promise<ProviderDownload> {
    const response = await this.request(`/torrent/${encodeURIComponent(torrent.id)}/download`, undefined, false);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`nCore torrent download failed (${response.status}): ${text.slice(0, 200)}`);
    }
    const type = response.headers.get("content-type") ?? "";
    if (type.includes("json") || type.includes("html")) {
      const text = await response.text();
      throw new Error(`nCore returned ${type} instead of a torrent: ${text.slice(0, 200)}`);
    }
    const data = new Uint8Array(await response.arrayBuffer());
    if (data.byteLength === 0) throw new Error("nCore returned an empty torrent file");
    return { data, filename: `${torrent.id}.torrent` };
  }

  async categories(): Promise<ProviderCategory[]> {
    return NCORE_CATEGORIES;
  }

  async activity(): Promise<TrackerActivityItem[]> {
    const data = await this.json("/activity");
    const list = Array.isArray(data) ? data : [];
    return list.map((value) => {
      const raw = asRecord(value) ?? {};
      const extra = asRecord(raw.Extra ?? raw.extra) ?? {};
      const id = asString(raw.ID ?? raw.id) || crypto.randomUUID();
      return {
        id,
        torrentId: asString(raw.ID ?? raw.id) || undefined,
        title: asString(raw.Title ?? raw.title) || `Torrent ${id}`,
        status: asString(extra.status) || undefined,
        uploaded: asString(extra.uploaded) || undefined,
        downloaded: asString(extra.downloaded) || undefined,
        remaining: asString(extra.remaining) || undefined,
        rate: asNumber(extra.rate) || undefined,
        startedAt: normalizeDate(extra.start),
        updatedAt: normalizeDate(extra.updated),
        seeders: asNumber(raw.Seeders ?? raw.seeders) || undefined,
        leechers: asNumber(raw.Leechers ?? raw.leechers) || undefined,
      };
    });
  }

  async recommended(): Promise<ProviderTorrent[]> {
    const data = await this.json("/recommended");
    const list = Array.isArray(data) ? data : [];
    return list
      .map((item) => this.normalizeTorrent(item))
      .filter((item): item is ProviderTorrent => Boolean(item));
  }

  async test(): Promise<ProviderHealth> {
    const started = Date.now();
    try {
      if (!this.configured) throw new Error("Missing base URL, username, or password");
      this.token = "";
      await this.login();
      return {
        ok: true,
        message: "Authenticated with nCore API",
        latencyMs: Date.now() - started,
        checkedAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        latencyMs: Date.now() - started,
        checkedAt: new Date().toISOString(),
      };
    }
  }
}
