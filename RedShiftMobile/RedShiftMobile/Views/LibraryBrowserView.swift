// LibraryBrowserView.swift
// Main library browser with category selection

import SwiftUI

enum LibraryCategory: String, CaseIterable {
    case artists = "Artists"
    case albums = "Albums"
    case songs = "Songs"
    case genres = "Genres"
    case recentlyPlayed = "Recently Played"
    
    var icon: String {
        switch self {
        case .artists: return "person.2.fill"
        case .albums: return "square.stack.fill"
        case .songs: return "music.note.list"
        case .genres: return "guitars.fill"
        case .recentlyPlayed: return "clock.fill"
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
        case .recentlyPlayed:
            RecentlyPlayedView()
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
        case .recentlyPlayed:
            let count = libraryManager.tracks.filter { $0.lastPlayed != nil }.count
            return "\(count) track\(count == 1 ? "" : "s")"
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
    @State private var searchText = ""
    
    private var artists: [String] {
        let artistSet = Set(libraryManager.tracks.compactMap { $0.artist })
        let sortedArtists = sortAscending ? artistSet.sorted() : artistSet.sorted(by: >)
        
        // Filter by search text if not empty
        if searchText.isEmpty {
            return sortedArtists
        } else {
            return sortedArtists.filter { $0.localizedCaseInsensitiveContains(searchText) }
        }
    }
    
    var body: some View {
        List {
            ForEach(artists, id: \.self) { artist in
                NavigationLink(destination: ArtistDetailView(artist: artist)) {
                    HStack(spacing: 12) {
                        ArtistImageView(artistName: artist)
                            .frame(width: 50, height: 50)
                        
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
        .searchable(text: $searchText, prompt: "Search artists")
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

// MARK: - Artist Image View
struct ArtistImageView: View {
    let artistName: String
    @State private var artistImage: UIImage?
    
    var body: some View {
        Group {
            if let image = artistImage {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .clipShape(Circle())
            } else {
                Image(systemName: "person.circle.fill")
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .foregroundColor(.purple)
            }
        }
        .onAppear {
            loadArtistImage()
        }
    }
    
    private func loadArtistImage() {
        guard let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
            print("❌ Could not get documents URL")
            return
        }
        
        let artistImagesURL = documentsURL.appendingPathComponent("artist-images")
        
        // Create safe filename from artist name
        let safeFilename = artistName.lowercased().replacingOccurrences(of: "[^a-z0-9]", with: "_", options: .regularExpression)
        
        // Generate hash for the artist name (matching desktop implementation)
        let hash = artistName.md5Hash().prefix(8)
        let baseFilename = "\(safeFilename)_\(hash)"
        
        print("🎨 Looking for artist image: \(artistName)")
        print("   Base filename: \(baseFilename)")
        print("   Search path: \(artistImagesURL.path)")
        
        // Try common image formats
        let formats = ["jpg", "jpeg", "png", "gif", "webp"]
        for format in formats {
            let imageURL = artistImagesURL.appendingPathComponent("\(baseFilename).\(format)")
            print("   Checking: \(imageURL.path)")
            
            if let image = UIImage(contentsOfFile: imageURL.path) {
                print("   ✅ Found image!")
                self.artistImage = image
                return
            }
        }
        
        print("   ❌ No image found for \(artistName)")
    }
}

// MARK: - String Extension for MD5 Hash
import CommonCrypto

extension String {
    func md5Hash() -> String {
        let data = Data(self.utf8)
        var digest = [UInt8](repeating: 0, count: Int(CC_MD5_DIGEST_LENGTH))
        
        data.withUnsafeBytes { buffer in
            _ = CC_MD5(buffer.baseAddress, CC_LONG(buffer.count), &digest)
        }
        
        return digest.map { String(format: "%02x", $0) }.joined()
    }
}

// MARK: - Albums List View
struct AlbumsListView: View {
    @EnvironmentObject var libraryManager: MusicLibraryManager
    @State private var sortAscending = true
    @State private var searchText = ""
    
    private var albums: [String] {
        let albumSet = Set(libraryManager.tracks.compactMap { $0.album })
        let sortedAlbums = sortAscending ? albumSet.sorted() : albumSet.sorted(by: >)
        
        // Filter by search text if not empty
        if searchText.isEmpty {
            return sortedAlbums
        } else {
            return sortedAlbums.filter { $0.localizedCaseInsensitiveContains(searchText) }
        }
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
        .searchable(text: $searchText, prompt: "Search albums")
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

// MARK: - Recently Played View
struct RecentlyPlayedView: View {
    @EnvironmentObject var libraryManager: MusicLibraryManager
    @EnvironmentObject var audioPlayer: AudioPlayerService
    @State private var searchText = ""
    
    var recentlyPlayedTracks: [Track] {
        let filtered = libraryManager.tracks
            .filter { $0.lastPlayed != nil }
            .sorted { ($0.lastPlayed ?? Date.distantPast) > ($1.lastPlayed ?? Date.distantPast) }
        
        if searchText.isEmpty {
            return filtered
        }
        
        return filtered.filter { track in
            track.displayTitle.localizedCaseInsensitiveContains(searchText) ||
            track.displayArtist.localizedCaseInsensitiveContains(searchText) ||
            track.displayAlbum.localizedCaseInsensitiveContains(searchText)
        }
    }
    
    var body: some View {
        VStack(spacing: 0) {
            if recentlyPlayedTracks.isEmpty {
                VStack(spacing: 16) {
                    Image(systemName: "clock")
                        .font(.system(size: 60))
                        .foregroundColor(.gray.opacity(0.5))
                    
                    Text("No Recently Played Tracks")
                        .font(.title3)
                        .foregroundColor(.gray)
                    
                    Text("Tracks you play will appear here")
                        .font(.caption)
                        .foregroundColor(.gray.opacity(0.7))
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List {
                    ForEach(recentlyPlayedTracks) { track in
                        VStack(spacing: 0) {
                            TrackRow(track: track)
                                .contentShape(Rectangle())
                                .onTapGesture {
                                    audioPlayer.playQueue(recentlyPlayedTracks, startingAt: recentlyPlayedTracks.firstIndex(where: { $0.id == track.id }) ?? 0)
                                }
                                .contextMenu {
                                    Button(action: {
                                        audioPlayer.playQueue(recentlyPlayedTracks, startingAt: recentlyPlayedTracks.firstIndex(where: { $0.id == track.id }) ?? 0)
                                    }) {
                                        Label("Play Now", systemImage: "play.fill")
                                    }
                                    
                                    Button(action: {
                                        audioPlayer.playNext(track)
                                    }) {
                                        Label("Play Next", systemImage: "text.insert")
                                    }
                                    
                                    Button(action: {
                                        audioPlayer.addToQueue(track)
                                    }) {
                                        Label("Add to Queue", systemImage: "text.append")
                                    }
                                    
                                    Divider()
                                    
                                    Button(action: {
                                        Task {
                                            await libraryManager.toggleFavorite(for: track)
                                        }
                                    }) {
                                        Label(
                                            track.isFavorite ? "Remove from Favorites" : "Add to Favorites",
                                            systemImage: track.isFavorite ? "heart.slash.fill" : "heart.fill"
                                        )
                                    }
                                }
                            
                            // Last played timestamp
                            if let lastPlayed = track.lastPlayed {
                                HStack {
                                    Image(systemName: "clock")
                                        .font(.caption2)
                                        .foregroundColor(.gray)
                                    Text(formatRelativeTime(lastPlayed))
                                        .font(.caption2)
                                        .foregroundColor(.gray)
                                    Spacer()
                                }
                                .padding(.horizontal, 16)
                                .padding(.top, 4)
                                .padding(.bottom, 8)
                            }
                        }
                    }
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("Recently Played")
        .navigationBarTitleDisplayMode(.large)
        .searchable(text: $searchText, prompt: "Search recently played")
    }
    
    private func formatRelativeTime(_ date: Date) -> String {
        let now = Date()
        let interval = now.timeIntervalSince(date)
        
        if interval < 60 {
            return "Just now"
        } else if interval < 3600 {
            let minutes = Int(interval / 60)
            return "\(minutes) minute\(minutes == 1 ? "" : "s") ago"
        } else if interval < 86400 {
            let hours = Int(interval / 3600)
            return "\(hours) hour\(hours == 1 ? "" : "s") ago"
        } else if interval < 604800 {
            let days = Int(interval / 86400)
            return "\(days) day\(days == 1 ? "" : "s") ago"
        } else {
            let formatter = DateFormatter()
            formatter.dateStyle = .medium
            formatter.timeStyle = .none
            return formatter.string(from: date)
        }
    }
}

#Preview {
    LibraryBrowserView(navigationPath: .constant(NavigationPath()))
        .environmentObject(MusicLibraryManager())
}

