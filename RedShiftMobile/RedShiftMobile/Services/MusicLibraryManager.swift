// MusicLibraryManager.swift
// Manages the music library - scanning files, metadata, database

import Foundation
import AVFoundation
import SwiftTaggerID3

class MusicLibraryManager: ObservableObject {
    @Published var tracks: [Track] = []
    @Published var playlists: [Playlist] = []
    @Published var isScanning: Bool = false
    @Published var scanProgress: Double = 0.0
    
    private let musicDirectory: URL
    private let databaseService: DatabaseService
    private let supportedExtensions = ["mp3", "m4a", "flac", "wav", "aac", "ogg", "opus"]
    
    init() {
        // Setup Documents/Music directory
        let documentsPath = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        self.musicDirectory = documentsPath.appendingPathComponent("Music")
        
        
        
        // Ensure directory exists
        try? FileManager.default.createDirectory(at: musicDirectory, withIntermediateDirectories: true)
        
        // Initialize database
        self.databaseService = DatabaseService()
    }
    
    // MARK: - Library Loading
    func loadLibraryFromDatabase() async {
        do {
            // Step 1: Load existing tracks
            let loadedTracks = try await databaseService.loadTracks()
            let loadedPlaylists = try await databaseService.loadPlaylists()
            
            
            
            // Step 2: Validate files exist and clean up orphaned entries
            let fileManager = FileManager.default
            var validTracks: [Track] = []
            
            for track in loadedTracks {
                if fileManager.fileExists(atPath: track.filePath) {
                    validTracks.append(track)
                } else {
                    print("🗑️ Removing orphaned track on startup: \(track.fileName)")
                    try await databaseService.deleteTrack(track)
                }
            }
            
            let safeValidTracks = validTracks
            let safeLoadedPlaylists = loadedPlaylists
            await MainActor.run {
                tracks = safeValidTracks
                playlists = safeLoadedPlaylists
            }
            
            
        } catch {
            print("❌ Failed to load library: \(error)")
        }
    }
    
    // MARK: - Library Scanning
    func scanLibrary() async {
        await MainActor.run {
            isScanning = true
            scanProgress = 0.0
        }
        
        do {
            // Step 1: Clean up orphaned database entries
            
            let existingTracks = try await databaseService.loadTracks()
            let fileManager = FileManager.default
            
            for track in existingTracks {
                if !fileManager.fileExists(atPath: track.filePath) {
                    
                    try await databaseService.deleteTrack(track)
                }
            }
            
            // Step 2: Get all audio files currently in the Music directory
            let audioFiles = try findAudioFiles(in: musicDirectory)
            let totalFiles = audioFiles.count
            
            
            
            var scannedTracks: [Track] = []
            
            // Step 3: Process each file
            for (index, fileURL) in audioFiles.enumerated() {
                if let track = await processAudioFile(fileURL) {
                    scannedTracks.append(track)
                }
                await MainActor.run {
                    scanProgress = Double(index + 1) / Double(totalFiles)
                }
            }
            
            // Step 4: Clear ALL tracks from database, then insert fresh ones
            // This prevents duplicates when app container changes
            try await databaseService.clearAllTracks()
            try await databaseService.saveTracks(scannedTracks)
            
            // Step 5: Load fresh data
            let loadedTracks = try await databaseService.loadTracks()
            let loadedPlaylists = try await databaseService.loadPlaylists()
            
            await MainActor.run {
                tracks = loadedTracks
                playlists = loadedPlaylists
            }
            
            
            
        } catch {
            print("❌ Library scan failed: \(error)")
        }
        
        await MainActor.run {
            isScanning = false
            scanProgress = 1.0
        }
    }
    
    private func findAudioFiles(in directory: URL) throws -> [URL] {
        let fileManager = FileManager.default
        let enumerator = fileManager.enumerator(
            at: directory,
            includingPropertiesForKeys: [.isRegularFileKey],
            options: [.skipsHiddenFiles]
        )
        
        var audioFiles: [URL] = []
        
        while let fileURL = enumerator?.nextObject() as? URL {
            guard let resourceValues = try? fileURL.resourceValues(forKeys: [.isRegularFileKey]),
                  resourceValues.isRegularFile == true else {
                continue
            }
            
            let fileExtension = fileURL.pathExtension.lowercased()
            if supportedExtensions.contains(fileExtension) {
                audioFiles.append(fileURL)
            }
        }
        
        return audioFiles
    }
    
