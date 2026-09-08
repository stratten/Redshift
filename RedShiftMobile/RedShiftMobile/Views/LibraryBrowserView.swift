// LibraryBrowserView.swift
// Main library browser with category selection

import SwiftUI

enum LibraryCategory: String, CaseIterable {
    case artists = "Artists"
    case albums = "Albums"
    case songs = "Songs"
    case genres = "Genres"
    case playlists = "Playlists"
    case recentlyPlayed = "Recently Played"
    
    var icon: String {
        switch self {
        case .artists: return "person.2.fill"
        case .albums: return "square.stack.fill"
        case .songs: return "music.note.list"
        case .genres: return "guitars.fill"
        case .playlists: return "music.note.list"
        case .recentlyPlayed: return "clock.fill"
        }
    }
    
    var color: Color {
        switch self {
        case .artists: return Color(red: 1.0, green: 0.5, blue: 0.5)
        case .albums: return Color.purple
        case .songs: return Color(red: 0.5, green: 0.9, blue: 0.5)
        case .genres: return Color.orange
        case .playlists: return Color.indigo
        case .recentlyPlayed: return Color.blue
        }
    }
    
    var lightBackgroundColor: Color {
        return color.opacity(0.08)
    }
}

struct LibraryBrowserView: View {
    @EnvironmentObject var libraryManager: MusicLibraryManager
    @Environment(\.dockBottomInset) private var dockBottomInset
    @Binding var navigationPath: NavigationPath
    
    var body: some View {
        NavigationStack(path: $navigationPath) {
            ScrollView {
                VStack(spacing: 16) {
                    ForEach(LibraryCategory.allCases, id: \.self) { category in
                        NavigationLink(value: category) {
                            LibraryCategoryCard(category: category, itemCount: itemCount(for: category))
                        }
                        .buttonStyle(PlainButtonStyle())
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)
                .padding(.bottom, 20)
                .background(Color.white)
                .cornerRadius(12)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
            }
            .safeAreaPadding(.bottom, dockBottomInset)
            .background(Color(red: 0.96, green: 0.96, blue: 0.96))
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: LibraryCategory.self) { category in
                destinationView(for: category)
            }
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text("Library")
                        .font(.title2)
                        .fontWeight(.bold)
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: {
                        Task {
                            await libraryManager.scanLibrary()
                        }
                    }) {
                        if libraryManager.isScanning {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle())
                        } else {
                            Image(systemName: "arrow.clockwise")
                        }
                    }
                    .disabled(libraryManager.isScanning)
                }
            }
            .refreshable {
                await libraryManager.scanLibrary()
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
        case .playlists:
            PlaylistsView()
        }
    }
    
    private func itemCount(for category: LibraryCategory) -> String {
        switch category {
        case .recentlyPlayed:
            let count = libraryManager.tracks.filter { $0.lastPlayed != nil }.count
            return "\(count) track\(count == 1 ? "" : "s")"
        case .artists:
            let count = libraryManager.libraryIndex.artists.count
            return "\(count) artist\(count == 1 ? "" : "s")"
        case .albums:
            let count = Set(libraryManager.tracks.compactMap { $0.album }).count
            return "\(count) album\(count == 1 ? "" : "s")"
        case .songs:
            return "\(libraryManager.tracks.count) song\(libraryManager.tracks.count == 1 ? "" : "s")"
        case .genres:
            let count = Set(libraryManager.tracks.compactMap { $0.genre }).count
            return "\(count) genre\(count == 1 ? "" : "s")"
        case .playlists:
            let count = libraryManager.playlists.count
            return "\(count) playlist\(count == 1 ? "" : "s")"
        }
    }
}

// MARK: - Library Category Card
struct LibraryCategoryCard: View {
    let category: LibraryCategory
    let itemCount: String
    
