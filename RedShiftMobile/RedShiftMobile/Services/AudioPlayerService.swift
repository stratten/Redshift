// AudioPlayerService.swift
// Core audio playback engine using AVFoundation

import Foundation
import AVFoundation
import MediaPlayer
import Combine
import UIKit

enum RepeatMode: String, Codable {
    case off = "off"
    case all = "all"
    case one = "one"
}

class AudioPlayerService: NSObject, ObservableObject {
    // MARK: - Published Properties
    @Published var isPlaying: Bool = false
    @Published var currentTrack: Track?
    @Published var currentTime: TimeInterval = 0
    @Published var duration: TimeInterval = 0
    @Published var shuffleEnabled: Bool = false
    @Published var repeatMode: RepeatMode = .off
    @Published var queue: [Track] = []
    @Published var currentIndex: Int = 0
    @Published var volume: Float = 1.0
    @Published var sleepTimerMinutesRemaining: Int? = nil // nil = off, else minutes remaining
    @Published var playbackRate: Float = 1.0 // 0.5x to 2.0x
    @Published var crossfadeDuration: TimeInterval = 0 // 0 = off, 1-12 seconds
    
    // MARK: - Private Properties
    private var player: AVAudioPlayer?
    private var nextPlayer: AVAudioPlayer? // For crossfade
    private var timer: Timer?
    private var sleepTimer: Timer?
    private var sleepTimerEndDate: Date?
    private var crossfadeTimer: Timer?
    private var isCrossfading: Bool = false
    private var originalQueue: [Track] = [] // For shuffle/unshuffle
    private var lastDiagnosticHeartbeat = Date.distantPast
    private var lastProgressTime: TimeInterval = 0
    private var lastProgressDate = Date()
    private var wasPlayingBeforeInterruption = false
    weak var libraryManager: MusicLibraryManager? // For updating play counts

