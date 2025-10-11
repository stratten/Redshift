// NowPlayingView.swift
// Full-screen now playing interface

import SwiftUI

struct NowPlayingView: View {
    @EnvironmentObject var audioPlayer: AudioPlayerService
    @EnvironmentObject var libraryManager: MusicLibraryManager
    
    @State private var isDraggingSlider = false
    @State private var tempSliderValue: Double = 0
    
    var body: some View {
        NavigationView {
            ZStack {
                // Background gradient
                LinearGradient(
                    colors: [Color.purple.opacity(0.3), Color.black],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .ignoresSafeArea()
                
                VStack(spacing: 0) {
                    if let track = audioPlayer.currentTrack {
                        // Album art
                        VStack {
                            RoundedRectangle(cornerRadius: 12)
                                .fill(Color.purple.opacity(0.5))
                                .aspectRatio(1, contentMode: .fit)
                                .overlay {
                                    Image(systemName: "music.note")
                                        .font(.system(size: 80))
                                        .foregroundColor(.white.opacity(0.8))
                                }
                                .shadow(radius: 20)
                                .padding(.horizontal, 40)
                                .padding(.top, 40)
                        }
                        .frame(maxHeight: .infinity)
                        
                        // Track info
                        VStack(spacing: 8) {
                            Text(track.displayTitle)
                                .font(.title2)
                                .fontWeight(.semibold)
                                .foregroundColor(.white)
                                .lineLimit(1)
                            
                            Text(track.displayArtist)
                                .font(.body)
                                .foregroundColor(.white.opacity(0.8))
                                .lineLimit(1)
                            
                            if let album = track.album {
                                Text(album)
                                    .font(.caption)
                                    .foregroundColor(.white.opacity(0.6))
                                    .lineLimit(1)
                            }
                        }
                        .padding(.horizontal, 32)
                        .padding(.top, 24)
                        
                        // Progress slider
                        VStack(spacing: 8) {
                            Slider(
                                value: isDraggingSlider ? $tempSliderValue : Binding(
                                    get: { audioPlayer.currentTime },
                                    set: { _ in }
                                ),
                                in: 0...max(audioPlayer.duration, 1),
                                onEditingChanged: { editing in
                                    if editing {
                                        isDraggingSlider = true
                                        tempSliderValue = audioPlayer.currentTime
                                    } else {
                                        audioPlayer.seek(to: tempSliderValue)
                                        isDraggingSlider = false
                                    }
                                }
                            )
                            .accentColor(.white)
                            
                            HStack {
                                Text(formatTime(isDraggingSlider ? tempSliderValue : audioPlayer.currentTime))
                                    .font(.caption)
                                    .foregroundColor(.white.opacity(0.6))
                                    .monospacedDigit()
                                
                                Spacer()
                                
                                Text(formatTime(audioPlayer.duration))
                                    .font(.caption)
                                    .foregroundColor(.white.opacity(0.6))
                                    .monospacedDigit()
                            }
                        }
                        .padding(.horizontal, 32)
                        .padding(.top, 16)
                        
                        // Controls
                        VStack(spacing: 24) {
                            // Main playback controls
                            HStack(spacing: 40) {
                                // Previous
                                Button(action: { audioPlayer.previous() }) {
                                    Image(systemName: "backward.fill")
                                        .font(.system(size: 32))
                                        .foregroundColor(.white)
                                }
                                
                                // Play/Pause
                                Button(action: { audioPlayer.togglePlayPause() }) {
                                    Image(systemName: audioPlayer.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                                        .font(.system(size: 70))
                                        .foregroundColor(.white)
                                }
                                
                                // Next
                                Button(action: { audioPlayer.next() }) {
                                    Image(systemName: "forward.fill")
                                        .font(.system(size: 32))
                                        .foregroundColor(.white)
                                }
                            }
                            .padding(.top, 16)
                            
                            // Secondary controls
                            HStack(spacing: 60) {
                                // Shuffle
                                Button(action: { audioPlayer.toggleShuffle() }) {
                                    Image(systemName: audioPlayer.shuffleEnabled ? "shuffle.circle.fill" : "shuffle")
                                        .font(.system(size: 24))
                                        .foregroundColor(audioPlayer.shuffleEnabled ? .purple : .white.opacity(0.7))
                                }
                                
                                // Favorite
                                Button(action: {
                                    Task {
                                        await libraryManager.toggleFavorite(for: track)
                                    }
                                }) {
                                    Image(systemName: track.isFavorite ? "heart.fill" : "heart")
                                        .font(.system(size: 24))
                                        .foregroundColor(track.isFavorite ? .red : .white.opacity(0.7))
                                }
                                
                                // Repeat
                                Button(action: { audioPlayer.cycleRepeatMode() }) {
                                    Group {
                                        switch audioPlayer.repeatMode {
                                        case .off:
                                            Image(systemName: "repeat")
                                        case .all:
                                            Image(systemName: "repeat.circle.fill")
                                        case .one:
                                            Image(systemName: "repeat.1.circle.fill")
                                        }
                                    }
                                    .font(.system(size: 24))
                                    .foregroundColor(audioPlayer.repeatMode != .off ? .purple : .white.opacity(0.7))
                                }
                            }
                            .padding(.bottom, 8)
                        }
                        .padding(.top, 8)
                        
                        // Volume slider
                        HStack(spacing: 16) {
                            Image(systemName: "speaker.fill")
                                .foregroundColor(.white.opacity(0.6))
                            
                            Slider(value: Binding(
                                get: { Double(audioPlayer.volume) },
                                set: { audioPlayer.setVolume(Float($0)) }
                            ), in: 0...1)
                            .accentColor(.white)
                            
                            Image(systemName: "speaker.wave.3.fill")
                                .foregroundColor(.white.opacity(0.6))
                        }
                        .padding(.horizontal, 32)
                        .padding(.top, 16)
                        .padding(.bottom, 32)
                        
                    } else {
                        // No track playing
                        VStack(spacing: 24) {
                            Image(systemName: "music.note")
                                .font(.system(size: 80))
                                .foregroundColor(.white.opacity(0.3))
                            
                            Text("No track playing")
                                .font(.title2)
                                .foregroundColor(.white.opacity(0.6))
                            
                            Text("Select a song from your library")
                                .font(.body)
                                .foregroundColor(.white.opacity(0.4))
                        }
                        .frame(maxHeight: .infinity)
                    }
                }
            }
            .navigationTitle("Now Playing")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    NavigationLink(destination: QueueView()) {
                        Image(systemName: "list.bullet")
                            .foregroundColor(.white)
                    }
                }
            }
        }
    }
    
