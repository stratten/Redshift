# RedShift Mobile Development Plan

**Project:** RedShift Mobile (iOS)  
**Purpose:** Native iOS music player with seamless desktop sync  
**Created:** September 30, 2025  
**Estimated Duration:** 2-3 weeks (MVP)  
**Status:** 🚀 APPROVED - Ready to Begin Development

---

## Executive Summary

Build a native iOS music application with iTunes File Sharing enabled, allowing direct file access via AFC/Finder for seamless synchronization with RedShift Desktop. This eliminates dependency on Doppler's undocumented APIs and provides full control over the sync experience.

### Why Build This?

**Current Pain Points with Doppler:**
- ❌ No automated sync between desktop and mobile
- ❌ Manual file transfer only (drag-and-drop)
- ❌ No playlist synchronization
- ❌ Cannot query device state programmatically
- ❌ Duplicate management impossible
- ❌ No bi-directional metadata sync (play counts, ratings)
- ❌ Files locked in sandboxed container (no AFC access)

**RedShift Mobile Advantages:**
- ✅ **iTunes File Sharing enabled** - Direct file access via AFC
- ✅ **Full bi-directional sync** - Play counts, ratings, playlists
- ✅ **Programmatic file management** - List, add, remove files via desktop
- ✅ **SQLite database exposed** - Sync metadata instantly
- ✅ **No API breakage risk** - We control both ends
- ✅ **Rapid iteration** - Fix bugs and add features quickly
- ✅ **CarPlay support** - Native iOS integration

---

## Technical Architecture

### Core Technology Stack

```
┌─────────────────────────────────────────┐
│         RedShift Mobile (iOS)           │
├─────────────────────────────────────────┤
│ • SwiftUI (UI Framework)                │
│ • AVFoundation (Audio Playback)         │
│ • Core Data / SQLite (Database)         │
│ • FileManager (File Access)             │
│ • MediaPlayer (Lock Screen Controls)    │
│ • CarPlay Framework (Optional)          │
└─────────────────────────────────────────┘
              ▲         ▼
              │ iTunes File Sharing
              │ (AFC Protocol)
              │
┌─────────────────────────────────────────┐
│       RedShift Desktop (Electron)       │
├─────────────────────────────────────────┤
│ • pymobiledevice3 (AFC Access)          │
│ • SQLite (Desktop Database)             │
│ • Music Library Management              │
└─────────────────────────────────────────┘
```

### File Structure on iOS Device

```
/Documents/                    ← Accessible via AFC (UIFileSharingEnabled)
  ├── Music/                   ← Audio files
  │   ├── Artist - Song.mp3
  │   ├── Artist - Song2.m4a
  │   └── ...
  ├── Database/
  │   ├── library.db           ← SQLite database (metadata)
  │   └── sync_state.json      ← Last sync info
  └── Playlists/
      ├── Favorites.m3u
      └── WorkoutMix.m3u
```

**Key:** `UIFileSharingEnabled = YES` in `Info.plist` makes `/Documents/` **fully accessible** from macOS Finder, iTunes, and `pymobiledevice3`.

---

## MVP Feature Set

### Phase 1: Core Audio Playback (Week 1)

**Duration:** 5-7 days  
**Priority:** Critical

#### 1.1 Audio Player Foundation

**Functionality:**
- Play/pause/stop audio files
- Next/previous track
- Seek within track
- Volume control
- Shuffle mode
- Repeat modes (off, all, one)
- Background audio playback
- Lock screen controls

**Implementation (Swift):**

