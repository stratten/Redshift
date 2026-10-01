# 02 — Foreground Lifecycle Fix and Energy Reductions

Apply after 01. Whitespace-only lines inside the anchors reproduce the file exactly. Swift files in this project put the surrounding indentation on blank lines inside functions and leave them empty elsewhere. If an anchor fails to match, compare whitespace-only lines first.

## File: `RedShiftMobile/RedShiftMobile/App/RedShiftMobileApp.swift`

### Edit 2.1 — background flag

Find:

```swift
    @Environment(\.scenePhase) private var scenePhase
```

Replace:

```swift
    @Environment(\.scenePhase) private var scenePhase
    @State private var hasEnteredBackground = false
```

### Edit 2.2 — analyzer reasons and the scene-phase fix

Find:

```swift
                .onChange(of: audioPlayer.isPlaying) { _, isPlaying in
                    if isPlaying {
                        spectrumAnalyzer.start()
                    } else {
                        spectrumAnalyzer.stop()
                    }
                }
                .onChange(of: audioPlayer.currentTrack?.id) { _, _ in
                    // Track changed (skip/next/previous/crossfade completion) while
                    // still playing: reopen the shadow file handle for the new track.
                    if audioPlayer.isPlaying {
                        spectrumAnalyzer.start()
                    }
                }
                .onChange(of: scenePhase) { oldPhase, newPhase in
                    PlaybackDiagnostics.shared.record("app.lifecycle", "Scene phase \(oldPhase) → \(newPhase)")
                    if newPhase == .background {
                        // Export playlists when app goes to background (in case of sync)
                        Task {
                            await libraryManager.exportPlaylistsForSync()
                        }
                        // Stop reading/analyzing file samples while backgrounded — the
                        // bars aren't visible and playback itself (AVAudioPlayer) is
                        // completely unaffected either way.
                        spectrumAnalyzer.stop()
                    } else if newPhase == .active && oldPhase == .background {
                        // Coming back from background (after a potential desktop sync):
                        // reconcile incrementally so the library reflects any newly
                        // synced files/manifest automatically, with no manual "refresh
                        // from Settings" step required.
                        Task {
                            await libraryManager.reconcileLibraryIncrementally()
                        }
                        if audioPlayer.isPlaying {
                            spectrumAnalyzer.start()
                        }
                    }
                }
```

Replace:

```swift
                .onChange(of: audioPlayer.isPlaying) { _, isPlaying in
                    if isPlaying {
                        spectrumAnalyzer.start(reason: "playback-started")
                    } else {
                        spectrumAnalyzer.stop(reason: "playback-stopped")
                    }
                }
                .onChange(of: audioPlayer.currentTrack?.id) { _, _ in
                    // Track changed (skip/next/previous/crossfade completion) while
                    // still playing: reopen the shadow file handle for the new track.
                    if audioPlayer.isPlaying {
                        spectrumAnalyzer.start(reason: "track-changed")
                    }
                }
                .onChange(of: scenePhase) { oldPhase, newPhase in
                    PlaybackDiagnostics.shared.record("app.lifecycle", "Scene phase \(oldPhase) → \(newPhase)")
                    if newPhase == .background {
                        hasEnteredBackground = true
                        // Export playlists when app goes to background (in case of sync)
                        Task {
                            await libraryManager.exportPlaylistsForSync()
                        }
                        // Stop reading/analyzing file samples while backgrounded — the
                        // bars aren't visible and playback itself (AVAudioPlayer) is
                        // completely unaffected either way.
                        spectrumAnalyzer.stop(reason: "scene-background")
                    } else if newPhase == .active {
                        // iOS always returns through .inactive (background → inactive →
                        // active), so oldPhase is never .background here; the flag is
                        // what detects a return from background.
                        if hasEnteredBackground {
                            hasEnteredBackground = false
                            Task {
                                await libraryManager.reconcileLibraryIncrementally()
                            }
                        }
                        if audioPlayer.isPlaying {
                            spectrumAnalyzer.start(reason: "scene-active")
                        }
                        PlaybackDiagnostics.shared.record("visualizer.lifecycle", "Foreground check isPlaying=\(audioPlayer.isPlaying) analyzerRunning=\(spectrumAnalyzer.isRunning)")
                    }
                }
```

