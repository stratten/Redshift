# Desktop Local Video Library and Playback — Implementation Plan

## Objective

Add a self-contained "Videos" area to RedShift Desktop: a local video library (separate from the music library), local drag-and-drop import, a scrollable grid, and an in-app player with resume-from-last-position. This does not touch `AudioPlayer`, the `songs` table, or any existing music behavior. It does not depend on the Raspberry Pi roadmap packages (`plans/desktop-pi-media-platform-roadmap.md`); it is a standalone desktop feature that a future multi-library/Pi package can later register as "Library A" without re-architecting it.

## Settled decisions — do not re-litigate during execution

- **Playback engine**: a standard HTML `<video>` element in the renderer, loaded via a `file://` URL exactly like the existing audio elements in [RedShift_Desktop/src/renderer/components/audioplayer/AudioPlayerCrossfade.js](RedShift_Desktop/src/renderer/components/audioplayer/AudioPlayerCrossfade.js) already do (`inactiveEl.src = \`file://${peek.track.path}\`;`). No new native dependency, no `ffmpeg`/`ffprobe` binary is added in this package.
- **Codec/container scope**: Electron 27's bundled Chromium reliably plays MP4 (H.264/AAC) and WebM (VP9/VP8/Opus) via `<video>`. Other containers/codecs (MKV, AVI, HEVC, etc.) are still scanned and listed, but playability is determined empirically per-file at play time via the `<video>` element's `error` event, not assumed from the file extension. A file that fails to play is marked `playback_supported = 0` and shown with a "Format not supported for local playback yet" badge instead of crashing or silently doing nothing. This mirrors this package's honest scope; broader format support is explicit future work (see Deferred section), likely delivered by the Raspberry Pi `mpv` path in the platform roadmap, not by adding a transcoding pipeline to the desktop app now.
- **Metadata extraction**: no `ffprobe`/media-probing dependency is added. Duration, pixel width/height, and playback support are unknown at scan time and populated lazily the first time a file is opened in the player (`loadedmetadata`/`error` events), then persisted. The grid shows "—" for duration until a video has been played at least once. This is an accepted, explicit simplification, not an oversight.
- **No thumbnails/posters** in this package. The grid uses a generic file-type icon placeholder. Poster art is deferred to a future metadata package.
- **Single flat list, no Movies/TV grouping** in this package. Season/episode organization is deferred.
- **Import mechanism**: drag-and-drop onto the Videos grid only, mirroring the existing music library's only-drag-and-drop import UX (there is no "Add files" button for music either — see [RedShift_Desktop/src/renderer/renderer.js](RedShift_Desktop/src/renderer/renderer.js) `setupDragAndDrop`). No new file-picker dialog is added.
- **Storage model**: video records live in a new `videos` table inside the existing `sync_database.db` (the same database that already holds `songs`), not a second SQLite file. Unlike `MusicLibraryCache`, there is no separate `video_cache.db` — because there is no expensive metadata-extraction step to cache, the `videos` table itself doubles as both the scan-diff cache and the UI source of truth.
- **Video library path**: a new, independent `videoLibraryPath` setting (default: the OS "Videos"/"Movies" folder), separate from `musicLibraryPath`/`masterLibraryPath`. Choosing it reuses the existing generic `choose-directory` IPC channel and `chooseDirectory()` method with a new `settingKey`.

## Package classification

Build-ready. No unresolved product decisions block this package; it does not require Raspberry Pi hardware, a metadata provider, or any external service.

## File inventory

New files:

| File | Purpose |
| --- | --- |
| `RedShift_Desktop/src/main/services/VideoLibraryCache.js` | Main-process video filesystem scan, diff, and `videos` table CRUD. |
| `RedShift_Desktop/src/main/services/ipc/VideoHandlers.js` | IPC handlers: scan, progress update, drag-and-drop import. |
| `RedShift_Desktop/src/renderer/components/VideoLibrary.js` | Renderer data manager + grid rendering + drag-and-drop for the Videos tab. |
| `RedShift_Desktop/src/renderer/components/video/VideoPlayerModal.js` | Renderer controller for the `<video>` element inside the player modal. |
| `RedShift_Desktop/src/renderer/partials/tabs/videos-tab.html` | Videos tab markup (grid, empty state, scan progress bar). |
| `RedShift_Desktop/src/renderer/partials/modals/video-player-modal.html` | Video player modal markup. |
| `RedShift_Desktop/src/renderer/styles/videos-view.css` | Styles for the grid, cards, badges, and player modal. |

Edited files:

| File | Change |
| --- | --- |
| `RedShift_Desktop/src/main/services/Database.js` | Add `videos` table + indexes. |
| `RedShift_Desktop/src/main/main.js` | Add `videoLibraryPath`/`videoExtensions` defaults, wire `VideoLibraryCache`, extend `updateSetting`/`chooseDirectory`. |
| `RedShift_Desktop/src/main/services/ipc/index.js` | Register `VideoHandlers`. |
| `RedShift_Desktop/src/main/services/ipc/EventForwarders.js` | Forward `video-scan-progress` to the renderer. |
| `RedShift_Desktop/src/main/preload.js` | Whitelist new IPC channels. |
| `RedShift_Desktop/src/renderer/index.html` | Nav item, tab include, modal include, script tags. |
| `RedShift_Desktop/src/renderer/partials/tabs/settings-tab.html` | Video Library Path row + codec-support note. |
| `RedShift_Desktop/src/renderer/components/SettingsManager.js` | Browse handler + load/populate for the video path. |
| `RedShift_Desktop/src/renderer/renderer.js` | Instantiate `VideoLibrary`, wire tab-switch/title/header-action logic. |
| `RedShift_Desktop/src/renderer/styles/main.css` | `@import 'videos-view.css';` |

