import XCTest
@testable import RedShiftMobile

final class PlaybackDiagnosticsTests: XCTestCase {
    func testRecordsPersistAcrossInstances() throws {
        let logURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("log")
        defer { try? FileManager.default.removeItem(at: logURL) }

        let diagnostics = PlaybackDiagnostics(logFileURL: logURL)
        diagnostics.record("test", "Playback event")

        let reloadedDiagnostics = PlaybackDiagnostics(logFileURL: logURL)
        XCTAssertTrue(reloadedDiagnostics.recentEntries().contains { $0.contains("[test] Playback event") })
    }

    func testLogKeepsOnlyTheMostRecentEntries() {
        let logURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("log")
        defer { try? FileManager.default.removeItem(at: logURL) }

        let diagnostics = PlaybackDiagnostics(logFileURL: logURL)
        for index in 0...300 {
            diagnostics.record("test", "Event \(index)")
        }

        let entries = diagnostics.recentEntries()
        XCTAssertEqual(entries.count, 300)
        XCTAssertFalse(entries.contains { $0.contains("Event 0") })
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

        performance.writeSnapshot(reason: "test")

        let snapshot = log.recentEntries().last ?? ""
        XCTAssertTrue(snapshot.contains("[perf.snapshot]"))
        XCTAssertTrue(snapshot.contains("reason=test"))
        XCTAssertTrue(snapshot.contains("analyzerTick=2"))
        XCTAssertTrue(snapshot.contains("marqueePass=1"))
        XCTAssertTrue(snapshot.contains("progressPublish=0"))
        XCTAssertTrue(snapshot.contains("analyzerReadAvg=2000us"))
        XCTAssertTrue(snapshot.contains("analyzerReadMax=3000us"))
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
    }
}
