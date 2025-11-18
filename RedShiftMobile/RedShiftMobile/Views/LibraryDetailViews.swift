// LibraryDetailViews.swift
// Detail views for Artists, Albums, and Genres

import SwiftUI

// MARK: - Artist Detail View (shows albums + all tracks option)
struct ArtistDetailView: View {
    @EnvironmentObject var libraryManager: MusicLibraryManager
    @EnvironmentObject var audioPlayer: AudioPlayerService
    
    let artist: String
    
    private var albums: [String] {
        let artistTracks = libraryManager.tracks.filter { $0.artist == artist }
        let albumSet = Set(artistTracks.compactMap { $0.album })
        return albumSet.sorted()
    }
    
    private var allTracks: [Track] {
        libraryManager.tracks.filter { $0.artist == artist }
    }
    
    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                // Artist Header
                VStack(spacing: 12) {
                    // Artist image (circular)
                    ArtistImageView(artistName: artist)
                        .frame(width: 140, height: 140)
                        .shadow(color: .black.opacity(0.15), radius: 10, x: 0, y: 5)
                        .padding(.top, 16)
                    
                    VStack(spacing: 6) {
                        Text(artist)
                            .font(.title2)
                            .fontWeight(.bold)
                            .foregroundColor(.primary)
                            .multilineTextAlignment(.center)
                        
                        HStack(spacing: 8) {
                            Text("\(albums.count) album\(albums.count == 1 ? "" : "s")")
                                .font(.caption)
                                .foregroundColor(.secondary)
                            Text("•")
                                .font(.caption)
                                .foregroundColor(.secondary)
                            Text("\(allTracks.count) song\(allTracks.count == 1 ? "" : "s")")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                    .padding(.horizontal, 20)
                    
                    Button(action: {
                        audioPlayer.playQueue(allTracks, startingAt: 0)
                    }) {
                        HStack(spacing: 8) {
                            Image(systemName: "play.fill")
                            Text("Play All")
                                .fontWeight(.semibold)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(Color.purple)
                        .foregroundColor(.white)
                        .cornerRadius(10)
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 16)
                }
                .frame(maxWidth: .infinity)
                .background(Color(red: 0.88, green: 0.88, blue: 0.90))
                
                // Content sections
                VStack(spacing: 12) {
                    // "All Tracks" option
                    NavigationLink(destination: ArtistAllTracksView(artist: artist)) {
                        HStack(spacing: 12) {
                            Image(systemName: "music.note.list")
                                .font(.title3)
                                .foregroundColor(.purple)
                                .frame(width: 50, height: 50)
                                .background(Color.purple.opacity(0.1))
                                .cornerRadius(8)
                            
                            VStack(alignment: .leading, spacing: 4) {
                                Text("All Tracks")
                                    .font(.headline)
                                    .foregroundColor(.primary)
                                
                                Text("\(allTracks.count) song\(allTracks.count == 1 ? "" : "s")")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                            
                            Spacer()
                            
                            Image(systemName: "chevron.right")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .background(Color(.systemBackground))
                    }
                    .buttonStyle(PlainButtonStyle())
                    
                    // Albums section
                    if !albums.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Albums")
                                .font(.headline)
                                .foregroundColor(.primary)
                                .padding(.horizontal, 16)
                                .padding(.top, 8)
                            
                            VStack(spacing: 0) {
                                ForEach(albums, id: \.self) { album in
                                    NavigationLink(destination: AlbumDetailView(album: album)) {
                                        HStack(spacing: 12) {
                                            // Album art
                                            let tracks = libraryManager.tracks.filter { $0.album == album }
                                            let albumArtData = tracks.first?.albumArtData
                                            
                                            Group {
                                                if let artData = albumArtData,
                                                   let uiImage = UIImage(data: artData) {
                                                    Image(uiImage: uiImage)
                                                        .resizable()
                                                        .scaledToFill()
                                                        .frame(width: 60, height: 60)
                                                        .clipped()
                                                        .cornerRadius(8)
                                                } else {
                                                    RoundedRectangle(cornerRadius: 8)
                                                        .fill(Color.purple.opacity(0.3))
                                                        .frame(width: 60, height: 60)
                                                        .overlay(
                                                            Image(systemName: "music.note")
                                                                .foregroundColor(.purple)
                                                        )
                                                }
                                            }
                                            
                                            VStack(alignment: .leading, spacing: 4) {
                                                Text(album)
                                                    .font(.headline)
                                                    .foregroundColor(.primary)
                                                
                                                Text("\(tracks.count) song\(tracks.count == 1 ? "" : "s")")
                                                    .font(.caption)
                                                    .foregroundColor(.secondary)
                                            }
                                            
                                            Spacer()
                                            
                                            Image(systemName: "chevron.right")
                                                .font(.caption)
                                                .foregroundColor(.secondary)
                                        }
                                        .padding(.horizontal, 16)
                                        .padding(.vertical, 10)
                                        .background(Color(.systemBackground))
                                        
                                        if album != albums.last {
                                            Divider()
                                                .padding(.leading, 88)
                                        }
                                    }
                                    .buttonStyle(PlainButtonStyle())
                                }
                            }
                        }
                        .background(Color(.systemBackground))
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 20)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text(artist)
                    .font(.headline)
            }
        }
    }
}

// MARK: - Artist All Tracks View
struct ArtistAllTracksView: View {
    @EnvironmentObject var audioPlayer: AudioPlayerService
    @EnvironmentObject var libraryManager: MusicLibraryManager
    
