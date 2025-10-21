# RedShift Desktop ↔ Mobile USB Sync Plan

**Project:** RedShift Music Ecosystem  
**Feature:** USB wired sync between RedShift Desktop and RedShift Mobile  
**Created:** October 17, 2025  
**Updated:** October 21, 2025  
**Status:** ✅ IMPLEMENTED (Multi-Device Support)

---

## Executive Summary

Building a simple, iTunes-style wired sync system. Phone plugs in via USB, desktop copies files directly to the app's Documents folder. No servers, no networking, no complexity.

### Goals

1. **Desktop → Mobile**: Copy music files and playlists to device
2. **Mobile → Desktop**: Sync play counts and ratings back
3. **Simple UX**: Plug in phone, click "Sync", done

### Architecture

```
Desktop                    USB Cable                Mobile App
┌──────────┐              ┌────────┐              ┌──────────┐
│          │──────────────│        │──────────────│Documents/│
│  Music   │   libimobile │        │              │  Music/  │
│  Library │   device     │        │              │  *.mp3   │
│          │              │        │              │          │
└──────────┘              └────────┘              └──────────┘
```

---

## Implementation Approach

### Option 1: libimobiledevice + ifuse (Mount filesystem)

**Pros:**
- Direct filesystem access
- Standard Unix tools
- Can browse entire app sandbox

**Cons:**
- Requires `ifuse` installed (`brew install ifuse`)
- Need to mount/unmount
- Requires FUSE kernel extension (macOS security prompts)

**Usage:**
```bash
# Mount device
ifuse /tmp/iphone

# Access app's Documents folder
# Path: /tmp/iphone/container_id/Documents/

# Copy files
cp ~/Music/song.mp3 /tmp/iphone/.../Documents/Music/

# Unmount
umount /tmp/iphone
```

### Option 2: iOS File Sharing API (iTunes-style)

**Pros:**
- No mounting required
- Native iOS file sharing protocol
- Works with any app that enables file sharing
- More reliable

**Cons:**
- Need to enable "Application supports iTunes file sharing" in Info.plist
- Files accessible via Finder sidebar when plugged in
- Need Node.js library or shell commands

**Usage:**
User can manually drag files via Finder → iPhone → Files → RedShift

For programmatic access, use `idevice` commands or Node library.

### Option 3: Node.js `node-iosdevice` library

**Pros:**
- Pure JavaScript
- No external dependencies
- Direct AFC (Apple File Connection) access

**Cons:**
- May need native bindings
- Less mature than libimobiledevice

---

## Recommended Approach: Shell Commands + libimobiledevice

Keep it **dead simple**:

1. Use existing `DeviceMonitorService` to detect phone
2. Use `exec()` to run `idevice_id`, `ideviceinfo`, `ifuse`
3. Mount device filesystem
4. Copy files with `fs.copy()`
5. Unmount when done

---

## Phase 1: Desktop USB Sync Service

### 1.1 Install Prerequisites

```bash
# Install libimobiledevice tools
brew install libimobiledevice
brew install ifuse

# Verify installation
idevice_id -l  # List connected devices
```

### 1.2 RedShiftUSBSyncService.js

**File:** `src/main/services/RedShiftUSBSyncService.js`