    private func formatTime(_ time: TimeInterval) -> String {
        let minutes = Int(time) / 60
        let seconds = Int(time) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
}

// MARK: - Queue View
struct QueueView: View {
    @EnvironmentObject var audioPlayer: AudioPlayerService
    
    var body: some View {
        List {
            if audioPlayer.queue.isEmpty {
                Text("Queue is empty")
                    .foregroundColor(.gray)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .listRowBackground(Color.clear)
            } else {
                ForEach(Array(audioPlayer.queue.enumerated()), id: \.element.id) { index, track in
                    HStack {
                        if index == audioPlayer.currentIndex {
                            Image(systemName: "speaker.wave.2.fill")
                                .foregroundColor(.purple)
                                .font(.caption)
                        }
                        
                        VStack(alignment: .leading, spacing: 4) {
                            Text(track.displayTitle)
                                .font(.body)
                                .foregroundColor(index == audioPlayer.currentIndex ? .purple : .primary)
                            
                            Text(track.displayArtist)
                                .font(.caption)
                                .foregroundColor(.gray)
                        }
                        
                        Spacer()
                        
                        Text(track.formattedDuration)
                            .font(.caption)
                            .foregroundColor(.gray)
                    }
                    .contentShape(Rectangle())
                    .onTapGesture {
                        audioPlayer.playQueue(audioPlayer.queue, startingAt: index)
                    }
                }
            }
        }
        .navigationTitle("Queue")
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview {
    NowPlayingView()
        .environmentObject(AudioPlayerService())
        .environmentObject(MusicLibraryManager())
}
