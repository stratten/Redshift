# Bundled Python Setup for iOS Device Communication

This app uses a **relocatable Python runtime** bundled with the application to ensure consistent iOS device communication without requiring users to install Python or system-level dependencies.

## Why Bundled Python?

1. **No external dependencies** - Works out of the box, no Python installation required
2. **Code signing ready** - All dependencies are bundled and can be signed with your app
3. **Consistent behavior** - Same Python version across all user machines
4. **App Store ready** - No reliance on system Python or Homebrew

## Development Setup

### First Time Setup

Run the setup script to download and configure the bundled Python runtime:

```bash
./scripts/setup-python.sh
```

This will:
1. Download Python 3.11 (relocatable build for macOS ARM64)
2. Extract it to `resources/python/`
3. Install `pymobiledevice3` and all dependencies to `resources/python-deps/`

### What Gets Created

```
resources/
├── python/              # Relocatable Python 3.11 runtime
│   └── python/
│       ├── bin/
│       │   └── python3  # Python executable
│       └── lib/         # Python standard library
└── python-deps/         # pymobiledevice3 + dependencies
    ├── pymobiledevice3/
    ├── cryptography/
    └── ... (all Python packages)
```

**Note:** These directories are in `.gitignore` because they contain large binaries. Each developer needs to run the setup script once.

## How It Works

### PythonBridge Service

The `src/main/services/PythonBridge.js` module handles finding and using the bundled Python:

```javascript
const pythonBridge = require('./PythonBridge');

// Get command to run pymobiledevice3
const cmd = pythonBridge.getPymobiledevice3Command('afc ls /Documents');
// Returns: "resources/python/python/bin/python3 resources/python-deps/bin/pymobiledevice3 afc ls /Documents"
```

### Development vs Production

- **Development (not packaged):** Uses `resources/python/` from project root
- **Production (packaged app):** Uses bundled Python from `app.asar.unpacked/resources/`

## Distribution / Packaging

When building your app for distribution:

### 1. Include Resources in Build

Update your Electron builder config to include Python in the bundle:

```json
{
  "build": {
    "extraResources": [
      {
        "from": "resources/python",
        "to": "python"
      },
      {
        "from": "resources/python-deps",
        "to": "python-deps"
      }
    ]
  }
}
```

### 2. Code Signing

The bundled Python runtime can be signed along with your app:

```bash
codesign --deep --force --verify --verbose --sign "Developer ID Application: Your Name" YourApp.app
```

### 3. Multi-Platform Support

For cross-platform distribution, download Python builds for each platform:

- **macOS ARM64:** `cpython-3.11.10+20241016-aarch64-apple-darwin-install_only.tar.gz`
- **macOS x86_64:** `cpython-3.11.10+20241016-x86_64-apple-darwin-install_only.tar.gz`
- **Windows:** `cpython-3.11.10+20241016-x86_64-pc-windows-msvc-shared-install_only.tar.gz`
- **Linux:** `cpython-3.11.10+20241016-x86_64-unknown-linux-gnu-install_only.tar.gz`

Source: [python-build-standalone releases](https://github.com/indygreg/python-build-standalone/releases)

## Troubleshooting

### "Bundled Python not found" message

Run the setup script:
```bash
./scripts/setup-python.sh
```

### Permission errors

Make sure the Python executable is executable:
```bash
chmod +x resources/python/python/bin/python3
```

### Device not detected

Ensure your iPhone is:
1. Connected via USB
2. Unlocked
3. Trusted (you approved the "Trust This Computer?" dialog)
4. Has the Doppler app installed with music files

## Alternative: System Installation (Development Only)

If you prefer to use system-installed tools during development:

```bash
# Install via pipx (recommended for development)
pipx install pymobiledevice3

# The app will automatically fall back to system installation
# if bundled Python is not found
```

**Note:** System installations won't work in a distributed/packaged app!
