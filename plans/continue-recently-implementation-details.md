# Continue Watching and Recently Added — Implementation Details

## Settled decisions

- Do not add toolbar filters. In the `All` Videos view, render `Continue Watching` and `Recently Added` rails above the existing TV Shows, Movies, and Other Files sections.
- Do not render either rail during a text search, category-filtered view, or series drill-down. This preserves the current search/category context and prevents duplicate scoped results.
- Continue Watching contains individual unwatched videos with `last_position_seconds > 0`, ordered by a new durable `last_viewed_at` descending timestamp and limited to 12 entries.
- Recently Added contains individual videos ordered by immutable `added_date` descending and limited to 12 entries.
- `last_viewed_at` changes only when a playback position checkpoint is persisted. Metadata probing, rescans, duration enrichment, thumbnail enrichment, and video-source file updates must not alter it.
- Continue Watching and Recently Added reuse `renderVideos`, so Cards/List mode, existing artwork fallback, progress bars, keyboard activation, search behavior, and player opening stay unchanged.

## Apply order

1. Migrate and index durable `last_viewed_at`.
2. Expose `addedAt` and `lastViewedAt` in cached video records and update `last_viewed_at` for position checkpoints.
3. Add the two All-view rails and optimistic renderer state updates.
4. Add SQLite/cache regression tests, run repository verification, then update the roadmap progress row.

## Exact edits

### `RedShift_Desktop/src/main/services/Database.js`

Unique anchor:

```javascript
      thumbnail_path TEXT,
      last_position_seconds INTEGER DEFAULT 0,
      watched INTEGER DEFAULT 0,
      added_date INTEGER DEFAULT (strftime('%s', 'now')),
```

Replacement:

```javascript
      thumbnail_path TEXT,
      last_position_seconds INTEGER DEFAULT 0,
      last_viewed_at INTEGER,
      watched INTEGER DEFAULT 0,
      added_date INTEGER DEFAULT (strftime('%s', 'now')),
```

Unique anchor:

```javascript
    `ALTER TABLE videos ADD COLUMN group_source TEXT NOT NULL DEFAULT 'unclassified'`,
    `ALTER TABLE videos ADD COLUMN thumbnail_path TEXT`
  ];
```

Replacement:

```javascript
    `ALTER TABLE videos ADD COLUMN group_source TEXT NOT NULL DEFAULT 'unclassified'`,
    `ALTER TABLE videos ADD COLUMN thumbnail_path TEXT`,
    `ALTER TABLE videos ADD COLUMN last_viewed_at INTEGER`
  ];
```

Unique anchor:

```javascript
  await run(db, `CREATE INDEX IF NOT EXISTS idx_videos_content_kind ON videos(content_kind)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_videos_series_season_episode ON videos(series_key, season_number, episode_start)`);
```

Replacement:

```javascript
  await run(db, `CREATE INDEX IF NOT EXISTS idx_videos_content_kind ON videos(content_kind)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_videos_series_season_episode ON videos(series_key, season_number, episode_start)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_videos_continue_watching ON videos(last_viewed_at DESC) WHERE watched = 0 AND last_position_seconds > 0`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_videos_recently_added ON videos(added_date DESC)`);
```

### `RedShift_Desktop/src/main/services/VideoLibraryCache.js`

Unique anchor:

```javascript
      lastPositionSeconds: row.last_position_seconds || 0,
      watched: !!row.watched,
      thumbnailPath: row.thumbnail_path || null,
```

Replacement:

```javascript
      lastPositionSeconds: row.last_position_seconds || 0,
      lastViewedAt: row.last_viewed_at || null,
      watched: !!row.watched,
      addedAt: row.added_date,
      thumbnailPath: row.thumbnail_path || null,
