// RedShiftMobileApp.swift
// Main entry point for RedShift Mobile iOS app

import SwiftUI

@main
struct RedShiftMobileApp: App {
    @StateObject private var audioPlayer = AudioPlayerService()
    @StateObject private var libraryManager = MusicLibraryManager()
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
                .onAppear {
                    // Connect audio player to library manager for play count tracking
                    audioPlayer.libraryManager = libraryManager
                    
                    // Load existing library on app launch
                    Task {
                        await libraryManager.loadLibraryFromDatabase()
                        
                        // Auto-scan only if library is empty
                        if libraryManager.tracks.isEmpty {
                            await libraryManager.scanLibrary()
                        }
                    }
                }
                .onChange(of: scenePhase) { oldPhase, newPhase in
                    if newPhase == .background {
                        // Export playlists when app goes to background (in case of sync)
                        Task {
                            await libraryManager.exportPlaylistsForSync()
                        }
                    } else if newPhase == .active && oldPhase == .background {
                        // When coming back from background (after potential sync):
                        // 1. Reload library from database (picks up new synced tracks)
                        // 2. Import any new playlists
                        Task {
                            await libraryManager.loadLibraryFromDatabase()
                        }
                    }
                }
        }
    }
}
