// RedShiftMobileApp.swift
// Main entry point for RedShift Mobile iOS app

import SwiftUI

@main
struct RedShiftMobileApp: App {
    @StateObject private var audioPlayer = AudioPlayerService()
    @StateObject private var libraryManager = MusicLibraryManager()
    @StateObject private var spectrumAnalyzer = AudioSpectrumAnalyzer()
    @Environment(\.scenePhase) private var scenePhase
    
    init() {
        // Setup audio session for background playback
        AudioPlayerService.setupAudioSession()
        
        // Create necessary directories
        setupDirectories()
    }
    
    private func setupDirectories() {
        guard let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
            return
        }
        
        // Create artist-images directory
        let artistImagesURL = documentsURL.appendingPathComponent("artist-images")
        try? FileManager.default.createDirectory(at: artistImagesURL, withIntermediateDirectories: true)
        
        // Create Playlists directory
        let playlistsURL = documentsURL.appendingPathComponent("Playlists")
        try? FileManager.default.createDirectory(at: playlistsURL, withIntermediateDirectories: true)
        
        print("📁 Created artist-images directory at: \(artistImagesURL.path)")
        print("📁 Created Playlists directory at: \(playlistsURL.path)")
    }
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(audioPlayer)
                .environmentObject(libraryManager)
                .environmentObject(spectrumAnalyzer)
                .onAppear {
                    PlaybackDiagnostics.shared.record("app.lifecycle", "Window appeared")
                    PlaybackDiagnostics.shared.startMetricKitMonitoring()
                    // Connect audio player to library manager for play count tracking
                    audioPlayer.libraryManager = libraryManager
                    // Connect the visualizer to the audio player so it knows which
                    // track/position to read samples from (see AudioSpectrumAnalyzer).
                    spectrumAnalyzer.audioPlayer = audioPlayer
                    
                    // Load existing library on app launch
                    Task {
                        await libraryManager.loadLibraryFromDatabase()
                        
                        if libraryManager.tracks.isEmpty {
                            // No local database yet: do a full initial scan.
                            await libraryManager.scanLibrary()
                        } else {
                            // Library already exists: reconcile incrementally so any
                            // files/manifest changes since the last launch (including a
                            // completed desktop sync while the app was closed) are picked
                            // up automatically, without a destructive full rescan.
                            await libraryManager.reconcileLibraryIncrementally()
                        }
                    }
                }
                .onChange(of: audioPlayer.isPlaying) { _, isPlaying in
                    if isPlaying {
                        spectrumAnalyzer.start()
                    } else {
                        spectrumAnalyzer.stop()
                    }
                }
                .onChange(of: audioPlayer.currentTrack?.id) { _, _ in
                    // Track changed (skip/next/previous/crossfade completion) while
                    // still playing: reopen the shadow file handle for the new track.
                    if audioPlayer.isPlaying {
                        spectrumAnalyzer.start()
                    }
                }
                .onChange(of: scenePhase) { oldPhase, newPhase in
                    PlaybackDiagnostics.shared.record("app.lifecycle", "Scene phase \(oldPhase) → \(newPhase)")
                    if newPhase == .background {
                        // Export playlists when app goes to background (in case of sync)
                        Task {
                            await libraryManager.exportPlaylistsForSync()
                        }
                        // Stop reading/analyzing file samples while backgrounded — the
                        // bars aren't visible and playback itself (AVAudioPlayer) is
                        // completely unaffected either way.
                        spectrumAnalyzer.stop()
                    } else if newPhase == .active && oldPhase == .background {
                        // Coming back from background (after a potential desktop sync):
                        // reconcile incrementally so the library reflects any newly
                        // synced files/manifest automatically, with no manual "refresh
                        // from Settings" step required.
                        Task {
                            await libraryManager.reconcileLibraryIncrementally()
                        }
                        if audioPlayer.isPlaying {
                            spectrumAnalyzer.start()
                        }
                    }
                }
        }
    }
}