    private func processAudioFile(_ fileURL: URL) async -> Track? {
        do {
            let fileManager = FileManager.default
            let attributes = try fileManager.attributesOfItem(atPath: fileURL.path)
            let fileSize = attributes[.size] as? Int64 ?? 0
            let modifiedDate = attributes[.modificationDate] as? Date ?? Date()
            
            // Extract metadata using AVFoundation
            let asset = AVAsset(url: fileURL)
            let metadata = try await asset.load(.metadata)
            
            var title: String?
            var artist: String?
            var album: String?
            var albumArtist: String?
            var year: Int?
            var trackNumber: Int?
            var genre: String?
            
            // Extract metadata from common metadata
            var comm: String? // Comment field (may contain album info)
            
            for item in metadata {
                if let key = item.commonKey {
                    switch key {
                    case .commonKeyTitle:
                        title = try? await item.load(.stringValue)
                    case .commonKeyArtist:
                        artist = try? await item.load(.stringValue)
                    case .commonKeyAlbumName:
                        album = try? await item.load(.stringValue)
                    case .commonKeyType:
                        genre = try? await item.load(.stringValue)
                    default:
                        break
                    }
                } else if let identifier = item.identifier?.rawValue {
                    // Check for COMM (comment) field which may contain album info
                    if identifier == "id3/COMM" {
                        comm = try? await item.load(.stringValue)
                    }
                    // Capture album artist (TPE2) if present; useful as a fallback
                    if identifier == "id3/TPE2" && albumArtist == nil {
                        albumArtist = try? await item.load(.stringValue)
                    }
                }
            }
            
            // Primary ID3 read using SwiftTaggerID3 for robust album/title/artist
            do {
                let mp3 = try Mp3File(location: fileURL)
                let tag = try Tag(mp3File: mp3)
                if title == nil { title = tag.title }
                if artist == nil { artist = tag.artist }
                if album == nil { album = tag.album }
                // albumArtist not provided by example; we retain prior extraction for TPE2
            } catch {
                // Ignore; we'll fall back below
            }
            
            // Fallback: If no album from TALB, try to extract from COMM (comment) field
            // music-metadata does this for files downloaded from PagalWorld and similar sources
            if album == nil, let comment = comm {
                // Look for patterns like "album name - Source" or just use the comment as album
                // Remove URLs and common prefixes
                var cleanComment = comment
                    .replacingOccurrences(of: "Downloaded from https://pagalworld", with: "")
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                
                // If comment contains " - " pattern, take the first part as album
                if cleanComment.contains(" - ") {
                    let parts = cleanComment.components(separatedBy: " - ")
                    if let firstPart = parts.first, !firstPart.isEmpty {
                        album = firstPart
                    }
                } else if !cleanComment.isEmpty && !cleanComment.starts(with: "http") {
                    // Use cleaned comment as album if it's not a URL
                    album = cleanComment
                }
            }
            
            // MARK: - ID3 Fallback (reads TALB/TIT2/TPE1/TPE2/TCON/TYER/TDRC/COMM)
            if title == nil || artist == nil || album == nil || albumArtist == nil || genre == nil || year == nil {
                if let id3 = ID3TagReader.read(from: fileURL) {
                    
                    if title == nil { title = id3.title }
                    if artist == nil { artist = id3.artist }
                    if album == nil { album = id3.album }
                    if albumArtist == nil { albumArtist = id3.albumArtist }
                    if genre == nil { genre = id3.genre }
                    if year == nil {
                        if let y = id3.year {
                            let digits = y.trimmingCharacters(in: CharacterSet(charactersIn: "0123456789").inverted)
                            if let yInt = Int(digits), yInt > 0 { year = yInt }
                        }
                    }
                    // Heuristic: use comment when album missing (common in web-sourced MP3s)
                    if album == nil, let c = id3.comment, !c.isEmpty {
                        var clean = c.replacingOccurrences(of: "Downloaded from https://pagalworld", with: "")
                            .trimmingCharacters(in: .whitespacesAndNewlines)
                        if clean.contains(" - ") {
                            let parts = clean.components(separatedBy: " - ")
                            if let first = parts.first, !first.isEmpty { album = first }
                        } else if !clean.starts(with: "http") {
                            album = clean
                        }
                    }
                    // Last-resort heuristic: use albumArtist as album if still nil
                    if album == nil, let aa = albumArtist, !aa.isEmpty {
                        album = aa
                    }
                }
            }
            
            // Get duration
            let duration = try await asset.load(.duration)
            let durationSeconds = CMTimeGetSeconds(duration)
            
            return Track(
                filePath: fileURL.path,
                fileName: fileURL.lastPathComponent,
                title: title,
                artist: artist,
                album: album,
                albumArtist: albumArtist,
                year: year,
                trackNumber: trackNumber,
                genre: genre,
                duration: durationSeconds,
                fileSize: fileSize,
                modifiedDate: modifiedDate
            )
            
        } catch {
            print("Failed to process \(fileURL.lastPathComponent): \(error)")
            return nil
        }
    }
    
