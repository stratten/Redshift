// src/main/services/FileWatcher.js
// Wraps chokidar watching for the master library and forwards to callbacks on the manager

const chokidar = require('chokidar');
const path = require('path');

class FileWatcher {
  constructor(manager) {
    this.manager = manager; // expects onFileAdded/onFileChanged/onFileDeleted
    this.watcher = null;
  }

  start(directoryPath) {
    try {
      if (this.watcher) {
        this.watcher.close();
        this.watcher = null;
      }
      this.watcher = chokidar.watch(directoryPath, {
        ignored: /(^|[\/\\])\../, // ignore dotfiles
        persistent: true
      });

      this.watcher
        .on('add', (filePath) => this.onAdd(filePath))
        .on('change', (filePath) => this.onChange(filePath))
        .on('unlink', (filePath) => this.onUnlink(filePath));
    } catch (err) {
      console.error('FileWatcher failed to start:', err?.message || err);
    }
  }

  stop() {
    if (this.watcher) {
      try { this.watcher.close(); } catch (_) {}
      this.watcher = null;
    }
  }

  // Internal handlers, using manager's configuration and helpers
  onAdd(filePath) {
    try {
      const ext = path.extname(filePath).toLowerCase();
      const allowed = this.manager?.audioExtensions || [];
      if (!allowed.includes(ext)) return;
    } catch (err) {
      console.warn('FileWatcher onAdd error:', err?.message || err);
    }
  }

  onChange(filePath) {
    try {
      const ext = path.extname(filePath).toLowerCase();
      const allowed = this.manager?.audioExtensions || [];
      if (!allowed.includes(ext)) return;
      this.manager?.sendToRenderer?.('file-changed', { path: filePath });
    } catch (err) {
      console.warn('FileWatcher onChange error:', err?.message || err);
    }
  }

  onUnlink(filePath) {
    try {
      const relativePath = path.relative(this.manager?.masterLibraryPath || '', filePath);
      if (this.manager?.db) {
        this.manager.db.run('DELETE FROM transferred_files WHERE file_path = ?', [relativePath]);
      }
    } catch (err) {
      console.warn('FileWatcher onUnlink error:', err?.message || err);
    }
  }
}

module.exports = FileWatcher;


