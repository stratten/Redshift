// src/renderer/components/AudioPlayer.js - Audio Player Component

class AudioPlayer {
  constructor(uiManager) {
    this.ui = uiManager;
    
    // Audio player state
    this.audioPlayerState = {
      isPlaying: false,
      currentTrack: null,
      currentTrackIndex: -1,
      currentContext: null, // 'library', 'album', 'artist', 'genre', 'playlist'
      currentContextTracks: [], // The current list of tracks being played from
      volume: 1.0,
      position: 0,
      duration: 0,
      queue: [],
      shuffleMode: false,
      repeatMode: 'none'
    };
    
    // HTML5 Audio element for actual playback
    this.audioElement = new Audio();
    this.audioElement.volume = 1.0;
    this.isSeeking = false; // Flag to prevent update conflicts during seeking
    this.lastProgressUpdate = 0; // Throttle progress updates (legacy)
    this.lastDisplayedTime = 0; // For smoothing time display
    this.progressRafId = null; // requestAnimationFrame id for smooth progress
    this.lastRafUpdate = 0; // timestamp of last raf-driven UI write
    this.setupAudioElement();
    
    this.setupEventListeners();

    // Keyboard shortcuts (playback, seek, volume, modes)
    this.setupKeyboardShortcuts();
  }
  
  setupAudioElement() {
    this.ui.logBoth('info', 'Setting up HTML5 Audio element for playback');
    
    // Audio event listeners
    this.audioElement.addEventListener('loadstart', () => {
      this.ui.logBoth('info', 'Audio loading started');
    });
    
    this.audioElement.addEventListener('loadedmetadata', () => {
      this.audioPlayerState.duration = this.audioElement.duration;
      this.ui.logBoth('info', `Audio metadata loaded, duration: ${this.formatTime(this.audioElement.duration)}`);
      // Reset time tracking for new audio
      this.lastDisplayedTime = 0;
      this.updateProgress(0, this.audioElement.duration);
    });
    
    this.audioElement.addEventListener('canplay', () => {
      this.ui.logBoth('info', 'Audio ready to play');
    });
    
    this.audioElement.addEventListener('play', () => {
      this.audioPlayerState.isPlaying = true;
      this.updatePlaybackState(true);
      // Reset time tracking when playback starts to avoid initial jumps
      this.lastDisplayedTime = this.audioElement.currentTime;
      this.ui.logBoth('info', 'Audio playback started');
    });
    
    this.audioElement.addEventListener('pause', () => {
      this.audioPlayerState.isPlaying = false;
      this.updatePlaybackState(false);
      this.ui.logBoth('info', 'Audio playback paused');
    });
    
    this.audioElement.addEventListener('ended', () => {
      this.audioPlayerState.isPlaying = false;
      this.updatePlaybackState(false);
      this.ui.logBoth('info', 'Track ended');
      this.handleTrackEnded();
    });
    
    // Replace timeupdate-driven UI with a single rAF loop tied to the local Audio element
    this.audioElement.addEventListener('play', () => this.startProgressLoop());
    this.audioElement.addEventListener('pause', () => this.stopProgressLoop());
    this.audioElement.addEventListener('ended', () => this.stopProgressLoop());
    
    this.audioElement.addEventListener('volumechange', () => {
      this.audioPlayerState.volume = this.audioElement.volume;
      this.updateVolumeUI(this.audioElement.volume, this.audioElement.muted);
    });
    
    this.audioElement.addEventListener('error', (e) => {
      this.ui.logBoth('error', `Audio playback error: ${e.message || 'Unknown error'}`);
    });
  }
  
