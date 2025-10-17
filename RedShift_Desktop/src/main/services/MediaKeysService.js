// src/main/services/MediaKeysService.js
const { globalShortcut } = require('electron');

class MediaKeysService {
  constructor(manager) {
    this.manager = manager;
    this.registered = false;
  }

  register() {
    if (this.registered) {
      console.log('[MediaKeys] Already registered');
      return;
    }

    try {
      // Play/Pause
      const playPauseRegistered = globalShortcut.register('MediaPlayPause', () => {
        console.log('[MediaKeys] MediaPlayPause pressed');
        this.manager.sendToRenderer('media-key-press', { key: 'play-pause' });
      });

      // Next Track
      const nextRegistered = globalShortcut.register('MediaNextTrack', () => {
        console.log('[MediaKeys] MediaNextTrack pressed');
        this.manager.sendToRenderer('media-key-press', { key: 'next' });
      });

      // Previous Track
      const prevRegistered = globalShortcut.register('MediaPreviousTrack', () => {
        console.log('[MediaKeys] MediaPreviousTrack pressed');
        this.manager.sendToRenderer('media-key-press', { key: 'previous' });
      });

      // Stop (optional - treat as pause)
      const stopRegistered = globalShortcut.register('MediaStop', () => {
        console.log('[MediaKeys] MediaStop pressed');
        this.manager.sendToRenderer('media-key-press', { key: 'stop' });
      });

      if (playPauseRegistered && nextRegistered && prevRegistered) {
        this.registered = true;
        console.log('[MediaKeys] ✅ Media keys registered successfully');
      } else {
        console.warn('[MediaKeys] ⚠️ Some media keys failed to register');
        console.warn(`[MediaKeys]   Play/Pause: ${playPauseRegistered ? 'OK' : 'FAILED'}`);
        console.warn(`[MediaKeys]   Next: ${nextRegistered ? 'OK' : 'FAILED'}`);
        console.warn(`[MediaKeys]   Previous: ${prevRegistered ? 'OK' : 'FAILED'}`);
        console.warn(`[MediaKeys]   Stop: ${stopRegistered ? 'OK' : 'FAILED'}`);
      }
    } catch (error) {
      console.error('[MediaKeys] ❌ Failed to register media keys:', error);
    }
  }

  unregister() {
    if (!this.registered) {
      return;
    }

    try {
      globalShortcut.unregister('MediaPlayPause');
      globalShortcut.unregister('MediaNextTrack');
      globalShortcut.unregister('MediaPreviousTrack');
      globalShortcut.unregister('MediaStop');
      this.registered = false;
      console.log('[MediaKeys] ✅ Media keys unregistered');
    } catch (error) {
      console.error('[MediaKeys] ❌ Failed to unregister media keys:', error);
    }
  }
}

module.exports = MediaKeysService;

