# 07c — Desktop Store and Merge Integration Tests

Registered by Edit 4.3. The harness follows `test/video-library-cache.integration.test.js`: a real `initializeDatabase` against a temp directory, so the `playlist_sync_state` table from Edit 4.1 is exercised for real. No device, no Python and no Electron are needed. The conflict prompt is injected, and `pulledPlaylists` is set directly, standing in for a successful pull.

## New file: `RedShift_Desktop/test/playlist-sync-store.integration.test.js`

Complete content:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { initializeDatabase } = require('../src/main/services/Database.js');
const PlaylistService = require('../src/main/services/PlaylistService.js');
const PlaylistSyncStore = require('../src/main/services/usb-sync/PlaylistSyncStore.js');
const PlaylistSyncManager = require('../src/main/services/usb-sync/PlaylistSyncManager.js');
const { CHOICES } = require('../src/main/services/usb-sync/PlaylistSyncPolicy.js');

async function createHarness({ choice = CHOICES.KEEP_NEWEST } = {}) {
  const appDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'redshift-playlist-sync-'));
  const db = await initializeDatabase(path.join(appDataPath, 'test.db'));
  const playlistService = new PlaylistService(db, null, null);
  const store = new PlaylistSyncStore(db, playlistService);
  const prompts = [];
  const manager = new PlaylistSyncManager(null, playlistService, () => null, {
    syncStore: store,
    promptConflict: async (details) => {
      prompts.push(details);
      return choice;
    }
  });
  for (const name of ['a.mp3', 'b.mp3', 'c.mp3', 'd.mp3']) {
    await store.run('INSERT INTO songs (file_path, file_name) VALUES (?, ?)', [`/library/${name}`, name]);
  }
  await store.run('INSERT INTO songs (file_path, file_name) VALUES (?, ?)', ['/library/X/xa.mp3', 'xa.mp3']);

  return {
    db,
    store,
    manager,
    prompts,
    playlistService,
    async createPlaylist(name, filenames, modified) {
      const playlist = await playlistService.createPlaylist(name, '', false);
      await store.replacePlaylistTracks(playlist.id, filenames, modified);
      return playlist;
    },
    async playlistByName(name) {
      return store.get('SELECT * FROM playlists WHERE lower(name) = lower(?)', [name]);
    },
    async close() {
      await new Promise((resolve, reject) => db.close((error) => (error ? reject(error) : resolve())));
      await fs.rm(appDataPath, { recursive: true, force: true });
    }
  };
}

test('replacePlaylistTracks resolves exact filenames in order and reports missing ones', async () => {
  const harness = await createHarness();
  try {
    const playlist = await harness.playlistService.createPlaylist('Feel', '', false);
    const result = await harness.store.replacePlaylistTracks(playlist.id, ['c.mp3', 'missing.mp3', 'a.mp3', 'a.mp3'], 1234);
    assert.deepEqual(result, { resolved: 3, missing: ['missing.mp3'] });
    assert.deepEqual(await harness.store.getPlaylistFilenames(playlist.id), ['c.mp3', 'a.mp3', 'a.mp3']);
    const row = await harness.playlistByName('Feel');
    assert.equal(row.track_count, 3);
    assert.equal(row.modified_date, 1234);
  } finally {
    await harness.close();
  }
});

test('exact basename matching never falls back to a suffix match', async () => {
  const harness = await createHarness();
  try {
    assert.equal(await harness.store.findLibraryPathForFilename('a.mp3'), '/library/a.mp3');
    assert.equal(await harness.store.findLibraryPathForFilename('xa.mp3'), '/library/X/xa.mp3');
    assert.equal(await harness.store.findLibraryPathForFilename('.mp3'), null);
    assert.equal(await harness.store.findLibraryPathForFilename("it's %_.mp3"), null);
  } finally {
    await harness.close();
  }
});

test('a failed insert rolls back and leaves the previous tracks intact', async () => {
  const harness = await createHarness();
  try {
    const playlist = await harness.createPlaylist('Move', ['a.mp3', 'b.mp3'], 100);
    await harness.store.run(`
      CREATE TRIGGER fail_c_insert BEFORE INSERT ON playlist_tracks
      WHEN NEW.file_path = '/library/c.mp3'
      BEGIN SELECT RAISE(ABORT, 'injected failure'); END
    `);
    await assert.rejects(harness.store.replacePlaylistTracks(playlist.id, ['d.mp3', 'c.mp3'], 200), /injected failure/);
    assert.deepEqual(await harness.store.getPlaylistFilenames(playlist.id), ['a.mp3', 'b.mp3']);
    assert.equal((await harness.playlistByName('Move')).modified_date, 100);
    await harness.store.run('DROP TRIGGER fail_c_insert');
    await harness.store.replacePlaylistTracks(playlist.id, ['d.mp3'], 300);
    assert.deepEqual(await harness.store.getPlaylistFilenames(playlist.id), ['d.mp3']);
  } finally {
    await harness.close();
  }
});

