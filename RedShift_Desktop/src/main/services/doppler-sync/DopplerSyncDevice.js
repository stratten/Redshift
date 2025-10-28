// src/main/services/doppler-sync/DopplerSyncDevice.js
// Handles device scanning, pre-indexing, and device library enumeration

const path = require('path');
const fs = require('fs-extra');
const { execSync } = require('child_process');

/**
 * Pre-index device library: scan Doppler documents on the connected iPhone
 * and mark matching local tracks as already transferred (without copying).
 * 
 * Strategy:
 *  - Mount app documents via ifuse (preferred) or fall back to pymobiledevice3 afc ls
 *  - Collect device files (name, size)
 *  - Compare against local library (filename + size) and mark as transferred
 * 
 * @param {Object} context - Context object with dependencies
 * @param {Function} context.getLocalLibraryState - Function to get local library state
 * @param {Function} context.scanDeviceDocuments - Function to scan device documents
 * @param {Function} context.markAsTransferred - Function to mark file as transferred
 * @returns {Promise<Object>} Pre-index results
 */
async function preIndexDeviceLibrary(context) {
  const localLibrary = await context.getLocalLibraryState();
  const deviceFiles = await scanDeviceDocuments(context);
  console.log(`📱 Device scan: found ${deviceFiles.length} candidate files on device`);
  if (deviceFiles.length > 0) {
    console.log('📱 Device sample:', deviceFiles.slice(0, 5).map(f => `${f.name} (${f.size || 0})`).join(' | '));
  }

  const normalize = (s) => {
    return (s || '')
      .replace(/\.[^/.]+$/, '')       // drop extension
      .replace(/^\s*\d{1,3}[).\- _]+/, '') // drop leading track numbers like "01 - ", "1) "
      .replace(/[_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  };
  
  // Build device name map using normalized basenames
  const deviceMap = new Map(); // normalizedName -> set(sizes)
  deviceFiles.forEach(f => {
    const key = normalize(f.name);
    if (!deviceMap.has(key)) deviceMap.set(key, new Set());
    deviceMap.get(key).add(f.size || 0);
  });
  console.log(`📱 Device index: ${deviceMap.size} unique normalized names`);
  
  let matched = 0;
  for (const lf of localLibrary) {
    const base = lf.name || path.basename(lf.path);
    const size = lf.size || 0;
    const nameKey = normalize(base);
    const title = lf.metadata?.common?.title || '';
    const artist = lf.metadata?.common?.artist || '';
    const altKey = normalize(`${artist} - ${title}`);
    const sizes = deviceMap.get(nameKey) || deviceMap.get(altKey);
    if (sizes && sizes.has(lf.size || 0)) {
      try {
        await context.markAsTransferred(lf, 'preindexed');
        matched++;
      } catch (e) {
        console.warn('📱 preindex mark failed:', e?.message || e);
      }
    } else {
      // Occasionally log a few misses for diagnostics
      if (matched === 0 && Math.random() < 0.005) {
        console.log(`📱 No match for: name="${base}" alt="${artist} - ${title}" size=${size}`);
      }
    }
  }
  console.log(`📱 Pre-index complete: ${matched} files marked present on device`);
  return { matched, deviceFiles: deviceFiles.length, localFiles: localLibrary.length };
}

/**
 * Log what directories are accessible via AFC to help debug path issues
 * @param {Object} pythonBridge - Python bridge service
 */
async function logAccessibleDirectories(pythonBridge) {
  try {
    const cmd = pythonBridge.getPymobiledevice3Command('afc ls /');
    const commandsToTry = Array.isArray(cmd) ? cmd : [cmd];
    
    for (const command of commandsToTry) {
      try {
        console.log('📱 Checking accessible AFC directories...');
        const out = execSync(command, { encoding: 'utf8', timeout: 60000 }); // Increased timeout to 60s
        const dirs = out.trim().split('\n').filter(Boolean);
        console.log(`📱 Found ${dirs.length} accessible directories via AFC:`);
        dirs.forEach(dir => console.log(`   - ${dir}`));
        return; // Success, exit
      } catch (e) {
        console.warn('📱 Failed to list directories:', e?.message || e);
        // Try next command
      }
    }
  } catch (e) {
    console.warn('📱 Could not list AFC directories:', e?.message || e);
  }
}

/**
 * Scan Doppler app documents on device and return list of audio files
 * @param {Object} context - Context object with dependencies
 * @param {Object} context.pythonBridge - Python bridge service
 * @param {Array} context.audioExtensions - Valid audio file extensions
 * @returns {Promise<Array>} Array of device files
 */
async function scanDeviceDocuments(context) {
  console.log('📱 Starting device document scan...');
  
  // First, try to list what directories ARE accessible via AFC
  await logAccessibleDirectories(context.pythonBridge);
  
  // Try libimobiledevice + ifuse first (macOS/Linux)
  try {
    console.log('📱 Attempting idevice_id -l...');
    const devices = execSync('idevice_id -l', { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    console.log(`📱 Found ${devices.length} devices via idevice_id`);
    if (devices.length > 0) {
      const mountPoint = '/tmp/ios_mount';
      const bundleCandidates = [
        'com.bridgetech.Doppler',
        'com.bridgetech.DopplerBeta',
        'com.okaynokay.Doppler'
      ];
      await fs.ensureDir(mountPoint);
      let mounted = false;
      for (const bid of bundleCandidates) {
        try {
          console.log(`📱 Trying ifuse --documents ${bid}`);
          execSync(`ifuse --documents ${bid} ${mountPoint}`, { encoding: 'utf8' });
          mounted = true;
          const files = await walkDeviceDir(mountPoint, context.audioExtensions);
          console.log(`📱 ifuse documents (${bid}) found ${files.length} files`);
          try { execSync(`umount ${mountPoint}`); } catch (_) {}
          return files;
        } catch (_) {
          try { execSync(`umount ${mountPoint}`); } catch (_) {}
        }
      }
      // Fallback: mount root and look for Doppler/Documents
      if (!mounted) {
        try {
          console.log('📱 Trying ifuse (root mount)');
          execSync(`ifuse ${mountPoint}`, { encoding: 'utf8' });
          const candidates = [
            path.join(mountPoint, 'Doppler', 'Documents'),
            path.join(mountPoint, 'Documents')
          ];
          for (const c of candidates) {
            if (await fs.pathExists(c)) {
              const files = await walkDeviceDir(c, context.audioExtensions);
              console.log(`📱 ifuse root found ${files.length} files under ${c}`);
              try { execSync(`umount ${mountPoint}`); } catch (_) {}
              return files;
            }
          }
          try { execSync(`umount ${mountPoint}`); } catch (_) {}
        } catch (_) {}
      }
    }
  } catch (e) {
    console.warn('📱 libimobiledevice/ifuse failed:', e?.message || 'command not found or device not accessible');
  }
  
  // Fallback to pymobiledevice3 afc listing
  // Use bundled Python + pymobiledevice3, or fall back to system installations
  // Try multiple possible paths where Doppler might store files
  // Based on AFC structure: /Music, /Podcasts, /Downloads, /Books are available
  const pathsToTry = [
    '/Music',      // Most likely location for music files
    '/Downloads',  // Alternative location
    '/Books',      // Some apps store audio here
    '/Podcasts',   // Another audio location
  ];
  
  for (const remotePath of pathsToTry) {
    console.log(`📱 Trying path: ${remotePath}`);
    const pymobileCommands = context.pythonBridge.getPymobiledevice3Command(`afc ls ${remotePath}`);
    const commandsToTry = Array.isArray(pymobileCommands) ? pymobileCommands : [pymobileCommands];
  
    for (const cmd of commandsToTry) {
      try {
        console.log(`📱 Trying: ${cmd}...`);
        const out = execSync(cmd, { encoding: 'utf8', timeout: 60000 }); // Increased timeout to 60s
        console.log(`📱 pymobiledevice3 output length: ${out.length} chars`);
        
        // Parse output - format varies by command, try multiple patterns
        const files = [];
        out.split('\n').forEach(line => {
          // Pattern 1: detailed listing "-rw-r--r-- 12345 filename"
          let m = line.match(/\s(\d+)\s+(.*)$/);
          if (m) {
            const size = parseInt(m[1]);
            const name = m[2].trim();
            const ext = path.extname(name).toLowerCase();
            if (context.audioExtensions.includes(ext)) {
              files.push({ name, size, path: `/Documents/${name}` });
              return;
            }
          }
          
          // Pattern 2: simple listing (just filenames)
          const trimmed = line.trim();
          if (trimmed) {
            const ext = path.extname(trimmed).toLowerCase();
            if (context.audioExtensions.includes(ext)) {
              files.push({ name: trimmed, size: 0, path: `/Documents/${trimmed}` });
            }
          }
        });
        
        console.log(`📱 pymobiledevice3 listed ${files.length} audio files from ${remotePath}`);
        if (files.length > 0) {
          console.log(`📱 Sample files: ${files.slice(0, 3).map(f => f.name).join(', ')}`);
          return files; // Success! Return the files we found
        }
      } catch (e) {
        console.warn(`📱 Failed with "${cmd}":`, e?.message || 'command not found');
      }
    }
  } // End of remotePath loop
  
  console.error('📱 ❌ Could not enumerate device library - all methods failed');
  console.error('📱 Make sure you have either:');
  console.error('📱   1. libimobiledevice + ifuse installed (brew install libimobiledevice ifuse)');
  console.error('📱   2. pymobiledevice3 installed (pip3 install pymobiledevice3)');
  return [];
}

/**
 * Recursively walk a device directory and collect audio files
 * @param {string} root - Root directory path
 * @param {Array} audioExtensions - Valid audio file extensions
 * @returns {Promise<Array>} Array of files found
 */
async function walkDeviceDir(root, audioExtensions) {
  const collected = [];
  const walk = async (dir) => {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (_) { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { await walk(full); continue; }
      const ext = path.extname(e.name).toLowerCase();
      if (!audioExtensions.includes(ext)) continue;
      let size = 0;
      try { const st = await fs.stat(full); size = st.size; } catch (_) {}
      collected.push({ name: e.name, size, path: full });
    }
  };
  await walk(root);
  return collected;
}

module.exports = {
  preIndexDeviceLibrary,
  logAccessibleDirectories,
  scanDeviceDocuments,
  walkDeviceDir
};

