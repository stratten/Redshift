// PlaylistSyncStore.js - Transactional playlist writes and last-sync baselines.

const path = require('path');

class PlaylistSyncStore {
  constructor(db, playlistService) {
    this.db = db;
    this.playlistService = playlistService;
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(error) {
        if (error) reject(error);
        else resolve(this);
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (error, rows) => (error ? reject(error) : resolve(rows)));
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (error, row) => (error ? reject(error) : resolve(row || null)));
    });
  }

  async inTransaction(work) {
    await this.run('BEGIN IMMEDIATE');
    try {
      const result = await work();
      await this.run('COMMIT');
      return result;
    } catch (error) {
      await this.run('ROLLBACK').catch(() => {});
      throw error;
    }
  }

  async findLibraryPathForFilename(filename) {
    const row = await this.get('SELECT file_path FROM songs WHERE file_name = ? ORDER BY id LIMIT 1', [filename]);
    return row ? row.file_path : null;
  }

  async getPlaylistFilenames(playlistId) {
    const tracks = await this.playlistService.getPlaylistTracks(playlistId);
    return tracks.map((track) => path.basename(track.file_path));
  }

  async replacePlaylistTracks(playlistId, filenames, modifiedDate) {
    const filePaths = [];
    const missing = [];
    for (const filename of filenames) {
      const filePath = await this.findLibraryPathForFilename(filename);
      if (filePath) filePaths.push(filePath);
      else missing.push(filename);
    }
    await this.inTransaction(async () => {
      await this.run('DELETE FROM playlist_tracks WHERE playlist_id = ?', [playlistId]);
      for (let index = 0; index < filePaths.length; index++) {
        await this.run(
          'INSERT INTO playlist_tracks (playlist_id, file_path, position) VALUES (?, ?, ?)',
          [playlistId, filePaths[index], index + 1]
        );
      }
      await this.run(
        'UPDATE playlists SET track_count = ?, modified_date = ? WHERE id = ?',
        [filePaths.length, modifiedDate, playlistId]
      );
    });
    if (missing.length > 0) {
      console.warn(`⚠️  ${missing.length} playlist track(s) not in desktop library: ${missing.join(', ')}`);
    }
    return { resolved: filePaths.length, missing };
  }

  async importDevicePlaylist(devicePlaylist) {
    const playlist = await this.playlistService.createPlaylist(devicePlaylist.name, '', false);
    await this.replacePlaylistTracks(playlist.id, devicePlaylist.tracks, devicePlaylist.modified);
    await this.run(
      'UPDATE playlists SET created_date = ? WHERE id = ?',
      [devicePlaylist.created || devicePlaylist.modified, playlist.id]
    );
    return playlist;
  }

  async setModifiedDate(playlistId, modifiedDate) {
    await this.run('UPDATE playlists SET modified_date = ? WHERE id = ?', [modifiedDate, playlistId]);
  }

  async getBaselines() {
    const rows = await this.all('SELECT name_key, last_synced_modified FROM playlist_sync_state');
    return new Map(rows.map((row) => [row.name_key, { modified: row.last_synced_modified }]));
  }

  async recordBaselines(entries, syncedAt = Math.floor(Date.now() / 1000)) {
    await this.inTransaction(async () => {
      for (const entry of entries) {
        await this.run(
          'INSERT OR REPLACE INTO playlist_sync_state (name_key, last_synced_modified, last_synced_at) VALUES (?, ?, ?)',
          [entry.name.toLowerCase(), entry.modified, syncedAt]
        );
      }
    });
  }
}

module.exports = PlaylistSyncStore;
