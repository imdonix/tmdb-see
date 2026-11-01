import { db, nowIso } from "./index";

export function getAiCache<T>(key: string): T | null {
  const row = db.query("SELECT payload FROM ai_cache WHERE cache_key = ?").get(key) as
    | { payload: string }
    | null;
  if (!row) return null;
  try {
    return JSON.parse(row.payload) as T;
  } catch {
    return null;
  }
}

export function setAiCache(key: string, payload: unknown): void {
  db.query(
    `INSERT INTO ai_cache (cache_key, payload, created_at) VALUES (?, ?, ?)
     ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, created_at = excluded.created_at`,
  ).run(key, JSON.stringify(payload), nowIso());
}
