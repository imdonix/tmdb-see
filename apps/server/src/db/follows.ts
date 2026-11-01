import type { FollowCounts, FollowItemStatus, FollowStatus, SeriesQuality } from "@tmdb-see/shared";
import { db, nowIso } from "./index";

export interface FollowRow {
  id: number;
  tmdb_id: number;
  name: string;
  year: string | null;
  quality: SeriesQuality;
  search_pattern: string;
  status: FollowStatus;
  poster_path: string | null;
  skipped_seasons: string;
  last_check_at: string | null;
  last_error: string | null;
  created_at: string;
  wanted_count?: number;
  found_count?: number;
  completed_count?: number;
  total_count?: number;
}

export interface FollowItemRow {
  id: number;
  follow_id: number;
  season: number;
  episode: number;
  status: FollowItemStatus;
  provider_id: string | null;
  torrent_id: string | null;
  torrent_title: string | null;
  qbit_hash: string | null;
  covered_by: number | null;
  ai_json: string | null;
  updated_at: string;
  created_at: string;
}

const followSelect = `
SELECT f.*,
  COALESCE((SELECT COUNT(*) FROM follow_items i WHERE i.follow_id = f.id AND i.episode > 0 AND i.status IN ('wanted','cannot_find','failed','missing')), 0) AS wanted_count,
  COALESCE((SELECT COUNT(*) FROM follow_items i WHERE i.follow_id = f.id AND i.status IN ('found','downloading')), 0) AS found_count,
  COALESCE((SELECT COUNT(*) FROM follow_items i WHERE i.follow_id = f.id AND i.status IN ('completed','skipped')), 0) AS completed_count,
  COALESCE((SELECT COUNT(*) FROM follow_items i WHERE i.follow_id = f.id), 0) AS total_count
FROM follows f
`;

export function listFollowRows(): FollowRow[] {
  return db.query(`${followSelect} ORDER BY f.created_at DESC`).all() as FollowRow[];
}

export function listActiveFollowRows(): FollowRow[] {
  return db.query(`${followSelect} WHERE f.status = 'active' ORDER BY f.created_at DESC`).all() as FollowRow[];
}

export function getFollowRow(id: number): FollowRow | null {
  return (db.query(`${followSelect} WHERE f.id = ?`).get(id) as FollowRow | null) ?? null;
}

export function getFollowRowByTmdb(tmdbId: number): FollowRow | null {
  return (db.query(`${followSelect} WHERE f.tmdb_id = ?`).get(tmdbId) as FollowRow | null) ?? null;
}