    var body: some View {
        HStack(spacing: 14) {
            // Icon with gradient background
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(
                        LinearGradient(
                            gradient: Gradient(colors: [
                                category.color.opacity(0.7),
                                category.color.opacity(0.5)
                            ]),
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 50, height: 50)
                    .shadow(color: category.color.opacity(0.25), radius: 6, x: 0, y: 3)
                
                Image(systemName: category.icon)
                    .font(.system(size: 22))
                    .foregroundColor(.white)
            }
            
            // Text info
            VStack(alignment: .leading, spacing: 4) {
                Text(category.rawValue)
                    .font(.headline)
                    .foregroundColor(.primary)
                
                Text(itemCount)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            
            Spacer()
            
            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(category.lightBackgroundColor)
                .shadow(color: .black.opacity(0.08), radius: 6, x: 0, y: 2)
        )
    }
}

// MARK: - Artists List View
struct ArtistsListView: View {
    @EnvironmentObject var libraryManager: MusicLibraryManager
    @Environment(\.dockBottomInset) private var dockBottomInset
    @State private var sortAscending = true
    @State private var searchText = ""
    @State private var viewMode: ArtistViewMode = .list
    
    enum ArtistViewMode {
        case list
        case grid
    }
    
    // Sourced from the pre-built index (one sort at index-build time) instead of
    // re-collecting a Set from the full track array on every render/keystroke.
    private var artists: [ArtistGroup] {
        let base = libraryManager.libraryIndex.artists
        let filtered = searchText.isEmpty ? base : base.filter { $0.matches(searchText) }
        return sortAscending ? filtered : filtered.reversed()
    }
    
