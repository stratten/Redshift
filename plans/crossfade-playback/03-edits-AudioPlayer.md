# Edits: `RedShift_Desktop/src/renderer/components/AudioPlayer.js`

## Edit 1 - dual elements, getter, crossfade instantiation

Anchor (unique, from constructor):

```javascript
    // HTML5 Audio element for actual playback
    this.audioElement = new Audio();
    this.audioElement.volume = 1.0;
    this.isSeeking = false; // Flag to prevent update conflicts during seeking
    this.lastProgressUpdate = 0; // Throttle progress updates (legacy)
    this.lastDisplayedTime = 0; // For smoothing time display
    this.progressRafId = null; // requestAnimationFrame id for smooth progress
    this.lastRafUpdate = 0; // timestamp of last raf-driven UI write
    
    // Initialize UI updater component
    this.uiUpdater = new AudioPlayerUI(this);
    
    // Initialize queue manager component
    this.queueManager = new AudioPlayerQueue(this);
    
    // Initialize equalizer component (Web Audio API)
    this.equalizer = new AudioPlayerEqualizer(this);
    
    // Initialize output device component
    this.outputDevice = new AudioPlayerOutputDevice(this);
    
    // Initialize playback manager component
    this.playback = new AudioPlayerPlayback(this);
    
    // Initialize controls component
    this.controls = new AudioPlayerControls(this);
    
    // Initialize progress tracking component
    this.progress = new AudioPlayerProgress(this);
    
    this.setupAudioElement();
    
    // Setup Web Audio API for equalizer (must happen after setupAudioElement)
    this.equalizer.setupWebAudio();
```

Replacement:

```javascript
    // Two HTML5 Audio elements so the next track can be preloaded and, optionally,
    // crossfaded while the current one is still playing (see AudioPlayerCrossfade).
    this.audioElementA = new Audio();
    this.audioElementB = new Audio();
    this.audioElementA.volume = 1.0;
    this.audioElementB.volume = 1.0;
    this.isSeeking = false; // Flag to prevent update conflicts during seeking
    this.lastProgressUpdate = 0; // Throttle progress updates (legacy)
    this.lastDisplayedTime = 0; // For smoothing time display
    this.progressRafId = null; // requestAnimationFrame id for smooth progress
    this.lastRafUpdate = 0; // timestamp of last raf-driven UI write
    
    // Initialize UI updater component
    this.uiUpdater = new AudioPlayerUI(this);
    
    // Initialize queue manager component
    this.queueManager = new AudioPlayerQueue(this);
    
    // Initialize equalizer component (Web Audio API) - builds a filter chain per element
    this.equalizer = new AudioPlayerEqualizer(this);
    
    // Initialize output device component
    this.outputDevice = new AudioPlayerOutputDevice(this);
    
    // Initialize playback manager component
    this.playback = new AudioPlayerPlayback(this);
    
    // Initialize crossfade/gapless engine (needs playback + equalizer to already exist)
    this.crossfade = new AudioPlayerCrossfade(this);
    
    // Initialize controls component
    this.controls = new AudioPlayerControls(this);
    
    // Initialize progress tracking component
    this.progress = new AudioPlayerProgress(this);
    
    this.setupAudioElement();
    
    // Setup Web Audio API for equalizer (must happen after setupAudioElement)
    this.equalizer.setupWebAudio();
```

## Edit 2 - `audioElement` becomes a read-only getter for the active element

Anchor: the line immediately after the block replaced in Edit 1, still inside the constructor, right before `this.setupEventListeners();`. Use this larger anchor which includes the end of the constructor to place the getter right after it (getters must be declared at class level, not inside the constructor):

```javascript
    // Keyboard shortcuts (playback, seek, volume, modes)
    this.setupKeyboardShortcuts();
    
    // Initialize output device selection
    this.outputDevice.initialize();
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
      const trackName = this.audioPlayerState.currentTrack?.name || 'Unknown';
      this.ui.logBoth('success', `🎵 Track finished playing: ${trackName}`);
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
```

Replacement (see `04-edits-AudioPlayer-partB.md` for the full replacement text - it is long enough to need its own file per the tool-call size limit).
