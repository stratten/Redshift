// RedShiftMobileApp.swift
// Main entry point for RedShift Mobile iOS app

import SwiftUI

@main
struct RedShiftMobileApp: App {
    @StateObject private var audioPlayer = AudioPlayerService()
    @StateObject private var libraryManager = MusicLibraryManager()
    
    init() {
        // Setup audio session for background playback
        AudioPlayerService.setupAudioSession()
    }
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(audioPlayer)
                .environmentObject(libraryManager)
                .onAppear {
                    // Load existing library on app launch
                    Task {
                        await libraryManager.loadLibraryFromDatabase()
                        
                        // Auto-scan only if library is empty
                        if libraryManager.tracks.isEmpty {
                            await libraryManager.scanLibrary()
                        }
                    }
                }
        }
    }
}
