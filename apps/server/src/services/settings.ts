import type { AppSettings, SeriesQuality, SettingsUpdate } from "@tmdb-see/shared";
import { config } from "../config";
import { decryptSecret, encryptSecret } from "../lib/crypto";
import { getSetting, setSetting } from "../db/settings";

const KEYS = {
  tmdbApiKey: "tmdb.apiKey",
  tmdbLanguage: "tmdb.language",
  qbitHost: "qbit.host",
  qbitUsername: "qbit.username",
  qbitPassword: "qbit.password",
  qbitSavePath: "qbit.savePath",
  qbitOrganize: "qbit.organize",
  aiEnabled: "ai.enabled",
  aiBaseUrl: "ai.baseUrl",
  aiApiKey: "ai.apiKey",
  aiModel: "ai.model",
  aiVerifyDownloads: "ai.verifyDownloads",
  aiVerifyFollows: "ai.verifyFollows",
  aiThreshold: "ai.threshold",
  followInterval: "app.followIntervalMinutes",
  defaultQuality: "app.defaultQuality",
  searchPageSize: "app.searchPageSize",
} as const;

function seed(key: string, value: string): void {
  if (getSetting(key) === null) setSetting(key, value);
}

function bool(value: boolean): string {
  return value ? "1" : "0";
}

