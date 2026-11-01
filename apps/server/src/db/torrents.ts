import { decryptSecret, encryptSecret } from "../lib/crypto";
import { db, nowIso } from "./index";

export function cacheTorrent(providerId: string, torrentId: string, payload: unknown): void {
  const encrypted = encryptSecret(JSON.stringify(payload))!;
  db.query(
    `INSERT INTO torrent_cache (provider_id, torrent_id, payload, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(provider_id, torrent_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
  ).run(providerId, torrentId, encrypted, nowIso());
}

export function getCachedTorrent<T>(providerId: string, torrentId: string): T | null {
  const row = db
    .query("SELECT payload FROM torrent_cache WHERE provider_id = ? AND torrent_id = ?")
    .get(providerId, torrentId) as { payload: string } | null;
  if (!row) return null;
  try {
    return JSON.parse(decryptSecret(row.payload)) as T;
  } catch {
    return null;
  }
}