    override init() {
        super.init()
        PlaybackDiagnostics.shared.startAudioSessionMonitoring()
        PlaybackDiagnostics.shared.record("playback.lifecycle", "Audio player initialized")
        let notificationCenter = NotificationCenter.default
        notificationCenter.addObserver(self, selector: #selector(handleAudioSessionInterruption), name: AVAudioSession.interruptionNotification, object: AVAudioSession.sharedInstance())
        notificationCenter.addObserver(self, selector: #selector(handleAudioRouteChange), name: AVAudioSession.routeChangeNotification, object: AVAudioSession.sharedInstance())
        notificationCenter.addObserver(self, selector: #selector(handleMediaServicesReset), name: AVAudioSession.mediaServicesWereResetNotification, object: AVAudioSession.sharedInstance())
    }
    
    // MARK: - Audio Session Setup
    static func setupAudioSession() {
        do {
            try AVAudioSession.sharedInstance().setCategory(
                .playback,
                mode: .default,
                options: [.allowAirPlay, .allowBluetooth]
            )
            try AVAudioSession.sharedInstance().setActive(true)
            PlaybackDiagnostics.shared.record("audio-session", "Configured playback category")
        } catch {
            print("Failed to setup audio session: \(error)")
            PlaybackDiagnostics.shared.record("audio-session.error", "Configuration failed: \(error.localizedDescription)")
        }
    }

    @objc private func handleAudioSessionInterruption(_ notification: Notification) {
        let rawType = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt ?? 0
        guard let type = AVAudioSession.InterruptionType(rawValue: rawType) else {
            PlaybackDiagnostics.shared.record("audio-session.recovery", "Unknown interruption type")
            return
        }

        if type == .began {
            wasPlayingBeforeInterruption = isPlaying
            pauseForAudioSessionEvent("Interruption began")
            return
        }

        let rawOptions = notification.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
        let shouldResume = AVAudioSession.InterruptionOptions(rawValue: rawOptions).contains(.shouldResume)
        PlaybackDiagnostics.shared.record("audio-session.recovery", "Interruption ended shouldResume=\(shouldResume) wasPlaying=\(wasPlayingBeforeInterruption)")
        defer { wasPlayingBeforeInterruption = false }
        guard shouldResume, wasPlayingBeforeInterruption else { return }

        do {
            try AVAudioSession.sharedInstance().setActive(true)
            resume()
        } catch {
            PlaybackDiagnostics.shared.record("audio-session.recovery-failed", error.localizedDescription)
        }
    }

    @objc private func handleAudioRouteChange(_ notification: Notification) {
        let rawReason = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt ?? 0
        guard let reason = AVAudioSession.RouteChangeReason(rawValue: rawReason) else {
            PlaybackDiagnostics.shared.record("audio-session.recovery", "Unknown route-change reason")
            return
        }

        if reason == .oldDeviceUnavailable {
            wasPlayingBeforeInterruption = false
            pauseForAudioSessionEvent("Audio device disconnected")
        } else {
            PlaybackDiagnostics.shared.record("audio-session.recovery", "Route changed reason=\(reason.rawValue)")
        }
    }

    @objc private func handleMediaServicesReset(_ notification: Notification) {
        PlaybackDiagnostics.shared.record("audio-session.recovery", "Media services reset")
        AudioPlayerService.setupAudioSession()
    }

    private func pauseForAudioSessionEvent(_ reason: String) {
        guard isPlaying || player?.isPlaying == true else { return }
        player?.pause()
        isPlaying = false
        stopProgressTimer()
        updateNowPlayingInfo()
        PlaybackDiagnostics.shared.record("audio-session.paused", "\(reason) \(playbackDiagnosticSnapshot())")
    }
    
    // MARK: - Playback Controls
    func play(track: Track) {
        PlaybackDiagnostics.shared.record("play.request", "track=\(track.stableID) file=\(track.fileName) queueIndex=\(currentIndex)")
        guard FileManager.default.fileExists(atPath: track.filePath) else {
            print("File not found: \(track.filePath)")
            PlaybackDiagnostics.shared.record("play.failed", "Missing file for track=\(track.stableID)")
            return
        }
        
        do {
            player = try AVAudioPlayer(contentsOf: track.fileURL)
            player?.delegate = self
            player?.volume = volume
            player?.enableRate = true // Enable playback rate adjustment
            player?.rate = playbackRate // Apply current playback rate
            player?.prepareToPlay()
            guard player?.play() == true else {
                isPlaying = false
                stopProgressTimer()
                PlaybackDiagnostics.shared.record("play.failed", "AVAudioPlayer rejected track=\(track.stableID)")
                return
            }
            
            isPlaying = true
            currentTrack = track
            duration = player?.duration ?? 0
            
            startProgressTimer()
            updateNowPlayingInfo()
            PlaybackDiagnostics.shared.record("play.started", "track=\(track.stableID) duration=\(duration)")
            
        } catch {
            print("Failed to play track: \(error)")
            PlaybackDiagnostics.shared.record("play.failed", "track=\(track.stableID) error=\(error.localizedDescription)")
        }
    }
    
    func pause() {
        player?.pause()
        isPlaying = false
        stopProgressTimer()
        updateNowPlayingInfo()
        PlaybackDiagnostics.shared.record("play.paused", playbackDiagnosticSnapshot())
    }
    
    func resume() {
        guard player?.play() == true else {
            isPlaying = false
            PlaybackDiagnostics.shared.record("play.failed", "Resume rejected \(playbackDiagnosticSnapshot())")
            return
        }
        isPlaying = true
        startProgressTimer()
        updateNowPlayingInfo()
        PlaybackDiagnostics.shared.record("play.resumed", playbackDiagnosticSnapshot())
    }
    
    func togglePlayPause() {
        if isPlaying {
            pause()
        } else {
            resume()
        }
    }
    
    func stop() {
        player?.stop()
        player = nil
        isPlaying = false
        currentTime = 0
        stopProgressTimer()
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        PlaybackDiagnostics.shared.record("play.stopped", playbackDiagnosticSnapshot())
    }
    
    func seek(to time: TimeInterval) {
        player?.currentTime = time
        currentTime = time
        updateNowPlayingInfo()
    }
    
    func setVolume(_ newVolume: Float) {
        volume = min(max(newVolume, 0.0), 1.0)
        player?.volume = volume
    }
    
    func setPlaybackRate(_ rate: Float) {
        playbackRate = min(max(rate, 0.5), 2.0) // Clamp between 0.5x and 2.0x
        player?.rate = playbackRate
        print("🎚️ Playback rate set to \(playbackRate)x")
    }
    
    func setCrossfadeDuration(_ duration: TimeInterval) {
        crossfadeDuration = min(max(duration, 0), 12) // Clamp between 0 and 12 seconds
        print("🔀 Crossfade duration set to \(crossfadeDuration)s")
    }
    
    // MARK: - Queue Management
    func playQueue(_ tracks: [Track], startingAt index: Int = 0) {
        guard !tracks.isEmpty, index < tracks.count else { return }
        
        queue = tracks
        originalQueue = tracks
        currentIndex = index
        
        if shuffleEnabled {
            shuffleQueue(keepingCurrentTrack: true)
        }
        
        PlaybackDiagnostics.shared.record("queue.started", "count=\(queue.count) index=\(currentIndex) shuffle=\(shuffleEnabled)")
        play(track: queue[currentIndex])
    }
    
    func addToQueue(_ track: Track) {
        queue.append(track)
        if !shuffleEnabled {
            originalQueue.append(track)
        }
        print("➕ Added to queue: \(track.displayTitle)")
    }
    
    func addToQueue(_ tracks: [Track]) {
        queue.append(contentsOf: tracks)
        if !shuffleEnabled {
            originalQueue.append(contentsOf: tracks)
        }
        print("➕ Added \(tracks.count) tracks to queue")
    }
    
    func playNext(_ track: Track) {
        let insertIndex = currentIndex + 1
        queue.insert(track, at: insertIndex)
        if !shuffleEnabled {
            originalQueue.insert(track, at: insertIndex)
        }
        print("⏭️ Added to play next: \(track.displayTitle)")
    }
    
    func playNext(_ tracks: [Track]) {
        let insertIndex = currentIndex + 1
        queue.insert(contentsOf: tracks, at: insertIndex)
        if !shuffleEnabled {
            originalQueue.insert(contentsOf: tracks, at: insertIndex)
        }
        print("⏭️ Added \(tracks.count) tracks to play next")
    }
    
    func moveTrackInQueue(from source: IndexSet, to destination: Int) {
        queue.move(fromOffsets: source, toOffset: destination)
        
        // Update originalQueue if not shuffled
        if !shuffleEnabled {
            originalQueue = queue
        }
        
        // Update currentIndex if the current track was moved
        if let sourceIndex = source.first {
            if sourceIndex == currentIndex {
                // Current track was moved
                if destination > currentIndex {
                    currentIndex = destination - 1
                } else {
                    currentIndex = destination
                }
            } else if sourceIndex < currentIndex && destination > currentIndex {
                // Track before current was moved after current
                currentIndex -= 1
            } else if sourceIndex > currentIndex && destination <= currentIndex {
                // Track after current was moved before current
                currentIndex += 1
            }
        }
        
        print("🔄 Queue reordered")
    }
    
    func removeFromQueue(at index: Int) {
        guard index < queue.count else { return }
        
        let removedTrack = queue.remove(at: index)
        
        if !shuffleEnabled {
            if let originalIndex = originalQueue.firstIndex(where: { $0.id == removedTrack.id }) {
                originalQueue.remove(at: originalIndex)
            }
        }
        
        // Adjust currentIndex if needed
        if index < currentIndex {
            currentIndex -= 1
        } else if index == currentIndex {
            // Removed current track - play next or stop
            if !queue.isEmpty && currentIndex < queue.count {
                play(track: queue[currentIndex])
            } else if currentIndex > 0 {
                currentIndex -= 1
                if currentIndex < queue.count {
                    play(track: queue[currentIndex])
                }
            } else {
                stop()
            }
        }
        
        print("➖ Removed from queue: \(removedTrack.displayTitle)")
    }
    
    func clearQueue() {
        stop()
        queue.removeAll()
        originalQueue.removeAll()
        currentIndex = 0
        print("🗑️ Queue cleared")
    }
    
    func next() {
        guard !queue.isEmpty else { return }
        
        if repeatMode == .one {
            // Replay current track
            seek(to: 0)
            resume() // Always resume when repeating one track
            return
        }
        
        currentIndex += 1
        
        if currentIndex >= queue.count {
            if repeatMode == .all {
                currentIndex = 0
            } else {
                PlaybackDiagnostics.shared.record("queue.completed", "Reached end with repeat off")
                stop()
                return
            }
        }
        
        play(track: queue[currentIndex])
    }
    
    func previous() {
        guard !queue.isEmpty else { return }
        
        // If more than 3 seconds into track, restart current track
        if currentTime > 3.0 {
            seek(to: 0)
            return
        }
        
        currentIndex -= 1
        
        if currentIndex < 0 {
            if repeatMode == .all {
                currentIndex = queue.count - 1
            } else {
                currentIndex = 0
                seek(to: 0)
                return
            }
        }
        
        play(track: queue[currentIndex])
    }
    
    // MARK: - Shuffle & Repeat
    func toggleShuffle() {
        shuffleEnabled.toggle()
        
        if shuffleEnabled {
            shuffleQueue(keepingCurrentTrack: true)
        } else {
            unshuffleQueue()
        }
    }
    
    func cycleRepeatMode() {
        switch repeatMode {
        case .off:
            repeatMode = .all
        case .all:
            repeatMode = .one
        case .one:
            repeatMode = .off
        }
    }
    
    private func shuffleQueue(keepingCurrentTrack: Bool) {
        guard !queue.isEmpty else { return }
        
        let currentTrack = keepingCurrentTrack && currentIndex < queue.count ? queue[currentIndex] : nil
        var shuffledQueue = queue.shuffled()
        
        // If we're keeping the current track, move it to the front
        if let current = currentTrack, let currentIdx = shuffledQueue.firstIndex(where: { $0.id == current.id }) {
            shuffledQueue.swapAt(0, currentIdx)
            currentIndex = 0
        }
        
        queue = shuffledQueue
    }
    
    private func unshuffleQueue() {
        guard let current = currentTrack else {
            queue = originalQueue
            return
        }
        
        queue = originalQueue
        currentIndex = queue.firstIndex(where: { $0.id == current.id }) ?? 0
    }
    
    // MARK: - Progress Timer
    private func startProgressTimer() {
        stopProgressTimer()
        lastProgressTime = player?.currentTime ?? 0
        lastProgressDate = Date()
        timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            guard let self = self, let player = self.player else { return }
            self.currentTime = player.currentTime
            let now = Date()

            if abs(player.currentTime - self.lastProgressTime) > 0.01 {
                self.lastProgressTime = player.currentTime
                self.lastProgressDate = now
            } else if self.isPlaying && now.timeIntervalSince(self.lastProgressDate) >= 15 {
                PlaybackDiagnostics.shared.record("play.stalled", self.playbackDiagnosticSnapshot())
                self.lastProgressDate = now
            }

            if self.isPlaying && now.timeIntervalSince(self.lastDiagnosticHeartbeat) >= 60 {
                PlaybackDiagnostics.shared.record("play.heartbeat", self.playbackDiagnosticSnapshot())
                self.lastDiagnosticHeartbeat = now
            }
            
            // Check if we should start crossfade
            if self.crossfadeDuration > 0 && !self.isCrossfading {
                let timeRemaining = self.duration - self.currentTime
                if timeRemaining <= self.crossfadeDuration && timeRemaining > 0 {
                    self.startCrossfade()
                }
            }
        }
    }
    
    private func stopProgressTimer() {
        timer?.invalidate()
        timer = nil
    }

    private func playbackDiagnosticSnapshot() -> String {
        let trackID = currentTrack?.stableID ?? "none"
        return "track=\(trackID) index=\(currentIndex)/\(queue.count) currentTime=\(String(format: "%.2f", currentTime)) playerPlaying=\(player?.isPlaying ?? false) isPlaying=\(isPlaying) crossfading=\(isCrossfading)"
    }
    
    // MARK: - Now Playing Info (Lock Screen)
    private func updateNowPlayingInfo() {
        guard let track = currentTrack else {
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            return
        }
        
        var nowPlayingInfo: [String: Any] = [
            MPMediaItemPropertyTitle: track.displayTitle,
            MPMediaItemPropertyArtist: track.displayArtist,
            MPMediaItemPropertyAlbumTitle: track.displayAlbum,
            MPMediaItemPropertyPlaybackDuration: duration,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: currentTime,
            MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? 1.0 : 0.0
        ]
        
        // The app already extracts and stores embedded cover art in Track.
        // Supplying it to MPNowPlayingInfoCenter lets iOS use the real cover
        // in the Dynamic Island, Lock Screen, Control Center, and AirPlay
        // surfaces instead of its generic gray music-note placeholder.
        if let artworkData = track.albumArtData, let artworkImage = UIImage(data: artworkData) {
            nowPlayingInfo[MPMediaItemPropertyArtwork] = MPMediaItemArtwork(boundsSize: artworkImage.size) { _ in artworkImage }
        }
        
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
    }
    
    // MARK: - Remote Control Commands (Lock Screen/Control Center)
    func setupRemoteCommandCenter() {
        let commandCenter = MPRemoteCommandCenter.shared()
        
        commandCenter.playCommand.addTarget { [weak self] _ in
            self?.resume()
            return .success
        }
        
        commandCenter.pauseCommand.addTarget { [weak self] _ in
            self?.pause()
            return .success
        }
        
        commandCenter.togglePlayPauseCommand.addTarget { [weak self] _ in
            self?.togglePlayPause()
            return .success
        }
        
        commandCenter.nextTrackCommand.addTarget { [weak self] _ in
            self?.next()
            return .success
        }
        
        commandCenter.previousTrackCommand.addTarget { [weak self] _ in
            self?.previous()
            return .success
        }
        
        commandCenter.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let event = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            self?.seek(to: event.positionTime)
            return .success
        }
    }
    
    // MARK: - Sleep Timer
    func setSleepTimer(minutes: Int) {
        // Cancel existing timer
        cancelSleepTimer()
        
        // Set end date
        sleepTimerEndDate = Date().addingTimeInterval(TimeInterval(minutes * 60))
        sleepTimerMinutesRemaining = minutes
        
        // Start countdown timer (checks every 10 seconds for more accuracy)
        sleepTimer = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in
            self?.updateSleepTimerDisplay()
        }
        
        print("💤 Sleep timer set for \(minutes) minutes")
    }
    
