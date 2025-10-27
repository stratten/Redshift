#!/bin/bash
# Script to create macOS .icns icon from PNG source

SOURCE_PNG="../Assets/Redshift Logo - Trimmed - 1024.png"
ICONSET_DIR="icon.iconset"
OUTPUT_ICNS="../build/icon.icns"

# Check if source exists
if [ ! -f "$SOURCE_PNG" ]; then
    echo "❌ Source icon not found: $SOURCE_PNG"
    exit 1
fi

# Create iconset directory
mkdir -p "$ICONSET_DIR"

# Generate all required icon sizes using sips
echo "🎨 Generating icon sizes..."
sips -z 16 16     "$SOURCE_PNG" --out "${ICONSET_DIR}/icon_16x16.png"
sips -z 32 32     "$SOURCE_PNG" --out "${ICONSET_DIR}/icon_16x16@2x.png"
sips -z 32 32     "$SOURCE_PNG" --out "${ICONSET_DIR}/icon_32x32.png"
sips -z 64 64     "$SOURCE_PNG" --out "${ICONSET_DIR}/icon_32x32@2x.png"
sips -z 128 128   "$SOURCE_PNG" --out "${ICONSET_DIR}/icon_128x128.png"
sips -z 256 256   "$SOURCE_PNG" --out "${ICONSET_DIR}/icon_128x128@2x.png"
sips -z 256 256   "$SOURCE_PNG" --out "${ICONSET_DIR}/icon_256x256.png"
sips -z 512 512   "$SOURCE_PNG" --out "${ICONSET_DIR}/icon_256x256@2x.png"
sips -z 512 512   "$SOURCE_PNG" --out "${ICONSET_DIR}/icon_512x512.png"
sips -z 1024 1024 "$SOURCE_PNG" --out "${ICONSET_DIR}/icon_512x512@2x.png"

# Create .icns file
echo "📦 Creating .icns file..."
mkdir -p ../build
iconutil -c icns "$ICONSET_DIR" -o "$OUTPUT_ICNS"

# Cleanup
rm -rf "$ICONSET_DIR"

echo "✅ Icon created: $OUTPUT_ICNS"