```swift
// AudioPlayerService.swift
import AVFoundation
import MediaPlayer

class AudioPlayerService: ObservableObject {
    private var player: AVAudioPlayer?
    private var queue: [Track] = []
    private var currentIndex: Int = 0
    
    @Published var isPlaying: Bool = false
    @Published var currentTrack: Track?
    @Published var currentTime: TimeInterval = 0
    @Published var duration: TimeInterval = 0
    @Published var shuffleEnabled: Bool = false
    @Published var repeatMode: RepeatMode = .off
    
    // Setup audio session for background playback
    func setupAudioSession() {
        do {
            try AVAudioSession.sharedInstance().setCategory(
                .playback,
                mode: .default,
                options: []
            )
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            print("Failed to setup audio session: \(error)")
        }
    }
    
    // Load and play track
    func play(track: Track) {
        guard let url = track.fileURL else { return }
        
        do {
            player = try AVAudioPlayer(contentsOf: url)
            player?.delegate = self
            player?.prepareToPlay()
            player?.play()
            
            isPlaying = true
            currentTrack = track
            duration = player?.duration ?? 0
            
            setupNowPlayingInfo()
            setupRemoteCommandCenter()
            
        } catch {
            print("Playback failed: \(error)")
        }
    }
    
    func pause() {
        player?.pause()
        isPlaying = false
    }
    
    func resume() {
        player?.play()
        isPlaying = true
    }
    
    func seek(to time: TimeInterval) {
        player?.currentTime = time
        currentTime = time
    }
    
    // Lock screen integration
    func setupNowPlayingInfo() {
        guard let track = currentTrack else { return }
        
        var nowPlayingInfo = [String: Any]()
        nowPlayingInfo[MPMediaItemPropertyTitle] = track.title
        nowPlayingInfo[MPMediaItemPropertyArtist] = track.artist
        nowPlayingInfo[MPMediaItemPropertyAlbumTitle] = track.album
        nowPlayingInfo[MPMediaItemPropertyPlaybackDuration] = duration
        nowPlayingInfo[MPNowPlayingInfoPropertyElapsedPlaybackTime] = currentTime
        
        if let artwork = track.artwork {
            nowPlayingInfo[MPMediaItemPropertyArtwork] = 
                MPMediaItemArtwork(boundsSize: artwork.size) { _ in artwork }
        }
        
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
    }
    
    // Remote control (lock screen buttons, AirPods, CarPlay)
    func setupRemoteCommandCenter() {
        let commandCenter = MPRemoteCommandCenter.shared()
        
        commandCenter.playCommand.addTarget { [weak self] _ in
            self?.resume()
            return .success
        }
        
        commandCenter.pauseCommand.addTarget { [weak self] _ in
            self?.pause()
            return .success
        }
        
        commandCenter.nextTrackCommand.addTarget { [weak self] _ in
            self?.playNext()
            return .success
        }
        
        commandCenter.previousTrackCommand.addTarget { [weak self] _ in
            self?.playPrevious()
            return .success
        }
    }
}
```

**Estimated Lines of Code:** ~500 lines  
**Complexity:** Low (iOS provides all the APIs)

#### 1.2 Library Management

**Functionality:**
- Scan `Documents/Music/` for audio files
- Extract metadata (title, artist, album, duration)
- Display library in table view
- Search and filter tracks
- Sort by artist/album/title

**Data Model:**

```swift
// Track.swift
import Foundation
import SwiftUI

struct Track: Identifiable, Codable {
    let id: UUID
    let filePath: String            // Relative to Documents/Music/
    var title: String
    var artist: String
    var album: String
    var albumArtist: String?
    var genre: String?
    var year: Int?
    var trackNumber: Int?
    var duration: TimeInterval
    var fileSize: Int64
    var lastModified: Date
    
    // Metadata from desktop sync
    var playCount: Int = 0
    var lastPlayed: Date?
    var isFavorite: Bool = false
    var rating: Int = 0             // 0-5 stars
    
    // Computed
    var fileURL: URL? {
        let documentsPath = FileManager.default.urls(
            for: .documentDirectory, 
            in: .userDomainMask
        )[0]
        return documentsPath
            .appendingPathComponent("Music")
            .appendingPathComponent(filePath)
    }
}
```

**Library Scanner:**

```swift
// LibraryScanner.swift
import AVFoundation

class LibraryScanner {
    func scanMusicDirectory() -> [Track] {
        var tracks: [Track] = []
        
        let fileManager = FileManager.default
        let documentsPath = fileManager.urls(
            for: .documentDirectory,
            in: .userDomainMask
        )[0]
        let musicPath = documentsPath.appendingPathComponent("Music")
        
        // Create Music directory if it doesn't exist
        try? fileManager.createDirectory(
            at: musicPath,
            withIntermediateDirectories: true
        )
        
        // Scan for audio files
        guard let enumerator = fileManager.enumerator(at: musicPath, includingPropertiesForKeys: nil) else {
            return tracks
        }
        
        for case let fileURL as URL in enumerator {
            guard isAudioFile(fileURL) else { continue }
            
            if let track = extractMetadata(from: fileURL, musicPath: musicPath) {
                tracks.append(track)
            }
        }
        
        return tracks
    }
    
    private func isAudioFile(_ url: URL) -> Bool {
        let audioExtensions = ["mp3", "m4a", "flac", "wav", "aac", "opus"]
        return audioExtensions.contains(url.pathExtension.lowercased())
    }
    
    private func extractMetadata(from url: URL, musicPath: URL) -> Track? {
        let asset = AVAsset(url: url)
        
        // Extract metadata
        var title = url.deletingPathExtension().lastPathComponent
        var artist = "Unknown Artist"
        var album = "Unknown Album"
        var duration: TimeInterval = 0
        
        for metadata in asset.commonMetadata {
            guard let key = metadata.commonKey?.rawValue,
                  let value = metadata.stringValue else { continue }
            
            switch key {
            case "title": title = value
            case "artist": artist = value
            case "albumName": album = value
            default: break
            }
        }
        
        duration = CMTimeGetSeconds(asset.duration)
        
        let attributes = try? FileManager.default.attributesOfItem(atPath: url.path)
        let fileSize = attributes?[.size] as? Int64 ?? 0
        let lastModified = attributes?[.modificationDate] as? Date ?? Date()
        
        let relativePath = url.path.replacingOccurrences(
            of: musicPath.path + "/",
            with: ""
        )
        
        return Track(
            id: UUID(),
            filePath: relativePath,
            title: title,
            artist: artist,
            album: album,
            duration: duration,
            fileSize: fileSize,
            lastModified: lastModified
        )
    }
}
```

