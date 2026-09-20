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
