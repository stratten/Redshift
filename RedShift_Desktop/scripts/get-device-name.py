#!/usr/bin/env python3
"""
Get the user-assigned name of the connected iOS device
"""
import sys
import json

try:
    from pymobiledevice3.lockdown import create_using_usbmux
except ImportError:
    print(json.dumps({'error': 'NO_PYMOBILEDEVICE3'}))
    sys.exit(1)

def get_device_name():
    """Get the device name from lockdown service"""
    try:
        # Connect to device
        lockdown = create_using_usbmux()
        
        # Get device name
        device_name = lockdown.display_name or lockdown.get_value(key='DeviceName')
        device_model = lockdown.get_value(key='ProductType') or 'iOS Device'
        
        # Return device info
        print(json.dumps({
            'name': device_name,
            'model': device_model,
            'success': True
        }))
        return 0
        
    except Exception as e:
        # No device connected or error
        print(json.dumps({
            'error': 'NO_DEVICE',
            'message': str(e)
        }))
        return 1

if __name__ == '__main__':
    sys.exit(get_device_name())