test('baselines are keyed case-insensitively and overwritten on the next sync', async () => {
  const harness = await createHarness();
  try {
    await harness.store.recordBaselines([{ name: 'Feel', modified: 100 }, { name: 'MOVE', modified: 7 }]);
    await harness.store.recordBaselines([{ name: 'feel', modified: 250 }]);
    const baselines = await harness.store.getBaselines();
    assert.deepEqual(baselines.get('feel'), { modified: 250 });
    assert.deepEqual(baselines.get('move'), { modified: 7 });
    assert.equal(baselines.size, 2);
  } finally {
    await harness.close();
  }
});

test('phone-only edit since the last sync is taken without a prompt', async () => {
  const harness = await createHarness();
  try {
    const playlist = await harness.createPlaylist('Feel', ['a.mp3'], 100);
    await harness.store.recordBaselines([{ name: 'Feel', modified: 100 }]);
    harness.manager.pulledPlaylists = [{ name: 'Feel', tracks: ['a.mp3', 'b.mp3'], createdDate: 1, modifiedDate: 400.6 }];
    const counts = await harness.manager.mergePlaylistsWithConflictResolution();
    assert.equal(counts.tookDevice, 1);
    assert.equal(harness.prompts.length, 0);
    assert.deepEqual(await harness.store.getPlaylistFilenames(playlist.id), ['a.mp3', 'b.mp3']);
    assert.equal((await harness.playlistByName('Feel')).modified_date, 400);
    assert.equal(harness.manager.pulledPlaylists, null);
  } finally {
    await harness.close();
  }
});

test('desktop-only edit keeps the desktop tracks without a prompt', async () => {
  const harness = await createHarness();
  try {
    const playlist = await harness.createPlaylist('Feel', ['a.mp3', 'c.mp3'], 500);
    await harness.store.recordBaselines([{ name: 'Feel', modified: 100 }]);
    harness.manager.pulledPlaylists = [{ name: 'feel', tracks: ['a.mp3'], createdDate: 1, modifiedDate: 100 }];
    const counts = await harness.manager.mergePlaylistsWithConflictResolution();
    assert.equal(counts.keptDesktop, 1);
    assert.equal(harness.prompts.length, 0);
    assert.deepEqual(await harness.store.getPlaylistFilenames(playlist.id), ['a.mp3', 'c.mp3']);
    assert.equal((await harness.playlistByName('Feel')).modified_date, 500);
  } finally {
    await harness.close();
  }
});

test('both sides edited: prompt once and apply keep-all-unique', async () => {
  const harness = await createHarness({ choice: CHOICES.KEEP_ALL_UNIQUE });
  try {
    const playlist = await harness.createPlaylist('Feel', ['a.mp3', 'c.mp3'], 300);
    await harness.store.recordBaselines([{ name: 'Feel', modified: 100 }]);
    harness.manager.pulledPlaylists = [{ name: 'Feel', tracks: ['d.mp3', 'a.mp3'], createdDate: 1, modifiedDate: 900 }];
    const counts = await harness.manager.mergePlaylistsWithConflictResolution();
    assert.equal(counts.merged, 1);
    assert.equal(harness.prompts.length, 1);
    assert.equal(harness.prompts[0].name, 'Feel');
    assert.deepEqual(harness.prompts[0].local.tracks, ['a.mp3', 'c.mp3']);
    assert.deepEqual(harness.prompts[0].device.tracks, ['d.mp3', 'a.mp3']);
    assert.deepEqual(await harness.store.getPlaylistFilenames(playlist.id), ['a.mp3', 'c.mp3', 'd.mp3']);
    assert.ok((await harness.playlistByName('Feel')).modified_date >= 901);
  } finally {
    await harness.close();
  }
});

