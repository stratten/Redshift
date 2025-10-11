# RedShift Mobile - Build Commands Reference

## Prerequisites
- Apple Developer Account (paid membership required for TestFlight)
- Development Team: `D4X8TSBQJC` (Baobab Group LLC)
- Bundle ID: `com.redshiftplayer.mobile`
- Certificates and provisioning profiles installed

## iOS Simulator Build/Install/Seed

```bash
# 1. Boot simulator
xcrun simctl boot "iPhone 16" || true

# 2. Build for simulator
xcodebuild -project RedShiftMobile.xcodeproj \
  -scheme RedShiftMobile \
  -configuration Debug \
  -sdk iphonesimulator \
  -derivedDataPath ./build

# 3. Install on simulator
APP_PATH=$(find ./build/Build/Products/Debug-iphonesimulator -name "RedShiftMobile.app" | head -1)
xcrun simctl install booted "$APP_PATH"

# 4. Launch app
xcrun simctl launch booted com.redshiftplayer.mobile

# 5. Seed with music (from desktop app)
# - Use desktop app's Doppler Sync
# - Select "Simulator (iOS Simulator)" as transfer method
# - Start sync
```

## TestFlight Archive/Export/Upload

```bash
# 1. Clean and archive for iOS devices
cd /Users/strattenwaldt/Desktop/Projects/Personal\ Projects/RedShiftMobile

xcodebuild clean archive \
  -project RedShiftMobile.xcodeproj \
  -scheme RedShiftMobile \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath ~/Desktop/RedShiftMobile.xcarchive \
  -allowProvisioningUpdates

# 2. Export for App Store Connect
xcodebuild -exportArchive \
  -archivePath ~/Desktop/RedShiftMobile.xcarchive \
  -exportPath ~/Desktop/RedShiftMobile_Export \
  -exportOptionsPlist ExportOptions.plist \
  -allowProvisioningUpdates

# 3. Upload to TestFlight
# OPTION A: Use Transporter app (easiest)
open -a Transporter ~/Desktop/RedShiftMobile_Export/RedShiftMobile.ipa

# OPTION B: Command line (requires App Store Connect API key)
# First create API key at: https://appstoreconnect.apple.com/access/api
# Then run:
# xcrun altool --upload-app --type ios \
#   --file ~/Desktop/RedShiftMobile_Export/RedShiftMobile.ipa \
#   --apiKey YOUR_KEY_ID \
#   --apiIssuer YOUR_ISSUER_ID
```

## Desktop App Development

```bash
cd /Users/strattenwaldt/Desktop/Projects/Personal\ Projects/RedShift

# Install dependencies (if needed)
npm install

# Run in development mode
npm run dev
```

## Quick Reference

### Simulator Device Management
```bash
# List available simulators
xcrun simctl list devices

# Boot a specific simulator
xcrun simctl boot "iPhone 16"

# Get app container path (for manual file access)
xcrun simctl get_app_container booted com.redshiftplayer.mobile data
```

### View Simulator Logs
```bash
# Stream logs from RedShift Mobile
xcrun simctl spawn booted log stream --predicate 'process == "RedShiftMobile"' --level debug
```

### Clean Build Artifacts
```bash
# Clean Xcode build folder
rm -rf ~/Library/Developer/Xcode/DerivedData/RedShiftMobile-*

# Clean local build folder
rm -rf build/

# Clean archives
rm -rf ~/Desktop/RedShiftMobile.xcarchive
rm -rf ~/Desktop/RedShiftMobile_Export
```

## Certificate & Provisioning Profile Info

**Team ID:** D4X8TSBQJC (Baobab Group LLC)

**Certificates:**
- Apple Development: stratten@baobabpartners.com (for local dev)
- Apple Distribution: Baobab Group LLC (for TestFlight/App Store)

**Provisioning Profiles:**
- Development: RedShift Mobile Development (for physical device testing)
- App Store: RedShift Mobile App Store (for TestFlight/App Store)

**Bundle ID:** com.redshiftplayer.mobile

## Troubleshooting

### "No profiles found"
- Ensure certificates are installed: `security find-identity -v -p codesigning`
- Re-download provisioning profiles from developer.apple.com
- Double-click .mobileprovision files to install

### Archive fails with device registration error
- Use `-destination "generic/platform=iOS"` for App Store builds
- Don't use a specific device for archiving

### Upload fails
- Use Transporter app instead of command line
- Ensure you're signed into the correct Apple ID
- Check App Store Connect for any pending agreements

## Post-Upload

After uploading to TestFlight:
1. Go to https://appstoreconnect.apple.com
2. Select "RedShift Mobile"
3. Go to "TestFlight" tab
4. Wait for processing (can take 5-30 minutes)
5. Add test information and submit for review
6. Add internal/external testers
7. Distribute build to testers

