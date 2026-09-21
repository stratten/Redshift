# 07 — Settings UI, renderer wiring, and styles

Apply this document last; it wires together every file from companion docs 1-6.

## Edit 1: `RedShift_Desktop/src/renderer/partials/tabs/settings-tab.html`

Find this exact block:

```
        <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px; font-weight: 500;">Music Library Path:</label>
            <div style="display: flex; gap: 10px;">
                <input type="text" id="musicLibraryPathInput" style="flex: 1; padding: 8px 12px; border: 1px solid var(--rs-border-color); border-radius: 4px; background: var(--rs-bg-surface); color: var(--rs-text-primary);" readonly>
                <button class="btn btn-secondary" id="browseMusicBtn">Browse</button>
            </div>
            <small style="color: var(--rs-text-secondary); margin-top: 5px; display: block;">This folder will be used for both music playback and device syncing</small>
        </div>
        
        <!-- Advanced Settings (collapsed by default) -->
```

Replace it with:

```
        <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px; font-weight: 500;">Music Library Path:</label>
            <div style="display: flex; gap: 10px;">
                <input type="text" id="musicLibraryPathInput" style="flex: 1; padding: 8px 12px; border: 1px solid var(--rs-border-color); border-radius: 4px; background: var(--rs-bg-surface); color: var(--rs-text-primary);" readonly>
                <button class="btn btn-secondary" id="browseMusicBtn">Browse</button>
            </div>
            <small style="color: var(--rs-text-secondary); margin-top: 5px; display: block;">This folder will be used for both music playback and device syncing</small>
        </div>

        <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px; font-weight: 500;">Video Library Path:</label>
            <div style="display: flex; gap: 10px;">
                <input type="text" id="videoLibraryPathInput" style="flex: 1; padding: 8px 12px; border: 1px solid var(--rs-border-color); border-radius: 4px; background: var(--rs-bg-surface); color: var(--rs-text-primary);" readonly placeholder="Uses the OS Videos folder by default">
                <button class="btn btn-secondary" id="browseVideoBtn">Browse</button>
            </div>
            <small style="color: var(--rs-text-secondary); margin-top: 5px; display: block;">Local desktop video playback currently works best with MP4 (H.264/AAC) and WebM files. Other formats will be listed but may not play until broader format support ships.</small>
        </div>
        
        <!-- Advanced Settings (collapsed by default) -->
```

## Edit 2: `RedShift_Desktop/src/renderer/components/SettingsManager.js` — event listeners

Find this exact block:

```
    // Browse sync library path button (advanced)
    document.getElementById('browseSyncBtn').addEventListener('click', () => {
      this.browseForDirectory('masterLibraryPath');
    });
    
    // Advanced settings toggle
```

Replace it with:

```
    // Browse sync library path button (advanced)
    document.getElementById('browseSyncBtn').addEventListener('click', () => {
      this.browseForDirectory('masterLibraryPath');
    });

    // Browse video library path button
    document.getElementById('browseVideoBtn').addEventListener('click', () => {
      this.browseForDirectory('videoLibraryPath');
    });
    
    // Advanced settings toggle
```

## Edit 3: `RedShift_Desktop/src/renderer/components/SettingsManager.js` — `loadSettings()`

Find this exact block:

```
      // Advanced sync path (only if different from music path)
      const syncPath = settings.masterLibraryPath && settings.masterLibraryPath !== musicPath ? settings.masterLibraryPath : '';
      document.getElementById('syncLibraryPathInput').value = syncPath;
```

Replace it with:

```
      // Advanced sync path (only if different from music path)
      const syncPath = settings.masterLibraryPath && settings.masterLibraryPath !== musicPath ? settings.masterLibraryPath : '';
      document.getElementById('syncLibraryPathInput').value = syncPath;

      // Video library path (independent of the music/sync paths above)
      document.getElementById('videoLibraryPathInput').value = settings.videoLibraryPath || '';
```

## Edit 4: `RedShift_Desktop/src/renderer/components/SettingsManager.js` — `browseForDirectory()`

Find this exact block (the closing of the `if (newPath)` branch chain):