## File: `RedShiftMobile/RedShiftMobile/Services/AudioSpectrumAnalyzer.swift`

### Edit 2.3 — `isRunning`, start/stop reasons and lifecycle logging

Find:

```swift
    func start() {
        guard let player = audioPlayer, let track = player.currentTrack else { return }
        if track.id != openTrackID {
            openFile(for: track)
        }
        guard pollTimer == nil else { return } // already running
        pollTimer = Timer.scheduledTimer(withTimeInterval: 1.0 / 30.0, repeats: true) { [weak self] _ in
            self?.sampleTick()
        }
    }

    func stop() {
        pollTimer?.invalidate()
        pollTimer = nil
```

Replace:

```swift
    var isRunning: Bool { pollTimer != nil }

    func start(reason: String = "unspecified") {
        guard let player = audioPlayer, let track = player.currentTrack else {
            PlaybackDiagnostics.shared.record("visualizer.lifecycle", "Start skipped reason=\(reason): no current track")
            return
        }
        if track.id != openTrackID {
            openFile(for: track)
        }
        guard pollTimer == nil else { return } // already running
        pollTimer = Timer.scheduledTimer(withTimeInterval: 1.0 / 30.0, repeats: true) { [weak self] _ in
            self?.sampleTick()
        }
        PlaybackDiagnostics.shared.record("visualizer.lifecycle", "Started reason=\(reason) fileOpen=\(audioFile != nil)")
    }

    func stop(reason: String = "unspecified") {
        if pollTimer != nil {
            PlaybackDiagnostics.shared.record("visualizer.lifecycle", "Stopped reason=\(reason)")
        }
        pollTimer?.invalidate()
        pollTimer = nil
```

(Edit 2.4 is the `isRunning` property included above; Edit 1.7 depends on it.)

### Edit 2.5 — log shadow-file open failures

Find:

```swift
        } catch {
            audioFile = nil
            openTrackID = nil
        }
```

Replace:

```swift
        } catch {
            audioFile = nil
            openTrackID = nil
            PlaybackDiagnostics.shared.record("visualizer.lifecycle", "File open failed track=\(track.stableID) error=\(error.localizedDescription)")
        }
```

### Edit 2.6 — tick counters

Find:

```swift
    private func sampleTick() {
        guard let player = audioPlayer, let track = player.currentTrack else {
            stop()
            return
        }
        if track.id != openTrackID {
            openFile(for: track)
        }
        guard let file = audioFile, !isReading else { return }
```

Replace:

```swift
    private func sampleTick() {
        PerformanceDiagnostics.shared.increment(.analyzerTick)
        guard let player = audioPlayer, let track = player.currentTrack else {
            stop(reason: "no-current-track")
            return
        }
        if track.id != openTrackID {
            openFile(for: track)
        }
        if isReading {
            PerformanceDiagnostics.shared.increment(.analyzerTickSkippedBusy)
            return
        }
        guard let file = audioFile else { return }
```

### Edit 2.7 — read timing, signposts, and dropping unchanged frames

Find (through the end of the file):

```swift
        isReading = true
        sampleQueue.async { [weak self] in
            let levelSets = AudioSpectrumAnalyzer.readAndAnalyze(
                file: file,
                format: format,
                startFrame: startFrame,
                fftSize: size,
                bandCounts: counts
            )
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.isReading = false
                if let levelSets = levelSets, levelSets.count == 2 {
                    self.bandLevels = self.smoothed(previous: self.bandLevels, new: levelSets[0])
                    self.fullBandLevels = self.smoothed(previous: self.fullBandLevels, new: levelSets[1])
                }
            }
        }
    }
}
```