    var body: some View {
        Group {
            if viewMode == .list {
                listView
            } else {
                gridView
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        // iOS 26's default .searchable placement moved to a persistent
        // bottom bar on iPhone (Apple's new "reachability" search design) —
        // explicitly pinning it back to the navigation bar drawer restores
        // the classic top placement that collapses on scroll, matching every
        // other screen's pre-iOS-26 behavior instead of fighting our own
        // custom bottom tab bar for the same screen real estate.
        .searchable(text: $searchText, placement: .navigationBarDrawer(displayMode: .automatic), prompt: "Search artists")
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text("Artists")
                    .font(.title2)
                    .fontWeight(.bold)
            }
            ToolbarItem(placement: .navigationBarTrailing) {
                HStack(spacing: 16) {
                    // View mode toggle
                    Button(action: { 
                        withAnimation(.easeInOut(duration: 0.2)) {
                            viewMode = viewMode == .list ? .grid : .list
                        }
                    }) {
                        Image(systemName: viewMode == .list ? "square.grid.2x2" : "list.bullet")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    
                    // Sort toggle
                    Button(action: { sortAscending.toggle() }) {
                        Image(systemName: sortAscending ? "arrow.up" : "arrow.down")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                }
            }
        }
    }
    
    private var listView: some View {
        List {
            ForEach(artists) { artist in
                NavigationLink(destination: ArtistDetailView(artistID: artist.id)) {
                    ArtistRowView(artist: artist)
                }
                .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
            }
        }
        .listStyle(.plain)
        .safeAreaPadding(.bottom, dockBottomInset)
    }
    
    private var gridView: some View {
        ScrollView {
            LazyVGrid(columns: [
                GridItem(.flexible(), spacing: 16),
                GridItem(.flexible(), spacing: 16)
            ], spacing: 20) {
                ForEach(artists) { artist in
                    NavigationLink(destination: ArtistDetailView(artistID: artist.id)) {
                        ArtistGridItemView(artist: artist)
                    }
                    .buttonStyle(PlainButtonStyle())
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
        }
        .safeAreaPadding(.bottom, dockBottomInset)
    }
}

// MARK: - Artist Row View (Enhanced List Item)
struct ArtistRowView: View {
    let artist: ArtistGroup
    
    var body: some View {
        HStack(spacing: 12) {
            // Artist image with shadow
            ArtistImageView(artistName: artist.name)
                .frame(width: 50, height: 50)
                .clipShape(Circle())
                .shadow(color: .black.opacity(0.2), radius: 4, x: 0, y: 2)
            
            VStack(alignment: .leading, spacing: 6) {
                Text(artist.name)
                    .font(.headline)
                    .lineLimit(2)
                    .foregroundColor(.primary)
                
                HStack(spacing: 10) {
                    Label("\(artist.primaryAlbumCount)", systemImage: "square.stack")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    
                    Label("\(artist.primaryTracks.count)", systemImage: "music.note")
                        .font(.caption)
                        .foregroundColor(.secondary)

                    if !artist.featuredTracks.isEmpty {
                        Label("\(artist.featuredTracks.count)", systemImage: "person.2.badge.plus")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
            }
            
            Spacer(minLength: 0)
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Artist Grid Item View
struct ArtistGridItemView: View {
    let artist: ArtistGroup
    
    var body: some View {
        VStack(spacing: 12) {
            // Artist image
            ArtistImageView(artistName: artist.name)
                .frame(maxWidth: .infinity)
                .aspectRatio(1, contentMode: .fill)
                .clipShape(Circle())
                .shadow(color: .black.opacity(0.25), radius: 8, x: 0, y: 4)
            
            VStack(spacing: 4) {
                Text(artist.name)
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
                    .foregroundColor(.primary)
                
                HStack(spacing: 8) {
                    Text("\(artist.primaryAlbumCount) album\(artist.primaryAlbumCount == 1 ? "" : "s")")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                    
                    Text("•")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                    
                    Text("\(artist.primaryTracks.count) song\(artist.primaryTracks.count == 1 ? "" : "s")")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }

                if !artist.featuredTracks.isEmpty {
                    Text("\(artist.featuredTracks.count) appearance\(artist.featuredTracks.count == 1 ? "" : "s")")
                        .font(.caption2)
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
    @Environment(\.dockBottomInset) private var dockBottomInset
    @State private var sortAscending = true
    @State private var searchText = ""
    @State private var viewMode: AlbumViewMode = .list
    
    enum AlbumViewMode {
        case list
        case grid
    }
    
    // An album is a search match when its name OR any of its artists match (see
    // AlbumGroup.matches), so searching "Album list on mobile ... by artist" now
    // works the same way it does on desktop.
    private var albums: [AlbumGroup] {
        let base = libraryManager.libraryIndex.albums
        let filtered = searchText.isEmpty ? base : base.filter { $0.matches(searchText) }
        return sortAscending ? filtered : filtered.reversed()
    }
    
    var body: some View {
        Group {
            if viewMode == .list {
                listView
            } else {
                gridView
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $searchText, placement: .navigationBarDrawer(displayMode: .automatic), prompt: "Search albums")
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text("Albums")
                    .font(.title2)
                    .fontWeight(.bold)
            }
            ToolbarItem(placement: .navigationBarTrailing) {
                HStack(spacing: 16) {
                    // View mode toggle
                    Button(action: { 
                        withAnimation(.easeInOut(duration: 0.2)) {
                            viewMode = viewMode == .list ? .grid : .list
                        }
                    }) {
                        Image(systemName: viewMode == .list ? "square.grid.2x2" : "list.bullet")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    
                    // Sort toggle
                    Button(action: { sortAscending.toggle() }) {
                        Image(systemName: sortAscending ? "arrow.up" : "arrow.down")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                }
            }
        }
    }
    
    private var listView: some View {
        List {
            ForEach(albums) { album in
                NavigationLink(destination: AlbumDetailView(album: album.album)) {
                    AlbumRowView(album: album)
                }
                .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
            }
        }
        .listStyle(.plain)
        .safeAreaPadding(.bottom, dockBottomInset)
    }
    
    private var gridView: some View {
        ScrollView {
            LazyVGrid(columns: [
                GridItem(.flexible(), spacing: 16),
                GridItem(.flexible(), spacing: 16)
            ], spacing: 20) {
                ForEach(albums) { album in
                    NavigationLink(destination: AlbumDetailView(album: album.album)) {
                        AlbumGridItemView(album: album)
                    }
                    .buttonStyle(PlainButtonStyle())
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
        }
        .safeAreaPadding(.bottom, dockBottomInset)
    }
}

// MARK: - Album Row View (Enhanced List Item)
struct AlbumRowView: View {
    let album: AlbumGroup
    
    var body: some View {
        HStack(spacing: 12) {
            // Album art with shadow
            Group {
                if let artData = album.albumArtData,
                   let uiImage = UIImage(data: artData) {
                    Image(uiImage: uiImage)
                        .resizable()
                        .scaledToFill()
                        .frame(width: 60, height: 60)
                        .clipped()
                        .cornerRadius(8)
                        .shadow(color: .black.opacity(0.2), radius: 4, x: 0, y: 2)
                } else {
                    RoundedRectangle(cornerRadius: 8)
                        .fill(
                            LinearGradient(
                                gradient: Gradient(colors: [Color.purple.opacity(0.4), Color.purple.opacity(0.2)]),
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 60, height: 60)
                        .overlay(
                            Image(systemName: "music.note")
                                .font(.title2)
                                .foregroundColor(.purple)
                        )
                        .shadow(color: .black.opacity(0.1), radius: 4, x: 0, y: 2)
                }
            }
            
            VStack(alignment: .leading, spacing: 6) {
                Text(album.album)
                    .font(.headline)
                    .lineLimit(2)
                    .foregroundColor(.primary)
                
                Text(album.albumArtist)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .lineLimit(1)
                
                HStack(spacing: 10) {
                    // Year badge
                    if let year = album.year {
                        Text(String(year))
                            .font(.caption2)
                            .fontWeight(.medium)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 3)
                            .background(Color.purple.opacity(0.15))
                            .foregroundColor(.purple)
                            .cornerRadius(5)
                    }
                    
                    // Track count
                    Label("\(album.tracks.count)", systemImage: "music.note")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            
            Spacer(minLength: 0)
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Album Grid Item View
struct AlbumGridItemView: View {
    let album: AlbumGroup
    
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Album art
            Group {
                if let artData = album.albumArtData,
                   let uiImage = UIImage(data: artData) {
                    Image(uiImage: uiImage)
                        .resizable()
                        .scaledToFill()
                        .frame(maxWidth: .infinity)
                        .aspectRatio(1, contentMode: .fill)
                        .clipped()
                        .cornerRadius(12)
                        .shadow(color: .black.opacity(0.25), radius: 8, x: 0, y: 4)
                } else {
                    RoundedRectangle(cornerRadius: 12)
                        .fill(
                            LinearGradient(
                                gradient: Gradient(colors: [Color.purple.opacity(0.4), Color.purple.opacity(0.2)]),
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .aspectRatio(1, contentMode: .fill)
                        .overlay(
                            Image(systemName: "music.note")
                                .font(.system(size: 40))
                                .foregroundColor(.purple.opacity(0.7))
                        )
                        .shadow(color: .black.opacity(0.15), radius: 8, x: 0, y: 4)
                }
            }
            
            VStack(alignment: .leading, spacing: 4) {
                Text(album.album)
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .lineLimit(2)
                    .foregroundColor(.primary)
                
                Text(album.albumArtist)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .lineLimit(1)
                
                Text("\(album.tracks.count) song\(album.tracks.count == 1 ? "" : "s")")
                    .font(.caption2)
                    .foregroundColor(.secondary)
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
    @Environment(\.dockBottomInset) private var dockBottomInset
    @State private var sortAscending = true
    @State private var searchText = ""
    
    private var genres: [GenreGroup] {
        let base = libraryManager.libraryIndex.genres
        let filtered = searchText.isEmpty ? base : base.filter { $0.matches(searchText) }
        return sortAscending ? filtered : filtered.reversed()
    }
    
    var body: some View {
        List {
            ForEach(genres) { genre in
                NavigationLink(destination: GenreDetailView(genre: genre.genre)) {
                    HStack {
                        Image(systemName: "music.quarternote.3")
                            .font(.title2)
                            .foregroundColor(.purple)
                            .frame(width: 44, height: 44)
                            .background(Color.purple.opacity(0.1))
                            .cornerRadius(8)
                        
                        VStack(alignment: .leading, spacing: 4) {
                            Text(genre.genre)
                                .font(.headline)
                            
                            Text("\(genre.tracks.count) song\(genre.tracks.count == 1 ? "" : "s")")
                                .font(.caption)
                                .foregroundColor(.gray)
                        }
                    }
                }
            }
        }
        .safeAreaPadding(.bottom, dockBottomInset)
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $searchText, placement: .navigationBarDrawer(displayMode: .automatic), prompt: "Search genres")
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text("Genres")
                    .font(.title2)
                    .fontWeight(.bold)
            }
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
    @Environment(\.dockBottomInset) private var dockBottomInset
    @State private var searchText = ""
    
    var recentlyPlayedTracks: [Track] {
        let filtered = libraryManager.tracks
            .filter { $0.lastPlayed != nil }
            .sorted { ($0.lastPlayed ?? Date.distantPast) > ($1.lastPlayed ?? Date.distantPast) }
        
        return filtered.filter { $0.matches(searchText) }
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
                .safeAreaPadding(.bottom, dockBottomInset)
            }
        }
        .navigationTitle("Recently Played")
        .navigationBarTitleDisplayMode(.large)
        .searchable(text: $searchText, placement: .navigationBarDrawer(displayMode: .automatic), prompt: "Search recently played")
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

