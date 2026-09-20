// PlaybackDiagnostics.swift
// Keeps a bounded, persistent playback event log for post-incident diagnosis.

import AVFoundation
import Foundation
import MetricKit

final class PlaybackDiagnostics: NSObject, MXMetricManagerSubscriber {
    static let shared = PlaybackDiagnostics()

    private let maximumEntries = 300
    private let lock = NSLock()
    private var entries: [String]
    private var isMonitoringAudioSession = false
    private var isMonitoringMetricKit = false
    let logFileURL: URL

    init(logFileURL: URL? = nil) {
        self.logFileURL = logFileURL ?? Self.defaultLogFileURL()
        self.entries = (try? String(contentsOf: self.logFileURL, encoding: .utf8))?
            .split(separator: "\n")
            .map(String.init) ?? []
    }

    func record(_ category: String, _ message: String) {
        let timestamp = ISO8601DateFormatter().string(from: Date())
        let sanitizedMessage = message
            .replacingOccurrences(of: "\n", with: " ")
            .replacingOccurrences(of: "\r", with: " ")
        let entry = "\(timestamp) [\(category)] \(sanitizedMessage.prefix(2_000))"

        lock.lock()
        entries.append(entry)
        if entries.count > maximumEntries {
            entries.removeFirst(entries.count - maximumEntries)
        }
        let output = entries.joined(separator: "\n") + "\n"
        try? output.write(to: logFileURL, atomically: true, encoding: .utf8)
        lock.unlock()
    }

    func clear() {
        lock.lock()
        entries.removeAll()
        lock.unlock()
        try? "".write(to: logFileURL, atomically: true, encoding: .utf8)
        record("diagnostics", "Log cleared")
    }

    func recentEntries() -> [String] {
        lock.lock()
        defer { lock.unlock() }
        return entries
    }

    func startAudioSessionMonitoring() {
        guard !isMonitoringAudioSession else { return }
        isMonitoringAudioSession = true
        let notificationCenter = NotificationCenter.default
        let audioSession = AVAudioSession.sharedInstance()
        notificationCenter.addObserver(self, selector: #selector(audioSessionInterrupted), name: AVAudioSession.interruptionNotification, object: audioSession)
        notificationCenter.addObserver(self, selector: #selector(audioRouteChanged), name: AVAudioSession.routeChangeNotification, object: audioSession)
        notificationCenter.addObserver(self, selector: #selector(mediaServicesWereLost), name: AVAudioSession.mediaServicesWereLostNotification, object: audioSession)
        notificationCenter.addObserver(self, selector: #selector(mediaServicesWereReset), name: AVAudioSession.mediaServicesWereResetNotification, object: audioSession)
        record("audio-session", "Monitoring interruptions, routes, and media-service resets")
    }

    func startMetricKitMonitoring() {
        guard !isMonitoringMetricKit else { return }
        isMonitoringMetricKit = true
        MXMetricManager.shared.add(self)
        record("metrickit", "Subscribed to application-exit metrics")
    }

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

    @objc private func audioSessionInterrupted(_ notification: Notification) {
        let rawType = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt ?? 0
        guard let type = AVAudioSession.InterruptionType(rawValue: rawType) else {
            record("audio-session.interruption", "Unknown interruption event")
            return
        }
        if type == .began {
            record("audio-session.interruption", "Began")
        } else {
            let rawOptions = notification.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
            let shouldResume = AVAudioSession.InterruptionOptions(rawValue: rawOptions).contains(.shouldResume)
            record("audio-session.interruption", "Ended shouldResume=\(shouldResume)")
        }
    }

    @objc private func audioRouteChanged(_ notification: Notification) {
        let reason = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt ?? 0
        record("audio-session.route-change", "Reason=\(reason)")
    }

    @objc private func mediaServicesWereLost(_ notification: Notification) {
        record("audio-session.media-services", "Lost")
    }

    @objc private func mediaServicesWereReset(_ notification: Notification) {
        record("audio-session.media-services", "Reset")
    }

    private static func defaultLogFileURL() -> URL {
        let fileManager = FileManager.default
        let documentsURL = fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let diagnosticsURL = documentsURL.appendingPathComponent("Diagnostics", isDirectory: true)
        try? fileManager.createDirectory(at: diagnosticsURL, withIntermediateDirectories: true)
        return diagnosticsURL.appendingPathComponent("playback-diagnostics.log")
    }
}