**Estimated Lines of Code:** ~300 lines

#### 1.3 Basic UI

**Views:**

1. **Library View** - List of all tracks
2. **Now Playing View** - Full-screen player
3. **Mini Player** - Bottom bar (collapsed)

```swift
// LibraryView.swift
import SwiftUI

struct LibraryView: View {
    @StateObject private var library = MusicLibrary()
    @State private var searchText = ""
    
    var filteredTracks: [Track] {
        if searchText.isEmpty {
            return library.tracks
        }
        return library.tracks.filter { track in
            track.title.localizedCaseInsensitiveContains(searchText) ||
            track.artist.localizedCaseInsensitiveContains(searchText) ||
            track.album.localizedCaseInsensitiveContains(searchText)
        }
    }
    
    var body: some View {
        NavigationView {
            List(filteredTracks) { track in
                TrackRow(track: track)
                    .onTapGesture {
                        AudioPlayerService.shared.play(track: track)
                    }
            }
            .searchable(text: $searchText)
            .navigationTitle("Library")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Scan") {
                        library.refresh()
                    }
                }
            }
        }
    }
}

struct TrackRow: View {
    let track: Track
    
    var body: some View {
        HStack {
            // Album art thumbnail (if available)
            Rectangle()
                .fill(Color.gray.opacity(0.3))
                .frame(width: 50, height: 50)
                .cornerRadius(4)
            
            VStack(alignment: .leading, spacing: 4) {
                Text(track.title)
                    .font(.headline)
                Text(track.artist)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
            
            Spacer()
            
            Text(formatDuration(track.duration))
                .font(.caption)
                .foregroundColor(.secondary)
        }
    }
    
    private func formatDuration(_ duration: TimeInterval) -> String {
        let minutes = Int(duration) / 60
        let seconds = Int(duration) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
}
```

**Estimated Lines of Code:** ~600 lines for all basic UI

---

### Phase 2: File Sharing & Desktop Integration (Week 2)

**Duration:** 5-7 days  
**Priority:** Critical

#### 2.1 Enable iTunes File Sharing

**Info.plist Configuration:**

```xml
<!-- Info.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
    <!-- Enable iTunes File Sharing (AFC Access) -->
    <key>UIFileSharingEnabled</key>
    <true/>
    
    <!-- Allow app to appear in Files.app -->
    <key>LSSupportsOpeningDocumentsInPlace</key>
    <true/>
    
    <!-- Background audio -->
    <key>UIBackgroundModes</key>
    <array>
        <string>audio</string>
    </array>
    
    <!-- Supported file types -->
    <key>UTImportedTypeDeclarations</key>
    <array>
        <dict>
            <key>UTTypeIdentifier</key>
            <string>public.mp3</string>
            <key>UTTypeConformsTo</key>
            <array>
                <string>public.audio</string>
            </array>
            <key>UTTypeTagSpecification</key>
            <dict>
                <key>public.filename-extension</key>
                <array>
                    <string>mp3</string>
                </array>
            </dict>
        </dict>
        <!-- Add more types: m4a, flac, wav, etc. -->
    </array>
</dict>
</plist>
```

**Result:** After this configuration, connecting the iPhone to a Mac will make `Documents/` folder visible in Finder under the device's "Files" section.

#### 2.2 Database Export for Desktop Sync

**SQLite Database Schema:**

```sql
-- library.db (stored in Documents/Database/)

CREATE TABLE tracks (
    id TEXT PRIMARY KEY,              -- UUID
    file_path TEXT NOT NULL,          -- Relative to Documents/Music/
    title TEXT,
    artist TEXT,
    album TEXT,
    album_artist TEXT,
    genre TEXT,
    year INTEGER,
    track_number INTEGER,
    duration REAL,
    file_size INTEGER,
    last_modified INTEGER,
    
    -- Metadata
    play_count INTEGER DEFAULT 0,
    last_played INTEGER,
    is_favorite INTEGER DEFAULT 0,   -- Boolean
    rating INTEGER DEFAULT 0,         -- 0-5
    
    -- Timestamps
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE playlists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE playlist_tracks (
    playlist_id TEXT,
    track_id TEXT,
    position INTEGER,
    PRIMARY KEY (playlist_id, track_id),
    FOREIGN KEY (playlist_id) REFERENCES playlists(id),
    FOREIGN KEY (track_id) REFERENCES tracks(id)
);

CREATE TABLE sync_state (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Indices for performance
CREATE INDEX idx_tracks_artist ON tracks(artist);
CREATE INDEX idx_tracks_album ON tracks(album);
CREATE INDEX idx_playlist_tracks_playlist ON playlist_tracks(playlist_id);
```

