# New file: `RedShiftMobile/RedShiftMobile/Services/AudioSpectrumAnalyzer.swift`

Owns lifecycle/state: the shadow `AVAudioFile` handle, the poll timer, and the published band levels. The actual FFT math lives in the companion extension file `AudioSpectrumAnalyzer+FFT.swift` (see `02-new-file-AudioSpectrumAnalyzer-FFT.md`) so the DSP math stays a plain, independently-testable surface.

Complete file content:

```swift
// AudioSpectrumAnalyzer.swift
// Reads raw PCM samples from the currently playing file in parallel with
// AVAudioPlayer (never touching playback itself) and drives frequency-band
// visualizer bars from a real FFT. AVAudioPlayer has no API to tap its
// output buffers, so this opens a second, read-only AVAudioFile handle to
// the same file and reads a short chunk of samples at the position
// AudioPlayerService reports via currentTime, on every timer tick. Audio
// output, seeking, crossfade, and lock-screen controls are entirely
// unaffected — this class only ever reads bytes for visualization. The FFT
// math itself lives in AudioSpectrumAnalyzer+FFT.swift.

import Foundation
import AVFoundation
import Combine

@MainActor
final class AudioSpectrumAnalyzer: ObservableObject {
    /// One normalized (0...1) level per band, bass-to-treble. 3 bands to
    /// match the desktop visualizer's bass/mid/treble bar treatment.
    @Published private(set) var bandLevels: [CGFloat] = [0, 0, 0]

    weak var audioPlayer: AudioPlayerService?

    let bandCount = 3
    let fftSize = 1024
    let sampleQueue = DispatchQueue(label: "com.redshift.spectrumanalyzer", qos: .userInteractive)

    private var pollTimer: Timer?
    private var audioFile: AVAudioFile?
    private var openTrackID: UUID?
    private var isReading = false

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
        bandLevels = [0, 0, 0]
    }

    private func openFile(for track: Track) {
        guard FileManager.default.fileExists(atPath: track.filePath) else {
            audioFile = nil
            openTrackID = nil
            return
        }
        do {
            audioFile = try AVAudioFile(forReading: track.fileURL)
            openTrackID = track.id
        } catch {
            audioFile = nil
            openTrackID = nil
        }
    }

    private func sampleTick() {
        guard let player = audioPlayer, let track = player.currentTrack else {
            stop()
            return
        }
        if track.id != openTrackID {
            openFile(for: track)
        }
        guard let file = audioFile, !isReading else { return }

        let sampleRate = file.processingFormat.sampleRate
        let totalFrames = file.length
        guard totalFrames > AVAudioFramePosition(fftSize), sampleRate > 0 else { return }

        let targetFrame = AVAudioFramePosition(max(0, player.currentTime) * sampleRate)
        let maxStart = totalFrames - AVAudioFramePosition(fftSize)
        let startFrame = min(max(0, targetFrame), maxStart)
        let format = file.processingFormat
        let size = fftSize
        let bands = bandCount

        isReading = true
        sampleQueue.async { [weak self] in
            let levels = AudioSpectrumAnalyzer.readAndAnalyze(
                file: file,
                format: format,
                startFrame: startFrame,
                fftSize: size,
                bandCount: bands
            )
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.isReading = false
                if let levels = levels {
                    self.bandLevels = levels
                }
            }
        }
    }
}
```

Notes:
- `isReading` and `bandLevels` are only ever touched on the main actor (set before dispatch, reset via the `DispatchQueue.main.async` hop at the end of the background closure) — the background closure itself only calls the `nonisolated` `readAndAnalyze` static function, so there is no actor-isolation violation and no data race on those two properties.
- `file` is captured by the background closure as a specific `AVAudioFile` instance; if `openFile` reassigns `self.audioFile` to a new instance on a later tick (track change), the in-flight closure still safely finishes reading the old instance it captured — the two are independent objects.
