# Edits: `RedShift_Desktop/src/renderer/components/audioplayer/AudioPlayerControls.js`

Pause/resume must go through the crossfade engine everywhere, otherwise pausing mid-crossfade
would leave the incoming (background) element playing silently unmuted. Volume/mute must apply
to both elements so the one currently preloading doesn't resume at a stale volume after a swap.
Shuffle/repeat toggles must re-run the preloader since they change what `peekNextTrack()` returns.

## Edit 1 - media key play-pause / stop

Anchor:

```javascript
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
```

Replacement:

```javascript
          case 'play-pause':
            if (this.player.audioPlayerState.isPlaying) {
              await window.electronAPI.invoke('audio-pause');
              this.player.crossfade.pauseActive();
            } else {
              if (!this.player.audioElement.src && !this.player.audioPlayerState.currentTrack) {
                this.player.ui.logBoth('warning', 'No track loaded');
                return;
              }
              await window.electronAPI.invoke('audio-play');
              await this.player.crossfade.resumeActive();
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
            this.player.crossfade.pauseActive();
            break;
```

## Edit 2 - play/pause button

Anchor:

```javascript
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
```

Replacement:

```javascript
        if (this.player.audioPlayerState.isPlaying) {
          this.player.ui.logBoth('info', 'Pausing audio...');
          await window.electronAPI.invoke('audio-pause');
          this.player.crossfade.pauseActive();
        } else {
          if (!this.player.audioElement.src && !this.player.audioPlayerState.currentTrack) {
            this.player.ui.logBoth('warning', 'No track loaded. Please select a track first.');
            return;
          }
          this.player.ui.logBoth('info', 'Playing audio...');
          await window.electronAPI.invoke('audio-play');
          await this.player.crossfade.resumeActive();
        }
```

## Edit 3 - shuffle/repeat toggles refresh the preload

Anchor:

```javascript
        await window.electronAPI.invoke('audio-toggle-shuffle');
        // Update UI immediately (optimistic update)
        this.player.audioPlayerState.shuffleMode = newShuffleMode;
        this.player.updateShuffleButton(newShuffleMode);
```

Replacement:

```javascript
        await window.electronAPI.invoke('audio-toggle-shuffle');
        // Update UI immediately (optimistic update)
        this.player.audioPlayerState.shuffleMode = newShuffleMode;
        this.player.updateShuffleButton(newShuffleMode);
        if (this.player.crossfade) this.player.crossfade.prepareNextTrack();
```

Anchor:

```javascript
        await window.electronAPI.invoke('audio-set-repeat', nextMode);
        // Update UI immediately (optimistic update)
        this.player.audioPlayerState.repeatMode = nextMode;
        this.player.updateRepeatButton(nextMode);
```

Replacement:

```javascript
        await window.electronAPI.invoke('audio-set-repeat', nextMode);
        // Update UI immediately (optimistic update)
        this.player.audioPlayerState.repeatMode = nextMode;
        this.player.updateRepeatButton(nextMode);
        if (this.player.crossfade) this.player.crossfade.prepareNextTrack();
```

## Edit 4 - volume/mute apply to both elements

Anchor:

```javascript
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
```

Replacement:

```javascript
    volumeSlider.addEventListener('input', (e) => {
      const volume = e.target.value / 100;
      this.player.ui.logBoth('info', `Volume changed to: ${Math.round(volume * 100)}%`);
      this.player.audioElementA.volume = volume;
      this.player.audioElementB.volume = volume;
    });
    
    // Mute toggle
    document.getElementById('muteBtn').addEventListener('click', () => {
      this.player.ui.logBoth('info', 'Mute button clicked');
      const nowMuted = !this.player.audioElement.muted;
      this.player.audioElementA.muted = nowMuted;
      this.player.audioElementB.muted = nowMuted;
      this.player.ui.logBoth('info', `Audio ${nowMuted ? 'muted' : 'unmuted'}`);
    });
```
