//! SQLite storage: schema, settings and small helpers.
use parking_lot::Mutex;
use rusqlite::{params, Connection, OptionalExtension};
use std::sync::Arc;

pub type Db = Arc<Mutex<Connection>>;

const SCHEMA: &str = r#"
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, admin_id INTEGER NOT NULL, expires INTEGER NOT NULL);

-- subscriber accounts ("lines" in IPTV panels)
CREATE TABLE IF NOT EXISTS lines (
  id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
  exp_date INTEGER, max_connections INTEGER NOT NULL DEFAULT 1, enabled INTEGER NOT NULL DEFAULT 1,
  is_trial INTEGER NOT NULL DEFAULT 0, notes TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0);

CREATE TABLE IF NOT EXISTS live_streams (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, category_id INTEGER, source_url TEXT NOT NULL,
  logo TEXT NOT NULL DEFAULT '', epg_channel_id TEXT NOT NULL DEFAULT '', sort INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1, added INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS movies (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, category_id INTEGER, path TEXT UNIQUE NOT NULL, ext TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0, year INTEGER, plot TEXT NOT NULL DEFAULT '', poster TEXT NOT NULL DEFAULT '',
  backdrop TEXT NOT NULL DEFAULT '', rating REAL NOT NULL DEFAULT 0, genre TEXT NOT NULL DEFAULT '',
  cast_list TEXT NOT NULL DEFAULT '', director TEXT NOT NULL DEFAULT '', duration_secs INTEGER NOT NULL DEFAULT 0,
  tmdb_id INTEGER, trailer TEXT NOT NULL DEFAULT '', added INTEGER NOT NULL, enabled INTEGER NOT NULL DEFAULT 1);

CREATE TABLE IF NOT EXISTS series (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, category_id INTEGER, folder TEXT UNIQUE NOT NULL, year INTEGER,
  plot TEXT NOT NULL DEFAULT '', poster TEXT NOT NULL DEFAULT '', backdrop TEXT NOT NULL DEFAULT '',
  rating REAL NOT NULL DEFAULT 0, genre TEXT NOT NULL DEFAULT '', cast_list TEXT NOT NULL DEFAULT '',
  tmdb_id INTEGER, trailer TEXT NOT NULL DEFAULT '', added INTEGER NOT NULL, updated INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1);

CREATE TABLE IF NOT EXISTS episodes (
  id INTEGER PRIMARY KEY, series_id INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  season INTEGER NOT NULL, episode INTEGER NOT NULL, title TEXT NOT NULL DEFAULT '', path TEXT UNIQUE NOT NULL,
  ext TEXT NOT NULL, plot TEXT NOT NULL DEFAULT '', still TEXT NOT NULL DEFAULT '',
  duration_secs INTEGER NOT NULL DEFAULT 0, added INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS library_folders (
  id INTEGER PRIMARY KEY, path TEXT NOT NULL, kind TEXT NOT NULL, category_id INTEGER);

CREATE TABLE IF NOT EXISTS epg_sources (
  id INTEGER PRIMARY KEY, url TEXT NOT NULL, last_import INTEGER, status TEXT NOT NULL DEFAULT '');

CREATE TABLE IF NOT EXISTS epg_programs (
  channel_id TEXT NOT NULL, start INTEGER NOT NULL, stop INTEGER NOT NULL, title TEXT NOT NULL,
  descr TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS idx_epg ON epg_programs(channel_id, start);
CREATE INDEX IF NOT EXISTS idx_ep_series ON episodes(series_id, season, episode);
"#;

/// Version 2: resellers & credits, packages, load-balancer servers, transcoding profiles, catch-up.
const SCHEMA_V2: &str = r#"
CREATE TABLE IF NOT EXISTS packages (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, months INTEGER NOT NULL DEFAULT 1, max_connections INTEGER NOT NULL DEFAULT 1,
  credits REAL NOT NULL DEFAULT 1, is_trial INTEGER NOT NULL DEFAULT 0, trial_hours INTEGER NOT NULL DEFAULT 24,
  enabled INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS credit_log (
  id INTEGER PRIMARY KEY, admin_id INTEGER NOT NULL, amount REAL NOT NULL, balance REAL NOT NULL,
  reason TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS servers (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL, secret TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
  max_clients INTEGER NOT NULL DEFAULT 500, last_seen INTEGER, active INTEGER NOT NULL DEFAULT 0, version TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS profiles (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, video TEXT NOT NULL DEFAULT 'h264', resolution TEXT NOT NULL DEFAULT '',
  video_bitrate TEXT NOT NULL DEFAULT '', preset TEXT NOT NULL DEFAULT 'veryfast', audio TEXT NOT NULL DEFAULT 'aac',
  audio_bitrate TEXT NOT NULL DEFAULT '128k', extra TEXT NOT NULL DEFAULT '');
"#;
const MIGRATIONS: &[&str] = &[
    "ALTER TABLE admins ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'",
    "ALTER TABLE admins ADD COLUMN credits REAL NOT NULL DEFAULT 0",
    "ALTER TABLE admins ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1",
    "ALTER TABLE admins ADD COLUMN notes TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE lines ADD COLUMN owner_id INTEGER",
    "ALTER TABLE lines ADD COLUMN package_id INTEGER",
    "ALTER TABLE live_streams ADD COLUMN profile_id INTEGER",
    "ALTER TABLE live_streams ADD COLUMN archive INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE live_streams ADD COLUMN archive_days INTEGER NOT NULL DEFAULT 3",
];

pub fn open(path: &std::path::Path) -> rusqlite::Result<Db> {
    let c = Connection::open(path)?;
    c.execute_batch(SCHEMA)?;
    c.execute_batch(SCHEMA_V2)?;
    for m in MIGRATIONS {
        let _ = c.execute(m, []); // "duplicate column" when already applied
    }
    Ok(Arc::new(Mutex::new(c)))
}

pub fn now() -> i64 {
    chrono::Utc::now().timestamp()
}

pub fn setting(c: &Connection, key: &str, default: &str) -> String {
    c.query_row("SELECT value FROM settings WHERE key=?1", [key], |r| r.get(0))
        .optional()
        .ok()
        .flatten()
        .unwrap_or_else(|| default.to_string())
}

pub fn set_setting(c: &Connection, key: &str, value: &str) -> rusqlite::Result<()> {
    c.execute(
        "INSERT INTO settings(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        params![key, value],
    )?;
    Ok(())
}

/// Find or create a category by name for a kind (live / movie / series).
pub fn category_id(c: &Connection, kind: &str, name: &str) -> rusqlite::Result<i64> {
    if let Some(id) = c
        .query_row("SELECT id FROM categories WHERE kind=?1 AND name=?2", params![kind, name], |r| r.get(0))
        .optional()?
    {
        return Ok(id);
    }
    c.execute("INSERT INTO categories(kind,name) VALUES(?1,?2)", params![kind, name])?;
    Ok(c.last_insert_rowid())
}
