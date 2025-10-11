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
        ZStack(alignment: .bottom) {
            // Main Tab View
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
                // Reserve space for mini player
                if audioPlayer.currentTrack != nil {
                    Color.clear
                        .frame(height: 64) // Mini player height
                }
            }
            
            // Mini Player (above tab bar)
            if audioPlayer.currentTrack != nil {
                VStack {
                    Spacer()
                    
                    MiniPlayerView()
                        .onTapGesture {
                            showingNowPlaying = true
                        }
                }
                .padding(.bottom, 49) // Height of tab bar
                .allowsHitTesting(true)
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
            audioPlayer.setupRemoteCommandCenter()
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(AudioPlayerService())
        .environmentObject(MusicLibraryManager())
}
