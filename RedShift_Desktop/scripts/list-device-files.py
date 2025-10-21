#!/usr/bin/env python3
"""
List files in RedShift Mobile app's Documents/Music folder on a specific device
"""
import sys
import json
import os

try:
    from pymobiledevice3.lockdown import create_using_usbmux
    from pymobiledevice3.services.afc import AfcService, AfcShell
    from pymobiledevice3.usbmux import list_devices
except ImportError as e:
    print(json.dumps([]))
    sys.exit(0)

def list_app_files(bundle_id, remote_path, udid=None):
    """List files in app's specified path
    
    Args:
        bundle_id: App bundle identifier
        remote_path: Path within the app container
        udid: Optional device UDID. If None, uses first device.
    """
    try:
        # Connect to specific device if UDID provided
        if udid:
            lockdown = create_using_usbmux(serial=udid)
        else:
            # Connect to first available device (legacy behavior)
            lockdown = create_using_usbmux()
        
        # Create AFC service for the app's container
        afc = AfcService(lockdown=lockdown, service_name='com.apple.afc')
        
        # Try to access the app container through house arrest
        try:
            from pymobiledevice3.services.house_arrest import HouseArrestService
            house_arrest = HouseArrestService(lockdown=lockdown, bundle_id=bundle_id)
            # HouseArrestService inherits from AfcService, so we can use it directly
        except Exception as e:
            # If house arrest doesn't work, app is not installed
            print(json.dumps({'error': 'APP_NOT_INSTALLED', 'message': str(e)}))
            return 1
        
        # List files
        files = []
        try:
            # List items in the directory using house_arrest service directly
            items = house_arrest.listdir(remote_path)
            
            for item in items:
                if not item.startswith('.'):  # Skip hidden files
                    file_path = os.path.join(remote_path, item)
                    try:
                        # Get file info
                        info = house_arrest.stat(file_path)
                        # Check if it's a regular file (not directory)
                        if info['st_ifmt'] == 'S_IFREG':
                            files.append({
                                'name': item,
                                'size': info['st_size'],
                                'path': file_path
                            })
                    except Exception as e:
                        # Skip files we can't stat
                        pass
        except Exception as e:
            # Directory might not exist, return empty list
            pass
        
        print(json.dumps(files))
        return 0
        
    except Exception as e:
        # Return empty list on error
        print(json.dumps([]))
        return 0

if __name__ == '__main__':
    bundle_id = 'com.redshiftplayer.mobile'
    remote_path = 'Documents/Music'
    
    # Check if UDID was passed as argument
    udid_arg = sys.argv[1] if len(sys.argv) > 1 else None
    
    sys.exit(list_app_files(bundle_id, remote_path, udid_arg))

