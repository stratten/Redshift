# 01 — Schema and main-process settings

## Edit 1: `RedShift_Desktop/src/main/services/Database.js` — add the `videos` table

Find this exact block (the last two statements in `initializeDatabase` before the return):

```
  await run(db, `CREATE INDEX IF NOT EXISTS idx_transfer_device ON transferred_files(device_id)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_transfer_status ON transferred_files(transfer_status)`);

  return db;
}
```

Replace it with:

```
  await run(db, `CREATE INDEX IF NOT EXISTS idx_transfer_device ON transferred_files(device_id)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_transfer_status ON transferred_files(transfer_status)`);

  // Videos table: local desktop video library (independent of the songs/audio tables)
  await run(db, `
    CREATE TABLE IF NOT EXISTS videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT UNIQUE NOT NULL,
      file_name TEXT NOT NULL,
      relative_path TEXT,
      file_size INTEGER NOT NULL,
      modified_time INTEGER NOT NULL,
      title TEXT,
      duration INTEGER,
      width INTEGER,
      height INTEGER,
      playback_supported INTEGER,
      last_position_seconds INTEGER DEFAULT 0,
      watched INTEGER DEFAULT 0,
      added_date INTEGER DEFAULT (strftime('%s', 'now')),
      modified_date INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

  await run(db, `CREATE INDEX IF NOT EXISTS idx_videos_file_path ON videos(file_path)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_videos_title ON videos(title)`);

  return db;
}
```

This anchor is unique in the file (verified by reading `Database.js` in full before drafting this plan; `idx_transfer_status` appears exactly once).

`playback_supported` is stored as `INTEGER` using SQLite's convention (`1` = true, `0` = false, `NULL` = not yet determined) since SQLite has no native boolean type — consistent with `watched` in the same table.

## Edit 2: `RedShift_Desktop/src/main/main.js` — platform defaults

Find this exact block:

```
    // Audio file extensions
    this.audioExtensions = ['.mp3', '.m4a', '.flac', '.wav', '.aac', '.m4p', '.ogg', '.opus'];
```

Replace it with:

```
    // Audio file extensions
    this.audioExtensions = ['.mp3', '.m4a', '.flac', '.wav', '.aac', '.m4p', '.ogg', '.opus'];

    // Default video library paths by platform
    const defaultVideoPaths = {
      darwin: app.getPath('videos'),
      win32: app.getPath('videos'),
      linux: path.join(app.getPath('home'), 'Videos')
    };

    this.defaultVideoLibraryPath = defaultVideoPaths[process.platform] || defaultVideoPaths.linux;

    // Video file extensions (browser-native playback is verified per-file at play
    // time via the <video> element's error event, not assumed from the extension)
    this.videoExtensions = ['.mp4', '.m4v', '.mov', '.webm', '.mkv', '.avi'];
```

This anchor (the single-line `this.audioExtensions = [...]` comment+assignment) is unique in the file.

## Edit 3: `RedShift_Desktop/src/main/main.js` — require the new service

Find the existing `MusicLibraryCache` require line (it is the only line in the file matching this exact text):

```
const MusicLibraryCache = require('./services/MusicLibraryCache');
```

Replace it with:

```
const MusicLibraryCache = require('./services/MusicLibraryCache');
const VideoLibraryCache = require('./services/VideoLibraryCache');
```

## Edit 4: `RedShift_Desktop/src/main/main.js` — default settings object

Find this exact block:

```
    const defaultSettings = {
      masterLibraryPath: this.defaultMasterLibraryPath,
      musicLibraryPath: null,
      defaultTransferMethod: 'direct_libimobile',
      theme: 'dark',
      volume: 1.0,
      shuffleMode: false,
      repeatMode: 'none',
      lastWindowSize: { width: 1200, height: 800 },
      windowBounds: { width: 1200, height: 800 },
      isMaximized: false
    };
```

Replace it with:

```
    const defaultSettings = {
      masterLibraryPath: this.defaultMasterLibraryPath,
      musicLibraryPath: null,
      videoLibraryPath: null,
      defaultTransferMethod: 'direct_libimobile',
      theme: 'dark',
      volume: 1.0,
      shuffleMode: false,
      repeatMode: 'none',
      lastWindowSize: { width: 1200, height: 800 },
      windowBounds: { width: 1200, height: 800 },
      isMaximized: false
    };