**Database Manager (Swift):**

```swift
// DatabaseManager.swift
import SQLite

class DatabaseManager {
    static let shared = DatabaseManager()
    private var db: Connection?
    
    private init() {
        do {
            let path = FileManager.default.urls(
                for: .documentDirectory,
                in: .userDomainMask
            )[0].appendingPathComponent("Database/library.db")
            
            // Ensure Database directory exists
            try? FileManager.default.createDirectory(
                at: path.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            
            db = try Connection(path.path)
            createTables()
        } catch {
            print("Database init failed: \(error)")
        }
    }
    
    func saveTrack(_ track: Track) {
        // INSERT OR REPLACE into tracks table
        // Implementation details...
    }
    
    func updatePlayCount(trackId: UUID) {
        // INCREMENT play_count, UPDATE last_played
    }
    
    func toggleFavorite(trackId: UUID) {
        // TOGGLE is_favorite
    }
    
    func setRating(trackId: UUID, rating: Int) {
        // UPDATE rating
    }
}
```

#### 2.3 Desktop Sync Logic (Electron)

**RedShift Desktop Enhancement:**

```javascript
// src/main/services/MobileSyncService.js

class MobileSyncService {
  constructor(database, musicLibraryCache) {
    this.db = database;
    this.musicLibraryCache = musicLibraryCache;
  }
  
  /**
   * Sync with RedShift Mobile device
   */
  async syncWithMobile() {
    try {
      // 1. Pull device database via AFC
      const deviceDbPath = await this.pullDeviceDatabase();
      // pymobiledevice3 apps pull co.redshift.mobile /Documents/Database/library.db ./device_library.db
      
      // 2. Merge metadata (play counts, ratings, favorites)
      await this.mergeMetadata(deviceDbPath);
      
      // 3. Copy new music files to device
      await this.pushNewFiles();
      
      // 4. Update device database
      await this.pushDeviceDatabase(deviceDbPath);
      
      // 5. Clean up temp files
      await fs.remove(deviceDbPath);
      
      console.log('✅ Mobile sync complete');
      
    } catch (error) {
      console.error('❌ Mobile sync failed:', error);
      throw error;
    }
  }
  
  /**
   * Pull device database from iPhone
   */
  async pullDeviceDatabase() {
    const tempPath = path.join(os.tmpdir(), 'redshift_device.db');
    
    const cmd = pythonBridge.getPymobiledevice3Command(
      `apps pull co.redshift.mobile /Documents/Database/library.db ${tempPath}`
    );
    
    execSync(cmd, { encoding: 'utf8' });
    return tempPath;
  }
  
  /**
   * Merge metadata from device database
   */
  async mergeMetadata(deviceDbPath) {
    const sqlite3 = require('sqlite3').verbose();
    const deviceDb = new sqlite3.Database(deviceDbPath);
    
    // Query device database
    const deviceTracks = await new Promise((resolve, reject) => {
      deviceDb.all(
        'SELECT id, file_path, play_count, last_played, is_favorite, rating FROM tracks',
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
    
    // Merge logic: highest play_count wins, most recent rating wins
    for (const deviceTrack of deviceTracks) {
      const localTrack = await this.db.getSongByPath(deviceTrack.file_path);
      
      if (!localTrack) continue;
      
      const updates = {};
      
      // Play count: take highest
      if (deviceTrack.play_count > localTrack.play_count) {
        updates.play_count = deviceTrack.play_count;
      }
      
      // Last played: take most recent
      if (deviceTrack.last_played > localTrack.last_played) {
        updates.last_played = deviceTrack.last_played;
      }
      
      // Favorite: take device value (user may have changed on mobile)
      updates.is_favorite = deviceTrack.is_favorite;
      
      // Rating: take device value
      if (deviceTrack.rating !== localTrack.rating) {
        updates.rating = deviceTrack.rating;
      }
      
      // Update local database
      await this.db.updateSongMetadata(localTrack.file_path, updates);
    }
    
    deviceDb.close();
  }
  
  /**
   * Push new music files to device
   */
  async pushNewFiles() {
    const localTracks = await this.musicLibraryCache.getAllTracks();
    const deviceDbPath = await this.pullDeviceDatabase();
    
    const sqlite3 = require('sqlite3').verbose();
    const deviceDb = new sqlite3.Database(deviceDbPath);
    
    // Get list of files already on device
    const deviceFiles = await new Promise((resolve, reject) => {
      deviceDb.all(
        'SELECT file_path FROM tracks',
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows.map(r => r.file_path));
        }
      );
    });
    
    deviceDb.close();
    
    // Find new files not on device
    const newFiles = localTracks.filter(track => 
      !deviceFiles.includes(path.basename(track.file_path))
    );
    
    console.log(`📱 Pushing ${newFiles.length} new files to device...`);
    
    // Copy files via AFC
    for (const file of newFiles) {
      const remotePath = `/Documents/Music/${path.basename(file.file_path)}`;
      const cmd = pythonBridge.getPymobiledevice3Command(
        `apps push co.redshift.mobile "${file.file_path}" "${remotePath}"`
      );
      
      execSync(cmd, { encoding: 'utf8' });
      console.log(`✅ Copied: ${path.basename(file.file_path)}`);
    }
  }
  
  /**
   * Push updated database back to device
   */
  async pushDeviceDatabase(localDbPath) {
    const cmd = pythonBridge.getPymobiledevice3Command(
      `apps push co.redshift.mobile "${localDbPath}" "/Documents/Database/library.db"`
    );
    
    execSync(cmd, { encoding: 'utf8' });
  }
}
```

