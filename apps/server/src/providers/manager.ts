import type {
  ProviderAdminView,
  ProviderCategory,
  ProviderHealth,
  ProviderKind,
  ProviderSummary,
  ProviderWrite,
} from "@tmdb-see/shared";
import { config } from "../config";
import { getSetting, setSetting } from "../db/settings";
import {
  deleteProviderRow,
  getProviderRow,
  insertProviderRow,
  listProviderRows,
  updateProviderRow,
  type ProviderRow,
} from "../db/providers";
import { decryptJson, encryptJson } from "../lib/crypto";
import { logger } from "../lib/logger";
import { NcoreProvider, type NcoreConfig } from "./ncore";
import { TorznabProvider, type TorznabConfig } from "./torznab";
import type { ProviderAdapter } from "./types";

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "provider"
  );
}

function validateBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Provider base URL is not a valid URL");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Provider base URL must use http or https");
  }
  return url.toString().replace(/\/$/, "");
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

class ProviderManager {
  private adapters = new Map<string, ProviderAdapter>();
  private health = new Map<string, { at: number; value: ProviderHealth }>();
  private categories = new Map<string, { at: number; value: ProviderCategory[] }>();

  seed(): void {
    if (!getSetting("bootstrap.ncore") && config.ncore.host && config.ncore.user && config.ncore.pass) {
      if (!getProviderRow("ncore")) {
        insertProviderRow({
          id: "ncore",
          kind: "ncore",
          name: "nCore",
          enabled: 1,
          priority: 10,
          config: encryptJson({
            baseUrl: config.ncore.host,
            username: config.ncore.user,
            password: config.ncore.pass,
          }),
        });
        logger.info("Seeded nCore provider from environment");
      }
      setSetting("bootstrap.ncore", "1");
    }

    if (!getSetting("bootstrap.torznab") && config.torznab.url) {
      if (!listProviderRows().some((row) => row.kind === "torznab")) {
        insertProviderRow({
          id: "torznab",
          kind: "torznab",
          name: config.torznab.name || "Torznab",
          enabled: 1,
          priority: 50,
          config: encryptJson({
            baseUrl: config.torznab.url,
            apiKey: config.torznab.apiKey,
          }),
        });
        logger.info("Seeded Torznab provider from environment");
      }
      setSetting("bootstrap.torznab", "1");
    }
  }

  private decryptConfig<T>(row: ProviderRow): T {
    try {
      return decryptJson<T>(row.config);
    } catch (error) {
      throw new Error(
        `Unable to decrypt provider ${row.name}. Was APP_SECRET changed? ${error instanceof Error ? error.message : ""}`,
      );
    }
  }

  private buildAdapter(row: ProviderRow): ProviderAdapter {
    if (row.kind === "ncore") {
      return new NcoreProvider(row.id, row.name, this.decryptConfig<NcoreConfig>(row));
    }
    if (row.kind === "torznab") {
      return new TorznabProvider(row.id, row.name, this.decryptConfig<TorznabConfig>(row));
    }
    throw new Error(`Unsupported provider kind: ${row.kind}`);
  }

  getAdapter(id: string): ProviderAdapter | null {
    const cached = this.adapters.get(id);
    if (cached) return cached;
    const row = getProviderRow(id);
    if (!row) return null;
    try {
      const adapter = this.buildAdapter(row);
      this.adapters.set(id, adapter);
      return adapter;
    } catch (error) {
      logger.error("Failed to initialize provider", { id, error: String(error) });
      return null;
    }
  }

  getEnabledAdapters(): ProviderAdapter[] {
    const result: ProviderAdapter[] = [];
    for (const row of listProviderRows(false)) {
      const adapter = this.getAdapter(row.id);
      if (adapter) result.push(adapter);
    }
    return result;
  }

  priorityFor(id: string): number {
    return getProviderRow(id)?.priority ?? 100;
  }

  invalidate(id?: string): void {
    if (id) {
      this.adapters.delete(id);
      this.health.delete(id);
      this.categories.delete(id);
    } else {
      this.adapters.clear();
      this.health.clear();
      this.categories.clear();
    }
  }

  private async categoriesFor(adapter: ProviderAdapter): Promise<ProviderCategory[]> {
    const cached = this.categories.get(adapter.id);
    if (cached && Date.now() - cached.at < 30 * 60 * 1000) return cached.value;
    try {
      const value = await adapter.categories();
      this.categories.set(adapter.id, { at: Date.now(), value });
      return value;
    } catch {
      return [];
    }
  }

  private toSummary(row: ProviderRow, adapter: ProviderAdapter | null, categories: ProviderCategory[]): ProviderSummary {
    return {
      id: row.id,
      name: row.name,
      kind: row.kind,
      enabled: Boolean(row.enabled),
      priority: row.priority,
      capabilities: adapter?.capabilities ?? {
        browse: false,
        details: false,
        download: false,
        activity: false,
        recommended: false,
        categories: false,
      },
      categories,
      health: this.health.get(row.id)?.value ?? null,
    };
  }

  async listPublic(): Promise<ProviderSummary[]> {
    const rows = listProviderRows(false);
    return Promise.all(
      rows.map(async (row) => {
        const adapter = this.getAdapter(row.id);
        return this.toSummary(row, adapter, adapter ? await this.categoriesFor(adapter) : []);
      }),
    );
  }

