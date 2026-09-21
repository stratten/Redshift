# 04 — New file: renderer `VideoLibrary.js`

Create `RedShift_Desktop/src/renderer/components/VideoLibrary.js` with this exact content:

```javascript
// src/renderer/components/VideoLibrary.js - Local desktop video library (grid + import)
// See plans/desktop-local-video/00-index.md for the settled decisions this file implements.

class VideoLibrary {
  constructor(uiManager) {
    this.ui = uiManager;
    this.videos = [];
    this.hasLoadedOnce = false;
    this.setupEventListeners();
    this.setupIpcListeners();
  }

  setupEventListeners() {
    const rescanBtn = document.getElementById('rescanVideosBtn');
    if (rescanBtn) {
      rescanBtn.addEventListener('click', () => this.loadVideos());
    }

    const grid = document.getElementById('videosGrid');
    if (grid) {
      grid.addEventListener('click', (event) => {
        const card = event.target.closest('.video-card');
        if (!card) return;
        const video = this.videos.find((v) => v.path === card.dataset.path);
        if (video) this.openPlayer(video);
      });
    }

    this.setupDragAndDrop();
  }

  setupDragAndDrop() {
    const dropZone = document.getElementById('videosTab');
    if (!dropZone) return;

    const isVideosTabActive = () => dropZone.style.display !== 'none';

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((eventName) => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    });

    dropZone.addEventListener('dragenter', () => {
      if (isVideosTabActive()) dropZone.classList.add('videos-drop-active');
    });

    dropZone.addEventListener('dragleave', (e) => {
      if (e.target === dropZone) dropZone.classList.remove('videos-drop-active');
    });

    dropZone.addEventListener('drop', async (e) => {
      dropZone.classList.remove('videos-drop-active');
      if (!isVideosTabActive()) return;

      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;

      this.ui.logBoth('info', `🎬 Dropped ${files.length} item(s) into video library`, '🎬');

      try {
        const paths = files.map((f) => f.path);
        const result = await window.electronAPI.invoke('add-videos-to-library', { paths });
        if (result.success) {
          this.ui.logBoth('success', `🎬 Added ${result.filesAdded} video file(s)`, '🎬');
          await this.loadVideos();
        } else {
          this.ui.logBoth('error', `🎬 Failed to add videos: ${result.error}`, '🎬');
        }
      } catch (error) {
        this.ui.logBoth('error', `🎬 Error adding videos: ${error.message}`, '🎬');
      }
    });
  }

  setupIpcListeners() {
    window.electronAPI.on('video-scan-progress', () => {
      // Reserved for a future progress indicator; the current scan has no per-file phase
      // to report (see plans/desktop-local-video/00-index.md, metadata-extraction decision).
    });
  }

  onTabActivated() {
    if (!this.hasLoadedOnce) {
      this.loadVideos();
    } else {
      this.render();
    }
  }

  async loadVideos() {
    const progressBar = document.getElementById('videoScanProgressBar');
    if (progressBar) progressBar.style.display = 'flex';

    try {
      this.videos = await window.electronAPI.invoke('scan-video-library');
      this.hasLoadedOnce = true;
      this.render();
    } catch (error) {
      this.ui.logBoth('error', `🎬 Failed to scan video library: ${error.message}`, '🎬');
      this.renderError(error.message);
    } finally {
      if (progressBar) progressBar.style.display = 'none';
    }
  }

  applyProgressUpdate(filePath, updates) {
    const video = this.videos.find((v) => v.path === filePath);
    if (!video) return;
    if (updates.durationSeconds !== undefined && updates.durationSeconds !== null) {
      video.duration = Math.floor(updates.durationSeconds);
    }
    if (updates.playbackSupported !== undefined && updates.playbackSupported !== null) {
      video.playbackSupported = !!updates.playbackSupported;
    }
    if (updates.positionSeconds !== undefined && updates.positionSeconds !== null) {
      video.lastPositionSeconds = Math.floor(updates.positionSeconds);
    }
    this.render();
  }

  openPlayer(video) {
    if (this.ui.videoPlayerModal) {
      this.ui.videoPlayerModal.open(video);
    }
  }

  formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '—';
    const totalSeconds = Math.floor(seconds);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${minutes}:${String(secs).padStart(2, '0')}`;
  }

  render() {
    const grid = document.getElementById('videosGrid');
    const countEl = document.getElementById('videoCount');
    if (!grid) return;

    if (countEl) {
      countEl.textContent = `${this.videos.length} video${this.videos.length !== 1 ? 's' : ''}`;
    }

    if (this.videos.length === 0) {
      grid.innerHTML = `
        <div class="empty-state videos-empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="2" y="4" width="15" height="16" rx="2"></rect>
            <path d="M17 8l5-3v14l-5-3"></path>
          </svg>
          <h3>No videos yet</h3>
          <p>Drag video files here, or set a Video Library Path in Settings</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = this.videos.map((video) => this.renderCard(video)).join('');
  }

  renderCard(video) {
    const title = this.ui.escapeHtml(video.title || video.name);
    const duration = this.formatDuration(video.duration);
    const unsupportedBadge = video.playbackSupported === false
      ? '<span class="video-card-badge video-card-badge-unsupported">Format not supported for local playback yet</span>'
      : '';
    const progressPercent = video.duration && video.lastPositionSeconds
      ? Math.min(100, Math.round((video.lastPositionSeconds / video.duration) * 100))
      : 0;
    const progressBar = progressPercent > 2
      ? `<div class="video-card-progress"><div class="video-card-progress-fill" style="width: ${progressPercent}%;"></div></div>`
      : '';

    return `
      <div class="video-card" data-path="${this.ui.escapeHtml(video.path)}" role="button" tabindex="0" title="${title}">
        <div class="video-card-thumb">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          ${progressBar}
        </div>
        <div class="video-card-info">
          <div class="video-card-title">${title}</div>
          <div class="video-card-meta">
            <span>${duration}</span>
            ${unsupportedBadge}
          </div>
        </div>
      </div>
    `;
  }

  renderError(message) {
    const grid = document.getElementById('videosGrid');
    if (!grid) return;
    grid.innerHTML = `
      <div class="empty-state videos-empty-state">
        <h3>Couldn't load videos</h3>
        <p>${this.ui.escapeHtml(message)}</p>
      </div>
    `;
  }
}
```

## Contract notes

- `openPlayer()` reads `this.ui.videoPlayerModal`, which is instantiated in `renderer.js` (companion doc 7) alongside this class. This file does not instantiate `VideoPlayerModal` itself to avoid a circular-construction-order dependency between the two classes.
- `applyProgressUpdate()` is the single mutation path `VideoPlayerModal` uses to keep the in-memory grid in sync after a play/pause/close without forcing a full filesystem rescan.
- `this.ui.escapeHtml` is the existing method already defined on `RedshiftSyncUI` in `RedShift_Desktop/src/renderer/renderer.js` (see the `escapeHtml(text)` method near the end of that class) — no new escaping helper is introduced.
