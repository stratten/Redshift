#!/usr/bin/env python3
"""
List music files from iOS device's Music library with metadata extraction
Usage: list-device-music.py <udid>
"""

import sys
import json
import os
import tempfile
from pymobiledevice3.lockdown import create_using_usbmux
from pymobiledevice3.services.afc import AfcService

try:
    from mutagen import File as MutagenFile
    MUTAGEN_AVAILABLE = True
except ImportError:
    MUTAGEN_AVAILABLE = False
    print(json.dumps({'error': 'mutagen not installed', 'success': False}))
    sys.exit(1)

def extract_metadata(afc, file_path):
    """Extract metadata from a music file on the device"""
    try:
        # Pull file to temp location to read metadata
        file_data = afc.get_file_contents(file_path)
        
        # Create temp file with proper extension
        ext = os.path.splitext(file_path)[1]
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
            tmp.write(file_data)
            tmp_path = tmp.name
        
        try:
            # Extract metadata using mutagen
            audio = MutagenFile(tmp_path, easy=True)
            if audio is None:
                return None
            
            metadata = {}
            
            # Extract common tags
            if 'artist' in audio:
                metadata['artist'] = str(audio['artist'][0]) if audio['artist'] else None
            if 'title' in audio:
                metadata['title'] = str(audio['title'][0]) if audio['title'] else None
            if 'album' in audio:
                metadata['album'] = str(audio['album'][0]) if audio['album'] else None
            
            return metadata if metadata else None
            
        finally:
            # Clean up temp file
            try:
                os.unlink(tmp_path)
            except:
                pass
                
    except Exception as e:
        # If we can't read metadata, return None
        return None

def list_music_library(udid):
    """List all music files from device's Music library"""
    try:
        # Connect to device using the correct API
        # create_using_usbmux() finds device by serial/udid automatically
        lockdown = create_using_usbmux(serial=udid)
        
        # Access the general file system (not app-specific)
        afc = AfcService(lockdown=lockdown)
        
        music_paths = [
            'Media/iTunes_Control/Music',  # Main music storage
            'iTunes_Control/Music',         # Alternative path
            'Media/Music',                  # Another possible location
        ]
        
        all_files = []
        
        for base_path in music_paths:
            try:
                # List files recursively
                files = scan_directory(afc, base_path)
                all_files.extend(files)
            except Exception as e:
                # Path might not exist on this device
                continue
        
        # Extract metadata for each file
        # Report progress to stderr so it doesn't interfere with JSON output
        total = len(all_files)
        print(json.dumps({'stage': 'metadata_extraction', 'total': total}), file=sys.stderr, flush=True)
        
        for i, file_info in enumerate(all_files):
            metadata = extract_metadata(afc, file_info['path'])
            if metadata:
                file_info['metadata'] = metadata
            
            # Report progress every 10 files for more frequent updates
            if (i + 1) % 10 == 0 or (i + 1) == total:
                # Include sample track info in progress updates
                sample_info = None
                if metadata:
                    sample_info = {
                        'title': metadata.get('title'),
                        'artist': metadata.get('artist'),
                        'album': metadata.get('album')
                    }
                
                print(json.dumps({
                    'stage': 'extracting',
                    'current': i + 1,
                    'total': total,
                    'percent': int((i + 1) / total * 100),
                    'sample': sample_info
                }), file=sys.stderr, flush=True)
        
        # Output final result as JSON to stdout
        result = {
            'success': True,
            'files': all_files,
            'total': len(all_files),
            'with_metadata': sum(1 for f in all_files if 'metadata' in f)
        }
        print(json.dumps(result), flush=True)
        return 0
        
    except Exception as e:
        error_result = {
            'success': False,
            'error': str(e),
            'files': [],
            'total': 0
        }
        print(json.dumps(error_result))
        return 1

def scan_directory(afc, path):
    """Recursively scan directory for music files"""
    files = []
    
    try:
        entries = afc.listdir(path)
        
        for entry in entries:
            if entry in ['.', '..']:
                continue
            
            full_path = f"{path}/{entry}"
            
            try:
                stat = afc.stat(full_path)
                
                # Check if it's a directory
                if stat['st_ifmt'] == 'S_IFDIR':
                    # Recurse into directory
                    files.extend(scan_directory(afc, full_path))
                else:
                    # Check if it's a music file
                    ext = os.path.splitext(entry.lower())[1]
                    if ext in ['.mp3', '.m4a', '.aac', '.flac', '.wav', '.ogg', '.opus', '.wma']:
                        files.append({
                            'path': full_path,
                            'name': entry,
                            'size': stat.get('st_size', 0)
                        })
            except Exception as e:
                # Skip files we can't access
                continue
                
    except Exception as e:
        # Directory not accessible
        pass
    
    return files

if __name__ == '__main__':
    if len(sys.argv) != 2:
        print(json.dumps({
            'success': False,
            'error': 'Usage: list-device-music.py <udid>',
            'files': [],
            'total': 0
        }))
        sys.exit(1)
    
    udid = sys.argv[1]
    sys.exit(list_music_library(udid))

