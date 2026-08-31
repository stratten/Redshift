# Edits: `RedShift_Desktop/src/renderer/components/audioplayer/AudioPlayerPlayback.js`

## Edit 1 - `handleTrackEnded` delegates to the crossfade engine; old body becomes `handleTrackEndedFallback`

Anchor (unique - the full existing `handleTrackEnded` method):

```javascript
  // Handle when a track ends - auto-advance to next track
  async handleTrackEnded() {
    const trackName = this.player.audioPlayerState.currentTrack?.name || this.player.audioPlayerState.currentTrack?.filename || 'Unknown';
    const trackPath = this.player.audioPlayerState.currentTrack?.filePath || this.player.audioPlayerState.currentTrack?.path;
    
    this.player.ui.logBoth('info', `🎵 Track ended handler called for: ${trackName}`);
    this.player.ui.logBoth('info', `   Context: ${this.player.audioPlayerState.currentContext}, Repeat: ${this.player.audioPlayerState.repeatMode}`);
    
    // Notify main process that track ended (for play count tracking)
    if (trackPath) {
      try {
        this.player.ui.logBoth('info', `📤 Sending track-ended notification to main process...`);
        const result = await window.electronAPI.invoke('audio-track-ended-notify', trackPath);
        if (result) {
          this.player.ui.logBoth('success', `✅ Main process confirmed play count update for: ${trackName}`);
          
          // Dispatch custom event to immediately update UI
          const event = new CustomEvent('play-count-incremented', {
            detail: { filePath: trackPath }
          });
          window.dispatchEvent(event);
          this.player.ui.logBoth('info', `📤 Dispatched play-count-incremented event for UI update`);
        } else {
          this.player.ui.logBoth('warning', `⚠️ Main process returned false for: ${trackName}`);
        }
      } catch (error) {
        this.player.ui.logBoth('error', `❌ Failed to notify track ended: ${error.message}`);
      }
    } else {
      this.player.ui.logBoth('warning', `⚠️ No track path available, skipping play count update`);
    }
    
    // Handle repeat one - replay the same track
    if (this.player.audioPlayerState.repeatMode === 'one') {
      this.player.ui.logBoth('info', 'Repeat one mode - replaying current track');
      this.player.audioElement.currentTime = 0;
      await this.player.audioElement.play();
      return;
    }
    
    // Try to get next track
    const nextTrack = this.getNextTrack();
    
    if (nextTrack) {
      this.player.ui.logBoth('info', `Auto-advancing to next track: ${nextTrack.name}`);
      await this.playTrack(nextTrack.path, nextTrack);
    } else if (this.player.audioPlayerState.repeatMode === 'all' && this.player.audioPlayerState.currentContextTracks.length > 0) {
      // Repeat all - go back to the first track
      this.player.ui.logBoth('info', 'Repeat all mode - restarting from beginning');
      this.player.audioPlayerState.currentTrackIndex = 0;
      const firstTrack = this.player.audioPlayerState.currentContextTracks[0];
      await this.playTrack(firstTrack.path, firstTrack);
    } else {
      this.player.ui.logBoth('info', 'No next track available - playback ended');
    }
  }
```

Replacement:

```javascript
  // Handle when a track ends - the crossfade engine owns the fast path (preloaded swap or
  // ramped crossfade); this only runs directly if the engine failed to initialize.
  async handleTrackEnded() {
    if (this.player.crossfade) {
      await this.player.crossfade.handleActiveEnded();
      return;
    }
    await this.handleTrackEndedFallback();
  }
  
  // Slow-path advance: used by the crossfade engine when nothing was preloaded in time
  // (very short track, still loading, or genuinely at the end of the queue with no repeat).
  async handleTrackEndedFallback() {
    if (this.player.audioPlayerState.repeatMode === 'one') {
      this.player.ui.logBoth('info', 'Repeat one mode - replaying current track');
      this.player.audioElement.currentTime = 0;
      await this.player.audioElement.play();
      return;
    }
    
    const nextTrack = this.getNextTrack();
    
    if (nextTrack) {
      this.player.ui.logBoth('info', `Auto-advancing to next track: ${nextTrack.name}`);
      await this.playTrack(nextTrack.path, nextTrack);
    } else if (this.player.audioPlayerState.repeatMode === 'all' && this.player.audioPlayerState.currentContextTracks.length > 0) {
      this.player.ui.logBoth('info', 'Repeat all mode - restarting from beginning');
      this.player.audioPlayerState.currentTrackIndex = 0;
      const firstTrack = this.player.audioPlayerState.currentContextTracks[0];
      await this.playTrack(firstTrack.path, firstTrack);
    } else {
      this.player.audioPlayerState.isPlaying = false;
      this.player.updatePlaybackState(false);
      this.player.ui.logBoth('info', 'No next track available - playback ended');
    }
  }
```

Rationale: the play-count IPC call is no longer awaited before deciding the next track - `AudioPlayerCrossfade.notifyTrackEndedForPlayCount()` fires it without blocking. This fallback path keeps the exact original (slower, IPC-first) behavior for the rare case where nothing was preloaded, which is strictly better than today (today this was the *only* path, always).
