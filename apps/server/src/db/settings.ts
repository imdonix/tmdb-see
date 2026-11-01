import { db, nowIso } from "./index";

export function getSetting(key: string): string | null {
  const row = db.query("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | null;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  db.query(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, value, nowIso());
}

export function deleteSetting(key: string): void {
  db.query("DELETE FROM settings WHERE key = ?").run(key);
}

export function listSettings(): Array<{ key: string; value: string; updatedAt: string }> {
  const rows = db
    .query("SELECT key, value, updated_at FROM settings ORDER BY key")
    .all() as Array<{ key: string; value: string; updated_at: string }>;
  return rows.map((row) => ({ key: row.key, value: row.value, updatedAt: row.updated_at }));
}
