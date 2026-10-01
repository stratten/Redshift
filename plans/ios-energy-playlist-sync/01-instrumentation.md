# 01 — Diagnostics and Instrumentation (apply first)

Everything in later companion files calls `PerformanceDiagnostics`, so this file must be applied before 02–07. No new Swift files are created (the Xcode project does not use synchronized folders; a new file would require hand-editing `project.pbxproj`). `PerformanceDiagnostics` therefore lives at the bottom of `PlaybackDiagnostics.swift`.

## File: `RedShiftMobile/RedShiftMobile/Services/PlaybackDiagnostics.swift`

### Edit 1.1 — imports

Find:

```swift
import AVFoundation
import Foundation
import MetricKit
```

Replace:

```swift
import AVFoundation
import Foundation
import MetricKit
import os
import UIKit
```

### Edit 1.2 — cached timestamp formatter

Find:

```swift
    private let maximumEntries = 300
```

Replace:

```swift
    private static let timestampFormatter = ISO8601DateFormatter()
    private let maximumEntries = 300
```

### Edit 1.3 — use the cached formatter

Find:

```swift
        let timestamp = ISO8601DateFormatter().string(from: Date())
```

Replace:

```swift
        let timestamp = Self.timestampFormatter.string(from: Date())
```

### Edit 1.4 — MetricKit subscription message

Find:

```swift
        record("metrickit", "Subscribed to application-exit metrics")
```

Replace:

```swift
        record("metrickit", "Subscribed to metric and diagnostic payloads")
```

### Edit 1.5 — replace the metric payload handler and add the diagnostic payload handler

Find (the entire existing function):

```swift
    func didReceive(_ payloads: [MXMetricPayload]) {
        for payload in payloads {
            let payloadData = payload.jsonRepresentation()
            guard let payloadObject = try? JSONSerialization.jsonObject(with: payloadData) as? [String: Any],
                  let exitMetrics = payloadObject["applicationExitMetrics"],
                  JSONSerialization.isValidJSONObject(exitMetrics),
                  let exitData = try? JSONSerialization.data(withJSONObject: exitMetrics, options: [.sortedKeys]),
                  let exitSummary = String(data: exitData, encoding: .utf8) else {
                continue
            }
            record("metrickit.application-exit", exitSummary)
        }
    }
```

Replace:

```swift
    func didReceive(_ payloads: [MXMetricPayload]) {
        for payload in payloads {
            let payloadData = payload.jsonRepresentation()
            let savedURL = Self.saveMetricKitPayload(payloadData, prefix: "metrics")
            record("metrickit.metrics", "Payload \(payload.timeStampBegin) → \(payload.timeStampEnd) saved=\(savedURL?.lastPathComponent ?? "failed")")
            guard let payloadObject = try? JSONSerialization.jsonObject(with: payloadData) as? [String: Any] else {
                continue
            }
            if let exitSummary = Self.compactJSON(payloadObject["applicationExitMetrics"]) {
                record("metrickit.application-exit", exitSummary)
            }
            for section in Self.performanceMetricSections {
                if let summary = Self.compactJSON(payloadObject[section]) {
                    PerformanceDiagnostics.shared.log.record("metrickit.\(section)", summary)
                }
            }
        }
    }

    func didReceive(_ payloads: [MXDiagnosticPayload]) {
        for payload in payloads {
            let savedURL = Self.saveMetricKitPayload(payload.jsonRepresentation(), prefix: "diagnostics")
            record("metrickit.diagnostics", "crashes=\(payload.crashDiagnostics?.count ?? 0) hangs=\(payload.hangDiagnostics?.count ?? 0) cpuExceptions=\(payload.cpuExceptionDiagnostics?.count ?? 0) diskWriteExceptions=\(payload.diskWriteExceptionDiagnostics?.count ?? 0) saved=\(savedURL?.lastPathComponent ?? "failed")")
            for crash in payload.crashDiagnostics ?? [] {
                let exceptionType = crash.exceptionType?.stringValue ?? "nil"
                let signal = crash.signal?.stringValue ?? "nil"
                record("metrickit.crash", "build=\(crash.metaData.applicationBuildVersion) exceptionType=\(exceptionType) signal=\(signal) reason=\(crash.terminationReason ?? "nil")")
            }
            for hang in payload.hangDiagnostics ?? [] {
                record("metrickit.hang", "build=\(hang.metaData.applicationBuildVersion) duration=\(hang.hangDuration)")
            }
        }
    }
```

### Edit 1.6 — directory helpers, MetricKit file storage, export list, and `PerformanceDiagnostics`

