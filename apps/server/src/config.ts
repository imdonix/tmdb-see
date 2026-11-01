import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

function env(name: string, fallback = ""): string {
  const value = process.env[name];
  return value === undefined ? fallback : value;
}

function boolEnv(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

function intEnv(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

const dataDir = path.resolve(env("DATA_DIR", path.join(process.cwd(), "data")));
mkdirSync(dataDir, { recursive: true, mode: 0o700 });

const repoRootBuild = existsSync(path.join(process.cwd(), "apps"))
  && existsSync(path.join(process.cwd(), "package.json"));
const defaultPublic = repoRootBuild
  ? path.join(process.cwd(), "apps", "server", "public")
  : path.join(process.cwd(), "public");

export const config = {
  version: env("APP_VERSION", "0.1.0"),
  host: process.env.HOST ?? "0.0.0.0",
  port: intEnv("PORT", 8080),
  dataDir,
  dbPath: path.join(dataDir, "see.db"),
  publicDir: path.resolve(env("PUBLIC_DIR", defaultPublic)),
  appSecret: env("APP_SECRET"),
  tmdb: {
    origin: "https://www.themoviedb.org",
    apiBase: env("TMDB_API_BASE", "https://api.themoviedb.org/3"),
    apiKey: env("TMDB_API_KEY"),
    language: env("TMDB_LANGUAGE", "en-US"),
  },
  ncore: {
    host: env("NCORE_HOST").replace(/\/$/, ""),
    user: env("NCORE_USER"),
    pass: env("NCORE_PASS"),
  },
  torznab: {
    name: env("TORZNAB_NAME", "Prowlarr"),
    url: env("TORZNAB_URL").replace(/\/$/, ""),
    apiKey: env("TORZNAB_API_KEY"),
  },
  qbit: {
    host: env("QBIT_HOST").replace(/\/$/, ""),
    user: env("QBIT_USER"),
    pass: env("QBIT_PASS"),
    savePath: env("QBIT_SAVE_PATH").replace(/\/$/, ""),
    organize: boolEnv("QBIT_ORGANIZE", true),
  },
  ai: {
    enabled: boolEnv("AI_ENABLED", false),
    baseUrl: env("OLLAMA_BASE_URL", "https://ollama.com").replace(/\/$/, ""),
    apiKey: env("OLLAMA_API_KEY"),
    model: env("OLLAMA_MODEL", "gpt-oss:120b"),
    verifyDownloads: boolEnv("AI_VERIFY_DOWNLOADS", false),
    verifyFollows: boolEnv("AI_VERIFY_FOLLOWS", false),
    threshold: Math.min(1, Math.max(0, Number(env("AI_THRESHOLD", "0.75")) || 0.75)),
  },
  followIntervalMinutes: intEnv("FOLLOW_INTERVAL_MINUTES", 60),
  disableScheduler: boolEnv("DISABLE_SCHEDULER", false),
  logLevel: env("LOG_LEVEL", "info"),
} as const;

export type Config = typeof config;
