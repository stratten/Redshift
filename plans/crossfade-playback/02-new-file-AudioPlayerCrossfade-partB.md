# `AudioPlayerCrossfade.js` Part B

These methods are appended inside the `AudioPlayerCrossfade` class body, after `prepareNextTrack()`, before the file's final `}`.

```javascript
  // Called on every 'timeupdate' of the active element (wired in AudioPlayer.js)
  onTimeUpdate() {
    if (this.transition || this.player.audioPlayerState.repeatMode === 'one') return;
    if (this.crossfadeDuration <= 0) return; // hard-swap path handles the no-crossfade case on 'ended'

    const activeEl = this.getActiveElement();
    const remaining = activeEl.duration - activeEl.currentTime;
    if (!isFinite(remaining) || remaining <= 0) return;

    if (this.preload && this.preload.ready && remaining <= this.crossfadeDuration) {
      this.beginCrossfade(remaining);
    }
  }

  beginCrossfade(remaining) {
    const incoming = this.getInactiveElement();
    const ctx = this.player.equalizer.audioContext;
    const outGain = this.getActiveGain();
    const inGain = this.getInactiveGain();

    this.transition = { fromIndex: this.activeIndex, toIndex: this.activeIndex === 0 ? 1 : 0 };

    incoming.currentTime = 0;
    incoming.play().catch((error) => this.player.ui.logBoth('error', `Crossfade incoming play failed: ${error.message}`));

    const now = ctx.currentTime;
    outGain.gain.cancelScheduledValues(now);
    outGain.gain.setValueAtTime(outGain.gain.value, now);
    outGain.gain.linearRampToValueAtTime(0, now + remaining);

    inGain.gain.cancelScheduledValues(now);
    inGain.gain.setValueAtTime(0, now);
    inGain.gain.linearRampToValueAtTime(1, now + remaining);

    this.notifyTrackEndedForPlayCount();
  }

  // Fired from AudioPlayer's 'ended' listener whenever the currently-active element ends
  async handleActiveEnded() {
    if (this.player.audioPlayerState.repeatMode === 'one') {
      const el = this.getActiveElement();
      el.currentTime = 0;
      await el.play();
      return;
    }

    if (this.transition) {
      this.finalizeTransition();
      return;
    }

    if (this.preload && this.preload.ready) {
      this.swapToPreloaded();
      return;
    }

    // Nothing staged yet (end of queue, repeat-all wrap, or preload still loading) - fall back
    await this.player.playback.handleTrackEndedFallback();
  }

  swapToPreloaded() {
    const incoming = this.getInactiveElement();
    const ctx = this.player.equalizer.audioContext;

    this.notifyTrackEndedForPlayCount();

    this.getInactiveGain().gain.setValueAtTime(1, ctx.currentTime);
    incoming.currentTime = 0;
    incoming.play().catch((error) => this.player.ui.logBoth('error', `Gapless swap play failed: ${error.message}`));

    this.transition = { fromIndex: this.activeIndex, toIndex: this.activeIndex === 0 ? 1 : 0 };
    this.finalizeTransition();
  }

  finalizeTransition() {
    const outgoing = this.getActiveElement();
    outgoing.pause();
    outgoing.currentTime = 0;

    this.activeIndex = this.transition.toIndex;
    this.transition = null;

    const { track, index } = this.preload;
    this.preload = null;
    this.player.playback.commitAdvance(index, track);
    this.prepareNextTrack();
  }

  notifyTrackEndedForPlayCount() {
    const trackPath = this.player.audioPlayerState.currentTrack?.path;
    if (!trackPath) return;
    window.electronAPI.invoke('audio-track-ended-notify', trackPath)
      .then((result) => {
        if (result) {
          window.dispatchEvent(new CustomEvent('play-count-incremented', { detail: { filePath: trackPath } }));
        }
      })
      .catch((error) => {
        this.player.ui.logBoth('error', `Failed to notify track ended: ${error.message}`);
      });
  }

  // Called when the user manually pauses, seeks, or jumps tracks mid-crossfade
  cancelTransition() {
    if (!this.transition) return;
    const ctx = this.player.equalizer.audioContext;
    const incoming = this.getInactiveElement();

    this.getActiveGain().gain.cancelScheduledValues(ctx.currentTime);
    this.getActiveGain().gain.setValueAtTime(1, ctx.currentTime);
    this.getInactiveGain().gain.cancelScheduledValues(ctx.currentTime);
    this.getInactiveGain().gain.setValueAtTime(0, ctx.currentTime);

    incoming.pause();
    incoming.currentTime = 0;
    this.transition = null;
  }

  pauseActive() {
    this.cancelTransition();
    this.getActiveElement().pause();
  }

  async resumeActive() {
    await this.getActiveElement().play();
  }
}
```

Note the final `}` above closes the `AudioPlayerCrossfade` class opened in Part A. When assembling the file, Part A's content (through `prepareNextTrack()`'s closing brace) is followed directly by these methods, followed by the single closing `}` shown here (Part A must NOT have its own closing `}` for the class - only for `prepareNextTrack`'s method body).
