# 07a — Mobile Tests

The test target `RedShiftMobileTests` is hosted (`TEST_HOST` is set), so `UIApplication.shared` and `UIDevice.current` exist. New test classes are appended to existing test files because the Xcode project does not use synchronized groups: a new `.swift` file would also need `project.pbxproj` edits (settled decision 7 in the index).

Command (run from the repository root):

```bash
xcodebuild test -project RedShiftMobile/RedShiftMobile.xcodeproj -scheme RedShiftMobile -destination 'platform=iOS Simulator,name=iPhone 17 Pro'
```

## File: `RedShiftMobile/RedShiftMobileTests/SyncManifestTests.swift`

### Edit 7a.1 — playlist import policy and edit stamps

Find:

```swift
        XCTAssertThrowsError(try JSONDecoder().decode(SyncManifest.self, from: Data(json.utf8)))
    }
}
```

Replace:

```swift
        XCTAssertThrowsError(try JSONDecoder().decode(SyncManifest.self, from: Data(json.utf8)))
    }
}

final class PlaylistSyncImportPolicyTests: XCTestCase {
    private func playlist(ids: [String], modified: TimeInterval) -> Playlist {
        Playlist(name: "Feel", trackStableIDs: ids, modifiedDate: Date(timeIntervalSince1970: modified))
    }

    func testCreatesWhenNoLocalPlaylist() {
        let decision = PlaylistSyncImportPolicy.decide(local: nil, incomingTrackStableIDs: ["a"], incomingModified: Date(timeIntervalSince1970: 10))
        XCTAssertEqual(decision, .create)
    }

    func testIdenticalTrackListIsUnchangedRegardlessOfStamp() {
        let local = playlist(ids: ["a", "b"], modified: 500)
        let decision = PlaylistSyncImportPolicy.decide(local: local, incomingTrackStableIDs: ["a", "b"], incomingModified: Date(timeIntervalSince1970: 100))
        XCTAssertEqual(decision, .unchanged)
    }

    func testNewerIncomingReplaces() {
        let local = playlist(ids: ["a"], modified: 100)
        let decision = PlaylistSyncImportPolicy.decide(local: local, incomingTrackStableIDs: ["a", "b"], incomingModified: Date(timeIntervalSince1970: 101))
        XCTAssertEqual(decision, .replace)
    }

    func testSameWholeSecondReplacesDespiteFractionalLocalStamp() {
        // The desktop floors stamps; a local 1000.7 against an incoming 1000 is the same edit.
        let local = playlist(ids: ["a"], modified: 1000.7)
        let decision = PlaylistSyncImportPolicy.decide(local: local, incomingTrackStableIDs: ["b"], incomingModified: Date(timeIntervalSince1970: 1000))
        XCTAssertEqual(decision, .replace)
    }

    func testOlderIncomingKeepsNewerLocalEdit() {
        let local = playlist(ids: ["a", "b", "c"], modified: 2000)
        let decision = PlaylistSyncImportPolicy.decide(local: local, incomingTrackStableIDs: ["a"], incomingModified: Date(timeIntervalSince1970: 1999))
        XCTAssertEqual(decision, .keepLocal)
    }

    func testEmptyIncomingOlderThanLocalKeepsLocal() {
        let local = playlist(ids: ["a"], modified: 50)
        let decision = PlaylistSyncImportPolicy.decide(local: local, incomingTrackStableIDs: [], incomingModified: Date(timeIntervalSince1970: 49))
        XCTAssertEqual(decision, .keepLocal)
    }

    func testNextModifiedDateUsesNowWhenLater() {
        let next = Playlist.nextModifiedDate(after: Date(timeIntervalSince1970: 100.9), now: Date(timeIntervalSince1970: 500.4))
        XCTAssertEqual(next.timeIntervalSince1970, 500)
    }

    func testNextModifiedDateAdvancesPastFutureStampFromSkewedDesktopClock() {
        let next = Playlist.nextModifiedDate(after: Date(timeIntervalSince1970: 900.2), now: Date(timeIntervalSince1970: 800))
        XCTAssertEqual(next.timeIntervalSince1970, 901)
    }

    func testNextModifiedDateAdvancesWithinTheSameSecond() {
        let next = Playlist.nextModifiedDate(after: Date(timeIntervalSince1970: 700), now: Date(timeIntervalSince1970: 700.5))
        XCTAssertEqual(next.timeIntervalSince1970, 701)
    }
}
```

## File: `RedShiftMobile/RedShiftMobileTests/AudioSpectrumAnalyzerTests.swift`

### Edit 7a.2 — publish gating and FFT context caching

Find:

```swift
            XCTAssertGreaterThanOrEqual(level, 0.0)
        }
    }
}
```

Replace:

