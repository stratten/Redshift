# RedShift Mobile

A lightweight, sync-friendly iOS music player with seamless desktop integration.

## Features

### ✅ Implemented
- **Full Audio Playback Engine**
  - Play/pause/skip controls
  - Seek within tracks
  - Volume control
  - Shuffle mode
  - Repeat modes (off, all, one)
  - Background audio playback
  - Lock screen controls (MediaPlayer framework)
  
- **Music Library Management**
  - Automatic library scanning (`/Documents/Music/`)
  - Metadata extraction via AVFoundation
  - Search and filtering
  - Sort by artist, album, title, or recently added
  - Play counts, favorites, ratings
  
- **Playlist Management**
  - Create/edit/delete playlists
  - Add/remove tracks
  - Play playlists with shuffle/repeat
  
- **SQLite Database**
  - Persistent metadata storage
  - Tracks table with full metadata
  - Playlists table with JSON-encoded track references
  - Thread-safe actor pattern
  
- **Modern SwiftUI Interface**
  - Library view with search and filters
  - Full-screen now playing view
  - Playlists view with management
  - Settings view with library stats
  - Queue management
  - Context menus for quick actions

## File Structure

```
RedShiftMobile/
├── App/
│   └── RedShiftMobileApp.swift       # Main app entry point
├── Models/
│   ├── Track.swift                   # Track data model
│   └── Playlist.swift                # Playlist data model
├── Services/
│   ├── AudioPlayerService.swift      # Audio playback engine
│   ├── MusicLibraryManager.swift     # Library scanning & management
│   └── DatabaseService.swift         # SQLite database operations
└── Views/
    ├── ContentView.swift             # Tab navigation
    ├── LibraryView.swift             # Music library browser
    ├── NowPlayingView.swift          # Full-screen player
    ├── PlaylistsView.swift           # Playlist management
    └── SettingsView.swift            # App settings
```

## Data Storage

### Documents Directory Structure
```
/Documents/
├── Music/                            # Audio files (accessible via iTunes File Sharing)
│   ├── Artist - Song.mp3
│   ├── Artist - Song2.m4a
│   └── ...
└── Database/
    └── library.db                    # SQLite database
```

### Database Schema

**tracks table:**
- `id` (UUID) - Primary key
- `file_path` - Full path to audio file
- `file_name` - File name
- `title`, `artist`, `album`, `album_artist`, `year`, `track_number`, `genre` - Metadata
- `duration` - Track length in seconds
- `play_count` - Number of times played
- `last_played` - Last play timestamp
- `is_favorite` - Boolean favorite flag
- `rating` - 0-5 star rating
- `file_size` - File size in bytes
- `added_date`, `modified_date` - Timestamps

**playlists table:**
- `id` (UUID) - Primary key
- `name` - Playlist name
- `track_ids` - JSON array of track UUIDs
- `created_date`, `modified_date` - Timestamps
- `is_favorite` - Boolean favorite flag

## Sync with RedShift Desktop

The app uses **iTunes File Sharing** (`UIFileSharingEnabled`) to expose the `/Documents/` directory:

1. **Desktop can access files via AFC:**
   - List all files in `/Documents/Music/`
   - Read `library.db` to sync metadata
   - Upload new music files
   - Download files from device

2. **Bi-directional sync strategy:**
   - Desktop scans device `/Documents/Music/` folder
   - Reads `library.db` to get play counts, favorites, ratings
   - Uploads missing files from desktop library
   - Updates desktop database with device metadata
   - Writes updated `library.db` back to device

## Building & Running

### Requirements
- macOS with Xcode 15+
- iOS 17+ deployment target
- Physical device or simulator

### Next Steps (To Complete)
1. Create `Info.plist` with `UIFileSharingEnabled`
2. Generate Xcode project file (`.xcodeproj`)
3. Test on simulator
4. Test on physical device
5. Configure code signing
6. TestFlight distribution

## Desktop Integration (TODO)

Update RedShift Desktop's `DopplerSyncService.js` to:
1. Detect RedShift Mobile via AFC
2. Scan `/Documents/Music/` for music files
3. Read `/Documents/Database/library.db` for metadata
4. Upload missing files
5. Sync bidirectional metadata (play counts, favorites, ratings)

## License

MIT License - Open Source
