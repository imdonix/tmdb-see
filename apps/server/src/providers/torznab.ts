import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import type {
  ProviderCapabilities,
  ProviderCategory,
  ProviderHealth,
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

export interface TorznabConfig {
  baseUrl: string;
  apiKey: string;
  allowExternalDownloads?: boolean;
}

const CAPABILITIES: ProviderCapabilities = {
  browse: true,
  details: false,
  download: true,
  activity: false,
  recommended: false,
  categories: true,
};

const STANDARD_CATEGORIES: ProviderCategory[] = [
  { value: "2000", label: "Movies", group: "Movies" },
  { value: "2040", label: "Movies HD", group: "Movies" },
  { value: "2045", label: "Movies UHD", group: "Movies" },
  { value: "2050", label: "Movies BluRay", group: "Movies" },
  { value: "5000", label: "TV", group: "TV" },
  { value: "5040", label: "TV HD", group: "TV" },
  { value: "5045", label: "TV UHD", group: "TV" },
  { value: "5080", label: "TV Anime", group: "TV" },
  { value: "3000", label: "Audio", group: "Audio" },
  { value: "4000", label: "PC / Games", group: "Games" },
  { value: "7000", label: "Books", group: "Books" },
  { value: "8000", label: "Other", group: "Other" },
];

const CATEGORY_LABELS: Record<string, string> = {
  "2000": "Movies",
  "2010": "Movies / Foreign",
  "2020": "Movies / Other",
  "2030": "Movies / SD",
  "2040": "Movies / HD",
  "2045": "Movies / UHD",
  "2050": "Movies / BluRay",
  "2060": "Movies / 3D",
  "3000": "Audio",
  "3010": "Audio / MP3",
  "3040": "Audio / Lossless",
  "4000": "PC",
  "4010": "PC / Games",
  "5000": "TV",
  "5010": "TV / WEB-DL",
  "5020": "TV / Foreign",
  "5030": "TV / SD",
  "5040": "TV / HD",
  "5045": "TV / UHD",
  "5050": "TV / BluRay",
  "5060": "TV / 3D",
  "5070": "TV / Sport",
  "5080": "TV / Anime",
  "7000": "Books",
  "8000": "Other",
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
  isArray: (name) =>
    ["item", "category", "subcat", "torznab:attr", "newznab:attr", "enclosure", "link"].includes(name),
});

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function ensureArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return text(record["#text"] ?? record.value ?? "");
  }
  return "";
}

function attrNumber(attrs: Record<string, unknown>, names: string[]): number | undefined {
  for (const name of names) {
    const raw = attrs[name];
    const value = Number(text(raw));
    if (Number.isFinite(value)) return value;
  }
  return undefined;
}

function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
    .slice(0, 2500);
}

function safePublicUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return undefined;
    for (const key of ["apikey", "api_key", "passkey", "rsskey", "i", "jackett_apikey"]) {
      url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function makeId(guid: string, link: string, title: string): string {
  return createHash("sha256").update(`${guid}\u0000${link}\u0000${title}`).digest("hex").slice(0, 24);
}

export class TorznabProvider implements ProviderAdapter {
  readonly id: string;
  readonly name: string;
  readonly kind = "torznab" as const;
  readonly capabilities = CAPABILITIES;

  private readonly config: TorznabConfig;
  private categoryCache: { at: number; categories: ProviderCategory[] } | null = null;

  constructor(id: string, name: string, config: TorznabConfig) {
    this.id = id;
    this.name = name;
    this.config = { ...config, baseUrl: config.baseUrl.replace(/\/$/, "") };
  }

  private buildUrl(params: Record<string, string | number | undefined>): string {
    if (!this.config.baseUrl) throw new Error("Torznab provider is missing its base URL");
    const url = new URL(this.config.baseUrl);
    if (this.config.apiKey) url.searchParams.set("apikey", this.config.apiKey);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  private async request(params: Record<string, string | number | undefined>): Promise<string> {
    const response = await fetch(this.buildUrl(params), {
      signal: AbortSignal.timeout(25_000),
      headers: { accept: "application/rss+xml, application/xml, text/xml" },
    });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(`Torznab HTTP ${response.status}: ${body.slice(0, 200)}`);
    }
    return body;
  }

  private parseItem(value: unknown): ProviderTorrent | null {
    const item = asRecord(value);
    if (!item) return null;
    const title = text(item.title).trim();
    if (!title) return null;

    const enclosure = asRecord(ensureArray(item.enclosure)[0]) ?? {};
    const links = ensureArray(item.link).map((link) => text(link)).filter(Boolean);
    const guid = text(item.guid);
    const attrs: Record<string, unknown> = {};
    for (const rawAttr of [...ensureArray(item["torznab:attr"]), ...ensureArray(item["newznab:attr"])]) {
      const record = asRecord(rawAttr);
      if (!record) continue;
      const name = text(record["@_name"]).toLowerCase();
      if (name) attrs[name] = text(record["@_value"]);
    }

    const enclosureUrl = text(enclosure["@_url"]);
    const magnetAttr = text(attrs.magneturl);
    const linkUrl = links.find((link) => /^https?:/i.test(link) || link.startsWith("magnet:"));
    const downloadCandidate = enclosureUrl || linkUrl || "";
    const magnet = magnetAttr || (downloadCandidate.startsWith("magnet:") ? downloadCandidate : undefined);
    const downloadUrl = downloadCandidate && !downloadCandidate.startsWith("magnet:") ? downloadCandidate : undefined;
    const size = parseSize(item.size) ?? parseSize(enclosure["@_length"]);
    const seeders = attrNumber(attrs, ["seeders"]) ?? 0;
    const peers = attrNumber(attrs, ["peers", "leechers"]) ?? 0;
    const leechers = Math.max(0, peers > seeders ? peers - seeders : peers);
    const publishedRaw = text(item.pubDate) || text(item.published) || text(attrs.publishdate);
    const publishedDate = publishedRaw ? new Date(publishedRaw) : null;
    const categoryRaw = ensureArray(item.category)[0];
    const category = text(categoryRaw) || text(attrs.category);
    const comments = text(item.comments);
    const sourceUrl =
      safePublicUrl(comments) ??
      (text(item.guid) && /^https?:/i.test(guid) ? safePublicUrl(guid) : undefined) ??
      undefined;
    const description = stripHtml(text(item.description));
    const sizeLabel = size ? undefined : text(item.size) || text(enclosure["@_length"]) || undefined;

    return {
      providerId: this.id,
      providerName: this.name,
      providerKind: "torznab",
      id: makeId(guid, downloadCandidate, title),
      title,
      size,
      sizeLabel,
      seeders,
      leechers,
      category: category || undefined,
      categoryLabel: category ? CATEGORY_LABELS[category] ?? category : undefined,
      publishedAt:
        publishedDate && !Number.isNaN(publishedDate.getTime()) ? publishedDate.toISOString() : undefined,
      sourceUrl,
      quality: detectResolution(title),
      downloadUrl,
      magnet: magnet || undefined,
      infoHash: text(attrs.infohash) || undefined,
      description: description || undefined,
      raw: {
        guid,
        link: linkUrl,
        attrs,
        category,
      },
    };
  }

  private parseResponse(xml: string): {
    items: ProviderTorrent[];
    total?: number;
    channelTitle?: string;
  } {
    const parsed = parser.parse(xml) as Record<string, unknown>;
    const error = asRecord(parsed.error);
    if (error) throw new Error(text(error["@_description"]) || text(error) || "Torznab returned an error");
    const rss = asRecord(parsed.rss);
    const channel = asRecord(rss?.channel) ?? asRecord(parsed.channel);
    if (!channel) throw new Error("Torznab response did not contain an RSS channel");
    const items = ensureArray(channel.item)
      .map((item) => this.parseItem(item))
      .filter((item): item is ProviderTorrent => Boolean(item));
    const responseRecord = asRecord(channel["newznab:response"]);
    const total = Number(text(responseRecord?.["@_total"]));
    return {
      items,
      total: Number.isFinite(total) ? total : undefined,
      channelTitle: text(channel.title) || undefined,
    };
  }

  async search(options: ProviderSearchOptions): Promise<ProviderSearchResult> {
    const limit = Math.min(100, Math.max(1, options.pageSize));
    const offset = Math.max(0, (options.page - 1) * limit);
    const xml = await this.request({
      t: "search",
      q: options.query,
      cat: options.category,
      limit,
      offset,
      extended: 1,
    });
    const parsed = this.parseResponse(xml);
    const totalPages = parsed.total ? Math.max(1, Math.ceil(parsed.total / limit)) : undefined;
    const hasMore = parsed.total ? offset + parsed.items.length < parsed.total : parsed.items.length >= limit;
    return { items: parsed.items, totalPages, hasMore };
  }

  async download(torrent: ProviderTorrent): Promise<ProviderDownload> {
    if (torrent.magnet) {
      return { magnet: torrent.magnet, filename: `${torrent.id}.magnet` };
    }
    if (!torrent.downloadUrl) throw new Error("Torznab result has no download URL");
    const url = new URL(torrent.downloadUrl);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("Invalid download URL");
    if (!this.config.allowExternalDownloads) {
      const base = new URL(this.config.baseUrl);
      if (url.host !== base.host) {
        throw new Error(`Refusing to download from unexpected host ${url.host}`);
      }
    }
    const response = await fetch(url, {
      signal: AbortSignal.timeout(45_000),
      redirect: "follow",
    });
    if (!response.ok) throw new Error(`Torrent download failed (${response.status})`);
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/html")) throw new Error("Indexer returned an HTML page instead of a torrent");
    const data = new Uint8Array(await response.arrayBuffer());
    if (data.byteLength === 0) throw new Error("Indexer returned an empty torrent");
    return { data, filename: `${torrent.id}.torrent` };
  }

  async categories(): Promise<ProviderCategory[]> {
    if (this.categoryCache && Date.now() - this.categoryCache.at < 60 * 60 * 1000) {
      return this.categoryCache.categories;
    }
    try {
      const xml = await this.request({ t: "caps" });
      const parsed = parser.parse(xml) as Record<string, unknown>;
      const caps = asRecord(parsed.caps);
      const categoriesRoot = asRecord(caps?.categories);
      const topLevel = ensureArray(categoriesRoot?.category);
      const categories: ProviderCategory[] = [];
      for (const raw of topLevel) {
        const group = asRecord(raw);
        if (!group) continue;
        const groupId = text(group["@_id"]);
        const groupName = text(group["@_name"]) || groupId;
        if (groupId) categories.push({ value: groupId, label: groupName, group: groupName });
        for (const rawSub of ensureArray(group.subcat)) {
          const sub = asRecord(rawSub);
          if (!sub) continue;
          const id = text(sub["@_id"]);
          const name = text(sub["@_name"]);
          if (id) {
            categories.push({
              value: id,
              label: name || CATEGORY_LABELS[id] || id,
              group: groupName,
            });
          }
        }
      }
      const result = categories.length > 0 ? categories : STANDARD_CATEGORIES;
      this.categoryCache = { at: Date.now(), categories: result };
      return result;
    } catch {
      return STANDARD_CATEGORIES;
    }
  }

  async test(): Promise<ProviderHealth> {
    const started = Date.now();
    try {
      const xml = await this.request({ t: "caps" });
      const parsed = parser.parse(xml) as Record<string, unknown>;
      const error = asRecord(parsed.error);
      if (error) throw new Error(text(error["@_description"]) || text(error) || "Torznab returned an error");
      const caps = asRecord(parsed.caps);
      if (!caps) throw new Error("Torznab capabilities response was not recognized");
      const categoriesRoot = asRecord(caps.categories);
      const count = ensureArray(categoriesRoot?.category).length;
      return {
        ok: true,
        message: count > 0 ? `Connected (${count} category groups)` : "Torznab capabilities loaded",
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