**Estimated Lines of Code:** ~800 lines (iOS + Desktop)

---

### Phase 3: Playlist Management (Week 3)

**Duration:** 3-5 days  
**Priority:** High

#### 3.1 Playlist Creation & Management (iOS)

**Features:**
- Create/delete playlists
- Add/remove tracks from playlists
- Reorder tracks within playlists
- Import/export M3U playlists

```swift
// PlaylistManager.swift
class PlaylistManager: ObservableObject {
    @Published var playlists: [Playlist] = []
    private let db = DatabaseManager.shared
    
    func createPlaylist(name: String) -> Playlist {
        let playlist = Playlist(id: UUID(), name: name, tracks: [])
        db.savePlaylist(playlist)
        playlists.append(playlist)
        return playlist
    }
    
    func addTrack(_ track: Track, to playlist: Playlist) {
        db.addTrackToPlaylist(trackId: track.id, playlistId: playlist.id)
        if let index = playlists.firstIndex(where: { $0.id == playlist.id }) {
            playlists[index].tracks.append(track)
        }
    }
    
    func exportPlaylist(_ playlist: Playlist) -> URL {
        // Generate M3U file
        let m3uContent = playlist.tracks.map { track in
            "#EXTINF:\(Int(track.duration)),\(track.artist) - \(track.title)\n\(track.filePath)"
        }.joined(separator: "\n")
        
        let url = FileManager.default.urls(
            for: .documentDirectory,
            in: .userDomainMask
        )[0].appendingPathComponent("Playlists/\(playlist.name).m3u")
        
        try? m3uContent.write(to: url, atomically: true, encoding: .utf8)
        return url
    }
}
```

#### 3.2 Playlist Sync (Desktop ↔ Mobile)

**Desktop Reads Playlists:**
```javascript
async syncPlaylists() {
  // Pull device database
  const deviceDb = await this.pullDeviceDatabase();
  
  // Read playlists table
  const devicePlaylists = await this.getDevicePlaylists(deviceDb);
  
  // Merge with local playlists
  for (const devicePlaylist of devicePlaylists) {
    const localPlaylist = await this.db.getPlaylistByName(devicePlaylist.name);
    
    if (!localPlaylist) {
      // Create new playlist locally
      await this.db.createPlaylist(devicePlaylist);
    } else {
      // Merge tracks (union of both)
      await this.mergePlaylistTracks(localPlaylist, devicePlaylist);
    }
  }
  
  // Push updated playlists back to device
  await this.pushPlaylistsToDevice();
}
```

**Estimated Lines of Code:** ~400 lines

---

### Phase 4: Polish & Advanced Features (Week 3, second half)

**Duration:** 2-3 days  
**Priority:** Medium

#### 4.1 Album Art Management

**Extract and Display Album Art:**
```swift
import AVFoundation

func extractAlbumArt(from url: URL) -> UIImage? {
    let asset = AVAsset(url: url)
    
    for metadata in asset.commonMetadata {
        if metadata.commonKey == .commonKeyArtwork,
           let data = metadata.dataValue,
           let image = UIImage(data: data) {
            return image
        }
    }
    
    return nil
}
```

**Cache Album Art:**
```swift
// Save artwork to Documents/Cache/artwork_{trackId}.jpg
func cacheAlbumArt(_ image: UIImage, for trackId: UUID) {
    let cachePath = FileManager.default.urls(
        for: .documentDirectory,
        in: .userDomainMask
    )[0].appendingPathComponent("Cache")
    
    try? FileManager.default.createDirectory(at: cachePath, withIntermediateDirectories: true)
    
    let artworkPath = cachePath.appendingPathComponent("\(trackId).jpg")
    if let data = image.jpegData(compressionQuality: 0.8) {
        try? data.write(to: artworkPath)
    }
}
```

#### 4.2 Settings & Preferences

**Settings View:**
- EQ presets (if implementing audio effects)
- Playback settings (crossfade, gapless)
- Library settings (scan on launch)
- Sync settings (auto-sync on connect)
- Storage management (clear cache)

