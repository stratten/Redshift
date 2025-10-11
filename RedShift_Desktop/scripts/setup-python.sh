#!/bin/bash
# Setup bundled Python runtime for iOS device communication

set -e

echo "📦 Setting up bundled Python runtime..."

# Create directories
mkdir -p resources/python

# Download relocatable Python for macOS ARM64
echo "⬇️  Downloading Python 3.11 for macOS ARM64..."
cd resources/python
curl -L -o python-standalone.tar.gz \
  "https://github.com/indygreg/python-build-standalone/releases/download/20241016/cpython-3.11.10+20241016-aarch64-apple-darwin-install_only.tar.gz"

# Extract
echo "📂 Extracting Python runtime..."
tar -xzf python-standalone.tar.gz
rm python-standalone.tar.gz

cd ../..

# Install pymobiledevice3 into bundled directory
echo "📱 Installing pymobiledevice3 and dependencies..."
resources/python/python/bin/python3 -m pip install --target resources/python-deps pymobiledevice3

echo "✅ Bundled Python setup complete!"
echo ""
echo "Python location: resources/python/python/bin/python3"
echo "pymobiledevice3 deps: resources/python-deps/"
echo ""
echo "Note: These directories are in .gitignore and need to be set up on each machine"
echo "      or included in your app bundle for distribution."