    // MARK: - Track Operations
    func updateTrackMetadata(_ track: Track) async {
        do {
            try await databaseService.updateTrack(track)
            // Reload tracks to reflect changes
            tracks = try await databaseService.loadTracks()
        } catch {
            print("Failed to update track: \(error)")
        }
    }
    
    func incrementPlayCount(for track: Track) async {
        var updatedTrack = track
        updatedTrack.playCount += 1
        updatedTrack.lastPlayed = Date()
        await updateTrackMetadata(updatedTrack)
    }
    
    func toggleFavorite(for track: Track) async {
        var updatedTrack = track
        updatedTrack.isFavorite.toggle()
        await updateTrackMetadata(updatedTrack)
    }
    
    func setRating(_ rating: Int, for track: Track) async {
        var updatedTrack = track
        updatedTrack.rating = min(max(rating, 0), 5)
        await updateTrackMetadata(updatedTrack)
    }
    
    // MARK: - Playlist Operations
    func createPlaylist(name: String, trackIDs: [UUID] = []) async {
        let playlist = Playlist(name: name, trackIDs: trackIDs)
        do {
            try await databaseService.savePlaylist(playlist)
            playlists = try await databaseService.loadPlaylists()
        } catch {
            print("Failed to create playlist: \(error)")
        }
    }
    
    func updatePlaylist(_ playlist: Playlist) async {
        do {
            try await databaseService.updatePlaylist(playlist)
            playlists = try await databaseService.loadPlaylists()
        } catch {
            print("Failed to update playlist: \(error)")
        }
    }
    
    func deletePlaylist(_ playlist: Playlist) async {
        do {
            try await databaseService.deletePlaylist(playlist.id)
            playlists = try await databaseService.loadPlaylists()
        } catch {
            print("Failed to delete playlist: \(error)")
        }
    }
    
    func addTrackToPlaylist(trackID: UUID, playlistID: UUID) async {
        guard let index = playlists.firstIndex(where: { $0.id == playlistID }) else { return }
        var playlist = playlists[index]
        
        if !playlist.trackIDs.contains(trackID) {
            playlist.trackIDs.append(trackID)
            playlist.modifiedDate = Date()
            await updatePlaylist(playlist)
        }
    }
    
    func removeTrackFromPlaylist(trackID: UUID, playlistID: UUID) async {
        guard let index = playlists.firstIndex(where: { $0.id == playlistID }) else { return }
        var playlist = playlists[index]
        
        playlist.trackIDs.removeAll { $0 == trackID }
        playlist.modifiedDate = Date()
        await updatePlaylist(playlist)
    }
    
    // MARK: - Query Helpers
    func getFavoriteTracks() -> [Track] {
        return tracks.filter { $0.isFavorite }
    }
    
    func getTopPlayed(limit: Int = 20) -> [Track] {
        return tracks.sorted { $0.playCount > $1.playCount }.prefix(limit).map { $0 }
    }
    
    func searchTracks(query: String) -> [Track] {
        let lowercaseQuery = query.lowercased()
        return tracks.filter {
            $0.displayTitle.lowercased().contains(lowercaseQuery) ||
            $0.displayArtist.lowercased().contains(lowercaseQuery) ||
            $0.displayAlbum.lowercased().contains(lowercaseQuery)
        }
    }
    
    func getTracksForPlaylist(_ playlist: Playlist) -> [Track] {
        return playlist.trackIDs.compactMap { trackID in
            tracks.first { $0.id == trackID }
        }
    }
}