## Companion documents (apply in this order)

1. [01-schema-and-main-process-settings.md](01-schema-and-main-process-settings.md) — `Database.js` and `main.js` edits. Apply first; every other main-process file depends on `manager.videoLibraryPath`, `manager.videoExtensions`, and the `videos` table existing.
2. [02-new-file-VideoLibraryCache.md](02-new-file-VideoLibraryCache.md) — new `VideoLibraryCache.js`. Depends on (1).
3. [03-ipc-and-preload.md](03-ipc-and-preload.md) — new `VideoHandlers.js`, plus `ipc/index.js`, `EventForwarders.js`, `preload.js` edits. Depends on (1) and (2).
4. [04-renderer-VideoLibrary.md](04-renderer-VideoLibrary.md) — new `VideoLibrary.js`. Depends on (3) for its IPC calls.
5. [05-renderer-VideoPlayerModal.md](05-renderer-VideoPlayerModal.md) — new `VideoPlayerModal.js` and `video-player-modal.html`. Depends on (3).
6. [06-html-nav-and-tab.md](06-html-nav-and-tab.md) — `index.html` edits and new `videos-tab.html`. Depends on (4) and (5) existing as script files to reference.
7. [07-settings-and-styles.md](07-settings-and-styles.md) — `settings-tab.html`, `SettingsManager.js`, `renderer.js`, `main.css` edits, and new `videos-view.css`. Apply last; `renderer.js` wiring assumes `VideoLibrary`/`VideoPlayerModal` classes and the tab/modal markup already exist.
8. [08-verification.md](08-verification.md) — verification commands and manual/adversarial checks mapped to acceptance criteria.

## Cross-file contract notes

- `manager.videoLibraryCache` is constructed synchronously in `initializeServices()` (no async `initialize()` step) because the `videos` table is already created by `initializeDatabase()`, which always runs before `initializeServices()` in `initializeApp()`. Do not add an `await this.videoLibraryCache.initialize()` call — there is nothing to initialize.
- `VideoLibraryCache` takes the manager instance itself (not a raw `sqlite3.Database`), reusing `manager.db` for all queries and `manager.emit('log', ...)` for logging — this matches the existing pattern where `DeviceMonitorService` and `MediaKeysService` also take `manager` directly, and it means `video-scan-progress`/`log` events flow through the single shared `RedshiftSyncManager` `EventEmitter` instance without opening a second SQLite connection.
- `videoLibraryPath` and `musicLibraryPath`/`masterLibraryPath` are fully independent settings; changing one never touches the other's directory, cache, or watcher.
- The `videos` table is separate from `songs`; no shared rows, no shared file-path namespace assumptions (a video and an audio file could theoretically share a path only if a user mixed content in weird ways — this package does not attempt to deduplicate across the two tables).

## Deferred (explicitly out of scope for this package)

- **Broader codec/container support** (MKV, HEVC, transcoding): owned by the Raspberry Pi `mpv` playback path in `plans/desktop-pi-media-platform-roadmap.md` (packages M0/M9), not by this desktop package.
- **Thumbnails/posters, duration-on-scan via `ffprobe`, Movies/TV grouping**: owned by a future metadata/organization package (conceptually the roadmap's M3).
- **Multiple libraries, remote/Pi libraries, transfer, reconciliation**: owned by the roadmap's M1/M4/M5/M6/M7. This package's `videos` table and `VideoLibraryCache` are intentionally structured (stable `file_path` identity, size/mtime diffing) so a future library-registry package can adopt this collection as a named library without a data migration that discards existing rows — but no registry code is added here.
- **Explicit "Add Videos" file-picker button**: deferred; drag-and-drop matches the existing music-library import UX exactly.

## Verification mapping (see companion doc 8 for exact commands)

| Acceptance concern | Proof |
| --- | --- |
| Existing music/audio behavior unaffected | `npm test` (existing `test/artist-credit-parser.test.js`) plus manual playback/queue/sync regression pass — no edit in this package touches `AudioPlayer.js`, `songs`, or `musicLibraryPath`. |
| Local video import works | Drag an MP4 onto the Videos grid; file appears in the grid and on disk under `videoLibraryPath`. |
| Local video playback works | Click a supported video; it plays, pauses, seeks, and resumes near the last position on reopen. |
| Unsupported format handled gracefully | Drop/play an MKV or other unsupported file; UI shows the "not supported" badge/message, no crash, no silent freeze. |
| Rescan reflects filesystem changes | Delete a file on disk, click Rescan, row disappears; add a file externally, click Rescan, row appears. |
| Settings path change takes effect | Change Video Library Path in Settings, rescan uses the new path. |

## Completion certificate

- `Self-audit: passed`
- All settled decisions are explicit; deferred work is named with its future owner.
- Every new file has complete final content in its companion document; every edit has a verbatim anchor and exact replacement.
- No placeholders, ellipses, or "implement similarly" instructions appear in any companion document.
- Apply order and cross-file dependencies are explicit.
- Verification includes a negative/regression check (existing music behavior) and an adversarial check (unsupported format).
