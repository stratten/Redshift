#!/usr/bin/env python3
"""
Get UDIDs of all connected iOS devices
"""
import sys
import json

try:
    from pymobiledevice3.usbmux import list_devices
except ImportError:
    print(json.dumps({'error': 'NO_PYMOBILEDEVICE3'}))
    sys.exit(1)

def get_all_udids():
    """Get UDIDs of all connected devices"""
    try:
        devices = list_devices()
        
        udid_list = []
        for device in devices:
            udid_list.append({
                'udid': device.serial,
                'connection_type': device.connection_type
            })
        
        print(json.dumps({
            'success': True,
            'devices': udid_list
        }))
        return 0
        
    except Exception as e:
        print(json.dumps({
            'error': 'FAILED',
            'message': str(e)
        }))
        return 1

if __name__ == '__main__':
    sys.exit(get_all_udids())

