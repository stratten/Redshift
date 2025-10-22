#!/usr/bin/env python3
"""
Pull/import a single file from iOS device to desktop
Usage: pull-from-device.py <udid> <source_filename> <dest_path>
"""

import sys
import os
from pymobiledevice3.lockdown import LockdownClient
from pymobiledevice3.services.house_arrest import HouseArrestService

BUNDLE_ID = 'com.redshiftplayer.mobile'

def pull_file_from_device(udid, source_filename, dest_path):
    """Pull a file from the RedShift Mobile app's Documents folder"""
    try:
        # Connect to device
        lockdown = LockdownClient(udid=udid)
        
        # Access app container
        house_arrest = HouseArrestService(lockdown=lockdown, bundle_id=BUNDLE_ID)
        
        # Read the source file
        source_path = f'Documents/{source_filename}'
        
        try:
            file_data = house_arrest.pull(source_path)
            
            # Write to destination
            with open(dest_path, 'wb') as f:
                f.write(file_data)
            
            print(f"✅ Pulled: {source_filename}")
            return 0
            
        except Exception as e:
            print(f"❌ Failed to pull {source_filename}: {str(e)}", file=sys.stderr)
            return 1
            
    except Exception as e:
        print(f"❌ Device connection failed: {str(e)}", file=sys.stderr)
        return 1

if __name__ == '__main__':
    if len(sys.argv) != 4:
        print("Usage: pull-from-device.py <udid> <source_filename> <dest_path>", file=sys.stderr)
        sys.exit(1)
    
    udid = sys.argv[1]
    source_filename = sys.argv[2]
    dest_path = sys.argv[3]
    
    sys.exit(pull_file_from_device(udid, source_filename, dest_path))

