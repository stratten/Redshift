/**
 * AudioPlayerPlayback
 * Handles core playback logic: playing tracks, advancing, context management
 */
class AudioPlayerPlayback {
  constructor(audioPlayer) {
    this.player = audioPlayer;
  }

  // Set the current playback context (what list of tracks we're playing from)
  setPlaybackContext(context, tracks, currentTrackIndex = 0) {
    this.player.audioPlayerState.currentContext = context;
    this.player.audioPlayerState.currentContextTracks = tracks;
    this.player.audioPlayerState.currentTrackIndex = currentTrackIndex;
    this.player.crossfade?.invalidatePreload();
    this.player.ui.logBoth('info', `Set playback context: ${context} with ${tracks.length} tracks, starting at index ${currentTrackIndex}`);
  }

  // Slow fallback if the next track was not ready by the natural end of this track.
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
    } else {
      this.player.audioPlayerState.isPlaying = false;
      this.player.updatePlaybackState(false);
      this.player.stopProgressLoop();
      this.player.ui.logBoth('info', 'No next track available - playback ended');
    }
  }

  // Look up the next track without moving the current index. The crossfade engine uses this
  // to preload the exact same candidate that getNextTrack() later commits.
  peekNextTrack() {
    if (!this.player.audioPlayerState.currentContextTracks || this.player.audioPlayerState.currentContextTracks.length === 0) {
      return null;
    }

    const tracks = this.player.audioPlayerState.currentContextTracks;
    const currentIndex = this.player.audioPlayerState.currentTrackIndex;
    const staged = this.player.crossfade?.preload;
    if (staged?.originIndex === currentIndex && tracks[staged.index] === staged.track) {
      return { index: staged.index, track: staged.track };
    }

    let nextIndex;
    if (this.player.audioPlayerState.shuffleMode) {
      if (tracks.length <= 1) return null;
      do {
        nextIndex = Math.floor(Math.random() * tracks.length);
      } while (nextIndex === currentIndex);
    } else {
      nextIndex = currentIndex + 1;
      if (nextIndex >= tracks.length) {
        if (this.player.audioPlayerState.repeatMode !== 'all') return null;
        nextIndex = 0;
      }
    }
    return { index: nextIndex, track: tracks[nextIndex] };
  }

  // Get and commit the next track for manual navigation or fallback playback.
  getNextTrack() {
    const next = this.peekNextTrack();
    if (!next) {
      this.player.ui.logBoth('info', 'No next track available (end of list or empty context)');
      return null;
    }
    this.player.audioPlayerState.currentTrackIndex = next.index;
    return next.track;
  }

  // Update renderer and main-process state after a preloaded track has begun playing.
  commitAdvance(index, track) {
    const filePath = track.path || track.filePath;
    const fileName = filePath.split('/').pop();
    const trackName = track.name || track.metadata?.common?.title || fileName;
    this.player.audioPlayerState.currentTrackIndex = index;
    this.player.audioPlayerState.currentTrack = { ...track, path: filePath, name: trackName };
    this.player.lastDisplayedTime = 0;
    this.player.updateTrackInfo({
      filename: trackName,
      metadata: track.metadata || { common: { title: trackName.replace(/\.\w+$/, ''), artist: 'Unknown Artist' } }
    });
    window.electronAPI.invoke('audio-load-track', filePath).then(() => {
      return window.electronAPI.invoke('audio-play');
    }).catch((error) => {
      this.player.ui.logBoth('warning', `Main-process track mirror failed: ${error.message}`);
    });
    this.player.queueManager.updateQueuePreview();
    if (this.player.ui.musicLibrary) this.player.ui.musicLibrary.renderMusicTable();
    if (this.player.ui.albumsView?.selectedAlbum) this.player.ui.albumsView.renderDetailView();
    if (this.player.ui.artistsView?.selectedArtist) this.player.ui.artistsView.renderDetailView();
    if (this.player.ui.playlistManager?.currentPlaylist) this.player.ui.playlistManager.renderPlaylistTracks();
  }

  // Enhanced play track method that works with context
  async playTrack(filePath, track = null) {
    try {
      this.player.ui.logBoth('info', `Playing track: ${filePath}`);
      this.player.crossfade?.cancelTransition();
      
      // If no track object provided, try to find it in the current context
      if (!track && this.player.audioPlayerState.currentContextTracks) {
        track = this.player.audioPlayerState.currentContextTracks.find(t => t.path === filePath);
        
        // Also update the current track index
        if (track) {
          const index = this.player.audioPlayerState.currentContextTracks.findIndex(t => t.path === filePath);
          if (index >= 0) {
            this.player.audioPlayerState.currentTrackIndex = index;
          }
        }
      }
      
      // Load track via AudioPlayerService for state management
      await window.electronAPI.invoke('audio-load-track', filePath);
      
      // Set up local audio element
      this.player.audioElement.src = `file://${filePath}`;
      
      // Apply playback speed (persists across tracks)
      this.player.audioElement.playbackRate = this.player.audioPlayerState.playbackSpeed;
      
      // Ensure currentTrack always has path and name for play count tracking
      const fileName = filePath.split('/').pop();
      const trackName = track?.name || track?.metadata?.common?.title || fileName;
      
      // Spread track properties first, then FORCE overwrite path and name to guarantee they're set
      this.player.audioPlayerState.currentTrack = {
        ...(track || {}),         // Spread any additional properties FIRST
        path: filePath,           // Then FORCE path (overwrites any track.path)
        name: trackName           // Then FORCE name (overwrites any track.name)
      }
      
      this.player.ui.logBoth('info', `   Set currentTrack - path: ${this.player.audioPlayerState.currentTrack.path ? 'SET' : 'MISSING'}, name: ${this.player.audioPlayerState.currentTrack.name || 'MISSING'}`);
      
      // Reset time smoothing for new track
      this.player.lastDisplayedTime = 0;
      
      // Update track info display
      this.player.updateTrackInfo({
        filename: track ? track.name : filePath.split('/').pop(),
        metadata: track?.metadata || { 
          common: {
            title: track ? track.name.replace(/\.\w+$/, '') : filePath.split('/').pop().replace(/\.\w+$/, ''),
            artist: 'Unknown Artist'
          }
        }
      });
      
      // Play via IPC (for state management) and local element
      await window.electronAPI.invoke('audio-play');
      await this.player.audioElement.play();
      
      // Stage the following track now, while the current one is audible.
      this.player.crossfade?.prepareNextTrack();

      // Update queue preview after track starts playing
      this.player.queueManager.updateQueuePreview();
      
      // Update now-playing indicator in all visible track lists
      if (this.player.ui.musicLibrary) {
        this.player.ui.musicLibrary.renderMusicTable();
      }
      if (this.player.ui.albumsView && this.player.ui.albumsView.selectedAlbum) {
        this.player.ui.albumsView.renderDetailView();
      }
      if (this.player.ui.artistsView && this.player.ui.artistsView.selectedArtist) {
        this.player.ui.artistsView.renderDetailView();
      }
      if (this.player.ui.playlistManager && this.player.ui.playlistManager.currentPlaylist) {
        this.player.ui.playlistManager.renderPlaylistTracks();
      }
      
      this.player.ui.logBoth('success', `Track loaded and playing: ${track ? track.name : filePath}`);
    } catch (error) {
      this.player.ui.logBoth('error', `Error playing track: ${error.message}`);
    }
  }

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

  // Play previous track in context
  async playPrevious() {
    if (!this.player.audioPlayerState.currentContextTracks || this.player.audioPlayerState.currentContextTracks.length === 0) {
      this.player.ui.logBoth('warning', 'No context tracks available for previous');
      return;
    }

    const tracks = this.player.audioPlayerState.currentContextTracks;
    let prevIndex;

    if (this.player.audioPlayerState.shuffleMode) {
      // In shuffle mode, previous is random (but not current track)
      if (tracks.length <= 1) return;
      
      do {
        prevIndex = Math.floor(Math.random() * tracks.length);
      } while (prevIndex === this.player.audioPlayerState.currentTrackIndex && tracks.length > 1);
      
      this.player.ui.logBoth('info', `Shuffle mode - selected random previous track at index ${prevIndex}`);
    } else {
      // Sequential mode - previous track in order
      prevIndex = this.player.audioPlayerState.currentTrackIndex - 1;
      
      if (prevIndex < 0) {
        if (this.player.audioPlayerState.repeatMode === 'all') {
          // Repeat all - go to last track
          prevIndex = tracks.length - 1;
          this.player.ui.logBoth('info', 'Repeat all mode: going to last track');
        } else {
          this.player.ui.logBoth('warning', 'Already at first track');
          return;
        }
      }
    }

    this.player.audioPlayerState.currentTrackIndex = prevIndex;
    const prevTrack = tracks[prevIndex];
    
    this.player.ui.logBoth('info', `Manual previous: playing ${prevTrack.name}`);
    await this.playTrack(prevTrack.path, prevTrack);
  }
}

