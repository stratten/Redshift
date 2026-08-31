# Edits: `AudioPlayerPlayback.js` (continued)

## Edit 3 - `playTrack` cancels any in-flight transition and refreshes the preload

Anchor (unique - end of the existing `playTrack` method):

```javascript
      // Play via IPC (for state management) and local element
      await window.electronAPI.invoke('audio-play');
      await this.player.audioElement.play();
      
      // Update queue preview after track starts playing
      this.player.queueManager.updateQueuePreview();
```

Replacement:

```javascript
      // Manual/direct playback always targets the currently-active element; cancel any
      // in-flight crossfade first so we don't leave the background element playing.
      if (this.player.crossfade) this.player.crossfade.cancelTransition();
      
      // Play via IPC (for state management) and local element
      await window.electronAPI.invoke('audio-play');
      await this.player.audioElement.play();
      
      // Now that the new track is confirmed current, stage whatever comes after it
      if (this.player.crossfade) this.player.crossfade.prepareNextTrack();
      
      // Update queue preview after track starts playing
      this.player.queueManager.updateQueuePreview();
```

## Edit 4 - `playNext` and `playPrevious` refresh the preload after a manual jump

Anchor (unique - the full existing `playNext` method):

```javascript
  // Play next track in context
  async playNext() {
    const nextTrack = this.getNextTrack();
    if (nextTrack) {
      this.player.ui.logBoth('info', `Manual next: playing ${nextTrack.name}`);
      await this.playTrack(nextTrack.path, nextTrack);
    } else if (this.player.audioPlayerState.repeatMode === 'all' && this.player.audioPlayerState.currentContextTracks.length > 0) {
      // Repeat all - go back to the first track
      this.player.ui.logBoth('info', 'Manual next with repeat all: restarting from beginning');
      this.player.audioPlayerState.currentTrackIndex = 0;
      const firstTrack = this.player.audioPlayerState.currentContextTracks[0];
      await this.playTrack(firstTrack.path, firstTrack);
    } else {
      this.player.ui.logBoth('warning', 'No next track available');
    }
  }
```

Replacement (only the added trailing hook; body otherwise unchanged - `playTrack` already calls `prepareNextTrack()` per Edit 3 above, so no further change is required here beyond confirming this method routes through `playTrack`, which it already does):

```javascript
  // Play next track in context
  async playNext() {
    const nextTrack = this.getNextTrack();
    if (nextTrack) {
      this.player.ui.logBoth('info', `Manual next: playing ${nextTrack.name}`);
      await this.playTrack(nextTrack.path, nextTrack);
    } else if (this.player.audioPlayerState.repeatMode === 'all' && this.player.audioPlayerState.currentContextTracks.length > 0) {
      // Repeat all - go back to the first track
      this.player.ui.logBoth('info', 'Manual next with repeat all: restarting from beginning');
      this.player.audioPlayerState.currentTrackIndex = 0;
      const firstTrack = this.player.audioPlayerState.currentContextTracks[0];
      await this.playTrack(firstTrack.path, firstTrack);
    } else {
      this.player.ui.logBoth('warning', 'No next track available');
    }
  }
```

No text changes needed for `playPrevious()` either, for the same reason - it already ends by calling `await this.playTrack(prevTrack.path, prevTrack);`, which now cancels any transition and re-primes the preload. This is called out explicitly so the implementer does not skip `playNext`/`playPrevious` looking for a missing edit.
