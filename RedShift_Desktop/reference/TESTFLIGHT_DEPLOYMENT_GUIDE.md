# Complete TestFlight Deployment Guide

**Project:** iOS App Distribution via TestFlight  
**Created:** October 11, 2025  
**Purpose:** Comprehensive reference for deploying iOS applications to TestFlight  
**Status:** ✅ Production-ready guide based on real deployment experience

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Apple Developer Account Setup](#apple-developer-account-setup)
3. [Certificates and Identifiers](#certificates-and-identifiers)
4. [Xcode Project Configuration](#xcode-project-configuration)
5. [App Store Connect Setup](#app-store-connect-setup)
6. [Building and Archiving](#building-and-archiving)
7. [Uploading to TestFlight](#uploading-to-testflight)
8. [TestFlight Configuration](#testflight-configuration)
9. [Troubleshooting Common Issues](#troubleshooting-common-issues)
10. [Command-Line Reference](#command-line-reference)

---

## Prerequisites

### Required Hardware & Software

- **Mac Computer** (Intel or Apple Silicon)
- **Xcode** (latest stable version recommended)
  - Install from Mac App Store or Apple Developer portal
  - Current version as of this guide: Xcode 15+
- **Active Apple Developer Account** ($99/year)
  - Individual or Organization account
  - Two-factor authentication (2FA) enabled
- **iOS Device** (for physical device testing, optional for TestFlight)
  - iPhone or iPad running recent iOS version
  - UDID available for device registration

### Knowledge Requirements

- Basic understanding of Xcode and iOS development
- Familiarity with terminal/command line (for troubleshooting)
- Understanding of code signing concepts

---

## Apple Developer Account Setup

### Step 1: Enroll in Apple Developer Program

**Status:** ✅ One-time setup (annual renewal required)

1. **Visit Enrollment Page**
   - Go to: https://developer.apple.com/programs/enroll/
   - Sign in with your Apple ID

2. **Choose Account Type**
   - **Individual**: Personal apps, uses your name
   - **Organization**: Company apps, requires legal entity verification
     - D-U-N-S Number required
     - Legal authority to bind organization
     - Official company website

3. **Complete Enrollment**
   - Provide personal/organization information
   - Agree to Apple Developer Program License Agreement
   - Pay $99 USD annual fee
   - Wait for approval (usually instant for individuals, 1-2 days for organizations)

4. **Verify Two-Factor Authentication**
   - Go to https://appleid.apple.com
   - Ensure 2FA is enabled on your Apple ID
   - Required for App Store Connect access

**⚠️ Common Issues:**
- Payment issues: Use a credit card rather than debit card
- Organization enrollment delays: Ensure D-U-N-S number matches exactly
- 2FA problems: Use a trusted device or phone number

### Step 2: Identify Your Team ID

**Status:** ✅ Required for project configuration

Your Team ID is a 10-character alphanumeric string (e.g., `D4X8TSBQJC`)

**How to Find Your Team ID:**

1. **Method 1: Apple Developer Portal**
   - Go to: https://developer.apple.com/account
   - Sign in
   - Navigate to "Membership"
   - Look for "Team ID" field

2. **Method 2: Xcode**
   - Open Xcode → Preferences → Accounts
   - Select your Apple ID
   - Click on your team name
   - Team ID displayed in the details panel

3. **Method 3: Terminal**
   ```bash
   security find-identity -v -p codesigning | grep "Apple Development\|Apple Distribution"
   ```
   Team ID is in the certificate subject name

**📝 Note:** Different teams may have different Team IDs:
- Personal Developer Account: One Team ID
- Organization Account: One Team ID per organization
- Multiple teams: You may have access to multiple Team IDs

---

## Certificates and Identifiers

### Step 3: Register App ID (Bundle Identifier)

**Status:** ✅ One-time per app

1. **Access Apple Developer Portal**
   - Go to: https://developer.apple.com/account
   - Navigate to: **Certificates, Identifiers & Profiles**

2. **Create New Identifier**
   - Click: **Identifiers** → **+** button
   - Select: **App IDs**
   - Click: **Continue**

3. **Configure App ID**
   - **Description**: Descriptive name (e.g., "RedShift Mobile")
   - **Bundle ID**: Choose **Explicit** Bundle ID
     - Format: `com.yourcompany.appname` (reverse DNS notation)
     - Example: `com.redshiftplayer.mobile`
     - **Must be globally unique** across all iOS apps
     - **Cannot be changed** after registration
   
4. **Select Capabilities**
   - Check required capabilities:
     - Background Modes (for audio playback)
     - Push Notifications (if needed)
     - File Sharing (if needed)
     - iCloud (if needed)
   - Click: **Continue** → **Register**

**⚠️ Common Issues:**
- "Bundle ID not available": Already taken by another developer
  - Solution: Try a different bundle ID (e.g., add unique suffix)
- Capabilities missing after creation: Can be edited in Xcode or portal

**✅ Verification:**
```bash
# Bundle ID should now appear in:
# Developer Portal → Identifiers → App IDs
```

### Step 4: Create Distribution Certificate

**Status:** ✅ Required for App Store/TestFlight builds

**What is it?** A Distribution Certificate proves your identity to Apple and allows you to sign apps for distribution.

#### Step 4.1: Generate Certificate Signing Request (CSR)

1. **Open Keychain Access** (macOS application)
   - Location: `/Applications/Utilities/Keychain Access.app`

2. **Request Certificate**
   - Menu: **Keychain Access** → **Certificate Assistant** → **Request a Certificate from a Certificate Authority**

3. **Fill CSR Information**
   - **User Email Address**: Your Apple ID email
   - **Common Name**: Your name or organization name
   - **CA Email Address**: Leave blank
   - **Request is**: Select **"Saved to disk"**
   - Click: **Continue**

4. **Save CSR File**
   - Save as: `CertificateSigningRequest.certSigningRequest`
   - Location: Desktop or Downloads folder
   - Click: **Save**

**📝 Note:** The CSR creates a public/private key pair in your Keychain. The private key stays on your Mac; the public key is sent to Apple.

#### Step 4.2: Create Apple Distribution Certificate

1. **Access Developer Portal**
   - Go to: **Certificates, Identifiers & Profiles** → **Certificates**
   - Click: **+** button

2. **Select Certificate Type**
   - Choose: **Apple Distribution** (for App Store and TestFlight)
   - Click: **Continue**

3. **Upload CSR**
   - Click: **Choose File**
   - Select the CSR file you created
   - Click: **Continue**

4. **Download Certificate**
   - Click: **Download**
   - File name: `distribution.cer`
   - Save to: Downloads folder

5. **Install Certificate**
   - **Double-click** `distribution.cer`
   - Keychain Access will open
   - Certificate will be installed in "login" keychain
   - Verify: Look for "Apple Distribution: [Your Name/Org]" in "My Certificates"

**✅ Verification:**
```bash
# List all code signing identities:
security find-identity -v -p codesigning

# You should see:
# 1) XXXX... "Apple Distribution: Your Name (TEAMID)"
```

**⚠️ Common Issues:**
- "Certificate is not trusted": Install Apple WWDR Intermediate Certificate
  - Download from: https://www.apple.com/certificateauthority/
  - Install: Double-click to add to Keychain
- Private key missing: CSR must be created on the same Mac
  - Solution: Generate new CSR and certificate on the current Mac

### Step 4.3: Create Development Certificate (Optional but Recommended)

**Purpose:** For testing on physical devices before TestFlight

Follow the same steps as Distribution Certificate, but:
- Select: **Apple Development** instead of "Apple Distribution"
- Used for: Development builds, physical device testing

**✅ Both certificates installed:**
```bash
security find-identity -v -p codesigning
# Should show:
# 1) ... "Apple Development: email@example.com (XXXXX)"
# 2) ... "Apple Distribution: Your Org (TEAMID)"
```

### Step 5: Create Provisioning Profiles

**Status:** ✅ Required for building/distributing apps

**What is it?** A Provisioning Profile links your App ID, certificates, and (for development) devices together.

#### Step 5.1: Create App Store Provisioning Profile

**Purpose:** For TestFlight and App Store distribution

1. **Access Developer Portal**
   - Go to: **Certificates, Identifiers & Profiles** → **Profiles**
   - Click: **+** button

2. **Select Profile Type**
   - Choose: **App Store** (under Distribution section)
   - Click: **Continue**

3. **Select App ID**
   - Choose: Your app's Bundle ID (e.g., `com.redshiftplayer.mobile`)
   - Click: **Continue**

4. **Select Certificate**
   - Check: Your **Apple Distribution** certificate
   - Click: **Continue**

5. **Name Profile**
   - Provisioning Profile Name: `[App Name] App Store`
     - Example: `RedShift Mobile App Store`
   - Click: **Generate**

6. **Download Profile**
   - Click: **Download**
   - File name: `YourApp_App_Store.mobileprovision`
   - Save to: Downloads folder

7. **Install Profile**
   - **Double-click** the `.mobileprovision` file
   - Profile will be automatically installed in Xcode
   - Or manually: `~/Library/MobileDevice/Provisioning Profiles/`

**✅ Verification:**
- Xcode → Settings → Accounts → [Your Apple ID] → Manage Certificates
- Should see your provisioning profiles listed

#### Step 5.2: Create Development Provisioning Profile (Optional)

**Purpose:** For testing on physical devices

**⚠️ Important:** Development profiles require device UDID registration

**Steps:**

1. **Register Device UDID First**
   - Connect iPhone/iPad via USB
   - Method 1: **Finder** (macOS Catalina+)
     - Open Finder → Select your device
     - Click on device name to reveal UDID
     - Copy UDID (Format: `00008030-001A2468...`)
   
   - Method 2: **Xcode**
     ```bash
     instruments -s devices
     ```
   
   - Method 3: **System Information**
     - About This Mac → System Report → USB
     - Find your iOS device → Serial Number = UDID

2. **Register Device in Portal**
   - Developer Portal → **Devices** → **+** button
   - **Device Name**: e.g., "My iPhone"
   - **Device ID (UDID)**: Paste UDID
   - **Platform**: iOS
   - Click: **Continue** → **Register**

3. **Create Development Profile**
   - Developer Portal → **Profiles** → **+** button
   - Select: **iOS App Development**
   - Choose App ID → Choose **Apple Development** certificate
   - **Select Devices**: Check your registered device(s)
   - Name: `[App Name] Development`
   - Download and double-click to install

**📝 Note:** You can register up to 100 devices per device type per year.

---

## Xcode Project Configuration

### Step 6: Configure Project Settings

**Status:** ✅ Critical for successful builds

#### Step 6.1: Set Bundle Identifier and Team

1. **Open Your Xcode Project**
   - Launch Xcode
   - Open: `YourProject.xcodeproj` or `.xcworkspace`

2. **Select Project Target**
   - Click on project name in Project Navigator (left sidebar)
   - Select your app target under "Targets"

3. **General Tab Configuration**
   - **Bundle Identifier**: Must match registered App ID exactly
     - Example: `com.redshiftplayer.mobile`
   - **Version**: App version displayed to users (e.g., `1.0.0`)
   - **Build**: Internal build number (e.g., `1`)
     - Must increment for each upload to TestFlight

4. **Signing & Capabilities Tab**
   - **Automatically manage signing**: ☑️ Checked (recommended)
   - **Team**: Select your Team ID / Organization
   - **Signing Certificate**: Will auto-select "Apple Development" or "Apple Distribution"
   - **Provisioning Profile**: Will auto-select appropriate profile

**Manual Signing (Alternative):**
- Uncheck "Automatically manage signing"
- **Debug**: Select Development provisioning profile
- **Release**: Select App Store provisioning profile

#### Step 6.2: Update Info.plist (if needed)

Key settings to verify:

```xml
<!-- Bundle Display Name: User-visible app name -->
<key>CFBundleDisplayName</key>
<string>RedShift Mobile</string>

<!-- Bundle Identifier: Must match registered App ID -->
<key>CFBundleIdentifier</key>
<string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>

<!-- Version Numbers -->
<key>CFBundleShortVersionString</key>
<string>1.0.0</string>
<key>CFBundleVersion</key>
<string>1</string>

<!-- Privacy Descriptions (if app uses features) -->
<key>NSMicrophoneUsageDescription</key>
<string>This app needs microphone access to record audio.</string>

<key>NSCameraUsageDescription</key>
<string>This app needs camera access to take photos.</string>

<!-- Background Modes (if needed) -->
<key>UIBackgroundModes</key>
<array>
    <string>audio</string>
    <string>fetch</string>
</array>

<!-- File Sharing (if needed) -->
<key>UIFileSharingEnabled</key>
<true/>
<key>LSSupportsOpeningDocumentsInPlace</key>
<true/>
```

**⚠️ Critical Privacy Keys:**
- Missing privacy descriptions = App Store rejection
- Add descriptions for: Camera, Microphone, Location, Photos, etc.
- Descriptions must explain WHY your app needs the permission

#### Step 6.3: Resolve Signing Issues

**Common Xcode Signing Errors:**

**Error:** "Signing for 'YourApp' requires a development team"
- **Solution:** Set Team in Signing & Capabilities tab
- Verify: Xcode → Settings → Accounts shows your Apple ID

**Error:** "No profiles for 'com.your.bundle' were found"
- **Solution:** 
  1. Check Bundle ID matches registered App ID
  2. Download/install provisioning profile
  3. Xcode → Settings → Accounts → Download Manual Profiles

**Error:** "Bundle identifier cannot be registered to your development team"
- **Solution:** 
  1. Bundle ID already registered to different team
  2. Choose a different Bundle ID
  3. Or remove from other team if you own it

**Error:** "Provisioning profile doesn't include the currently selected device"
- **Solution:** 
  1. Register device UDID in Developer Portal
  2. Regenerate provisioning profile with device included
  3. Or use "Any iOS Device" for App Store builds

**✅ Successful Configuration:**
- No yellow/red warnings in Signing & Capabilities
- Shows: "Xcode Managed Profile" or your profile name
- Status: "Valid signing identity"

---

## App Store Connect Setup

### Step 7: Create App Record in App Store Connect

**Status:** ✅ Required before first upload

**What is it?** App Store Connect is where you manage your app's metadata, builds, TestFlight testing, and App Store presence.

#### Step 7.1: Access App Store Connect

1. **Visit:** https://appstoreconnect.apple.com
2. **Sign in** with your Apple Developer Apple ID
3. **Accept any agreements** if prompted
4. Navigate to: **My Apps**

#### Step 7.2: Create New App

1. **Click:** **+** button → **New App**

2. **App Information:**
   - **Platform:** ☑️ iOS
   - **Name:** Your app's user-visible name
     - Example: "RedShift Mobile"
     - Must be unique in the App Store
     - Can be changed later
   
   - **Primary Language:** English (U.S.) or your primary language
   
   - **Bundle ID:** Select from dropdown
     - Should show: `com.redshiftplayer.mobile` (your registered App ID)
     - ⚠️ If not showing: App ID not registered or not visible to this team
   
   - **SKU:** Unique identifier for your app (internal only)
     - Example: `redshiftmobile` or `com.redshiftplayer.mobile`
     - Not visible to users
     - Cannot be changed after creation
   
   - **User Access:** Full Access (recommended for solo dev)

3. **Click:** **Create**

**⚠️ Common Issues:**

**Problem:** "Bundle ID not in dropdown"
- **Cause:** App ID not registered, or different Apple ID
- **Solution:** 
  1. Verify App ID exists in Developer Portal
  2. Ensure signed into App Store Connect with same Apple ID
  3. Wait 5-10 minutes for synchronization
  4. Refresh page

**Problem:** "App name already taken"
- **Cause:** Name used by another app (even if unpublished)
- **Solution:** Try slight variation: "RedShift Mobile Music Player"

#### Step 7.3: Basic App Information

After creation, you'll see your app's page. Fill in basic information:

**App Information Section:**

1. **Subtitle** (optional, max 30 characters)
   - Short tagline for your app
   - Example: "Sync & Play Your Music"

2. **Categories**
   - Primary Category: Music
   - Secondary Category (optional): Entertainment

3. **Content Rights**
   - ☑️ Contains third-party content: Yes/No
   - Add acknowledgements if yes

**Pricing and Availability:**

1. **Price:** 
   - Select: Free or Price Tier
   - For free apps: No in-app purchases = no setup needed

2. **Availability:**
   - **Countries/Regions:** Select All or specific regions
   - **Pre-Order:** Optional

**App Privacy:**

⚠️ **Critical Requirement** (as of iOS 14+)

1. **Get Started** in App Privacy section
2. **Data Types:**
   - Select all data types your app collects
   - Examples: User ID, Email, Audio Data, Usage Data
   - For each type:
     - Used for Tracking: Yes/No
     - Linked to User: Yes/No
     - Used for Tracking: Yes/No

3. **Privacy Policy URL:**
   - **Required** if you collect any data
   - Must be publicly accessible URL
   - Example: `https://yourwebsite.com/privacy`

**📝 Note:** Privacy questionnaire must be completed before submitting for review.

---

## Building and Archiving

### Step 8: Prepare for Archive

**Status:** ✅ Ready to build

#### Step 8.1: Clean Build Folder

**Why?** Ensures no stale artifacts interfere with build

```bash
# In Xcode:
Product → Clean Build Folder
# Or: Cmd + Shift + K

# Via command line:
cd /path/to/your/project
xcodebuild clean -project YourProject.xcodeproj -scheme YourScheme
```

#### Step 8.2: Select Correct Build Destination

**Critical:** Must build for "Generic iOS Device" for distribution

1. **In Xcode:**
   - Top toolbar → Device dropdown
   - Select: **Any iOS Device (arm64)**
   - Do NOT select: Simulator or specific physical device

**⚠️ Common Mistake:** Building for simulator creates x86 binary, not uploadable to App Store

#### Step 8.3: Set Build Configuration

1. **Edit Scheme:**
   - Product → Scheme → Edit Scheme (or Cmd + <)
   
2. **Archive Settings:**
   - Select: **Archive** in left sidebar
   - **Build Configuration:** Release
   - **Reveal Archive in Organizer:** ☑️ Checked

3. **Run Settings (for testing):**
   - Select: **Run** in left sidebar
   - **Build Configuration:** Debug

### Step 9: Create Archive

**What is an Archive?** A compiled, signed version of your app ready for distribution.

#### Step 9.1: Archive via Xcode GUI

1. **Select Destination:**
   - Top toolbar → **Any iOS Device (arm64)**

2. **Start Archive:**
   - Menu: **Product** → **Archive**
   - Or: **Product** → **Build For** → **Archiving**

3. **Wait for Build:**
   - Progress shown in top toolbar
   - Can take 2-10 minutes depending on project size
   - Xcode may ask for Keychain access (click "Always Allow")

4. **Organizer Opens:**
   - If build succeeds, **Archives** window opens automatically
   - Shows your new archive with:
     - App name and version
     - Date and time created
     - Archive size

**✅ Successful Archive:**
- No errors in build log
- Archive appears in Organizer
- Shows correct version and build number

**❌ Build Failed:**
- Check Issues Navigator (Cmd + 5)
- Common issues:
  - Signing errors
  - Missing frameworks
  - Swift/Objective-C compilation errors
  - See [Troubleshooting](#troubleshooting-common-issues) section

#### Step 9.2: Archive via Command Line

**Advantages:** Scriptable, reproducible, CI/CD-friendly

**Basic Archive Command:**

```bash
cd /path/to/your/project

xcodebuild clean archive \
  -project YourProject.xcodeproj \
  -scheme YourScheme \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath ~/Desktop/YourApp.xcarchive \
  -allowProvisioningUpdates

# For workspace projects:
xcodebuild clean archive \
  -workspace YourProject.xcworkspace \
  -scheme YourScheme \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath ~/Desktop/YourApp.xcarchive \
  -allowProvisioningUpdates
```

**Parameter Explanation:**

- `clean`: Removes previous build artifacts
- `archive`: Creates distributable archive
- `-project` or `-workspace`: Your Xcode project/workspace file
- `-scheme`: Target scheme (usually your app name)
- `-configuration Release`: Use Release build settings
- `-destination "generic/platform=iOS"`: Build for any iOS device
- `-archivePath`: Where to save archive
- `-allowProvisioningUpdates`: Let Xcode manage provisioning

**Advanced Options:**

```bash
# Specify team explicitly:
-allowProvisioningUpdates \
DEVELOPMENT_TEAM=D4X8TSBQJC

# Specify provisioning profile:
PROVISIONING_PROFILE_SPECIFIER="YourApp App Store"

# Specify code signing identity:
CODE_SIGN_IDENTITY="Apple Distribution: Your Org (TEAMID)"

# Manual code signing:
CODE_SIGN_STYLE=Manual
```

**RedShift Mobile Example:**

```bash
cd /Users/strattenwaldt/Desktop/Projects/Personal\ Projects/RedShiftMobile

xcodebuild clean archive \
  -project RedShiftMobile.xcodeproj \
  -scheme RedShiftMobile \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath ~/Desktop/RedShiftMobile.xcarchive \
  -allowProvisioningUpdates
```

**✅ Expected Output:**
```
** ARCHIVE SUCCEEDED **
```

**❌ Common Errors:**

**Error:** "xcodebuild: error: Scheme YourScheme is not currently configured for the archive action"
- **Solution:** Edit scheme in Xcode → Archive → Build Configuration: Release

**Error:** "Signing for 'YourApp' requires a development team"
- **Solution:** Add `DEVELOPMENT_TEAM=YOUR_TEAM_ID` to command

**Error:** "No profiles for 'com.your.bundle' were found"
- **Solution:** Run with `-allowProvisioningUpdates` or install profile manually

### Step 10: Validate Archive (Optional but Recommended)

**Purpose:** Check for issues before uploading to TestFlight

1. **In Organizer:**
   - Select your archive
   - Click: **Validate App**

2. **Distribution Method:**
   - Select: **App Store Connect**
   - Click: **Next**

3. **Distribution Options:**
   - **App Thinning:** All compatible device variants
   - **Rebuild from Bitcode:** Yes (if app includes bitcode)
   - **Include symbols:** Yes (for crash reporting)
   - Click: **Next**

4. **Signing:**
   - **Automatically manage signing:** Recommended
   - Or manually select certificate and profile
   - Click: **Next**

5. **Validation:**
   - Xcode will validate with App Store Connect
   - Checks:
     - Code signing valid
     - API usage allowed
     - Required entitlements present
     - No missing frameworks
   - Wait for completion (1-3 minutes)

6. **Results:**
   - ✅ **Success:** "YourApp.ipa passed validation"
   - ⚠️ **Warnings:** Review and address if critical
   - ❌ **Errors:** Must fix before upload

**Common Validation Warnings:**

- "Missing Push Notification Entitlement": OK if you don't use push notifications
- "Missing Marketing Icon": Must provide 1024x1024 icon
- "Deprecated API usage": Should update code for future iOS versions

---

## Uploading to TestFlight

### Step 11: Export and Upload Archive

**Status:** ✅ Ready to distribute

#### Step 11.1: Export via Xcode Organizer (Recommended)

1. **In Archives Organizer:**
   - Select your archive
   - Click: **Distribute App**

2. **Choose Distribution Method:**
   - Select: **App Store Connect**
   - Click: **Next**

3. **Choose Distribution Option:**
   - Select: **Upload**
   - (Not "Export" - that creates local .ipa without uploading)
   - Click: **Next**

4. **Distribution Options:**
   - **Destination:** App Store Connect
   - **App Thinning:** All compatible device variants
   - **Rebuild from Bitcode:** ☑️ Yes (recommended)
   - **Include symbols for your app:** ☑️ Yes (for crash logs)
   - **Manage Version and Build Number:** ☑️ Upload (recommended)
   - Click: **Next**

5. **Re-sign for Distribution:**
   - **Automatically manage signing:** Recommended
   - Xcode will re-sign with Distribution certificate
   - Click: **Next**

6. **Review Summary:**
   - Verify:
     - App name
     - Version and build number
     - Team name
     - Bundle ID
   - Click: **Upload**

7. **Upload Progress:**
   - Shows progress bar
   - Can take 5-30 minutes depending on:
     - App size
     - Internet speed
     - Apple server load
   - **Do not close Xcode** during upload

8. **Upload Complete:**
   - Message: "YourApp.ipa has been successfully uploaded"
   - Click: **Done**

**✅ Success Indicators:**
- No errors during upload
- Confirmation message appears
- Build will appear in App Store Connect (after processing)

#### Step 11.2: Export and Upload via Command Line

**Step 1: Create Export Options Plist**

Create `ExportOptions.plist` in your project directory:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store-connect</string>
    <key>teamID</key>
    <string>D4X8TSBQJC</string>
    <key>uploadSymbols</key>
    <true/>
    <key>uploadBitcode</key>
    <false/>
</dict>
</plist>
```

**Key Values:**
- `method`: `app-store-connect` (for TestFlight/App Store)
- `teamID`: Your 10-character Team ID
- `uploadSymbols`: `true` (enables crash reporting)
- `uploadBitcode`: `false` (bitcode deprecated in Xcode 14+)

**Other Method Options:**
- `development`: For testing on registered devices
- `ad-hoc`: For distribution outside App Store
- `enterprise`: For enterprise in-house apps

**Step 2: Export Archive**

```bash
xcodebuild -exportArchive \
  -archivePath ~/Desktop/YourApp.xcarchive \
  -exportPath ~/Desktop/YourApp_Export \
  -exportOptionsPlist ExportOptions.plist \
  -allowProvisioningUpdates
```

**Output:**
- Creates folder: `~/Desktop/YourApp_Export/`
- Contains:
  - `YourApp.ipa` (the app package)
  - `DistributionSummary.plist`
  - `ExportOptions.plist`
  - `Packaging.log`

**✅ Expected Result:**
```
** EXPORT SUCCEEDED **
```

**Step 3: Upload to App Store Connect**

**Option A: Transporter App** (Easiest)

```bash
# Open Transporter with your IPA:
open -a Transporter ~/Desktop/YourApp_Export/YourApp.ipa
```

Then in Transporter:
1. Sign in with your Apple ID
2. Click "Deliver"
3. Wait for upload to complete

**Option B: Command Line (xcrun altool)** - DEPRECATED in Xcode 14+

⚠️ **Note:** `altool` is deprecated. Use Transporter or App Store Connect API.

For legacy reference:
```bash
# Old method (no longer recommended):
xcrun altool --upload-app \
  --type ios \
  --file ~/Desktop/YourApp_Export/YourApp.ipa \
  --username your.email@example.com \
  --password "@keychain:AC_PASSWORD"
```

**Option C: App Store Connect API** (For CI/CD)

1. **Create API Key:**
   - App Store Connect → Users and Access → Keys
   - Generate new key with "App Manager" role
   - Download `AuthKey_KEYID.p8`
   - Note: Key ID and Issuer ID

2. **Store Key File:**
   ```bash
   mkdir -p ~/.appstoreconnect/private_keys
   cp AuthKey_KEYID.p8 ~/.appstoreconnect/private_keys/
   ```

3. **Upload with altool (new API method):**
   ```bash
   xcrun altool --upload-app \
     --type ios \
     --file ~/Desktop/YourApp_Export/YourApp.ipa \
     --apiKey YOUR_KEY_ID \
     --apiIssuer YOUR_ISSUER_ID
   ```

**Step 4: Verify Upload**

After upload completes:

1. **Go to App Store Connect:**
   - https://appstoreconnect.apple.com
   - Navigate to your app

2. **Check TestFlight Tab:**
   - Build will appear after processing
   - Processing takes 5-45 minutes
   - Status: "Processing" → "Ready to Submit" → "Ready to Test"

3. **Monitor Build Status:**
   - Email notifications for:
     - Processing complete
     - Invalid build (if errors found)
   - Check Activity tab for build history

#### Step 11.3: Install Transporter (If Not Present)

If `Transporter` app is not installed:

1. **Download from Mac App Store:**
   ```bash
   open "macappstore://apps.apple.com/us/app/transporter/id1450874784"
   ```
   Or search "Transporter" in Mac App Store

2. **Verify Installation:**
   ```bash
   ls -la /Applications/ | grep Transporter
   ```

3. **Launch Transporter:**
   ```bash
   open -a Transporter
   ```

**Transporter Features:**
- Drag-and-drop IPA files
- Upload progress tracking
- Validation before upload
- Error reporting
- No command-line complexity

---

## TestFlight Configuration

### Step 12: Configure TestFlight Build

**Status:** ✅ Build uploaded, now configure testing

After your build finishes processing in App Store Connect:

#### Step 12.1: Review Build Information

1. **Navigate to TestFlight Tab:**
   - App Store Connect → Your App → TestFlight

2. **Verify Build:**
   - **Version:** Matches your CFBundleShortVersionString
   - **Build:** Matches your CFBundleVersion
   - **Status:** "Ready to Submit" or "Missing Compliance"

#### Step 12.2: Export Compliance

⚠️ **Required for most apps**

**What is it?** Declares whether your app uses encryption (most apps do via HTTPS).

1. **Click on Build Number**
2. **Export Compliance Section:**
   - Question: "Is your app designed to use cryptography or does it contain or incorporate cryptography?"
   
   **Answer Guide:**
   - **Yes** if your app:
     - Uses HTTPS/SSL
     - Encrypts data
     - Uses VPN or secure communication
   - **No** only if:
     - No network communication
     - HTTP only (rare)

3. **Follow-up Questions (if Yes):**
   - "Does your app qualify for any of the exemptions provided in Category 5, Part 2?"
     - **Select Yes** if you only use:
       - HTTPS standard encryption
       - Encryption APIs from iOS SDK
       - No custom crypto implementation
   
4. **Submit Answers**
   - Status changes to "Ready to Test" or "Ready to Submit"

**Automated Configuration (Optional):**

Add to `Info.plist` to skip this step:

```xml
<key>ITSAppUsesNonExemptEncryption</key>
<false/>
```

Or:

```xml
<key>ITSAppUsesNonExemptEncryption</key>
<true/>
<key>ITSEncryptionExportComplianceCode</key>
<string>NO</string>
```

#### Step 12.3: Add Test Information

**Required before distributing to testers**

1. **Test Information Section:**
   - Click: **Provide Test Information**

2. **Test Details:**
   - **Email for tester feedback:** Your support email
   - **Phone number:** Your support phone
   - **Marketing URL:** (optional) Website URL
   - **Privacy Policy URL:** (required if collecting data)
   - **Description:** What testers should focus on
     - Example: "Please test music playback, library sync, and playlist management. Report any crashes or UI issues."

3. **Notes for Reviewers:**
   - Provide test credentials if login required
   - Explain any unusual behavior
   - Call out specific features to test

4. **Click:** **Submit for Review**

**⚠️ Beta App Review:**
- First TestFlight build requires Apple review
- Takes 12-48 hours typically
- Faster than full App Store review
- Reviews app for major policy violations only

#### Step 12.4: Add Testers

**Two Types of Testers:**

**Internal Testers:**
- Up to 100 testers
- Must be added as users in App Store Connect
- Access to builds immediately (no review needed)
- Can test before Beta App Review completes

**External Testers:**
- Up to 10,000 testers
- Invited via email
- Only after Beta App Review completes
- Can create groups for organized testing

**Adding Internal Testers:**

1. **App Store Connect → Users and Access**
2. **Click:** + button
3. **Add User:**
   - Email address
   - First name, last name
   - Role: "App Manager" or "Developer"
   - Access: Select your app

4. **Return to TestFlight Tab:**
   - Select build
   - Click: **Internal Testing** → **Add Testers**
   - Select users
   - Click: **Add**

**Adding External Testers:**

1. **Create Test Group:**
   - TestFlight tab → External Testing
   - Click: **+** → Create New Group
   - Name: e.g., "Beta Testers"

2. **Add Build to Group:**
   - Select group
   - Click: **Add Build to Test**
   - Select your build
   - Confirm

3. **Add Testers to Group:**
   - Click: **Add Testers**
   - Enter: Email addresses (one per line)
   - Or: Import from CSV
   - Click: **Add**

4. **Testers Receive Email:**
   - TestFlight invitation
   - Link to install TestFlight app
   - Link to install your beta

**Tester Limits:**
- Can install on 30 devices per tester
- Build expires after 90 days
- Must upload new build after expiration

### Step 13: Distribute to Testers

Once Beta App Review completes:

#### Step 13.1: Internal Distribution (Immediate)

**Status:** Available as soon as build processes

1. **Testers Install TestFlight:**
   - iPhone/iPad → App Store → Search "TestFlight"
   - Install official Apple TestFlight app

2. **Testers Accept Invite:**
   - Open invitation email
   - Tap "View in TestFlight"
   - TestFlight app opens
   - Tap "Accept" → "Install"

3. **Your App Installs:**
   - Shows orange "Beta" indicator
   - Functions like regular app
   - Can submit feedback to you

#### Step 13.2: External Distribution (After Review)

**Wait for:** "Ready to Test" status in External Testing group

1. **Enable Distribution:**
   - TestFlight → External Testing → Your Group
   - **Start Testing** button appears
   - Click it

2. **Testers Notified:**
   - Automatic email sent
   - Contains TestFlight link

3. **Monitor Adoption:**
   - TestFlight tab shows:
     - Invitations sent
     - Accepted invitations
     - Active testers
     - Sessions and crashes

#### Step 13.3: Collect Feedback

**Built-in Feedback:**
- Testers can shake device → Send Beta Feedback
- Screenshot + comments sent to you
- Viewable in App Store Connect

**Crash Reports:**
- Automatic crash reporting
- App Store Connect → TestFlight → Build → Crashes
- View stack traces and device info

**Analytics:**
- TestFlight provides basic metrics:
  - Install count
  - Session count
  - Crash rate
  - Device types

---

## Troubleshooting Common Issues

### Build and Archive Failures

#### Error: "No signing certificate found"

**Symptoms:**
```
error: Signing for "YourApp" requires a development team. Select a development team in the Signing & Capabilities editor.
```

**Solutions:**
1. **Check Team Selection:**
   - Xcode → Project → Signing & Capabilities → Team dropdown
   - Select your team

2. **Verify Certificate:**
   ```bash
   security find-identity -v -p codesigning
   ```
   - Should show "Apple Development" or "Apple Distribution"
   - If missing: Create certificate in Developer Portal

3. **Re-download Certificates:**
   - Xcode → Settings → Accounts → [Your Apple ID]
   - Click "Download Manual Profiles"

#### Error: "Provisioning profile doesn't match"

**Symptoms:**
```
error: Provisioning profile "YourApp Dev" doesn't include signing certificate "Apple Distribution: ...".
```

**Solutions:**
1. **Regenerate Profile:**
   - Developer Portal → Profiles
   - Edit your provisioning profile
   - Select correct certificate
   - Re-download and install

2. **Use Automatic Signing:**
   - Signing & Capabilities → ☑️ Automatically manage signing

#### Error: "Build failed - Pods not installed"

**Symptoms:**
```
error: Could not find module 'SomeLibrary' for target 'x86_64-apple-ios-simulator'
```

**Solutions:**
```bash
cd /path/to/project
pod install
# or
pod update
```

Then build again.

#### Error: "Destination platform is invalid"

**Symptoms:**
```
error: The destination platform for your scheme does not support the deployment target.
```

**Solutions:**
1. **Check Deployment Target:**
   - Project settings → Deployment Info → Deployment Target
   - Set to: iOS 13.0 or higher (matches your minimum support)

2. **Check Build Destination:**
   - Xcode toolbar → Select "Any iOS Device (arm64)"
   - Not simulator, not specific device

### Upload Failures

#### Error: "No suitable application records were found"

**Symptoms:**
```
Error: No suitable application records were found. Verify your bundle identifier 'com.your.app' is correct.
```

**Cause:** App record not created in App Store Connect

**Solutions:**
1. **Create App in App Store Connect:**
   - App Store Connect → My Apps → + New App
   - Enter details matching your Bundle ID

2. **Verify Bundle ID Match:**
   - Xcode project Bundle ID = App Store Connect Bundle ID
   - Must match exactly (case-sensitive)

#### Error: "App Store Connect access missing"

**Symptoms:**
```
Error: Your Apple ID or password was entered incorrectly
```

**Solutions:**
1. **Check 2FA:**
   - Ensure two-factor authentication enabled
   - Use app-specific password if 2FA issues

2. **Generate App-Specific Password:**
   - appleid.apple.com → Security → App-Specific Passwords
   - Generate new password
   - Use instead of main Apple ID password

#### Error: "Could not create IPA"

**Symptoms:**
```
error: exportArchive: Could not create a temporary .itmsp package
```

**Solutions:**
1. **Check Export Options:**
   - Verify `ExportOptions.plist` has correct `teamID`
   - Method should be "app-store-connect"

2. **Check Disk Space:**
   - Ensure enough free space (~5GB recommended)

3. **Clean and Rebuild:**
   ```bash
   xcodebuild clean
   rm -rf ~/Library/Developer/Xcode/DerivedData/*
   ```

### TestFlight Processing Issues

#### Build Stuck in "Processing"

**Symptoms:**
- Build shows "Processing" for > 1 hour
- No email update from Apple

**Solutions:**
1. **Wait Longer:**
   - Processing can take 2-8 hours during peak times
   - Be patient, especially for first build

2. **Check for Email:**
   - Apple sends email if build fails processing
   - Check spam folder

3. **Verify Build Success:**
   - Organizer → Archives → Your archive
   - Ensure no validation errors

#### Build Rejected with "Invalid Binary"

**Symptoms:**
- Email: "The binary you uploaded was invalid"
- Specific error listed in email

**Common Invalid Binary Errors:**

**Error:** "Missing Push Notification Entitlement"
- **Cause:** Registered for push notifications but missing entitlement
- **Solution:** Add Push Notification capability in Xcode

**Error:** "Missing Purpose String"
- **Cause:** Missing privacy description (NSCameraUsageDescription, etc.)
- **Solution:** Add all required privacy strings to Info.plist

**Error:** "Unsupported Architecture"
- **Cause:** Built for simulator (x86) instead of device (arm64)
- **Solution:** Select "Any iOS Device (arm64)" before archiving

**Error:** "Invalid Bundle Structure"
- **Cause:** Frameworks not properly embedded
- **Solution:** Embed frameworks in Xcode target settings

#### Testers Can't Install Build

**Symptoms:**
- Tester receives "Unable to Install" error
- Build shows in TestFlight but won't download

**Solutions:**
1. **Check Device Compatibility:**
   - Deployment target too high for tester's device
   - Lower deployment target in Xcode

2. **Check TestFlight App:**
   - Ensure TestFlight app is up to date
   - Delete and reinstall TestFlight

3. **Check Installation Limit:**
   - Tester can have max 30 devices
   - Remove old devices from TestFlight profile

4. **Resend Invitation:**
   - App Store Connect → TestFlight → Testers
   - Resend invitation email

### Code Signing Issues

#### Error: "Code signing is required"

**Full Error:**
```
errSecInternalComponent
error: Code signing is required for product type 'Application' in SDK 'iOS X'
```

**Solutions:**
1. **Set Signing:**
   - Xcode → Project → Signing & Capabilities
   - Enable "Automatically manage signing"
   - Select team

2. **Manual Signing:**
   - Disable automatic signing
   - Select provisioning profile manually

#### Error: "No matching provisioning profiles found"

**Symptoms:**
```
error: No profiles for 'com.your.app' were found: Xcode couldn't find any iOS App Development provisioning profiles matching 'com.your.app'.
```

**Solutions:**
1. **Download Profiles:**
   ```bash
   # Via Xcode:
   Xcode → Settings → Accounts → Download Manual Profiles
   ```

2. **Check Bundle ID:**
   - Ensure Bundle ID in Xcode matches registered App ID

3. **Regenerate Profile:**
   - Developer Portal → Profiles
   - Delete old profile
   - Create new profile with correct settings

#### Error: "Signing certificate is expired"

**Symptoms:**
```
error: Signing certificate "Apple Distribution: ..." has expired
```

**Solutions:**
1. **Check Expiration:**
   ```bash
   security find-identity -v -p codesigning
   ```
   Look for expiration dates

2. **Renew Certificate:**
   - Developer Portal → Certificates
   - Revoke expired certificate
   - Create new distribution certificate
   - Download and install

3. **Update Provisioning Profiles:**
   - All profiles using old certificate must be regenerated

---

## Command-Line Reference

### Complete Build and Upload Script

**File:** `build_and_upload.sh`

```bash
#!/bin/bash
set -e  # Exit on error

# Configuration
PROJECT_PATH="/path/to/YourProject.xcodeproj"
SCHEME="YourScheme"
ARCHIVE_PATH="$HOME/Desktop/YourApp.xcarchive"
EXPORT_PATH="$HOME/Desktop/YourApp_Export"
EXPORT_OPTIONS="./ExportOptions.plist"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo "🔨 Starting build process..."

# Clean
echo "🧹 Cleaning build folder..."
xcodebuild clean \
  -project "$PROJECT_PATH" \
  -scheme "$SCHEME"

# Archive
echo "📦 Creating archive..."
xcodebuild archive \
  -project "$PROJECT_PATH" \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "$ARCHIVE_PATH" \
  -allowProvisioningUpdates

if [ $? -ne 0 ]; then
  echo "${RED}❌ Archive failed${NC}"
  exit 1
fi

echo "${GREEN}✅ Archive succeeded${NC}"

# Export
echo "📤 Exporting IPA..."
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_PATH" \
  -exportOptionsPlist "$EXPORT_OPTIONS" \
  -allowProvisioningUpdates

if [ $? -ne 0 ]; then
  echo "${RED}❌ Export failed${NC}"
  exit 1
fi

echo "${GREEN}✅ Export succeeded${NC}"

# Upload (using Transporter)
echo "☁️  Uploading to App Store Connect..."
open -a Transporter "$EXPORT_PATH/YourApp.ipa"

echo "${GREEN}✅ Build process complete!${NC}"
echo "📱 Check App Store Connect for build processing status"
```

**Usage:**
```bash
chmod +x build_and_upload.sh
./build_and_upload.sh
```

### Quick Command Reference

**List Schemes:**
```bash
xcodebuild -list -project YourProject.xcodeproj
```

**List Destinations:**
```bash
xcodebuild -showdestinations \
  -project YourProject.xcodeproj \
  -scheme YourScheme
```

**Check Signing Identities:**
```bash
security find-identity -v -p codesigning
```

**List Provisioning Profiles:**
```bash
ls ~/Library/MobileDevice/Provisioning\ Profiles/
```

**View Provisioning Profile Details:**
```bash
security cms -D -i ~/Downloads/YourProfile.mobileprovision
```

**Get App Container Path (Simulator):**
```bash
xcrun simctl get_app_container booted com.your.bundleid data
```

**List Simulator Devices:**
```bash
xcrun simctl list devices
```

**Clear Derived Data:**
```bash
rm -rf ~/Library/Developer/Xcode/DerivedData/*
```

**Increment Build Number:**
```bash
agvtool next-version -all
```

---

## Post-Upload Checklist

After successful TestFlight upload:

### Week 1: Initial Testing
- [ ] Beta App Review approved
- [ ] Install build on internal test devices
- [ ] Verify core functionality works
- [ ] Check crash reports in App Store Connect
- [ ] Review tester feedback
- [ ] Fix critical bugs
- [ ] Upload new build if needed (increment build number)

### Week 2: Expanded Testing
- [ ] Add external testers
- [ ] Monitor adoption rate
- [ ] Review analytics (session length, crash rate)
- [ ] Collect user feedback
- [ ] Implement requested features or fixes
- [ ] Upload improved build

### Pre-App Store Release
- [ ] TestFlight stable for 1-2 weeks
- [ ] Crash rate < 1%
- [ ] All critical bugs fixed
- [ ] App Store screenshots prepared
- [ ] App Store description written
- [ ] Privacy policy finalized
- [ ] Submit for App Store Review

---

## Additional Resources

### Official Apple Documentation

- **App Store Connect Help:** https://developer.apple.com/help/app-store-connect/
- **TestFlight Beta Testing Guide:** https://developer.apple.com/testflight/
- **Code Signing Guide:** https://developer.apple.com/support/code-signing/
- **App Store Review Guidelines:** https://developer.apple.com/app-store/review/guidelines/
- **Human Interface Guidelines:** https://developer.apple.com/design/human-interface-guidelines/

### Useful Tools

- **Transporter:** Official upload tool (Mac App Store)
- **Fastlane:** Automation tool for iOS deployment
  - https://fastlane.tools
- **Xcode Cloud:** Apple's CI/CD service
  - Integrated with App Store Connect
- **DeployGate / Firebase App Distribution:** Alternative beta distribution platforms

### Common Xcode Commands

```bash
# Show Xcode version
xcodebuild -version

# Show SDK paths
xcodebuild -showsdks

# Show build settings
xcodebuild -showBuildSettings \
  -project YourProject.xcodeproj \
  -scheme YourScheme

# Analyze project
xcodebuild analyze \
  -project YourProject.xcodeproj \
  -scheme YourScheme

# Run tests
xcodebuild test \
  -project YourProject.xcodeproj \
  -scheme YourScheme \
  -destination 'platform=iOS Simulator,name=iPhone 14'
```

---

## Appendix: ExportOptions.plist Reference

**Minimal Configuration:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store-connect</string>
    <key>teamID</key>
    <string>YOUR_TEAM_ID</string>
</dict>
</plist>
```

**Full Configuration Options:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- Distribution method -->
    <key>method</key>
    <string>app-store-connect</string>
    <!-- Options: app-store-connect, development, ad-hoc, enterprise -->
    
    <!-- Team ID (required) -->
    <key>teamID</key>
    <string>D4X8TSBQJC</string>
    
    <!-- Upload symbols for crash reporting (recommended) -->
    <key>uploadSymbols</key>
    <true/>
    
    <!-- Bitcode (deprecated in Xcode 14+) -->
    <key>uploadBitcode</key>
    <false/>
    
    <!-- Code signing -->
    <key>signingCertificate</key>
    <string>Apple Distribution</string>
    
    <key>signingStyle</key>
    <string>automatic</string>
    <!-- Options: automatic, manual -->
    
    <!-- Provisioning profiles (if manual signing) -->
    <key>provisioningProfiles</key>
    <dict>
        <key>com.yourcompany.appname</key>
        <string>YourApp App Store</string>
    </dict>
    
    <!-- App thinning -->
    <key>compileBitcode</key>
    <false/>
    
    <key>thinning</key>
    <string>&lt;none&gt;</string>
    <!-- Options: <none>, <thin-for-all-variants>, specific device -->
    
    <!-- Strip Swift symbols -->
    <key>stripSwiftSymbols</key>
    <true/>
    
    <!-- Destination (for development/ad-hoc) -->
    <key>destination</key>
    <string>upload</string>
    <!-- Options: upload, export -->
</dict>
</plist>
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | October 11, 2025 | Initial guide based on RedShift Mobile deployment |

---

**End of Guide**

This guide is maintained as a living document based on real deployment experiences. When Apple updates their processes or requirements, this document will be updated accordingly.

For project-specific details, see `BUILD_COMMANDS.md` in the RedShiftMobile project directory.

