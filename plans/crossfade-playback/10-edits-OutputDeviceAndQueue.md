# Edits: `AudioPlayerOutputDevice.js` and `AudioPlayerQueue.js`

## `RedShift_Desktop/src/renderer/components/audioplayer/AudioPlayerOutputDevice.js`

Both elements must follow the selected output device, otherwise a crossfade or gapless swap
would suddenly route audio to the previous device.

Anchor:

```javascript
      // Check if setSinkId is supported
      if (!this.player.audioElement.setSinkId) {
        this.player.ui.logBoth('warning', '🔊 Audio output device selection not supported in this browser');
        return;
      }
```

Replacement:

```javascript
      // Check if setSinkId is supported
      if (!this.player.audioElementA.setSinkId) {
        this.player.ui.logBoth('warning', '🔊 Audio output device selection not supported in this browser');
        return;
      }
```

Anchor:

```javascript
  async setOutputDevice(deviceId) {
    try {
      if (!this.player.audioElement.setSinkId) {
        throw new Error('setSinkId not supported');
      }
      
      await this.player.audioElement.setSinkId(deviceId);
      this.currentOutputDeviceId = deviceId;
```

Replacement:

```javascript
  async setOutputDevice(deviceId) {
    try {
      if (!this.player.audioElementA.setSinkId) {
        throw new Error('setSinkId not supported');
      }
      
      await this.player.audioElementA.setSinkId(deviceId);
      await this.player.audioElementB.setSinkId(deviceId);
      this.currentOutputDeviceId = deviceId;
```

## `RedShift_Desktop/src/renderer/components/audioplayer/AudioPlayerQueue.js`

Any mutation that changes what comes after the current track must re-run the preloader, or the
inactive element keeps playing/holding a track that's no longer actually next.

Anchor (end of `removeFromQueue`):

```javascript
    this.player.ui.logBoth('info', `Removed from queue: ${track.name || 'Unknown Track'}`);
    
    // Update both preview and modal
    this.updateQueuePreview();
    if (document.getElementById('queueModal').style.display === 'flex') {
      this.renderQueueModal();
    }
  }
```

Replacement:

```javascript
    this.player.ui.logBoth('info', `Removed from queue: ${track.name || 'Unknown Track'}`);
    
    if (this.player.crossfade) this.player.crossfade.prepareNextTrack();
    
    // Update both preview and modal
    this.updateQueuePreview();
    if (document.getElementById('queueModal').style.display === 'flex') {
      this.renderQueueModal();
    }
  }
```

Anchor (end of `clearQueue`, inside the `confirm(...)` block):

```javascript
      this.player.ui.logBoth('info', 'Queue cleared');
      
      // Update both preview and modal
      this.updateQueuePreview();
      this.renderQueueModal();
    }
  }
```

Replacement:

```javascript
      this.player.ui.logBoth('info', 'Queue cleared');
      
      if (this.player.crossfade) this.player.crossfade.prepareNextTrack();
      
      // Update both preview and modal
      this.updateQueuePreview();
      this.renderQueueModal();
    }
  }
```

Anchor (end of `reorderQueue`):

```javascript
    this.player.ui.logBoth('info', `Reordered queue: moved track from ${fromIndex} to ${toIndex}`);
    
    // Update both preview and modal
    this.updateQueuePreview();
    this.renderQueueModal();
  }
```

Replacement:

```javascript
    this.player.ui.logBoth('info', `Reordered queue: moved track from ${fromIndex} to ${toIndex}`);
    
    if (this.player.crossfade) this.player.crossfade.prepareNextTrack();
    
    // Update both preview and modal
    this.updateQueuePreview();
    this.renderQueueModal();
  }
```

Anchor (end of `addToQueue`):

```javascript
    const trackName = track.metadata?.common?.title || track.name || 'Unknown Track';
    this.player.ui.logBoth('success', `Added to queue: ${trackName}`);
    
    // Update queue UI
    this.updateQueuePreview();
    if (document.getElementById('queueModal').style.display === 'flex') {
      this.renderQueueModal();
    }
  }
}
```

Replacement:

```javascript
    const trackName = track.metadata?.common?.title || track.name || 'Unknown Track';
    this.player.ui.logBoth('success', `Added to queue: ${trackName}`);
    
    if (this.player.crossfade) this.player.crossfade.prepareNextTrack();
    
    // Update queue UI
    this.updateQueuePreview();
    if (document.getElementById('queueModal').style.display === 'flex') {
      this.renderQueueModal();
    }
  }
}
```