export function insertFollow(row: {
  tmdbId: number;
  name: string;
  year: string;
  quality: SeriesQuality;
  searchPattern: string;
  status: FollowStatus;
  posterPath: string;
  skippedSeasons: number[];
}): FollowRow {
  const result = db
    .query(
      `INSERT INTO follows (tmdb_id, name, year, quality, search_pattern, status, poster_path, skipped_seasons, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.tmdbId,
      row.name,
      row.year,
      row.quality,
      row.searchPattern,
      row.status,
      row.posterPath,
      JSON.stringify(row.skippedSeasons),
      nowIso(),
    );
  return getFollowRow(Number(result.lastInsertRowid))!;
}

export function updateFollowRow(
  id: number,
  patch: Partial<
    Pick<FollowRow, "name" | "year" | "quality" | "search_pattern" | "status" | "poster_path" | "skipped_seasons" | "last_check_at" | "last_error">
  >,
): FollowRow | null {
  const existing = getFollowRow(id);
  if (!existing) return null;
  const next = { ...existing, ...patch };
  db.query(
    `UPDATE follows SET name = ?, year = ?, quality = ?, search_pattern = ?, status = ?, poster_path = ?, skipped_seasons = ?, last_check_at = ?, last_error = ? WHERE id = ?`,
  ).run(
    next.name,
    next.year,
    next.quality,
    next.search_pattern,
    next.status,
    next.poster_path,
    next.skipped_seasons,
    next.last_check_at,
    next.last_error,
    id,
  );
  return getFollowRow(id);
}

export function deleteFollowRow(id: number): void {
  db.transaction(() => {
    db.query("DELETE FROM follow_items WHERE follow_id = ?").run(id);
    db.query("DELETE FROM follows WHERE id = ?").run(id);
  })();
}

export function listFollowItemRows(followId: number): FollowItemRow[] {
  return db
    .query("SELECT * FROM follow_items WHERE follow_id = ? ORDER BY season ASC, episode ASC")
    .all(followId) as FollowItemRow[];
}

export function getFollowItemRow(followId: number, season: number, episode: number): FollowItemRow | null {
  return (
    (db
      .query("SELECT * FROM follow_items WHERE follow_id = ? AND season = ? AND episode = ?")
      .get(followId, season, episode) as FollowItemRow | null) ?? null
  );
}

export function getFollowItemRowById(id: number): FollowItemRow | null {
  return (db.query("SELECT * FROM follow_items WHERE id = ?").get(id) as FollowItemRow | null) ?? null;
}

export function upsertFollowItemRow(row: {
  followId: number;
  season: number;
  episode: number;
  status: FollowItemStatus;
  providerId?: string | null;
  torrentId?: string | null;
  torrentTitle?: string | null;
  qbitHash?: string | null;
  coveredBy?: number | null;
  aiJson?: string | null;
}): FollowItemRow {
  const timestamp = nowIso();
  db.query(
    `INSERT INTO follow_items
      (follow_id, season, episode, status, provider_id, torrent_id, torrent_title, qbit_hash, covered_by, ai_json, updated_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(follow_id, season, episode) DO UPDATE SET
       status = excluded.status,
       provider_id = excluded.provider_id,
       torrent_id = excluded.torrent_id,
       torrent_title = excluded.torrent_title,
       qbit_hash = excluded.qbit_hash,
       covered_by = excluded.covered_by,
       ai_json = excluded.ai_json,
       updated_at = excluded.updated_at`,
  ).run(
    row.followId,
    row.season,
    row.episode,
    row.status,
    row.providerId ?? null,
    row.torrentId ?? null,
    row.torrentTitle ?? null,
    row.qbitHash ?? null,
    row.coveredBy ?? null,
    row.aiJson ?? null,
    timestamp,
    timestamp,
  );
  return getFollowItemRow(row.followId, row.season, row.episode)!;
}

export function ensureWantedEpisodeRows(followId: number, season: number, episodeCount: number): void {
  const timestamp = nowIso();
  const statement = db.query(
    `INSERT OR IGNORE INTO follow_items (follow_id, season, episode, status, updated_at, created_at)
     VALUES (?, ?, ?, 'wanted', ?, ?)`,
  );
  db.transaction(() => {
    for (let episode = 1; episode <= episodeCount; episode += 1) {
      statement.run(followId, season, episode, timestamp, timestamp);
    }
  })();
}

export function markSeasonSkipped(followId: number, season: number, episodeCount: number): void {
  const timestamp = nowIso();
  db.transaction(() => {
    db.query(
      `INSERT INTO follow_items (follow_id, season, episode, status, updated_at, created_at)
       VALUES (?, ?, 0, 'skipped', ?, ?)
       ON CONFLICT(follow_id, season, episode) DO UPDATE SET status = 'skipped', updated_at = excluded.updated_at`,
    ).run(followId, season, timestamp, timestamp);
    for (let episode = 1; episode <= episodeCount; episode += 1) {
      db.query(
        `INSERT INTO follow_items (follow_id, season, episode, status, updated_at, created_at)
         VALUES (?, ?, ?, 'skipped', ?, ?)
         ON CONFLICT(follow_id, season, episode) DO UPDATE SET
           status = 'skipped',
           updated_at = excluded.updated_at
         WHERE follow_items.status NOT IN ('downloading','found','completed')
            OR (COALESCE(follow_items.torrent_id, '') = '' AND COALESCE(follow_items.qbit_hash, '') = '' AND COALESCE(follow_items.covered_by, 0) = 0)`,
      ).run(followId, season, episode, timestamp, timestamp);
    }
  })();
}

export function unskipSeason(followId: number, season: number): void {
  const timestamp = nowIso();
  db.transaction(() => {
    db.query(
      "DELETE FROM follow_items WHERE follow_id = ? AND season = ? AND episode = 0 AND status = 'skipped'",
    ).run(followId, season);
    db.query(
      "UPDATE follow_items SET status = 'wanted', updated_at = ? WHERE follow_id = ? AND season = ? AND status = 'skipped' AND episode > 0",
    ).run(timestamp, followId, season);
  })();
}

export function markEpisodesCoveredBy(followId: number, season: number, packItemId: number): void {
  const timestamp = nowIso();
  db.query(
    `UPDATE follow_items SET status = 'completed', covered_by = ?, provider_id = NULL, torrent_id = NULL, torrent_title = NULL, qbit_hash = NULL, updated_at = ?
     WHERE follow_id = ? AND season = ? AND episode > 0`,
  ).run(packItemId, timestamp, followId, season);
}

export function updateFollowItemProgress(patch: {
  id: number;
  status?: FollowItemStatus;
  qbitHash?: string | null;
}): void {
  const existing = getFollowItemRowById(patch.id);
  if (!existing) return;
  db.query("UPDATE follow_items SET status = ?, qbit_hash = ?, updated_at = ? WHERE id = ?").run(
    patch.status ?? existing.status,
    patch.qbitHash === undefined ? existing.qbit_hash : patch.qbitHash,
    nowIso(),
    patch.id,
  );
}

export function markFollowCheck(followId: number, lastError: string | null): void {
  db.query("UPDATE follows SET last_check_at = ?, last_error = ? WHERE id = ?").run(
    nowIso(),
    lastError,
    followId,
  );
}

export function followCounts(row: FollowRow): FollowCounts {
  return {
    wanted: row.wanted_count ?? 0,
    found: row.found_count ?? 0,
    completed: row.completed_count ?? 0,
    total: row.total_count ?? 0,
  };
}
