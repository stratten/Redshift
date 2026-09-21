# 06 — `index.html` edits and new `videos-tab.html`

## New file: `RedShift_Desktop/src/renderer/partials/tabs/videos-tab.html`

Create with this exact content:

```html
<!-- Videos Tab -->
<div id="videosTab" class="tab-content" style="display: none;">
    <div class="videos-library">
        <!-- Scan Progress Bar (hidden by default) -->
        <div id="videoScanProgressBar" class="scan-progress-bar" style="display: none;">
            <div class="scan-progress-content">
                <div class="scan-progress-text">
                    <span>Scanning video library...</span>
                </div>
            </div>
        </div>

        <div class="videos-grid" id="videosGrid">
            <div class="empty-state videos-empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="2" y="4" width="15" height="16" rx="2"></rect>
                    <path d="M17 8l5-3v14l-5-3"></path>
                </svg>
                <h3>No videos yet</h3>
                <p>Drag video files here, or set a Video Library Path in Settings</p>
            </div>
        </div>
    </div>
</div>
```

## Edit 1: `RedShift_Desktop/src/renderer/index.html` — nav section

Find this exact block:

```
                <div class="nav-item nav-item-indented" data-tab="music" data-subtab="recentlyPlayed">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    Recently Played
                </div>
                
                <div class="nav-section-header">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M1 4v6h6"></path>
                        <path d="M23 20v-6h-6"></path>
                        <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10"></path>
                        <path d="M3.51 15a9 9 0 0 0 14.85 4.36L23 14"></path>
                    </svg>
                    Sync
                </div>
```

Replace it with:

```
                <div class="nav-item nav-item-indented" data-tab="music" data-subtab="recentlyPlayed">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    Recently Played
                </div>

                <div class="nav-section-header">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="2" y="4" width="15" height="16" rx="2"></rect>
                        <path d="M17 8l5-3v14l-5-3"></path>
                    </svg>
                    Video
                </div>

                <div class="nav-item" data-tab="videos">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="2" y="4" width="15" height="16" rx="2"></rect>
                        <path d="M17 8l5-3v14l-5-3"></path>
                    </svg>
                    Videos
                </div>
                
                <div class="nav-section-header">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M1 4v6h6"></path>
                        <path d="M23 20v-6h-6"></path>
                        <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10"></path>
                        <path d="M3.51 15a9 9 0 0 0 14.85 4.36L23 14"></path>
                    </svg>
                    Sync
                </div>
```

## Edit 2: `RedShift_Desktop/src/renderer/index.html` — Videos header action button

Find this exact block:

```
                    <div id="musicActions" class="header-actions">
                            <button class="btn btn-secondary btn-sm" id="scanMusicBtn">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M1 4v6h6"></path>
                                <path d="M23 20v-6h-6"></path>
                                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path>
                            </svg>
                            Refresh Library
                        </button>
                    </div>
```

Replace it with:

```
                    <div id="musicActions" class="header-actions">
                            <button class="btn btn-secondary btn-sm" id="scanMusicBtn">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M1 4v6h6"></path>
                                <path d="M23 20v-6h-6"></path>
                                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path>
                            </svg>
                            Refresh Library
                        </button>
                    </div>
                    <div id="videoActions" class="header-actions" style="display: none;">
                            <button class="btn btn-secondary btn-sm" id="rescanVideosBtn">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M1 4v6h6"></path>
                                <path d="M23 20v-6h-6"></path>
                                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path>
                            </svg>
                            Rescan Videos
                        </button>
                        <span id="videoCount" class="library-stats-inline">0 videos</span>
                    </div>
```

## Edit 3: `RedShift_Desktop/src/renderer/index.html` — tab include

Find this exact block:

```
                <!-- include: partials/tabs/music-tab.html -->
                
                <!-- include: partials/tabs/usb-sync-tab.html -->
```

Replace it with:

```
                <!-- include: partials/tabs/music-tab.html -->
                
                <!-- include: partials/tabs/videos-tab.html -->
                
                <!-- include: partials/tabs/usb-sync-tab.html -->
```

## Edit 4: `RedShift_Desktop/src/renderer/index.html` — modal include

Find this exact block:

```
    <!-- include: partials/modals/audio-visualization-modal.html -->

    <!-- Portaled Dropdowns (position: fixed elements that need to be at body level to avoid stacking context issues) -->
```

Replace it with:

```
    <!-- include: partials/modals/audio-visualization-modal.html -->
    <!-- include: partials/modals/video-player-modal.html -->

    <!-- Portaled Dropdowns (position: fixed elements that need to be at body level to avoid stacking context issues) -->
```

## Edit 5: `RedShift_Desktop/src/renderer/index.html` — script tags

Find this exact block:

```
    <script src="components/ArtistsView.js"></script>
    <script src="components/AlbumsView.js"></script>
    <script src="components/SyncManager.js"></script>
```

Replace it with:

```
    <script src="components/ArtistsView.js"></script>
    <script src="components/AlbumsView.js"></script>
    <script src="components/video/VideoPlayerModal.js"></script>
    <script src="components/VideoLibrary.js"></script>
    <script src="components/SyncManager.js"></script>
```

`VideoPlayerModal.js` is listed before `VideoLibrary.js` only for readability; load order between the two does not matter because neither class is instantiated until `renderer.js`'s constructor runs (companion doc 7), and both classes are defined (not executed) at parse time. `renderer.js` itself is loaded last (unchanged), after both new script tags, so both classes exist as globals before `RedshiftSyncUI` is constructed.

## Why the note about `.header` grid columns is not an edit here

The `.header` element already uses `max-content auto minmax(0, 1fr) 240px` grid columns (from the audio-visualizer work); the new `#videoActions` block reuses the existing `#musicActions`/`.header-actions` sibling pattern inside `.header-left-actions`, so no layout CSS changes are needed beyond what companion doc 7 adds for the Videos-specific grid/cards.
