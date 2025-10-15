// LibraryBrowserView.swift
// Main library browser with category selection

import SwiftUI

enum LibraryCategory: String, CaseIterable {
    case artists = "Artists"
    case albums = "Albums"
    case songs = "Songs"
    case genres = "Genres"
    
    var icon: String {
        switch self {
        case .artists: return "person.2.fill"
        case .albums: return "square.stack.fill"
        case .songs: return "music.note.list"
        case .genres: return "guitars.fill"
        }
    }
}

struct LibraryBrowserView: View {
    @EnvironmentObject var libraryManager: MusicLibraryManager
    @Binding var navigationPath: NavigationPath
    
    var body: some View {
        NavigationStack(path: $navigationPath) {
            List {
                ForEach(LibraryCategory.allCases, id: \.self) { category in
                    NavigationLink(destination: destinationView(for: category)) {
                        HStack(spacing: 16) {
                            Image(systemName: category.icon)
                                .font(.title2)
                                .foregroundColor(.purple)
                                .frame(width: 44, height: 44)
                                .background(Color.purple.opacity(0.1))
                                .cornerRadius(8)
                            
                            VStack(alignment: .leading, spacing: 4) {
                                Text(category.rawValue)
                                    .font(.headline)
                                
                                Text(itemCount(for: category))
                                    .font(.caption)
                                    .foregroundColor(.gray)
                            }
                        }
                        .padding(.vertical, 8)
                    }
                }
            }
            .navigationTitle("Library")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: {
                        Task {
                            await libraryManager.scanLibrary()
                        }
                    }) {
                        Image(systemName: "arrow.clockwise")
                    }
                    .disabled(libraryManager.isScanning)
                }
            }
        }
    }
    
    @ViewBuilder
    private func destinationView(for category: LibraryCategory) -> some View {
        switch category {
        case .artists:
            ArtistsListView()
        case .albums:
            AlbumsListView()
        case .songs:
            SongsListView()
        case .genres:
            GenresListView()
        }
    }
    
    private func itemCount(for category: LibraryCategory) -> String {
        switch category {
        case .artists:
            let count = Set(libraryManager.tracks.compactMap { $0.artist }).count
            return "\(count) artist\(count == 1 ? "" : "s")"
        case .albums:
            let count = Set(libraryManager.tracks.compactMap { $0.album }).count
            return "\(count) album\(count == 1 ? "" : "s")"
        case .songs:
            return "\(libraryManager.tracks.count) song\(libraryManager.tracks.count == 1 ? "" : "s")"
        case .genres:
            let count = Set(libraryManager.tracks.compactMap { $0.genre }).count
            return "\(count) genre\(count == 1 ? "" : "s")"
        }
    }
}

// MARK: - Artists List View
struct ArtistsListView: View {
    @EnvironmentObject var libraryManager: MusicLibraryManager
    @State private var sortAscending = true
    
    private var artists: [String] {
        let artistSet = Set(libraryManager.tracks.compactMap { $0.artist })
        return sortAscending ? artistSet.sorted() : artistSet.sorted(by: >)
    }
    
    var body: some View {
        List {
            ForEach(artists, id: \.self) { artist in
                NavigationLink(destination: ArtistDetailView(artist: artist)) {
                    HStack {
                        Image(systemName: "person.circle.fill")
                            .font(.title2)
                            .foregroundColor(.purple)
                        
                        VStack(alignment: .leading, spacing: 4) {
                            Text(artist)
                                .font(.headline)
                            
                            let trackCount = libraryManager.tracks.filter { $0.artist == artist }.count
                            Text("\(trackCount) song\(trackCount == 1 ? "" : "s")")
                                .font(.caption)
                                .foregroundColor(.gray)
                        }
                    }
                }
            }
        }
        .navigationTitle("Artists")
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button(action: { sortAscending.toggle() }) {
                    Image(systemName: sortAscending ? "arrow.up" : "arrow.down")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
            }
        }
    }
}

// MARK: - Albums List View
struct AlbumsListView: View {
    @EnvironmentObject var libraryManager: MusicLibraryManager
    @State private var sortAscending = true
    
    private var albums: [String] {
        let albumSet = Set(libraryManager.tracks.compactMap { $0.album })
        return sortAscending ? albumSet.sorted() : albumSet.sorted(by: >)
    }
    
    var body: some View {
        List {
            ForEach(albums, id: \.self) { album in
                NavigationLink(destination: AlbumDetailView(album: album)) {
                    HStack {
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
                            
                            let tracks = libraryManager.tracks.filter { $0.album == album }
                            if let artist = tracks.first?.albumArtist ?? tracks.first?.artist {
                                Text(artist)
                                    .font(.subheadline)
                                    .foregroundColor(.gray)
                            }
                            
                            Text("\(tracks.count) song\(tracks.count == 1 ? "" : "s")")
                                .font(.caption)
                                .foregroundColor(.gray)
                        }
                    }
                }
            }
        }
        .navigationTitle("Albums")
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button(action: { sortAscending.toggle() }) {
                    Image(systemName: sortAscending ? "arrow.up" : "arrow.down")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
            }
        }
    }
}

// MARK: - Songs List View (reuse existing LibraryView logic)
struct SongsListView: View {
    var body: some View {
        LibraryView()
            .navigationTitle("Songs")
            .navigationBarTitleDisplayMode(.large)
    }
}

// MARK: - Genres List View
struct GenresListView: View {
    @EnvironmentObject var libraryManager: MusicLibraryManager
    @State private var sortAscending = true
    
    private var genres: [String] {
        let genreSet = Set(libraryManager.tracks.compactMap { $0.genre })
        return sortAscending ? genreSet.sorted() : genreSet.sorted(by: >)
    }
    
    var body: some View {
        List {
            ForEach(genres, id: \.self) { genre in
                NavigationLink(destination: GenreDetailView(genre: genre)) {
                    HStack {
                        Image(systemName: "music.quarternote.3")
                            .font(.title2)
                            .foregroundColor(.purple)
                            .frame(width: 44, height: 44)
                            .background(Color.purple.opacity(0.1))
                            .cornerRadius(8)
                        
                        VStack(alignment: .leading, spacing: 4) {
                            Text(genre)
                                .font(.headline)
                            
                            let trackCount = libraryManager.tracks.filter { $0.genre == genre }.count
                            Text("\(trackCount) song\(trackCount == 1 ? "" : "s")")
                                .font(.caption)
                                .foregroundColor(.gray)
                        }
                    }
                }
            }
        }
        .navigationTitle("Genres")
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button(action: { sortAscending.toggle() }) {
                    Image(systemName: sortAscending ? "arrow.up.arrow.down" : "arrow.down.arrow.up")
                }
            }
        }
    }
}

#Preview {
    LibraryBrowserView(navigationPath: .constant(NavigationPath()))
        .environmentObject(MusicLibraryManager())
}

