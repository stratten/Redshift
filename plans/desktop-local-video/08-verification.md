# 08 — Verification

Run from `RedShift_Desktop/` unless noted otherwise.

## Build and static checks

1. `node build-html.js` — must report every new include (`partials/tabs/videos-tab.html`, `partials/modals/video-player-modal.html`) as `✓ Included` with no `✗ Failed to include` lines. This is the fastest way to catch a typo'd include path.
2. `npm test` — runs `node --test test/artist-credit-parser.test.js`. Must still pass unchanged; this package does not touch artist-credit parsing, and a regression here would indicate an unrelated accidental edit.
3. `npm run dev` — launches the app with dev tools. Open the DevTools console and confirm there are no red errors on startup (in particular no `Invalid IPC channel` or `ReferenceError: VideoLibrary is not defined` — the latter would indicate a script-tag ordering mistake from companion doc 6).

## Functional checks mapped to acceptance criteria

- **Nav and tab switching**: click "Videos" in the sidebar. The page title changes to "Videos", the `#videosTab` content becomes visible, `#musicActions`/`#usbSyncActions` hide, and `#videoActions` (Rescan Videos button + count) becomes visible. Click back to "All" under Music and confirm the music table is still exactly as it was (regression check for the existing tab-switching logic in `renderer.js`).
- **Empty state**: on first run with no files in the video library path, the grid shows the "No videos yet" empty state and the count reads "0 videos".
- **Import via drag-and-drop**: drag one `.mp4` file onto the Videos grid. Confirm: (a) a log line reports the file was added, (b) the file now exists on disk under the configured `videoLibraryPath`, (c) a new card appears in the grid without needing to click Rescan.
- **Playback — supported format**: click the new MP4 card. The player modal opens, the video begins playing, and the native Chromium controls (play/pause/seek/volume/fullscreen) work. Close the modal (× button, click outside, and `Escape` key — verify all three close it). Reopen the same video and confirm it resumes near where it left off (not from `0:00`), and that the card's duration now reads a real value instead of `—`.
- **Playback — unsupported format (adversarial check)**: drag in a `.mkv` file (or rename any non-MP4/WebM container to a supported extension so the scan picks it up, then attempt to play it) that Chromium's `<video>` element cannot decode. Click its card. Confirm: (a) the modal opens without crashing the app, (b) the inline error message "This video format can't be played locally yet." appears, (c) after closing the modal and reopening the grid (or after a rescan), the card shows the "Format not supported for local playback yet" badge.
- **Rescan reflects filesystem changes**: delete a video file directly on disk (Finder/Explorer), click "Rescan Videos", confirm its card disappears and the count decrements. Manually copy a new video file into the `videoLibraryPath` folder outside the app, click "Rescan Videos", confirm it appears.
- **Settings path change**: in Settings, click "Browse" next to Video Library Path, choose a different empty folder, confirm the input updates to the new path. Return to the Videos tab; confirm it rescans against the new (likely empty) folder rather than continuing to show the previous folder's videos.
- **Restart persistence**: quit and relaunch the app. Open Settings and confirm the Video Library Path you chose is still shown (proves `videoLibraryPath` round-trips through `settings.json` via `AppSettingsService`). Open the Videos tab and confirm previously-played videos still show their resume position and known duration (proves the `videos` table survived the restart).

## Regression checks (existing behavior must not change)

- Music library scan, Artists split-view panel, Albums view, Playlists, USB Sync, and Doppler Sync all continue to function exactly as before — none of their files are touched by this package.
- The audio player, mini-player, queue, and all visualizer modes continue to work identically — `AudioPlayer.js` and everything under `components/audioplayer/` are untouched.
- `masterLibraryPath`/`musicLibraryPath` browse buttons in Settings behave exactly as before; only a new, independent Video Library Path row was added beneath them.

## What this package cannot verify by source inspection alone

Whether a given real-world file actually plays back via Chromium's `<video>` element depends on the specific container/codec/profile of that file and the exact Chromium build bundled with Electron 27 — this can only be confirmed by actually opening representative files (an H.264/AAC MP4, a VP9/Opus WebM, and at least one MKV or HEVC file) in the running app, per the "Playback — supported format" and "Playback — unsupported format" checks above. No amount of code review substitutes for that runtime check.
