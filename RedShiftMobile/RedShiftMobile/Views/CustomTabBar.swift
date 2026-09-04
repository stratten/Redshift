// CustomTabBar.swift
// Hand-built bottom tab bar, replacing SwiftUI's system TabView.
//
// The system TabView on iOS 26 applies a built-in Liquid Glass "morph" /
// zoom transition whenever the selected tab changes, with no public
// SwiftUI API to opt out of just that animation while keeping the native
// tab bar. This view reimplements the same three-tab selector with a plain
// solid background and an instantaneous selection color change — no scale,
// blur, or morph of any kind.

import SwiftUI

struct CustomTabBarItem {
    let icon: String
    let label: String
}

struct CustomTabBar: View {
    @Binding var selectedTab: Int
    
    let items: [CustomTabBarItem] = [
        CustomTabBarItem(icon: "music.note.list", label: "Library"),
        CustomTabBarItem(icon: "music.note.list", label: "Playlists"),
        CustomTabBarItem(icon: "gearshape.fill", label: "Settings")
    ]
    
    var body: some View {
        HStack(spacing: 0) {
            ForEach(items.indices, id: \.self) { index in
                Button(action: { selectedTab = index }) {
                    VStack(spacing: 4) {
                        Image(systemName: items[index].icon)
                            .font(.system(size: 22))
                        Text(items[index].label)
                            .font(.caption2)
                            .fontWeight(selectedTab == index ? .semibold : .regular)
                    }
                    .foregroundColor(selectedTab == index ? .purple : Color(red: 0.55, green: 0.55, blue: 0.58))
                    .frame(maxWidth: .infinity)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.top, 8)
        // ContentView attaches this bar via .ignoresSafeArea(edges: .bottom)
        // inside a .safeAreaInset — by default that inset content ALSO
        // inherits the device's home-indicator clearance on top of any
        // padding added here, effectively reserving space twice. Now that
        // the safe area is explicitly opted out of, this fixed value is the
        // ONLY bottom clearance applied, so it's kept just large enough to
        // clear the home indicator's gesture strip without the previous
        // (roughly) 8pt-of-our-own + ~34pt-of-automatic-safe-area stacking.
        .padding(.bottom, 12)
        .background(
            Color.white
                .overlay(alignment: .top) {
                    Rectangle()
                        .fill(Color.black.opacity(0.12))
                        .frame(height: 1)
                }
        )
    }
}

#Preview {
    CustomTabBar(selectedTab: .constant(0))
}
