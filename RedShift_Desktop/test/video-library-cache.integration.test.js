const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { initializeDatabase } = require('../src/main/services/Database.js');
const VideoLibraryCache = require('../src/main/services/VideoLibraryCache.js');

async function createHarness() {
  const appDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'redshift-video-library-'));
  const libraryPath = path.join(appDataPath, 'library');
  await fs.mkdir(libraryPath);
  const db = await initializeDatabase(path.join(appDataPath, 'test.db'));
  const manager = new EventEmitter();
  manager.db = db;
  manager.appDataPath = appDataPath;
  const cache = new VideoLibraryCache(manager);
  cache.extractDuration = async () => 0;

  return {
    appDataPath,
    libraryPath,
    cache,
    db,
    async close() {
      await new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve()));
      await fs.rm(appDataPath, { recursive: true, force: true });
    }
  };
}

test('creates the thumbnail migration and scans an empty library', async () => {
  const harness = await createHarness();
  try {
    const columns = await new Promise((resolve, reject) => {
      harness.db.all('PRAGMA table_info(videos)', (error, rows) => error ? reject(error) : resolve(rows));
    });
    assert.equal(columns.some((column) => column.name === 'thumbnail_path'), true);
    assert.equal(columns.some((column) => column.name === 'last_viewed_at'), true);
    assert.deepEqual(await harness.cache.scanVideoLibrary(harness.libraryPath), []);
  } finally {
    await harness.close();
  }
});

test('removes missing videos from the index after a rescan', async () => {
  const harness = await createHarness();
  const sourcePath = path.join(harness.libraryPath, 'removed.mp4');
  try {
    await fs.writeFile(sourcePath, 'not a real video');
    assert.equal((await harness.cache.scanVideoLibrary(harness.libraryPath)).length, 1);
    await fs.unlink(sourcePath);
    assert.deepEqual(await harness.cache.scanVideoLibrary(harness.libraryPath), []);
  } finally {
    await harness.close();
  }
});

test('resets stale playback and thumbnail state when a source changes', async () => {
  const harness = await createHarness();
  const sourcePath = path.join(harness.libraryPath, 'changed.mp4');
  try {
    await fs.writeFile(sourcePath, 'first revision');
    await harness.cache.scanVideoLibrary(harness.libraryPath);
    await harness.cache.updatePlaybackState(sourcePath, { positionSeconds: 42, watched: true });
    await harness.cache.runSql('UPDATE videos SET thumbnail_path = ? WHERE file_path = ?', ['/tmp/stale.jpg', sourcePath]);
    await fs.writeFile(sourcePath, 'second revision with more bytes');
    await fs.utimes(sourcePath, new Date(), new Date(Date.now() + 1000));

    const [rescanned] = await harness.cache.scanVideoLibrary(harness.libraryPath);
    assert.equal(rescanned.lastPositionSeconds, 0);
    assert.equal(rescanned.watched, false);
    assert.equal(rescanned.thumbnailPath, null);
  } finally {
    await harness.close();
  }
});

test('records a durable last-viewed timestamp only for playback positions', async () => {
  const harness = await createHarness();
  const sourcePath = path.join(harness.libraryPath, 'resume.mp4');
  try {
    await fs.writeFile(sourcePath, 'not a real video');
    await harness.cache.scanVideoLibrary(harness.libraryPath);
    await harness.cache.updatePlaybackState(sourcePath, { durationSeconds: 300, watched: false });
    let [video] = await harness.cache.getAllVideos();
    assert.equal(video.lastViewedAt, null);

    await harness.cache.updatePlaybackState(sourcePath, { positionSeconds: 45 });
    [video] = await harness.cache.getAllVideos();
    assert.equal(video.lastPositionSeconds, 45);
    assert.equal(Number.isInteger(video.lastViewedAt), true);
  } finally {
    await harness.close();
  }
});

test('imports colliding names without overwriting existing library media', async () => {
  const harness = await createHarness();
  const sourceDirectory = path.join(harness.appDataPath, 'imports');
  const sourcePath = path.join(sourceDirectory, 'clip.mp4');
  const existingPath = path.join(harness.libraryPath, 'clip.mp4');
  try {
    await fs.mkdir(sourceDirectory);
    await fs.writeFile(existingPath, 'existing library media');
    await fs.writeFile(sourcePath, 'incoming media');

    assert.equal(await harness.cache.importPaths([sourcePath], harness.libraryPath), 1);
    assert.equal(await fs.readFile(existingPath, 'utf8'), 'existing library media');
    assert.equal(await fs.readFile(path.join(harness.libraryPath, 'clip (1).mp4'), 'utf8'), 'incoming media');
    assert.equal(await harness.cache.importPaths([existingPath], harness.libraryPath), 0);
  } finally {
    await harness.close();
  }
});
