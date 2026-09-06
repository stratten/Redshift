// AudioSpectrumAnalyzerTests.swift
// Verifies the pure FFT/band-grouping math in AudioSpectrumAnalyzer+FFT.swift
// with synthetic sample arrays, independent of any real audio file or
// AVAudioPlayer/AVAudioEngine playback state.

import XCTest
@testable import RedShiftMobile

final class AudioSpectrumAnalyzerTests: XCTestCase {
    private let sampleRate: Float = 44100
    private let fftSize = 1024

    private func sineWave(frequency: Float) -> [Float] {
        (0..<fftSize).map { i in
            sin(2.0 * Float.pi * frequency * Float(i) / sampleRate)
        }
    }

    func testSilenceProducesNearZeroLevels() {
        let silence = [Float](repeating: 0, count: fftSize)
        let levels = AudioSpectrumAnalyzer.computeBandLevels(samples: silence, bandCount: 3)
        XCTAssertEqual(levels.count, 3)
        for level in levels {
            XCTAssertEqual(level, 0, accuracy: 0.01)
        }
    }

    func testLowFrequencyToneDominatesBassBand() {
        let lowTone = sineWave(frequency: 80) // deep bass
        let levels = AudioSpectrumAnalyzer.computeBandLevels(samples: lowTone, bandCount: 3)
        XCTAssertGreaterThan(levels[0], levels[1])
        XCTAssertGreaterThan(levels[0], levels[2])
    }

    func testHighFrequencyToneDominatesTrebleBand() {
        // With fftSize 1024 at 44.1kHz, 512 magnitude bins split into 3 equal
        // bands of ~170 bins each: band0 ~0-7.3kHz, band1 ~7.3-14.6kHz,
        // band2 ~14.6-22kHz. 18kHz falls solidly inside band2 (treble).
        let highTone = sineWave(frequency: 18000)
        let levels = AudioSpectrumAnalyzer.computeBandLevels(samples: highTone, bandCount: 3)
        XCTAssertGreaterThan(levels[2], levels[0])
        XCTAssertGreaterThan(levels[2], levels[1])
    }

    func testNonPowerOfTwoSampleCountReturnsZeroedBandsInsteadOfCrashing() {
        let oddSizedSamples = [Float](repeating: 0.5, count: 1000)
        let levels = AudioSpectrumAnalyzer.computeBandLevels(samples: oddSizedSamples, bandCount: 3)
        XCTAssertEqual(levels, [0, 0, 0])
    }

    func testLevelsAreClampedToUnitRange() {
        let loudTone = sineWave(frequency: 80).map { $0 * 1000 } // extreme amplitude
        let levels = AudioSpectrumAnalyzer.computeBandLevels(samples: loudTone, bandCount: 3)
        for level in levels {
            XCTAssertLessThanOrEqual(level, 1.0)
            XCTAssertGreaterThanOrEqual(level, 0.0)
        }
    }
}
