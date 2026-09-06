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

// Broadcasts the mini player + tab bar dock's actual rendered height (which
// changes depending on whether a track is playing) down to every scrollable
// screen in the app, so each one can reserve exactly that much bottom
// content padding — no more, no less — instead of either a fixed guess or
// the dock area statically reserving space whether or not anything is
// actually there to show through it. Environment values propagate to
// NavigationStack push destinations automatically, so setting this once at
// the tab content root covers every pushed detail screen too.
private struct DockBottomInsetKey: EnvironmentKey {
    static let defaultValue: CGFloat = 0
}

extension EnvironmentValues {
    var dockBottomInset: CGFloat {
        get { self[DockBottomInsetKey.self] }
        set { self[DockBottomInsetKey.self] = newValue }
    }
}

struct ContentView: View {
    @EnvironmentObject var audioPlayer: AudioPlayerService
    @EnvironmentObject var libraryManager: MusicLibraryManager
    
    @State private var selectedTab = 0
    @State private var previousTab = 0
    @State private var showingNowPlaying = false
    @State private var libraryNavigationPath = NavigationPath()
    @State private var dockHeight: CGFloat = 0
    
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
        // The dock (mini player + tab bar) floats as a genuine overlay on
        // top of the tab content, NOT a sibling row that pushes content up.
        // Previously the content was sized to exactly fill the space above
        // a fixed-height row, so there was nothing behind that row to ever
        // show through — the row's own solid background was the only thing
        // ever visible there, making the "floating card" look like a
        // continuous slab. Now the content genuinely extends the full
        // screen height (including behind the dock), each scrollable screen
        // reserves bottom content padding via `dockBottomInset` (measured
        // from the dock's actual rendered size below) so nothing is
        // permanently obscured, and any area the dock doesn't visually cover
        // — its horizontal margins, the gap around the mini player's rounded
        // corners — now shows real scrolled content through it. The mini
        // player card and tab bar backgrounds themselves are unchanged: both
        // stay fully solid/opaque, no material or transparency was added to
        // either.
        ZStack(alignment: .bottom) {
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
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .environment(\.dockBottomInset, dockHeight)
            
            VStack(spacing: 0) {
                if audioPlayer.currentTrack != nil {
                    MiniPlayerView(onTap: { showingNowPlaying = true })
                        .padding(.horizontal, 8)
                        .padding(.top, 8)
                        .padding(.bottom, 4)
                }
                CustomTabBar(selectedTab: $selectedTab)
            }
            .background(
                GeometryReader { geometry in
                    Color.clear
                        .onAppear { dockHeight = geometry.size.height }
                        .onChange(of: geometry.size.height) { _, newValue in
                            dockHeight = newValue
                        }
                }
            )
        }
        .ignoresSafeArea(edges: .bottom)
    }
}

#Preview {
    ContentView()
        .environmentObject(AudioPlayerService())
        .environmentObject(MusicLibraryManager())
}
