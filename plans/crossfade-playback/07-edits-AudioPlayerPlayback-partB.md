# Edits: `AudioPlayerPlayback.js` (continued)

## Edit 2 - split `getNextTrack` into a pure `peekNextTrack` plus a thin mutating wrapper, add `commitAdvance`

Anchor (unique - the full existing `getNextTrack` method):

```javascript
  // Get the next track based on current context and playback mode
  getNextTrack() {
    if (!this.player.audioPlayerState.currentContextTracks || this.player.audioPlayerState.currentContextTracks.length === 0) {
      this.player.ui.logBoth('warning', 'No context tracks available for auto-advance');
      return null;
    }

    const tracks = this.player.audioPlayerState.currentContextTracks;
    let nextIndex;

    if (this.player.audioPlayerState.shuffleMode) {
      // Shuffle mode - pick a random track that's not the current one
      if (tracks.length <= 1) return null;
      
      do {
        nextIndex = Math.floor(Math.random() * tracks.length);
      } while (nextIndex === this.player.audioPlayerState.currentTrackIndex && tracks.length > 1);
      
      this.player.ui.logBoth('info', `Shuffle mode - selected random track at index ${nextIndex}`);
    } else {
      // Sequential mode - next track in order
      nextIndex = this.player.audioPlayerState.currentTrackIndex + 1;
      
      if (nextIndex >= tracks.length) {
        this.player.ui.logBoth('info', 'Reached end of track list');
        return null; // End of list
      }
    }

    this.player.audioPlayerState.currentTrackIndex = nextIndex;
    return tracks[nextIndex];
  }
```

Replacement:

```javascript
  // Pure lookup of what would play next, without mutating any state. Shared by manual
  // "Next" navigation, the crossfade engine's preloader, and the queue preview so they all
  // agree on the same track (shuffle mode's random pick is only rolled once, here, and reused
  // by whichever caller ends up committing to it via commitAdvance/getNextTrack).
  peekNextTrack() {
    if (!this.player.audioPlayerState.currentContextTracks || this.player.audioPlayerState.currentContextTracks.length === 0) {
      return null;
    }

    const tracks = this.player.audioPlayerState.currentContextTracks;
    const currentIndex = this.player.audioPlayerState.currentTrackIndex;
    let nextIndex;

    if (this.player.audioPlayerState.shuffleMode) {
      if (tracks.length <= 1) return null;
      do {
        nextIndex = Math.floor(Math.random() * tracks.length);
      } while (nextIndex === currentIndex && tracks.length > 1);
    } else {
      nextIndex = currentIndex + 1;
      if (nextIndex >= tracks.length) return null;
    }

    return { index: nextIndex, track: tracks[nextIndex] };
  }

  // Get the next track based on current context and playback mode, committing to it
  getNextTrack() {
    const peek = this.peekNextTrack();
    if (!peek) {
      this.player.ui.logBoth('info', 'No next track available (end of list or empty context)');
      return null;
    }
    this.player.audioPlayerState.currentTrackIndex = peek.index;
    return peek.track;
  }

  // Commit an already-decided advance (used by AudioPlayerCrossfade after a preloaded swap
  // has already started playing audio) - updates state/UI without touching the audio element.
  commitAdvance(index, track) {
    this.player.audioPlayerState.currentTrackIndex = index;
    const fileName = track.path ? track.path.split('/').pop() : (track.name || 'Unknown');
    this.player.audioPlayerState.currentTrack = {
      ...track,
      path: track.path,
      name: track.name || fileName
    };
    this.player.lastDisplayedTime = 0;
    this.player.updateTrackInfo({
      filename: track.name || fileName,
      metadata: track.metadata || {
        common: {
          title: (track.name || fileName).replace(/\.\w+$/, ''),
          artist: 'Unknown Artist'
        }
      }
    });
    
    window.electronAPI.invoke('audio-load-track', track.path).catch((error) => {
      this.player.ui.logBoth('warning', `Main-process track mirror failed: ${error.message}`);
    });
    window.electronAPI.invoke('audio-play').catch(() => {});
    
    this.player.queueManager.updateQueuePreview();
    if (this.player.ui.musicLibrary) this.player.ui.musicLibrary.renderMusicTable();
    if (this.player.ui.albumsView && this.player.ui.albumsView.selectedAlbum) this.player.ui.albumsView.renderDetailView();
    if (this.player.ui.artistsView && this.player.ui.artistsView.selectedArtist) this.player.ui.artistsView.renderDetailView();
    if (this.player.ui.playlistManager && this.player.ui.playlistManager.currentPlaylist) this.player.ui.playlistManager.renderPlaylistTracks();
    
    this.player.ui.logBoth('success', `Advanced to: ${track.name || fileName}`);
  }
```

Note: `commitAdvance` reuses the exact tail-end bookkeeping already present in `playTrack()` (UI refresh calls, `currentTrack` shape) so both the "load from scratch" path and the "already playing via preload" path leave `audioPlayerState` in an identical shape.
