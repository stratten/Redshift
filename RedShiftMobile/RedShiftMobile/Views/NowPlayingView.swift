// NowPlayingView.swift
// Full-screen now playing interface

import SwiftUI

struct NowPlayingView: View {
    @EnvironmentObject var audioPlayer: AudioPlayerService
    @EnvironmentObject var libraryManager: MusicLibraryManager
    @EnvironmentObject var spectrumAnalyzer: AudioSpectrumAnalyzer
    
    @State private var isDraggingSlider = false
    @State private var tempSliderValue: Double = 0
    
    var body: some View {
        NavigationStack {
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
                            Group {
                                if let albumArtData = track.albumArtData,
                                   let uiImage = UIImage(data: albumArtData) {
                                    Image(uiImage: uiImage)
                                        .resizable()
                                        .scaledToFit()
                                        .aspectRatio(1, contentMode: .fit)
                                        .cornerRadius(12)
                                        .shadow(radius: 20)
                                        .padding(.horizontal, 40)
                                        .padding(.top, 40)
                                } else {
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
                            }
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
                        
                        // 7 bands instead of the mini player's 3 — same real
                        // FFT magnitude spectrum, just sliced narrower, since
                        // the full player has the room to show that extra
                        // frequency detail (see AudioSpectrumAnalyzer's
                        // fullBandLevels).
                        VisualizerBarsView(
                            levels: spectrumAnalyzer.fullBandLevels,
                            isActive: audioPlayer.isPlaying,
                            minHeight: 6,
                            maxHeight: 40,
                            barWidth: 7,
                            spacing: 6
                        )
                        .frame(maxWidth: .infinity)
                        .padding(.top, 20)
                        
                        // Progress slider
                        VStack(spacing: 8) {
                            ZStack {
                                // Slider
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
                                
                                // Tap gesture overlay with modest hit area
                                GeometryReader { geometry in
                                    Rectangle()
                                        .fill(Color.clear)
                                        .contentShape(Rectangle())
                                        .gesture(
                                            DragGesture(minimumDistance: 0)
                                                .onChanged { value in
                                                    let percent = value.location.x / geometry.size.width
                                                    let newTime = percent * audioPlayer.duration
                                                    let clampedTime = max(0, min(newTime, audioPlayer.duration))
                                                    
                                                    if !isDraggingSlider {
                                                        // Direct tap - seek immediately
                                                        audioPlayer.seek(to: clampedTime)
                                                    }
                                                }
                                        )
                                }
                                .frame(height: 30) // Tap target height
                            }
                            .frame(height: 30)
                            // audioPlayer.currentTime only ticks 10x/sec (see
                            // AudioPlayerService's progress timer), so without
                            // an explicit animation the thumb sits still for
                            // 100ms then snaps forward — a visible stair-step.
                            // A linear animation matching that tick interval
                            // makes it glide continuously between updates
                            // instead. Skipped while the user is actively
                            // dragging so their touch isn't fighting an
                            // animation curve.
                            .animation(isDraggingSlider ? nil : .linear(duration: 0.1), value: audioPlayer.currentTime)
                            
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
                            HStack(spacing: 48) {
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
                                    Image(systemName: track.isFavorite ? "star.fill" : "star")
                                        .font(.system(size: 24))
                                        .foregroundColor(track.isFavorite ? .yellow : .white.opacity(0.7))
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
                                
                                // Playback Speed
                                Menu {
                                    Section("Playback Speed") {
                                        ForEach([0.5, 0.75, 1.0, 1.25, 1.5, 2.0], id: \.self) { rate in
                                            Button(action: {
                                                audioPlayer.setPlaybackRate(Float(rate))
                                            }) {
                                                HStack {
                                                    Text(rate == 1.0 ? "Normal (1×)" : "\(rate, specifier: "%.2g")×")
                                                    if audioPlayer.playbackRate == Float(rate) {
                                                        Image(systemName: "checkmark")
                                                    }
                                                }
                                            }
                                        }
                                    }
                                } label: {
                                    ZStack {
                                        Image(systemName: "gauge.with.dots.needle.33percent")
                                            .font(.system(size: 24))
                                            .foregroundColor(audioPlayer.playbackRate != 1.0 ? .purple : .white.opacity(0.7))
                                        
                                        // Show speed badge if not normal
                                        if audioPlayer.playbackRate != 1.0 {
                                            Text("\(audioPlayer.playbackRate, specifier: "%.2g")×")
                                                .font(.system(size: 9, weight: .bold))
                                                .foregroundColor(.white)
                                                .padding(3)
                                                .background(Circle().fill(Color.purple))
                                                .offset(x: 12, y: -12)
                                        }
                                    }
                                }
                                
                                // Crossfade
                                Menu {
                                    Section("Crossfade") {
                                        Button(action: {
                                            audioPlayer.setCrossfadeDuration(0)
                                        }) {
                                            HStack {
                                                Text("Off")
                                                if audioPlayer.crossfadeDuration == 0 {
                                                    Image(systemName: "checkmark")
                                                }
                                            }
                                        }

                                        Divider()

                                        ForEach([1, 2, 4, 6, 8, 10, 12], id: \.self) { seconds in
                                            Button(action: {
                                                audioPlayer.setCrossfadeDuration(TimeInterval(seconds))
                                            }) {
                                                HStack {
                                                    Text(seconds == 1 ? "1 second" : "\(seconds) seconds")
                                                    if Int(audioPlayer.crossfadeDuration) == seconds {
                                                        Image(systemName: "checkmark")
                                                    }
                                                }
                                            }
                                        }
                                    }
                                } label: {
                                    ZStack {
                                        Image(systemName: "waveform.path")
                                            .font(.system(size: 24))
                                            .foregroundColor(audioPlayer.crossfadeDuration > 0 ? .purple : .white.opacity(0.7))
                                        
                                        // Show duration badge if enabled
                                        if audioPlayer.crossfadeDuration > 0 {
                                            Text("\(Int(audioPlayer.crossfadeDuration))s")
                                                .font(.system(size: 9, weight: .bold))
                                                .foregroundColor(.white)
                                                .padding(3)
                                                .background(Circle().fill(Color.purple))
                                                .offset(x: 12, y: -12)
                                        }
                                    }
                                }
                            }
                            .padding(.bottom, 8)
                        }
                        .padding(.top, 8)
                        
                        // Volume slider
                        HStack(spacing: 16) {
                            Image(systemName: "speaker.fill")
                                .foregroundColor(.white.opacity(0.6))
                            
                            ZStack {
                                Slider(value: Binding(
                                    get: { Double(audioPlayer.volume) },
                                    set: { audioPlayer.setVolume(Float($0)) }
                                ), in: 0...1)
                                .accentColor(.white)
                                
                                // Tap gesture overlay
                                GeometryReader { geometry in
                                    Rectangle()
                                        .fill(Color.clear)
                                        .contentShape(Rectangle())
                                        .gesture(
                                            DragGesture(minimumDistance: 0)
                                                .onChanged { value in
                                                    let percent = value.location.x / geometry.size.width
                                                    let clampedPercent = max(0, min(percent, 1))
                                                    audioPlayer.setVolume(Float(clampedPercent))
                                                }
                                        )
                                }
                                .frame(height: 30)
                            }
                            .frame(height: 30)
                            
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
            // Tell the system this bar floats over dark content so the standard
            // Liquid Glass toolbar buttons pick legible, vibrant icon tinting
            // automatically instead of us hand-forcing white/blue foreground colors.
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                // Sleep Timer (left side)
                ToolbarItem(placement: .navigationBarLeading) {
                    Menu {
                        Section("Sleep Timer") {
                            ForEach([1, 5, 10, 15, 30, 45, 60, 90, 120], id: \.self) { minutes in
                                Button(action: {
                                    audioPlayer.setSleepTimer(minutes: minutes)
                                }) {
                                    HStack {
                                        Text(minutes == 1 ? "1 minute" : "\(minutes) minutes")
                                        if audioPlayer.sleepTimerMinutesRemaining == minutes {
                                            Image(systemName: "checkmark")
                                        }
                                    }
                                }
                            }

                            if audioPlayer.sleepTimerMinutesRemaining != nil {
                                Divider()
                                Button(role: .destructive, action: {
                                    audioPlayer.cancelSleepTimer()
                                }) {
                                    Label("Cancel Timer", systemImage: "xmark.circle")
                                }
                            }
                        }
                    } label: {
                        ZStack {
                            Image(systemName: audioPlayer.sleepTimerMinutesRemaining != nil ? "moon.zzz.fill" : "moon.zzz")
                            
                            // Show remaining time badge
                            if let minutes = audioPlayer.sleepTimerMinutesRemaining {
                                Text("\(minutes)")
                                    .font(.system(size: 9, weight: .bold))
                                    .foregroundColor(.white)
                                    .padding(3)
                                    .background(Circle().fill(Color.blue))
                                    .offset(x: 10, y: -10)
                            }
                        }
                    }
                    // Tint just this button blue while a timer is active; otherwise
                    // let the system choose its standard vibrant tint automatically.
                    .tint(audioPlayer.sleepTimerMinutesRemaining != nil ? .blue : nil)
                }
                
                // Queue (right side)
                ToolbarItem(placement: .navigationBarTrailing) {
                    NavigationLink(destination: QueueView()) {
                        Image(systemName: "list.bullet")
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
    @State private var editMode: EditMode = .inactive
    
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

                        Group {
                            if let artworkData = track.albumArtData, let artworkImage = UIImage(data: artworkData) {
                                Image(uiImage: artworkImage)
                                    .resizable()
                                    .scaledToFill()
                            } else {
                                RoundedRectangle(cornerRadius: 5)
                                    .fill(Color.purple.opacity(0.2))
                                    .overlay {
                                        Image(systemName: "music.note")
                                            .foregroundColor(.purple)
                                    }
                            }
                        }
                        .frame(width: 40, height: 40)
                        .clipShape(RoundedRectangle(cornerRadius: 5))

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
                        if editMode == .inactive {
                            audioPlayer.playQueue(audioPlayer.queue, startingAt: index)
                        }
                    }
                }
                .onMove { source, destination in
                    audioPlayer.moveTrackInQueue(from: source, to: destination)
                }
                .onDelete { indexSet in
                    for index in indexSet {
                        audioPlayer.removeFromQueue(at: index)
                    }
                }
            }
        }
        .navigationTitle("Queue (\(audioPlayer.queue.count))")
        .navigationBarTitleDisplayMode(.inline)
        .environment(\.editMode, $editMode)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                HStack(spacing: 16) {
                    if !audioPlayer.queue.isEmpty {
                        // Edit button
                        Button(editMode == .active ? "Done" : "Edit") {
                            withAnimation {
                                editMode = editMode == .active ? .inactive : .active
                            }
                        }
                        
                        // Clear queue button
                        if editMode == .inactive {
                            Button(action: {
                                audioPlayer.clearQueue()
                            }) {
                                Image(systemName: "trash")
                                    .foregroundColor(.red)
                            }
                        }
                    }
                }
            }
        }
    }
}

#Preview {
    NowPlayingView()
        .environmentObject(AudioPlayerService())
        .environmentObject(MusicLibraryManager())
        .environmentObject(AudioSpectrumAnalyzer())
}
