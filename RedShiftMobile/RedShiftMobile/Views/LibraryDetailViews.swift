// LibraryDetailViews.swift
// Detail views for Artists, Albums, and Genres

import SwiftUI

// MARK: - Marquee Text Component
struct MarqueeText: View {
    let text: String
    let font: Font
    @State private var offset: CGFloat = 0
    @State private var scrollTask: Task<Void, Never>?
    
    var body: some View {
        GeometryReader { geometry in
            Text(text)
                .font(font)
                .lineLimit(1)
                .fixedSize(horizontal: true, vertical: false)
                .offset(x: offset)
                .frame(width: geometry.size.width, alignment: .leading)
                .clipped()
                .onAppear {
                    startScrolling(containerWidth: geometry.size.width)
                }
                .onDisappear {
                    scrollTask?.cancel()
                    scrollTask = nil
                }
                .onChange(of: text) { _, _ in
                    offset = 0
                    startScrolling(containerWidth: geometry.size.width)
                }
        }
    }
    
    // Explicitly drives each scroll pass rather than using
    // Animation.repeatForever, which loops a single linear pass back-to-back
    // with no gap in between — the instant it finishes, it restarts, so the
    // first couple of characters are already sliding away again before a
    // reader can catch them. This instead: waits, animates one full pass,
    // then snaps back to the start (no animation) and HOLDS there for a
    // beat before the next pass begins.
    private func startScrolling(containerWidth: CGFloat) {
        scrollTask?.cancel()
        let width = textWidth(text: text, font: font)
        guard width > containerWidth else { return }
        
        // Matches the original target offset exactly (full text width plus a
        // trailing gap) — only the restart timing/pause behavior changed.
        let travelDistance = width + 20
        let scrollDuration = Double(text.count) * 0.2
        
        scrollTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            while !Task.isCancelled {
                withAnimation(.linear(duration: scrollDuration)) {
                    offset = -travelDistance
                }
                try? await Task.sleep(nanoseconds: UInt64(scrollDuration * 1_000_000_000))
                guard !Task.isCancelled else { return }
                offset = 0 // instant snap back, no animation
                try? await Task.sleep(nanoseconds: 1_000_000_000) // hold at start before next pass
            }
        }
    }
    
    private func textWidth(text: String, font: Font) -> CGFloat {
        let uiFont: UIFont
        switch font {
        case .body:
            uiFont = UIFont.preferredFont(forTextStyle: .body)
        case .caption:
            uiFont = UIFont.preferredFont(forTextStyle: .caption1)
        default:
            uiFont = UIFont.preferredFont(forTextStyle: .body)
        }
        
        let attributes = [NSAttributedString.Key.font: uiFont]
        let size = (text as NSString).size(withAttributes: attributes)
        return size.width
    }
}

// MARK: - Artist Detail View (shows albums + all tracks option)
struct ArtistDetailView: View {
    @EnvironmentObject var libraryManager: MusicLibraryManager
    @EnvironmentObject var audioPlayer: AudioPlayerService
    
    let artist: String
    
    private var allTracks: [Track] {
        libraryManager.libraryIndex.artists.first { $0.id == artist }?.tracks ?? []
    }
    
    // Album groups sourced from the pre-built index (already sorted by name)
    // rather than re-filtering the full track array for every album row.
    private var albums: [AlbumGroup] {
        let names = Set(allTracks.compactMap { $0.album })
        return libraryManager.libraryIndex.albums.filter { names.contains($0.album) }
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
                                ForEach(albums) { album in
                                    NavigationLink(destination: AlbumDetailView(album: album.album)) {
                                        HStack(spacing: 12) {
                                            // Album art
                                            Group {
                                                if let artData = album.albumArtData,
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
                                                Text(album.album)
                                                    .font(.headline)
                                                    .foregroundColor(.primary)
                                                
                                                Text("\(album.tracks.count) song\(album.tracks.count == 1 ? "" : "s")")
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
                                        
                                        if album.id != albums.last?.id {
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
        let base = libraryManager.libraryIndex.artists.first { $0.id == artist }?.tracks ?? []
        let filtered = searchText.isEmpty ? base : base.filter { $0.matches(searchText) }
        
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
    
    // Sourced from the index's pre-sorted AlbumGroup (disc, track, title, filename
    // order via Track.albumOrder) instead of re-filtering/re-sorting every render.
    private var albumGroup: AlbumGroup? {
        libraryManager.libraryIndex.albums.first { $0.id == album }
    }
    
    private var tracks: [Track] {
        albumGroup?.tracks ?? []
    }
    
    private var albumArtist: String {
        albumGroup?.albumArtist ?? "Unknown Artist"
    }
    
    private var albumYear: Int? {
        albumGroup?.year
    }
    
    var body: some View {
        ScrollView {
                VStack(spacing: 0) {
                    // Album Header
                    VStack(spacing: 12) {
                        // Album art
                        Group {
                            if let artData = albumGroup?.albumArtData,
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
                                    MarqueeText(text: track.displayTitle, font: .body)
                                        .foregroundColor(.primary)
                                        .frame(height: 20)
                                    
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
        let base = libraryManager.libraryIndex.genres.first { $0.id == genre }?.tracks ?? []
        let filtered = searchText.isEmpty ? base : base.filter { $0.matches(searchText) }
        
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

