/**
 * AudioPlayerControls
 * Handles UI control interactions: buttons, keyboard shortcuts, and mode cycling
 */
class AudioPlayerControls {
  constructor(audioPlayer) {
    this.player = audioPlayer;
    this.setupMediaKeyListeners();
  }

  setupMediaKeyListeners() {
    // Listen for hardware media key presses from main process
    window.electronAPI.on('media-key-press', async (data) => {
      this.player.ui.logBoth('info', `Media key pressed: ${data.key}`);
      
      try {
        switch (data.key) {
          case 'play-pause':
            if (this.player.audioPlayerState.isPlaying) {
              await window.electronAPI.invoke('audio-pause');
              this.player.audioElement.pause();
            } else {
              if (!this.player.audioElement.src && !this.player.audioPlayerState.currentTrack) {
                this.player.ui.logBoth('warning', 'No track loaded');
                return;
              }
              await window.electronAPI.invoke('audio-play');
              await this.player.audioElement.play();
            }
            break;
          
          case 'next':
            await this.player.playNext();
            break;
          
          case 'previous':
            await this.player.playPrevious();
            break;
          
          case 'stop':
            await window.electronAPI.invoke('audio-pause');
            this.player.audioElement.pause();
            break;
        }
      } catch (error) {
        this.player.ui.logBoth('error', `Media key error: ${error.message}`);
      }
    });
    
    this.player.ui.logBoth('info', 'Media key listeners initialized');
  }

