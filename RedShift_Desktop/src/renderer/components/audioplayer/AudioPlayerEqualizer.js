// src/renderer/components/AudioPlayerEqualizer.js - Audio Player Equalizer (Web Audio API)

class AudioPlayerEqualizer {
  constructor(audioPlayer) {
    this.player = audioPlayer; // Reference to main AudioPlayer
    this.audioContext = null;
    this.chains = [];
    this.equalizerBands = [];
    this.equalizerEnabled = false;
  }
  
  setupWebAudio() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.frequencies = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
      this.chains = [
        this.buildChain(this.player.audioElementA),
        this.buildChain(this.player.audioElementB)
      ];
      this.equalizerBands = this.frequencies.map((frequency, index) => ({
        filter: this.chains[0].filters[index],
        frequency,
        gain: 0
      }));
      this.loadEqualizerSettings();
      this.player.ui.logBoth('success', '🎛️ Equalizer initialized with 10 bands (dual chain)');
    } catch (error) {
      this.player.ui.logBoth('error', `Failed to initialize equalizer: ${error.message}`);
    }
  }

  buildChain(element) {
    const source = this.audioContext.createMediaElementSource(element);
    let previousNode = source;
    const filters = this.frequencies.map((frequency, index) => {
      const filter = this.audioContext.createBiquadFilter();
      filter.type = index === 0 ? 'lowshelf' : index === this.frequencies.length - 1 ? 'highshelf' : 'peaking';
      filter.frequency.value = frequency;
      filter.Q.value = 1.0;
      previousNode.connect(filter);
      previousNode = filter;
      return filter;
    });
    const gainNode = this.audioContext.createGain();
    previousNode.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    return { element, filters, gainNode };
  }

  getGainNode(element) {
    return this.chains.find((chain) => chain.element === element)?.gainNode || null;
  }
  
  setEqualizerBand(index, gain) {
    if (index >= 0 && index < this.equalizerBands.length) {
      // Clamp gain between -12 dB and +12 dB
      const clampedGain = Math.max(-12, Math.min(12, gain));
      this.equalizerBands[index].gain = clampedGain;
      this.chains.forEach((chain) => {
        chain.filters[index].gain.value = clampedGain;
      });
      this.saveEqualizerSettings();
    }
  }
  
  applyEqualizerPreset(presetName) {
    const presets = {
      flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      rock: [5, 4, 3, 1, -1, -1, 0, 2, 4, 5],
      pop: [0, 2, 4, 4, 2, 0, -1, -1, 0, 1],
      jazz: [4, 3, 1, 2, -1, -1, 0, 1, 3, 4],
      classical: [5, 4, 3, 2, -1, -1, 0, 2, 3, 4],
      bass: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
      treble: [0, 0, 0, 0, 0, 2, 4, 5, 6, 6],
      vocal: [0, 1, 3, 4, 3, 1, -1, -2, -2, 0]
    };
    
    const preset = presets[presetName];
    if (preset) {
      preset.forEach((gain, index) => {
        this.setEqualizerBand(index, gain);
      });
      this.updateEqualizerUI();
      this.player.ui.logBoth('info', `🎛️ Applied ${presetName} equalizer preset`);
    }
  }
  
  resetEqualizer() {
    this.applyEqualizerPreset('flat');
  }
  
  loadEqualizerSettings() {
    try {
      const saved = localStorage.getItem('equalizer-settings');
      if (saved) {
        const settings = JSON.parse(saved);
        settings.gains.forEach((gain, index) => {
          if (index < this.equalizerBands.length) {
            this.equalizerBands[index].gain = gain;
            this.chains.forEach((chain) => {
              chain.filters[index].gain.value = gain;
            });
          }
        });
        this.player.ui.logBoth('info', '🎛️ Loaded equalizer settings');
      }
    } catch (error) {
      this.player.ui.logBoth('warning', `Failed to load equalizer settings: ${error.message}`);
    }
  }
  
  saveEqualizerSettings() {
    try {
      const settings = {
        gains: this.equalizerBands.map(band => band.gain)
      };
      localStorage.setItem('equalizer-settings', JSON.stringify(settings));
    } catch (error) {
      this.player.ui.logBoth('warning', `Failed to save equalizer settings: ${error.message}`);
    }
  }
  
  updateEqualizerUI() {
    // Update slider values in the UI
    this.equalizerBands.forEach((band, index) => {
      const slider = document.getElementById(`eq-band-${index}`);
      if (slider) {
        slider.value = band.gain;
      }
      const label = document.getElementById(`eq-value-${index}`);
      if (label) {
        label.textContent = `${band.gain > 0 ? '+' : ''}${band.gain.toFixed(1)}`;
      }
    });
  }
  
  showEqualizerModal() {
    const modal = document.getElementById('equalizerModal');
    if (modal) {
      modal.style.display = 'flex';
      this.updateEqualizerUI();
      this.updateCrossfadeUI(this.player.crossfade.crossfadeDuration);
    }
  }
  
  hideEqualizerModal() {
    const modal = document.getElementById('equalizerModal');
    if (modal) {
      modal.style.display = 'none';
    }
  }
  
  setupEqualizerListeners() {
    // Close button
    const closeBtn = document.getElementById('closeEqualizer');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.hideEqualizerModal();
      });
    }
    
    // Preset buttons
    const presetButtons = document.querySelectorAll('.eq-preset-btn');
    presetButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const preset = btn.dataset.preset;
        this.applyEqualizerPreset(preset);
      });
    });
    
    // Individual band sliders
    this.equalizerBands.forEach((band, index) => {
      const slider = document.getElementById(`eq-band-${index}`);
      if (slider) {
        slider.addEventListener('input', (e) => {
          const gain = parseFloat(e.target.value);
          this.setEqualizerBand(index, gain);
          
          // Update value label immediately
          const label = document.getElementById(`eq-value-${index}`);
          if (label) {
            label.textContent = `${gain > 0 ? '+' : ''}${gain.toFixed(1)}`;
          }
        });
      }
    });
    
    // Close modal when clicking outside
    const modal = document.getElementById('equalizerModal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.hideEqualizerModal();
        }
      });
    }

    const crossfadeSlider = document.getElementById('crossfadeSlider');
    if (crossfadeSlider) {
      crossfadeSlider.value = this.player.crossfade.crossfadeDuration;
      crossfadeSlider.addEventListener('input', (event) => {
        const seconds = Number(event.target.value);
        this.player.crossfade.setCrossfadeDuration(seconds);
        this.updateCrossfadeUI(seconds);
      });
      this.updateCrossfadeUI(this.player.crossfade.crossfadeDuration);
    }
  }

  updateCrossfadeUI(seconds) {
    const slider = document.getElementById('crossfadeSlider');
    const value = document.getElementById('crossfadeValue');
    if (slider) slider.value = seconds;
    if (value) value.textContent = seconds > 0 ? `${seconds}s` : 'Off';
  }
}

