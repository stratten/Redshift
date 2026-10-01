# 02b — Player Progress Decoupling, Marquee Pausing, Reconciliation Side Effects

Apply after 02.

## File: `RedShiftMobile/RedShiftMobile/Services/AudioPlayerService.swift`

### Edit 2b.1 — `PlaybackProgress`

Find:

```swift
class AudioPlayerService: NSObject, ObservableObject {
```

Replace:

```swift
/// Publishes only the playback position (10 Hz while playing). Views that
/// display the position observe this object; everything else observes
/// AudioPlayerService, which then changes only on real state transitions.
final class PlaybackProgress: ObservableObject {
    @Published var currentTime: TimeInterval = 0
}

class AudioPlayerService: NSObject, ObservableObject {
```

### Edit 2b.2 — make `currentTime` a plain property mirrored into `progress`

Find:

```swift
    @Published var currentTime: TimeInterval = 0
```

Replace:

```swift
    /// Not @Published: ContentView and every library screen observe this
    /// service, so a 10 Hz published position re-rendered the whole tree.
    var currentTime: TimeInterval = 0 {
        didSet { progress.currentTime = currentTime }
    }
    let progress = PlaybackProgress()
```

### Edit 2b.3 — tick counter storage

Find:

```swift
    private var lastProgressDate = Date()
```

Replace:

```swift
    private var lastProgressDate = Date()
    private var progressTickCount = 0
```

### Edit 2b.4 — 1 Hz publishing while not active

Find:

```swift
            guard let self = self, let player = self.player else { return }
            self.currentTime = player.currentTime
```

Replace:

```swift
            guard let self = self, let player = self.player else { return }
            PerformanceDiagnostics.shared.increment(.progressTick)
            self.progressTickCount &+= 1
            // Background audio keeps this timer alive, but nothing on screen can
            // show the position unless the app is active.
            if UIApplication.shared.applicationState == .active || self.progressTickCount % 10 == 0 {
                self.currentTime = player.currentTime
                PerformanceDiagnostics.shared.increment(.progressPublish)
            }
```

### Edit 2b.5 — crossfade uses the live player position

Find:

```swift
                let timeRemaining = self.duration - self.currentTime
```

Replace:

```swift
                let timeRemaining = self.duration - player.currentTime
```

### Edit 2b.6 — lock screen uses the live player position

Find:

```swift
            MPNowPlayingInfoPropertyElapsedPlaybackTime: currentTime,
```

Replace:

```swift
            MPNowPlayingInfoPropertyElapsedPlaybackTime: player?.currentTime ?? currentTime,
```

Consumers of `currentTime`, all inventoried:

- `AudioPlayerService` itself: `stop()`, `seek(to:)`, crossfade completion and the diagnostic snapshot. These still write or read the plain property, and `didSet` mirrors the value into `progress`.
- `AudioSpectrumAnalyzer.estimatedCurrentTime` reads `player.currentTime` synchronously. It is unchanged because it never relied on publishing.
- `NowPlayingView` has 4 reads. They move into `NowPlayingProgressSection` below.
- No other view reads it; I checked this with a repository-wide search for `.currentTime`.

## File: `RedShiftMobile/RedShiftMobile/Views/NowPlayingView.swift`

### Edit 2b.7 — drop the analyzer observation and the slider state from the parent

Find:

```swift
    @EnvironmentObject var libraryManager: MusicLibraryManager
    @EnvironmentObject var spectrumAnalyzer: AudioSpectrumAnalyzer
    
    @State private var isDraggingSlider = false
    @State private var tempSliderValue: Double = 0
```

(The whitespace-only line contains 4 spaces.)

Replace:

```swift
    @EnvironmentObject var libraryManager: MusicLibraryManager
```

### Edit 2b.8 — full-player bars through `LiveVisualizerBars`

Find:

```swift
                        VisualizerBarsView(
                            levels: spectrumAnalyzer.fullBandLevels,
```

Replace:

```swift
                        LiveVisualizerBars(
                            resolution: .full,
```

### Edit 2b.9 — replace the inline progress block

Find, from `// Progress slider` through the `.padding(.top, 16)` just above `// Controls`. The whitespace-only lines contain, in order, 32, 52, 28, 32 and 32 spaces.

