// MusicLibraryManager.swift
// Manages the music library - scanning files, metadata, database

import Foundation
import AVFoundation
import SwiftTaggerID3

class MusicLibraryManager: ObservableObject {
    @Published var tracks: [Track] = [] {
        didSet {
            print("🔔 tracks @Published updated: \(tracks.count) tracks")
            // Rebuild the artist/album/genre index once per track-list change so
            // views never need to re-filter the full track array per row/keystroke.
            libraryIndex = LibraryIndex.build(from: tracks)
        }
    }
    /// One-pass snapshot of artist/album/genre groupings, kept in sync with `tracks`.
    @Published private(set) var libraryIndex: LibraryIndex = .empty
    @Published var playlists: [Playlist] = [] {
        didSet {
            print("🔔 playlists @Published updated: \(playlists.count) playlists")
            for (index, playlist) in playlists.enumerated() {
                print("   \(index + 1). \(playlist.name) (\(playlist.trackStableIDs.count) tracks)")
            }
        }
    }
    @Published var isScanning: Bool = false
    @Published var scanProgress: Double = 0.0
    /// Set when the most recent automatic reconciliation failed. The prior
    /// library snapshot is always retained on failure; existing refresh/
    /// settings surfaces can surface this without any new UI plumbing.
    @Published var lastReconciliationError: String?
    private var reconciliationTask: Task<Void, Never>?
    
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
        print("📚 Loading library from database...")
        do {
            // Step 1: Load existing tracks
            let loadedTracks = try await databaseService.loadTracks()
            print("📚 Loaded \(loadedTracks.count) tracks from database")
            
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
            
            // Step 3: Update tracks on main thread
            await MainActor.run {
                tracks = validTracks
            }
            print("📚 Validated \(validTracks.count) tracks")
            
            // Step 4: Import playlists from synced JSON files (needs tracks to be loaded first)
            print("📚 Step 4: About to import playlists from sync...")
            await importPlaylistsFromSync()
            print("📚 Step 4: Completed importing playlists from sync")
            
            // Step 5: Load playlists from database (after import)
            print("📚 Step 5: About to load playlists from database...")
            let loadedPlaylists = try await databaseService.loadPlaylists()
            print("📚 Step 5: Loaded \(loadedPlaylists.count) playlists from database")
            for playlist in loadedPlaylists {
                print("   📋 Playlist: \(playlist.name) (\(playlist.trackStableIDs.count) tracks)")
            }
            print("📚 Step 5: About to update playlists on main actor...")
            await MainActor.run {
                playlists = loadedPlaylists
                print("📚 Step 5: Playlists updated on main actor: \(playlists.count)")
            }
            print("📚 Library load complete: \(tracks.count) tracks, \(playlists.count) playlists")
            
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
                if var track = await processAudioFile(fileURL) {
                    // Populate the fingerprint so the next automatic
                    // reconciliation pass can recognize this file as
                    // unchanged instead of re-parsing every tag again.
                    track.fileFingerprint = Track.fingerprint(fileSize: track.fileSize, modifiedDate: track.modifiedDate)
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
    
    // MARK: - Incremental Reconciliation (automatic post-sync library refresh)
    
    /// Automatic, non-destructive library refresh run on launch and on
    /// returning to foreground. Unlike `scanLibrary()` (the explicit,
    /// destructive "Rescan Library" repair path kept for manual recovery),
    /// this only re-reads files that are new, changed, or removed since the
    /// last reconciliation, trusts the desktop's manifest metadata when
    /// available to skip tag parsing, and preserves every existing track's
    /// local metadata (play count, favorite, rating, added date) untouched.
    /// Concurrent callers (launch + foreground + manual pull-to-refresh) share
    /// a single in-flight task instead of racing duplicate work.
    func reconcileLibraryIncrementally() async {
        if let existing = reconciliationTask {
            await existing.value
            return
        }
        let task = Task { [weak self] in
            guard let self = self else { return }
            await self.performIncrementalReconciliation()
        }
        reconciliationTask = task
        await task.value
        reconciliationTask = nil
    }
    
    private func performIncrementalReconciliation() async {
        await MainActor.run {
            isScanning = true
            scanProgress = 0
            lastReconciliationError = nil
        }
        
        do {
            // Manifest is optional: a missing/malformed manifest just means we
            // fall back to filesystem-only reconciliation (still finds files
            // added via Files app/iTunes File Sharing) rather than aborting.
            let manifest = SyncManifestReader.readFromDisk()
            var manifestByFileName: [String: SyncManifestFile] = [:]
            if let manifest = manifest {
                for file in manifest.files {
                    manifestByFileName[file.fileName] = file
                }
            }
            
            let audioFiles = try findAudioFiles(in: musicDirectory)
            let fileManager = FileManager.default
            
            struct DiskEntry {
                let url: URL
                let filePath: String
                let fileSize: Int64
                let modifiedDate: Date
                let fingerprint: String
            }
            
            var diskEntries: [DiskEntry] = []
            for fileURL in audioFiles {
                guard let attributes = try? fileManager.attributesOfItem(atPath: fileURL.path) else { continue }
                let fileSize = (attributes[.size] as? Int64) ?? 0
                let modifiedDate = (attributes[.modificationDate] as? Date) ?? Date()
                let fingerprint = Track.fingerprint(fileSize: fileSize, modifiedDate: modifiedDate)
                diskEntries.append(DiskEntry(url: fileURL, filePath: fileURL.path, fileSize: fileSize, modifiedDate: modifiedDate, fingerprint: fingerprint))
            }
            let diskFilePaths = Set(diskEntries.map { $0.filePath })
            
            // Diff against the database's lightweight fingerprint index —
            // an unchanged fingerprint means "skip this file entirely",
            // which is what lets a large, mostly-unchanged library reconcile
            // in roughly the time it takes to stat every file once.
            let existingFingerprints = try await databaseService.loadFileFingerprints()
            let deletedFilePaths = existingFingerprints.keys.filter { !diskFilePaths.contains($0) }
            let changedEntries = diskEntries.filter { existingFingerprints[$0.filePath] != $0.fingerprint }
            
            let existingTracksByPath = Dictionary(uniqueKeysWithValues: tracks.map { ($0.filePath, $0) })
            
            var upserts: [Track] = []
            var processed = 0
            let totalToProcess = max(changedEntries.count, 1)
            
            for entry in changedEntries {
                let fileName = entry.url.lastPathComponent
                var track: Track?
                
                // Trust manifest metadata when it names this exact file AND
                // reports the same size. Size survives an AFC transfer even
                // though modification time does not, so it is the only safe
                // cross-device match key; this lets a manifest-covered file
                // skip AVFoundation/ID3 parsing entirely.
                if let manifestFile = manifestByFileName[fileName], manifestFile.fileSize == entry.fileSize {
                    track = Track(
                        filePath: entry.filePath,
                        fileName: fileName,
                        title: manifestFile.title,
                        artist: manifestFile.artist,
                        album: manifestFile.album,
                        albumArtist: manifestFile.albumArtist,
                        year: manifestFile.year,
                        trackNumber: manifestFile.trackNumber,
                        discNumber: manifestFile.discNumber,
                        genre: manifestFile.genre,
                        duration: manifestFile.duration ?? 0,
                        fileSize: entry.fileSize,
                        modifiedDate: entry.modifiedDate,
                        fileFingerprint: entry.fingerprint
                    )
                } else {
                    if var parsed = await processAudioFile(entry.url) {
                        parsed.fileFingerprint = entry.fingerprint
                        track = parsed
                    }
                }
                
                if let builtTrack = track {
                    upserts.append(preservingUserData(in: builtTrack, existing: existingTracksByPath[entry.filePath]))
                }
                
                processed += 1
                let progress = Double(processed) / Double(totalToProcess)
                await MainActor.run { scanProgress = progress }
            }
            
            if !upserts.isEmpty || !deletedFilePaths.isEmpty {
                try await databaseService.applyReconciliation(upserts: upserts, deleteFilePaths: Array(deletedFilePaths))
            }
            
            let reloadedTracks = try await databaseService.loadTracks()
            await MainActor.run {
                tracks = reloadedTracks
            }
            
            // Playlists and playback metadata are imported only after the
            // track list reflects the latest files, since both are matched
            // against `tracks` by filename/stableID.
            await importPlaylistsFromSync()
            await importSyncedPlaybackMetadata()
            
            let reloadedPlaylists = try await databaseService.loadPlaylists()
            await MainActor.run {
                playlists = reloadedPlaylists
            }
            
            // Record the manifest as accepted only after every step above
            // committed successfully, so a crash mid-reconciliation causes the
            // next launch/foreground to safely retry the same manifest rather
            // than silently skipping it as "already applied".
            if let manifest = manifest {
                try await databaseService.setSyncStateValue("acceptedManifestRevision", value: manifest.revision)
            }
        } catch {
            await MainActor.run {
                lastReconciliationError = "Library sync failed: \(error.localizedDescription)"
            }
            print("❌ Incremental reconciliation failed: \(error)")
        }
        
        await MainActor.run {
            isScanning = false
            scanProgress = 1.0
        }
    }
    
    /// Carries forward local-only fields (play count, last played, favorite,
    /// rating, added date) from the previous database row for this file path,
    /// so reconciling a changed/re-tagged file never resets user data the way
    /// the old destructive full-rescan did.
    private func preservingUserData(in track: Track, existing: Track?) -> Track {
        guard let existing = existing else { return track }
        var merged = track
        merged.playCount = existing.playCount
        merged.lastPlayed = existing.lastPlayed
        merged.isFavorite = existing.isFavorite
        merged.rating = existing.rating
        merged.addedDate = existing.addedDate
        return merged
    }
    
    /// Imports the desktop's authoritative merged playback metadata
    /// (Documents/SyncData/play_counts.json). By the time this file exists on
    /// the device, the desktop has already merged it with whatever the phone
    /// previously exported (play counts added, favorites ORed, ratings maxed
    /// — see PlayCountSyncManager on desktop), so the phone must REPLACE its
    /// local values with these rather than adding them again, or every sync
    /// would double-count plays.
    func importSyncedPlaybackMetadata() async {
        guard let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return }
        let fileURL = documentsURL.appendingPathComponent("SyncData").appendingPathComponent("play_counts.json")
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return }
        
        struct SyncedPlaybackMetadataEntry: Decodable {
            let fileName: String
            let playCount: Int
            let lastPlayed: Double?
            let isFavorite: Bool
            let rating: Int
        }
        
        do {
            let data = try Data(contentsOf: fileURL)
            let entries = try JSONDecoder().decode([SyncedPlaybackMetadataEntry].self, from: data)
            let entriesByFileName = Dictionary(uniqueKeysWithValues: entries.map { ($0.fileName, $0) })
            
            var updatedTracks: [Track] = []
            for var track in tracks {
                guard let entry = entriesByFileName[track.fileName] else { continue }
                track.playCount = entry.playCount
                track.lastPlayed = entry.lastPlayed.map { Date(timeIntervalSince1970: $0) }
                track.isFavorite = entry.isFavorite
                track.rating = entry.rating
                updatedTracks.append(track)
            }
            
            guard !updatedTracks.isEmpty else { return }
            try await databaseService.saveTracks(updatedTracks)
            let reloaded = try await databaseService.loadTracks()
            await MainActor.run {
                tracks = reloaded
            }
            print("✅ Imported synced playback metadata for \(updatedTracks.count) tracks")
        } catch {
            print("❌ Failed to import synced playback metadata: \(error)")
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
            var discNumber: Int?
            var genre: String?
            var albumArtData: Data?
            
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
                    case .commonKeyArtwork:
                        // Extract album art using AVFoundation (reliable!)
                        albumArtData = try? await item.load(.dataValue)
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
                    // Track/disc numbers are commonly "N" or "N/TOTAL" text frames
                    if identifier == "id3/TRCK" && trackNumber == nil {
                        let raw: String? = try? await item.load(.stringValue)
                        trackNumber = ID3TagReader.leadingInt(from: raw)
                    }
                    if identifier == "id3/TPOS" && discNumber == nil {
                        let raw: String? = try? await item.load(.stringValue)
                        discNumber = ID3TagReader.leadingInt(from: raw)
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
            
            // MARK: - ID3 Fallback (reads TALB/TIT2/TPE1/TPE2/TCON/TYER/TDRC/TRCK/TPOS/COMM/APIC)
            if title == nil || artist == nil || album == nil || albumArtist == nil || genre == nil || year == nil || albumArtData == nil || trackNumber == nil || discNumber == nil {
                if let id3 = ID3TagReader.read(from: fileURL) {
                    
                    if title == nil { title = id3.title }
                    if artist == nil { artist = id3.artist }
                    if album == nil { album = id3.album }
                    if albumArtist == nil { albumArtist = id3.albumArtist }
                    if genre == nil { genre = id3.genre }
                    if albumArtData == nil { albumArtData = id3.albumArt }
                    if trackNumber == nil { trackNumber = ID3TagReader.leadingInt(from: id3.trackNumber) }
                    if discNumber == nil { discNumber = ID3TagReader.leadingInt(from: id3.discNumber) }
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
                discNumber: discNumber,
                genre: genre,
                duration: durationSeconds,
                albumArtData: albumArtData,
                fileSize: fileSize,
                modifiedDate: modifiedDate
            )
            
        } catch {
            print("Failed to process \(fileURL.lastPathComponent): \(error)")
            return nil
        }
    }
    
    // MARK: - Track Operations
    func deleteTrack(_ track: Track) async throws {
        // Delete the physical file
        let fileURL = URL(fileURLWithPath: track.filePath)
        try FileManager.default.removeItem(at: fileURL)
        
        // Delete from database
        try await databaseService.deleteTrack(track)
        
        // Reload tracks
        await MainActor.run {
            tracks.removeAll { $0.id == track.id }
        }
    }
    
    func deleteTracks(_ tracksToDelete: [Track]) async throws {
        for track in tracksToDelete {
            // Delete the physical file
            let fileURL = URL(fileURLWithPath: track.filePath)
            try? FileManager.default.removeItem(at: fileURL)
            
            // Delete from database
            try? await databaseService.deleteTrack(track)
        }
        
        // Reload tracks
        let trackIDs = Set(tracksToDelete.map { $0.id })
        await MainActor.run {
            tracks.removeAll { trackIDs.contains($0.id) }
        }
    }
    
    func deleteAllTracks() async throws {
        // Delete all files in Music directory
        let fileManager = FileManager.default
        if let enumerator = fileManager.enumerator(at: musicDirectory, includingPropertiesForKeys: nil) {
            for case let fileURL as URL in enumerator {
                try? fileManager.removeItem(at: fileURL)
            }
        }
        
        // Clear database
        try await databaseService.clearAllTracks()
        
        // Clear tracks array
        await MainActor.run {
            tracks.removeAll()
        }
    }
    
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
    func createPlaylist(name: String, trackStableIDs: [String] = []) async {
        print("📋 createPlaylist called with name: '\(name)', trackStableIDs: \(trackStableIDs.count)")
        let playlist = Playlist(name: name, trackStableIDs: trackStableIDs)
        print("📋 Created playlist object: \(playlist.id)")
        do {
            print("📋 Saving playlist to database...")
            try await databaseService.savePlaylist(playlist)
            print("📋 Playlist saved, reloading all playlists...")
            let loadedPlaylists = try await databaseService.loadPlaylists()
            print("📋 Loaded \(loadedPlaylists.count) playlists from database after creation")
            await MainActor.run {
                playlists = loadedPlaylists
                print("📋 Main actor: playlists array updated with \(playlists.count) playlists")
            }
            print("📋 Created playlist: \(name), total playlists: \(playlists.count)")
        } catch {
            print("❌ Failed to create playlist: \(error)")
        }
    }
    
    func updatePlaylist(_ playlist: Playlist) async {
        do {
            try await databaseService.updatePlaylist(playlist)
            let loadedPlaylists = try await databaseService.loadPlaylists()
            await MainActor.run {
                playlists = loadedPlaylists
            }
        } catch {
            print("❌ Failed to update playlist: \(error)")
        }
    }
    
    func deletePlaylist(_ playlist: Playlist) async {
        do {
            try await databaseService.deletePlaylist(playlist.id)
            let loadedPlaylists = try await databaseService.loadPlaylists()
            await MainActor.run {
                playlists = loadedPlaylists
            }
        } catch {
            print("❌ Failed to delete playlist: \(error)")
        }
    }
    
    func addTrackToPlaylist(trackStableID: String, playlistID: UUID) async {
        guard let index = playlists.firstIndex(where: { $0.id == playlistID }) else { return }
        var playlist = playlists[index]
        
        if !playlist.trackStableIDs.contains(trackStableID) {
            playlist.trackStableIDs.append(trackStableID)
            playlist.modifiedDate = Date()
            await updatePlaylist(playlist)
        }
    }
    
    func removeTrackFromPlaylist(trackStableID: String, playlistID: UUID) async {
        guard let index = playlists.firstIndex(where: { $0.id == playlistID }) else { return }
        var playlist = playlists[index]
        
        playlist.trackStableIDs.removeAll { $0 == trackStableID }
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
        tracks.filter { $0.matches(query) }
    }
    
    func getTracksForPlaylist(_ playlist: Playlist) -> [Track] {
        return playlist.getTracks(from: tracks)
    }
    
    // MARK: - Playlist Sync Import
    func importPlaylistsFromSync() async {
        print("📋 Starting playlist import from sync...")
        
        guard let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
            print("❌ Could not get documents directory")
            return
        }
        
        let playlistsURL = documentsURL.appendingPathComponent("Playlists")
        print("📋 Looking for playlists at: \(playlistsURL.path)")
        
        // Check if Playlists directory exists
        guard FileManager.default.fileExists(atPath: playlistsURL.path) else {
            print("⚠️  Playlists directory does not exist")
            return
        }
        
        print("✅ Playlists directory exists")
        
        do {
            let files = try FileManager.default.contentsOfDirectory(at: playlistsURL, includingPropertiesForKeys: nil)
            print("📋 Found \(files.count) total files in Playlists directory")
            
            let jsonFiles = files.filter { $0.pathExtension == "json" }
            print("📋 Found \(jsonFiles.count) JSON playlist files to import")
            
            for fileURL in jsonFiles {
                print("📋 Importing: \(fileURL.lastPathComponent)")
                do {
                    try await importPlaylistFromJSON(fileURL)
                    print("✅ Successfully imported: \(fileURL.lastPathComponent)")
                } catch {
                    print("❌ Failed to import \(fileURL.lastPathComponent): \(error)")
                    // Continue with next file instead of stopping
                }
            }
            
            // Reload playlists from database to update UI
            print("📋 Reloading playlists from database...")
            let reloadedPlaylists = try await databaseService.loadPlaylists()
            await MainActor.run {
                self.playlists = reloadedPlaylists
                print("✅ Playlists reloaded: \(self.playlists.count) playlists now in memory")
            }
            
            print("✅ Playlist import complete")
            
        } catch {
            print("❌ Failed to import playlists: \(error)")
        }
    }
    
    private func importPlaylistFromJSON(_ fileURL: URL) async throws {
        print("📋 Reading file: \(fileURL.path)")
        let data = try Data(contentsOf: fileURL)
        print("📋 File size: \(data.count) bytes")
        
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .secondsSince1970
        
        struct SyncedPlaylist: Decodable {
            let name: String
            let tracks: [String] // Filenames
            let createdDate: Date
            let modifiedDate: Date
        }
        
        let syncedPlaylist = try decoder.decode(SyncedPlaylist.self, from: data)
        print("📋 Decoded playlist: \(syncedPlaylist.name) with \(syncedPlaylist.tracks.count) tracks")
        print("📋 Track filenames from sync: \(syncedPlaylist.tracks)")
        
        // Convert filenames to stable IDs by matching against library
        // Stable IDs are metadata-based (title+artist+album+duration) so they survive file moves
        print("📋 Converting filenames to stable IDs (total tracks in library: \(tracks.count))")
        let trackStableIDs = syncedPlaylist.tracks.compactMap { filename -> String? in
            if let track = tracks.first(where: { $0.fileName == filename }) {
                print("   ✓ Found: \(filename) → \(track.stableID)")
                return track.stableID
            } else {
                print("   ✗ Not found: \(filename)")
                return nil
            }
        }
        print("📋 Converted \(trackStableIDs.count) out of \(syncedPlaylist.tracks.count) tracks to stable IDs")
        
        // Check if playlist already exists (must check database, not in-memory array)
        let existingPlaylists = try await databaseService.loadPlaylists()
        if let existingPlaylist = existingPlaylists.first(where: { $0.name == syncedPlaylist.name }) {
            // Update existing playlist
            var updatedPlaylist = existingPlaylist
            updatedPlaylist.trackStableIDs = trackStableIDs
            updatedPlaylist.modifiedDate = syncedPlaylist.modifiedDate
            try await databaseService.updatePlaylist(updatedPlaylist)
            print("📋 Updated existing playlist: \(syncedPlaylist.name) (\(trackStableIDs.count) tracks)")
        } else {
            // Create new playlist
            let playlist = Playlist(
                name: syncedPlaylist.name,
                trackStableIDs: trackStableIDs,
                createdDate: syncedPlaylist.createdDate,
                modifiedDate: syncedPlaylist.modifiedDate
            )
            try await databaseService.savePlaylist(playlist)
            print("📋 Imported new playlist: \(syncedPlaylist.name) (\(trackStableIDs.count) tracks)")
        }
    }
    
    // MARK: - Playlist Sync Export
    func exportPlaylistsForSync() async {
        print("📋 Starting playlist export for sync...")
        
        guard let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
            print("❌ Could not get documents directory")
            return
        }
        
        let playlistsURL = documentsURL.appendingPathComponent("Playlists")
        
        // Ensure Playlists directory exists
        try? FileManager.default.createDirectory(at: playlistsURL, withIntermediateDirectories: true)
        
        // Export each playlist as JSON
        for playlist in playlists {
            do {
                try await exportPlaylistToJSON(playlist, to: playlistsURL)
            } catch {
                print("❌ Failed to export playlist \(playlist.name): \(error)")
            }
        }
        
        print("✅ Playlist export complete: \(playlists.count) playlists exported")
        
        // Also export play counts
        await exportPlayCountsForSync()
    }
    
