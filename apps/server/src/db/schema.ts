export const SCHEMA_VERSION = 1;

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 100,
  config TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS torrent_cache (
  provider_id TEXT NOT NULL,
  torrent_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (provider_id, torrent_id)
);

CREATE TABLE IF NOT EXISTS movie_downloads (
  tmdb_id INTEGER PRIMARY KEY,
  provider_id TEXT NOT NULL,
  torrent_id TEXT NOT NULL,
  torrent_title TEXT NOT NULL,
  quality TEXT NOT NULL,
  qbit_hash TEXT,
  status TEXT NOT NULL DEFAULT 'downloading',
  ai_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS follows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tmdb_id INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  year TEXT,
  quality TEXT NOT NULL DEFAULT '1080p',
  search_pattern TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  poster_path TEXT,
  skipped_seasons TEXT NOT NULL DEFAULT '[]',
  last_check_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS follow_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  follow_id INTEGER NOT NULL REFERENCES follows(id) ON DELETE CASCADE,
  season INTEGER NOT NULL,
  episode INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'wanted',
  provider_id TEXT,
  torrent_id TEXT,
  torrent_title TEXT,
  qbit_hash TEXT,
  covered_by INTEGER,
  ai_json TEXT,
  updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(follow_id, season, episode)
);

CREATE INDEX IF NOT EXISTS idx_follow_items_follow ON follow_items(follow_id);
CREATE INDEX IF NOT EXISTS idx_follow_items_status ON follow_items(follow_id, status);

CREATE TABLE IF NOT EXISTS ai_cache (
  cache_key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  level TEXT NOT NULL DEFAULT 'info',
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  meta TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_torrent_cache_updated ON torrent_cache(updated_at DESC);
`;
