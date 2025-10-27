// PlaylistsView.swift
// Playlists management and viewing

import SwiftUI

struct PlaylistsView: View {
    @EnvironmentObject var audioPlayer: AudioPlayerService
    @EnvironmentObject var libraryManager: MusicLibraryManager
    
    @State private var showingCreatePlaylist = false
    @State private var newPlaylistName = ""
    
    var body: some View {
        NavigationView {
            VStack {
                if libraryManager.playlists.isEmpty {
                    // Empty state
                    VStack(spacing: 20) {
                        Image(systemName: "music.note.list")
                            .font(.system(size: 60))
                            .foregroundColor(.gray)
                        
                        Text("No Playlists")
                            .font(.title2)
                            .foregroundColor(.gray)
                        
                        Text("Create a playlist to organize your music")
                            .font(.body)
                            .foregroundColor(.gray)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 40)
                        
                        Button(action: { showingCreatePlaylist = true }) {
                            Label("Create Playlist", systemImage: "plus.circle.fill")
                                .padding(.horizontal, 20)
                                .padding(.vertical, 12)
                                .background(Color.purple)
                                .foregroundColor(.white)
                                .cornerRadius(10)
                        }
                    }
                    .frame(maxHeight: .infinity)
                    
                } else {
                    // Playlists list
                    List {
                        ForEach(libraryManager.playlists) { playlist in
                            NavigationLink(destination: PlaylistDetailView(playlist: playlist)) {
                                PlaylistRow(playlist: playlist)
                            }
                        }
                        .onDelete(perform: deletePlaylists)
                    }
                }
            }
            .navigationTitle("Playlists")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { showingCreatePlaylist = true }) {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showingCreatePlaylist) {
                CreatePlaylistSheet(isPresented: $showingCreatePlaylist, playlistName: $newPlaylistName)
            }
        }
    }
    
    private func deletePlaylists(at offsets: IndexSet) {
        for index in offsets {
            let playlist = libraryManager.playlists[index]
            Task {
                await libraryManager.deletePlaylist(playlist)
            }
        }
    }
}

// MARK: - Playlist Row
struct PlaylistRow: View {
    @EnvironmentObject var libraryManager: MusicLibraryManager
    let playlist: Playlist
    
    var body: some View {
        HStack(spacing: 12) {
            // Playlist icon
            RoundedRectangle(cornerRadius: 8)
                .fill(Color.purple.opacity(0.3))
                .frame(width: 60, height: 60)
                .overlay {
                    Image(systemName: "music.note.list")
                        .font(.title2)
                        .foregroundColor(.purple)
                }
            
            VStack(alignment: .leading, spacing: 4) {
                Text(playlist.name)
                    .font(.body)
                    .fontWeight(.medium)
                
                Text("\(playlist.trackCount) tracks")
                    .font(.caption)
                    .foregroundColor(.gray)
            }
            
            Spacer()
            
            if playlist.isFavorite {
                Image(systemName: "star.fill")
                    .foregroundColor(.purple)
                    .font(.caption)
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Create Playlist Sheet
struct CreatePlaylistSheet: View {
    @EnvironmentObject var libraryManager: MusicLibraryManager
    @Binding var isPresented: Bool
    @Binding var playlistName: String
    
    var body: some View {
        NavigationView {
            Form {
                Section {
                    TextField("Playlist Name", text: $playlistName)
                } header: {
                    Text("Name")
                }
            }
            .navigationTitle("New Playlist")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        playlistName = ""
                        isPresented = false
                    }
                }
                
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        Task {
                            await libraryManager.createPlaylist(name: playlistName)
                            playlistName = ""
                            isPresented = false
                        }
                    }
                    .disabled(playlistName.isEmpty)
                }
            }
        }
    }
}

// MARK: - Playlist Detail View
struct PlaylistDetailView: View {
    @EnvironmentObject var audioPlayer: AudioPlayerService
    @EnvironmentObject var libraryManager: MusicLibraryManager
    
    let playlist: Playlist
    @State private var showingAddTracks = false
    
    var playlistTracks: [Track] {
        libraryManager.getTracksForPlaylist(playlist)
    }
    
