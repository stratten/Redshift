# Edits: `RedShift_Desktop/src/renderer/components/audioplayer/AudioPlayerEqualizer.js`

## Edit 1 - build a filter chain + gain node per element instead of one shared chain

Anchor (unique - the full existing `setupWebAudio` method):

```javascript
  setupWebAudio() {
    try {
      // Create AudioContext
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // Create source from audio element
      this.sourceNode = this.audioContext.createMediaElementSource(this.player.audioElement);
      
      // Standard 10-band equalizer frequencies (Hz)
      const frequencies = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
      
      // Create filter for each band
      let previousNode = this.sourceNode;
      
      frequencies.forEach((freq, index) => {
        const filter = this.audioContext.createBiquadFilter();
        filter.type = index === 0 ? 'lowshelf' : index === frequencies.length - 1 ? 'highshelf' : 'peaking';
        filter.frequency.value = freq;
        filter.Q.value = 1.0;
        filter.gain.value = 0; // Start flat (0 dB)
        
        previousNode.connect(filter);
        previousNode = filter;
        
        this.equalizerBands.push({
          filter,
          frequency: freq,
          gain: 0
        });
      });
      
      // Connect final filter to destination
      previousNode.connect(this.audioContext.destination);
      
      // Load saved equalizer settings
      this.loadEqualizerSettings();
      
      this.player.ui.logBoth('success', '🎛️ Equalizer initialized with 10 bands');
    } catch (error) {
      this.player.ui.logBoth('error', `Failed to initialize equalizer: ${error.message}`);
    }
  }
```

Replacement:

```javascript
  setupWebAudio() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.frequencies = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
      
      // Build one identical chain per <audio> element so either can play/crossfade
      // through the same EQ settings and its own gain node.
      this.chains = [
        this.buildChain(this.player.audioElementA),
        this.buildChain(this.player.audioElementB)
      ];
      
      // equalizerBands mirrors chains[0]'s filters for gain/UI bookkeeping; setEqualizerBand
      // writes the same value to both chains' filters.
      this.equalizerBands = this.frequencies.map((freq, index) => ({
        filter: this.chains[0].filters[index],
        frequency: freq,
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
    const filters = this.frequencies.map((freq, index) => {
      const filter = this.audioContext.createBiquadFilter();
      filter.type = index === 0 ? 'lowshelf' : index === this.frequencies.length - 1 ? 'highshelf' : 'peaking';
      filter.frequency.value = freq;
      filter.Q.value = 1.0;
      filter.gain.value = 0;
      previousNode.connect(filter);
      previousNode = filter;
      return filter;
    });
    
    const gainNode = this.audioContext.createGain();
    gainNode.gain.value = 1;
    previousNode.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    
    return { element, source, filters, gainNode };
  }
  
  getGainNode(element) {
    const chain = this.chains.find((c) => c.element === element);
    return chain ? chain.gainNode : null;
  }
```

## Edit 2 - `setEqualizerBand` writes to both chains

Anchor:

```javascript
  setEqualizerBand(index, gain) {
    if (index >= 0 && index < this.equalizerBands.length) {
      // Clamp gain between -12 dB and +12 dB
      const clampedGain = Math.max(-12, Math.min(12, gain));
      this.equalizerBands[index].gain = clampedGain;
      this.equalizerBands[index].filter.gain.value = clampedGain;
      this.saveEqualizerSettings();
    }
  }
```

Replacement:

```javascript
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
```

Rationale: `this.sourceNode` and the single shared filter/destination graph are replaced by `this.chains` (one entry per `<audio>` element), each ending in its own `GainNode` that `AudioPlayerCrossfade` ramps during a transition. `equalizerBands[index].filter` still points at chain 0's filter purely so any other pre-existing code reading `.filter` directly (there is none found elsewhere in the codebase) keeps working; the authoritative write path is now `setEqualizerBand`, which fans out to every chain.
