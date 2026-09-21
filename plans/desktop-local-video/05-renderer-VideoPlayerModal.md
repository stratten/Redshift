# 05 — New files: `VideoPlayerModal.js` and `video-player-modal.html`

## New file: `RedShift_Desktop/src/renderer/components/video/VideoPlayerModal.js`

Create with this exact content:

```javascript
// src/renderer/components/video/VideoPlayerModal.js
// Controls the <video> element inside the video player modal: play/pause/seek, resume from
// last position, and persisting duration/resolution/playback-support back to the main process
// the first time a given file is opened (see plans/desktop-local-video/00-index.md).

class VideoPlayerModal {
  constructor(uiManager) {
    this.ui = uiManager;
    this.currentVideo = null;
    this.lastPersistedAt = 0;
    this.persistIntervalMs = 5000;

    this.modal = document.getElementById('videoPlayerModal');
    this.videoEl = document.getElementById('videoPlayerElement');
    this.titleEl = document.getElementById('videoPlayerTitle');
    this.errorEl = document.getElementById('videoPlayerError');
    this.closeBtn = document.getElementById('closeVideoPlayerModal');

    if (this.modal && this.videoEl) {
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

    this.videoEl.addEventListener('loadedmetadata', () => {
      this.hideError();

      if (this.currentVideo && this.currentVideo.lastPositionSeconds > 0) {
        const resumePoint = this.currentVideo.lastPositionSeconds;
        if (resumePoint < this.videoEl.duration - 5) {
          this.videoEl.currentTime = resumePoint;
        }
      }

      this.persist({
        durationSeconds: this.videoEl.duration,
        width: this.videoEl.videoWidth,
        height: this.videoEl.videoHeight,
        playbackSupported: true
      });

      this.videoEl.play().catch(() => {
        // Autoplay was blocked; the user can press play manually. Not an error state.
      });
    });

    this.videoEl.addEventListener('error', () => {
      this.showError('This video format can\'t be played locally yet.');
      this.persist({ playbackSupported: false });
    });

    this.videoEl.addEventListener('timeupdate', () => {
      const now = Date.now();
      if (now - this.lastPersistedAt >= this.persistIntervalMs) {
        this.lastPersistedAt = now;
        this.persist({ positionSeconds: this.videoEl.currentTime });
      }
    });

    this.videoEl.addEventListener('pause', () => {
      this.persist({ positionSeconds: this.videoEl.currentTime });
    });
  }

  isOpen() {
    return this.modal && this.modal.style.display !== 'none' && this.modal.style.display !== '';
  }

  open(video) {
    if (!this.modal || !this.videoEl) return;

    this.currentVideo = video;
    this.lastPersistedAt = 0;
    this.hideError();

    if (this.titleEl) {
      this.titleEl.textContent = video.title || video.name;
    }

    this.videoEl.src = `file://${video.path}`;
    this.modal.style.display = 'flex';
  }

  close() {
    if (!this.modal || !this.videoEl) return;

    if (this.currentVideo && !this.videoEl.error) {
      this.persist({ positionSeconds: this.videoEl.currentTime });
    }

    this.videoEl.pause();
    this.videoEl.removeAttribute('src');
    this.videoEl.load();
    this.modal.style.display = 'none';
    this.currentVideo = null;
  }

  showError(message) {
    if (!this.errorEl) return;
    this.errorEl.textContent = message;
    this.errorEl.style.display = 'block';
  }

  hideError() {
    if (!this.errorEl) return;
    this.errorEl.style.display = 'none';
  }

  async persist(updates) {
    if (!this.currentVideo) return;
    const filePath = this.currentVideo.path;

    try {
      await window.electronAPI.invoke('update-video-progress', { filePath, ...updates });
      if (this.ui.videoLibrary) {
        this.ui.videoLibrary.applyProgressUpdate(filePath, updates);
      }
    } catch (error) {
      console.warn('Failed to persist video playback state:', error.message);
    }
  }
}
```

## New file: `RedShift_Desktop/src/renderer/partials/modals/video-player-modal.html`

Create with this exact content:

```html
<!-- Video Player Modal -->
<div id="videoPlayerModal" class="modal video-player-modal" style="display: none;">
    <div class="modal-content video-player-modal-content" role="dialog" aria-modal="true" aria-labelledby="videoPlayerTitle">
        <div class="modal-header">
            <h2 id="videoPlayerTitle">Video</h2>
            <button class="close-button" id="closeVideoPlayerModal" type="button" aria-label="Close video player">&times;</button>
        </div>
        <div class="modal-body video-player-modal-body">
            <div id="videoPlayerError" class="video-player-error" style="display: none;"></div>
            <video id="videoPlayerElement" class="video-player-element" controls playsinline></video>
        </div>
    </div>
</div>
```

## Contract notes

- `this.videoEl.error` inside `close()` guards against re-persisting a bogus `positionSeconds` (which would be `0` or `NaN`) when the file failed to load at all.
- `open()` intentionally does not call `.play()` itself; playback starts from the `loadedmetadata` handler once the browser has actually decoded enough of the file to know it is playable, which is also the same moment `playbackSupported: true` is persisted.
- The `controls` attribute on the `<video>` element provides play/pause/seek/volume/fullscreen using Chromium's built-in media controls, matching the "vertical slice" scope in `00-index.md` (no custom transport UI is built in this package).