```
        } else if (settingKey === 'masterLibraryPath') {
          document.getElementById('syncLibraryPathInput').value = newPath;
          this.ui.logBoth('success', `Sync library path updated: ${newPath}`);

          // If primary music path is empty, mirror to musicLibraryPath so app has a single source of truth
          const currentMusicPath = (document.getElementById('musicLibraryPathInput').value || '').trim();
          if (!currentMusicPath) {
            try {
              await window.electronAPI.invoke('update-setting', 'musicLibraryPath', newPath);
              document.getElementById('musicLibraryPathInput').value = newPath;
              if (document.getElementById('libraryPath')) {
                document.getElementById('libraryPath').textContent = newPath;
              }
              this.ui.logBoth('info', 'Set primary music path from sync path');
            } catch (e) {
              this.ui.logBoth('warning', `Could not set musicLibraryPath: ${e.message}`);
            }
          }
        }
      }
    } catch (error) {
      this.ui.logBoth('error', `Failed to update library path: ${error.message}`);
    }
  }
```

Replace it with:

```
        } else if (settingKey === 'masterLibraryPath') {
          document.getElementById('syncLibraryPathInput').value = newPath;
          this.ui.logBoth('success', `Sync library path updated: ${newPath}`);

          // If primary music path is empty, mirror to musicLibraryPath so app has a single source of truth
          const currentMusicPath = (document.getElementById('musicLibraryPathInput').value || '').trim();
          if (!currentMusicPath) {
            try {
              await window.electronAPI.invoke('update-setting', 'musicLibraryPath', newPath);
              document.getElementById('musicLibraryPathInput').value = newPath;
              if (document.getElementById('libraryPath')) {
                document.getElementById('libraryPath').textContent = newPath;
              }
              this.ui.logBoth('info', 'Set primary music path from sync path');
            } catch (e) {
              this.ui.logBoth('warning', `Could not set musicLibraryPath: ${e.message}`);
            }
          }
        } else if (settingKey === 'videoLibraryPath') {
          // chooseDirectory() in main.js already persisted the setting via updateSetting()
          document.getElementById('videoLibraryPathInput').value = newPath;
          this.ui.logBoth('success', `Video library path updated: ${newPath}`);
          if (this.ui.videoLibrary) {
            this.ui.videoLibrary.hasLoadedOnce = false;
          }
        }
      }
    } catch (error) {
      this.ui.logBoth('error', `Failed to update library path: ${error.message}`);
    }
  }
```

Setting `hasLoadedOnce = false` forces the next visit to the Videos tab to rescan against the newly chosen directory instead of continuing to show the previous library's in-memory list.

## Edit 5: `RedShift_Desktop/src/renderer/renderer.js` — constructor

Find this exact block:

```
    this.dopplerSync = new DopplerSync(this);
    this.deviceManager = new DeviceManager(this);
    
    // Initialize IPC event manager (depends on components)
    this.ipcEventManager = new IPCEventManager(this);
```

Replace it with:

```
    this.dopplerSync = new DopplerSync(this);
    this.deviceManager = new DeviceManager(this);
    this.videoPlayerModal = new VideoPlayerModal(this);
    this.videoLibrary = new VideoLibrary(this);
    
    // Initialize IPC event manager (depends on components)
    this.ipcEventManager = new IPCEventManager(this);
```

## Edit 6: `RedShift_Desktop/src/renderer/renderer.js` — page title map

Find this exact block:

```
        const titles = {
          'usb-sync': 'USB Sync',
          'doppler-sync': 'Doppler Sync',
          'history': 'Transfer History',
          'settings': 'Settings'
        };
```

Replace it with:

```
        const titles = {
          'usb-sync': 'USB Sync',
          'doppler-sync': 'Doppler Sync',
          'history': 'Transfer History',
          'settings': 'Settings',
          'videos': 'Videos'
        };
```

## Edit 7: `RedShift_Desktop/src/renderer/renderer.js` — header action visibility

Find this exact block:

```
        const usbSyncActions = document.getElementById('usbSyncActions');
        const musicActions = document.getElementById('musicActions');
        if (usbSyncActions) usbSyncActions.style.display = tabId === 'usb-sync' ? 'flex' : 'none';
        if (musicActions) musicActions.style.display = tabId === 'music' ? 'flex' : 'none';
```

Replace it with:

```
        const usbSyncActions = document.getElementById('usbSyncActions');
        const musicActions = document.getElementById('musicActions');
        const videoActions = document.getElementById('videoActions');
        if (usbSyncActions) usbSyncActions.style.display = tabId === 'usb-sync' ? 'flex' : 'none';
        if (musicActions) musicActions.style.display = tabId === 'music' ? 'flex' : 'none';
        if (videoActions) videoActions.style.display = tabId === 'videos' ? 'flex' : 'none';
```

## Edit 8: `RedShift_Desktop/src/renderer/renderer.js` — tab activation

Find this exact block:

```
        // Handle music subtabs from sidebar
        if (tabId === 'music' && subtabId) {
          this.switchMusicSubtab(subtabId);
        } else if (tabId === 'history') {
          this.syncManager.loadTransferHistory();
        }
```

