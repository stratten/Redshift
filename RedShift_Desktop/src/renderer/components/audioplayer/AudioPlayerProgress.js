/**
 * AudioPlayerProgress
 * Handles smooth progress tracking using requestAnimationFrame
 */
class AudioPlayerProgress {
  constructor(audioPlayer) {
    this.player = audioPlayer;
  }

  // Smooth progress loop using requestAnimationFrame; single source of truth
  startProgressLoop() {
    if (this.player.progressRafId) return; // already running
    const tick = (ts) => {
      // Limit UI writes to ~30fps
      if (!this.player.lastRafUpdate || ts - this.player.lastRafUpdate >= 33) {
        if (!this.player.isSeeking) {
          const currentTime = this.player.audioElement.currentTime;
          // No smoothing math needed here; rAF cadence regularises updates
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