```swift
                        // Progress slider
                        VStack(spacing: 8) {
                            ZStack {
                                // Slider
                                Slider(
                                    value: isDraggingSlider ? $tempSliderValue : Binding(
                                        get: { audioPlayer.currentTime },
                                        set: { _ in }
                                    ),
                                    in: 0...max(audioPlayer.duration, 1),
                                    onEditingChanged: { editing in
                                        if editing {
                                            isDraggingSlider = true
                                            tempSliderValue = audioPlayer.currentTime
                                        } else {
                                            audioPlayer.seek(to: tempSliderValue)
                                            isDraggingSlider = false
                                        }
                                    }
                                )
                                .accentColor(.white)
                                
                                // Tap gesture overlay with modest hit area
                                GeometryReader { geometry in
                                    Rectangle()
                                        .fill(Color.clear)
                                        .contentShape(Rectangle())
                                        .gesture(
                                            DragGesture(minimumDistance: 0)
                                                .onChanged { value in
                                                    let percent = value.location.x / geometry.size.width
                                                    let newTime = percent * audioPlayer.duration
                                                    let clampedTime = max(0, min(newTime, audioPlayer.duration))
                                                    
                                                    if !isDraggingSlider {
                                                        // Direct tap - seek immediately
                                                        audioPlayer.seek(to: clampedTime)
                                                    }
                                                }
                                        )
                                }
                                .frame(height: 30) // Tap target height
                            }
                            .frame(height: 30)
                            // audioPlayer.currentTime only ticks 10x/sec (see
                            // AudioPlayerService's progress timer), so without
                            // an explicit animation the thumb sits still for
                            // 100ms then snaps forward — a visible stair-step.
                            // A linear animation matching that tick interval
                            // makes it glide continuously between updates
                            // instead. Skipped while the user is actively
                            // dragging so their touch isn't fighting an
                            // animation curve.
                            .animation(isDraggingSlider ? nil : .linear(duration: 0.1), value: audioPlayer.currentTime)
                            
                            HStack {
                                Text(formatTime(isDraggingSlider ? tempSliderValue : audioPlayer.currentTime))
                                    .font(.caption)
                                    .foregroundColor(.white.opacity(0.6))
                                    .monospacedDigit()
                                
                                Spacer()
                                
                                Text(formatTime(audioPlayer.duration))
                                    .font(.caption)
                                    .foregroundColor(.white.opacity(0.6))
                                    .monospacedDigit()
                            }
                        }
                        .padding(.horizontal, 32)
                        .padding(.top, 16)
```

Replace:

```swift
                        NowPlayingProgressSection(progress: audioPlayer.progress)
                            .padding(.horizontal, 32)
                            .padding(.top, 16)
```

### Edit 2b.10 — `NowPlayingProgressSection` (also removes the parent's now-unused `formatTime`)

Find:

```swift
    private func formatTime(_ time: TimeInterval) -> String {
        let minutes = Int(time) / 60
        let seconds = Int(time) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
}

// MARK: - Queue View
struct QueueView: View {
```

Replace:

```swift
}

// MARK: - Progress Section
/// Observes only PlaybackProgress, so the 10 Hz position re-renders this
/// slider and its labels instead of the whole Now Playing screen.
struct NowPlayingProgressSection: View {
    @EnvironmentObject var audioPlayer: AudioPlayerService
    @ObservedObject var progress: PlaybackProgress

    @State private var isDraggingSlider = false
    @State private var tempSliderValue: Double = 0

    private var sliderUpperBound: Double { max(audioPlayer.duration, 1) }

    var body: some View {
        VStack(spacing: 8) {
            ZStack {
                Slider(
                    value: isDraggingSlider ? $tempSliderValue : Binding(
                        get: { min(max(progress.currentTime, 0), sliderUpperBound) },
                        set: { _ in }
                    ),
                    in: 0...sliderUpperBound,
                    onEditingChanged: { editing in
                        if editing {
                            isDraggingSlider = true
                            tempSliderValue = min(max(progress.currentTime, 0), sliderUpperBound)
                        } else {
                            audioPlayer.seek(to: tempSliderValue)
                            isDraggingSlider = false
                        }
                    }
                )
                .accentColor(.white)

                // Tap gesture overlay with modest hit area
                GeometryReader { geometry in
                    Rectangle()
                        .fill(Color.clear)
                        .contentShape(Rectangle())
                        .gesture(
                            DragGesture(minimumDistance: 0)
                                .onChanged { value in
                                    // A zero-width layout pass would divide by zero and
                                    // seek to NaN, which UIKit's animation engine traps on.
                                    guard geometry.size.width > 0, !isDraggingSlider else { return }
                                    let percent = value.location.x / geometry.size.width
                                    let clampedTime = max(0, min(percent * audioPlayer.duration, audioPlayer.duration))
                                    guard clampedTime.isFinite else { return }
                                    audioPlayer.seek(to: clampedTime)
                                }
                        )
                }
                .frame(height: 30) // Tap target height
            }
            .frame(height: 30)
            // The position only ticks 10x/sec, so a matching linear animation
            // makes the thumb glide instead of stair-stepping; skipped while
            // dragging so the touch isn't fighting an animation curve.
            .animation(isDraggingSlider ? nil : .linear(duration: 0.1), value: progress.currentTime)

            HStack {
                Text(formatTime(isDraggingSlider ? tempSliderValue : progress.currentTime))
                    .font(.caption)
                    .foregroundColor(.white.opacity(0.6))
                    .monospacedDigit()

                Spacer()

                Text(formatTime(audioPlayer.duration))
                    .font(.caption)
                    .foregroundColor(.white.opacity(0.6))
                    .monospacedDigit()
            }
        }
    }

    private func formatTime(_ time: TimeInterval) -> String {
        guard time.isFinite else { return "0:00" }
        let minutes = Int(time) / 60
        let seconds = Int(time) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
}

// MARK: - Queue View
struct QueueView: View {
```

