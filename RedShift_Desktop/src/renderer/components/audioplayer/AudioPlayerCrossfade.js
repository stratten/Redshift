// src/renderer/components/audioplayer/AudioPlayerCrossfade.js - Gapless/crossfade playback
class AudioPlayerCrossfade {
  constructor(audioPlayer) {
    this.player = audioPlayer;
    this.activeIndex = 0;
    this.preload = null;
    this.transition = null;
    this.crossfadeDuration = 0;
    this.preloadToken = 0;
    this.loadSettings();
  }

  getActiveElement() {
    return this.getElement(this.activeIndex);
  }

  getInactiveElement() {
    return this.getElement(this.activeIndex === 0 ? 1 : 0);
  }

  getElement(index) {
    return index === 0 ? this.player.audioElementA : this.player.audioElementB;
  }

  getGainNode(index) {
    return this.player.equalizer.getGainNode(this.getElement(index));
  }

  loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem('crossfade-settings') || '{}');
      this.crossfadeDuration = Math.max(0, Math.min(10, Number(saved.duration) || 0));
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

  invalidatePreload() {
    if (this.transition) return;
    this.preload = null;
    this.preloadToken++;
    const inactive = this.getInactiveElement();
    inactive.pause();
    inactive.removeAttribute('src');
    inactive.load();
  }

  prepareNextTrack() {
    if (this.transition || this.player.audioPlayerState.repeatMode === 'one') return;

    const candidate = this.player.playback.peekNextTrack();
    const inactiveIndex = this.activeIndex === 0 ? 1 : 0;
    const inactiveElement = this.getElement(inactiveIndex);
    const inactiveGain = this.getGainNode(inactiveIndex);
    const token = ++this.preloadToken;

    this.preload = null;
    inactiveElement.pause();
    inactiveElement.removeAttribute('src');
    inactiveElement.load();

    if (!candidate) return;

    this.preload = { ...candidate, ready: false, token };
    const filePath = candidate.track.path || candidate.track.filePath;
    inactiveGain.gain.setValueAtTime(0, this.player.equalizer.audioContext.currentTime);
    inactiveElement.playbackRate = this.player.audioPlayerState.playbackSpeed;
    inactiveElement.volume = this.player.audioPlayerState.volume;
    inactiveElement.muted = this.getActiveElement().muted;

    const markReady = () => {
      if (this.preload?.token === token) this.preload.ready = true;
      inactiveElement.removeEventListener('canplay', markReady);
    };
    inactiveElement.addEventListener('canplay', markReady);
    inactiveElement.src = `file://${filePath}`;
    inactiveElement.load();
  }

  onTimeUpdate() {
    const activeElement = this.getActiveElement();
    const remaining = activeElement.duration - activeElement.currentTime;
    if (this.transition || this.crossfadeDuration <= 0 || !this.preload?.ready || !Number.isFinite(remaining) || remaining <= 0 || remaining > this.crossfadeDuration) return;
    this.beginCrossfade(remaining);
  }

  beginCrossfade(remaining) {
    const fromIndex = this.activeIndex;
    const toIndex = fromIndex === 0 ? 1 : 0;
    const incoming = this.getElement(toIndex);
    const context = this.player.equalizer.audioContext;
    const outgoingGain = this.getGainNode(fromIndex).gain;
    const incomingGain = this.getGainNode(toIndex).gain;

    this.transition = { fromIndex, toIndex };
    incoming.currentTime = 0;
    incoming.play().catch((error) => {
      this.player.ui.logBoth('error', `Crossfade incoming playback failed: ${error.message}`);
      this.cancelTransition();
    });

    const now = context.currentTime;
    outgoingGain.cancelScheduledValues(now);
    outgoingGain.setValueAtTime(outgoingGain.value, now);
    outgoingGain.linearRampToValueAtTime(0, now + remaining);
    incomingGain.cancelScheduledValues(now);
    incomingGain.setValueAtTime(0, now);
    incomingGain.linearRampToValueAtTime(1, now + remaining);
  }

  async handleActiveEnded() {
    if (this.player.audioPlayerState.repeatMode === 'one') {
      const activeElement = this.getActiveElement();
      activeElement.currentTime = 0;
      await activeElement.play();
      return;
    }

    if (this.transition) {
      this.finalizeTransition();
    } else if (this.preload?.ready) {
      try {
        await this.swapToPreloaded();
      } catch (error) {
        this.player.ui.logBoth('error', `Gapless transition failed: ${error.message}`);
        await this.player.playback.handleTrackEndedFallback();
      }
    } else {
      await this.player.playback.handleTrackEndedFallback();
    }
  }

  async swapToPreloaded() {
    const toIndex = this.activeIndex === 0 ? 1 : 0;
    const incoming = this.getElement(toIndex);
    this.getGainNode(toIndex).gain.setValueAtTime(1, this.player.equalizer.audioContext.currentTime);
    incoming.currentTime = 0;
    await incoming.play();
    this.transition = { fromIndex: this.activeIndex, toIndex };
    this.finalizeTransition();
  }

  finalizeTransition() {
    const { fromIndex, toIndex } = this.transition;
    const completedTrack = this.player.audioPlayerState.currentTrack;
    const next = this.preload;
    this.activeIndex = toIndex;
    this.transition = null;
    this.preload = null;
    const outgoing = this.getElement(fromIndex);
    outgoing.pause();
    outgoing.currentTime = 0;
    this.player.audioPlayerState.isPlaying = true;
    this.player.updatePlaybackState(true);
    this.player.startProgressLoop();
    this.player.visualizer.start();
    this.player.visualization.start();
    this.notifyTrackEndedForPlayCount(completedTrack);
    this.player.playback.commitAdvance(next.index, next.track);
    this.prepareNextTrack();
  }

  notifyTrackEndedForPlayCount(track) {
    const trackPath = track?.path || track?.filePath;
    if (!trackPath) return;
    window.electronAPI.invoke('audio-track-ended-notify', trackPath).then((result) => {
      if (result) window.dispatchEvent(new CustomEvent('play-count-incremented', { detail: { filePath: trackPath } }));
    }).catch((error) => this.player.ui.logBoth('error', `Failed to notify track ended: ${error.message}`));
  }

  cancelTransition() {
    if (!this.transition) return;
    const { fromIndex, toIndex } = this.transition;
    const now = this.player.equalizer.audioContext.currentTime;
    [fromIndex, toIndex].forEach((index) => {
      const gain = this.getGainNode(index).gain;
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(index === fromIndex ? 1 : 0, now);
    });
    const incoming = this.getElement(toIndex);
    incoming.pause();
    incoming.currentTime = 0;
    this.transition = null;
  }

  pauseActive() {
    this.cancelTransition();
    this.getActiveElement().pause();
  }

  resumeActive() {
    return this.getActiveElement().play();
  }
}
