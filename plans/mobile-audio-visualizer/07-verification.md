# Verification

Per the user's explicit instruction, verification runs entirely in the iOS Simulator via `xcodebuild build` + `xcrun simctl` — no archive, no `.ipa` export, no TestFlight upload. Uploading is a separate, explicitly-approved step to take later if the visualizer is worth keeping.

## Build for Simulator

```bash
cd RedShiftMobile
xcodebuild -scheme RedShiftMobile -destination "platform=iOS Simulator,name=iPhone 17" -configuration Debug build
```

This target/scheme and simulator name were confirmed present in this environment (`xcodebuild -list -project RedShiftMobile.xcodeproj` lists the `RedShiftMobile` scheme; `xcrun simctl list devices available` lists an `iPhone 17` simulator).

## Run unit tests

```bash
cd RedShiftMobile
xcodebuild test -scheme RedShiftMobile -destination "platform=iOS Simulator,name=iPhone 17"
```

Runs the full `RedShiftMobileTests` target, including the 5 new `AudioSpectrumAnalyzerTests` cases plus every pre-existing test (`TrackOrderingTests`, `SearchPredicateTests`, `LibraryIndexTests`, `SyncManifestTests`, `ID3NumberParsingTests`, `DatabaseReconciliationTests`) as a regression check that nothing in this change touched their behavior.

## Install and launch in the Simulator for manual QA

```bash
xcrun simctl boot "iPhone 17" 2>/dev/null || true
xcodebuild -scheme RedShiftMobile -destination "platform=iOS Simulator,name=iPhone 17" -configuration Debug -derivedDataPath build install
xcrun simctl install "iPhone 17" build/Build/Products/Debug-iphonesimulator/RedShiftMobile.app
xcrun simctl launch "iPhone 17" <bundle-identifier-from-Info.plist>
```

(The exact `-derivedDataPath`/install flow can be simplified to just opening the built `.app` from Xcode's own Run button on the `iPhone 17` simulator destination instead, if that's more convenient than the raw `xcodebuild`/`simctl` commands above — either accomplishes the same "run locally in the Simulator" goal.)

## Acceptance criteria mapped to verification

- **Mini player shows real frequency bars while playing, next to the track info** — code: `MiniPlayerView.swift` edit 2 in `05b-edit-MiniPlayerView.md`. Verify: play any track in the Simulator, observe 3 bars animating with visibly different heights per bar (not moving as one blob) next to the album art/title.
- **Now Playing screen shows larger frequency bars under the track info** — code: `NowPlayingView.swift` edit 2 in `05c-edit-NowPlayingView.md`. Verify: open Now Playing while a track plays, observe the larger bar row above the progress slider.
- **Bars use the yellow-to-red gradient while playing, muted gray at rest while paused** — code: `VisualizerBarsView.swift` `barGradient`/`isActive` in `03-new-file-VisualizerBarsView.md`. Verify: pause playback and confirm bars turn gray and settle to `minHeight`; resume and confirm the gradient returns.
- **Bars reflect real frequency content, not a synthetic animation** — code: `AudioSpectrumAnalyzer+FFT.swift` `computeBandLevels` in `02-new-file-AudioSpectrumAnalyzer-FFT.md`. Verify (unit test): `testLowFrequencyToneDominatesBassBand` and `testHighFrequencyToneDominatesTrebleBand` in `04-new-file-AudioSpectrumAnalyzerTests.md` assert a low-frequency synthetic tone dominates band 0 and a high-frequency tone dominates band 2. Verify (manual): play a bass-heavy track vs. a vocal/treble-heavy track back to back and confirm the bar balance visibly shifts.
- **Playback, seeking, crossfade, lock-screen controls, and background audio are completely unaffected** — code: no edits touch `AudioPlayerService.swift` at all; the analyzer only ever reads a separate `AVAudioFile` handle. Verify: run the full existing test suite (regression check above) plus a manual pass — start playback, seek via the Now Playing slider, trigger a crossfade (set a crossfade duration and let a track end), use lock-screen/Control Center play/pause/skip, and background/foreground the app — confirm all of these behave exactly as before this change.
- **No wasted battery/file I/O while backgrounded** — code: `spectrumAnalyzer.stop()` on `scenePhase == .background` in `05a-edit-RedShiftMobileApp.md`. Verify: background the app while playing, confirm (via a breakpoint or a temporary `print` in `sampleTick`, removed afterward) that no analyzer ticks fire until the app returns to `.active`.

