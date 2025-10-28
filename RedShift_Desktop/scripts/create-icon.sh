#!/bin/bash
# Script to create macOS .icns icon from PNG source

# Get script directory and project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

SOURCE_PNG="$PROJECT_ROOT/Assets/Redshift Logo - Trimmed - 1024.png"
ICONSET_DIR="$PROJECT_ROOT/scripts/icon.iconset"
OUTPUT_ICNS="$PROJECT_ROOT/build/icon.icns"

# Check if source exists
if [ ! -f "$SOURCE_PNG" ]; then
    echo "❌ Source icon not found: $SOURCE_PNG"
    exit 1
fi

# Create iconset directory
mkdir -p "$ICONSET_DIR"

# Function to add rounded corners to an image
add_rounded_corners() {
    local input="$1"
    local output="$2"
    local size="$3"
    
    # Calculate corner radius (typically 22.5% of size for macOS Big Sur style)
    local radius=$(echo "$size * 0.225" | bc | cut -d. -f1)
    
    # Use ImageMagick if available, otherwise use sips (no rounding)
    if command -v magick &> /dev/null || command -v convert &> /dev/null; then
        local magick_cmd="magick"
        if ! command -v magick &> /dev/null; then
            magick_cmd="convert"
        fi
        
        $magick_cmd "$input" \
            \( +clone -alpha extract \
            -draw "fill black polygon 0,0 0,$radius $radius,0 fill white circle $radius,$radius $radius,0" \
            \( +clone -flip \) -compose Multiply -composite \
            \( +clone -flop \) -compose Multiply -composite \
            \) -alpha off -compose CopyOpacity -composite "$output"
    else
        # Fallback: just copy without rounding
        cp "$input" "$output"
    fi
}

# Generate all required icon sizes using sips, then round them
echo "🎨 Generating icon sizes with rounded corners..."

# Create temp files first with sips
sips -z 16 16     "$SOURCE_PNG" --out "${ICONSET_DIR}/temp_16.png" > /dev/null 2>&1
sips -z 32 32     "$SOURCE_PNG" --out "${ICONSET_DIR}/temp_32.png" > /dev/null 2>&1
sips -z 64 64     "$SOURCE_PNG" --out "${ICONSET_DIR}/temp_64.png" > /dev/null 2>&1
sips -z 128 128   "$SOURCE_PNG" --out "${ICONSET_DIR}/temp_128.png" > /dev/null 2>&1
sips -z 256 256   "$SOURCE_PNG" --out "${ICONSET_DIR}/temp_256.png" > /dev/null 2>&1
sips -z 512 512   "$SOURCE_PNG" --out "${ICONSET_DIR}/temp_512.png" > /dev/null 2>&1
sips -z 1024 1024 "$SOURCE_PNG" --out "${ICONSET_DIR}/temp_1024.png" > /dev/null 2>&1

# Apply rounded corners to each size
add_rounded_corners "${ICONSET_DIR}/temp_16.png" "${ICONSET_DIR}/icon_16x16.png" 16
add_rounded_corners "${ICONSET_DIR}/temp_32.png" "${ICONSET_DIR}/icon_16x16@2x.png" 32
add_rounded_corners "${ICONSET_DIR}/temp_32.png" "${ICONSET_DIR}/icon_32x32.png" 32
add_rounded_corners "${ICONSET_DIR}/temp_64.png" "${ICONSET_DIR}/icon_32x32@2x.png" 64
add_rounded_corners "${ICONSET_DIR}/temp_128.png" "${ICONSET_DIR}/icon_128x128.png" 128
add_rounded_corners "${ICONSET_DIR}/temp_256.png" "${ICONSET_DIR}/icon_128x128@2x.png" 256
add_rounded_corners "${ICONSET_DIR}/temp_256.png" "${ICONSET_DIR}/icon_256x256.png" 256
add_rounded_corners "${ICONSET_DIR}/temp_512.png" "${ICONSET_DIR}/icon_256x256@2x.png" 512
add_rounded_corners "${ICONSET_DIR}/temp_512.png" "${ICONSET_DIR}/icon_512x512.png" 512
add_rounded_corners "${ICONSET_DIR}/temp_1024.png" "${ICONSET_DIR}/icon_512x512@2x.png" 1024

# Clean up temp files
rm -f "${ICONSET_DIR}"/temp_*.png

# Create .icns file
echo "📦 Creating .icns file..."
mkdir -p "$PROJECT_ROOT/build"
iconutil -c icns "$ICONSET_DIR" -o "$OUTPUT_ICNS"

# Cleanup
rm -rf "$ICONSET_DIR"

echo "✅ Icon created: $OUTPUT_ICNS"

