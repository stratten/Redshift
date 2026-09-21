// src/main/services/Database.js
// Opens the SQLite database and ensures required schema exists

const sqlite3 = require('sqlite3').verbose();

function run(db, sql) {
  return new Promise((resolve, reject) => {
    db.run(sql, function(err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

async function initializeDatabase(dbPath) {
  const db = await new Promise((resolve, reject) => {
    const instance = new sqlite3.Database(dbPath, (err) => {
      if (err) return reject(err);
      resolve(instance);
    });
  });

  // Serialize and create schema (idempotent)
  await run(db, `
    CREATE TABLE IF NOT EXISTS transferred_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT UNIQUE NOT NULL,
      file_hash TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      last_modified INTEGER NOT NULL,
      transferred_date INTEGER NOT NULL,
      transfer_method TEXT NOT NULL
    )
  `);

  await run(db, `
    CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      created_date INTEGER DEFAULT (strftime('%s', 'now')),
      modified_date INTEGER DEFAULT (strftime('%s', 'now')),
      track_count INTEGER DEFAULT 0,
      duration INTEGER DEFAULT 0,
      is_smart INTEGER DEFAULT 0,
      smart_criteria TEXT,
      sync_to_doppler INTEGER DEFAULT 1,
      doppler_playlist_id TEXT
    )
  `);

  await run(db, `
    CREATE TABLE IF NOT EXISTS playlist_tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      playlist_id INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      position INTEGER NOT NULL,
      added_date INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY(playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
    )
  `);

  await run(db, `CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist_id ON playlist_tracks(playlist_id)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_playlist_tracks_position ON playlist_tracks(playlist_id, position)`);

  await run(db, `
    CREATE TABLE IF NOT EXISTS transfer_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_date INTEGER NOT NULL,
      files_queued INTEGER NOT NULL,
      files_transferred INTEGER NOT NULL,
      total_size INTEGER NOT NULL,
      duration_seconds INTEGER,
      transfer_method TEXT NOT NULL
    )
  `);

  await run(db, `
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // Songs library table: persistent per-song state (favorites, play counts, ratings, basic tags)
  await run(db, `
    CREATE TABLE IF NOT EXISTS songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT UNIQUE NOT NULL,
      file_name TEXT NOT NULL,
      relative_path TEXT,
      duration INTEGER DEFAULT 0,
      title TEXT,
      artist TEXT,
      album TEXT,
      album_artist TEXT,
      year INTEGER,
      track_number INTEGER,
      genre TEXT,
      bitrate INTEGER,
      sample_rate INTEGER,
      codec TEXT,
      play_count INTEGER DEFAULT 0,
      last_played INTEGER,
      is_favorite INTEGER DEFAULT 0,
      rating INTEGER,
      added_date INTEGER DEFAULT (strftime('%s', 'now')),
      modified_date INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

  await run(db, `CREATE INDEX IF NOT EXISTS idx_songs_file_path ON songs(file_path)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_songs_is_favorite ON songs(is_favorite)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_songs_play_count ON songs(play_count)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_songs_last_played ON songs(last_played)`);

  // Doppler devices table: stores paired Doppler devices for WebSocket sync
  await run(db, `
    CREATE TABLE IF NOT EXISTS doppler_devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      push_token TEXT NOT NULL,
      last_connected INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

  // Add device_id and transfer_status to transferred_files if not exists
  try {
    await run(db, `ALTER TABLE transferred_files ADD COLUMN device_id TEXT`);
  } catch (e) {
    // Column already exists, ignore
  }
  
  try {
    await run(db, `ALTER TABLE transferred_files ADD COLUMN transfer_status TEXT DEFAULT 'completed'`);
  } catch (e) {
    // Column already exists, ignore
  }

  await run(db, `CREATE INDEX IF NOT EXISTS idx_transfer_device ON transferred_files(device_id)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_transfer_status ON transferred_files(transfer_status)`);

  // Videos table: local desktop video library (independent of the songs/audio tables)
  await run(db, `
    CREATE TABLE IF NOT EXISTS videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT UNIQUE NOT NULL,
      file_name TEXT NOT NULL,
      relative_path TEXT,
      file_size INTEGER NOT NULL,
      modified_time INTEGER NOT NULL,
      title TEXT,
      content_kind TEXT NOT NULL DEFAULT 'other',
      series_title TEXT,
      series_key TEXT,
      season_number INTEGER,
      episode_start INTEGER,
      episode_end INTEGER,
      group_source TEXT NOT NULL DEFAULT 'unclassified',
      duration INTEGER,
      width INTEGER,
      height INTEGER,
      playback_supported INTEGER,
      last_position_seconds INTEGER DEFAULT 0,
      watched INTEGER DEFAULT 0,
      added_date INTEGER DEFAULT (strftime('%s', 'now')),
      modified_date INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

  await run(db, `CREATE INDEX IF NOT EXISTS idx_videos_file_path ON videos(file_path)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_videos_title ON videos(title)`);

  // Add organizational columns for video-library databases created before this feature.
  const videoColumnMigrations = [
    `ALTER TABLE videos ADD COLUMN content_kind TEXT NOT NULL DEFAULT 'other'`,
    `ALTER TABLE videos ADD COLUMN series_title TEXT`,
    `ALTER TABLE videos ADD COLUMN series_key TEXT`,
    `ALTER TABLE videos ADD COLUMN season_number INTEGER`,
    `ALTER TABLE videos ADD COLUMN episode_start INTEGER`,
    `ALTER TABLE videos ADD COLUMN episode_end INTEGER`,
    `ALTER TABLE videos ADD COLUMN group_source TEXT NOT NULL DEFAULT 'unclassified'`
  ];

  for (const sql of videoColumnMigrations) {
    try {
      await run(db, sql);
    } catch (_) {
      // The column already exists in databases initialized by a newer version.
    }
  }

  await run(db, `CREATE INDEX IF NOT EXISTS idx_videos_content_kind ON videos(content_kind)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_videos_series_season_episode ON videos(series_key, season_number, episode_start)`);

  return db;
}

module.exports = { initializeDatabase };