```javascript
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const fs = require('fs-extra');
const path = require('path');

class RedShiftUSBSyncService {
  constructor(database, musicLibraryCache) {
    this.db = database;
    this.library = musicLibraryCache;
    this.mountPoint = '/tmp/redshift_iphone';
    this.isMounted = false;
  }

  // 1. Check if device is connected
  async isDeviceConnected() {
    try {
      const { stdout } = await execAsync('idevice_id -l');
      return stdout.trim().length > 0;
    } catch (error) {
      return false;
    }
  }

  // 2. Get device UDID
  async getDeviceUDID() {
    const { stdout } = await execAsync('idevice_id -l');
    return stdout.trim();
  }

  // 3. Get device info
  async getDeviceInfo() {
    const { stdout } = await execAsync('ideviceinfo');
    const lines = stdout.split('\n');
    const info = {};
    for (const line of lines) {
      const [key, value] = line.split(': ');
      if (key && value) {
        info[key.trim()] = value.trim();
      }
    }
    return info;
  }

  // 4. Mount device filesystem
  async mountDevice() {
    if (this.isMounted) {
      console.log('Device already mounted');
      return;
    }

    // Create mount point
    await fs.ensureDir(this.mountPoint);

    // Mount
    await execAsync(`ifuse ${this.mountPoint}`);
    this.isMounted = true;
    console.log(`📱 Device mounted at ${this.mountPoint}`);
  }

  // 5. Unmount device
  async unmountDevice() {
    if (!this.isMounted) {
      return;
    }

    await execAsync(`umount ${this.mountPoint}`);
    this.isMounted = false;
    console.log('📱 Device unmounted');
  }

  // 6. Find app's Documents folder
  async findAppDocumentsPath() {
    // ifuse mounts the entire device
    // App containers are at: /var/mobile/Containers/Data/Application/{UUID}/
    // We need to find our app's UUID
    
    // Look for RedShift app by bundle ID
    const containersPath = path.join(this.mountPoint, 'var/mobile/Containers/Data/Application');
    const containers = await fs.readdir(containersPath);
    
    for (const containerId of containers) {
      const plistPath = path.join(containersPath, containerId, '.com.apple.mobile_container_manager.metadata.plist');
      if (await fs.pathExists(plistPath)) {
        // Check if this is our app (would need to parse plist)
        // For now, just look for Documents/Music folder as indicator
        const musicPath = path.join(containersPath, containerId, 'Documents/Music');
        if (await fs.pathExists(musicPath)) {
          return path.join(containersPath, containerId, 'Documents');
        }
      }
    }
    
    throw new Error('Could not find RedShift app on device');
  }

  // 7. Sync music files to device
  async syncMusicToDevice() {
    console.log('🎵 Starting music sync...');
    
    // Mount device
    await this.mountDevice();
    
    try {
      // Find app's Documents folder
      const documentsPath = await this.findAppDocumentsPath();
      const musicPath = path.join(documentsPath, 'Music');
      
      // Ensure Music folder exists
      await fs.ensureDir(musicPath);
      
      // Get all tracks from library
      const tracks = this.library.getAllMetadata();
      
      console.log(`📊 Found ${tracks.length} tracks in library`);
      
      // Copy each track
      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        const destPath = path.join(musicPath, path.basename(track.path));
        
        // Skip if already exists
        if (await fs.pathExists(destPath)) {
          console.log(`⏭️  Skipping ${path.basename(track.path)} (already on device)`);
          continue;
        }
        
        // Copy file
        console.log(`📤 [${i + 1}/${tracks.length}] Copying ${path.basename(track.path)}`);
        await fs.copy(track.path, destPath);
      }
      
      console.log('✅ Music sync complete');
      
    } finally {
      // Always unmount
      await this.unmountDevice();
    }
  }

  // 8. Sync playlists to device
  async syncPlaylistsToDevice() {
    await this.mountDevice();
    
    try {
      const documentsPath = await this.findAppDocumentsPath();
      const playlistsPath = path.join(documentsPath, 'Playlists');
      
      await fs.ensureDir(playlistsPath);
      
      // Get all playlists
      const playlists = await this.db.getAllPlaylists();
      
      for (const playlist of playlists) {
        const tracks = await this.db.getPlaylistTracks(playlist.id);
        
        // Export as JSON
        const playlistData = {
          name: playlist.name,
          tracks: tracks.map(t => path.basename(t.path))
        };
        
        const playlistFile = path.join(playlistsPath, `${playlist.name}.json`);
        await fs.writeJSON(playlistFile, playlistData);
      }
      
      console.log('✅ Playlists synced');
      
    } finally {
      await this.unmountDevice();
    }
  }

  // 9. Read play counts from device
  async syncPlayCountsFromDevice() {
    await this.mountDevice();
    
    try {
      const documentsPath = await this.findAppDocumentsPath();
      const syncFile = path.join(documentsPath, 'sync_status.json');
      
      if (await fs.pathExists(syncFile)) {
        const syncData = await fs.readJSON(syncFile);
        
        // Update local database
        for (const update of syncData.playCounts || []) {
          await this.db.updatePlayCount(update.path, update.playCount, update.lastPlayed);
        }
        
        for (const update of syncData.ratings || []) {
          await this.db.updateRating(update.path, update.rating);
        }
        
        console.log('✅ Play counts synced from device');
      }
      
    } finally {
      await this.unmountDevice();
    }
  }
}

module.exports = RedShiftUSBSyncService;
```

---

## Phase 2: Mobile App Changes

### 2.1 Enable File Sharing in Info.plist

**File:** `RedShiftMobile/RedShiftMobile/Resources/Info.plist`

Add these keys:
```xml
<key>UIFileSharingEnabled</key>
<true/>
<key>LSSupportsOpeningDocumentsInPlace</key>
<true/>
```

This makes the app's Documents folder accessible via Finder when plugged in.

### 2.2 Export Sync Status

**File:** `RedShiftMobile/RedShiftMobile/Services/SyncStatusService.swift`

