// LibraryView.swift
// Main library view with search and track list

import SwiftUI

struct LibraryView: View {
    @EnvironmentObject var audioPlayer: AudioPlayerService
    @EnvironmentObject var libraryManager: MusicLibraryManager
    
    @State private var searchText = ""
    @State private var sortOption: SortOption = .artist
    @State private var sortAscending = true
    @State private var filterFavorites = false
    
    enum SortOption: String, CaseIterable {
        case artist = "Artist"
        case album = "Album"
        case title = "Title"
        case recent = "Recently Added"
    }
    
    var filteredTracks: [Track] {
        var tracks = libraryManager.tracks
        
        // Filter by search
        if !searchText.isEmpty {
            tracks = libraryManager.searchTracks(query: searchText)
        }
        
        // Filter favorites
        if filterFavorites {
            tracks = tracks.filter { $0.isFavorite }
        }
        
        // Sort
        switch sortOption {
        case .artist:
            tracks.sort { 
                let comparison = ($0.displayArtist, $0.displayAlbum, $0.trackNumber ?? 0) < ($1.displayArtist, $1.displayAlbum, $1.trackNumber ?? 0)
                return sortAscending ? comparison : !comparison
            }
        case .album:
            tracks.sort { 
                let comparison = ($0.displayAlbum, $0.trackNumber ?? 0) < ($1.displayAlbum, $1.trackNumber ?? 0)
                return sortAscending ? comparison : !comparison
            }
        case .title:
            tracks.sort { 
                let comparison = $0.displayTitle < $1.displayTitle
                return sortAscending ? comparison : !comparison
            }
        case .recent:
            tracks.sort { 
                let comparison = $0.addedDate > $1.addedDate
                return sortAscending ? comparison : !comparison
            }
        }
        
        return tracks
    }
    