After this edit the line just before the new `}` is the existing whitespace-only line (4 spaces) that followed `body`. That is valid Swift.

## File: `RedShiftMobile/RedShiftMobile/Views/LibraryDetailViews.swift` (MarqueeText)

### Edit 2b.11 — observe scene phase

Find:

```swift
    @State private var offset: CGFloat = 0
    @State private var scrollTask: Task<Void, Never>?
```

Replace:

```swift
    @State private var offset: CGFloat = 0
    @State private var scrollTask: Task<Void, Never>?
    @Environment(\.scenePhase) private var scenePhase
```

### Edit 2b.12 — pause loops when the app is not active

Find:

```swift
                .onChange(of: text) { _, _ in
                    offset = 0
                    startScrolling(containerWidth: geometry.size.width)
                }
```

Replace:

```swift
                .onChange(of: text) { _, _ in
                    offset = 0
                    startScrolling(containerWidth: geometry.size.width)
                }
                // Background audio keeps the process running, so without this
                // every visible row's scroll loop keeps animating off-screen.
                .onChange(of: scenePhase) { _, phase in
                    if phase == .active {
                        startScrolling(containerWidth: geometry.size.width)
                    } else {
                        scrollTask?.cancel()
                        scrollTask = nil
                        offset = 0
                    }
                }
```

### Edit 2b.13 — never start while inactive

Find:

```swift
        let width = textWidth(text: text, font: font)
```

Replace:

```swift
        guard scenePhase == .active else { return }
        let width = textWidth(text: text, font: font)
```

### Edit 2b.14 — count scroll passes

Find:

```swift
                withAnimation(.linear(duration: scrollDuration)) {
                    offset = -travelDistance
                }
```

Replace:

```swift
                PerformanceDiagnostics.shared.increment(.marqueePass)
                withAnimation(.linear(duration: scrollDuration)) {
                    offset = -travelDistance
                }
```

## File: `RedShiftMobile/RedShiftMobile/Services/MusicLibraryManager.swift` (reconciliation now runs on every foreground)

### Edit 2b.15 — no scanning UI for the stat-only pass

Find:

```swift
        await MainActor.run {
            isScanning = true
            scanProgress = 0
            lastReconciliationError = nil
        }
```

Replace:

```swift
        // The scanning UI replaces the song list, so it appears only when files
        // actually need re-reading, not for the stat-only pass on every foreground.
        await MainActor.run {
            lastReconciliationError = nil
        }
```

### Edit 2b.16 — show scanning only with work to do

Find:

```swift
            let changedEntries = diskEntries.filter {
                existingFingerprints[$0.filePath] != $0.fingerprint || backfillFilePaths.contains($0.filePath)
            }
```

Replace:

```swift
            let changedEntries = diskEntries.filter {
                existingFingerprints[$0.filePath] != $0.fingerprint || backfillFilePaths.contains($0.filePath)
            }
            if !changedEntries.isEmpty {
                await MainActor.run {
                    isScanning = true
                    scanProgress = 0
                }
            }
```

### Edit 2b.17 — skip republishing an unchanged track list

Find:

```swift
            let reloadedTracks = try await databaseService.loadTracks()
            await MainActor.run {
                tracks = reloadedTracks
            }
```

Replace:

```swift
            if !upserts.isEmpty || !deletedFilePaths.isEmpty {
                let reloadedTracks = try await databaseService.loadTracks()
                await MainActor.run {
                    tracks = reloadedTracks
                }
            }
```

### Edit 2b.18 — import desktop playback metadata only for a new sync

Find:

```swift
            await importPlaylistsFromSync()
            await importSyncedPlaybackMetadata()
```

Replace:

```swift
            await importPlaylistsFromSync()
            // play_counts.json is also rewritten by this app's own background
            // export, so re-importing it on every foreground would roll back plays
            // counted since then; only a newly published desktop manifest means the
            // desktop wrote fresher merged values.
            let acceptedManifestRevision = try await databaseService.getSyncStateValue("acceptedManifestRevision")
            if let manifest = manifest, manifest.revision != acceptedManifestRevision {
                await importSyncedPlaybackMetadata()
            }
```

### Edit 2b.19 — duplicate filenames must not crash metadata import

Find:

```swift
            let entriesByFileName = Dictionary(uniqueKeysWithValues: entries.map { ($0.fileName, $0) })
```

Replace:

```swift
            let entriesByFileName = Dictionary(entries.map { ($0.fileName, $0) }, uniquingKeysWith: { first, _ in first })
```

The desktop library holds duplicate basenames (for example two copies of `01 Intro.mp3`). `uniqueKeysWithValues` traps on duplicate keys.
