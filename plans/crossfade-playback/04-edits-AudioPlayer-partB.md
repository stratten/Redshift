# Edit 2 replacement text (continuation of `03-edits-AudioPlayer.md`)

This is the exact replacement for the anchor shown in Edit 2 of `03-edits-AudioPlayer.md`. It adds the `audioElement` getter, attaches identical listeners to both elements via a shared helper, and wires `timeupdate` into the crossfade engine.

```javascript
    // Keyboard shortcuts (playback, seek, volume, modes)
    this.setupKeyboardShortcuts();
    
    // Initialize output device selection
    this.outputDevice.initialize();
  }
  
  // The "active" element is whichever one AudioPlayerCrossfade currently considers primary.
  // Every other component in the app reads/writes this.audioElement and is unaffected by
  // there being two underlying <audio> tags.
  get audioElement() {
    return this.crossfade.getActiveElement();
  }
  
  setupAudioElement() {
    this.ui.logBoth('info', 'Setting up HTML5 Audio element for playback');
    
    [this.audioElementA, this.audioElementB].forEach((el) => this.attachElementListeners(el));
  }
  
  attachElementListeners(el) {
    el.addEventListener('loadstart', () => {
      this.ui.logBoth('info', 'Audio loading started');
    });
    
    el.addEventListener('loadedmetadata', () => {
      if (el !== this.audioElement) return; // background preload element, not the active track
      this.audioPlayerState.duration = el.duration;
      this.ui.logBoth('info', `Audio metadata loaded, duration: ${this.formatTime(el.duration)}`);
      this.lastDisplayedTime = 0;
      this.updateProgress(0, el.duration);
    });
    
    el.addEventListener('canplay', () => {
      this.ui.logBoth('info', 'Audio ready to play');
    });
    
    el.addEventListener('play', () => {
      if (el !== this.audioElement) return;
      this.audioPlayerState.isPlaying = true;
      this.updatePlaybackState(true);
      this.lastDisplayedTime = el.currentTime;
      this.ui.logBoth('info', 'Audio playback started');
    });
    
    el.addEventListener('pause', () => {
      if (el !== this.audioElement) return;
      this.audioPlayerState.isPlaying = false;
      this.updatePlaybackState(false);
      this.ui.logBoth('info', 'Audio playback paused');
    });
    
    el.addEventListener('ended', () => {
      if (el !== this.audioElement) return; // background element finishing is not meaningful
      const trackName = this.audioPlayerState.currentTrack?.name || 'Unknown';
      this.ui.logBoth('success', `🎵 Track finished playing: ${trackName}`);
      this.handleTrackEnded();
    });
    
    el.addEventListener('play', () => { if (el === this.audioElement) this.startProgressLoop(); });
    el.addEventListener('pause', () => { if (el === this.audioElement) this.stopProgressLoop(); });
    
    el.addEventListener('timeupdate', () => {
      if (el === this.audioElement) this.crossfade.onTimeUpdate();
    });
    
    el.addEventListener('volumechange', () => {
      if (el !== this.audioElement) return;
      this.audioPlayerState.volume = el.volume;
      this.updateVolumeUI(el.volume, el.muted);
    });
    
    el.addEventListener('error', (e) => {
      this.ui.logBoth('error', `Audio playback error: ${e.message || 'Unknown error'}`);
    });
  }
```

Notes on this edit:

- `handleTrackEnded()` (the existing delegator a few lines below, calling `this.playback.handleTrackEnded()`) is separately changed in `05-edits-AudioPlayerPlayback.md` to route through `this.crossfade.handleActiveEnded()`. No change needed here beyond what's shown.
- The `ended` listener no longer sets `isPlaying = false` / calls `updatePlaybackState(false)` directly, because during a crossfade the incoming element is already playing when the outgoing one ends - forcing `isPlaying` to `false` at that instant would cause a one-frame UI flicker. `AudioPlayerCrossfade.finalizeTransition()` and `swapToPreloaded()` hand off playback without ever setting `isPlaying` to `false`; the only remaining path that sets it `false` on natural end is the true end-of-queue fallback in `AudioPlayerPlayback.handleTrackEndedFallback()` (see `05-edits-AudioPlayerPlayback.md`), which mirrors today's "No next track available" behavior.
- Volume, mute, seeking, and playback-rate controls in `AudioPlayerControls.js` and `AudioPlayerProgress.js` read/write `this.player.audioElement.*`, which now resolves through the getter to whichever element is active - no changes needed in those files for basic property access, only for the specific hazards covered in `06-edits-remaining-files.md`.