    let artist: String
    @State private var sortBy: SortOption = .album
    @State private var searchText = ""
    
    enum SortOption: String, CaseIterable {
        case album = "Album"
        case title = "Title"
        case duration = "Duration"
    }
    
    private var tracks: [Track] {
        var filtered = libraryManager.tracks.filter { $0.artist == artist }
        
        // Apply search filter
        if !searchText.isEmpty {
            filtered = filtered.filter { track in
                track.displayTitle.localizedCaseInsensitiveContains(searchText) ||
                (track.album?.localizedCaseInsensitiveContains(searchText) ?? false)
            }
        }
        
        // Apply sorting
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
                    .swipeActions(edge: .leading) {
                        Button {
                            Task {
                                await libraryManager.toggleFavorite(for: track)
                            }
                        } label: {
                            Label("Favorite", systemImage: track.isFavorite ? "star.slash" : "star.fill")
                        }
                        .tint(track.isFavorite ? .gray : .purple)
                        
                        Button {
                            audioPlayer.addToQueue(track)
                        } label: {
                            Label("Add to Queue", systemImage: "text.badge.plus")
                        }
                        .tint(.blue)
                    }
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) {
                            Task {
                                try? await libraryManager.deleteTrack(track)
                            }
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
            }
        }
        .navigationTitle("All Tracks")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $searchText, prompt: "Search tracks")
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
    
    private var albumYear: Int? {
        tracks.first?.year
    }
    
    var body: some View {
        ScrollView {
                VStack(spacing: 0) {
                    // Album Header
                    VStack(spacing: 12) {
                        // Album art
                        Group {
                            if let artData = tracks.first?.albumArtData,
                               let uiImage = UIImage(data: artData) {
                                Image(uiImage: uiImage)
                                    .resizable()
                                    .scaledToFill()
                                    .frame(width: 200, height: 200)
                                    .clipped()
                                    .cornerRadius(12)
                                    .shadow(color: .black.opacity(0.2), radius: 10, x: 0, y: 5)
                            } else {
                                RoundedRectangle(cornerRadius: 12)
                                    .fill(Color.purple.opacity(0.3))
                                    .frame(width: 200, height: 200)
                                    .overlay(
                                        Image(systemName: "music.note")
                                            .font(.system(size: 60))
                                            .foregroundColor(.purple)
                                    )
                                    .shadow(color: .black.opacity(0.15), radius: 10, x: 0, y: 5)
                            }
                        }
                        .padding(.top, 16)
                        
                        VStack(spacing: 6) {
                            Text(album)
                                .font(.title2)
                                .fontWeight(.bold)
                                .foregroundColor(.primary)
                                .multilineTextAlignment(.center)
                                .lineLimit(2)
                            
                            Text(albumArtist)
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                            
                            HStack(spacing: 8) {
                                if let year = albumYear {
                                    Text(String(year))
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                }
                                if let year = albumYear {
                                    Text("•")
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                }
                                Text("\(tracks.count) song\(tracks.count == 1 ? "" : "s")")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                        }
                        .padding(.horizontal, 20)
                        
                        Button(action: {
                            audioPlayer.playQueue(tracks, startingAt: 0)
                        }) {
                            HStack(spacing: 8) {
                                Image(systemName: "play.fill")
                                Text("Play Album")
                                    .fontWeight(.semibold)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(Color.purple)
                            .foregroundColor(.white)
                            .cornerRadius(10)
                        }
                        .padding(.horizontal, 20)
                        .padding(.bottom, 16)
                    }
                    .frame(maxWidth: .infinity)
                    .background(Color(red: 0.88, green: 0.88, blue: 0.90))
            
                    // Track List
                    VStack(spacing: 0) {
                        ForEach(tracks) { track in
                            HStack(spacing: 12) {
                                if let trackNum = track.trackNumber {
                                    Text("\(trackNum)")
                                        .font(.subheadline)
                                        .fontWeight(.medium)
                                        .foregroundColor(.secondary)
                                        .frame(width: 30, alignment: .trailing)
                                }
                                
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(track.displayTitle)
                                        .font(.body)
                                        .foregroundColor(.primary)
                                    
                                    Text(track.formattedDuration)
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                }
                                
                                Spacer()
                                
                                Menu {
                                    TrackContextMenu(track: track)
                                } label: {
                                    Image(systemName: "ellipsis.circle")
                                        .foregroundColor(.secondary)
                                        .font(.title3)
                                        .frame(width: 44, height: 44)
                                }
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)
                            .background(Color(.systemBackground))
                            .contentShape(Rectangle())
                            .onTapGesture {
                                audioPlayer.playQueue(tracks, startingAt: tracks.firstIndex(where: { $0.id == track.id }) ?? 0)
                            }
                            
                            if track.id != tracks.last?.id {
                                Divider()
                                    .padding(.leading, track.trackNumber != nil ? 58 : 16)
                            }
                        }
                    }
                    .background(Color(.systemBackground))
                    .cornerRadius(12)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 20)
                }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text(album)
                    .font(.headline)
            }
        }
    }
}

