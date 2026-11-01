import { chmodSync } from "node:fs";
import { Database } from "bun:sqlite";
import { config } from "../config";
import { SCHEMA_SQL, SCHEMA_VERSION } from "./schema";

const database = new Database(config.dbPath, { create: true, strict: true });
try {
  chmodSync(config.dbPath, 0o600);
} catch {
  // Best effort; some volume drivers do not support chmod.
}

database.exec("PRAGMA journal_mode = WAL;");
database.exec("PRAGMA synchronous = NORMAL;");
database.exec("PRAGMA foreign_keys = ON;");
database.exec("PRAGMA busy_timeout = 5000;");
database.exec(SCHEMA_SQL);

const version = database.query("PRAGMA user_version").get() as { user_version?: number } | null;
if (!version?.user_version) {
  database.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);
}

database
  .query("DELETE FROM events WHERE created_at < ?")
  .run(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
database
  .query("DELETE FROM torrent_cache WHERE updated_at < ?")
  .run(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
database
  .query("DELETE FROM ai_cache WHERE created_at < ?")
  .run(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

export const db = database;

export function closeDatabase(): void {
  database.close();
}

export function nowIso(): string {
  return new Date().toISOString();
}
