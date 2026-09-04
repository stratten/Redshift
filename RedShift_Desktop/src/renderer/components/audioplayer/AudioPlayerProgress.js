/**
 * AudioPlayerProgress
 * Handles smooth progress tracking using requestAnimationFrame
 */
class AudioPlayerProgress {
  constructor(audioPlayer) {
    this.player = audioPlayer;
  }

  // Smooth progress loop using requestAnimationFrame; single source of truth
  //
  // The visible motion is NOT produced by how often this loop writes a new
  // width (that alone would mean the bar only actually moves once every
  // write, in whole-device-pixel jumps once enough sub-pixel movement has
  // accumulated — a visible "tick" at any write interval, since real songs
  // move the bar well under 1px per frame at 30-60fps). Instead this loop
  // writes deliberately infrequently (see UPDATE_INTERVAL_MS below), and the
  // browser's own compositor smoothly interpolates every physical display
  // frame between writes via the linear CSS transition on .progress-bar-full
  // (player.css) — as long as that transition's duration matches this
  // interval exactly, each write's transition finishes right as the next
  // write starts, so there's no overlap/restart glitch and no dependence on
  // this loop's own cadence for smoothness.
  startProgressLoop() {
    if (this.player.progressRafId) return; // already running
    const UPDATE_INTERVAL_MS = 250; // must match the transition duration in player.css .progress-bar-full
    const tick = (ts) => {
      if (!this.player.lastRafUpdate || ts - this.player.lastRafUpdate >= UPDATE_INTERVAL_MS) {
        if (!this.player.isSeeking) {
          const currentTime = this.player.audioElement.currentTime;
          this.player.updateProgress(currentTime, this.player.audioElement.duration || 0);
          this.player.lastDisplayedTime = currentTime;
        }
        this.player.lastRafUpdate = ts;
      }
      // Continue only while playing
      if (!this.player.audioElement.paused && !this.player.audioElement.ended) {
        this.player.progressRafId = window.requestAnimationFrame(tick);
      } else {
        this.player.progressRafId = null;
      }
    };
    this.player.progressRafId = window.requestAnimationFrame(tick);
  }

  stopProgressLoop() {
    if (this.player.progressRafId) {
      window.cancelAnimationFrame(this.player.progressRafId);
      this.player.progressRafId = null;
    }
  }
}