  setupEventListeners() {
    this.ui.logBoth('info', 'Setting up music player event listeners');
    
    // Play/Pause button
    document.getElementById('playPauseBtn').addEventListener('click', async () => {
      this.ui.logBoth('info', `Play/Pause clicked (currently ${this.audioPlayerState.isPlaying ? 'playing' : 'paused'})`);
      try {
        if (this.audioPlayerState.isPlaying) {
          this.ui.logBoth('info', 'Pausing audio...');
          await window.electronAPI.invoke('audio-pause');
          this.audioElement.pause();
        } else {
          if (!this.audioElement.src && !this.audioPlayerState.currentTrack) {
            this.ui.logBoth('warning', 'No track loaded. Please select a track first.');
            return;
          }
          this.ui.logBoth('info', 'Playing audio...');
          await window.electronAPI.invoke('audio-play');
          await this.audioElement.play();
        }
      } catch (error) {
        this.ui.logBoth('error', `Playback error: ${error.message}`);
      }
    });
    
    // Previous track
    document.getElementById('prevBtn').addEventListener('click', async () => {
      this.ui.logBoth('info', 'Previous track button clicked');
      try {
        await this.playPrevious();
      } catch (error) {
        this.ui.logBoth('error', `Previous track error: ${error.message}`);
      }
    });
    
    // Next track
    document.getElementById('nextBtn').addEventListener('click', async () => {
      this.ui.logBoth('info', 'Next track button clicked');
      try {
        await this.playNext();
      } catch (error) {
        this.ui.logBoth('error', `Next track error: ${error.message}`);
      }
    });
    
    // Shuffle toggle
    document.getElementById('shuffleBtn').addEventListener('click', async () => {
      const newShuffleMode = !this.audioPlayerState.shuffleMode;
      this.ui.logBoth('info', `Shuffle toggled to: ${newShuffleMode ? 'on' : 'off'}`);
      try {
        await window.electronAPI.invoke('audio-toggle-shuffle');
        // Update UI immediately (optimistic update)
        this.audioPlayerState.shuffleMode = newShuffleMode;
        this.updateShuffleButton(newShuffleMode);
      } catch (error) {
        this.ui.logBoth('error', `Shuffle error: ${error.message}`);
      }
    });
    
    // Repeat toggle
    document.getElementById('repeatBtn').addEventListener('click', async () => {
      const nextMode = this.getNextRepeatMode(this.audioPlayerState.repeatMode);
      this.ui.logBoth('info', `Repeat mode changing from ${this.audioPlayerState.repeatMode} to ${nextMode}`);
      try {
        await window.electronAPI.invoke('audio-set-repeat', nextMode);
        // Update UI immediately (optimistic update)
        this.audioPlayerState.repeatMode = nextMode;
        this.updateRepeatButton(nextMode);
      } catch (error) {
        this.ui.logBoth('error', `Repeat mode error: ${error.message}`);
      }
    });
    
    // Volume slider
    const volumeSlider = document.getElementById('volumeSlider');
    volumeSlider.addEventListener('input', (e) => {
      const volume = e.target.value / 100;
      this.ui.logBoth('info', `Volume changed to: ${Math.round(volume * 100)}%`);
      this.audioElement.volume = volume;
    });
    
    // Mute toggle
    document.getElementById('muteBtn').addEventListener('click', () => {
      this.ui.logBoth('info', 'Mute button clicked');
      this.audioElement.muted = !this.audioElement.muted;
      this.ui.logBoth('info', `Audio ${this.audioElement.muted ? 'muted' : 'unmuted'}`);
    });
    
    // Progress slider
    const progressSlider = document.getElementById('progressSlider');
    
    // Handle seeking start
    progressSlider.addEventListener('mousedown', () => {
      this.isSeeking = true;
    });
    
    // Handle seeking end
    progressSlider.addEventListener('mouseup', () => {
      this.isSeeking = false;
      // Reset time smoothing after seeking
      this.lastDisplayedTime = this.audioElement.currentTime;
    });
    
    // Handle touch start (for mobile/touch devices)
    progressSlider.addEventListener('touchstart', () => {
      this.isSeeking = true;
    });
    
    // Handle touch end
    progressSlider.addEventListener('touchend', () => {
      this.isSeeking = false;
      // Reset time smoothing after seeking
      this.lastDisplayedTime = this.audioElement.currentTime;
    });
    
    // Handle slider input
    progressSlider.addEventListener('input', (e) => {
      if (this.audioElement.duration > 0) {
        const position = (e.target.value / 100) * this.audioElement.duration;
        this.ui.logBoth('info', `Seeking to: ${this.formatTime(position)}`);
        this.audioElement.currentTime = position;
        
        // Update time display immediately during seeking
        const currentTime = document.getElementById('currentTime');
        if (currentTime) currentTime.textContent = this.formatTime(position);
      }
    });
    
    // Clear Queue button
    document.getElementById('clearQueueBtn').addEventListener('click', async () => {
      console.log('🎵 Clear Queue button clicked');
      try {
        await window.electronAPI.invoke('audio-clear-queue');
      } catch (error) {
        console.error('🎵 Error clearing queue:', error);
        this.ui.addLog('error', `Clear queue error: ${error.message}`);
      }
    });
    
    this.ui.logBoth('info', 'Music player event listeners setup complete');
  }

