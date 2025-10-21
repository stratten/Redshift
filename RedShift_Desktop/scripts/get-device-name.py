#!/usr/bin/env python3
"""
Get the user-assigned name of a specific iOS device by UDID
"""
import sys
import json

try:
    from pymobiledevice3.lockdown import create_using_usbmux
    from pymobiledevice3.usbmux import list_devices
except ImportError:
    print(json.dumps({'error': 'NO_PYMOBILEDEVICE3'}))
    sys.exit(1)

def get_device_name(udid=None):
    """Get the device name from lockdown service
    
    Args:
        udid: Optional UDID to select specific device. If None, uses first device.
    """
    try:
        # If UDID provided, find that specific device
        if udid:
            devices = list_devices()
            target_device = None
            for device in devices:
                if device.serial == udid:
                    target_device = device
                    break
            
            if not target_device:
                print(json.dumps({
                    'error': 'DEVICE_NOT_FOUND',
                    'message': f'Device with UDID {udid} not found'
                }))
                return 1
            
            # Connect to specific device using its usbmux_address
            lockdown = create_using_usbmux(serial=udid)
        else:
            # Connect to first available device (legacy behavior)
            lockdown = create_using_usbmux()
        
        # Get device name and UDID
        device_name = lockdown.display_name or lockdown.get_value(key='DeviceName')
        device_model = lockdown.get_value(key='ProductType') or 'iOS Device'
        device_udid = lockdown.udid
        
        # Return device info
        print(json.dumps({
            'name': device_name,
            'model': device_model,
            'udid': device_udid,
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
    # Check if UDID was passed as argument
    udid_arg = sys.argv[1] if len(sys.argv) > 1 else None
    sys.exit(get_device_name(udid_arg))

