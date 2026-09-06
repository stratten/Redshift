// MiniPlayerView.swift
// Persistent mini player bar at bottom of screen

import SwiftUI

struct MiniPlayerView: View {
    @EnvironmentObject var audioPlayer: AudioPlayerService
    @EnvironmentObject var spectrumAnalyzer: AudioSpectrumAnalyzer
    
    /// Invoked when the user taps the album art / track info area to open
    /// the full Now Playing screen. Deliberately NOT attached to the whole
    /// row (see below) so it can never compete with the play/pause and skip
    /// Buttons for touch handling.
    var onTap: () -> Void
    
    var body: some View {
        if let currentTrack = audioPlayer.currentTrack {
            HStack(spacing: 12) {
                // Album art + track info is the only part of the row that
                // opens Now Playing. Previously the tap-to-open gesture was
                // applied to the ENTIRE row from the outside (in
                // ContentView), overlapping the play/pause and skip Buttons
                // beneath it — two competing gesture recognizers on the same
                // touch area, which is exactly what made those buttons (and
                // the open gesture itself) feel unreliable. Scoping the tap
                // target to just this Button removes that overlap entirely.
                Button(action: onTap) {
                    // spacing: 0 here (instead of the outer HStack's uniform
                    // 12pt gap) because the visualizer is now 1.5x larger —
                    // its own explicit trailing padding below absorbs that
                    // extra width so the track title still starts at
                    // exactly the same x position as before, with no extra
                    // space reserved anywhere in the row.
                    HStack(spacing: 0) {
                        Group {
                            if let albumArtData = currentTrack.albumArtData,
                               let uiImage = UIImage(data: albumArtData) {
                                Image(uiImage: uiImage)
                                    .resizable()
                                    .scaledToFill()
                                    .frame(width: 48, height: 48)
                                    .clipped()
                                    .cornerRadius(6)
                            } else {
                                RoundedRectangle(cornerRadius: 6)
                                    .fill(Color.purple.opacity(0.2))
                                    .frame(width: 48, height: 48)
                                    .overlay(
                                        Image(systemName: "music.note")
                                            .foregroundColor(.purple)
                                    )
                            }
                        }
                        .padding(.trailing, 12)
                        
                        VisualizerBarsView(
                            levels: spectrumAnalyzer.bandLevels,
                            isActive: audioPlayer.isPlaying,
                            minHeight: 4.5,
                            maxHeight: 21,
                            barWidth: 3.75,
                            spacing: 3
                        )
                        // 1.5x bars are 5.75pt wider than the old size (3
                        // bars * 3.75 width + 2 gaps * 3 spacing = 17.25, vs
                        // 11.5 before) — trimming this trailing gap from
                        // 12pt to 6.25pt absorbs exactly that difference.
                        .padding(.trailing, 6.25)
                        
                        VStack(alignment: .leading, spacing: 2) {
                            Text(currentTrack.displayTitle)
                                .font(.subheadline)
                                .fontWeight(.medium)
                                .lineLimit(1)
                            
                            Text(currentTrack.displayArtist)
                                .font(.caption)
                                .foregroundColor(Color(red: 0.35, green: 0.35, blue: 0.38))
                                .lineLimit(1)
                        }
                    }
                }
                .buttonStyle(.plain)
                
                Spacer()
                
                // Play/Pause Button
                Button(action: {
                    audioPlayer.togglePlayPause()
                }) {
                    Image(systemName: audioPlayer.isPlaying ? "pause.fill" : "play.fill")
                        .font(.title2)
                        .foregroundColor(.primary)
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                
                // Skip Button
                Button(action: {
                    audioPlayer.next()
                }) {
                    Image(systemName: "forward.fill")
                        .font(.title3)
                        .foregroundColor(.primary)
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
                // Fully opaque (not translucent) so the card reads as a
                // distinct, solid surface sitting on top of the Liquid Glass
                // accessory bar rather than another layer of glass blending
                // into it.
                RoundedRectangle(cornerRadius: 14)
                    .fill(Color.white)
            )
            .overlay(
                // A full surrounding stroke gives the card an actual edge on
                // all four sides — the previous top/bottom-only hairlines
                // were too faint against the glass material behind them to
                // read as a boundary at all.
                RoundedRectangle(cornerRadius: 14)
                    .strokeBorder(Color.black.opacity(0.12), lineWidth: 1)
            )
            .shadow(color: Color.black.opacity(0.12), radius: 8, x: 0, y: 2)
        }
    }
}

#Preview {
    MiniPlayerView(onTap: {})
        .environmentObject(AudioPlayerService())
        .environmentObject(AudioSpectrumAnalyzer())
}
