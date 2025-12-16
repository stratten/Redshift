# Redshift Desktop

Music library manager for macOS that actually lets you manage your local music collection.

## Overview

Redshift is a full-featured music player and library manager that treats your local music collection with the respect it deserves. Built because Apple Music is garbage and the alternatives either don't work or charge monthly subscriptions for features iTunes had 20 years ago.

Plays music. Manages your library. Syncs to iPhone. Pulls music from iPhone to desktop. No cloud dependency. No subscriptions. Free and open-source.

## Features

- Full music player (MP3, WAV, FLAC support)
- Library management with metadata editing
- Automatic album art and artist image retrieval from MusicBrainz/Cover Art Archive
- Playlist management with queue control
- Bi-directional sync to iPhone via USB or Wi-Fi
- Scans and imports music FROM your iPhone's library TO desktop
- Bi-directional playlist sync
- Bi-directional play count/favorites/ratings sync
- Real-time library monitoring
- SQLite-based library database with sync history

## Requirements

- macOS 10.14 or later
- ~200MB disk space
- USB cable or Wi-Fi network for iPhone sync (optional)
- Doppler mobile app on iPhone (or RedShift mobile when released)

## Installation

Download the latest DMG from [Releases](https://github.com/stratten/Redshift_Desktop/releases), drag to Applications folder, and open.

### For Developers

```bash
# Clone the repository
git clone https://github.com/stratten/Redshift_Desktop.git
cd Redshift_Desktop

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build
```

### Optional: USB Sync Dependencies

USB sync requires libimobiledevice. Wi-Fi sync works without it.

```bash
brew install libimobiledevice ifuse
```

## Setup

1. Open Redshift
2. Point it at your music folder (Settings tab)
3. It scans and builds your library
4. Start playing music

For iPhone sync:
1. Connect iPhone via USB or Wi-Fi
2. Trust your Mac when prompted on iPhone
3. Go to USB Sync tab
4. Scan device, then sync

## Usage

### Playing Music

Standard music player. Library view, albums view, artists view, playlists. Search works. Queue management. Metadata editing.

### Syncing to iPhone

**Push music TO iPhone:**
1. USB Sync or Doppler Sync tab
2. Connect iPhone (USB or Wi-Fi)
3. Click "Sync"
4. It transfers files not already on device

**Pull music FROM iPhone:**
1. USB Sync tab
2. Connect iPhone via USB
3. Click "Import from Device"
4. It scans iPhone's music library and imports files you don't have

### Sync Methods

- **USB via libimobiledevice** - Most reliable, requires brew install
- **Wi-Fi via WebSocket** - Pairs with QR code, no cables
- **Doppler sync** - Works with Doppler mobile app (can't detect duplicates due to iOS sandboxing)

## Architecture

Built with Electron. Cross-platform without maintaining three native codebases.

**Main process:**
- File system watching (chokidar)
- SQLite database (library state, sync history, playlists, play counts)
- Audio playback service
- USB device monitoring
- iPhone sync services (libimobiledevice, pymobiledevice3, WebSocket)
- MusicBrainz integration for automatic artist images and album artwork

**Renderer:**
- Vanilla JavaScript with custom component system
- No React/Vue - doesn't need the overhead
- UI bundle under 200KB

**Sync architecture:**
- USB sync via libimobiledevice (direct filesystem access)
- Wi-Fi sync via WebSocket (QR code pairing)
- AFC (Apple File Conduit) for device music library access
- Pre-indexing with metadata matching (artist + title + album)
- SHA-256 hashing for duplicate detection

**Database:**
- Tracks, playlists, sync history, play counts
- Bi-directional sync merges data from both sides

## Development

```bash
# Run in development
npm run dev

# Build DMG for distribution
npm run build

# The build process handles code signing and notarization
# See build/ directory for signing setup
```

## Known Issues

**iPhone sync:**
- libimobiledevice can break with iOS updates (reverse-engineered protocol)
- USB sync more reliable than Wi-Fi
- Doppler mobile sync can't detect duplicates (iOS sandboxing blocks access to Doppler's app folder)

**General:**
- No Windows/Linux builds yet (code should work, just haven't packaged them)
- No smart playlists
- Large file size (~66MB) due to bundled Python and dependencies

## Troubleshooting

**iPhone not detected:**
- Unlock iPhone and tap "Trust" when prompted
- Try different USB cable/port
- Install libimobiledevice: `brew install libimobiledevice ifuse`

**Sync fails:**
- Make sure Doppler (or RedShift mobile) is installed on iPhone
- Try Wi-Fi sync if USB fails
- Check Settings tab for sync method options

**Library not loading:**
- Check that library path points to folder with music files
- Supported formats: MP3, WAV, FLAC, M4A
- Check console for error messages

## Contributing

Fork it, fix it, send a PR. Code is MIT licensed.

## Acknowledgments

- [libimobiledevice](https://libimobiledevice.org/) - iOS communication
- [pymobiledevice3](https://github.com/doronz88/pymobiledevice3) - Modern iOS tools
- [MusicBrainz](https://musicbrainz.org/) - Free metadata and artist image API
- [Cover Art Archive](https://coverartarchive.org/) - Free album artwork API
- [Doppler](https://brushedtype.co/doppler/) - The mobile app that doesn't sync properly, which is why this exists

---

App #1 of 27 by 2027.