    func cancelSleepTimer() {
        sleepTimer?.invalidate()
        sleepTimer = nil
        sleepTimerEndDate = nil
        sleepTimerMinutesRemaining = nil
        
        print("💤 Sleep timer cancelled")
    }
    
    private func updateSleepTimerDisplay() {
        guard let endDate = sleepTimerEndDate else {
            cancelSleepTimer()
            return
        }
        
        let remaining = endDate.timeIntervalSinceNow
        
        if remaining <= 0 {
            // Timer expired - pause playback
            print("💤 Sleep timer expired - pausing playback")
            pause()
            cancelSleepTimer()
        } else {
            // Update remaining time display
            let minutesRemaining = Int(ceil(remaining / 60))
            if sleepTimerMinutesRemaining != minutesRemaining {
                sleepTimerMinutesRemaining = minutesRemaining
                print("💤 Sleep timer: \(minutesRemaining) minutes remaining")
            }
        }
    }
    
    // MARK: - Crossfade
    private func startCrossfade() {
        guard crossfadeDuration > 0,
              !isCrossfading,
              let currentPlayer = player,
              currentIndex + 1 < queue.count else { return }
        
        isCrossfading = true
        let nextTrack = queue[currentIndex + 1]
        
        print("🔀 Starting crossfade to: \(nextTrack.displayTitle)")
        PlaybackDiagnostics.shared.record("crossfade.started", "fromIndex=\(currentIndex) toTrack=\(nextTrack.stableID)")
        
        // Prepare next player
        guard FileManager.default.fileExists(atPath: nextTrack.filePath) else {
            print("❌ Next track file not found for crossfade")
            PlaybackDiagnostics.shared.record("crossfade.failed", "Missing file for track=\(nextTrack.stableID)")
            isCrossfading = false
            return
        }
        
        do {
            nextPlayer = try AVAudioPlayer(contentsOf: nextTrack.fileURL)
            nextPlayer?.delegate = self
            nextPlayer?.volume = 0 // Start silent
            nextPlayer?.enableRate = true
            nextPlayer?.rate = playbackRate
            nextPlayer?.prepareToPlay()
            nextPlayer?.play()
            
            // Perform crossfade
            let steps = 20 // Number of volume adjustment steps
            let interval = crossfadeDuration / Double(steps)
            var currentStep = 0
            
            crossfadeTimer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { [weak self] timer in
                guard let self = self else {
                    timer.invalidate()
                    return
                }
                
                currentStep += 1
                let progress = Double(currentStep) / Double(steps)
                
                // Fade out current, fade in next
                currentPlayer.volume = self.volume * Float(1.0 - progress)
                self.nextPlayer?.volume = self.volume * Float(progress)
                
                if currentStep >= steps {
                    timer.invalidate()
                    self.completeCrossfade()
                }
            }
        } catch {
            print("❌ Failed to prepare next track for crossfade: \(error)")
            PlaybackDiagnostics.shared.record("crossfade.failed", "track=\(nextTrack.stableID) error=\(error.localizedDescription)")
            isCrossfading = false
        }
    }
    
