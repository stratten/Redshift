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
    let onTabTapped: (Int) -> Void
    
    let items: [CustomTabBarItem] = [
        CustomTabBarItem(icon: "music.note.list", label: "Library"),
        CustomTabBarItem(icon: "gearshape.fill", label: "Settings")
    ]
    
    var body: some View {
        // Fixed spacing between compact (non-stretching) buttons instead of
        // each item claiming `.frame(maxWidth: .infinity)`, then centering
        // that whole cluster in the full-width row below. This keeps Library
        // and Settings reachable with one thumb.
        // Clustering them centrally keeps every tab reachable one-handed.
        HStack(spacing: 40) {
            ForEach(items.indices, id: \.self) { index in
                Button(action: { onTabTapped(index) }) {
                    VStack(spacing: 4) {
                        Image(systemName: items[index].icon)
                            .font(.system(size: 22))
                        Text(items[index].label)
                            .font(.caption2)
                            .fontWeight(selectedTab == index ? .semibold : .regular)
                    }
                    .foregroundColor(selectedTab == index ? .purple : Color(red: 0.55, green: 0.55, blue: 0.58))
                    .frame(minWidth: 50)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 8)
        // ContentView docks this bar in a plain VStack (not
        // `.safeAreaInset`), so there is no automatic ~34pt home-indicator
        // reservation stacking underneath this padding — this fixed value is
        // the ONLY bottom clearance applied. Previous values (12pt, then
        // less) left the bar feeling cramped against the home-indicator
        // gesture strip; 18pt gives a bit more breathing room while staying
        // far short of the original ~3x-too-much safeAreaInset gap.
        .padding(.bottom, 18)
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
    CustomTabBar(selectedTab: .constant(0), onTabTapped: { _ in })
}