#### 4.3 CarPlay Integration (Optional)

```swift
// CarPlaySceneDelegate.swift
import CarPlay

class CarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
    func templateApplicationScene(
        _ templateApplicationScene: CPTemplateApplicationScene,
        didConnect interfaceController: CPInterfaceController
    ) {
        // Create CarPlay list template
        let library = MusicLibrary.shared
        
        let items = library.tracks.map { track in
            CPListItem(
                text: track.title,
                detailText: track.artist
            )
        }
        
        let listTemplate = CPListTemplate(
            title: "RedShift",
            sections: [CPListSection(items: items)]
        )
        
        interfaceController.setRootTemplate(listTemplate, animated: true)
    }
}
```

**Estimated Lines of Code:** ~500 lines

---

## Desktop Integration Strategy

### Sync Flow (Automated)

```
┌──────────────────────────────────────────────────┐
│ User connects iPhone to Mac (USB)               │
└──────────────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────┐
│ RedShift Desktop detects device via USB monitor │
└──────────────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────┐
│ Check if device is RedShift Mobile               │
│ (Check for bundle ID: co.redshift.mobile)        │
└──────────────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────┐
│ Show "Sync to RedShift Mobile?" notification    │
│ [Sync Now] [Cancel]                             │
└──────────────────────────────────────────────────┘
                    │ User clicks "Sync Now"
                    ▼
┌──────────────────────────────────────────────────┐
│ Pull device database (library.db)                │
│ ├─ pymobiledevice3 apps pull ...                │
│ └─ Save to temp directory                       │
└──────────────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────┐
│ Merge metadata (play counts, ratings, favorites)│
│ ├─ Read device database                         │
│ ├─ Compare with local database                  │
│ └─ Update local with device changes             │
└──────────────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────┐
│ Identify new files to sync                      │
│ ├─ Compare local library vs device database     │
│ └─ Create list of files not on device           │
└──────────────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────┐
│ Copy new files to device                        │
│ ├─ pymobiledevice3 apps push ...                │
│ └─ Update progress bar in UI                    │
└──────────────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────┐
│ Update device database with new tracks          │
│ └─ Insert new track records                     │
└──────────────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────┐
│ Push updated database to device                 │
│ └─ pymobiledevice3 apps push library.db         │
└──────────────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────┐
│ Sync complete notification                      │
│ "✅ Synced 45 new songs to RedShift Mobile"      │
└──────────────────────────────────────────────────┘
```

### Detection Logic (Desktop)

```javascript
// Detect RedShift Mobile app on connected device
async function detectRedShiftMobile() {
  try {
    const cmd = pythonBridge.getPymobiledevice3Command('apps list');
    const output = execSync(cmd, { encoding: 'utf8' });
    const apps = JSON.parse(output);
    
    // Check if RedShift Mobile is installed
    if (apps['co.redshift.mobile']) {
      return {
        installed: true,
        name: apps['co.redshift.mobile'].CFBundleDisplayName,
        version: apps['co.redshift.mobile'].CFBundleShortVersionString
      };
    }
    
    return { installed: false };
  } catch (error) {
    console.error('Failed to detect RedShift Mobile:', error);
    return { installed: false };
  }
}
```

---

## Development Tooling

### Xcode Project Setup

```
RedShift Mobile/
├── RedShiftMobile.xcodeproj
├── RedShiftMobile/
│   ├── App/
│   │   ├── RedShiftMobileApp.swift       # Main app entry
│   │   └── Info.plist                     # File sharing config
│   ├── Models/
│   │   ├── Track.swift
│   │   ├── Playlist.swift
│   │   └── Album.swift
│   ├── Services/
│   │   ├── AudioPlayerService.swift
│   │   ├── LibraryScanner.swift
│   │   ├── DatabaseManager.swift
│   │   └── PlaylistManager.swift
│   ├── Views/
│   │   ├── LibraryView.swift
│   │   ├── NowPlayingView.swift
│   │   ├── MiniPlayerView.swift
│   │   ├── PlaylistsView.swift
│   │   └── SettingsView.swift
│   ├── Components/
│   │   ├── TrackRow.swift
│   │   ├── AlbumCard.swift
│   │   └── PlayerControls.swift
│   └── Assets.xcassets/
├── Tests/
│   ├── AudioPlayerTests.swift
│   └── LibraryScannerTests.swift
└── README.md
```

### Dependencies (Swift Package Manager)

```swift
// Package.swift
dependencies: [
    .package(url: "https://github.com/stephencelis/SQLite.swift.git", from: "0.14.1"),
]
```

That's it! Swift has native support for:
- Audio playback (AVFoundation)
- UI (SwiftUI)
- File management (FileManager)
- No additional dependencies needed for MVP

---

## Testing Strategy

### Unit Tests

