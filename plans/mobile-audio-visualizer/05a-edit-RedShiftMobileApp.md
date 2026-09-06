# Edits: `RedShiftMobile/RedShiftMobile/App/RedShiftMobileApp.swift`

Adds the `AudioSpectrumAnalyzer` as a `@StateObject`, wires it to `audioPlayer`, starts/stops it on play/pause and track change, and stops it while backgrounded (avoids burning battery/file I/O reading a file that isn't visually rendered anyway).

## Edit 1 - add the StateObject and wire it to audioPlayer

Anchor (unique):

```swift
    @StateObject private var audioPlayer = AudioPlayerService()
    @StateObject private var libraryManager = MusicLibraryManager()
    @Environment(\.scenePhase) private var scenePhase
```

Replacement:

```swift
    @StateObject private var audioPlayer = AudioPlayerService()
    @StateObject private var libraryManager = MusicLibraryManager()
    @StateObject private var spectrumAnalyzer = AudioSpectrumAnalyzer()
    @Environment(\.scenePhase) private var scenePhase
```

## Edit 2 - inject as environment object and wire lifecycle

Anchor (unique):

```swift
            ContentView()
                .environmentObject(audioPlayer)
                .environmentObject(libraryManager)
                .onAppear {
                    // Connect audio player to library manager for play count tracking
                    audioPlayer.libraryManager = libraryManager
                    
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
                .onChange(of: scenePhase) { oldPhase, newPhase in
                    if newPhase == .background {
                        // Export playlists when app goes to background (in case of sync)
                        Task {
                            await libraryManager.exportPlaylistsForSync()
                        }
                    } else if newPhase == .active && oldPhase == .background {
                        // Coming back from background (after a potential desktop sync):
                        // reconcile incrementally so the library reflects any newly
                        // synced files/manifest automatically, with no manual "refresh
                        // from Settings" step required.
                        Task {
                            await libraryManager.reconcileLibraryIncrementally()
                        }
                    }
                }
```

Replacement:

```swift
            ContentView()
                .environmentObject(audioPlayer)
                .environmentObject(libraryManager)
                .environmentObject(spectrumAnalyzer)
                .onAppear {
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
```