## Adversarial / edge-case checks

- **Very short track (shorter than the FFT read window)**: `sampleTick`'s guard `totalFrames > AVAudioFramePosition(fftSize)` skips analysis entirely rather than attempting an out-of-bounds read — verify by queuing a track under ~25ms (1024 frames at 44.1kHz) if one exists in the library, or by temporarily lowering `fftSize` in a debug build to exercise the guard; bars should simply stay at rest instead of crashing.
- **Seeking to the very end of a track**: `startFrame` is clamped to `maxStart = totalFrames - fftSize`, so a read starting there never runs past `file.length` — verify by dragging the Now Playing slider to the last second of a track and confirming bars keep animating (reading the last available window) rather than freezing or crashing.
- **Rapid track skipping**: `onChange(of: audioPlayer.currentTrack?.id)` reopens the file on every change; `sampleTick`'s own `track.id != openTrackID` check is a second safety net if a tick fires between skips — verify by rapidly tapping "next" several times and confirming bars don't visibly lag behind or show the previous track's levels for more than one frame.
- **File missing/deleted on disk**: `openFile` fails silently (`audioFile = nil`) if `FileManager.default.fileExists` is false — verify bars simply stay at rest (no crash) if this path is exercised; this mirrors the existing `play(track:)` guard in `AudioPlayerService.swift` which already handles missing files the same way.
- **FLAC vs. AAC/MP3 format parity**: `AVAudioFile(forReading:)` uses the same underlying AVFoundation decoders `AVAudioPlayer` already relies on for playback, so no separate format-compatibility question exists — verify by playing one track of each format present in the library and confirming bars animate for all of them.

## Regression checks (existing behavior that must not change)

- Progress bar smoothness (the `.animation(.linear(duration: 0.1), ...)` fix on the Now Playing slider) — unaffected, no edit touches that modifier.
- Mini player boundary/tap reliability and "only visible when a track is loaded" behavior — unaffected; the visualizer is inserted inside the existing `Button`, not replacing any existing tap target.
- Custom tab bar (no Liquid Glass morph) — unaffected, no edit touches `CustomTabBar.swift` or `ContentView.swift`'s tab-bar wiring.
- Marquee text restart pause — unaffected, no edit touches `LibraryDetailViews.swift`.
- Album ordering, search, and sync/reconciliation behavior — unaffected, no edit touches `Track.swift`, `MusicLibraryManager.swift`, `LibraryIndex.swift`, or `SyncManifest.swift`; running the full test suite (above) is the regression proof for all of these.

## Deferred (explicitly out of scope for this change)

- **Track-row-level visualizer parity with desktop** (`TrackRow` in `LibraryView.swift`): the user chose "Mini player + Now Playing screen" over "all three" placements when this plan was scoped — track rows keep no now-playing indicator, same as today. Owner: a future follow-up if per-row parity is wanted later; nothing in this change makes that harder to add (it would reuse the same `AudioSpectrumAnalyzer`/`VisualizerBarsView` types).
- **`AVAudioEngine` migration** (real-time mixer taps, parametric EQ parity with desktop, sample-accurate crossfade): explicitly discussed and deferred in favor of this lower-risk shadow-file-reader approach. Owner: a future, separately-scoped plan if the EQ-parity/crossfade-precision case is compelling enough on its own to justify rewriting `AudioPlayerService.swift`'s playback internals.
- **Upload to TestFlight**: per the user's instruction, this stays Simulator-only until they decide the feature is worth uploading; no `Info.plist`/`CURRENT_PROJECT_VERSION` bump, archive, export, or Transporter upload is part of this plan.
