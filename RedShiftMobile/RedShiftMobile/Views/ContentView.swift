// ContentView.swift
// Main view with tab navigation
//
// Uses a fully custom bottom tab bar (CustomTabBar) instead of SwiftUI's
// system TabView. The system TabView on iOS 26 applies a built-in Liquid
// Glass "morph"/zoom transition on tab selection with no public API to
// disable just that animation, and its auto-minimize-on-scroll floating
// behavior was not actually taking effect in this app anyway — so there was
// no upside left to keeping it. All three tab views already own their own
// NavigationStack, so mounting them simultaneously here and toggling
// visibility preserves each tab's independent navigation/scroll state
// exactly like the system TabView did.

import SwiftUI

struct ContentView: View {
    @EnvironmentObject var audioPlayer: AudioPlayerService
    @EnvironmentObject var libraryManager: MusicLibraryManager
    
    @State private var selectedTab = 0
    @State private var previousTab = 0
    @State private var showingNowPlaying = false
    @State private var libraryNavigationPath = NavigationPath()
    
    var body: some View {
        tabContent
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
    
    private var tabContent: some View {
        ZStack {
            LibraryBrowserView(navigationPath: $libraryNavigationPath)
                .opacity(selectedTab == 0 ? 1 : 0)
                .allowsHitTesting(selectedTab == 0)
                .accessibilityHidden(selectedTab != 0)
            
            PlaylistsView()
                .opacity(selectedTab == 1 ? 1 : 0)
                .allowsHitTesting(selectedTab == 1)
                .accessibilityHidden(selectedTab != 1)
            
            SettingsView()
                .opacity(selectedTab == 2 ? 1 : 0)
                .allowsHitTesting(selectedTab == 2)
                .accessibilityHidden(selectedTab != 2)
        }
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 0) {
                if audioPlayer.currentTrack != nil {
                    MiniPlayerView(onTap: { showingNowPlaying = true })
                        .padding(.horizontal, 8)
                        .padding(.top, 8)
                        .padding(.bottom, 4)
                }
                CustomTabBar(selectedTab: $selectedTab)
            }
            .background(Color.white)
            // safeAreaInset content inherits the device's home-indicator
            // clearance by default, on top of whatever padding it already
            // has — that stacked clearance (our own padding PLUS the
            // automatic ~34pt safe area) is what made the bar feel like it
            // took up far more room than it needed to. Opting out here and
            // letting CustomTabBar's own fixed bottom padding be the only
            // clearance removes that doubling.
            .ignoresSafeArea(edges: .bottom)
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(AudioPlayerService())
        .environmentObject(MusicLibraryManager())
}
