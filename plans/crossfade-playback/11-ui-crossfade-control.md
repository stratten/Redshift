# UI: Crossfade duration control

Placed inside the existing Equalizer modal (the app's one "audio tuning" surface), below the
EQ bands, as a horizontal slider from 0 (off) to 10 seconds in 1-second steps.

## Edit: `RedShift_Desktop/src/renderer/partials/modals/equalizer-modal.html`

Anchor:

```html
                <div class="eq-band" data-band="9">
                    <div class="eq-slider-container">
                        <input type="range" class="eq-slider" id="eq-band-9" min="-12" max="12" step="0.5" value="0" orient="vertical">
                    </div>
                    <div class="eq-value" id="eq-value-9">0</div>
                    <div class="eq-frequency">16kHz</div>
                </div>
            </div>
        </div>
    </div>
</div>
```

Replacement:

```html
                <div class="eq-band" data-band="9">
                    <div class="eq-slider-container">
                        <input type="range" class="eq-slider" id="eq-band-9" min="-12" max="12" step="0.5" value="0" orient="vertical">
                    </div>
                    <div class="eq-value" id="eq-value-9">0</div>
                    <div class="eq-frequency">16kHz</div>
                </div>
            </div>
            
            <!-- Crossfade Duration -->
            <div class="crossfade-control">
                <label for="crossfadeSlider">Crossfade</label>
                <input type="range" class="crossfade-slider" id="crossfadeSlider" min="0" max="10" step="1" value="0">
                <span class="crossfade-value" id="crossfadeValue">Off</span>
            </div>
        </div>
    </div>
</div>
```

## New CSS: `RedShift_Desktop/src/renderer/styles/modals.css`

Anchor (end of the EQ styling block, right after `.eq-frequency`):

```css
.eq-frequency {
    font-size: 11px;
    color: var(--rs-text-secondary);
    font-weight: 500;
}
```

Replacement:

```css
.eq-frequency {
    font-size: 11px;
    color: var(--rs-text-secondary);
    font-weight: 500;
}

.crossfade-control {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-top: 16px;
    border-top: 1px solid var(--rs-border-color);
}

.crossfade-control label {
    font-size: 13px;
    font-weight: 600;
    color: var(--rs-text-primary);
    white-space: nowrap;
}

.crossfade-slider {
    flex: 1;
    height: 6px;
    background: linear-gradient(to right, var(--rs-border-color) 0%, var(--rs-accent) 100%);
    border-radius: 3px;
    outline: none;
    cursor: pointer;
    -webkit-appearance: none;
    appearance: none;
}

.crossfade-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    background: var(--rs-bg-surface);
    border: 2px solid var(--rs-accent);
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.crossfade-slider::-moz-range-thumb {
    width: 18px;
    height: 18px;
    background: var(--rs-bg-surface);
    border: 2px solid var(--rs-accent);
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.crossfade-value {
    font-size: 12px;
    font-weight: 600;
    color: var(--rs-accent);
    min-width: 36px;
    text-align: right;
}
```

## Wiring: `RedShift_Desktop/src/renderer/components/audioplayer/AudioPlayerEqualizer.js`

Anchor (end of `setupEqualizerListeners`, right before its closing brace):

```javascript
    // Close modal when clicking outside
    const modal = document.getElementById('equalizerModal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.hideEqualizerModal();
        }
      });
    }
  }
}
```

Replacement:

```javascript
    // Close modal when clicking outside
    const modal = document.getElementById('equalizerModal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.hideEqualizerModal();
        }
      });
    }
    
    // Crossfade duration slider
    const crossfadeSlider = document.getElementById('crossfadeSlider');
    if (crossfadeSlider) {
      crossfadeSlider.value = this.player.crossfade.crossfadeDuration;
      this.updateCrossfadeLabel(this.player.crossfade.crossfadeDuration);
      crossfadeSlider.addEventListener('input', (e) => {
        const seconds = parseInt(e.target.value, 10);
        this.player.crossfade.setCrossfadeDuration(seconds);
        this.updateCrossfadeLabel(seconds);
      });
    }
  }
  
  updateCrossfadeLabel(seconds) {
    const label = document.getElementById('crossfadeValue');
    if (label) {
      label.textContent = seconds > 0 ? `${seconds}s` : 'Off';
    }
  }
}
```

Note: `setupEqualizerListeners()` runs after `AudioPlayer`'s constructor has already created `this.crossfade` (see `03-edits-AudioPlayer.md`, Edit 1 - `this.crossfade = new AudioPlayerCrossfade(this);` is created before `this.controls`/`setupEqualizerListeners()` is invoked), so `this.player.crossfade.crossfadeDuration` is guaranteed to be loaded from `localStorage` by the time this listener setup runs.