Replace:

```swift
        isReading = true
        sampleQueue.async { [weak self] in
            let signpostState = PerformanceDiagnostics.signposter.beginInterval("AnalyzerRead")
            let readStarted = DispatchTime.now().uptimeNanoseconds
            let levelSets = AudioSpectrumAnalyzer.readAndAnalyze(
                file: file,
                format: format,
                startFrame: startFrame,
                fftSize: size,
                bandCounts: counts
            )
            PerformanceDiagnostics.shared.recordAnalyzerRead(nanoseconds: DispatchTime.now().uptimeNanoseconds - readStarted)
            PerformanceDiagnostics.signposter.endInterval("AnalyzerRead", signpostState)
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.isReading = false
                guard let levelSets = levelSets, levelSets.count == 2 else { return }
                let nextBandLevels = self.smoothed(previous: self.bandLevels, new: levelSets[0])
                let nextFullBandLevels = self.smoothed(previous: self.fullBandLevels, new: levelSets[1])
                let bandsChanged = AudioSpectrumAnalyzer.differsVisibly(self.bandLevels, nextBandLevels)
                let fullBandsChanged = AudioSpectrumAnalyzer.differsVisibly(self.fullBandLevels, nextFullBandLevels)
                // Every @Published assignment invalidates each observing view even
                // when the value is identical (silence, held notes), so frames with
                // no visible change are dropped.
                if bandsChanged {
                    self.bandLevels = nextBandLevels
                }
                if fullBandsChanged {
                    self.fullBandLevels = nextFullBandLevels
                }
                if bandsChanged || fullBandsChanged {
                    PerformanceDiagnostics.shared.increment(.analyzerPublish)
                }
            }
        }
    }

    /// 0.004 of the 40 pt full-player bar range is 0.16 pt, below one
    /// rendered pixel on every supported device.
    nonisolated static func differsVisibly(_ lhs: [CGFloat], _ rhs: [CGFloat]) -> Bool {
        guard lhs.count == rhs.count else { return true }
        return zip(lhs, rhs).contains { abs($0 - $1) > 0.004 }
    }
}
```

## File: `RedShiftMobile/RedShiftMobile/Services/AudioSpectrumAnalyzer+FFT.swift`

### Edit 2.8 — use cached FFT resources

Find:

```swift
        var window = [Float](repeating: 0, count: n)
        vDSP_hann_window(&window, vDSP_Length(n), Int32(vDSP_HANN_NORM))
        var windowed = [Float](repeating: 0, count: n)
        vDSP_vmul(samples, 1, window, 1, &windowed, 1, vDSP_Length(n))

        let log2n = vDSP_Length(log2(Double(n)))
        guard let fftSetup = vDSP_create_fftsetup(log2n, FFTRadix(kFFTRadix2)) else {
            return nil
        }
        defer { vDSP_destroy_fftsetup(fftSetup) }
```

Replace:

```swift
        guard let context = FFTContext.context(for: n) else { return nil }
        // An uncached size's context is local; keep it (and its setup) alive
        // until the transform below has finished using it.
        defer { withExtendedLifetime(context) {} }
        var windowed = [Float](repeating: 0, count: n)
        vDSP_vmul(samples, 1, context.window, 1, &windowed, 1, vDSP_Length(n))

        let log2n = context.log2n
        let fftSetup = context.setup
```

### Edit 2.9 — `FFTContext`

Find (end of file):

```swift
    nonisolated static func computeBandLevels(samples: [Float], bandCount: Int) -> [CGFloat] {
        guard let magnitudes = computeMagnitudes(samples: samples) else {
            return [CGFloat](repeating: 0, count: bandCount)
        }
        return groupMagnitudes(magnitudes, bandCount: bandCount)
    }
}
```

Replace:

