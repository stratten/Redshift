// VisualizerBarsView.swift
// Reusable frequency-band visualizer bars, shared by MiniPlayerView (small)
// and NowPlayingView (large). Mirrors the desktop visualizer's look: one
// bar per band, a yellow-to-red gradient while playing, and a muted gray
// rest state while paused, matching .now-playing-bars / .now-playing-bar in
// RedShift_Desktop/src/renderer/styles/shared-components.css.

import SwiftUI

struct VisualizerBarsView: View {
    /// One normalized (0...1) level per bar, from AudioSpectrumAnalyzer.
    let levels: [CGFloat]
    /// Whether to show the active gradient (playing) vs. the muted resting
    /// state (paused/stopped).
    let isActive: Bool
    var minHeight: CGFloat = 3
    var maxHeight: CGFloat = 14
    var barWidth: CGFloat = 3
    var spacing: CGFloat = 2

    private var barGradient: LinearGradient {
        LinearGradient(
            colors: [Color(red: 0.98, green: 0.80, blue: 0.08), Color(red: 0.94, green: 0.27, blue: 0.27)],
            startPoint: .bottom,
            endPoint: .top
        )
    }

    var body: some View {
        HStack(alignment: .bottom, spacing: spacing) {
            ForEach(0..<max(levels.count, 1), id: \.self) { index in
                RoundedRectangle(cornerRadius: barWidth / 2)
                    .fill(isActive ? AnyShapeStyle(barGradient) : AnyShapeStyle(Color.gray.opacity(0.4)))
                    .frame(width: barWidth, height: barHeight(for: index))
            }
        }
        .frame(height: maxHeight, alignment: .bottom)
        // Analyzer frames arrive at 30 Hz, but giving every height only one
        // 33 ms frame to land still reads as a sequence of hard steps. Match
        // the desktop indicator's 100 ms linear height transition instead:
        // adjacent updates overlap slightly, making the displayed motion
        // continuous without moving the bars perceptibly behind the audio.
        .animation(.linear(duration: 0.1), value: levels)
    }

    private func barHeight(for index: Int) -> CGFloat {
        guard isActive, index < levels.count else { return minHeight }
        return minHeight + levels[index] * (maxHeight - minHeight)
    }
}

#Preview {
    VisualizerBarsView(levels: [0.8, 0.4, 0.6], isActive: true)
        .padding()
        .background(Color.black)
}