Replace it with:

```
        // Handle music subtabs from sidebar
        if (tabId === 'music' && subtabId) {
          this.switchMusicSubtab(subtabId);
        } else if (tabId === 'history') {
          this.syncManager.loadTransferHistory();
        } else if (tabId === 'videos') {
          this.videoLibrary.onTabActivated();
        }
```

Note: there is deliberately no auto-scan of the video library at app startup (unlike music's `initializeMusicLibrary()`). The first visit to the Videos tab triggers the first scan via `onTabActivated()` → `loadVideos()`. This keeps the vertical slice from adding filesystem-walk cost to every app launch for a feature a given user may not use yet.

## Edit 9: `RedShift_Desktop/src/renderer/styles/main.css`

Find this exact block:

```
@import 'modals.css';
@import 'shared.css';
```

Replace it with:

```
@import 'modals.css';
@import 'shared.css';
@import 'videos-view.css';
```

## New file: `RedShift_Desktop/src/renderer/styles/videos-view.css`

Create with this exact content:

```css
/* Videos View Styles
 * Local desktop video library grid, cards, and player modal.
 * See plans/desktop-local-video/00-index.md for scope decisions.
 */

.videos-library {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 20px;
    overflow-y: auto;
}

.videos-library.videos-drop-active {
    outline: 2px dashed var(--rs-accent-alt);
    outline-offset: -8px;
    background: var(--rs-accent-soft-strong);
}

#videosTab.videos-drop-active {
    background: var(--rs-accent-soft-strong);
}

.videos-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 16px;
}

.library-stats-inline {
    color: var(--rs-text-secondary);
    font-size: 13px;
    margin-left: 8px;
}

.video-card {
    background: var(--rs-bg-surface);
    border: 1px solid var(--rs-border-color);
    border-radius: 10px;
    overflow: hidden;
    cursor: pointer;
    transition: border-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
}

.video-card:hover,
.video-card:focus-visible {
    border-color: var(--rs-accent-alt);
    transform: translateY(-2px);
    box-shadow: 0 8px 20px var(--rs-accent-soft-strong);
    outline: none;
}

.video-card-thumb {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    background: linear-gradient(135deg, #1f2937 0%, #374151 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.85);
}

.video-card-progress {
    position: absolute;
    left: 0;
    bottom: 0;
    width: 100%;
    height: 4px;
    background: rgba(0, 0, 0, 0.35);
}

.video-card-progress-fill {
    height: 100%;
    background: var(--rs-accent);
}

.video-card-info {
    padding: 10px 12px;
}

.video-card-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--rs-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.video-card-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
    font-size: 12px;
    color: var(--rs-text-secondary);
}

.video-card-badge {
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 4px;
}

.video-card-badge-unsupported {
    background: var(--rs-warning-bg-soft);
    color: var(--rs-warning-text);
    border: 1px solid var(--rs-warning-border-soft);
}

.videos-empty-state {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 60px 20px;
    color: var(--rs-text-secondary);
    text-align: center;
}

.videos-empty-state h3 {
    color: var(--rs-text-heading);
    font-size: 16px;
}

/* Video player modal */

.video-player-modal-content {
    width: min(90vw, 1100px);
    max-width: 1100px;
}

.video-player-modal-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
}

.video-player-element {
    width: 100%;
    max-height: 70vh;
    background: #000;
    border-radius: 6px;
}

.video-player-error {
    background: var(--rs-warning-bg-soft);
    color: var(--rs-warning-text);
    border: 1px solid var(--rs-warning-border-soft);
    border-radius: 6px;
    padding: 10px 14px;
    font-size: 13px;
}
```

## Verified assumptions

- `--rs-accent-soft-strong`, `--rs-warning-bg-soft`, `--rs-warning-text`, `--rs-warning-border-soft`, `--rs-bg-surface`, `--rs-border-color`, `--rs-text-primary`, `--rs-text-secondary`, `--rs-text-heading`, `--rs-accent`, `--rs-accent-alt` all already exist in both the light and dark theme blocks of `RedShift_Desktop/src/renderer/styles/base.css` (confirmed by reading that file in full during planning) — no new CSS variables are introduced.
- `.modal`, `.modal-content`, `.modal-header`, `.modal-body`, and `.close-button` base styles already exist in `RedShift_Desktop/src/renderer/styles/modals.css` and are reused as-is by `video-player-modal.html`; only the two video-specific classes above (`.video-player-modal-content`, `.video-player-modal-body`, `.video-player-element`, `.video-player-error`) are new.