    var body: some View {
        VStack(spacing: 0) {
            // Search bar (compact)
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundColor(.gray)
                TextField("Search songs", text: $searchText)
                    .textFieldStyle(.plain)
                if !searchText.isEmpty {
                    Button(action: { searchText = "" }) {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(.gray)
                    }
                }
            }
            .padding(8)
            .background(Color(.systemGray6))
            .cornerRadius(8)
            .padding(.horizontal)
            .padding(.top, 8)
            .padding(.bottom, 8)
                
                Divider()
                
                // Track list
                if libraryManager.isScanning {
                    VStack(spacing: 16) {
                        ProgressView(value: libraryManager.scanProgress)
                            .padding(.horizontal, 40)
                        Text("Scanning library...")
                            .font(.caption)
                            .foregroundColor(.gray)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if filteredTracks.isEmpty {
                    VStack(spacing: 16) {
                        Image(systemName: "music.note")
                            .font(.system(size: 60))
                            .foregroundColor(.gray)
                        Text(searchText.isEmpty ? "No music in library" : "No results found")
                            .font(.headline)
                            .foregroundColor(.gray)
                        if searchText.isEmpty {
                            Button(action: {
                                Task {
                                    await libraryManager.scanLibrary()
                                }
                            }) {
                                Text("Scan Library")
                                    .padding(.horizontal, 20)
                                    .padding(.vertical, 10)
                                    .background(Color.purple)
                                    .foregroundColor(.white)
                                    .cornerRadius(8)
                            }
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List {
                        ForEach(filteredTracks) { track in
                            TrackRow(track: track)
                                .contentShape(Rectangle())
                                .onTapGesture {
                                    audioPlayer.playQueue(filteredTracks, startingAt: filteredTracks.firstIndex(where: { $0.id == track.id }) ?? 0)
                                }
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("Songs")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text("Songs")
                        .font(.headline)
                }
                
                ToolbarItem(placement: .navigationBarTrailing) {
                    HStack(spacing: 12) {
                        // Sort menu
                        Menu {
                            Picker("Sort by", selection: $sortOption) {
                                ForEach(SortOption.allCases, id: \.self) { option in
                                    Text(option.rawValue).tag(option)
                                }
                            }
                        } label: {
                            HStack(spacing: 4) {
                                Text(sortOption.rawValue)
                                    .font(.subheadline)
                                    .foregroundColor(.secondary)
                                Image(systemName: "chevron.down")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                        }
                        
                        // Sort direction toggle
                        Button(action: { sortAscending.toggle() }) {
                            Image(systemName: sortAscending ? "arrow.up" : "arrow.down")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        }
                        
                        // Favorites filter (only show when there are favorites)
                        if !libraryManager.getFavoriteTracks().isEmpty {
                            Button(action: { filterFavorites.toggle() }) {
                                Image(systemName: filterFavorites ? "star.fill" : "star")
                                    .foregroundColor(filterFavorites ? .purple : .primary)
                            }
                        }
                        
                        // Rescan button
                        Button(action: {
                            Task {
                                await libraryManager.scanLibrary()
                            }
                        }) {
                            Image(systemName: libraryManager.isScanning ? "arrow.clockwise.circle.fill" : "arrow.clockwise")
                        }
                        .disabled(libraryManager.isScanning)
                    }
                }
            }
    }
}

// MARK: - Track Row Component
struct TrackRow: View {
    @EnvironmentObject var libraryManager: MusicLibraryManager
    let track: Track
    
    var body: some View {
        HStack(spacing: 10) {
            // Album art
            if let albumArtData = track.albumArtData {
                if let uiImage = UIImage(data: albumArtData) {
                    Image(uiImage: uiImage)
                        .resizable()
                        .scaledToFill()
                        .frame(width: 48, height: 48)
                        .clipped()
                        .cornerRadius(4)
                } else {
                    // Data exists but UIImage can't decode it - show gray with warning
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color.gray.opacity(0.5))
                        .frame(width: 48, height: 48)
                        .overlay {
                            Image(systemName: "exclamationmark.triangle")
                                .font(.caption)
                                .foregroundColor(.white)
                        }
                }
            } else {
                // No album art data
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color.purple.opacity(0.3))
                    .frame(width: 48, height: 48)
                    .overlay {
                        Image(systemName: "music.note")
                            .foregroundColor(.purple)
                    }
            }
            
            // Track info - takes up all available space
            VStack(alignment: .leading, spacing: 3) {
                Text(track.displayTitle)
                    .font(.body)
                    .lineLimit(1)
                
                Text(track.displayArtist)
                    .font(.caption)
                    .foregroundColor(.gray)
                    .lineLimit(1)
                
                if let album = track.album {
                    Text(album)
                        .font(.caption2)
                        .foregroundColor(.gray)
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            
            // Rating (small stars if rated)
            if track.rating > 0 {
                HStack(spacing: 2) {
                    ForEach(0..<track.rating, id: \.self) { _ in
                        Image(systemName: "star.fill")
                            .font(.system(size: 8))
                            .foregroundColor(.orange)
                    }
                }
                .padding(.trailing, 4)
            }
            
            // Favorite button - closer to duration
            Button(action: {
                Task {
                    await libraryManager.toggleFavorite(for: track)
                }
            }) {
                Image(systemName: track.isFavorite ? "star.fill" : "star")
                    .foregroundColor(track.isFavorite ? .purple : .gray)
                    .font(.body)
                    .frame(width: 24, height: 24)
            }
            .buttonStyle(.plain)
            
            // Duration
            Text(track.formattedDuration)
                .font(.caption)
                .foregroundColor(.gray)
                .frame(width: 38, alignment: .trailing)
            
            // Context menu trigger
            Menu {
                TrackContextMenu(track: track)
            } label: {
                Image(systemName: "ellipsis.circle")
                    .foregroundColor(.gray)
                    .font(.title3)
                    .frame(width: 36, height: 36)
                    .contentShape(Rectangle())
            }
        }
        .padding(.vertical, 3)
        .padding(.horizontal, 4)
    }
}

// MARK: - Track Context Menu
struct TrackContextMenu: View {
    @EnvironmentObject var libraryManager: MusicLibraryManager
    let track: Track
    
    var body: some View {
        Menu("Rate") {
            ForEach(0...5, id: \.self) { rating in
                Button(action: {
                    Task {
                        await libraryManager.setRating(rating, for: track)
                    }
                }) {
                    HStack {
                        Text(rating == 0 ? "No Rating" : String(repeating: "⭐️", count: rating))
                        if track.rating == rating {
                            Image(systemName: "checkmark")
                        }
                    }
                }
            }
        }
        
        Divider()
        
        Menu("Add to Playlist") {
            ForEach(libraryManager.playlists) { playlist in
                Button(playlist.name) {
                    Task {
                        await libraryManager.addTrackToPlaylist(trackID: track.id, playlistID: playlist.id)
                    }
                }
            }
        }
        
        Divider()
        
        Button(role: .destructive, action: {
            // TODO: Delete track
        }) {
            Label("Delete", systemImage: "trash")
        }
    }
}

#Preview {
    LibraryView()
        .environmentObject(AudioPlayerService())
        .environmentObject(MusicLibraryManager())
}