    // MARK: - Track Metadata Sync Export (Play Counts, Favorites, Ratings)
    func exportPlayCountsForSync() async {
        print("📊 Starting track metadata export for sync...")
        
        guard let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
            print("❌ Could not get documents directory")
            return
        }
        
        let syncDataURL = documentsURL.appendingPathComponent("SyncData")
        
        // Ensure SyncData directory exists
        try? FileManager.default.createDirectory(at: syncDataURL, withIntermediateDirectories: true)
        
        // Create metadata export (play counts, favorites, ratings)
        struct TrackMetadataEntry: Encodable {
            let fileName: String
            let playCount: Int
            let lastPlayed: TimeInterval?
            let isFavorite: Bool
            let rating: Int
        }
        
        let metadataEntries = tracks.compactMap { track -> TrackMetadataEntry? in
            // Export if track has any metadata worth syncing
            guard track.playCount > 0 || track.isFavorite || track.rating > 0 else { return nil }
            return TrackMetadataEntry(
                fileName: track.fileName,
                playCount: track.playCount,
                lastPlayed: track.lastPlayed?.timeIntervalSince1970,
                isFavorite: track.isFavorite,
                rating: track.rating
            )
        }
        
        let fileURL = syncDataURL.appendingPathComponent("play_counts.json")
        