```swift
            XCTAssertGreaterThanOrEqual(level, 0.0)
        }
    }
}

final class SpectrumPublishingTests: XCTestCase {
    func testSubPixelChangeDoesNotPublish() {
        XCTAssertFalse(AudioSpectrumAnalyzer.differsVisibly([0.5, 0.2], [0.503, 0.2]))
    }

    func testVisibleChangePublishes() {
        XCTAssertTrue(AudioSpectrumAnalyzer.differsVisibly([0.5, 0.2], [0.5, 0.21]))
    }

    func testBandCountChangePublishes() {
        XCTAssertTrue(AudioSpectrumAnalyzer.differsVisibly([0.5], [0.5, 0.5]))
    }

    func testIdenticalSilenceDoesNotPublish() {
        let silent = [CGFloat](repeating: 0, count: 24)
        XCTAssertFalse(AudioSpectrumAnalyzer.differsVisibly(silent, silent))
    }

    func testAnalyzerSizeContextIsBuiltOnce() {
        let first = FFTContext.context(for: 1024)
        let second = FFTContext.context(for: 1024)
        XCTAssertNotNil(first)
        XCTAssertTrue(first === second)
        XCTAssertEqual(first?.window.count, 1024)
    }

    func testOtherPowerOfTwoSizesStillWork() {
        let context = FFTContext.context(for: 512)
        XCTAssertNotNil(context)
        XCTAssertFalse(context === FFTContext.context(for: 1024))
        XCTAssertEqual(context?.log2n, 9)
    }

    func testNonPowerOfTwoSizeIsRejected() {
        XCTAssertNil(FFTContext.context(for: 1000))
        XCTAssertNil(FFTContext.context(for: 0))
    }
}
```

## File: `RedShiftMobile/RedShiftMobileTests/PlaybackDiagnosticsTests.swift`

### Edit 7a.3 — snapshot contents and counter reset

Find:

```swift
        XCTAssertTrue(entries.contains { $0.contains("Event 300") })
    }
}
```

Replace:

```swift
        XCTAssertTrue(entries.contains { $0.contains("Event 300") })
    }
}

@MainActor
final class PerformanceDiagnosticsTests: XCTestCase {
    private func makeDiagnostics() -> (PerformanceDiagnostics, PlaybackDiagnostics, URL) {
        let logURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("log")
        let log = PlaybackDiagnostics(logFileURL: logURL)
        return (PerformanceDiagnostics(log: log), log, logURL)
    }

    func testSnapshotLogsCountersAndReadTimingThenResets() {
        let (performance, log, logURL) = makeDiagnostics()
        defer { try? FileManager.default.removeItem(at: logURL) }

        performance.increment(.analyzerTick)
        performance.increment(.analyzerTick)
        performance.increment(.marqueePass)
        performance.recordAnalyzerRead(nanoseconds: 1_000_000)
        performance.recordAnalyzerRead(nanoseconds: 3_000_000)
        XCTAssertEqual(performance.count(of: .analyzerTick), 2)

        performance.writeSnapshot(reason: "test")

        let snapshot = log.recentEntries().last ?? ""
        XCTAssertTrue(snapshot.contains("[perf.snapshot]"))
        XCTAssertTrue(snapshot.contains("reason=test"))
        XCTAssertTrue(snapshot.contains("analyzerTick=2"))
        XCTAssertTrue(snapshot.contains("marqueePass=1"))
        XCTAssertTrue(snapshot.contains("progressPublish=0"))
        XCTAssertTrue(snapshot.contains("analyzerReadAvg=2000us"))
        XCTAssertTrue(snapshot.contains("analyzerReadMax=3000us"))
        XCTAssertTrue(snapshot.contains("thermal="))
        XCTAssertEqual(performance.count(of: .analyzerTick), 0)
        XCTAssertEqual(performance.count(of: .marqueePass), 0)
    }

    func testSecondSnapshotCoversOnlyItsOwnInterval() {
        let (performance, log, logURL) = makeDiagnostics()
        defer { try? FileManager.default.removeItem(at: logURL) }

        performance.increment(.progressTick)
        performance.writeSnapshot(reason: "first")
        performance.writeSnapshot(reason: "second")

        let second = log.recentEntries().last ?? ""
        XCTAssertTrue(second.contains("reason=second"))
        XCTAssertTrue(second.contains("progressTick=0"))
        XCTAssertTrue(second.contains("analyzerReadAvg=0us"))
    }

    func testProcessCPUSecondsIsMonotonic() {
        let first = PerformanceDiagnostics.processCPUSeconds()
        var sink = 0.0
        for index in 0..<200_000 { sink += sqrt(Double(index)) }
        XCTAssertGreaterThan(sink, 0)
        XCTAssertGreaterThanOrEqual(PerformanceDiagnostics.processCPUSeconds(), first)
        XCTAssertGreaterThan(first, 0)
    }

    func testThermalStateNamesAreStable() {
        XCTAssertEqual(PerformanceDiagnostics.thermalStateName(.nominal), "nominal")
        XCTAssertEqual(PerformanceDiagnostics.thermalStateName(.critical), "critical")
    }
}
```

`PlaybackDiagnostics.record` formats entries as `[category] message`. The existing test `testRecordsPersistAcrossInstances` already relies on this, so `[perf.snapshot]` is the exact prefix.

## Tests that must keep passing unchanged (regression)

- `AudioSpectrumAnalyzerTests` (band math through the cached `FFTContext` path, Edit 2.8).
- `PlaybackDiagnosticsTests` (300-entry cap). The performance log is a separate instance, so the playback log's cap is unaffected.
- `DatabaseReconciliationTests` and `SyncManifestTests` (manifest decode is untouched).
