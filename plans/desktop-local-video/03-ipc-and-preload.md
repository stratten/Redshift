# 03 — IPC handlers and preload whitelist

## New file: `RedShift_Desktop/src/main/services/ipc/VideoHandlers.js`

Create with this exact content:

```javascript
// src/main/services/ipc/VideoHandlers.js
// IPC handlers for the local desktop video library (see plans/desktop-local-video/00-index.md)

function registerVideoHandlers(ipcMain, manager, waitReady) {
  const h = (fn) => async (...args) => { await waitReady(); return fn(...args); };

  ipcMain.handle('scan-video-library', h(async () => {
    if (!manager.videoLibraryPath) {
      throw new Error('No video library path configured. Set one in Settings.');
    }
    return manager.videoLibraryCache.scanVideoLibrary(manager.videoLibraryPath);
  }));

  ipcMain.handle('get-all-videos', h(async () => {
    return manager.videoLibraryCache.getAllVideos();
  }));

  ipcMain.handle('update-video-progress', h(async (event, payload) => {
    if (!payload || !payload.filePath) {
      throw new Error('update-video-progress requires a filePath');
    }
    return manager.videoLibraryCache.updatePlaybackState(payload.filePath, payload);
  }));

  ipcMain.handle('add-videos-to-library', h(async (event, { paths }) => {
    if (!manager.videoLibraryPath) {
      return { success: false, error: 'No video library path configured. Set one in Settings.' };
    }
    try {
      const filesAdded = await manager.videoLibraryCache.importPaths(paths, manager.videoLibraryPath);
      return { success: true, filesAdded };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }));
}

module.exports = { registerVideoHandlers };
```

## Edit: `RedShift_Desktop/src/main/services/ipc/index.js`

Find this exact block:

```
const { attachEventForwarders } = require('./EventForwarders');
const { registerLibraryHandlers } = require('./LibraryHandlers');
const { registerSettingsHandlers } = require('./SettingsHandlers');
const { registerDeviceHandlers } = require('./DeviceHandlers');
const { registerAudioHandlers } = require('./AudioHandlers');
const { registerPlaylistHandlers } = require('./PlaylistHandlers');
const { registerSyncHandlers } = require('./SyncHandlers');
const { registerArtistImageHandlers } = require('./ArtistImageHandlers');
```

Replace it with:

```
const { attachEventForwarders } = require('./EventForwarders');
const { registerLibraryHandlers } = require('./LibraryHandlers');
const { registerSettingsHandlers } = require('./SettingsHandlers');
const { registerDeviceHandlers } = require('./DeviceHandlers');
const { registerAudioHandlers } = require('./AudioHandlers');
const { registerPlaylistHandlers } = require('./PlaylistHandlers');
const { registerSyncHandlers } = require('./SyncHandlers');
const { registerArtistImageHandlers } = require('./ArtistImageHandlers');
const { registerVideoHandlers } = require('./VideoHandlers');
```

Then find this exact block:

```
  const required = [
    ['settings', () => !!manager.settings],
    ['musicLibraryCache', () => !!manager.musicLibraryCache],
    ['playlistService', () => !!manager.playlistService],
    ['dopplerSyncService', () => !!manager.dopplerSyncService],
  ];
```

Replace it with:

```
  const required = [
    ['settings', () => !!manager.settings],
    ['musicLibraryCache', () => !!manager.musicLibraryCache],
    ['playlistService', () => !!manager.playlistService],
    ['dopplerSyncService', () => !!manager.dopplerSyncService],
    ['videoLibraryCache', () => !!manager.videoLibraryCache],
  ];
```

Then find this exact block:

```
  registerLibraryHandlers(ipcMain, manager, waitReady);
  registerSettingsHandlers(ipcMain, manager);
  registerDeviceHandlers(ipcMain, manager);
  registerAudioHandlers(ipcMain, manager, waitReady);
  registerPlaylistHandlers(ipcMain, manager, waitReady);
  registerSyncHandlers(ipcMain, manager, waitReady);
  registerArtistImageHandlers(ipcMain);

  console.log('✅ All IPC handlers registered');
```

