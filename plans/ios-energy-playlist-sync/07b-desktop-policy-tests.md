# 07b — Desktop Policy Unit Tests

Discovery: `node --test` runs only the files listed in `package.json` `"test"` (Edit 4.3 registers this file). Command: `cd RedShift_Desktop && npm test`.

## New file: `RedShift_Desktop/test/playlist-sync-policy.test.js`

Complete content:

```js
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

test('uniqueInOrder keeps first occurrences and drops non-strings and empties', () => {
  assert.deepEqual(uniqueInOrder(['a.mp3', 'b.mp3', 'a.mp3', '', null, 7, 'c.mp3']), ['a.mp3', 'b.mp3', 'c.mp3']);
  assert.deepEqual(uniqueInOrder([]), []);
});

test('sameTrackList is order sensitive', () => {
  assert.equal(sameTrackList(['a', 'b'], ['a', 'b']), true);
  assert.equal(sameTrackList(['a', 'b'], ['b', 'a']), false);
  assert.equal(sameTrackList(['a'], ['a', 'b']), false);
});

test('identical track lists are a noop even when stamps differ', () => {
  const decision = decidePlaylistSync(side(100, ['a']), side(900, ['a']), { modified: 50 });
  assert.equal(decision.action, 'noop');
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
  const decision = decidePlaylistSync(side(300, ['a', 'c']), side(100, ['a']), { modified: 100 });
  assert.equal(decision.action, 'keep-local');
});

test('both changed since the last sync: conflict', () => {
  const decision = decidePlaylistSync(side(200, ['a', 'c']), side(250, ['a', 'b']), { modified: 100 });
  assert.equal(decision.action, 'conflict');
  assert.equal(decision.desktopChanged, true);
  assert.equal(decision.deviceChanged, true);
});

test('neither side newer than the baseline but lists differ: desktop copy is pushed', () => {
  assert.equal(decidePlaylistSync(side(100, ['a']), side(100, ['b']), { modified: 100 }).action, 'keep-local');
});

test('no baseline: an empty phone copy never wipes desktop tracks', () => {
  assert.equal(decidePlaylistSync(side(100, ['a', 'b']), side(999, []), null).action, 'keep-local');
});

test('no baseline: an empty desktop copy takes the phone tracks', () => {
  assert.equal(decidePlaylistSync(side(100, []), side(50, ['a']), null).action, 'take-device');
});

test('no baseline and both non-empty and different: conflict', () => {
  assert.equal(decidePlaylistSync(side(100, ['a']), side(50, ['b']), null).action, 'conflict');
});

test('a non-finite baseline is treated as missing', () => {
  assert.equal(decidePlaylistSync(side(100, ['a']), side(50, []), { modified: NaN }).action, 'keep-local');
});

test('resolveConflict keep-newest picks the later stamp and gives ties to the desktop', () => {
  assert.deepEqual(resolveConflict(CHOICES.KEEP_NEWEST, side(100, ['a']), side(200, ['b'])), { tracks: ['b'], source: 'device' });
  assert.deepEqual(resolveConflict(CHOICES.KEEP_NEWEST, side(200, ['a']), side(200, ['b'])), { tracks: ['a'], source: 'desktop' });
});

test('resolveConflict keep-all-unique keeps desktop order then appends phone-only tracks', () => {
  const result = resolveConflict(CHOICES.KEEP_ALL_UNIQUE, side(1, ['a', 'b', 'c']), side(2, ['d', 'b', 'e']));
  assert.deepEqual(result, { tracks: ['a', 'b', 'c', 'd', 'e'], source: 'merged' });
});

test('resolveConflict keep-desktop and keep-phone copy the chosen side', () => {
  const local = side(1, ['a']);
  const device = side(2, ['b']);
  const desktop = resolveConflict(CHOICES.KEEP_DESKTOP, local, device);
  const phone = resolveConflict(CHOICES.KEEP_PHONE, local, device);
  assert.deepEqual(desktop, { tracks: ['a'], source: 'desktop' });
  assert.deepEqual(phone, { tracks: ['b'], source: 'device' });
  desktop.tracks.push('mutated');
  assert.deepEqual(local.tracks, ['a']);
});

test('resolveConflict treats an unknown choice as keep-newest', () => {
  assert.equal(resolveConflict('closed-dialog', side(5, ['a']), side(9, ['b'])).source, 'device');
});

test('resultingModified: device source keeps the device stamp', () => {
  assert.equal(resultingModified({ source: 'device', local: side(10, []), device: side(20, []), nowSeconds: 5 }), 20);
});

test('resultingModified: merged result is newer than both copies even with a slow desktop clock', () => {
  assert.equal(resultingModified({ source: 'merged', local: side(100, []), device: side(500, []), nowSeconds: 50 }), 501);
  assert.equal(resultingModified({ source: 'merged', local: side(100, []), device: side(200, []), nowSeconds: 1000 }), 1000);
});

test('resultingModified: desktop result is bumped past the phone copy only when needed', () => {
  assert.equal(resultingModified({ source: 'desktop', local: side(100, []), device: side(400, []), nowSeconds: 50 }), 401);
  assert.equal(resultingModified({ source: 'desktop', local: side(100, []), device: side(100, []), nowSeconds: 300 }), 300);
  assert.equal(resultingModified({ source: 'desktop', local: side(700, []), device: side(400, []), nowSeconds: 50 }), 700);
});

test('normalizePlaylistJSON floors fractional phone stamps and dedupes tracks', () => {
  const normalized = normalizePlaylistJSON({ name: 'Feel', tracks: ['a.mp3', 'a.mp3', 'b.mp3'], createdDate: 10.9, modifiedDate: 1763312307.75 });
  assert.deepEqual(normalized, { name: 'Feel', tracks: ['a.mp3', 'b.mp3'], modified: 1763312307, created: 10 });
});

test('normalizePlaylistJSON rejects missing or blank names and tolerates bad fields', () => {
  assert.equal(normalizePlaylistJSON(null), null);
  assert.equal(normalizePlaylistJSON({ name: '   ', tracks: [] }), null);
  assert.equal(normalizePlaylistJSON({ tracks: ['a'] }), null);
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
```

Checks traced against `PlaylistSyncPolicy.js` (04):

- `'   '` fails `raw.name.trim().length === 0`, so it returns `null`.
- The object without `name` fails `typeof raw.name !== 'string'`.
- For `modifiedDate: 'soon'`, `Number('soon')` is `NaN`, which is not finite, so `modified` is `0`.
- A missing `createdDate` gives `Number(undefined)`, which is `NaN`, so `created` is `0`.
- In the tie case, `device.modified > local.modified` is `200 > 200`, which is false, so the desktop wins.
- In the non-finite baseline case, the device list is empty, so the no-baseline branch returns `keep-local`.
