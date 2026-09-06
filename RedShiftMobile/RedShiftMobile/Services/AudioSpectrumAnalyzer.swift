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
    /// match the desktop visualizer's bass/mid/treble bar treatment; used by
    /// the compact mini player bar.
    @Published private(set) var bandLevels: [CGFloat] = [CGFloat](repeating: 0, count: 3)

    /// Same real spectrum as `bandLevels`, just sliced into more (narrower)
    /// bands for the full-screen Now Playing view, which has room to show
    /// finer frequency detail than the mini player.
    @Published private(set) var fullBandLevels: [CGFloat] = [CGFloat](repeating: 0, count: 7)

    weak var audioPlayer: AudioPlayerService?

    let bandCount = 3
    let fullBandCount = 7
    let fftSize = 1024
    let sampleQueue = DispatchQueue(label: "com.redshift.spectrumanalyzer", qos: .userInteractive)

    // Desktop's Web Audio AnalyserNode applies its own internal exponential
    // smoothing (smoothingTimeConstant, default 0.8) before ever handing
    // frequency data to the visualizer, which is a large part of why it
    // reads as fluid rather than jumpy. Our raw per-tick FFT output has no
    // equivalent smoothing, so each new value replaced the last outright —
    // deliberately blending a fraction of the previous published level into
    // every new one reproduces that same easing here. It is intentionally a
    // display-only decay purely for visual smoothing, not a change to the
    // underlying analysis: the FFT/grouping math is untouched.
    private let smoothing: CGFloat = 0.55

    private func smoothed(previous: [CGFloat], new: [CGFloat]) -> [CGFloat] {
        guard previous.count == new.count else { return new }
        return zip(previous, new).map { $0 * smoothing + $1 * (1 - smoothing) }
    }

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
        bandLevels = [CGFloat](repeating: 0, count: bandCount)
        fullBandLevels = [CGFloat](repeating: 0, count: fullBandCount)
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
        let counts = [bandCount, fullBandCount]

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