Replace it with:

```
  registerLibraryHandlers(ipcMain, manager, waitReady);
  registerSettingsHandlers(ipcMain, manager);
  registerDeviceHandlers(ipcMain, manager);
  registerAudioHandlers(ipcMain, manager, waitReady);
  registerPlaylistHandlers(ipcMain, manager, waitReady);
  registerSyncHandlers(ipcMain, manager, waitReady);
  registerArtistImageHandlers(ipcMain);
  registerVideoHandlers(ipcMain, manager, waitReady);

  console.log('✅ All IPC handlers registered');
```

## Edit: `RedShift_Desktop/src/main/services/ipc/EventForwarders.js`

Find this exact block (the end of the file):

```
    ae.on('audio-error', (data) => manager.sendToRenderer('audio-error', data));
  }
}

module.exports = { attachEventForwarders };
```

Replace it with:

```
    ae.on('audio-error', (data) => manager.sendToRenderer('audio-error', data));
  }

  // VideoLibraryCache events (emitted directly on the manager; see VideoLibraryCache.js)
  manager.on('video-scan-progress', (data) => manager.sendToRenderer('video-scan-progress', data));
}

module.exports = { attachEventForwarders };
```

Note: `video-scan-progress` is registered unconditionally (not inside an `if (manager.videoLibraryCache...)` guard) because `manager` itself is always a valid `EventEmitter`, and `VideoLibraryCache` calls `this.manager.emit('video-scan-progress', ...)` directly rather than exposing its own `eventEmitter` property — there is nothing to null-check here. `log` events from `VideoLibraryCache.emitLog()` need no new forwarding code: they already reach the renderer through the existing `ee.on('log', (data) => manager.sendToRenderer('log', data))` listener registered earlier in this same function for `manager.syncService.eventEmitter`, because `syncService.eventEmitter` is the same `manager` instance that `VideoLibraryCache.emitLog()` emits on.

## Edit: `RedShift_Desktop/src/main/preload.js`

Find this exact block:

```
      'audio-track-ended-notify',
      'songs-update-metadata',
      'show-in-finder',
      'get-file-info'
    ];
    
    if (validChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    throw new Error(`Invalid IPC channel: ${channel}`);
  },
```

Replace it with:

```
      'audio-track-ended-notify',
      'songs-update-metadata',
      'show-in-finder',
      'get-file-info',
      // Video library
      'scan-video-library',
      'get-all-videos',
      'update-video-progress',
      'add-videos-to-library'
    ];
    
    if (validChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    throw new Error(`Invalid IPC channel: ${channel}`);
  },
```

Then find this exact block (the first occurrence, inside the `on:` method — it is the closing of the `on` channel list, distinguished from the near-identical `removeListener` list below by the immediately following `if (validChannels.includes(channel)) {\n      // Strip event as it includes sender information` text):

```
      'usb-device-scanned',
      'usb-sync-started',
      'usb-sync-progress',
      'usb-sync-completed',
      'usb-sync-failed',
      'device-scan-progress'
    ];
    
    if (validChannels.includes(channel)) {
      // Strip event as it includes sender information
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    } else {
      throw new Error(`Invalid IPC channel: ${channel}`);
    }
  },
```

Replace it with:

```
      'usb-device-scanned',
      'usb-sync-started',
      'usb-sync-progress',
      'usb-sync-completed',
      'usb-sync-failed',
      'device-scan-progress',
      'video-scan-progress'
    ];
    
    if (validChannels.includes(channel)) {
      // Strip event as it includes sender information
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    } else {
      throw new Error(`Invalid IPC channel: ${channel}`);
    }
  },
```

No edit is needed to the `removeListener` whitelist for this package — `VideoLibrary.js` (companion doc 4) does not remove its `video-scan-progress` listener on teardown, matching how `library-scan-progress` is handled elsewhere in the renderer (listeners are registered once for the lifetime of the app window).
