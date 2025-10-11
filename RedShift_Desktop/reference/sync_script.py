#!/usr/bin/env python3
"""
reference/sync_script.py - Original Python concept implementation

This file serves as a reference for the core sync logic implemented in the Electron app.
It demonstrates the key algorithms for library scanning, file comparison, and duplicate detection.
"""

import os
import sqlite3
import hashlib
import json
from pathlib import Path
from datetime import datetime

class DopplerSyncManager:
    def __init__(self):
        self.master_dir = Path.home() / "Music" / "DopplerMaster"
        self.sync_dir = Path.home() / "Music" / "DopplerSync" 
        self.db_path = self.sync_dir / "sync_database.db"
        self.queue_path = self.sync_dir / "transfer_queue.json"
        
        # Supported audio formats
        self.audio_extensions = {'.mp3', '.m4a', '.flac', '.wav', '.aac', '.m4p'}
        
        self.init_database()
    
    def init_database(self):
        """Initialize SQLite database with schema"""
        self.sync_dir.mkdir(exist_ok=True)
        conn = sqlite3.connect(self.db_path)
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS transferred_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_path TEXT UNIQUE NOT NULL,
                file_hash TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                last_modified INTEGER NOT NULL,
                transferred_date INTEGER NOT NULL,
                transfer_method TEXT NOT NULL
            );
            
            CREATE TABLE IF NOT EXISTS transfer_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_date INTEGER NOT NULL,
                files_queued INTEGER NOT NULL,
                files_transferred INTEGER NOT NULL,
                total_size INTEGER NOT NULL,
                duration_seconds INTEGER
            );
        """)
        conn.close()
    
    def calculate_file_hash(self, file_path):
        """Calculate SHA-256 hash of file"""
        hasher = hashlib.sha256()
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hasher.update(chunk)
        return hasher.hexdigest()
    
    def scan_master_library(self):
        """Scan master directory and return all audio files with metadata"""
        audio_files = []
        
        for file_path in self.master_dir.rglob('*'):
            if file_path.is_file() and file_path.suffix.lower() in self.audio_extensions:
                stat = file_path.stat()
                
                audio_files.append({
                    'path': str(file_path),
                    'relative_path': str(file_path.relative_to(self.master_dir)),
                    'size': stat.st_size,
                    'modified': int(stat.st_mtime),
                    'hash': None  # Calculated on-demand for efficiency
                })
        
        return audio_files
    
    def get_transferred_files(self):
        """Get list of files already transferred to iOS"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.execute("""
            SELECT file_path, file_hash, file_size, last_modified 
            FROM transferred_files
        """)
        
        transferred = {}
        for row in cursor:
            path, hash_val, size, modified = row
            transferred[path] = {
                'hash': hash_val,
                'size': size, 
                'modified': modified
            }
        
        conn.close()
        return transferred
    
    def identify_sync_candidates(self):
        """Compare master library with transferred files to find differences"""
        print("Scanning master library...")
        master_files = self.scan_master_library()
        
        print("Loading transfer history...")
        transferred = self.get_transferred_files()
        
        candidates = {
            'new_files': [],
            'modified_files': [],
            'missing_transfers': []
        }
        
        print(f"Analyzing {len(master_files)} files...")
        
        for file_info in master_files:
            relative_path = file_info['relative_path']
            
            if relative_path not in transferred:
                # New file never transferred
                candidates['new_files'].append(file_info)
                
            else:
                transferred_info = transferred[relative_path]
                
                # Check if file has been modified
                if (file_info['size'] != transferred_info['size'] or 
                    file_info['modified'] != transferred_info['modified']):
                    
                    # Calculate hash to confirm it's actually different
                    current_hash = self.calculate_file_hash(file_info['path'])
                    file_info['hash'] = current_hash
                    
                    if current_hash != transferred_info['hash']:
                        candidates['modified_files'].append(file_info)
        
        return candidates
    
    def create_transfer_queue(self, candidates):
        """Create transfer queue file for processing"""
        queue_data = {
            'created': datetime.now().isoformat(),
            'total_files': len(candidates['new_files']) + len(candidates['modified_files']),
            'total_size': 0,
            'files': []
        }
        
        for file_list in [candidates['new_files'], candidates['modified_files']]:
            for file_info in file_list:
                queue_data['total_size'] += file_info['size']
                queue_data['files'].append({
                    'path': file_info['path'],
                    'relative_path': file_info['relative_path'],
                    'size': file_info['size'],
                    'status': 'queued'
                })
        
        with open(self.queue_path, 'w') as f:
            json.dump(queue_data, f, indent=2)
        
        return queue_data
    
    def mark_as_transferred(self, file_path, transfer_method='manual'):
        """Mark a file as successfully transferred"""
        file_info = Path(file_path)
        stat = file_info.stat()
        
        # Calculate hash for verification
        file_hash = self.calculate_file_hash(file_path)
        relative_path = str(file_info.relative_to(self.master_dir))
        
        conn = sqlite3.connect(self.db_path)
        conn.execute("""
            INSERT OR REPLACE INTO transferred_files 
            (file_path, file_hash, file_size, last_modified, transferred_date, transfer_method)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            relative_path,
            file_hash, 
            stat.st_size,
            int(stat.st_mtime),
            int(datetime.now().timestamp()),
            transfer_method
        ))
        conn.commit()
        conn.close()
    
    def generate_sync_report(self, candidates):
        """Generate human-readable sync report"""
        report = []
        report.append("=== DOPPLER SYNC ANALYSIS ===")
        report.append(f"Scan completed: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        report.append("")
        
        total_new = len(candidates['new_files'])
        total_modified = len(candidates['modified_files']) 
        total_size = sum(f['size'] for f in candidates['new_files'] + candidates['modified_files'])
        
        report.append(f"Files to sync: {total_new + total_modified}")
        report.append(f"  • New files: {total_new}")
        report.append(f"  • Modified files: {total_modified}")
        report.append(f"Total size: {total_size / (1024*1024):.1f} MB")
        report.append("")
        
        if total_new > 0:
            report.append("NEW FILES:")
            for file_info in candidates['new_files'][:10]:  # Show first 10
                report.append(f"  + {file_info['relative_path']}")
            if total_new > 10:
                report.append(f"  + ... and {total_new - 10} more")
            report.append("")
        
        if total_modified > 0:
            report.append("MODIFIED FILES:")
            for file_info in candidates['modified_files'][:10]:
                report.append(f"  ~ {file_info['relative_path']}")
            if total_modified > 10:
                report.append(f"  ~ ... and {total_modified - 10} more")
        
        return "\n".join(report)

def main():
    """Main entry point for command-line usage"""
    sync_manager = DopplerSyncManager()
    
    print("🎵 Doppler Sync Analysis Starting...")
    
    # Identify what needs to be synced
    candidates = sync_manager.identify_sync_candidates()
    
    # Generate and display report
    report = sync_manager.generate_sync_report(candidates)
    print(report)
    
    total_files = len(candidates['new_files']) + len(candidates['modified_files'])
    
    if total_files > 0:
        # Create transfer queue
        queue = sync_manager.create_transfer_queue(candidates)
        print(f"\n✅ Transfer queue created: {total_files} files ready")
        print(f"📁 Queue file: {sync_manager.queue_path}")
        print("\nNext steps:")
        print("1. Connect your iPhone via USB")
        print("2. Use the Electron app for automated transfer")
        
    else:
        print("\n✅ No files need syncing - you're up to date!")

if __name__ == "__main__":
    main()