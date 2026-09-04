// src/renderer/components/audioplayer/AudioPlayerVisualizer.js
// Drives the tiny 3-bar "now playing" indicator shown in every track list
// row (col-nowplaying), replacing the old pulsing ♫ glyph. Unlike a plain
// loudness/VU meter, each bar tracks a different coarse frequency band
// (bass/mid/treble) using real data from the Web Audio graph the equalizer
// already builds, so the indicator visibly reacts differently across the
// spectrum rather than moving as one blob.

class AudioPlayerVisualizer {
  constructor(audioPlayer) {
    this.player = audioPlayer;
    this.analyser = null;
    this.dataArray = null;
    this.rafId = null;
    this.connectedGainNodes = new WeakSet();
  }

  // Lazily creates a small-FFT analyser and taps it off of both crossfade
  // chains' gain nodes. Connecting a node to an additional destination
  // (the analyser) does not remove or alter its existing connection to
  // audioContext.destination, so this can't affect what's actually audible.
  ensureAnalyser() {
    const equalizer = this.player.equalizer;
    if (!equalizer || !equalizer.audioContext) return null;

    if (!this.analyser) {
      this.analyser = equalizer.audioContext.createAnalyser();
      // 64 frequency bins (fftSize / 2) is far more resolution than this
      // 3-bar indicator needs, but is a cheap FFT size and leaves easy
      // headroom if the bar count ever grows.
      this.analyser.fftSize = 128;
      // The analyser's own built-in smoothing avoids frame-to-frame flicker
      // without needing extra averaging logic on our side.
      this.analyser.smoothingTimeConstant = 0.6;
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    }

    (equalizer.chains || []).forEach((chain) => {
      if (chain.gainNode && !this.connectedGainNodes.has(chain.gainNode)) {
        chain.gainNode.connect(this.analyser);
        this.connectedGainNodes.add(chain.gainNode);
      }
    });

    return this.analyser;
  }

  start() {
    const analyser = this.ensureAnalyser();
    if (!analyser || this.rafId) return; // already running, or no audio graph yet
    const tick = () => {
      this.updateBars();
      this.rafId = window.requestAnimationFrame(tick);
    };
    this.rafId = window.requestAnimationFrame(tick);
  }

  stop() {
    if (this.rafId) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    // Settle any visible bars back to their CSS resting height rather than
    // leaving them frozen at whatever height they had the instant playback
    // stopped.
    document.querySelectorAll('.now-playing-bars.playing .now-playing-bar').forEach((bar) => {
      bar.style.height = '';
    });
  }

  updateBars() {
    const bars = document.querySelectorAll('.now-playing-bars.playing .now-playing-bar');
    if (bars.length === 0 || !this.analyser) return;

    this.analyser.getByteFrequencyData(this.dataArray);
    const heights = this.computeBandHeights();

    // The same live audio drives every visible "now playing" indicator at
    // once (e.g. if the current track's row happens to be visible in both
    // the main library and an artist detail view) — each just cycles
    // through the same band heights independently of which row it's in.
    bars.forEach((barEl, index) => {
      barEl.style.height = `${heights[index % heights.length]}px`;
    });
  }

  // Groups the analyser's frequency bins into 3 coarse bands (bass/mid/
  // treble) instead of a single averaged level, so the indicator is a real
  // (if tiny) spectrum reaction rather than a loudness meter.
  computeBandHeights() {
    const bins = this.dataArray;
    const bandCount = 3;
    const binsPerBand = Math.floor(bins.length / bandCount);
    const minHeight = 3;
    const maxHeight = 14; // matches .now-playing-bars column height in CSS

    const heights = [];
    for (let band = 0; band < bandCount; band++) {
      const start = band * binsPerBand;
      const end = start + binsPerBand;
      let sum = 0;
      for (let i = start; i < end; i++) sum += bins[i];
      const average = sum / binsPerBand; // 0-255
      const normalized = average / 255;
      heights.push(minHeight + normalized * (maxHeight - minHeight));
    }
    return heights;
  }
}
