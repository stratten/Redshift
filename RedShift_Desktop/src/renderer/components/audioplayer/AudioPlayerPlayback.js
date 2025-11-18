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
    this.player.ui.logBoth('info', `Set playback context: ${context} with ${tracks.length} tracks, starting at index ${currentTrackIndex}`);
  }

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

  // Enhanced play track method that works with context
  async playTrack(filePath, track = null) {
    try {
      this.player.ui.logBoth('info', `Playing track: ${filePath}`);
      
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