```swift
import Foundation

class SyncStatusService {
    static func exportSyncStatus() async throws {
        let tracks = try await DatabaseService.shared.getAllTracks()
        
        let playCounts = tracks.filter { $0.playCount > 0 }.map { track in
            return [
                "path": track.fileURL.lastPathComponent,
                "playCount": track.playCount,
                "lastPlayed": track.lastPlayed ?? 0
            ] as [String: Any]
        }
        
        let ratings = tracks.filter { $0.rating > 0 }.map { track in
            return [
                "path": track.fileURL.lastPathComponent,
                "rating": track.rating
            ] as [String: Any]
        }
        
        let syncData: [String: Any] = [
            "playCounts": playCounts,
            "ratings": ratings,
            "lastSync": Date().timeIntervalSince1970
        ]
        
        let documentsPath = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let syncFile = documentsPath.appendingPathComponent("sync_status.json")
        
        let jsonData = try JSONSerialization.data(withJSONObject: syncData, options: .prettyPrinted)
        try jsonData.write(to: syncFile)
        
        print("✅ Sync status exported to sync_status.json")
    }
}
```

Call this whenever play count or rating changes, or on app background/terminate.

---

## Phase 3: Desktop UI

### 3.1 Add Sync Button to Settings Tab

In `settings-tab.html`, add:

```html
<div class="settings-section">
  <h3>Mobile Sync</h3>
  
  <div id="deviceStatus" class="device-status">
    <span class="status-icon">📱</span>
    <span id="deviceStatusText">No device connected</span>
  </div>
  
  <button id="syncToMobileBtn" class="btn btn-primary" disabled>
    Sync to Mobile
  </button>
  
  <div id="syncProgress" class="sync-progress" style="display: none;">
    <div class="progress-bar">
      <div class="progress-fill" id="syncProgressFill"></div>
    </div>
    <p id="syncProgressText">Syncing...</p>
  </div>
</div>
```

### 3.2 Wire Up UI

In `SettingsManager.js` or new `USBSyncManager.js`:

```javascript
class USBSyncManager {
  constructor(uiManager) {
    this.ui = uiManager;
    this.setupListeners();
    this.checkDeviceStatus();
  }

  setupListeners() {
    // Listen for device connection events
    window.electronAPI.on('phone-connected', (device) => {
      this.onDeviceConnected(device);
    });

    window.electronAPI.on('phone-disconnected', () => {
      this.onDeviceDisconnected();
    });

    // Sync button
    document.getElementById('syncToMobileBtn').addEventListener('click', async () => {
      await this.startSync();
    });
  }

  async checkDeviceStatus() {
    const status = await window.electronAPI.invoke('usb-sync-get-status');
    if (status.isConnected) {
      this.onDeviceConnected(status.device);
    }
  }

  onDeviceConnected(device) {
    document.getElementById('deviceStatusText').textContent = `${device.deviceName} connected`;
    document.getElementById('syncToMobileBtn').disabled = false;
  }

  onDeviceDisconnected() {
    document.getElementById('deviceStatusText').textContent = 'No device connected';
    document.getElementById('syncToMobileBtn').disabled = true;
  }

  async startSync() {
    const btn = document.getElementById('syncToMobileBtn');
    const progressDiv = document.getElementById('syncProgress');
    
    btn.disabled = true;
    progressDiv.style.display = 'block';
    
    try {
      await window.electronAPI.invoke('usb-sync-start');
      this.ui.showNotification('Sync complete!', 'success');
    } catch (error) {
      this.ui.showNotification(`Sync failed: ${error.message}`, 'error');
    } finally {
      btn.disabled = false;
      progressDiv.style.display = 'none';
    }
  }
}
```

---

## Implementation Checklist

### Desktop
- [ ] Install libimobiledevice (`brew install libimobiledevice ifuse`)
- [ ] Create `RedShiftUSBSyncService.js`
- [ ] Add IPC handlers for sync
- [ ] Wire up device detection
- [ ] Add sync UI to settings tab
- [ ] Test mounting device
- [ ] Test copying files
- [ ] Test reading sync status

### Mobile
- [ ] Enable file sharing in Info.plist
- [ ] Create `SyncStatusService.swift`
- [ ] Export sync status on app background
- [ ] Test accessing Documents via Finder

### Testing
- [ ] Plug in device, verify detection
- [ ] Click sync, verify files copy
- [ ] Check mobile app, verify files appear
- [ ] Play music on mobile, verify play count exports
- [ ] Sync back to desktop, verify play counts update

---

## Timeline

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Phase 1: Desktop Sync Service | 1 day | USB file copying works |
| Phase 2: Mobile Changes | 0.5 days | File sharing enabled, sync status export |
| Phase 3: UI | 0.5 days | Sync button works |
| **TOTAL** | **2 days** | **Full USB sync** |

---

**End of Document**  
Created: October 17, 2025
