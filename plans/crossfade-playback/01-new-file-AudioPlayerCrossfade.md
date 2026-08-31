# New file: `RedShift_Desktop/src/renderer/components/audioplayer/AudioPlayerCrossfade.js`

Complete final content for this new file, split into two parts below (Part A and Part B belong to the same file, concatenated in order, with no blank-line gap changes needed between them beyond what's shown).

## Part A (constructor through `prepareNextTrack`)

```javascript
// src/renderer/components/AudioPlayerCrossfade.js - Dual-element gapless/crossfade engine
class AudioPlayerCrossfade {
  constructor(audioPlayer) {
    this.player = audioPlayer;
    this.activeIndex = 0; // 0 = audioElementA is active, 1 = audioElementB is active
    this.preload = null; // { index, track, ready }
    this.transition = null; // { fromIndex, toIndex } while a crossfade ramp is in progress
    this.crossfadeDuration = 0; // seconds, 0 = off (gapless hard-swap)
    this.loadSettings();
  }

  getActiveElement() {
    return this.activeIndex === 0 ? this.player.audioElementA : this.player.audioElementB;
  }

  getInactiveElement() {
    return this.activeIndex === 0 ? this.player.audioElementB : this.player.audioElementA;
  }

  getActiveGain() {
    return this.player.equalizer.getGainNode(this.getActiveElement());
  }

  getInactiveGain() {
    return this.player.equalizer.getGainNode(this.getInactiveElement());
  }

  loadSettings() {
    try {
      const saved = localStorage.getItem('crossfade-settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        this.crossfadeDuration = Math.max(0, Math.min(10, Number(parsed.duration) || 0));
      }
    } catch (error) {
      this.player.ui.logBoth('warning', `Failed to load crossfade settings: ${error.message}`);
    }
  }

  setCrossfadeDuration(seconds) {
    this.crossfadeDuration = Math.max(0, Math.min(10, Number(seconds) || 0));
    try {
      localStorage.setItem('crossfade-settings', JSON.stringify({ duration: this.crossfadeDuration }));
    } catch (error) {
      this.player.ui.logBoth('warning', `Failed to save crossfade settings: ${error.message}`);
    }
  }

  // Non-mutating lookup of what would play next; mirrors AudioPlayerPlayback's selection rules
  peekNextTrack() {
    return this.player.playback.peekNextTrack();
  }

  // Stage the next track on the currently-inactive element so a later transition is instant
  prepareNextTrack() {
    const peek = this.peekNextTrack();
    const inactiveEl = this.getInactiveElement();

    if (!peek) {
      this.preload = null;
      inactiveEl.removeAttribute('src');
      inactiveEl.load();
      return;
    }

    if (this.preload && this.preload.index === peek.index && this.preload.track.path === peek.track.path) {
      return; // already staged
    }

    this.preload = { index: peek.index, track: peek.track, ready: false };
    this.getInactiveGain().gain.setValueAtTime(0, this.player.equalizer.audioContext.currentTime);

    const stagedPath = peek.track.path;
    const onReady = () => {
      if (this.preload && this.preload.track.path === stagedPath) {
        this.preload.ready = true;
      }
      inactiveEl.removeEventListener('loadedmetadata', onReady);
    };
    inactiveEl.addEventListener('loadedmetadata', onReady);

    inactiveEl.src = `file://${peek.track.path}`;
    inactiveEl.playbackRate = this.player.audioPlayerState.playbackSpeed;
    inactiveEl.load();
  }
```

Note: this code block deliberately ends with only the closing brace of the `prepareNextTrack()` method (one `}`), NOT the class's closing brace. The class body continues directly with Part B's methods, and Part B supplies the final class-closing `}`.

## Part B (transition trigger/finalize methods, appended to the same class body)

Insert the following methods inside the same `class AudioPlayerCrossfade { ... }` body, immediately after `prepareNextTrack()` and before the closing `}` of the class. See `02-new-file-AudioPlayerCrossfade-partB.md` for this content.
