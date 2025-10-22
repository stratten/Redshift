#!/usr/bin/env python3
"""
Pull a music file from iOS device's Music library to desktop
Usage: pull-device-music.py <udid> <source_path> <dest_path>
"""

import sys
from pymobiledevice3.lockdown import create_using_usbmux
from pymobiledevice3.services.afc import AfcService

def pull_music_file(udid, source_path, dest_path):
    """Pull a music file from the device's general Music library"""
    try:
        # Connect to device using the correct API
        # create_using_usbmux() finds device by serial/udid automatically
        lockdown = create_using_usbmux(serial=udid)
        
        # Access the general file system
        afc = AfcService(lockdown=lockdown)
        
        # Read the file
        try:
            file_data = afc.get_file_contents(source_path)
            
            # Write to destination
            with open(dest_path, 'wb') as f:
                f.write(file_data)
            
            print(f"✅ Pulled: {source_path}")
            return 0
            
        except Exception as e:
            print(f"❌ Failed to pull {source_path}: {str(e)}", file=sys.stderr)
            return 1
            
    except Exception as e:
        print(f"❌ Device connection failed: {str(e)}", file=sys.stderr)
        return 1

if __name__ == '__main__':
    if len(sys.argv) != 4:
        print("Usage: pull-device-music.py <udid> <source_path> <dest_path>", file=sys.stderr)
        sys.exit(1)
    
    udid = sys.argv[1]
    source_path = sys.argv[2]
    dest_path = sys.argv[3]
    
    sys.exit(pull_music_file(udid, source_path, dest_path))

