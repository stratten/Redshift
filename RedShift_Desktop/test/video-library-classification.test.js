const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const VideoLibraryCache = require('../src/main/services/VideoLibraryCache.js');

const { classifyVideo, parseEmbeddedMetadata } = VideoLibraryCache;

test('uses the TV Shows folder and show folder as the canonical series identity', () => {
  const relativePath = path.join(
    'TV Shows',
    'The West Wing',
    'The.West.Wing.S03.1080p.WEBRip.x265-RARBG',
    'The.West.Wing.S03E21.1080p.WEBRip.x265-RARBG.mkv'
  );
  const classification = classifyVideo(relativePath, path.basename(relativePath));

  assert.deepEqual(classification, {
    title: 'The West Wing S03E21 1080p WEBRip x265-RARBG',
    contentKind: 'tv',
    seriesTitle: 'The West Wing',
    seriesKey: 'the west wing',
    seasonNumber: 3,
    episodeStart: 21,
    episodeEnd: null,
    groupSource: 'folder'
  });
});

test('falls back to common 3x21 episode filenames outside a TV folder', () => {
  const classification = classifyVideo(
    path.join('Imports', 'Example.Show.3x21.Finally.Here.mp4'),
    'Example.Show.3x21.Finally.Here.mp4'
  );

  assert.equal(classification.contentKind, 'tv');
  assert.equal(classification.seriesTitle, 'Example Show');
  assert.equal(classification.seasonNumber, 3);
  assert.equal(classification.episodeStart, 21);
  assert.equal(classification.groupSource, 'filename');
});

test('uses embedded TV tags when there is no useful folder or episode filename', () => {
  const embeddedMetadata = parseEmbeddedMetadata({
    common: { title: 'Pilot' },
    native: {
      iTunes: [
        { id: 'tvsh', value: 'Example Show' },
        { id: 'tvsn', value: 2 },
        { id: 'tves', value: 4 },
        { id: 'stik', value: 10 }
      ]
    }
  });
  const classification = classifyVideo(path.join('Imports', 'pilot.mp4'), 'pilot.mp4', embeddedMetadata);

  assert.equal(classification.title, 'Pilot');
  assert.equal(classification.contentKind, 'tv');
  assert.equal(classification.seriesTitle, 'Example Show');
  assert.equal(classification.seriesKey, 'example show');
  assert.equal(classification.seasonNumber, 2);
  assert.equal(classification.episodeStart, 4);
  assert.equal(classification.groupSource, 'embedded');
});

test('keeps a movie-folder classification even when no embedded tags exist', () => {
  const classification = classifyVideo(path.join('Movies', 'Arrival.2016.mp4'), 'Arrival.2016.mp4');

  assert.equal(classification.contentKind, 'movie');
  assert.equal(classification.title, 'Arrival 2016');
  assert.equal(classification.seriesTitle, null);
  assert.equal(classification.groupSource, 'folder');
});
