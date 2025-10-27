// src/main/services/ipc/DatabaseHelpers.js
// Database utility functions for song management

const path = require('path');

function runSql(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function allSql(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

async function ensureSongRow(manager, filePath) {
  // Try update modified_date; if no row, insert minimal
  const result = await runSql(manager.db, `UPDATE songs SET modified_date = strftime('%s','now') WHERE file_path = ?`, [filePath]);
  if (result.changes === 0) {
    const fileName = path.basename(filePath);
    await runSql(manager.db, `INSERT INTO songs (file_path, file_name, title) VALUES (?, ?, ?)`, [filePath, fileName, fileName.replace(/\.[^/.]+$/, '')]);
  }
}

async function upsertSongFromTrack(manager, track) {
  if (!track || !track.filePath) return;
  const filePath = track.filePath;
  const fileName = track.filename || path.basename(filePath);
  const m = track.metadata || {};
  const fmt = m.format || {};
  const com = m.common || {};
  const duration = Math.floor((fmt.duration || 0));
  const title = com.title || fileName.replace(/\.[^/.]+$/, '');
  const artist = com.artist || null;
  const album = com.album || null;
  const albumArtist = com.albumartist || null;
  const year = com.year || null;
  const trackNumber = (com.track && (com.track.no || com.track.number)) ? (com.track.no || com.track.number) : null;
  const genre = com.genre ? (Array.isArray(com.genre) ? com.genre.join(', ') : String(com.genre)) : null;
  const bitrate = fmt.bitrate || null;
  const sampleRate = fmt.sampleRate || null;
  const codec = fmt.codec || fmt.container || null;

  // compute relative path if possible
  let relativePath = null;
  try {
    const base = manager.settings.musicLibraryPath || manager.settings.masterLibraryPath;
    if (base && filePath.startsWith(base)) {
      relativePath = path.relative(base, filePath);
    }
  } catch (_) {}

  // UPDATE first; if no changes, INSERT
  const update = await runSql(manager.db, `
    UPDATE songs SET
      file_name = ?,
      relative_path = ?,
      duration = ?,
      title = ?,
      artist = ?,
      album = ?,
      album_artist = ?,
      year = ?,
      track_number = ?,
      genre = ?,
      bitrate = ?,
      sample_rate = ?,
      codec = ?,
      modified_date = strftime('%s','now')
    WHERE file_path = ?
  `, [fileName, relativePath, duration, title, artist, album, albumArtist, year, trackNumber, genre, bitrate, sampleRate, codec, filePath]);

  if (update.changes === 0) {
    await runSql(manager.db, `
      INSERT INTO songs (
        file_path, file_name, relative_path, duration, title, artist, album, album_artist,
        year, track_number, genre, bitrate, sample_rate, codec
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [filePath, fileName, relativePath, duration, title, artist, album, albumArtist, year, trackNumber, genre, bitrate, sampleRate, codec]);
  }
}

async function incrementPlayCount(manager, filePath) {
  const beforeRows = await allSql(manager.db, `SELECT play_count, last_played FROM songs WHERE file_path = ?`, [filePath]);
  const before = beforeRows && beforeRows[0] ? beforeRows[0] : null;
  
  await runSql(manager.db, `
    UPDATE songs
    SET play_count = COALESCE(play_count, 0) + 1,
        last_played = strftime('%s','now'),
        modified_date = strftime('%s','now')
    WHERE file_path = ?
  `, [filePath]);
  
  const afterRows = await allSql(manager.db, `SELECT play_count, last_played FROM songs WHERE file_path = ?`, [filePath]);
  const after = afterRows && afterRows[0] ? afterRows[0] : null;
  
  const msg = `[Songs] ✅ Play count updated for ${path.basename(filePath)}: ${before?.play_count || 0} → ${after?.play_count || 0}, last_played: ${after?.last_played}`;
  console.log(msg);
  manager.sendToRenderer('log', { type: 'success', message: msg });
}

module.exports = {
  runSql,
  allSql,
  ensureSongRow,
  upsertSongFromTrack,
  incrementPlayCount
};