    private func completeCrossfade() {
        print("✅ Crossfade complete")
        PlaybackDiagnostics.shared.record("crossfade.completed", "fromIndex=\(currentIndex) toIndex=\(currentIndex + 1)")
        
        // Stop old player
        player?.stop()
        player = nil
        
        // Promote next player to current
        player = nextPlayer
        nextPlayer = nil
        
        // Update track info
        currentIndex += 1
        currentTrack = queue[currentIndex]
        duration = player?.duration ?? 0
        currentTime = 0
        
        // Reset state
        isCrossfading = false
        crossfadeTimer?.invalidate()
        crossfadeTimer = nil
        
        // Update UI
        updateNowPlayingInfo()
    }
    
    // MARK: - Cleanup
    deinit {
        NotificationCenter.default.removeObserver(self)
        stopProgressTimer()
        cancelSleepTimer()
        crossfadeTimer?.invalidate()
        player = nil
        nextPlayer = nil
    }
}

// MARK: - AVAudioPlayerDelegate
extension AudioPlayerService: AVAudioPlayerDelegate {
    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            let playerRole = player === self.player ? "current" : player === self.nextPlayer ? "next" : "retired"
            PlaybackDiagnostics.shared.record("play.finished", "player=\(playerRole) successful=\(flag) \(self.playbackDiagnosticSnapshot())")
            
            if flag {
                // Track finished successfully - increment play count
                if let currentTrack = self.currentTrack {
                    Task {
                        await self.libraryManager?.incrementPlayCount(for: currentTrack)
                    }
                }
                self.next()
            } else {
                PlaybackDiagnostics.shared.record("play.failed", "Player ended unsuccessfully without an advance")
            }
        }
    }
    
    func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        DispatchQueue.main.async { [weak self] in
            print("Audio decode error: \(error?.localizedDescription ?? "unknown")")
            PlaybackDiagnostics.shared.record("play.decode-error", error?.localizedDescription ?? "unknown")
            self?.next()
        }
    }
}