Find (the end of the file):

```swift
    private static func defaultLogFileURL() -> URL {
        let fileManager = FileManager.default
        let documentsURL = fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let diagnosticsURL = documentsURL.appendingPathComponent("Diagnostics", isDirectory: true)
        try? fileManager.createDirectory(at: diagnosticsURL, withIntermediateDirectories: true)
        return diagnosticsURL.appendingPathComponent("playback-diagnostics.log")
    }
}
```

Replace:

```swift
    static let performanceMetricSections = [
        "cpuMetrics",
        "gpuMetrics",
        "applicationTimeMetrics",
        "memoryMetrics",
        "diskIOMetrics",
        "animationMetrics",
        "applicationResponsivenessMetrics",
        "displayMetrics",
        "networkTransferMetrics",
        "locationActivityMetrics"
    ]

    static func diagnosticsDirectoryURL() -> URL {
        let fileManager = FileManager.default
        let documentsURL = fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let diagnosticsURL = documentsURL.appendingPathComponent("Diagnostics", isDirectory: true)
        try? fileManager.createDirectory(at: diagnosticsURL, withIntermediateDirectories: true)
        return diagnosticsURL
    }

    static func diagnosticsFileURL(named name: String) -> URL {
        diagnosticsDirectoryURL().appendingPathComponent(name)
    }

    private static func defaultLogFileURL() -> URL {
        diagnosticsFileURL(named: "playback-diagnostics.log")
    }

    private static func metricKitDirectoryURL() -> URL {
        diagnosticsDirectoryURL().appendingPathComponent("MetricKit", isDirectory: true)
    }

    /// Every file worth attaching to a problem report: both logs plus the raw
    /// MetricKit payloads (crash call stacks, hangs, CPU/GPU/energy metrics).
    static func exportableFileURLs() -> [URL] {
        let fileManager = FileManager.default
        var urls = [PlaybackDiagnostics.shared.logFileURL, PerformanceDiagnostics.shared.log.logFileURL]
        if let files = try? fileManager.contentsOfDirectory(at: metricKitDirectoryURL(), includingPropertiesForKeys: nil) {
            urls.append(contentsOf: files.sorted { $0.lastPathComponent < $1.lastPathComponent })
        }
        return urls.filter { fileManager.fileExists(atPath: $0.path) }
    }

    private static func compactJSON(_ value: Any?) -> String? {
        guard let value = value,
              JSONSerialization.isValidJSONObject(value),
              let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]) else {
            return nil
        }
        return String(data: data, encoding: .utf8)
    }

    @discardableResult
    static func saveMetricKitPayload(_ data: Data, prefix: String) -> URL? {
        let directory = metricKitDirectoryURL()
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let fileURL = directory.appendingPathComponent("\(prefix)-\(Int(Date().timeIntervalSince1970))-\(UUID().uuidString.prefix(8)).json")
        do {
            try data.write(to: fileURL, options: .atomic)
            pruneMetricKitDirectory(directory, keeping: 20)
            return fileURL
        } catch {
            return nil
        }
    }

    private static func pruneMetricKitDirectory(_ directory: URL, keeping limit: Int) {
        let fileManager = FileManager.default
        guard let files = try? fileManager.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.contentModificationDateKey]) else {
            return
        }
        let newestFirst = files.sorted {
            let lhs = (try? $0.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
            let rhs = (try? $1.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
            return lhs > rhs
        }
        for file in newestFirst.dropFirst(limit) {
            try? fileManager.removeItem(at: file)
        }
    }
}

/// Low-overhead energy/performance counters plus a once-a-minute snapshot.
/// Hot paths only bump integers behind a lock; the snapshot is the only I/O
/// and goes to its own bounded log so periodic entries never push playback
/// events out of playback-diagnostics.log.
final class PerformanceDiagnostics: NSObject {
    enum Counter: String, CaseIterable {
        case analyzerTick
        case analyzerTickSkippedBusy
        case analyzerPublish
        case progressTick
        case progressPublish
        case marqueePass
    }

    static let shared = PerformanceDiagnostics()
    static let signposter = OSSignposter(subsystem: "com.redshiftplayer.mobile", category: "Performance")

    let log: PlaybackDiagnostics
    /// Supplies playback/analyzer state for each snapshot; set once at launch.
    var stateProvider: (@MainActor () -> String)?

    private let lock = NSLock()
    private var counts: [Counter: Int] = [:]
    private var analyzerReadTotalNanoseconds: UInt64 = 0
    private var analyzerReadMaxNanoseconds: UInt64 = 0
    private var analyzerReadCount = 0
    private var lastSnapshotUptime = ProcessInfo.processInfo.systemUptime
    private var lastCPUSeconds = PerformanceDiagnostics.processCPUSeconds()
    private var snapshotTimer: Timer?

    init(log: PlaybackDiagnostics = PlaybackDiagnostics(logFileURL: PlaybackDiagnostics.diagnosticsFileURL(named: "performance-diagnostics.log"))) {
        self.log = log
        super.init()
    }

    func increment(_ counter: Counter) {
        lock.lock()
        counts[counter, default: 0] += 1
        lock.unlock()
    }

    func count(of counter: Counter) -> Int {
        lock.lock()
        defer { lock.unlock() }
        return counts[counter, default: 0]
    }

    func recordAnalyzerRead(nanoseconds: UInt64) {
        lock.lock()
        analyzerReadTotalNanoseconds &+= nanoseconds
        analyzerReadMaxNanoseconds = max(analyzerReadMaxNanoseconds, nanoseconds)
        analyzerReadCount += 1
        lock.unlock()
    }

    @MainActor
    func start() {
        guard snapshotTimer == nil else { return }
        UIDevice.current.isBatteryMonitoringEnabled = true
        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(thermalStateChanged), name: ProcessInfo.thermalStateDidChangeNotification, object: nil)
        center.addObserver(self, selector: #selector(powerStateChanged), name: .NSProcessInfoPowerStateDidChange, object: nil)
        let timer = Timer(timeInterval: 60, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated {
                self?.writeSnapshot(reason: "interval")
            }
        }
        timer.tolerance = 10
        RunLoop.main.add(timer, forMode: .common)
        snapshotTimer = timer
        writeSnapshot(reason: "launch")
    }

    /// Resets the counters so each logged line covers exactly one interval.
    @MainActor
    func writeSnapshot(reason: String) {
        let now = ProcessInfo.processInfo.systemUptime
        let cpuSeconds = Self.processCPUSeconds()

        lock.lock()
        let intervalSeconds = max(now - lastSnapshotUptime, 0.001)
        let cpuPercent = max(0, cpuSeconds - lastCPUSeconds) / intervalSeconds * 100
        let counterSummary = Counter.allCases
            .map { "\($0.rawValue)=\(counts[$0, default: 0])" }
            .joined(separator: " ")
        let averageReadMicroseconds = analyzerReadCount > 0 ? Double(analyzerReadTotalNanoseconds) / Double(analyzerReadCount) / 1_000 : 0
        let maxReadMicroseconds = Double(analyzerReadMaxNanoseconds) / 1_000
        counts.removeAll()
        analyzerReadTotalNanoseconds = 0
        analyzerReadMaxNanoseconds = 0
        analyzerReadCount = 0
        lastSnapshotUptime = now
        lastCPUSeconds = cpuSeconds
        lock.unlock()

        let device = UIDevice.current
        let battery = device.batteryLevel >= 0 ? "\(Int((device.batteryLevel * 100).rounded()))%" : "unknown"
        let applicationState: String
        switch UIApplication.shared.applicationState {
        case .active: applicationState = "active"
        case .inactive: applicationState = "inactive"
        case .background: applicationState = "background"
        @unknown default: applicationState = "unknown"
        }
        let appState = stateProvider?() ?? ""
        let message = "reason=\(reason) interval=\(Int(intervalSeconds))s cpu=\(String(format: "%.1f", cpuPercent))% thermal=\(Self.thermalStateName(ProcessInfo.processInfo.thermalState)) battery=\(battery) batteryState=\(Self.batteryStateName(device.batteryState)) lowPower=\(ProcessInfo.processInfo.isLowPowerModeEnabled) app=\(applicationState) \(appState) analyzerReadAvg=\(Int(averageReadMicroseconds))us analyzerReadMax=\(Int(maxReadMicroseconds))us \(counterSummary)"
        log.record("perf.snapshot", message)
    }

    @objc private func thermalStateChanged(_ notification: Notification) {
        Task { @MainActor [weak self] in
            self?.writeSnapshot(reason: "thermal-change")
        }
    }

    @objc private func powerStateChanged(_ notification: Notification) {
        Task { @MainActor [weak self] in
            self?.writeSnapshot(reason: "low-power-change")
        }
    }

    /// User + system CPU time consumed by this process since launch. Percent
    /// values derived from it can exceed 100 because every core counts.
    static func processCPUSeconds() -> Double {
        var usage = rusage()
        guard getrusage(RUSAGE_SELF, &usage) == 0 else { return 0 }
        let user = Double(usage.ru_utime.tv_sec) + Double(usage.ru_utime.tv_usec) / 1_000_000
        let system = Double(usage.ru_stime.tv_sec) + Double(usage.ru_stime.tv_usec) / 1_000_000
        return user + system
    }

    static func thermalStateName(_ state: ProcessInfo.ThermalState) -> String {
        switch state {
        case .nominal: return "nominal"
        case .fair: return "fair"
        case .serious: return "serious"
        case .critical: return "critical"
        @unknown default: return "unknown"
        }
    }

    static func batteryStateName(_ state: UIDevice.BatteryState) -> String {
        switch state {
        case .unplugged: return "unplugged"
        case .charging: return "charging"
        case .full: return "full"
        case .unknown: return "unknown"
        @unknown default: return "unknown"
        }
    }
}
```

