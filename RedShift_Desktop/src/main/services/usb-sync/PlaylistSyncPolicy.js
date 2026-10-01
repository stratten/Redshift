// PlaylistSyncPolicy.js - Pure decision logic for bi-directional playlist sync.

const CHOICES = Object.freeze({
  KEEP_NEWEST: 'keep-newest',
  KEEP_ALL_UNIQUE: 'keep-all-unique',
  KEEP_DESKTOP: 'keep-desktop',
  KEEP_PHONE: 'keep-phone'
});

function uniqueInOrder(names) {
  const seen = new Set();
  const result = [];
  for (const name of names) {
    if (typeof name !== 'string' || name.length === 0 || seen.has(name)) continue;
    seen.add(name);
    result.push(name);
  }
  return result;
}

function sameTrackList(a, b) {
  return a.length === b.length && a.every((name, index) => name === b[index]);
}

function decidePlaylistSync(local, device, baseline) {
  if (!device) return { action: 'keep-local', desktopChanged: true, deviceChanged: false };
  if (!local) return { action: 'import-device', desktopChanged: false, deviceChanged: true };
  if (sameTrackList(local.tracks, device.tracks)) {
    return { action: 'noop', desktopChanged: false, deviceChanged: false };
  }
  if (baseline && Number.isFinite(baseline.modified)) {
    const desktopChanged = local.modified > baseline.modified;
    const deviceChanged = device.modified > baseline.modified;
    if (desktopChanged && deviceChanged) return { action: 'conflict', desktopChanged, deviceChanged };
    if (deviceChanged) return { action: 'take-device', desktopChanged, deviceChanged };
    return { action: 'keep-local', desktopChanged, deviceChanged };
  }
  if (device.tracks.length === 0) return { action: 'keep-local', desktopChanged: true, deviceChanged: false };
  if (local.tracks.length === 0) return { action: 'take-device', desktopChanged: false, deviceChanged: true };
  return { action: 'conflict', desktopChanged: true, deviceChanged: true };
}

function resolveConflict(choice, local, device) {
  switch (choice) {
    case CHOICES.KEEP_DESKTOP:
      return { tracks: local.tracks.slice(), source: 'desktop' };
    case CHOICES.KEEP_PHONE:
      return { tracks: device.tracks.slice(), source: 'device' };
    case CHOICES.KEEP_ALL_UNIQUE:
      return { tracks: uniqueInOrder([...local.tracks, ...device.tracks]), source: 'merged' };
    case CHOICES.KEEP_NEWEST:
    default:
      return device.modified > local.modified
        ? { tracks: device.tracks.slice(), source: 'device' }
        : { tracks: local.tracks.slice(), source: 'desktop' };
  }
}

function resultingModified({ source, local, device, nowSeconds }) {
  if (source === 'device') return device.modified;
  if (source === 'merged') return Math.max(nowSeconds, local.modified + 1, device.modified + 1);
  if (device && local.modified <= device.modified) return Math.max(nowSeconds, device.modified + 1);
  return local.modified;
}

function normalizePlaylistJSON(raw) {
  if (!raw || typeof raw.name !== 'string' || raw.name.trim().length === 0) return null;
  const modified = Number(raw.modifiedDate);
  const created = Number(raw.createdDate);
  return {
    name: raw.name,
    tracks: Array.isArray(raw.tracks) ? uniqueInOrder(raw.tracks) : [],
    modified: Number.isFinite(modified) ? Math.floor(modified) : 0,
    created: Number.isFinite(created) ? Math.floor(created) : 0
  };
}

module.exports = {
  CHOICES,
  uniqueInOrder,
  sameTrackList,
  decidePlaylistSync,
  resolveConflict,
  resultingModified,
  normalizePlaylistJSON
};
