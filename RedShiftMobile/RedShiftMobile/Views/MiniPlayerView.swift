// MiniPlayerView.swift
// Persistent mini player bar at bottom of screen

import SwiftUI

struct MiniPlayerView: View {
    @EnvironmentObject var audioPlayer: AudioPlayerService
    
    var body: some View {
        if let currentTrack = audioPlayer.currentTrack {
            HStack(spacing: 12) {
                // Album Art Thumbnail
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
                
                // Track Info
                VStack(alignment: .leading, spacing: 2) {
                    Text(currentTrack.displayTitle)
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .lineLimit(1)
                    
                    Text(currentTrack.displayArtist)
                        .font(.caption)
                        .foregroundColor(.gray)
                        .lineLimit(1)
                }
                
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
                
                // Skip Button
                Button(action: {
                    audioPlayer.next()
                }) {
                    Image(systemName: "forward.fill")
                        .font(.title3)
                        .foregroundColor(.primary)
                        .frame(width: 44, height: 44)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
                Color(UIColor.secondarySystemBackground)
                    .shadow(color: Color.black.opacity(0.1), radius: 8, x: 0, y: -2)
            )
        }
    }
}

#Preview {
    MiniPlayerView()
        .environmentObject(AudioPlayerService())
}