        do {
            let encoder = JSONEncoder()
            encoder.outputFormatting = .prettyPrinted
            let data = try encoder.encode(metadataEntries)
            try data.write(to: fileURL)
            print("✅ Exported metadata: \(metadataEntries.count) tracks")
        } catch {
            print("❌ Failed to export track metadata: \(error)")
        }
    }
    
    private func exportPlaylistToJSON(_ playlist: Playlist, to directory: URL) async throws {
        // Get track filenames for this playlist
        let playlistTracks = getTracksForPlaylist(playlist)
        let trackFilenames = playlistTracks.map { $0.fileName }
        
        // Create JSON structure matching desktop format
        struct ExportedPlaylist: Encodable {
            let name: String
            let tracks: [String]
            let createdDate: TimeInterval
            let modifiedDate: TimeInterval
        }
        
        let exportedPlaylist = ExportedPlaylist(
            name: playlist.name,
            tracks: trackFilenames,
            createdDate: playlist.createdDate.timeIntervalSince1970,
            modifiedDate: playlist.modifiedDate.timeIntervalSince1970
        )
        
        let encoder = JSONEncoder()
        encoder.outputFormatting = .prettyPrinted
        
        let data = try encoder.encode(exportedPlaylist)
        
        // Create safe filename
        let safeFilename = playlist.name.replacingOccurrences(of: "[^a-zA-Z0-9]", with: "_", options: .regularExpression).lowercased()
        let fileURL = directory.appendingPathComponent("\(safeFilename).json")
        
        try data.write(to: fileURL)
        print("📋 Exported playlist: \(playlist.name) → \(fileURL.lastPathComponent)")
    }
}
