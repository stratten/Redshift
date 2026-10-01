const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const ffmpegPath = require('ffmpeg-static');
const VideoCompatibilityService = require('../src/main/services/VideoCompatibilityService.js');
const VideoThumbnailService = require('../src/main/services/VideoThumbnailService.js');

const execFileAsync = promisify(execFile);

async function createHarness() {
  const appDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'redshift-video-compatibility-'));
  const manager = new EventEmitter();
  manager.appDataPath = appDataPath;
  return {
    appDataPath,
    manager,
    async close() {
      await fs.rm(appDataPath, { recursive: true, force: true });
    }
  };
}

test('identifies browser-compatible and incompatible audio codecs', () => {
  assert.equal(VideoCompatibilityService.isBrowserAudioCompatible('aac'), true);
  assert.equal(VideoCompatibilityService.isBrowserAudioCompatible('opus'), true);
  assert.equal(VideoCompatibilityService.isBrowserAudioCompatible('eac3'), false);
  assert.equal(VideoCompatibilityService.isBrowserAudioCompatible('dts'), false);
});

test('converts FFmpeg timestamps into bounded progress percentages', () => {
  assert.deepEqual(
    VideoCompatibilityService.parseProgressLine('out_time=00:10:00.500', 1200),
    { percent: 50, seconds: 600.5, durationSeconds: 1200 }
  );
  assert.equal(VideoCompatibilityService.parseProgressLine('progress=continue', 1200), null);
  assert.equal(VideoCompatibilityService.parseProgressLine('out_time=invalid', 1200), null);
});

test('selects an early, non-zero timestamp for fallback thumbnails', () => {
  assert.equal(VideoThumbnailService.thumbnailTimestamp(20), 3);
  assert.equal(VideoThumbnailService.thumbnailTimestamp(600), 45);
  assert.equal(VideoThumbnailService.thumbnailTimestamp(900), 45);
  assert.equal(VideoThumbnailService.thumbnailTimestamp(1), 0.75);
  assert.equal(VideoThumbnailService.thumbnailTimestamp(0), 5);
});

test('caches fallback thumbnails by source revision', async () => {
  const harness = await createHarness();
  const sourcePath = path.join(harness.appDataPath, 'source.mkv');
  await fs.writeFile(sourcePath, 'source');
  let captureCalls = 0;
  const service = new VideoThumbnailService(harness.manager, {
    captureFrame: async (source, destination) => {
      captureCalls += 1;
      await fs.writeFile(destination, `thumbnail for ${await fs.readFile(source, 'utf8')}`);
    }
  });
  const initialFile = { path: sourcePath, size: 6, modified: 100 };

  try {
    await service.initialize();
    const first = await service.createThumbnail(initialFile, 600);
    const cached = await service.createThumbnail(initialFile, 600);
    const changed = await service.createThumbnail({ ...initialFile, size: 7, modified: 101 }, 600);

    assert.equal(first, cached);
    assert.notEqual(changed, first);
    assert.equal(captureCalls, 2);
    assert.equal(await fs.readFile(first, 'utf8'), 'thumbnail for source');
  } finally {
    await harness.close();
  }
});

test('creates a real AAC-compatible copy and JPEG fallback frame', async () => {
  const harness = await createHarness();
  const sourcePath = path.join(harness.appDataPath, 'source-eac3.mkv');
  const compatibilityService = new VideoCompatibilityService(harness.manager);
  const thumbnailService = new VideoThumbnailService(harness.manager);
  try {
    await execFileAsync(ffmpegPath, [
      '-y',
      '-f', 'lavfi',
      '-i', 'testsrc2=size=320x180:rate=24',
      '-f', 'lavfi',
      '-i', 'sine=frequency=440:sample_rate=48000',
      '-t', '1',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'eac3',
      sourcePath
    ]);
    await compatibilityService.initialize();
    await thumbnailService.initialize();

    const prepared = await compatibilityService.preparePlaybackSource(sourcePath);
    const copiedMetadata = await compatibilityService.probeWithFfprobe(prepared.playbackPath);
    const sourceStats = await fs.stat(sourcePath);
    const thumbnailPath = await thumbnailService.createThumbnail({
      path: sourcePath,
      size: sourceStats.size,
      modified: Math.floor(sourceStats.mtimeMs / 1000)
    }, 1);

    assert.equal(prepared.transcoded, true);
    assert.equal(copiedMetadata.streams.find((stream) => stream.codec_type === 'audio').codec_name, 'aac');
    assert.equal((await fs.stat(thumbnailPath)).size > 0, true);
  } finally {
    await harness.close();
  }
});

