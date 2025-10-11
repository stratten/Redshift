// LibraryDetailViews.swift
// Detail views for Artists, Albums, and Genres

import SwiftUI

// MARK: - Artist Detail View
struct ArtistDetailView: View {
    @EnvironmentObject var audioPlayer: AudioPlayerService
    @EnvironmentObject var libraryManager: MusicLibraryManager
    
    let artist: String
    @State private var sortBy: SortOption = .album
    
    enum SortOption: String, CaseIterable {
        case album = "Album"
        case title = "Title"
        case duration = "Duration"
    }
    
    private var tracks: [Track] {
        let filtered = libraryManager.tracks.filter { $0.artist == artist }
        switch sortBy {
        case .album:
            return filtered.sorted { ($0.album ?? "") < ($1.album ?? "") }
        case .title:
            return filtered.sorted { $0.displayTitle < $1.displayTitle }
        case .duration:
            return filtered.sorted { $0.duration > $1.duration }
        }
    }
    
    var body: some View {
        List {
            ForEach(tracks) { track in
                TrackRow(track: track)
                    .onTapGesture {
                        audioPlayer.playQueue(tracks, startingAt: tracks.firstIndex(where: { $0.id == track.id }) ?? 0)
                    }
            }
        }
        .navigationTitle(artist)
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                HStack(spacing: 16) {
                    Menu {
                        Picker("Sort By", selection: $sortBy) {
                            ForEach(SortOption.allCases, id: \.self) { option in
                                Text(option.rawValue).tag(option)
                            }
                        }
                    } label: {
                        Image(systemName: "arrow.up.arrow.down")
                    }
                    
                    Button(action: {
                        audioPlayer.playQueue(tracks, startingAt: 0)
                    }) {
                        Image(systemName: "play.fill")
                    }
                }
            }
        }
    }
}

// MARK: - Album Detail View
struct AlbumDetailView: View {
    @EnvironmentObject var audioPlayer: AudioPlayerService
    @EnvironmentObject var libraryManager: MusicLibraryManager
    
    let album: String
    
    private var tracks: [Track] {
        libraryManager.tracks
            .filter { $0.album == album }
            .sorted { ($0.trackNumber ?? 9999) < ($1.trackNumber ?? 9999) }
    }
    
    private var albumArtist: String {
        tracks.first?.albumArtist ?? tracks.first?.artist ?? "Unknown Artist"
    }
    
    var body: some View {
        List {
            // Album Header
            Section {
                VStack(spacing: 16) {
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color.purple.opacity(0.3))
                        .frame(width: 200, height: 200)
                        .overlay(
                            Image(systemName: "music.note")
                                .font(.system(size: 60))
                                .foregroundColor(.purple)
                        )
                    
                    VStack(spacing: 4) {
                        Text(album)
                            .font(.title2)
                            .fontWeight(.bold)
                        
                        Text(albumArtist)
                            .font(.subheadline)
                            .foregroundColor(.gray)
                        
                        Text("\(tracks.count) song\(tracks.count == 1 ? "" : "s")")
                            .font(.caption)
                            .foregroundColor(.gray)
                    }
                    
                    Button(action: {
                        audioPlayer.playQueue(tracks, startingAt: 0)
                    }) {
                        HStack {
                            Image(systemName: "play.fill")
                            Text("Play Album")
                        }
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.purple)
                        .foregroundColor(.white)
                        .cornerRadius(12)
                    }
                    .padding(.horizontal)
                }
                .frame(maxWidth: .infinity)
                .listRowBackground(Color.clear)
            }
            
            // Track List
            Section {
                ForEach(tracks) { track in
                    HStack {
                        if let trackNum = track.trackNumber {
                            Text("\(trackNum)")
                                .font(.caption)
                                .foregroundColor(.gray)
                                .frame(width: 30, alignment: .trailing)
                        }
                        
                        VStack(alignment: .leading, spacing: 4) {
                            Text(track.displayTitle)
                                .font(.body)
                            
                            Text(track.formattedDuration)
                                .font(.caption)
                                .foregroundColor(.gray)
                        }
                        
                        Spacer()
                        
                        Menu {
                            TrackContextMenu(track: track)
                        } label: {
                            Image(systemName: "ellipsis.circle")
                                .foregroundColor(.gray)
                                .font(.title3)
                                .frame(width: 44, height: 44)
                        }
                    }
                    .contentShape(Rectangle())
                    .onTapGesture {
                        audioPlayer.playQueue(tracks, startingAt: tracks.firstIndex(where: { $0.id == track.id }) ?? 0)
                    }
                }
            }
        }
        .navigationTitle(album)
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Genre Detail View
struct GenreDetailView: View {
    @EnvironmentObject var audioPlayer: AudioPlayerService
    @EnvironmentObject var libraryManager: MusicLibraryManager
    
    let genre: String
    @State private var sortBy: SortOption = .artist
    
    enum SortOption: String, CaseIterable {
        case artist = "Artist"
        case title = "Title"
        case album = "Album"
    }
    
    private var tracks: [Track] {
        let filtered = libraryManager.tracks.filter { $0.genre == genre }
        switch sortBy {
        case .artist:
            return filtered.sorted { ($0.artist ?? "") < ($1.artist ?? "") }
        case .title:
            return filtered.sorted { $0.displayTitle < $1.displayTitle }
        case .album:
            return filtered.sorted { ($0.album ?? "") < ($1.album ?? "") }
        }
    }
    
    var body: some View {
        List {
            ForEach(tracks) { track in
                TrackRow(track: track)
                    .onTapGesture {
                        audioPlayer.playQueue(tracks, startingAt: tracks.firstIndex(where: { $0.id == track.id }) ?? 0)
                    }
            }
        }
        .navigationTitle(genre)
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Menu {
                    Picker("Sort By", selection: $sortBy) {
                        ForEach(SortOption.allCases, id: \.self) { option in
                            Text(option.rawValue).tag(option)
                        }
                    }
                } label: {
                    Image(systemName: "arrow.up.arrow.down")
                }
            }
            
            ToolbarItem(placement: .navigationBarTrailing) {
                Button(action: {
                    audioPlayer.playQueue(tracks, startingAt: 0)
                }) {
                    Image(systemName: "play.fill")
                }
            }
        }
    }
}

#Preview {
    NavigationView {
        ArtistDetailView(artist: "Sample Artist")
            .environmentObject(AudioPlayerService())
            .environmentObject(MusicLibraryManager())
    }
}

