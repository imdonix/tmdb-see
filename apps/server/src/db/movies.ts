import { db, nowIso } from "./index";

export interface MovieDownloadRow {
  tmdb_id: number;
  provider_id: string;
  torrent_id: string;
  torrent_title: string;
  quality: string;
  qbit_hash: string | null;
  status: string;
  ai_json: string | null;
  created_at: string;
  updated_at: string;
}

export function getMovieDownloadRow(tmdbId: number): MovieDownloadRow | null {
  return (
    (db.query("SELECT * FROM movie_downloads WHERE tmdb_id = ?").get(tmdbId) as MovieDownloadRow | null) ??
    null
  );
}

export function listMovieDownloadRows(): MovieDownloadRow[] {
  return db.query("SELECT * FROM movie_downloads").all() as MovieDownloadRow[];
}

export function upsertMovieDownload(row: {
  tmdbId: number;
  providerId: string;
  torrentId: string;
  torrentTitle: string;
  quality: string;
  qbitHash?: string | null;
  status: string;
  aiJson?: string | null;
}): MovieDownloadRow {
  db.query(
    `INSERT INTO movie_downloads
      (tmdb_id, provider_id, torrent_id, torrent_title, quality, qbit_hash, status, ai_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tmdb_id) DO UPDATE SET
       provider_id = excluded.provider_id,
       torrent_id = excluded.torrent_id,
       torrent_title = excluded.torrent_title,
       quality = excluded.quality,
       qbit_hash = excluded.qbit_hash,
       status = excluded.status,
       ai_json = excluded.ai_json,
       updated_at = excluded.updated_at`,
  ).run(
    row.tmdbId,
    row.providerId,
    row.torrentId,
    row.torrentTitle,
    row.quality,
    row.qbitHash ?? null,
    row.status,
    row.aiJson ?? null,
    nowIso(),
    nowIso(),
  );
  return getMovieDownloadRow(row.tmdbId)!;
}

export function updateMovieDownload(
  tmdbId: number,
  patch: Partial<Pick<MovieDownloadRow, "qbit_hash" | "status" | "ai_json">>,
): void {
  const existing = getMovieDownloadRow(tmdbId);
  if (!existing) return;
  db.query(
    `UPDATE movie_downloads SET qbit_hash = ?, status = ?, ai_json = ?, updated_at = ? WHERE tmdb_id = ?`,
  ).run(
    patch.qbit_hash === undefined ? existing.qbit_hash : patch.qbit_hash,
    patch.status === undefined ? existing.status : patch.status,
    patch.ai_json === undefined ? existing.ai_json : patch.ai_json,
    nowIso(),
    tmdbId,
  );
}