## File: `RedShiftMobile/RedShiftMobile/App/RedShiftMobileApp.swift`

### Edit 1.7 — start performance snapshots at launch

Find:

```swift
                    PlaybackDiagnostics.shared.record("app.lifecycle", "Window appeared")
                    PlaybackDiagnostics.shared.startMetricKitMonitoring()
```

Replace:

```swift
                    PlaybackDiagnostics.shared.record("app.lifecycle", "Window appeared")
                    PlaybackDiagnostics.shared.startMetricKitMonitoring()
                    PerformanceDiagnostics.shared.stateProvider = { [weak player = audioPlayer, weak analyzer = spectrumAnalyzer] in
                        "isPlaying=\(player?.isPlaying ?? false) analyzerRunning=\(analyzer?.isRunning ?? false)"
                    }
                    PerformanceDiagnostics.shared.start()
```

`analyzer?.isRunning` is added by companion file 02 (Edit 2.4). Build only after 02 is applied.

## File: `RedShiftMobile/RedShiftMobile/Views/SettingsView.swift`

### Edit 1.8 — export every diagnostics file, show thermal state, manual snapshot

Find:

```swift
                    ShareLink(item: PlaybackDiagnostics.shared.logFileURL) {
                        Label("Export Playback Log", systemImage: "square.and.arrow.up")
                    }
```