```swift
// AudioPlayerTests.swift
import XCTest
@testable import RedShiftMobile

class AudioPlayerTests: XCTestCase {
    var player: AudioPlayerService!
    
    override func setUp() {
        player = AudioPlayerService()
    }
    
    func testPlayTrack() {
        let track = createMockTrack()
        player.play(track: track)
        
        XCTAssertTrue(player.isPlaying)
        XCTAssertEqual(player.currentTrack?.id, track.id)
    }
    
    func testPauseResume() {
        let track = createMockTrack()
        player.play(track: track)
        player.pause()
        
        XCTAssertFalse(player.isPlaying)
        
        player.resume()
        XCTAssertTrue(player.isPlaying)
    }
}
```

### Integration Tests

1. **File Sharing Test:**
   - Run app on simulator/device
   - Connect to Mac
   - Verify `Documents/` folder appears in Finder
   - Manually copy MP3 file
   - Verify app detects and plays file

2. **Sync Test:**
   - Install RedShift Mobile on real device
   - Connect to Mac running RedShift Desktop
   - Trigger sync
   - Verify files copied correctly
   - Verify database updated

3. **Metadata Sync Test:**
   - Play song on mobile (increment play count)
   - Sync with desktop
   - Verify desktop database updated
   - Play different song on desktop
   - Sync to mobile
   - Verify mobile play count updated

---

## App Store Submission

### Requirements

1. **Apple Developer Account** ($99/year)
2. **App Store Connect Listing:**
   - App name: "RedShift Mobile"
   - Subtitle: "Seamless music sync and playback"
   - Description: (See marketing copy below)
   - Screenshots: iPhone, iPad (if supporting)
   - Privacy policy URL
   - Support URL

3. **App Store Review Guidelines:**
   - ✅ No violations (music player is allowed)
   - ✅ No in-app purchases (if free)
   - ✅ No third-party login (self-contained)
   - ✅ File sharing is permitted functionality

### Marketing Copy

**App Store Description:**
```
RedShift Mobile - Your music, your way.

RedShift Mobile is the perfect companion to RedShift Desktop, providing 
seamless music synchronization and playback on your iPhone.

FEATURES:
• Play your entire music library offline
• Automatic sync with RedShift Desktop via USB
• Track your listening habits (play counts, favorites, ratings)
• Create and manage playlists
• Beautiful, modern interface
• CarPlay support for in-car listening
• No subscriptions, no cloud storage required

HOW IT WORKS:
1. Install RedShift Desktop on your Mac
2. Connect your iPhone via USB
3. Sync automatically - no manual file management
4. Enjoy your music anywhere

Your music stays on your device. No internet required after sync.

PERFECT FOR:
• Audiophiles with large FLAC collections
• Privacy-conscious users who want local storage
• Anyone tired of streaming subscriptions
• Music collectors who want full control

Free and open source. Your music, your device, your control.
```

---

## Timeline & Resource Allocation

### Week 1: Core Audio (5-7 days)

| Day | Task | Hours | Deliverable |
|-----|------|-------|-------------|
| 1 | Xcode project setup, basic UI | 6-8 | Empty app shell |
| 2 | Audio player service implementation | 8 | Play/pause working |
| 3 | Library scanner, metadata extraction | 8 | Tracks display in list |
| 4 | Now Playing UI, player controls | 8 | Full player UI |
| 5 | Background playback, lock screen | 6 | Works in background |
| 6-7 | Testing, bug fixes | 8 | Stable playback |

**Milestone:** App plays music files with background support

### Week 2: File Sharing & Sync (5-7 days)

| Day | Task | Hours | Deliverable |
|-----|------|-------|-------------|
| 8 | iTunes File Sharing setup | 4 | Files visible in Finder |
| 9 | Database schema, SQLite integration | 8 | Database saves tracks |
| 10 | Desktop sync service (pull/push DB) | 8 | DB syncs both ways |
| 11 | Desktop sync service (file transfer) | 8 | Files copy to device |
| 12 | Sync UI (desktop progress, mobile refresh) | 6 | Sync UI working |
| 13-14 | Testing, sync edge cases | 10 | Reliable sync |

**Milestone:** Full bi-directional sync working

### Week 3: Playlists & Polish (5-7 days)

| Day | Task | Hours | Deliverable |
|-----|------|-------|-------------|
| 15 | Playlist creation/management (iOS) | 8 | Playlists work on mobile |
| 16 | Playlist sync (desktop integration) | 6 | Playlists sync |
| 17 | Album art extraction/display | 6 | Album art shows |
| 18 | Settings view, preferences | 4 | Settings functional |
| 19 | UI polish, animations | 6 | Beautiful UI |
| 20-21 | Testing, App Store prep | 10 | Ready for release |

**Milestone:** MVP ready for App Store submission

---

## Post-MVP Roadmap

### Version 1.1 (1-2 weeks)

