# Redshift 

Desktop application for syncing music libraries between Mac and iPhone Doppler apps without manual file selection.

## Overview

RedShift eliminates the pain of manually syncing music between your Mac and iPhone Doppler apps. It automatically detects new or modified files in your master library, prevents duplicates through SHA-256 hashing, and offers multiple transfer methods including direct iPhone filesystem access.

## Features

- **🎯 One-Click Sync**: Plug in iPhone → Scan → Sync with a single button press
- **🚀 Direct Transfer**: Bypass Doppler Transfer app entirely with direct filesystem access
- **🔍 Smart Detection**: Automatically finds new and modified files using file system monitoring
- **🛡️ Duplicate Prevention**: SHA-256 hashing ensures no duplicate transfers
- **📊 Transfer History**: Complete logging of all sync sessions with timestamps
- **📱 Multiple Methods**: libimobiledevice, pymobiledevice3, iTunes protocol, or Files app
- **⚡ Real-time Monitoring**: Detects new music as you add it to your library

## Requirements

- macOS 10.14 or later
- Doppler app installed on both Mac and iPhone
- USB cable for iPhone connection
- Node.js 16 or later

## Installation

### Prerequisites

Install required system dependencies:

```bash
# Install libimobiledevice (for direct transfer)
brew install libimobiledevice ifuse

# Or install pymobiledevice3 (alternative method)
pip3 install pymobiledevice3
```

### App Installation

```bash
# Clone the repository
git clone https://github.com/your-username/doppler-sync-manager.git
cd doppler-sync-manager

# Install dependencies
npm install

# Run in development mode
npm run dev

# Or build for production
npm run build
```

## Setup

1. **Configure Master Library**: Set your music library path (default: `~/Music/DopplerMaster`)
2. **Trust Your Mac**: Connect iPhone and tap "Trust" when prompted
3. **Choose Transfer Method**: Select your preferred sync method in Settings
4. **Start Syncing**: Click "Scan Library" then "Start Sync"

## Usage

### Basic Workflow

1. **Add music** to your master library folder on Mac
2. **Connect iPhone** via USB
3. **Click "Scan Library"** to detect changes
4. **Review files** to be synced in the dashboard
5. **Click "Start Sync"** and choose transfer method
6. **Monitor progress** in real-time

### Transfer Methods

- **Direct Transfer (libimobiledevice)** - Fastest, requires brew install
- **Direct Transfer (pymobiledevice3)** - Modern Python approach, iOS 17+ optimized  
- **iTunes File Sharing Protocol** - Uses same protocol as iTunes
- **iOS Files App** - Manual import fallback method

## Directory Structure

```
doppler-sync-manager/
├── package.json              # Project configuration
├── src/
│   ├── main/
│   │   ├── main.js           # Electron main process
│   │   └── preload.js        # IPC security bridge
│   └── renderer/
│       ├── index.html        # Main UI
│       ├── renderer.js       # Frontend logic
│       └── styles/
│           └── main.css      # Application styles
├── build/                    # Build assets
└── docs/                     # Documentation
```

## Development

```bash
# Development with hot reload
npm run dev

# Build for distribution
npm run build

# Package for macOS
npm run pack
```

## Architecture

- **Electron Main Process**: Handles file system operations, database, USB monitoring
- **SQLite Database**: Tracks transferred files and sync history
- **File System Watcher**: Real-time detection of library changes
- **USB Monitor**: Automatic iPhone detection
- **Transfer Engines**: Multiple methods for iPhone file transfer

## Troubleshooting

### iPhone Not Detected
- Ensure iPhone is unlocked and trusted
- Try different USB cable/port
- Check USB permissions in macOS Security & Privacy

### Transfer Failed
- Verify Doppler app is installed on iPhone
- Check that transfer dependencies are installed (`brew list libimobiledevice`)
- Try alternative transfer method in modal

### Library Not Scanning
- Check library path permissions
- Ensure path contains audio files (.mp3, .m4a, .flac, etc.)
- Restart file system watcher in Settings

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [libimobiledevice](https://libimobiledevice.org/) - iOS communication library
- [pymobiledevice3](https://github.com/doronz88/pymobiledevice3) - Modern Python iOS tools
- [Doppler](https://brushedtype.co/doppler/) - Excellent music player that inspired this tool

## Support

- 📖 [Documentation](docs/)
- 🐛 [Report Bug](https://github.com/your-username/doppler-sync-manager/issues)
- 💡 [Request Feature](https://github.com/your-username/doppler-sync-manager/issues)

RedShift/
├── package.json
├── README.md
├── .gitignore
├── src/
│   ├── main/
│   │   ├── main.js
│   │   └── preload.js
│   └── renderer/
│       ├── index.html
│       ├── renderer.js
│       └── styles/
│           └── main.css
└── reference/
    └── sync_script.py