// MARK: - Genre Detail View
struct GenreDetailView: View {
    @EnvironmentObject var audioPlayer: AudioPlayerService
    @EnvironmentObject var libraryManager: MusicLibraryManager
    
    let genre: String
    @State private var sortBy: SortOption = .artist
    @State private var searchText = ""
    
    enum SortOption: String, CaseIterable {
        case artist = "Artist"
        case title = "Title"
        case album = "Album"
    }
    
    private var tracks: [Track] {
        var filtered = libraryManager.tracks.filter { $0.genre == genre }
        
        // Apply search filter
        if !searchText.isEmpty {
            filtered = filtered.filter { track in
                track.displayTitle.localizedCaseInsensitiveContains(searchText) ||
                track.displayArtist.localizedCaseInsensitiveContains(searchText) ||
                (track.album?.localizedCaseInsensitiveContains(searchText) ?? false)
            }
        }
        
        // Apply sorting
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
                    .swipeActions(edge: .leading) {
                        Button {
                            Task {
                                await libraryManager.toggleFavorite(for: track)
                            }
                        } label: {
                            Label("Favorite", systemImage: track.isFavorite ? "star.slash" : "star.fill")
                        }
                        .tint(track.isFavorite ? .gray : .purple)
                        
                        Button {
                            audioPlayer.addToQueue(track)
                        } label: {
                            Label("Add to Queue", systemImage: "text.badge.plus")
                        }
                        .tint(.blue)
                    }
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) {
                            Task {
                                try? await libraryManager.deleteTrack(track)
                            }
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
            }
        }
        .navigationTitle(genre)
        .navigationBarTitleDisplayMode(.large)
        .searchable(text: $searchText, prompt: "Search tracks")
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
    NavigationStack {
        ArtistDetailView(artist: "Sample Artist")
            .environmentObject(AudioPlayerService())
            .environmentObject(MusicLibraryManager())
    }
}