test('an emptied phone copy with no baseline keeps desktop tracks and outdates the phone copy', async () => {
  const harness = await createHarness();
  try {
    const playlist = await harness.createPlaylist('Feel', ['a.mp3', 'b.mp3', 'c.mp3'], 100);
    const phoneStamp = Math.floor(Date.now() / 1000) + 3600;
    harness.manager.pulledPlaylists = [{ name: 'Feel', tracks: [], createdDate: 1, modifiedDate: phoneStamp }];
    await harness.manager.mergePlaylistsWithConflictResolution();
    assert.equal(harness.prompts.length, 0);
    assert.deepEqual(await harness.store.getPlaylistFilenames(playlist.id), ['a.mp3', 'b.mp3', 'c.mp3']);
    assert.equal((await harness.playlistByName('Feel')).modified_date, phoneStamp + 1);
  } finally {
    await harness.close();
  }
});

test('a playlist created on the phone is imported with its stamps', async () => {
  const harness = await createHarness();
  try {
    harness.manager.pulledPlaylists = [{ name: 'Road Trip', tracks: ['b.mp3', 'nope.mp3', 'a.mp3'], createdDate: 50, modifiedDate: 60 }];
    const counts = await harness.manager.mergePlaylistsWithConflictResolution();
    assert.equal(counts.imported, 1);
    const row = await harness.playlistByName('Road Trip');
    assert.equal(row.created_date, 50);
    assert.equal(row.modified_date, 60);
    assert.equal(row.sync_to_doppler, 0);
    assert.deepEqual(await harness.store.getPlaylistFilenames(row.id), ['b.mp3', 'a.mp3']);
  } finally {
    await harness.close();
  }
});

test('merge refuses to run without a successful pull', async () => {
  const harness = await createHarness();
  try {
    await assert.rejects(harness.manager.mergePlaylistsWithConflictResolution(), /requires a successful pull/);
  } finally {
    await harness.close();
  }
});

test('pull throws when the device is not connected and leaves nothing to merge', async () => {
  const harness = await createHarness();
  try {
    await assert.rejects(harness.manager.pullPlaylistsFromDevice('12345'), /not found/);
    assert.equal(harness.manager.pulledPlaylists, null);
  } finally {
    await harness.close();
  }
});

test('malformed and nameless phone files are skipped without blocking valid ones', async () => {
  const harness = await createHarness();
  try {
    harness.manager.pulledPlaylists = [null, { tracks: ['a.mp3'] }, { name: 'Good', tracks: ['c.mp3'], modifiedDate: 5 }];
    const counts = await harness.manager.mergePlaylistsWithConflictResolution();
    assert.equal(counts.skipped, 2);
    assert.equal(counts.imported, 1);
    assert.ok(await harness.playlistByName('Good'));
  } finally {
    await harness.close();
  }
});

test('duplicate case-variant files for one playlist import it only once', async () => {
  const harness = await createHarness();
  try {
    harness.manager.pulledPlaylists = [
      { name: 'Chill', tracks: ['a.mp3'], modifiedDate: 10 },
      { name: 'chill', tracks: ['a.mp3'], modifiedDate: 10 }
    ];
    const counts = await harness.manager.mergePlaylistsWithConflictResolution();
    assert.equal(counts.imported, 1);
    assert.equal(counts.unchanged, 1);
    const rows = await harness.store.all("SELECT id FROM playlists WHERE lower(name) = 'chill'");
    assert.equal(rows.length, 1);
  } finally {
    await harness.close();
  }
});
```

Traces confirming the expectations against 04 and 05:

- Keep-all-unique test: local `['a','c']` merged with device `['d','a']` gives `['a','c','d']`. `resultingModified(merged)` is `max(now, 301, 901)`, which is at least 901.
- Emptied-phone test: there is no baseline and the device list is empty, so the result is `keep-local`. `resultingModified(desktop)` has local 100 ≤ device `phoneStamp`, so it returns `max(now, phoneStamp + 1)`. `phoneStamp` is an hour ahead of now, so the result is `phoneStamp + 1`.
- Duplicate case-variant test: the first file imports `Chill` and adds it to `localByKey` with its id. The second file's `getPlaylistFilenames(id)` returns `['a.mp3']`, which is the same list, so the result is `noop`, counted as `unchanged`.
- Nameless-files test: both `null` and `{ tracks }` make `normalizePlaylistJSON` return `null`, and each one increments `skipped`.
- First test: four names are requested and one is missing, so `resolved` is 3, which includes the duplicate `a.mp3`. The desktop allows duplicates in playlists and `replacePlaylistTracks` preserves them. The `normalizePlaylistJSON` dedupe applies only to pulled phone files.
- Pull test: `getConnectedDeviceByDeviceId` returns `null`, so the method throws `Device 12345 not found or UDID not available` before any Python runs.
