# 02 — New file: `VideoLibraryCache.js`

Create `RedShift_Desktop/src/main/services/VideoLibraryCache.js` with this exact content:

```javascript
// src/main/services/VideoLibraryCache.js
// Local desktop video library: filesystem scan, change diffing, and `videos` table CRUD.
// Reuses the manager's already-open sync_database.db handle (this.manager.db) instead of
// opening a second SQLite file, because there is no expensive metadata-extraction step to
// cache separately (see plans/desktop-local-video/00-index.md for the settled decisions).

const path = require('path');
const fs = require('fs-extra');

const VIDEO_EXTENSIONS = ['.mp4', '.m4v', '.mov', '.webm', '.mkv', '.avi'];

class VideoLibraryCache {
  constructor(manager) {
    this.manager = manager;
    this.videoExtensions = VIDEO_EXTENSIONS;
  }

  get db() {
    return this.manager.db;
  }

  emitLog(type, message) {
    try {
      this.manager.emit('log', { type, message });
    } catch (_) {
      // Logging must never throw and interrupt a scan
    }
  }

  runSql(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (error) {
        if (error) reject(error);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  allSql(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (error, rows) => {
        if (error) reject(error);
        else resolve(rows);
      });
    });
  }

  /**
   * Smart video library scan: walks the filesystem, diffs against the `videos` table by
   * file_path/file_size/modified_time, removes rows for deleted files, inserts rows for new
   * files, and updates rows for modified files. Duration/width/height/playback_supported are
   * intentionally left NULL for new/modified files; they are populated later by
   * updatePlaybackState() the first time the file is opened in the player.
   */
  async scanVideoLibrary(libraryPath) {
    this.emitLog('info', '🎬 Starting video library scan...');
    const startTime = Date.now();

    const currentFiles = await this.scanFilesystem(libraryPath);
    const cachedRows = await this.getCachedRows();

    const { newFiles, modifiedFiles, deletedPaths, unchangedCount } = this.compareFiles(currentFiles, cachedRows);

    if (deletedPaths.length > 0) {
      await this.removeVideos(deletedPaths);
    }

    for (const file of [...newFiles, ...modifiedFiles]) {
      await this.upsertVideoFile(file);
    }

    const elapsedMs = Date.now() - startTime;
    this.emitLog(
      'success',
      `🎬 Video scan complete in ${elapsedMs}ms: ${newFiles.length} new, ${modifiedFiles.length} modified, ${deletedPaths.length} removed, ${unchangedCount} unchanged`
    );

    this.manager.emit('video-scan-progress', { phase: 'complete', total: currentFiles.length });

    return this.getAllVideos();
  }

  async scanFilesystem(libraryPath) {
    const videoFiles = [];

    const scanDirectory = async (dirPath) => {
      let entries;
      try {
        entries = await fs.readdir(dirPath, { withFileTypes: true });
      } catch (error) {
        this.emitLog('warning', `🎬 Error scanning directory ${dirPath}: ${error.message}`);
        return;
      }

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          await scanDirectory(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (this.videoExtensions.includes(ext)) {
            const stats = await fs.stat(fullPath);
            videoFiles.push({
              path: fullPath,
              name: entry.name,
              relativePath: path.relative(libraryPath, fullPath),
              size: stats.size,
              modified: Math.floor(stats.mtime.getTime() / 1000)
            });
          }
        }
      }
    };

    await scanDirectory(libraryPath);
    return videoFiles;
  }

  async getCachedRows() {
    const rows = await this.allSql('SELECT file_path, file_size, modified_time FROM videos');
    return rows.map((row) => ({ path: row.file_path, size: row.file_size, modified: row.modified_time }));
  }

  compareFiles(currentFiles, cachedRows) {
    const cachedMap = new Map(cachedRows.map((row) => [row.path, row]));
    const currentPaths = new Set(currentFiles.map((f) => f.path));

    const newFiles = [];
    const modifiedFiles = [];
    let unchangedCount = 0;

    for (const file of currentFiles) {
      const cached = cachedMap.get(file.path);
      if (!cached) {
        newFiles.push(file);
      } else if (cached.modified !== file.modified || cached.size !== file.size) {
        modifiedFiles.push(file);
      } else {
        unchangedCount += 1;
      }
    }

    const deletedPaths = cachedRows.filter((row) => !currentPaths.has(row.path)).map((row) => row.path);

    return { newFiles, modifiedFiles, deletedPaths, unchangedCount };
  }

  async removeVideos(filePaths) {
    if (filePaths.length === 0) return;
    const placeholders = filePaths.map(() => '?').join(',');
    await this.runSql(`DELETE FROM videos WHERE file_path IN (${placeholders})`, filePaths);
    this.emitLog('success', `🎬 Removed ${filePaths.length} deleted video(s) from the library`);
  }

  async upsertVideoFile(file) {
    const title = file.name.replace(/\.[^/.]+$/, '');
    const update = await this.runSql(
      `UPDATE videos SET file_name = ?, relative_path = ?, file_size = ?, modified_time = ?, modified_date = strftime('%s','now') WHERE file_path = ?`,
      [file.name, file.relativePath, file.size, file.modified, file.path]
    );

    if (update.changes === 0) {
      await this.runSql(
        `INSERT INTO videos (file_path, file_name, relative_path, file_size, modified_time, title) VALUES (?, ?, ?, ?, ?, ?)`,
        [file.path, file.name, file.relativePath, file.size, file.modified, title]
      );
    }
  }

  async getAllVideos() {
    const rows = await this.allSql('SELECT * FROM videos ORDER BY title COLLATE NOCASE ASC');
    return rows.map((row) => ({
      id: row.id,
      path: row.file_path,
      name: row.file_name,
      relativePath: row.relative_path,
      size: row.file_size,
      modified: row.modified_time,
      title: row.title || row.file_name,
      duration: row.duration,
      width: row.width,
      height: row.height,
      playbackSupported: row.playback_supported === null ? null : !!row.playback_supported,
      lastPositionSeconds: row.last_position_seconds || 0,
      watched: !!row.watched
    }));
  }

  /**
   * Called by VideoHandlers once the renderer's <video> element has loaded (or failed to
   * load) a file, so the library can persist what was learned about that specific file.
   */
  async updatePlaybackState(filePath, updates = {}) {
    const fields = [];
    const params = [];

    if (updates.durationSeconds !== undefined && updates.durationSeconds !== null) {
      fields.push('duration = ?');
      params.push(Math.floor(updates.durationSeconds));
    }
    if (updates.width !== undefined && updates.width !== null) {
      fields.push('width = ?');
      params.push(updates.width);
    }
    if (updates.height !== undefined && updates.height !== null) {
      fields.push('height = ?');
      params.push(updates.height);
    }
    if (updates.playbackSupported !== undefined && updates.playbackSupported !== null) {
      fields.push('playback_supported = ?');
      params.push(updates.playbackSupported ? 1 : 0);
    }
    if (updates.positionSeconds !== undefined && updates.positionSeconds !== null) {
      fields.push('last_position_seconds = ?');
      params.push(Math.floor(updates.positionSeconds));
    }
    if (updates.watched !== undefined && updates.watched !== null) {
      fields.push('watched = ?');
      params.push(updates.watched ? 1 : 0);
    }

    if (fields.length === 0) return { changes: 0 };

    fields.push(`modified_date = strftime('%s','now')`);
    params.push(filePath);

    return this.runSql(`UPDATE videos SET ${fields.join(', ')} WHERE file_path = ?`, params);
  }

  /**
   * Copies dropped files (and directories, recursively) that match videoExtensions into the
   * configured video library path. Mirrors the music library's add-files-to-library handler
   * in RedShift_Desktop/src/main/services/ipc/LibraryHandlers.js, scoped to video files.
   */
  async importPaths(paths, libraryPath) {
    let filesAdded = 0;

    const copyDirectory = async (src, dest) => {
      await fs.mkdir(dest, { recursive: true });
      const entries = await fs.readdir(src, { withFileTypes: true });
      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
          await copyDirectory(srcPath, destPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (this.videoExtensions.includes(ext)) {
            await fs.copyFile(srcPath, destPath);
            filesAdded += 1;
          }
        }
      }
    };

    for (const itemPath of paths) {
      const stat = await fs.stat(itemPath);
      const itemName = path.basename(itemPath);
      if (stat.isDirectory()) {
        await copyDirectory(itemPath, path.join(libraryPath, itemName));
      } else if (stat.isFile()) {
        const ext = path.extname(itemName).toLowerCase();
        if (this.videoExtensions.includes(ext)) {
          await fs.copyFile(itemPath, path.join(libraryPath, itemName));
          filesAdded += 1;
        }
      }
    }

    this.emitLog('success', `🎬 Added ${filesAdded} video file(s) to the library`);
    return filesAdded;
  }
}

module.exports = VideoLibraryCache;
```

## Design notes for the implementer

- `VIDEO_EXTENSIONS` is duplicated as a module-level constant and mirrored onto `manager.videoExtensions` in `main.js` (companion doc 1). Both lists must stay in sync; if they ever diverge, the scan and the import copier would disagree about which files count as videos. Keeping the same literal array in both places (rather than importing one from the other) matches this repository's existing convention where `MusicLibraryCache.js` and `LibraryHandlers.js` each independently declare their own audio-extension list.
- `getAllVideos()` returns `playbackSupported: null` for a video that has never been opened yet, `true`/`false` once known. The renderer (companion doc 4) must treat `null` as "unknown," not as "unsupported."
- No `initialize()` method exists on this class by design (see `00-index.md`, "Cross-file contract notes").
