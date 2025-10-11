# RedShift Mobile - Build Instructions

## Prerequisites

- macOS 14.0+ with Xcode 15.0+
- iOS 17.0+ deployment target
- Apple Developer account (for device testing)

## Building the App

### Option 1: Command Line (Xcode CLI)

```bash
# Navigate to project directory
cd /Users/strattenwaldt/Desktop/Projects/Personal\ Projects/RedShiftMobile

# Build for simulator
xcodebuild -project RedShiftMobile.xcodeproj \
           -scheme RedShiftMobile \
           -sdk iphonesimulator \
           -configuration Debug \
           build

# Run on simulator
xcrun simctl boot "iPhone 15 Pro"  # Boot simulator
xcrun simctl install booted /path/to/RedShiftMobile.app
xcrun simctl launch booted com.redshift.mobile

# Build for device (requires code signing)
xcodebuild -project RedShiftMobile.xcodeproj \
           -scheme RedShiftMobile \
           -sdk iphoneos \
           -configuration Release \
           -archivePath build/RedShiftMobile.xcarchive \
           archive
```

### Option 2: Xcode GUI (If Needed)

```bash
# Open project in Xcode
open RedShiftMobile.xcodeproj
```

Then:
1. Select target device/simulator from toolbar
2. Press ⌘R to build and run
3. For device: Set development team in Signing & Capabilities

### Option 3: Quick Simulator Test

```bash
# Build and run in one command
xcodebuild -project RedShiftMobile.xcodeproj \
           -scheme RedShiftMobile \
           -destination 'platform=iOS Simulator,name=iPhone 15 Pro' \
           -configuration Debug \
           run
```

## Code Signing (Required for Device)

### Automatic Signing
1. Open `RedShiftMobile.xcodeproj` in Xcode
2. Select project in navigator
3. Select "RedShiftMobile" target
4. Go to "Signing & Capabilities" tab
5. Set "Team" to your Apple Developer account
6. Xcode will automatically create/update provisioning profiles

### Manual Signing (Advanced)
Edit `project.pbxproj` and set:
```
DEVELOPMENT_TEAM = YOUR_TEAM_ID;
CODE_SIGN_IDENTITY = "Apple Development";
```

## Testing

### Simulator Testing
```bash
# List available simulators
xcrun simctl list devices

# Boot a specific simulator
xcrun simctl boot "iPhone 15 Pro"

# Install app
xcrun simctl install booted /path/to/build/Debug-iphonesimulator/RedShiftMobile.app

# Launch app
xcrun simctl launch booted com.redshift.mobile

# View logs
xcrun simctl spawn booted log stream --predicate 'processImagePath contains "RedShiftMobile"'
```

### Device Testing
1. Connect iPhone/iPad via USB
2. Trust computer on device
3. Build with your developer certificate
4. App appears on device home screen
5. Trust developer certificate in Settings → General → VPN & Device Management

## Adding Music Files

### Via Finder (macOS Catalina+)
1. Connect device to Mac
2. Open Finder
3. Select device in sidebar
4. Click "Files" tab
5. Find "RedShift" app
6. Drag music files into "Music" folder

### Via Files App (iOS)
1. Open Files app on iPhone
2. Navigate to "On My iPhone" → "RedShift"
3. Create "Music" folder if not exists
4. Copy/paste music files from iCloud Drive, etc.

### Via RedShift Desktop (Automated - Coming Soon)
Desktop app will automatically sync files via AFC protocol

## Troubleshooting

### "No such module" errors
- Clean build folder: `xcodebuild clean`
- Delete `DerivedData`: `rm -rf ~/Library/Developer/Xcode/DerivedData`

### Code signing issues
- Ensure you have an active Apple Developer account
- Check provisioning profiles in Xcode preferences
- Set correct development team in project settings

### App crashes on launch
- Check console logs: `xcrun simctl spawn booted log stream`
- Verify all Swift files are included in target
- Check Info.plist is valid XML

### iTunes File Sharing not visible
- Verify `UIFileSharingEnabled = YES` in Info.plist
- Rebuild and reinstall app
- Disconnect and reconnect device

## Distribution

### TestFlight (Recommended)
```bash
# Archive for distribution
xcodebuild -project RedShiftMobile.xcodeproj \
           -scheme RedShiftMobile \
           -sdk iphoneos \
           -configuration Release \
           -archivePath build/RedShiftMobile.xcarchive \
           archive

# Export IPA
xcodebuild -exportArchive \
           -archivePath build/RedShiftMobile.xcarchive \
           -exportPath build/Release \
           -exportOptionsPlist ExportOptions.plist

# Upload to TestFlight (requires App Store Connect account)
xcrun altool --upload-app \
             --type ios \
             --file build/Release/RedShiftMobile.ipa \
             --username YOUR_APPLE_ID \
             --password YOUR_APP_SPECIFIC_PASSWORD
```

### Ad-Hoc Distribution
1. Create distribution provisioning profile
2. Archive app
3. Export as Ad-Hoc
4. Share .ipa file
5. Install via Xcode Devices window

## File Structure After Build

```
RedShiftMobile.app/
├── RedShiftMobile              # Executable
├── Info.plist                  # Bundle info
├── PkgInfo                     # Package info
├── embedded.mobileprovision    # Provisioning (device only)
├── _CodeSignature/             # Code signature
└── Frameworks/                 # Embedded frameworks (if any)
```

## Next Steps

1. ✅ Build succeeds in simulator
2. ✅ Build succeeds on device
3. ✅ Test music playback
4. ✅ Test iTunes File Sharing
5. ✅ Test desktop sync (once implemented)
6. 🚀 Submit to TestFlight
7. 🚀 Submit to App Store

## Support

For issues, check:
- Xcode build logs
- Device console logs
- `README.md` for architecture details
- `REDSHIFT_MOBILE_PLAN.md` for feature roadmap
