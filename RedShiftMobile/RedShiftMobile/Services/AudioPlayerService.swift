// AudioPlayerService.swift
// Core audio playback engine using AVFoundation

import Foundation
import AVFoundation
import MediaPlayer
import Combine

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
    
    // MARK: - Private Properties
    private var player: AVAudioPlayer?
    private var timer: Timer?
    private var originalQueue: [Track] = [] // For shuffle/unshuffle
    
    // MARK: - Audio Session Setup
    static func setupAudioSession() {
        do {
            try AVAudioSession.sharedInstance().setCategory(
                .playback,
                mode: .default,
                options: [.allowAirPlay, .allowBluetooth]
            )
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            print("Failed to setup audio session: \(error)")
        }
    }
    
    // MARK: - Playback Controls
    func play(track: Track) {
        guard FileManager.default.fileExists(atPath: track.filePath) else {
            print("File not found: \(track.filePath)")
            return
        }
        
        do {
            player = try AVAudioPlayer(contentsOf: track.fileURL)
            player?.delegate = self
            player?.volume = volume
            player?.prepareToPlay()
            player?.play()
            
            isPlaying = true
            currentTrack = track
            duration = player?.duration ?? 0
            
            startProgressTimer()
            updateNowPlayingInfo()
            
        } catch {
            print("Failed to play track: \(error)")
        }
    }
    
    func pause() {
        player?.pause()
        isPlaying = false
        stopProgressTimer()
        updateNowPlayingInfo()
    }
    
    func resume() {
        player?.play()
        isPlaying = true
        startProgressTimer()
        updateNowPlayingInfo()
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
    
    // MARK: - Queue Management
    func playQueue(_ tracks: [Track], startingAt index: Int = 0) {
        guard !tracks.isEmpty, index < tracks.count else { return }
        
        queue = tracks
        originalQueue = tracks
        currentIndex = index
        
        if shuffleEnabled {
            shuffleQueue(keepingCurrentTrack: true)
        }
        
        play(track: queue[currentIndex])
    }
    
    func next() {
        guard !queue.isEmpty else { return }
        
        if repeatMode == .one {
            // Replay current track
            seek(to: 0)
            if !isPlaying {
                resume()
            }
            return
        }
        
        currentIndex += 1
        
        if currentIndex >= queue.count {
            if repeatMode == .all {
                currentIndex = 0
            } else {
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
        timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            guard let self = self, let player = self.player else { return }
            self.currentTime = player.currentTime
        }
    }
    
    private func stopProgressTimer() {
        timer?.invalidate()
        timer = nil
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
        
        // TODO: Add album artwork when we implement cover art extraction
        
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
    
    // MARK: - Cleanup
    deinit {
        stopProgressTimer()
        player = nil
    }
}

// MARK: - AVAudioPlayerDelegate
extension AudioPlayerService: AVAudioPlayerDelegate {
    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        DispatchQueue.main.async { [weak self] in
            if flag {
                // Track finished successfully - increment play count and move to next
                // TODO: Update play count in database
                self?.next()
            }
        }
    }
    
    func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        DispatchQueue.main.async { [weak self] in
            print("Audio decode error: \(error?.localizedDescription ?? "unknown")")
            self?.next()
        }
    }
}