test('rejects malformed media before playback preparation', async () => {
  const harness = await createHarness();
  const sourcePath = path.join(harness.appDataPath, 'malformed.mkv');
  const service = new VideoCompatibilityService(harness.manager);
  try {
    await fs.writeFile(sourcePath, 'not a media container');
    await service.initialize();
    await assert.rejects(service.preparePlaybackSource(sourcePath));
  } finally {
    await harness.close();
  }
});

test('returns compatible sources directly without creating a cache copy', async () => {
  const harness = await createHarness();
  const sourcePath = path.join(harness.appDataPath, 'source.mp4');
  await fs.writeFile(sourcePath, 'source');
  let transcodeCalls = 0;
  const service = new VideoCompatibilityService(harness.manager, {
    probeFile: async () => ({ streams: [{ codec_type: 'audio', codec_name: 'aac' }] }),
    transcodeFile: async () => { transcodeCalls += 1; }
  });

  try {
    await service.initialize();
    const prepared = await service.preparePlaybackSource(sourcePath);
    assert.deepEqual(prepared, { playbackPath: sourcePath, transcoded: false, audioCodec: 'aac' });
    assert.equal(transcodeCalls, 0);
  } finally {
    await harness.close();
  }
});

test('caches an AAC-compatible copy for unsupported audio until the source changes', async () => {
  const harness = await createHarness();
  const sourcePath = path.join(harness.appDataPath, 'source.mkv');
  await fs.writeFile(sourcePath, 'first source revision');
  let transcodeCalls = 0;
  const progressEvents = [];
  harness.manager.on('video-compatibility-progress', (event) => progressEvents.push(event));
  const service = new VideoCompatibilityService(harness.manager, {
    probeFile: async () => ({
      streams: [
        { codec_type: 'video', codec_name: 'hevc' },
        { codec_type: 'audio', codec_name: 'eac3' }
      ]
    }),
    transcodeFile: async (source, destination, mediaInfo, onProgress) => {
      transcodeCalls += 1;
      onProgress({ percent: 50, seconds: 30, durationSeconds: 60 });
      await fs.writeFile(destination, `compatible copy of ${await fs.readFile(source, 'utf8')}`);
    }
  });

  try {
    await service.initialize();
    const [first, concurrent] = await Promise.all([
      service.preparePlaybackSource(sourcePath),
      service.preparePlaybackSource(sourcePath)
    ]);
    const cached = await service.preparePlaybackSource(sourcePath);
    assert.equal(first.transcoded, true);
    assert.equal(first.audioCodec, 'eac3');
    assert.equal(concurrent.playbackPath, first.playbackPath);
    assert.equal(cached.playbackPath, first.playbackPath);
    assert.equal(transcodeCalls, 1);
    assert.equal(progressEvents[0].percent, 50);
    assert.equal(await fs.readFile(first.playbackPath, 'utf8'), 'compatible copy of first source revision');

    await fs.writeFile(sourcePath, 'second source revision');
    await fs.utimes(sourcePath, new Date(), new Date(Date.now() + 1000));
    const changed = await service.preparePlaybackSource(sourcePath);
    assert.notEqual(changed.playbackPath, first.playbackPath);
    assert.equal(transcodeCalls, 2);
  } finally {
    await harness.close();
  }
});
