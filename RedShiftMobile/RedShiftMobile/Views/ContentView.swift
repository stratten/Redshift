// ContentView.swift
// Main view with tab navigation

import SwiftUI

struct ContentView: View {
    @EnvironmentObject var audioPlayer: AudioPlayerService
    @EnvironmentObject var libraryManager: MusicLibraryManager
    
    @State private var selectedTab = 0
    @State private var previousTab = 0
    @State private var showingNowPlaying = false
    @State private var libraryNavigationPath = NavigationPath()
    
    var body: some View {
        // Main Tab View. The mini player is anchored via safeAreaInset rather than a
        // manually offset ZStack overlay, so it always sits directly above whatever
        // height the system gives the tab bar (which varies with Liquid Glass).
        TabView(selection: $selectedTab) {
            LibraryBrowserView(navigationPath: $libraryNavigationPath)
                .tabItem {
                    Label("Library", systemImage: "music.note.list")
                }
                .tag(0)
            
            PlaylistsView()
                .tabItem {
                    Label("Playlists", systemImage: "music.note.list")
                }
                .tag(1)
            
            SettingsView()
                .tabItem {
                    Label("Settings", systemImage: "gearshape.fill")
                }
                .tag(2)
        }
        .accentColor(.purple)
        .safeAreaInset(edge: .bottom) {
            if audioPlayer.currentTrack != nil {
                MiniPlayerView()
                    .onTapGesture {
                        showingNowPlaying = true
                    }
            }
        }
        .sheet(isPresented: $showingNowPlaying) {
            NowPlayingView()
        }
        .onChange(of: selectedTab) { oldValue, newValue in
            // Pop to root when tapping the Library tab again
            if previousTab == 0 && newValue == 0 && !libraryNavigationPath.isEmpty {
                libraryNavigationPath = NavigationPath()
            }
            previousTab = newValue
        }
        .onAppear {
            // Setup audio player
            audioPlayer.setupRemoteCommandCenter()
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(AudioPlayerService())
        .environmentObject(MusicLibraryManager())
}