  setupKeyboardShortcuts() {
    const isTypingContext = () => {
      const el = document.activeElement;
      if (!el) return false;
      const tag = (el.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return true;
      const editable = el.getAttribute && el.getAttribute('contenteditable');
      return !!editable;
    };

    const clamp = (val, min, max) => Math.min(max, Math.max(min, val));

    window.addEventListener('keydown', async (e) => {
      // Ignore when typing in inputs/textareas/contenteditable
      if (isTypingContext()) return;

      try {
        switch (e.key) {
          case ' ': { // Space: toggle play/pause
            e.preventDefault();
            if (this.audioPlayerState.isPlaying) {
              await window.electronAPI.invoke('audio-pause');
              this.audioElement.pause();
            } else {
              if (!this.audioElement.src && !this.audioPlayerState.currentTrack) return;
              await window.electronAPI.invoke('audio-play');
              await this.audioElement.play();
            }
            break;
          }
          case 'ArrowRight': { // Seek forward
            const step = e.shiftKey ? 10 : 5;
            if (this.audioElement.duration > 0) {
              const nextTime = clamp((this.audioElement.currentTime || 0) + step, 0, this.audioElement.duration);
              this.audioElement.currentTime = nextTime;
              this.updateProgress(nextTime, this.audioElement.duration);
            }
            break;
          }
          case 'ArrowLeft': { // Seek backward
            const step = e.shiftKey ? 10 : 5;
            if (this.audioElement.duration > 0) {
              const nextTime = clamp((this.audioElement.currentTime || 0) - step, 0, this.audioElement.duration);
              this.audioElement.currentTime = nextTime;
              this.updateProgress(nextTime, this.audioElement.duration);
            }
            break;
          }
          case 'ArrowUp': { // Volume up
            e.preventDefault();
            const newVol = clamp((this.audioElement.volume || 0) + 0.05, 0, 1);
            this.audioElement.volume = newVol;
            break;
          }
          case 'ArrowDown': { // Volume down
            e.preventDefault();
            const newVol = clamp((this.audioElement.volume || 0) - 0.05, 0, 1);
            this.audioElement.volume = newVol;
            break;
          }
          case 'm':
          case 'M': { // Mute toggle
            this.audioElement.muted = !this.audioElement.muted;
            break;
          }
          case 's':
          case 'S': { // Shuffle toggle
            await window.electronAPI.invoke('audio-toggle-shuffle');
            this.audioPlayerState.shuffleMode = !this.audioPlayerState.shuffleMode;
            this.updateShuffleButton(this.audioPlayerState.shuffleMode);
            break;
          }
          case 'r':
          case 'R': { // Repeat cycle
            const nextMode = this.getNextRepeatMode(this.audioPlayerState.repeatMode);
            await window.electronAPI.invoke('audio-set-repeat', nextMode);
            this.audioPlayerState.repeatMode = nextMode;
            this.updateRepeatButton(nextMode);
            break;
          }
          case '[': { // Previous
            await this.playPrevious();
            break;
          }
          case ']': { // Next
            await this.playNext();
            break;
          }
          default: {
            // Number keys 0-9: jump to percentage of track
            if (/^[0-9]$/.test(e.key) && this.audioElement.duration > 0) {
              const pct = parseInt(e.key, 10) / 10; // 0 -> 0%, 9 -> 90%
              const nextTime = this.audioElement.duration * pct;
              this.audioElement.currentTime = nextTime;
              this.updateProgress(nextTime, this.audioElement.duration);
            }
          }
        }
      } catch (err) {
        this.ui.logBoth('error', `Keyboard shortcut error: ${err.message}`);
      }
    });
  }
  
  getNextRepeatMode(currentMode) {
    const modes = ['none', 'all', 'one'];
    const currentIndex = modes.indexOf(currentMode);
    return modes[(currentIndex + 1) % modes.length];
  }
  
  updateAudioPlayerState(state) {
    console.log('🎵 Updating audio player state:', state);
    this.audioPlayerState = { ...this.audioPlayerState, ...state };
    
    // Update UI based on state
    this.updatePlaybackState(state.isPlaying);
    this.updateShuffleButton(state.shuffleMode);
    this.updateRepeatButton(state.repeatMode);
    
    if (state.currentTrack) {
      this.updateTrackInfo(state.currentTrack);
    }
  }
  
  updateTrackInfo(track) {
    this.ui.logBoth('info', `Updating track info UI: ${track?.filename || 'No track'}`);
    
    // Update the header compact display (new location)
    const titleMini = document.getElementById('trackTitleMini');
    const artistMini = document.getElementById('trackArtistMini');
    const albumArtMini = document.getElementById('albumArtMini');
    
    if (track && track.metadata) {
      const title = track.metadata.common?.title || track.filename || 'Unknown Track';
      const artist = track.metadata.common?.artist || 'Unknown Artist';
      
      if (titleMini) {
        titleMini.textContent = title;
        // Measure against the wrapper, not the inline text node itself
        setTimeout(() => {
          const wrapper = titleMini.parentElement;
          const isClipped = wrapper ? (titleMini.scrollWidth > wrapper.clientWidth) : false;
          titleMini.classList.toggle('marquee-active', isClipped);
          if (!isClipped) titleMini.style.transform = 'translateX(0)';
        }, 0);
      }
      if (artistMini) {
        artistMini.textContent = artist;
        setTimeout(() => {
          const wrapper = artistMini.parentElement;
          const isClipped = wrapper ? (artistMini.scrollWidth > wrapper.clientWidth) : false;
          artistMini.classList.toggle('marquee-active', isClipped);
          if (!isClipped) artistMini.style.transform = 'translateX(0)';
        }, 0);
      }
      
      // Update compact album art
      if (albumArtMini) {
        if (track.metadata.albumArt && track.metadata.albumArt.thumbnail) {
          albumArtMini.innerHTML = `<img src="${track.metadata.albumArt.thumbnail}" alt="Album Art">`;
        } else {
          // Reset to default icon
          albumArtMini.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
              <path d="M9 18V5l12-2v13"></path>
              <circle cx="6" cy="18" r="3"></circle>
              <circle cx="18" cy="16" r="3"></circle>
            </svg>
          `;
        }
      }
      
      this.ui.logBoth('info', `Updated track info: "${title}" by "${artist}"`);
    } else {
      // No track loaded
      if (titleMini) { titleMini.textContent = 'No track loaded'; titleMini.classList.remove('marquee-active'); }
      if (artistMini) { artistMini.textContent = 'Select a track to start playing'; artistMini.classList.remove('marquee-active'); }
      
      if (albumArtMini) {
        albumArtMini.innerHTML = `
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
            <path d="M9 18V5l12-2v13"></path>
            <circle cx="6" cy="18" r="3"></circle>
            <circle cx="18" cy="16" r="3"></circle>
          </svg>
        `;
      }
    }
  }
  
  updatePlaybackState(isPlaying) {
    console.log('🎵 Updating playback state:', isPlaying);
    this.audioPlayerState.isPlaying = isPlaying;
    
    const playIcon = document.getElementById('playIcon');
    const pauseIcon = document.getElementById('pauseIcon');
    const playPauseBtn = document.getElementById('playPauseBtn');
    
    if (isPlaying) {
      playIcon.style.display = 'none';
      pauseIcon.style.display = 'block';
      playPauseBtn.title = 'Pause';
    } else {
      playIcon.style.display = 'block';
      pauseIcon.style.display = 'none';
      playPauseBtn.title = 'Play';
    }
  }
  
  updateProgress(position, duration) {
    this.audioPlayerState.position = position;
    this.audioPlayerState.duration = duration;
    
    // Update progress bar (compact header version)
    const progressPercentage = duration > 0 ? (position / duration) * 100 : 0;
    
    const progressBar = document.getElementById('progressBar');
    const progressSlider = document.getElementById('progressSlider');
    const currentTime = document.getElementById('currentTime');
    const totalTime = document.getElementById('totalTime');
    
    // Update progress bar
    if (progressBar) {
      progressBar.style.width = `${progressPercentage}%`;
    }
    
    // Only update slider if we're not seeking to prevent conflicts
    if (progressSlider && !this.isSeeking) {
      progressSlider.value = progressPercentage;
    }
    
    // Update time displays with throttling to reduce DOM updates
    if (currentTime) {
      const newTimeText = this.formatTime(position);
      if (currentTime.textContent !== newTimeText) {
        currentTime.textContent = newTimeText;
      }
    }
    
    if (totalTime) {
      const newDurationText = this.formatTime(duration);
      if (totalTime.textContent !== newDurationText) {
        totalTime.textContent = newDurationText;
      }
    }
  }
  
  updateVolumeUI(volume, isMuted) {
    console.log('🎵 Updating volume UI:', volume, 'muted:', isMuted);
    
    const volumeSlider = document.getElementById('volumeSlider');
    const volumeIcon = document.getElementById('volumeIcon');
    const muteIcon = document.getElementById('muteIcon');
    
    volumeSlider.value = volume * 100;
    
    if (isMuted || volume === 0) {
      volumeIcon.style.display = 'none';
      muteIcon.style.display = 'block';
    } else {
      volumeIcon.style.display = 'block';
      muteIcon.style.display = 'none';
    }
  }
  
  updateShuffleButton(shuffleMode) {
    console.log('🎵 Updating shuffle button:', shuffleMode);
    const shuffleBtn = document.getElementById('shuffleBtn');
    
    if (shuffleMode) {
      shuffleBtn.classList.add('active');
      shuffleBtn.title = 'Shuffle On';
    } else {
      shuffleBtn.classList.remove('active');
      shuffleBtn.title = 'Shuffle Off';
    }
  }
  
  updateRepeatButton(repeatMode) {
    console.log('🎵 Updating repeat button:', repeatMode);
    const repeatBtn = document.getElementById('repeatBtn');
    
    repeatBtn.classList.remove('repeat-none', 'repeat-all', 'repeat-one');
    repeatBtn.classList.add(`repeat-${repeatMode}`);
    
    const titles = {
      'none': 'Repeat Off',
      'all': 'Repeat All',
      'one': 'Repeat One'
    };
    repeatBtn.title = titles[repeatMode] || 'Repeat Off';
  }
  
  updateQueueUI(queue, currentIndex) {
    console.log('🎵 Updating queue UI:', queue.length, 'tracks, current index:', currentIndex);
    this.audioPlayerState.queue = queue;
    this.audioPlayerState.queueIndex = currentIndex;
    
    const queueList = document.getElementById('queueList');
    
    if (queue.length === 0) {
      queueList.innerHTML = `
        <div class="empty-state small">
          <p>No tracks in queue</p>
        </div>
      `;
      return;
    }
    
    const queueHTML = queue.map((track, index) => {
      const isActive = index === currentIndex;
      const trackName = track.metadata?.common?.title || path.basename(track.filePath);
      const artistName = track.metadata?.common?.artist || 'Unknown Artist';
      
      return `
        <div class="queue-item ${isActive ? 'active' : ''}" data-index="${index}">
          <div class="queue-track-info">
            <div class="queue-track-name">${trackName}</div>
            <div class="queue-track-artist">${artistName}</div>
          </div>
          <button class="queue-remove-btn" data-index="${index}" title="Remove from queue">×</button>
        </div>
      `;
    }).join('');
    
    queueList.innerHTML = queueHTML;
    
    // Add click listeners for queue items
    queueList.addEventListener('click', async (e) => {
      if (e.target.matches('.queue-remove-btn')) {
        const index = parseInt(e.target.dataset.index);
        console.log('🎵 Remove from queue clicked for index:', index);
        // TODO: Implement remove from queue
      } else if (e.target.closest('.queue-item')) {
        const index = parseInt(e.target.closest('.queue-item').dataset.index);
        console.log('🎵 Queue item clicked, loading track at index:', index);
        try {
          const track = queue[index];
          await window.electronAPI.invoke('audio-load-track', track.filePath);
          await window.electronAPI.invoke('audio-play');
        } catch (error) {
          console.error('🎵 Error loading track from queue:', error);
          this.ui.addLog('error', `Error loading track: ${error.message}`);
        }
      }
    });
  }
  
  formatTime(seconds) {
    if (!seconds || seconds < 0) return '0:00';
    
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // Smooth progress loop using requestAnimationFrame; single source of truth
  startProgressLoop() {
    if (this.progressRafId) return; // already running
    const tick = (ts) => {
      // Limit UI writes to ~30fps
      if (!this.lastRafUpdate || ts - this.lastRafUpdate >= 33) {
        if (!this.isSeeking) {
          const currentTime = this.audioElement.currentTime;
          // No smoothing math needed here; rAF cadence regularises updates
          this.updateProgress(currentTime, this.audioElement.duration || 0);
          this.lastDisplayedTime = currentTime;
        }
        this.lastRafUpdate = ts;
      }
      // Continue only while playing
      if (!this.audioElement.paused && !this.audioElement.ended) {
        this.progressRafId = window.requestAnimationFrame(tick);
      } else {
        this.progressRafId = null;
      }
    };
    this.progressRafId = window.requestAnimationFrame(tick);
  }

  stopProgressLoop() {
    if (this.progressRafId) {
      window.cancelAnimationFrame(this.progressRafId);
      this.progressRafId = null;
    }
  }

  // Set the current playback context (what list of tracks we're playing from)
  setPlaybackContext(context, tracks, currentTrackIndex = 0) {
    this.audioPlayerState.currentContext = context;
    this.audioPlayerState.currentContextTracks = tracks;
    this.audioPlayerState.currentTrackIndex = currentTrackIndex;
    this.ui.logBoth('info', `Set playback context: ${context} with ${tracks.length} tracks, starting at index ${currentTrackIndex}`);
  }

  // Handle when a track ends - auto-advance to next track
  async handleTrackEnded() {
    this.ui.logBoth('info', `Track ended. Current context: ${this.audioPlayerState.currentContext}, repeat mode: ${this.audioPlayerState.repeatMode}`);
    
    // Handle repeat one - replay the same track
    if (this.audioPlayerState.repeatMode === 'one') {
      this.ui.logBoth('info', 'Repeat one mode - replaying current track');
      this.audioElement.currentTime = 0;
      await this.audioElement.play();
      return;
    }
    
    // Try to get next track
    const nextTrack = this.getNextTrack();
    
    if (nextTrack) {
      this.ui.logBoth('info', `Auto-advancing to next track: ${nextTrack.name}`);
      await this.playTrack(nextTrack.path, nextTrack);
    } else if (this.audioPlayerState.repeatMode === 'all' && this.audioPlayerState.currentContextTracks.length > 0) {
      // Repeat all - go back to the first track
      this.ui.logBoth('info', 'Repeat all mode - restarting from beginning');
      this.audioPlayerState.currentTrackIndex = 0;
      const firstTrack = this.audioPlayerState.currentContextTracks[0];
      await this.playTrack(firstTrack.path, firstTrack);
    } else {
      this.ui.logBoth('info', 'No next track available - playback ended');
    }
  }

  // Get the next track based on current context and playback mode
  getNextTrack() {
    if (!this.audioPlayerState.currentContextTracks || this.audioPlayerState.currentContextTracks.length === 0) {
      this.ui.logBoth('warning', 'No context tracks available for auto-advance');
      return null;
    }

    const tracks = this.audioPlayerState.currentContextTracks;
    let nextIndex;

    if (this.audioPlayerState.shuffleMode) {
      // Shuffle mode - pick a random track that's not the current one
      if (tracks.length <= 1) return null;
      
      do {
        nextIndex = Math.floor(Math.random() * tracks.length);
      } while (nextIndex === this.audioPlayerState.currentTrackIndex && tracks.length > 1);
      
      this.ui.logBoth('info', `Shuffle mode - selected random track at index ${nextIndex}`);
    } else {
      // Sequential mode - next track in order
      nextIndex = this.audioPlayerState.currentTrackIndex + 1;
      
      if (nextIndex >= tracks.length) {
        this.ui.logBoth('info', 'Reached end of track list');
        return null; // End of list
      }
    }

    this.audioPlayerState.currentTrackIndex = nextIndex;
    return tracks[nextIndex];
  }

  // Enhanced play track method that works with context
  async playTrack(filePath, track = null) {
    try {
      this.ui.logBoth('info', `Playing track: ${filePath}`);
      
      // If no track object provided, try to find it in the current context
      if (!track && this.audioPlayerState.currentContextTracks) {
        track = this.audioPlayerState.currentContextTracks.find(t => t.path === filePath);
        
        // Also update the current track index
        if (track) {
          const index = this.audioPlayerState.currentContextTracks.findIndex(t => t.path === filePath);
          if (index >= 0) {
            this.audioPlayerState.currentTrackIndex = index;
          }
        }
      }
      
      // Load track via AudioPlayerService for state management
      await window.electronAPI.invoke('audio-load-track', filePath);
      
      // Set up local audio element
      this.audioElement.src = `file://${filePath}`;
      this.audioPlayerState.currentTrack = track;
      
      // Reset time smoothing for new track
      this.lastDisplayedTime = 0;
      
      // Update track info display
      this.updateTrackInfo({
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
      await this.audioElement.play();
      
      this.ui.logBoth('success', `Track loaded and playing: ${track ? track.name : filePath}`);
    } catch (error) {
      this.ui.logBoth('error', `Error playing track: ${error.message}`);
    }
  }

  // Play next track in context
  async playNext() {
    const nextTrack = this.getNextTrack();
    if (nextTrack) {
      this.ui.logBoth('info', `Manual next: playing ${nextTrack.name}`);
      await this.playTrack(nextTrack.path, nextTrack);
    } else if (this.audioPlayerState.repeatMode === 'all' && this.audioPlayerState.currentContextTracks.length > 0) {
      // Repeat all - go back to the first track
      this.ui.logBoth('info', 'Manual next with repeat all: restarting from beginning');
      this.audioPlayerState.currentTrackIndex = 0;
      const firstTrack = this.audioPlayerState.currentContextTracks[0];
      await this.playTrack(firstTrack.path, firstTrack);
    } else {
      this.ui.logBoth('warning', 'No next track available');
    }
  }

  // Play previous track in context
  async playPrevious() {
    if (!this.audioPlayerState.currentContextTracks || this.audioPlayerState.currentContextTracks.length === 0) {
      this.ui.logBoth('warning', 'No context tracks available for previous');
      return;
    }

    const tracks = this.audioPlayerState.currentContextTracks;
    let prevIndex;

    if (this.audioPlayerState.shuffleMode) {
      // In shuffle mode, previous is random (but not current track)
      if (tracks.length <= 1) return;
      
      do {
        prevIndex = Math.floor(Math.random() * tracks.length);
      } while (prevIndex === this.audioPlayerState.currentTrackIndex && tracks.length > 1);
      
      this.ui.logBoth('info', `Shuffle mode - selected random previous track at index ${prevIndex}`);
    } else {
      // Sequential mode - previous track in order
      prevIndex = this.audioPlayerState.currentTrackIndex - 1;
      
      if (prevIndex < 0) {
        if (this.audioPlayerState.repeatMode === 'all') {
          // Repeat all - go to last track
          prevIndex = tracks.length - 1;
          this.ui.logBoth('info', 'Repeat all mode: going to last track');
        } else {
          this.ui.logBoth('warning', 'Already at first track');
          return;
        }
      }
    }

    this.audioPlayerState.currentTrackIndex = prevIndex;
    const prevTrack = tracks[prevIndex];
    
    this.ui.logBoth('info', `Manual previous: playing ${prevTrack.name}`);
    await this.playTrack(prevTrack.path, prevTrack);
  }
}