```

Unique anchor:

```javascript
    if (updates.positionSeconds !== undefined && updates.positionSeconds !== null) {
      fields.push('last_position_seconds = ?');
      params.push(Math.floor(updates.positionSeconds));
    }
    if (updates.watched !== undefined && updates.watched !== null) {
```

Replacement:

```javascript
    if (updates.positionSeconds !== undefined && updates.positionSeconds !== null) {
      fields.push('last_position_seconds = ?');
      params.push(Math.floor(updates.positionSeconds));
      fields.push(`last_viewed_at = strftime('%s','now')`);
    }
    if (updates.watched !== undefined && updates.watched !== null) {
```

### `RedShift_Desktop/src/renderer/components/VideoLibrary.js`

Unique anchor:

```javascript
    if (updates.positionSeconds !== undefined && updates.positionSeconds !== null) {
      video.lastPositionSeconds = Math.floor(updates.positionSeconds);
    }
    this.render();
```

Replacement:

```javascript
    if (updates.positionSeconds !== undefined && updates.positionSeconds !== null) {
      video.lastPositionSeconds = Math.floor(updates.positionSeconds);
      video.lastViewedAt = Math.floor(Date.now() / 1000);
    }
    this.render();
```

Unique anchor:

```javascript
  renderLibrarySections(videos) {
    const sections = [];
    const series = this.groupSeries(videos);
```

Replacement:

```javascript
  renderLibrarySections(videos) {
    const sections = [];
    if (this.activeCategory === 'all' && !this.query.trim()) {
      const continueWatching = this.continueWatchingVideos(videos);
      const recentlyAdded = this.recentlyAddedVideos(videos);
      if (continueWatching.length > 0) {
        sections.push(this.renderSection('Continue Watching', this.renderVideos(continueWatching)));
      }
      if (recentlyAdded.length > 0) {
        sections.push(this.renderSection('Recently Added', this.renderVideos(recentlyAdded)));
      }
    }
    const series = this.groupSeries(videos);
```

Insert the following methods immediately before the existing unique anchor `  renderSection(title, content) {`:

```javascript
  continueWatchingVideos(videos) {
    return videos
      .filter((video) => !video.watched && video.lastPositionSeconds > 0 && Number.isFinite(video.lastViewedAt))
      .sort((left, right) => right.lastViewedAt - left.lastViewedAt)
      .slice(0, 12);
  }

  recentlyAddedVideos(videos) {
    return videos
      .filter((video) => Number.isFinite(video.addedAt))
      .sort((left, right) => right.addedAt - left.addedAt)
      .slice(0, 12);
  }

```

### `RedShift_Desktop/test/video-library-cache.integration.test.js`

In the existing test `creates the thumbnail migration and scans an empty library`, extend the unique assertion:

```javascript
    assert.equal(columns.some((column) => column.name === 'thumbnail_path'), true);
    assert.deepEqual(await harness.cache.scanVideoLibrary(harness.libraryPath), []);
```

Replace it with:

```javascript
    assert.equal(columns.some((column) => column.name === 'thumbnail_path'), true);
    assert.equal(columns.some((column) => column.name === 'last_viewed_at'), true);
    assert.deepEqual(await harness.cache.scanVideoLibrary(harness.libraryPath), []);
```

Insert the following complete test after `resets stale playback and thumbnail state when a source changes`:

```javascript
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
```

### `plans/desktop-pi-media-platform-roadmap.md`

After implementation and successful verification, replace the M3 current-state sentence `Recently Added and Continue Watching are not yet dedicated browse surfaces.` with `Recently Added and Continue Watching are delivered as top rails in the All Videos view; final visual acceptance verification remains to be recorded.`

## Verification

- Run `npm test`; the static discovery list in `RedShift_Desktop/package.json` already includes `test/video-library-cache.integration.test.js`.
- Run `npm run build:renderer`.
- Inspect the updated files with the IDE linter.
- Manual acceptance:
  - Scan at least 13 local videos, open and pause two unwatched videos at different positions, then return to All Videos. Confirm Continue Watching shows both individual videos in most-recently-viewed order and Cards/List preference applies.
  - Confirm watched videos and never-started videos do not appear in Continue Watching.
  - Confirm Recently Added shows the 12 most recently indexed items in newest-first order.
  - Enter a category, search, and series detail view. Confirm rails do not appear outside the unfiltered All view.
  - Rescan and modify a source file. Confirm its added ordering stays unchanged and metadata-only enrichment does not reorder Continue Watching.
