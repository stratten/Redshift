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
        .onChange(of: scenePhase) { oldPhase, newPhase in
            if newPhase == .background {
                // Export sync status when app goes to background
                print("📱 App entering background - exporting sync status...")
                SyncStatusService.shared.exportOnBackground()
            }
        }
    }
}
