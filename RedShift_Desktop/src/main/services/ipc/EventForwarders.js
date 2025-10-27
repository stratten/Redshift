// src/main/services/ipc/EventForwarders.js
// Forwards service events to renderer process

const { upsertSongFromTrack, incrementPlayCount } = require('./DatabaseHelpers');

function attachEventForwarders(manager) {
  if (!manager) return;

  // SyncService events
  if (manager.syncService && manager.syncService.eventEmitter) {
    const ee = manager.syncService.eventEmitter;
    ee.on('scan-started', () => manager.sendToRenderer('scan-started'));
    ee.on('scan-completed', (data) => manager.sendToRenderer('scan-completed', data));
    ee.on('scan-error', (data) => manager.sendToRenderer('scan-error', data));
    ee.on('transfer-started', (data) => manager.sendToRenderer('transfer-started', data));
    ee.on('transfer-progress', (data) => manager.sendToRenderer('transfer-progress', data));
    ee.on('transfer-completed', (data) => manager.sendToRenderer('transfer-completed', data));
    ee.on('transfer-error', (data) => manager.sendToRenderer('transfer-error', data));
    ee.on('transfer-cancelled', () => manager.sendToRenderer('transfer-cancelled'));
    ee.on('log', (data) => manager.sendToRenderer('log', data));
  }

  // DopplerSyncService events
  if (manager.dopplerSyncService && manager.dopplerSyncService.on) {
    const d = manager.dopplerSyncService;
    d.on('sync-session-started', (data) => manager.sendToRenderer('doppler-sync-started', data));
    d.on('sync-session-completed', (data) => manager.sendToRenderer('doppler-sync-completed', data));
    d.on('sync-session-error', (data) => manager.sendToRenderer('doppler-sync-error', data));
    d.on('transfer-progress', (data) => manager.sendToRenderer('doppler-transfer-progress', data));
    d.on('file-transferred', (data) => manager.sendToRenderer('doppler-file-transferred', data));
    d.on('transfer-error', (data) => manager.sendToRenderer('doppler-transfer-error', data));
    d.on('orphan-cleaned', (data) => manager.sendToRenderer('doppler-orphan-cleaned', data));
    
    // WebSocket sync events
    d.on('sync-started', (data) => manager.sendToRenderer('doppler-ws-sync-started', data));
    d.on('sync-status', (data) => manager.sendToRenderer('doppler-ws-sync-status', data));
    d.on('file-progress', (data) => manager.sendToRenderer('doppler-ws-file-progress', data));
    d.on('file-completed', (data) => manager.sendToRenderer('doppler-ws-file-completed', data));
    d.on('file-failed', (data) => manager.sendToRenderer('doppler-ws-file-failed', data));
    d.on('sync-completed', (data) => manager.sendToRenderer('doppler-ws-sync-completed', data));
    d.on('sync-error', (data) => manager.sendToRenderer('doppler-ws-sync-error', data));
  }

  // DeviceMonitorService events
  if (manager.deviceMonitorService && manager.deviceMonitorService.eventEmitter) {
    const de = manager.deviceMonitorService.eventEmitter;
    de.on('phone-connected', (data) => {
      console.log('📡 DeviceMonitor phone-connected event:', data);
      manager.sendToRenderer('phone-connected', data);
    });
    de.on('phone-disconnected', (data) => {
      console.log('📡 DeviceMonitor phone-disconnected event:', data);
      manager.sendToRenderer('phone-disconnected', data);
    });
    de.on('log', (data) => manager.sendToRenderer('log', data));
  }

  // RedShiftUSBSyncService events
  if (manager.redshiftUSBSyncService) {
    const usb = manager.redshiftUSBSyncService;
    usb.on('sync-started', (data) => manager.sendToRenderer('usb-sync-started', data));
    usb.on('sync-progress', (data) => manager.sendToRenderer('usb-sync-progress', data));
    usb.on('sync-completed', (data) => manager.sendToRenderer('usb-sync-completed', data));
    usb.on('sync-failed', (error) => manager.sendToRenderer('usb-sync-failed', error));
    usb.on('device-scanned', (data) => {
      console.log('📡 AppBridge received device-scanned, forwarding to renderer:', data);
      manager.sendToRenderer('usb-device-scanned', data);
    });
    usb.on('device-scan-progress', (data) => {
      manager.sendToRenderer('device-scan-progress', data);
    });
  }

  // AudioPlayerService events
  if (manager.audioPlayerService && manager.audioPlayerService.eventEmitter) {
    const ae = manager.audioPlayerService.eventEmitter;
    // initialize play count tracker state on manager
    if (!manager._playCountState) manager._playCountState = { countedForPath: null };

    ae.on('audio-state-changed', (data) => manager.sendToRenderer('audio-state-changed', data));

    ae.on('audio-track-loaded', async (data) => {
      manager.sendToRenderer('audio-track-loaded', data);
      try {
        await upsertSongFromTrack(manager, data.track);
        // Reset play-counted state for new track
        manager._playCountState.countedForPath = null;
      } catch (err) {
        console.warn('[Songs] upsert on track load failed:', err.message);
      }
    });

    ae.on('audio-play', async (data) => {
      manager.sendToRenderer('audio-play', data);
      // Just upsert the song data when play starts, don't count yet
      try {
        const track = data && data.track ? data.track : null;
        if (track && track.filePath) {
          await upsertSongFromTrack(manager, track);
        }
      } catch (err) {
        console.warn('[Songs] upsert on play failed:', err.message);
      }
    });
    ae.on('audio-pause', (data) => manager.sendToRenderer('audio-pause', data));
    ae.on('audio-stop', (data) => {
      manager.sendToRenderer('audio-stop', data);
      manager._playCountState.countedForPath = null;
    });
    ae.on('audio-seek', (data) => manager.sendToRenderer('audio-seek', data));
    ae.on('audio-volume-changed', (data) => manager.sendToRenderer('audio-volume-changed', data));
    ae.on('audio-queue-changed', (data) => manager.sendToRenderer('audio-queue-changed', data));
    ae.on('audio-shuffle-changed', (data) => manager.sendToRenderer('audio-shuffle-changed', data));
    ae.on('audio-repeat-changed', (data) => manager.sendToRenderer('audio-repeat-changed', data));
    ae.on('audio-position-changed', (data) => manager.sendToRenderer('audio-position-changed', data));
    ae.on('library-scan-progress', (data) => manager.sendToRenderer('library-scan-progress', data));
    ae.on('audio-track-ended', async (data) => {
      manager.sendToRenderer('audio-track-ended', data);
      // Increment play count when track completes
      try {
        const track = data && data.track ? data.track : null;
        if (track && track.filePath && manager._playCountState.countedForPath !== track.filePath) {
          await incrementPlayCount(manager, track.filePath);
          manager._playCountState.countedForPath = track.filePath;
        }
      } catch (err) {
        console.warn('[Songs] play count increment on track end failed:', err.message);
      }
      manager._playCountState.countedForPath = null;
    });
    ae.on('audio-error', (data) => manager.sendToRenderer('audio-error', data));
  }
}

module.exports = { attachEventForwarders };