```

## Edit 5: `RedShift_Desktop/src/main/main.js` — `initializeApp()` directory bootstrap

Find this exact block:

```
    this.masterLibraryPath = this.settings.masterLibraryPath;
    this.volume = this.settings.volume;
    
    // Ensure music library directory exists
    await fs.ensureDir(this.masterLibraryPath);
```

Replace it with:

```
    this.masterLibraryPath = this.settings.masterLibraryPath;
    this.volume = this.settings.volume;
    
    // Ensure music library directory exists
    await fs.ensureDir(this.masterLibraryPath);

    this.videoLibraryPath = this.settings.videoLibraryPath || this.defaultVideoLibraryPath;
    await fs.ensureDir(this.videoLibraryPath);
```

## Edit 6: `RedShift_Desktop/src/main/main.js` — `initializeServices()` wiring

Find the block where `musicLibraryCache` is constructed and initialized (this exact two-line pairing is unique — confirmed by reading the file in full):

```
    this.musicLibraryCache = new MusicLibraryCache(this.appDataPath, this.audioPlayerService);
    await this.musicLibraryCache.initialize();
```

Replace it with:

```
    this.musicLibraryCache = new MusicLibraryCache(this.appDataPath, this.audioPlayerService);
    await this.musicLibraryCache.initialize();

    // Video library cache reuses the already-open sync_database.db handle (this.db);
    // the `videos` table is created by initializeDatabase(), which always runs before
    // initializeServices() in initializeApp(), so no async initialize() step is needed here.
    this.videoLibraryCache = new VideoLibraryCache(this);
```

If the exact two-line pairing above is not found verbatim (for example if intervening code was added by another package before this one is applied), locate the `this.musicLibraryCache = new MusicLibraryCache(...)` / `await this.musicLibraryCache.initialize();` pair by searching for `new MusicLibraryCache(` inside `initializeServices()` and insert the `VideoLibraryCache` construction line immediately after the `await this.musicLibraryCache.initialize();` line, preserving the comment shown above.

## Edit 7: `RedShift_Desktop/src/main/main.js` — `updateSetting()`

Find this exact block:

```
  async updateSetting(key, value) {
    this.settings[key] = value;
    
    // Update instance variables for critical settings
    if (key === 'masterLibraryPath') {
      this.masterLibraryPath = value;
      await fs.ensureDir(this.masterLibraryPath);
      this.startFileWatcher(); // Restart watcher with new path
    } else if (key === 'volume') {
      this.volume = value;
    }
```

Replace it with:

```
  async updateSetting(key, value) {
    this.settings[key] = value;
    
    // Update instance variables for critical settings
    if (key === 'masterLibraryPath') {
      this.masterLibraryPath = value;
      await fs.ensureDir(this.masterLibraryPath);
      this.startFileWatcher(); // Restart watcher with new path
    } else if (key === 'videoLibraryPath') {
      this.videoLibraryPath = value;
      await fs.ensureDir(this.videoLibraryPath);
    } else if (key === 'volume') {
      this.volume = value;
    }
```

Note: `videoLibraryPath` intentionally does not restart any file watcher — this package has no video `FileWatcher` (see companion doc 2); changes are only picked up on an explicit rescan.

## Edit 8: `RedShift_Desktop/src/main/main.js` — `chooseDirectory()` dialog title

Find this exact line:

```
      title: settingKey === 'musicLibraryPath' ? 'Select Music Library Directory' : 'Select Master Library Directory'
```

Replace it with:

```
      title: settingKey === 'musicLibraryPath'
        ? 'Select Music Library Directory'
        : settingKey === 'videoLibraryPath'
          ? 'Select Video Library Directory'
          : 'Select Master Library Directory'
```

## Why these anchors are safe

Every anchor above was copied verbatim from a full read of `Database.js` and `main.js` during planning (not reconstructed from memory), and each is a multi-line, distinctive snippet unlikely to collide with unrelated code. No line-number-based anchors are used per the repository's editing convention.