function parseBool(value: string | null, fallback: boolean): boolean {
  if (value === null) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function seedSettings(): void {
  seed(KEYS.tmdbLanguage, config.tmdb.language || "en-US");
  if (config.tmdb.apiKey) seed(KEYS.tmdbApiKey, encryptSecret(config.tmdb.apiKey)!);

  seed(KEYS.qbitHost, config.qbit.host);
  seed(KEYS.qbitUsername, config.qbit.user);
  if (config.qbit.pass) seed(KEYS.qbitPassword, encryptSecret(config.qbit.pass)!);
  seed(KEYS.qbitSavePath, config.qbit.savePath);
  seed(KEYS.qbitOrganize, bool(config.qbit.organize));

  seed(KEYS.aiEnabled, bool(config.ai.enabled));
  seed(KEYS.aiBaseUrl, config.ai.baseUrl);
  if (config.ai.apiKey) seed(KEYS.aiApiKey, encryptSecret(config.ai.apiKey)!);
  seed(KEYS.aiModel, config.ai.model);
  seed(KEYS.aiVerifyDownloads, bool(config.ai.verifyDownloads));
  seed(KEYS.aiVerifyFollows, bool(config.ai.verifyFollows));
  seed(KEYS.aiThreshold, String(config.ai.threshold));

  seed(KEYS.followInterval, String(config.followIntervalMinutes));
  seed(KEYS.defaultQuality, "1080p");
  seed(KEYS.searchPageSize, "40");
}

export interface PrivateSettings {
  tmdb: { apiKey: string; language: string };
  qbit: { host: string; username: string; password: string; savePath: string; organize: boolean };
  ai: {
    enabled: boolean;
    baseUrl: string;
    apiKey: string;
    model: string;
    verifyDownloads: boolean;
    verifyFollows: boolean;
    threshold: number;
  };
  app: { followIntervalMinutes: number; defaultQuality: SeriesQuality; searchPageSize: number };
}

export function getPrivateSettings(): PrivateSettings {
  return {
    tmdb: {
      apiKey: decryptSecret(getSetting(KEYS.tmdbApiKey)),
      language: getSetting(KEYS.tmdbLanguage) ?? config.tmdb.language,
    },
    qbit: {
      host: getSetting(KEYS.qbitHost) ?? config.qbit.host,
      username: getSetting(KEYS.qbitUsername) ?? config.qbit.user,
      password: decryptSecret(getSetting(KEYS.qbitPassword)),
      savePath: getSetting(KEYS.qbitSavePath) ?? config.qbit.savePath,
      organize: parseBool(getSetting(KEYS.qbitOrganize), config.qbit.organize),
    },
    ai: {
      enabled: parseBool(getSetting(KEYS.aiEnabled), config.ai.enabled),
      baseUrl: getSetting(KEYS.aiBaseUrl) ?? config.ai.baseUrl,
      apiKey: decryptSecret(getSetting(KEYS.aiApiKey)),
      model: getSetting(KEYS.aiModel) ?? config.ai.model,
      verifyDownloads: parseBool(getSetting(KEYS.aiVerifyDownloads), config.ai.verifyDownloads),
      verifyFollows: parseBool(getSetting(KEYS.aiVerifyFollows), config.ai.verifyFollows),
      threshold: Number(getSetting(KEYS.aiThreshold) ?? config.ai.threshold) || 0.75,
    },
    app: {
      followIntervalMinutes: Number(getSetting(KEYS.followInterval) ?? config.followIntervalMinutes) || 60,
      defaultQuality: (getSetting(KEYS.defaultQuality) as SeriesQuality | null) ?? "1080p",
      searchPageSize: Number(getSetting(KEYS.searchPageSize) ?? 40) || 40,
    },
  };
}

export function getPublicSettings(): AppSettings {
  const settings = getPrivateSettings();
  return {
    tmdb: {
      language: settings.tmdb.language,
      hasApiKey: Boolean(settings.tmdb.apiKey),
    },
    qbit: {
      host: settings.qbit.host,
      username: settings.qbit.username,
      hasPassword: Boolean(settings.qbit.password),
      savePath: settings.qbit.savePath,
      organize: settings.qbit.organize,
    },
    ai: {
      enabled: settings.ai.enabled,
      baseUrl: settings.ai.baseUrl,
      model: settings.ai.model,
      verifyDownloads: settings.ai.verifyDownloads,
      verifyFollows: settings.ai.verifyFollows,
      threshold: settings.ai.threshold,
      hasApiKey: Boolean(settings.ai.apiKey),
    },
    app: {
      followIntervalMinutes: settings.app.followIntervalMinutes,
      defaultQuality: settings.app.defaultQuality,
      searchPageSize: settings.app.searchPageSize,
    },
  };
}

export function updateSettings(input: SettingsUpdate): AppSettings {
  if (input.tmdb) {
    if (input.tmdb.apiKey !== undefined && input.tmdb.apiKey.trim() !== "") {
      setSetting(KEYS.tmdbApiKey, encryptSecret(input.tmdb.apiKey.trim())!);
    }
    if (input.tmdb.language !== undefined && input.tmdb.language.trim() !== "") {
      setSetting(KEYS.tmdbLanguage, input.tmdb.language.trim());
    }
  }

  if (input.qbit) {
    if (input.qbit.host !== undefined) setSetting(KEYS.qbitHost, input.qbit.host.trim().replace(/\/$/, ""));
    if (input.qbit.username !== undefined) setSetting(KEYS.qbitUsername, input.qbit.username.trim());
    if (input.qbit.password !== undefined && input.qbit.password !== "") {
      setSetting(KEYS.qbitPassword, encryptSecret(input.qbit.password)!);
    }
    if (input.qbit.savePath !== undefined) {
      setSetting(KEYS.qbitSavePath, input.qbit.savePath.trim().replace(/\/$/, ""));
    }
    if (input.qbit.organize !== undefined) setSetting(KEYS.qbitOrganize, bool(input.qbit.organize));
  }

  if (input.ai) {
    if (input.ai.enabled !== undefined) setSetting(KEYS.aiEnabled, bool(input.ai.enabled));
    if (input.ai.baseUrl !== undefined) setSetting(KEYS.aiBaseUrl, input.ai.baseUrl.trim().replace(/\/$/, ""));
    if (input.ai.apiKey !== undefined && input.ai.apiKey.trim() !== "") {
      setSetting(KEYS.aiApiKey, encryptSecret(input.ai.apiKey.trim())!);
    }
    if (input.ai.model !== undefined) setSetting(KEYS.aiModel, input.ai.model.trim());
    if (input.ai.verifyDownloads !== undefined) setSetting(KEYS.aiVerifyDownloads, bool(input.ai.verifyDownloads));
    if (input.ai.verifyFollows !== undefined) setSetting(KEYS.aiVerifyFollows, bool(input.ai.verifyFollows));
    if (input.ai.threshold !== undefined) {
      const threshold = Math.min(1, Math.max(0, input.ai.threshold));
      setSetting(KEYS.aiThreshold, String(threshold));
    }
  }

  if (input.app) {
    if (input.app.followIntervalMinutes !== undefined) {
      const interval = Math.min(1440, Math.max(5, Math.round(input.app.followIntervalMinutes)));
      setSetting(KEYS.followInterval, String(interval));
    }
    if (input.app.defaultQuality !== undefined) {
      if (["2160p", "1080p", "720p"].includes(input.app.defaultQuality)) {
        setSetting(KEYS.defaultQuality, input.app.defaultQuality);
      }
    }
    if (input.app.searchPageSize !== undefined) {
      const size = Math.min(100, Math.max(10, Math.round(input.app.searchPageSize)));
      setSetting(KEYS.searchPageSize, String(size));
    }
  }

  return getPublicSettings();
}