  async listAdmin(): Promise<ProviderAdminView[]> {
    const rows = listProviderRows(true);
    return Promise.all(
      rows.map(async (row) => {
        const adapter = this.getAdapter(row.id);
        const summary = this.toSummary(row, adapter, adapter ? await this.categoriesFor(adapter) : []);
        return { ...summary, config: this.sanitizedConfig(row) };
      }),
    );
  }

  private sanitizedConfig(row: ProviderRow): Record<string, unknown> {
    try {
      if (row.kind === "ncore") {
        const value = this.decryptConfig<NcoreConfig>(row);
        return {
          baseUrl: value.baseUrl ?? "",
          username: value.username ?? "",
          hasPassword: Boolean(value.password),
        };
      }
      const value = this.decryptConfig<TorznabConfig>(row);
      return {
        baseUrl: value.baseUrl ?? "",
        hasApiKey: Boolean(value.apiKey),
        allowExternalDownloads: Boolean(value.allowExternalDownloads),
      };
    } catch {
      return { error: "Unable to decrypt provider config" };
    }
  }

  async test(id: string): Promise<ProviderHealth> {
    const adapter = this.getAdapter(id);
    if (!adapter) throw new Error("Provider not found");
    const health = await adapter.test();
    this.health.set(id, { at: Date.now(), value: health });
    return health;
  }

  async healthIfFresh(id: string, maxAgeMs = 60_000): Promise<ProviderHealth | null> {
    const cached = this.health.get(id);
    if (cached && Date.now() - cached.at < maxAgeMs) return cached.value;
    return null;
  }

  async checkAllHealth(): Promise<Map<string, ProviderHealth>> {
    const adapters = this.getEnabledAdapters();
    const results = await Promise.allSettled(
      adapters.map(async (adapter) => {
        const health = await adapter.test();
        this.health.set(adapter.id, { at: Date.now(), value: health });
        return [adapter.id, health] as const;
      }),
    );
    const map = new Map<string, ProviderHealth>();
    for (const result of results) {
      if (result.status === "fulfilled") map.set(result.value[0], result.value[1]);
      else logger.warn("Provider health check failed", { error: String(result.reason) });
    }
    return map;
  }

  private mergeConfig(
    kind: ProviderKind,
    existing: Record<string, unknown> | null,
    incoming: Record<string, unknown>,
  ): Record<string, unknown> {
    if (kind === "ncore") {
      const baseUrl = validateBaseUrl(asString(incoming.baseUrl, asString(existing?.baseUrl)));
      const username = asString(incoming.username, asString(existing?.username)).trim();
      const password =
        asString(incoming.password) !== ""
          ? asString(incoming.password)
          : asString(existing?.password);
      if (!username) throw new Error("nCore username is required");
      if (!password) throw new Error("nCore password is required");
      return { baseUrl, username, password };
    }
    if (kind === "torznab") {
      const baseUrl = validateBaseUrl(asString(incoming.baseUrl, asString(existing?.baseUrl)));
      const apiKey = asString(incoming.apiKey) !== "" ? asString(incoming.apiKey) : asString(existing?.apiKey);
      return {
        baseUrl,
        apiKey,
        allowExternalDownloads: asBoolean(incoming.allowExternalDownloads, asBoolean(existing?.allowExternalDownloads)),
      };
    }
    throw new Error(`Unsupported provider kind: ${kind}`);
  }

  async create(input: ProviderWrite): Promise<ProviderAdminView> {
    if (!["ncore", "torznab"].includes(input.kind)) throw new Error("Unsupported provider kind");
    if (!input.name.trim()) throw new Error("Provider name is required");
    let id = slugify(input.id || input.name);
    const existingIds = new Set(listProviderRows(true).map((row) => row.id));
    if (existingIds.has(id)) {
      let suffix = 2;
      while (existingIds.has(`${id}-${suffix}`)) suffix += 1;
      id = `${id}-${suffix}`;
    }
    const merged = this.mergeConfig(input.kind, null, input.config);
    const row = insertProviderRow({
      id,
      kind: input.kind,
      name: input.name.trim(),
      enabled: input.enabled === false ? 0 : 1,
      priority: Math.max(0, Math.round(input.priority ?? 100)),
      config: encryptJson(merged),
    });
    this.invalidate(id);
    logger.info("Provider created", { id: row.id, kind: row.kind });
    return (await this.listAdmin()).find((provider) => provider.id === id)!;
  }

  async update(id: string, input: Partial<ProviderWrite>): Promise<ProviderAdminView> {
    const row = getProviderRow(id);
    if (!row) throw new Error("Provider not found");
    if (input.kind && input.kind !== row.kind) {
      throw new Error("A provider's kind cannot be changed. Create a new provider instead.");
    }
    const existingConfig = this.decryptConfig<Record<string, unknown>>(row);
    const kind = row.kind;
    const mergedConfig = this.mergeConfig(kind, existingConfig, input.config ?? {});
    const updated = updateProviderRow(id, {
      kind,
      name: input.name?.trim() || row.name,
      enabled: input.enabled === undefined ? row.enabled : input.enabled ? 1 : 0,
      priority: Math.max(0, Math.round(input.priority ?? row.priority)),
      config: encryptJson(mergedConfig),
    });
    if (!updated) throw new Error("Provider not found");
    this.invalidate(id);
    logger.info("Provider updated", { id, kind });
    return (await this.listAdmin()).find((provider) => provider.id === id)!;
  }

  async remove(id: string): Promise<void> {
    const row = getProviderRow(id);
    if (!row) throw new Error("Provider not found");
    deleteProviderRow(id);
    this.invalidate(id);
    logger.info("Provider deleted", { id });
  }
}

export const providerManager = new ProviderManager();