```swift
    nonisolated static func computeBandLevels(samples: [Float], bandCount: Int) -> [CGFloat] {
        guard let magnitudes = computeMagnitudes(samples: samples) else {
            return [CGFloat](repeating: 0, count: bandCount)
        }
        return groupMagnitudes(magnitudes, bandCount: bandCount)
    }
}

/// Immutable per-size FFT resources: the twiddle-factor setup and the Hann
/// window depend only on the transform size. vDSP setups are read-only after
/// creation and safe to share across threads, so the analyzer's size is built
/// once for the life of the process.
final class FFTContext {
    let size: Int
    let log2n: vDSP_Length
    let setup: FFTSetup
    let window: [Float]

    init?(size: Int) {
        guard size > 0, size & (size - 1) == 0 else { return nil }
        let log2n = vDSP_Length(log2(Double(size)))
        guard let setup = vDSP_create_fftsetup(log2n, FFTRadix(kFFTRadix2)) else { return nil }
        var window = [Float](repeating: 0, count: size)
        vDSP_hann_window(&window, vDSP_Length(size), Int32(vDSP_HANN_NORM))
        self.size = size
        self.log2n = log2n
        self.setup = setup
        self.window = window
    }

    deinit {
        vDSP_destroy_fftsetup(setup)
    }

    private static let analyzerSizeContext = FFTContext(size: 1024)

    static func context(for size: Int) -> FFTContext? {
        if size == 1024 {
            return analyzerSizeContext
        }
        return FFTContext(size: size)
    }
}
```

## File: `RedShiftMobile/RedShiftMobile/Views/VisualizerBarsView.swift`

### Edit 2.10 — `LiveVisualizerBars`

Find:

```swift
#Preview {
    VisualizerBarsView(levels: [0.8, 0.4, 0.6], isActive: true)
```

Replace:

```swift
/// Owns the 30 Hz spectrum subscription so only this small view re-renders on
/// each analyzer frame; the player views around it (album art, titles,
/// controls) are not invalidated by visualizer updates.
struct LiveVisualizerBars: View {
    enum Resolution {
        case compact
        case full
    }

    @EnvironmentObject var spectrumAnalyzer: AudioSpectrumAnalyzer
    let resolution: Resolution
    let isActive: Bool
    var minHeight: CGFloat = 3
    var maxHeight: CGFloat = 14
    var barWidth: CGFloat = 3
    var spacing: CGFloat = 2

    var body: some View {
        VisualizerBarsView(
            levels: resolution == .compact ? spectrumAnalyzer.bandLevels : spectrumAnalyzer.fullBandLevels,
            isActive: isActive,
            minHeight: minHeight,
            maxHeight: maxHeight,
            barWidth: barWidth,
            spacing: spacing
        )
    }
}

#Preview {
    VisualizerBarsView(levels: [0.8, 0.4, 0.6], isActive: true)
```

## File: `RedShiftMobile/RedShiftMobile/Views/MiniPlayerView.swift`

### Edit 2.11 — stop observing the analyzer in the whole mini player

Find:

```swift
    @EnvironmentObject var audioPlayer: AudioPlayerService
    @EnvironmentObject var spectrumAnalyzer: AudioSpectrumAnalyzer
```

Replace:

```swift
    @EnvironmentObject var audioPlayer: AudioPlayerService
```

### Edit 2.12 — use `LiveVisualizerBars`

Find:

```swift
                        VisualizerBarsView(
                            levels: spectrumAnalyzer.bandLevels,
```

Replace:

```swift
                        LiveVisualizerBars(
                            resolution: .compact,
```

Leave the `#Preview` `.environmentObject(AudioSpectrumAnalyzer())` in place, because the child view still needs it.

Energy work for `AudioPlayerService.swift`, `NowPlayingView.swift`, `MarqueeText`, and reconciliation is in [02b-energy-player-and-marquee.md](02b-energy-player-and-marquee.md).
