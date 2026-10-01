const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CHOICES,
  uniqueInOrder,
  sameTrackList,
  decidePlaylistSync,
  resolveConflict,
  resultingModified,
  normalizePlaylistJSON
} = require('../src/main/services/usb-sync/PlaylistSyncPolicy.js');

const side = (modified, tracks) => ({ modified, tracks });

test('uniqueInOrder keeps first occurrences and drops invalid names', () => {
  assert.deepEqual(uniqueInOrder(['a.mp3', 'b.mp3', 'a.mp3', '', null, 7, 'c.mp3']), ['a.mp3', 'b.mp3', 'c.mp3']);
});

test('sameTrackList is order-sensitive', () => {
  assert.equal(sameTrackList(['a', 'b'], ['a', 'b']), true);
  assert.equal(sameTrackList(['a', 'b'], ['b', 'a']), false);
});

test('identical track lists are a noop even when stamps differ', () => {
  assert.equal(decidePlaylistSync(side(100, ['a']), side(900, ['a']), { modified: 50 }).action, 'noop');
});

test('playlist only on the phone is imported', () => {
  assert.equal(decidePlaylistSync(null, side(10, ['a']), null).action, 'import-device');
});

test('only the phone changed since the last sync: phone wins without a prompt', () => {
  const decision = decidePlaylistSync(side(100, ['a']), side(300, ['a', 'b']), { modified: 100 });
  assert.equal(decision.action, 'take-device');
  assert.equal(decision.desktopChanged, false);
  assert.equal(decision.deviceChanged, true);
});

test('only the desktop changed since the last sync: desktop wins without a prompt', () => {
  assert.equal(decidePlaylistSync(side(300, ['a', 'c']), side(100, ['a']), { modified: 100 }).action, 'keep-local');
});

test('both sides changed since the last sync: conflict', () => {
  const decision = decidePlaylistSync(side(200, ['a', 'c']), side(250, ['a', 'b']), { modified: 100 });
  assert.equal(decision.action, 'conflict');
  assert.equal(decision.desktopChanged, true);
  assert.equal(decision.deviceChanged, true);
});

test('no baseline: an empty phone copy never wipes desktop tracks', () => {
  assert.equal(decidePlaylistSync(side(100, ['a', 'b']), side(999, []), null).action, 'keep-local');
});

test('no baseline: an empty desktop copy takes phone tracks', () => {
  assert.equal(decidePlaylistSync(side(100, []), side(50, ['a']), null).action, 'take-device');
});

test('no baseline and both non-empty different lists is a conflict', () => {
  assert.equal(decidePlaylistSync(side(100, ['a']), side(50, ['b']), null).action, 'conflict');
});

test('keep-newest picks newer stamp and gives ties to desktop', () => {
  assert.deepEqual(resolveConflict(CHOICES.KEEP_NEWEST, side(100, ['a']), side(200, ['b'])), { tracks: ['b'], source: 'device' });
  assert.deepEqual(resolveConflict(CHOICES.KEEP_NEWEST, side(200, ['a']), side(200, ['b'])), { tracks: ['a'], source: 'desktop' });
});

test('keep-all-unique preserves desktop order before phone-only tracks', () => {
  const result = resolveConflict(CHOICES.KEEP_ALL_UNIQUE, side(1, ['a', 'b', 'c']), side(2, ['d', 'b', 'e']));
  assert.deepEqual(result, { tracks: ['a', 'b', 'c', 'd', 'e'], source: 'merged' });
});

test('explicit keep-desktop and keep-phone resolutions copy their lists', () => {
  const local = side(1, ['a']);
  const device = side(2, ['b']);
  const desktop = resolveConflict(CHOICES.KEEP_DESKTOP, local, device);
  const phone = resolveConflict(CHOICES.KEEP_PHONE, local, device);
  assert.deepEqual(desktop, { tracks: ['a'], source: 'desktop' });
  assert.deepEqual(phone, { tracks: ['b'], source: 'device' });
  desktop.tracks.push('mutated');
  assert.deepEqual(local.tracks, ['a']);
});

test('resultingModified preserves phone stamps and advances desktop authored values', () => {
  assert.equal(resultingModified({ source: 'device', local: side(10, []), device: side(20, []), nowSeconds: 5 }), 20);
  assert.equal(resultingModified({ source: 'merged', local: side(100, []), device: side(500, []), nowSeconds: 50 }), 501);
  assert.equal(resultingModified({ source: 'desktop', local: side(100, []), device: side(400, []), nowSeconds: 50 }), 401);
  assert.equal(resultingModified({ source: 'desktop', local: side(700, []), device: side(400, []), nowSeconds: 50 }), 700);
});

test('normalizePlaylistJSON floors stamps and deduplicates tracks', () => {
  assert.deepEqual(
    normalizePlaylistJSON({ name: 'Feel', tracks: ['a.mp3', 'a.mp3', 'b.mp3'], createdDate: 10.9, modifiedDate: 1763312307.75 }),
    { name: 'Feel', tracks: ['a.mp3', 'b.mp3'], modified: 1763312307, created: 10 }
  );
});

test('normalizePlaylistJSON rejects blank names and tolerates malformed fields', () => {
  assert.equal(normalizePlaylistJSON(null), null);
  assert.equal(normalizePlaylistJSON({ name: '   ', tracks: [] }), null);
  assert.deepEqual(normalizePlaylistJSON({ name: 'Ünïcødé & "Quotes" 🎵', tracks: 'not-an-array', modifiedDate: 'soon' }), {
    name: 'Ünïcødé & "Quotes" 🎵',
    tracks: [],
    modified: 0,
    created: 0
  });
});

test('normalizePlaylistJSON handles long track lists', () => {
  const tracks = Array.from({ length: 5000 }, (_, index) => `${index}.mp3`);
  assert.equal(normalizePlaylistJSON({ name: 'Big', tracks, modifiedDate: 1 }).tracks.length, 5000);
});