- **EQ & Audio Effects** (3-5 days)
- **Smart Playlists** (2-3 days)
- **Lyrics Display** (2-3 days)
- **iPad Optimization** (1-2 days)

### Version 1.2 (1-2 weeks)

- **CarPlay Full Integration** (3-5 days)
- **AirPlay Support** (1-2 days)
- **Sleep Timer** (1 day)
- **Crossfade & Gapless** (2-3 days)

### Version 2.0 (2-3 weeks)

- **Wi-Fi Sync** (no USB required)
- **Watch App** (basic controls)
- **Widgets** (iOS 14+)
- **Siri Integration**

---

## Cost & Resource Analysis

### Development Costs

| Item | Cost | Notes |
|------|------|-------|
| Apple Developer Account | $99/year | Required for App Store |
| Xcode | Free | Mac required |
| Device Testing | $0-$800 | Use personal iPhone or buy test device |
| Time (2-3 weeks @ $50/hr) | $4,000-$6,000 | If billing self |

**Total: ~$100-$900 out-of-pocket**

### Ongoing Costs

| Item | Annual Cost |
|------|-------------|
| Apple Developer Account | $99 |
| App Store hosting | $0 |
| Backend (none needed) | $0 |

**Total: $99/year**

---

## Risk Analysis

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| AVFoundation limitations | Low | Medium | Test with diverse file types early |
| AFC access changes | Low | High | Monitor iOS updates, have fallback |
| App Store rejection | Low | High | Follow guidelines strictly |
| Sync conflicts | Medium | Medium | Clear conflict resolution logic |
| Battery drain | Medium | Low | Optimize audio buffer management |

### Business Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Low adoption | Medium | Low | Free app, no cost to try |
| iOS updates break features | Low | Medium | Stay on latest Xcode/iOS |
| Maintenance burden | High | Medium | Code quality, good architecture |

---

## Success Metrics

### MVP Launch Goals

- [ ] App Store approval on first submission
- [ ] Plays all major audio formats (MP3, M4A, FLAC, WAV, AAC)
- [ ] Sync completes 1000 songs in < 10 minutes
- [ ] Battery usage < 10%/hour during playback
- [ ] Zero crashes in first 100 downloads
- [ ] 4+ star rating average

### 6-Month Goals

- 1,000+ downloads
- 50+ positive reviews
- < 2% crash rate
- Active community (GitHub stars, forum discussions)
- Feature requests prioritized

---

## Competitive Analysis

### vs. Doppler

| Feature | RedShift Mobile | Doppler |
|---------|----------------|---------|
| Automated sync | ✅ Full sync | ❌ Manual only |
| Playlist sync | ✅ Bi-directional | ❌ No sync |
| Play count sync | ✅ Both ways | ❌ No sync |
| File access | ✅ Full AFC | ❌ Locked |
| Duplicate prevention | ✅ Hash-based | ❌ Manual |
| Price | Free | $7.99 one-time |
| Open source | ✅ Yes | ❌ No |

**Competitive advantage:** We solve the #1 pain point (sync) that Doppler refuses to address.

### vs. Apple Music / Spotify

| Feature | RedShift Mobile | Streaming Apps |
|---------|----------------|----------------|
| Offline storage | ✅ Permanent | ⚠️  Requires subscription |
| File ownership | ✅ You own files | ❌ DRM-locked |
| Privacy | ✅ Local only | ❌ Tracking |
| Lossless support | ✅ FLAC, etc. | ⚠️  Limited |
| Cost | Free | $10-20/month |
| Internet required | ❌ After sync | ✅ Always |

**Target audience:** People who own their music and want control.

---

## Open Source Strategy

### GitHub Repository

```
redshift-mobile/
├── LICENSE (MIT)
├── README.md
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── RedShiftMobile/          # iOS app code
├── Docs/
│   ├── ARCHITECTURE.md
│   ├── SYNC_PROTOCOL.md
│   └── BUILDING.md
└── .github/
    ├── ISSUE_TEMPLATE/
    └── workflows/
        └── ci.yml           # Xcode CI
```

### Community Building

- **Documentation:** Clear setup instructions
- **Issue templates:** Bug reports, feature requests
- **Contributing guide:** Code style, PR process
- **Discord/Slack:** Community support channel
- **Blog posts:** Technical deep-dives on sync protocol

---

## Conclusion

RedShift Mobile is a **2-3 week investment** that eliminates all Doppler sync limitations and provides full control over the music experience. The MVP is achievable, the technology is proven, and the value proposition is clear.

**Recommendation:** Proceed with RedShift Mobile development in parallel with Doppler WebSocket integration. Use WebSocket sync as a bridge while the iOS app is being built, then deprecate it once RedShift Mobile launches.

**Next Steps:**
1. Set up Xcode project
2. Implement Phase 1 (core audio playback)
3. Test file sharing with real device
4. Build desktop sync integration
5. Launch MVP on App Store

---

**End of Document**  
Last Updated: September 30, 2025
