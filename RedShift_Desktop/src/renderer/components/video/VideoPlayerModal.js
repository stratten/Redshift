// src/renderer/components/video/VideoPlayerModal.js
// Native Chromium video controls, playback-resume persistence, and support detection.

class VideoPlayerModal {
  constructor(uiManager) {
    this.ui = uiManager;
    this.currentVideo = null;
    this.lastPersistedAt = 0;
    this.persistIntervalMs = 5000;
    this.hasLoadedMetadata = false;
    this.openRequestId = 0;

    this.modal = document.getElementById('videoPlayerModal');
    this.videoEl = document.getElementById('videoPlayerElement');
    this.titleEl = document.getElementById('videoPlayerTitle');
    this.statusEl = document.getElementById('videoPlayerStatus');
    this.errorEl = document.getElementById('videoPlayerError');
    this.descriptionEl = document.getElementById('videoPlayerDescription');
    this.descriptionTextEl = document.getElementById('videoPlayerDescriptionText');
    this.closeBtn = document.getElementById('closeVideoPlayerModal');

    if (this.modal && this.videoEl && this.closeBtn) {
      this.bind();
    }
  }

  bind() {
    this.closeBtn.addEventListener('click', () => this.close());
    this.modal.addEventListener('click', (event) => {
      if (event.target === this.modal) this.close();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.isOpen()) this.close();
    });
    window.electronAPI.on('video-compatibility-progress', (progress) => {
      if (!this.currentVideo || progress.sourcePath !== this.currentVideo.path) return;
      const completed = this.formatProcessingTime(progress.seconds);
      const total = this.formatProcessingTime(progress.durationSeconds);
      this.showStatus(`Preparing compatible audio: ${progress.percent}% (${completed} of ${total})`);
    });

    this.videoEl.addEventListener('loadedmetadata', () => {
      if (!this.currentVideo) return;

      this.hasLoadedMetadata = true;
      this.hideError();
      const resumePoint = this.currentVideo.lastPositionSeconds;
      if (resumePoint > 0 && Number.isFinite(this.videoEl.duration) && resumePoint < this.videoEl.duration - 5) {
        this.videoEl.currentTime = resumePoint;
      }

      this.persist({
        durationSeconds: this.videoEl.duration,
        width: this.videoEl.videoWidth,
        height: this.videoEl.videoHeight,
        playbackSupported: true
      });

      this.videoEl.play().catch(() => {
        // The user can press the native play control if playback is blocked.
      });
    });

    this.videoEl.addEventListener('error', () => {
      if (!this.currentVideo) return;
      this.showError('This video format can’t be played locally yet.');
      this.persist({ playbackSupported: false });
    });

    this.videoEl.addEventListener('timeupdate', () => {
      const now = Date.now();
      if (this.hasLoadedMetadata && now - this.lastPersistedAt >= this.persistIntervalMs) {
        this.lastPersistedAt = now;
        this.persist({ positionSeconds: this.videoEl.currentTime });
      }
    });

    this.videoEl.addEventListener('pause', () => {
      if (this.hasLoadedMetadata) this.persist({ positionSeconds: this.videoEl.currentTime });
    });

    this.videoEl.addEventListener('ended', () => {
      if (this.hasLoadedMetadata) this.persist({ positionSeconds: 0, watched: true });
    });
  }

  isOpen() {
    return this.modal && this.modal.style.display === 'flex';
  }

  fileUrl(filePath) {
    return `file://${encodeURI(filePath).replace(/#/g, '%23').replace(/\?/g, '%3F')}`;
  }

  async open(video) {
    if (!this.modal || !this.videoEl) return;

    const requestId = ++this.openRequestId;
    this.currentVideo = video;
    this.lastPersistedAt = 0;
    this.hasLoadedMetadata = false;
    this.hideError();
    this.showStatus('Checking compatibility and preparing an AAC copy if required…');
    if (this.titleEl) this.titleEl.textContent = this.playerTitle(video);
    this.setDescription(video.tvMazeEpisodeSummary);

    this.modal.style.display = 'flex';
    try {
      const prepared = await window.electronAPI.invoke('prepare-video-playback', { filePath: video.path });
      if (requestId !== this.openRequestId || this.currentVideo?.path !== video.path) return;

      if (prepared.transcoded) {
        this.showStatus('Using a local AAC-compatible playback copy.');
      }
      this.videoEl.src = this.fileUrl(prepared.playbackPath);
      this.hideStatus();
    } catch (error) {
      if (requestId !== this.openRequestId) return;
      this.hideStatus();
      this.showError(`Couldn’t prepare this video for playback: ${error.message}`);
    }
  }

  close() {
    if (!this.modal || !this.videoEl) return;

    if (this.currentVideo && this.hasLoadedMetadata) {
      this.persist({
        positionSeconds: this.videoEl.currentTime,
        watched: this.isEffectivelyWatched()
      });
    }

    this.videoEl.pause();
    this.videoEl.removeAttribute('src');
    this.videoEl.load();
    this.modal.style.display = 'none';
    this.openRequestId += 1;
    this.currentVideo = null;
    this.hasLoadedMetadata = false;
  }

  showError(message) {
    if (!this.errorEl) return;
    this.errorEl.textContent = message;
    this.errorEl.style.display = 'block';
  }

  showStatus(message) {
    if (!this.statusEl) return;
    this.statusEl.textContent = message;
    this.statusEl.style.display = 'block';
  }

  hideStatus() {
    if (!this.statusEl) return;
    this.statusEl.style.display = 'none';
  }

  formatProcessingTime(seconds) {
    const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
    return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
  }

  setDescription(summary) {
    if (!this.descriptionEl || !this.descriptionTextEl) return;
    const text = String(summary || '').trim();
    this.descriptionEl.open = false;
    this.descriptionTextEl.textContent = text;
    this.descriptionEl.style.display = text ? 'block' : 'none';
  }

  hideError() {
    if (!this.errorEl) return;
    this.errorEl.style.display = 'none';
  }

  playerTitle(video) {
    if (video.contentKind !== 'tv' || !video.seriesTitle || !Number.isInteger(video.episodeStart)) {
      return video.title || video.name;
    }

    const season = String(video.seasonNumber || 0).padStart(2, '0');
    const episode = String(video.episodeStart).padStart(2, '0');
    const episodeRange = Number.isInteger(video.episodeEnd)
      ? `–E${String(video.episodeEnd).padStart(2, '0')}`
      : '';
    return `${video.seriesTitle} — S${season}E${episode}${episodeRange}`;
  }

  isEffectivelyWatched() {
    if (!this.hasLoadedMetadata || !Number.isFinite(this.videoEl.duration) || this.videoEl.duration <= 0) {
      return false;
    }
    return this.videoEl.currentTime / this.videoEl.duration >= 0.9;
  }

  async persist(updates) {
    if (!this.currentVideo) return;
    const filePath = this.currentVideo.path;

    try {
      await window.electronAPI.invoke('update-video-progress', { filePath, ...updates });
      this.ui.videoLibrary?.applyProgressUpdate(filePath, updates);
    } catch (error) {
      console.warn('Failed to persist video playback state:', error.message);
    }
  }
}
