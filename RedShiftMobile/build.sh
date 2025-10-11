#!/bin/bash
# RedShift Mobile - Quick Build Script

set -e  # Exit on error

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_NAME="RedShiftMobile"
SCHEME="RedShiftMobile"

echo "🎵 RedShift Mobile Build Script"
echo "================================"

# Function to list available simulators
list_simulators() {
    echo "📱 Available Simulators:"
    xcrun simctl list devices available | grep "iPhone"
}

# Function to build for simulator
build_simulator() {
    echo "🔨 Building for iOS Simulator..."
    cd "$PROJECT_DIR"
    
    xcodebuild -project "${PROJECT_NAME}.xcodeproj" \
               -scheme "$SCHEME" \
               -sdk iphonesimulator \
               -configuration Debug \
               -derivedDataPath build \
               build
    
    echo "✅ Build complete!"
    echo "📦 App location: build/Build/Products/Debug-iphonesimulator/${PROJECT_NAME}.app"
}

# Function to run on simulator
run_simulator() {
    SIMULATOR="${1:-iPhone 15 Pro}"
    
    echo "🚀 Running on simulator: $SIMULATOR"
    
    # Boot simulator if not already running
    DEVICE_ID=$(xcrun simctl list devices | grep "$SIMULATOR" | grep -v "unavailable" | head -1 | grep -o "[A-F0-9-]\{36\}")
    
    if [ -z "$DEVICE_ID" ]; then
        echo "❌ Simulator '$SIMULATOR' not found"
        list_simulators
        exit 1
    fi
    
    # Check if simulator is already booted
    STATE=$(xcrun simctl list devices | grep "$DEVICE_ID" | grep -o "(Booted\|Shutdown)")
    
    if [ "$STATE" != "(Booted" ]; then
        echo "⏳ Booting simulator..."
        xcrun simctl boot "$DEVICE_ID"
        sleep 3
    fi
    
    # Install app
    APP_PATH="build/Build/Products/Debug-iphonesimulator/${PROJECT_NAME}.app"
    
    if [ ! -d "$APP_PATH" ]; then
        echo "⚠️  App not built yet, building first..."
        build_simulator
    fi
    
    echo "📲 Installing app..."
    xcrun simctl install "$DEVICE_ID" "$APP_PATH"
    
    echo "▶️  Launching app..."
    xcrun simctl launch "$DEVICE_ID" com.redshift.mobile
    
    echo "✅ App launched successfully!"
    echo ""
    echo "💡 To view logs:"
    echo "   xcrun simctl spawn $DEVICE_ID log stream --predicate 'processImagePath contains \"${PROJECT_NAME}\"'"
}

# Function to clean build artifacts
clean() {
    echo "🧹 Cleaning build artifacts..."
    cd "$PROJECT_DIR"
    rm -rf build
    rm -rf DerivedData
    echo "✅ Clean complete!"
}

# Function to show logs
show_logs() {
    SIMULATOR="${1:-iPhone 15 Pro}"
    DEVICE_ID=$(xcrun simctl list devices | grep "$SIMULATOR" | grep -v "unavailable" | head -1 | grep -o "[A-F0-9-]\{36\}")
    
    if [ -z "$DEVICE_ID" ]; then
        echo "❌ Simulator '$SIMULATOR' not found"
        exit 1
    fi
    
    echo "📋 Showing logs for ${PROJECT_NAME}..."
    xcrun simctl spawn "$DEVICE_ID" log stream --predicate 'processImagePath contains "'"${PROJECT_NAME}"'"'
}

# Main script logic
case "${1:-build}" in
    build)
        build_simulator
        ;;
    run)
        run_simulator "${2:-iPhone 15 Pro}"
        ;;
    clean)
        clean
        ;;
    list)
        list_simulators
        ;;
    logs)
        show_logs "${2:-iPhone 15 Pro}"
        ;;
    help|--help|-h)
        echo "Usage: ./build.sh [command] [options]"
        echo ""
        echo "Commands:"
        echo "  build              Build for iOS Simulator (default)"
        echo "  run [simulator]    Build and run on simulator (default: iPhone 15 Pro)"
        echo "  clean              Clean build artifacts"
        echo "  list               List available simulators"
        echo "  logs [simulator]   Show app logs"
        echo "  help               Show this help message"
        echo ""
        echo "Examples:"
        echo "  ./build.sh                           # Build only"
        echo "  ./build.sh run                       # Build and run on default simulator"
        echo "  ./build.sh run 'iPhone 14'           # Build and run on iPhone 14"
        echo "  ./build.sh logs                      # Show logs"
        echo "  ./build.sh clean                     # Clean build"
        ;;
    *)
        echo "❌ Unknown command: $1"
        echo "Run './build.sh help' for usage information"
        exit 1
        ;;
esac
