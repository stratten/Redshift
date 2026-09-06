# New file: `RedShiftMobile/RedShiftMobile/Services/AudioSpectrumAnalyzer+FFT.swift`

Pure DSP math, `nonisolated` so it can run on a background queue and be called directly from unit tests with synthetic sample arrays (see `04-new-file-AudioSpectrumAnalyzerTests.md`).

Complete file content:

```swift
// AudioSpectrumAnalyzer+FFT.swift
// Pure, off-main-actor DSP: reads one PCM chunk from a shared AVAudioFile
// handle and reduces it to coarse per-band frequency levels via Accelerate.
// Split out from AudioSpectrumAnalyzer.swift so the FFT math is a plain
// nonisolated/static surface that unit tests can call directly with
// synthetic sample arrays, with no AVAudioFile or actor isolation involved.

import Foundation
import AVFoundation
import Accelerate

extension AudioSpectrumAnalyzer {
    /// Runs entirely off the main actor: seeks the shared read-only file
    /// handle, reads one chunk of PCM, and computes band levels. Safe
    /// because `sampleTick` never dispatches a second read while `isReading`
    /// is true, so this never runs concurrently against the same file.
    nonisolated static func readAndAnalyze(
        file: AVAudioFile,
        format: AVAudioFormat,
        startFrame: AVAudioFramePosition,
        fftSize: Int,
        bandCount: Int
    ) -> [CGFloat]? {
        file.framePosition = startFrame
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(fftSize)) else {
            return nil
        }
        do {
            try file.read(into: buffer, frameCount: AVAudioFrameCount(fftSize))
        } catch {
            return nil
        }
        guard let channelData = buffer.floatChannelData, Int(buffer.frameLength) == fftSize else {
            return nil
        }

        let channelCount = Int(buffer.format.channelCount)
        var samples = [Float](repeating: 0, count: fftSize)
        for i in 0..<fftSize {
            var sum: Float = 0
            for channel in 0..<channelCount {
                sum += channelData[channel][i]
            }
            samples[i] = sum / Float(channelCount)
        }

        return computeBandLevels(samples: samples, bandCount: bandCount)
    }

    /// Pure and independently testable: windows the samples, runs a real
    /// FFT, groups magnitude bins into `bandCount` coarse bands, and
    /// normalizes each band to 0...1. `samples.count` must be a power of two
    /// (the caller always passes `fftSize` samples); any other count returns
    /// zeroed bands rather than crashing.
    nonisolated static func computeBandLevels(samples: [Float], bandCount: Int) -> [CGFloat] {
        let n = samples.count
        guard n > 0, n & (n - 1) == 0 else { return [CGFloat](repeating: 0, count: bandCount) }

        var window = [Float](repeating: 0, count: n)
        vDSP_hann_window(&window, vDSP_Length(n), Int32(vDSP_HANN_NORM))
        var windowed = [Float](repeating: 0, count: n)
        vDSP_vmul(samples, 1, window, 1, &windowed, 1, vDSP_Length(n))

        let log2n = vDSP_Length(log2(Double(n)))
        guard let fftSetup = vDSP_create_fftsetup(log2n, FFTRadix(kFFTRadix2)) else {
            return [CGFloat](repeating: 0, count: bandCount)
        }
        defer { vDSP_destroy_fftsetup(fftSetup) }

        var realp = [Float](repeating: 0, count: n / 2)
        var imagp = [Float](repeating: 0, count: n / 2)
        var magnitudes = [Float](repeating: 0, count: n / 2)

        realp.withUnsafeMutableBufferPointer { realPtr in
            imagp.withUnsafeMutableBufferPointer { imagPtr in
                var splitComplex = DSPSplitComplex(realp: realPtr.baseAddress!, imagp: imagPtr.baseAddress!)
                windowed.withUnsafeBufferPointer { windowedPtr in
                    windowedPtr.baseAddress!.withMemoryRebound(to: DSPComplex.self, capacity: n / 2) { complexPtr in
                        vDSP_ctoz(complexPtr, 2, &splitComplex, 1, vDSP_Length(n / 2))
                    }
                }
                vDSP_fft_zrip(fftSetup, &splitComplex, 1, log2n, FFTDirection(FFT_FORWARD))
                vDSP_zvabs(&splitComplex, 1, &magnitudes, 1, vDSP_Length(n / 2))
            }
        }

        let binsPerBand = max(1, magnitudes.count / bandCount)
        var levels: [CGFloat] = []
        for band in 0..<bandCount {
            let start = band * binsPerBand
            let end = min(start + binsPerBand, magnitudes.count)
            guard end > start else {
                levels.append(0)
                continue
            }
            let sum = magnitudes[start..<end].reduce(0, +)
            let average = sum / Float(end - start)
            // FFT magnitude units are arbitrary; this divisor is an
            // empirically chosen scale that maps typical music-level PCM
            // samples into a usable 0...1 range without most content
            // clipping to 1.
            let normalized = min(1, max(0, average / 40))
            levels.append(CGFloat(normalized))
        }
        return levels
    }
}
```