    var body: some View {
        VStack {
            if playlistTracks.isEmpty {
                // Empty playlist
                VStack(spacing: 20) {
                    Image(systemName: "music.note")
                        .font(.system(size: 60))
                        .foregroundColor(.gray)
                    
                    Text("No tracks in playlist")
                        .font(.headline)
                        .foregroundColor(.gray)
                    
                    Button(action: { showingAddTracks = true }) {
                        Label("Add Tracks", systemImage: "plus.circle.fill")
                            .padding(.horizontal, 20)
                            .padding(.vertical, 10)
                            .background(Color.purple)
                            .foregroundColor(.white)
                            .cornerRadius(8)
                    }
                }
                .frame(maxHeight: .infinity)
                
            } else {
                List {
                    // Playlist header with play all
                    Section {
                        Button(action: {
                            audioPlayer.playQueue(playlistTracks)
                        }) {
                            HStack {
                                Image(systemName: "play.circle.fill")
                                    .font(.title2)
                                    .foregroundColor(.purple)
                                Text("Play All")
                                    .font(.headline)
                                Spacer()
                                Text("\(playlistTracks.count) tracks")
                                    .font(.caption)
                                    .foregroundColor(.gray)
                            }
                        }
                    }
                    
                    // Tracks
                    Section {
                        ForEach(playlistTracks) { track in
                            TrackRow(track: track)
                                .contentShape(Rectangle())
                                .onTapGesture {
                                    audioPlayer.playQueue(playlistTracks, startingAt: playlistTracks.firstIndex(where: { $0.id == track.id }) ?? 0)
                                }
                                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                    Button(role: .destructive) {
                                        Task {
                                            await libraryManager.removeTrackFromPlaylist(trackStableID: track.stableID, playlistID: playlist.id)
                                        }
                                    } label: {
                                        Label("Remove", systemImage: "trash")
                                    }
                                }
                        }
                    }
                }
                .listStyle(.insetGrouped)
            }
        }
        .navigationTitle(playlist.name)
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button(action: { showingAddTracks = true }) {
                    Image(systemName: "plus")
                }
            }
        }
        .sheet(isPresented: $showingAddTracks) {
            AddTracksToPlaylistSheet(playlist: playlist, isPresented: $showingAddTracks)
        }
    }
}

// MARK: - Add Tracks to Playlist Sheet
struct AddTracksToPlaylistSheet: View {
    @EnvironmentObject var libraryManager: MusicLibraryManager
    let playlist: Playlist
    @Binding var isPresented: Bool
    
    @State private var searchText = ""
    @State private var selectedTrackIDs: Set<UUID> = []
    
    var availableTracks: [Track] {
        let playlistTrackStableIDs = Set(playlist.trackStableIDs)
        var tracks = libraryManager.tracks.filter { !playlistTrackStableIDs.contains($0.stableID) }
        
        if !searchText.isEmpty {
            tracks = tracks.filter {
                $0.displayTitle.localizedCaseInsensitiveContains(searchText) ||
                $0.displayArtist.localizedCaseInsensitiveContains(searchText) ||
                $0.displayAlbum.localizedCaseInsensitiveContains(searchText)
            }
        }
        
        return tracks
    }
    
    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                // Search
                HStack {
                    Image(systemName: "magnifyingglass")
                        .foregroundColor(.gray)
                    TextField("Search tracks", text: $searchText)
                    if !searchText.isEmpty {
                        Button(action: { searchText = "" }) {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundColor(.gray)
                        }
                    }
                }
                .padding(10)
                .background(Color(.systemGray6))
                .cornerRadius(10)
                .padding()
                
                // Track list
                List(availableTracks) { track in
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(track.displayTitle)
                                .font(.body)
                            Text(track.displayArtist)
                                .font(.caption)
                                .foregroundColor(.gray)
                        }
                        
                        Spacer()
                        
                        if selectedTrackIDs.contains(track.id) {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundColor(.purple)
                        } else {
                            Image(systemName: "circle")
                                .foregroundColor(.gray)
                        }
                    }
                    .contentShape(Rectangle())
                    .onTapGesture {
                        if selectedTrackIDs.contains(track.id) {
                            selectedTrackIDs.remove(track.id)
                        } else {
                            selectedTrackIDs.insert(track.id)
                        }
                    }
                }
            }
            .navigationTitle("Add Tracks")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        isPresented = false
                    }
                }
                
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add (\(selectedTrackIDs.count))") {
                        Task {
                            for trackID in selectedTrackIDs {
                                if let track = libraryManager.tracks.first(where: { $0.id == trackID }) {
                                    await libraryManager.addTrackToPlaylist(trackStableID: track.stableID, playlistID: playlist.id)
                                }
                            }
                            isPresented = false
                        }
                    }
                    .disabled(selectedTrackIDs.isEmpty)
                }
            }
        }
    }
}

#Preview {
    PlaylistsView()
        .environmentObject(AudioPlayerService())
        .environmentObject(MusicLibraryManager())
}