  setupEventListeners() {
    this.player.ui.logBoth('info', 'Setting up music player event listeners');
    
    // Play/Pause button
    document.getElementById('playPauseBtn').addEventListener('click', async () => {
      this.player.ui.logBoth('info', `Play/Pause clicked (currently ${this.player.audioPlayerState.isPlaying ? 'playing' : 'paused'})`);
      try {
        if (this.player.audioPlayerState.isPlaying) {
          this.player.ui.logBoth('info', 'Pausing audio...');
          await window.electronAPI.invoke('audio-pause');
          this.player.audioElement.pause();
        } else {
          if (!this.player.audioElement.src && !this.player.audioPlayerState.currentTrack) {
            this.player.ui.logBoth('warning', 'No track loaded. Please select a track first.');
            return;
          }
          this.player.ui.logBoth('info', 'Playing audio...');
          await window.electronAPI.invoke('audio-play');
          await this.player.audioElement.play();
        }
      } catch (error) {
        this.player.ui.logBoth('error', `Playback error: ${error.message}`);
      }
    });
    
    // Previous track
    document.getElementById('prevBtn').addEventListener('click', async () => {
      this.player.ui.logBoth('info', 'Previous track button clicked');
      try {
        await this.player.playPrevious();
      } catch (error) {
        this.player.ui.logBoth('error', `Previous track error: ${error.message}`);
      }
    });
    
    // Next track
    document.getElementById('nextBtn').addEventListener('click', async () => {
      this.player.ui.logBoth('info', 'Next track button clicked');
      try {
        await this.player.playNext();
      } catch (error) {
        this.player.ui.logBoth('error', `Next track error: ${error.message}`);
      }
    });
    
    // Shuffle toggle
    document.getElementById('shuffleBtn').addEventListener('click', async () => {
      const newShuffleMode = !this.player.audioPlayerState.shuffleMode;
      this.player.ui.logBoth('info', `Shuffle toggled to: ${newShuffleMode ? 'on' : 'off'}`);
      try {
        await window.electronAPI.invoke('audio-toggle-shuffle');
        // Update UI immediately (optimistic update)
        this.player.audioPlayerState.shuffleMode = newShuffleMode;
        this.player.updateShuffleButton(newShuffleMode);
      } catch (error) {
        this.player.ui.logBoth('error', `Shuffle error: ${error.message}`);
      }
    });
    
    // Repeat toggle
    document.getElementById('repeatBtn').addEventListener('click', async () => {
      const nextMode = this.getNextRepeatMode(this.player.audioPlayerState.repeatMode);
      this.player.ui.logBoth('info', `Repeat mode changing from ${this.player.audioPlayerState.repeatMode} to ${nextMode}`);
      try {
        await window.electronAPI.invoke('audio-set-repeat', nextMode);
        // Update UI immediately (optimistic update)
        this.player.audioPlayerState.repeatMode = nextMode;
        this.player.updateRepeatButton(nextMode);
      } catch (error) {
        this.player.ui.logBoth('error', `Repeat mode error: ${error.message}`);
      }
    });
    
    // Playback speed toggle
    document.getElementById('speedBtn').addEventListener('click', () => {
      this.cyclePlaybackSpeed();
    });
    
    // Equalizer button
    document.getElementById('equalizerBtn').addEventListener('click', () => {
      this.player.showEqualizerModal();
    });
    
    // Volume slider
    const volumeSlider = document.getElementById('volumeSlider');
    volumeSlider.addEventListener('input', (e) => {
      const volume = e.target.value / 100;
      this.player.ui.logBoth('info', `Volume changed to: ${Math.round(volume * 100)}%`);
      this.player.audioElement.volume = volume;
    });
    
    // Mute toggle
    document.getElementById('muteBtn').addEventListener('click', () => {
      this.player.ui.logBoth('info', 'Mute button clicked');
      this.player.audioElement.muted = !this.player.audioElement.muted;
      this.player.ui.logBoth('info', `Audio ${this.player.audioElement.muted ? 'muted' : 'unmuted'}`);
    });
    
    // Progress slider
    const progressSlider = document.getElementById('progressSlider');
    
    // Handle seeking start
    progressSlider.addEventListener('mousedown', () => {
      this.player.isSeeking = true;
    });
    
    // Handle seeking end
    progressSlider.addEventListener('mouseup', () => {
      this.player.isSeeking = false;
      // Reset time smoothing after seeking
      this.player.lastDisplayedTime = this.player.audioElement.currentTime;
    });
    
    // Handle touch start (for mobile/touch devices)
    progressSlider.addEventListener('touchstart', () => {
      this.player.isSeeking = true;
    });
    
    // Handle touch end
    progressSlider.addEventListener('touchend', () => {
      this.player.isSeeking = false;
      // Reset time smoothing after seeking
      this.player.lastDisplayedTime = this.player.audioElement.currentTime;
    });
    
    // Handle slider input
    progressSlider.addEventListener('input', (e) => {
      if (this.player.audioElement.duration > 0) {
        const position = (e.target.value / 100) * this.player.audioElement.duration;
        this.player.ui.logBoth('info', `Seeking to: ${this.player.formatTime(position)}`);
        this.player.audioElement.currentTime = position;
        
        // Update time display immediately during seeking
        const currentTime = document.getElementById('currentTime');
        if (currentTime) currentTime.textContent = this.player.formatTime(position);
      }
    });
    
    // View Queue button (in mini-player)
    const viewQueueBtn = document.getElementById('viewQueueBtn');
    if (viewQueueBtn) {
      viewQueueBtn.addEventListener('click', () => {
        this.player.ui.logBoth('info', 'View Queue button clicked');
        this.player.showQueueModal();
      });
    }
    
    this.player.ui.logBoth('info', 'Music player event listeners setup complete');
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
            if (this.player.audioPlayerState.isPlaying) {
              await window.electronAPI.invoke('audio-pause');
              this.player.audioElement.pause();
            } else {
              if (!this.player.audioElement.src && !this.player.audioPlayerState.currentTrack) return;
              await window.electronAPI.invoke('audio-play');
              await this.player.audioElement.play();
            }
            break;
          }
          case 'ArrowRight': { // Seek forward
            const step = e.shiftKey ? 10 : 5;
            if (this.player.audioElement.duration > 0) {
              const nextTime = clamp((this.player.audioElement.currentTime || 0) + step, 0, this.player.audioElement.duration);
              this.player.audioElement.currentTime = nextTime;
              this.player.updateProgress(nextTime, this.player.audioElement.duration);
            }
            break;
          }
          case 'ArrowLeft': { // Seek backward
            const step = e.shiftKey ? 10 : 5;
            if (this.player.audioElement.duration > 0) {
              const nextTime = clamp((this.player.audioElement.currentTime || 0) - step, 0, this.player.audioElement.duration);
              this.player.audioElement.currentTime = nextTime;
              this.player.updateProgress(nextTime, this.player.audioElement.duration);
            }
            break;
          }
          case 'ArrowUp': { // Volume up
            e.preventDefault();
            const newVol = clamp((this.player.audioElement.volume || 0) + 0.05, 0, 1);
            this.player.audioElement.volume = newVol;
            break;
          }
          case 'ArrowDown': { // Volume down
            e.preventDefault();
            const newVol = clamp((this.player.audioElement.volume || 0) - 0.05, 0, 1);
            this.player.audioElement.volume = newVol;
            break;
          }
          case 'm':
          case 'M': { // Mute toggle
            this.player.audioElement.muted = !this.player.audioElement.muted;
            break;
          }
          case 's':
          case 'S': { // Shuffle toggle
            await window.electronAPI.invoke('audio-toggle-shuffle');
            this.player.audioPlayerState.shuffleMode = !this.player.audioPlayerState.shuffleMode;
            this.player.updateShuffleButton(this.player.audioPlayerState.shuffleMode);
            break;
          }
          case 'r':
          case 'R': { // Repeat cycle
            const nextMode = this.getNextRepeatMode(this.player.audioPlayerState.repeatMode);
            await window.electronAPI.invoke('audio-set-repeat', nextMode);
            this.player.audioPlayerState.repeatMode = nextMode;
            this.player.updateRepeatButton(nextMode);
            break;
          }
          case '[': { // Previous
            await this.player.playPrevious();
            break;
          }
          case ']': { // Next
            await this.player.playNext();
            break;
          }
          default: {
            // Number keys 0-9: jump to percentage of track
            if (/^[0-9]$/.test(e.key) && this.player.audioElement.duration > 0) {
              const pct = parseInt(e.key, 10) / 10; // 0 -> 0%, 9 -> 90%
              const nextTime = this.player.audioElement.duration * pct;
              this.player.audioElement.currentTime = nextTime;
              this.player.updateProgress(nextTime, this.player.audioElement.duration);
            }
          }
        }
      } catch (err) {
        this.player.ui.logBoth('error', `Keyboard shortcut error: ${err.message}`);
      }
    });
  }
  
  getNextRepeatMode(currentMode) {
    const modes = ['none', 'all', 'one'];
    const currentIndex = modes.indexOf(currentMode);
    return modes[(currentIndex + 1) % modes.length];
  }
  
  cyclePlaybackSpeed() {
    const speeds = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
    const currentIndex = speeds.indexOf(this.player.audioPlayerState.playbackSpeed);
    const nextIndex = (currentIndex + 1) % speeds.length;
    const nextSpeed = speeds[nextIndex];
    
    this.player.audioPlayerState.playbackSpeed = nextSpeed;
    this.player.audioElement.playbackRate = nextSpeed;
    this.updateSpeedButton(nextSpeed);
    
    this.player.ui.logBoth('info', `🎵 Playback speed: ${nextSpeed}x`);
  }
  
  updateSpeedButton(speed) {
    const speedBtn = document.getElementById('speedBtn');
    if (speedBtn) {
      speedBtn.textContent = `${speed}x`;
      speedBtn.title = `Playback speed: ${speed}x (click to cycle)`;
    }
  }
}