Replace:

```swift
                    ShareLink(items: PlaybackDiagnostics.exportableFileURLs()) {
                        Label("Export Diagnostics", systemImage: "square.and.arrow.up")
                    }

                    HStack {
                        Text("Thermal State")
                        Spacer()
                        Text(PerformanceDiagnostics.thermalStateName(ProcessInfo.processInfo.thermalState).capitalized)
                            .foregroundColor(.gray)
                    }

                    Button(action: {
                        PerformanceDiagnostics.shared.writeSnapshot(reason: "manual")
                    }) {
                        Label("Record Performance Snapshot", systemImage: "gauge.with.dots.needle.50percent")
                    }
```

### Edit 1.9 — clear both logs

Find:

```swift
                        PlaybackDiagnostics.shared.clear()
                    }) {
                        Label("Clear Playback Log", systemImage: "trash")
```

Replace:

```swift
                        PlaybackDiagnostics.shared.clear()
                        PerformanceDiagnostics.shared.log.clear()
                    }) {
                        Label("Clear Diagnostic Logs", systemImage: "trash")
```

### Edit 1.10 — section header

Find:

```swift
                    Text("Playback Diagnostics")
```

Replace:

```swift
                    Text("Diagnostics")
```

### Edit 1.11 — section footer

Find:

```swift
                    Text("Exports the most recent playback, queue, background, audio-session, and error events. Share this file after audio stops unexpectedly.")
```

Replace:

```swift
                    Text("Exports the playback event log, the per-minute performance log (CPU, thermal state, battery, visualizer and timer activity), and any MetricKit crash, hang, and energy reports iOS has delivered. Share these after a crash, an unexpected stop, or noticeable battery drain.")
```

## Hazards

- `writeSnapshot` and `start` are `@MainActor`. The snapshot timer runs on the main run loop, so `MainActor.assumeIsolated` is valid there. The thermal and power notifications may post on any thread, so they hop to the main actor with `Task { @MainActor in ... }`.
- `PerformanceDiagnostics.shared` builds its own `PlaybackDiagnostics` for `performance-diagnostics.log`. The 300-entry cap therefore applies to each log separately, and the existing `PlaybackDiagnosticsTests` assertion of exactly 300 entries stays valid.
- MetricKit delivers metric payloads about once a day and diagnostic payloads (crash call stacks, hangs) on the next launch. TestFlight builds receive both. You can't exercise these in the simulator except through Xcode's Debug > Simulate MetricKit Payloads.
