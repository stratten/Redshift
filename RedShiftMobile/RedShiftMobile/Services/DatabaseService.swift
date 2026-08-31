// DatabaseService.swift
// SQLite database management for tracks and playlists

import Foundation
import SQLite3

actor DatabaseService {
    private var db: OpaquePointer?
    private let dbPath: String
    
    init() {
        // Setup database in Documents/Database
        let documentsPath = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let databaseDir = documentsPath.appendingPathComponent("Database")
        
        // Ensure directory exists
        try? FileManager.default.createDirectory(at: databaseDir, withIntermediateDirectories: true)
        
        self.dbPath = databaseDir.appendingPathComponent("library.db").path
        
        // Initialize database synchronously
        if sqlite3_open(dbPath, &db) != SQLITE_OK {
            print("❌ Failed to open database")
        } else {
            print("✅ Database opened: \(dbPath)")
        }
        
        self.createTablesSync()
        self.migrateSchemaIfNeeded()
    }
    
    private func createTablesSync() {
        // disc_number is appended last (after modified_date) rather than inline
        // next to track_number, so its column index is identical whether a
        // database was created fresh with this column or migrated into it via
        // ALTER TABLE (which always appends). parseTrackRow relies on that fixed
        // positional index.
        let tracksTable = """
        CREATE TABLE IF NOT EXISTS tracks (
            id TEXT PRIMARY KEY,
            file_path TEXT NOT NULL UNIQUE,
            file_name TEXT NOT NULL,
            title TEXT,
            artist TEXT,
            album TEXT,
            album_artist TEXT,
            year INTEGER,
            track_number INTEGER,
            genre TEXT,
            duration REAL,
            album_art BLOB,
            play_count INTEGER DEFAULT 0,
            last_played INTEGER,
            is_favorite INTEGER DEFAULT 0,
            rating INTEGER DEFAULT 0,
            file_size INTEGER,
            added_date INTEGER,
            modified_date INTEGER,
            disc_number INTEGER DEFAULT 0,
            file_fingerprint TEXT DEFAULT ''
        );
        """
        
        let playlistsTable = """
        CREATE TABLE IF NOT EXISTS playlists (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            track_ids TEXT,
            created_date INTEGER,
            modified_date INTEGER,
            is_favorite INTEGER DEFAULT 0
        );
        """
        
        // Small key/value table for sync bookkeeping (currently just the last
        // accepted desktop manifest revision). A key/value shape avoids another
        // migration if future reconciliation state needs to be tracked.
        let syncStateTable = """
        CREATE TABLE IF NOT EXISTS sync_state (
            key TEXT PRIMARY KEY,
            value TEXT
        );
        """
        
        let indexTracks = """
        CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
        CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album);
        CREATE INDEX IF NOT EXISTS idx_tracks_favorite ON tracks(is_favorite);
        CREATE INDEX IF NOT EXISTS idx_tracks_play_count ON tracks(play_count);
        """
        
        executeSQL(tracksTable)
        executeSQL(playlistsTable)
        executeSQL(syncStateTable)
        executeSQL(indexTracks)
    }
    
    /// Adds columns/tables to pre-existing databases that were created before
    /// they existed. Safe to call on every launch: it only issues ALTER TABLE
    /// when the column is actually missing, and CREATE TABLE IF NOT EXISTS for
    /// sync_state is already idempotent from createTablesSync.
    private func migrateSchemaIfNeeded() {
        if !columnExists(table: "tracks", column: "disc_number") {
            executeSQL("ALTER TABLE tracks ADD COLUMN disc_number INTEGER DEFAULT 0;")
        }
        if !columnExists(table: "tracks", column: "file_fingerprint") {
            executeSQL("ALTER TABLE tracks ADD COLUMN file_fingerprint TEXT DEFAULT '';")
        }
    }
    
    private func columnExists(table: String, column: String) -> Bool {
        var statement: OpaquePointer?
        var exists = false
        let sql = "PRAGMA table_info(\(table));"
        if sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK {
            while sqlite3_step(statement) == SQLITE_ROW {
                if let namePtr = sqlite3_column_text(statement, 1), String(cString: namePtr) == column {
                    exists = true
                    break
                }
            }
        }
        sqlite3_finalize(statement)
        return exists
    }
    
    // MARK: - Database Setup
    
    private func executeSQL(_ sql: String) {
        var errorMessage: UnsafeMutablePointer<CChar>?
        if sqlite3_exec(db, sql, nil, nil, &errorMessage) != SQLITE_OK {
            let error = String(cString: errorMessage!)
            print("❌ SQL execution failed: \(error)")
            sqlite3_free(errorMessage)
        } else {
            print("✅ SQL executed successfully")
        }
    }
    
    // MARK: - Track Operations
    func saveTracks(_ tracks: [Track]) async throws {
        for track in tracks {
            try await saveTrack(track)
        }
    }
    
    private func bind(_ statement: OpaquePointer?, _ index: Int32, _ value: String?) {
        if let value = value {
            sqlite3_bind_text(statement, index, (value as NSString).utf8String, -1, nil)
        } else {
            sqlite3_bind_null(statement, index)
        }
    }
    
    private func saveTrack(_ track: Track) async throws {
        let sql = """
        INSERT OR REPLACE INTO tracks 
        (id, file_path, file_name, title, artist, album, album_artist, year, track_number, genre, 
         duration, album_art, play_count, last_played, is_favorite, rating, file_size, added_date, modified_date, disc_number, file_fingerprint)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """
        
        var statement: OpaquePointer?
        if sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK {
            bind(statement, 1, track.id.uuidString)
            bind(statement, 2, track.filePath)
            bind(statement, 3, track.fileName)
            bind(statement, 4, track.title)
            bind(statement, 5, track.artist)
            bind(statement, 6, track.album)
            bind(statement, 7, track.albumArtist)
            sqlite3_bind_int(statement, 8, Int32(track.year ?? 0))
            sqlite3_bind_int(statement, 9, Int32(track.trackNumber ?? 0))
            bind(statement, 10, track.genre)
            sqlite3_bind_double(statement, 11, track.duration)
            
            // Bind album art BLOB
            if let albumArtData = track.albumArtData {
                albumArtData.withUnsafeBytes { bytes in
                    sqlite3_bind_blob(statement, 12, bytes.baseAddress, Int32(albumArtData.count), unsafeBitCast(-1, to: sqlite3_destructor_type.self))
                }
            } else {
                sqlite3_bind_null(statement, 12)
            }
            
            sqlite3_bind_int(statement, 13, Int32(track.playCount))
            sqlite3_bind_int64(statement, 14, track.lastPlayed != nil ? Int64(track.lastPlayed!.timeIntervalSince1970) : 0)
            sqlite3_bind_int(statement, 15, track.isFavorite ? 1 : 0)
            sqlite3_bind_int(statement, 16, Int32(track.rating))
            sqlite3_bind_int64(statement, 17, track.fileSize)
            sqlite3_bind_int64(statement, 18, Int64(track.addedDate.timeIntervalSince1970))
            sqlite3_bind_int64(statement, 19, Int64(track.modifiedDate.timeIntervalSince1970))
            sqlite3_bind_int(statement, 20, Int32(track.discNumber ?? 0))
            bind(statement, 21, track.fileFingerprint)
            
            if sqlite3_step(statement) != SQLITE_DONE {
                let error = String(cString: sqlite3_errmsg(db)!)
                print("❌ Failed to save track '\(track.fileName)': \(error)")
            } else {
                print("✅ Saved track: \(track.fileName)")
            }
        } else {
            let error = String(cString: sqlite3_errmsg(db)!)
            print("❌ Failed to prepare statement: \(error)")
        }
        sqlite3_finalize(statement)
    }
    
    /// Lightweight scan of just file_path/file_fingerprint (no title/artist/BLOB
    /// columns) so reconciliation can decide which on-disk files changed without
    /// paying the cost of hydrating full Track rows including album art.
    func loadFileFingerprints() async throws -> [String: String] {
        var result: [String: String] = [:]
        let sql = "SELECT file_path, file_fingerprint FROM tracks;"
        var statement: OpaquePointer?
        if sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK {
            while sqlite3_step(statement) == SQLITE_ROW {
                guard let pathPtr = sqlite3_column_text(statement, 0) else { continue }
                let filePath = String(cString: pathPtr)
                let fingerprint = sqlite3_column_text(statement, 1) != nil ? String(cString: sqlite3_column_text(statement, 1)) : ""
                result[filePath] = fingerprint
            }
        }
        sqlite3_finalize(statement)
        return result
    }
    
    /// Applies an incremental reconciliation pass (upserts + deletions) in a
    /// single transaction, so a crash or thrown error midway leaves the
    /// database exactly as it was before reconciliation started rather than
    /// partially applied.
    func applyReconciliation(upserts: [Track], deleteFilePaths: [String]) async throws {
        var errorMessage: UnsafeMutablePointer<CChar>?
        guard sqlite3_exec(db, "BEGIN IMMEDIATE TRANSACTION;", nil, nil, &errorMessage) == SQLITE_OK else {
            let error = errorMessage != nil ? String(cString: errorMessage!) : "unknown error"
            sqlite3_free(errorMessage)
            throw NSError(domain: "DatabaseService", code: 1, userInfo: [NSLocalizedDescriptionKey: "Failed to begin reconciliation transaction: \(error)"])
        }
        
        do {
            for track in upserts {
                try await saveTrack(track)
            }
            for filePath in deleteFilePaths {
                try await deleteTrack(byFilePath: filePath)
            }
        } catch {
            sqlite3_exec(db, "ROLLBACK;", nil, nil, nil)
            throw error
        }
        
        if sqlite3_exec(db, "COMMIT;", nil, nil, &errorMessage) != SQLITE_OK {
            let error = errorMessage != nil ? String(cString: errorMessage!) : "unknown error"
            sqlite3_free(errorMessage)
            sqlite3_exec(db, "ROLLBACK;", nil, nil, nil)
            throw NSError(domain: "DatabaseService", code: 2, userInfo: [NSLocalizedDescriptionKey: "Failed to commit reconciliation transaction: \(error)"])
        }
    }
    
    private func deleteTrack(byFilePath filePath: String) async throws {
        let sql = "DELETE FROM tracks WHERE file_path = ?;"
        var statement: OpaquePointer?
        if sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK {
            bind(statement, 1, filePath)
            sqlite3_step(statement)
        }
        sqlite3_finalize(statement)
    }
    
    // MARK: - Sync State (manifest revision bookkeeping)
    
    func getSyncStateValue(_ key: String) async throws -> String? {
        let sql = "SELECT value FROM sync_state WHERE key = ?;"
        var statement: OpaquePointer?
        var value: String?
        if sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK {
            bind(statement, 1, key)
            if sqlite3_step(statement) == SQLITE_ROW, let textPtr = sqlite3_column_text(statement, 0) {
                value = String(cString: textPtr)
            }
        }
        sqlite3_finalize(statement)
        return value
    }
    
    func setSyncStateValue(_ key: String, value: String) async throws {
        let sql = "INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?);"
        var statement: OpaquePointer?
        if sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK {
            bind(statement, 1, key)
            bind(statement, 2, value)
            sqlite3_step(statement)
        }
        sqlite3_finalize(statement)
    }
    
    func loadTracks() async throws -> [Track] {
        var tracks: [Track] = []
        let sql = "SELECT * FROM tracks ORDER BY artist, album, track_number;"
        
        var statement: OpaquePointer?
        if sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK {
            while sqlite3_step(statement) == SQLITE_ROW {
                if let track = parseTrackRow(statement) {
                    tracks.append(track)
                }
            }
        }
        sqlite3_finalize(statement)
        
        return tracks
    }
    
    func updateTrack(_ track: Track) async throws {
        try await saveTrack(track) // UPSERT handles update
    }
    
    func deleteTrack(_ track: Track) async throws {
        let sql = "DELETE FROM tracks WHERE id = ?;"
        var statement: OpaquePointer?
        if sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK {
            bind(statement, 1, track.id.uuidString)
            if sqlite3_step(statement) != SQLITE_DONE {
                let error = String(cString: sqlite3_errmsg(db)!)
                print("❌ Failed to delete track '\(track.fileName)': \(error)")
            } else {
                print("🗑️ Deleted track: \(track.fileName)")
            }
        }
        sqlite3_finalize(statement)
    }
    
    func clearAllTracks() async throws {
        let sql = "DELETE FROM tracks;"
        var errorMessage: UnsafeMutablePointer<CChar>?
        if sqlite3_exec(db, sql, nil, nil, &errorMessage) != SQLITE_OK {
            let error = String(cString: errorMessage!)
            print("❌ Failed to clear tracks: \(error)")
            sqlite3_free(errorMessage)
        } else {
            print("🧹 Cleared all tracks from database")
        }
    }
    
    private func parseTrackRow(_ statement: OpaquePointer?) -> Track? {
        guard let statement = statement else { return nil }
        
        let idString = String(cString: sqlite3_column_text(statement, 0))
        guard let id = UUID(uuidString: idString) else { return nil }
        
        let filePath = String(cString: sqlite3_column_text(statement, 1))
        let fileName = String(cString: sqlite3_column_text(statement, 2))
        let title = sqlite3_column_text(statement, 3) != nil ? String(cString: sqlite3_column_text(statement, 3)) : nil
        let artist = sqlite3_column_text(statement, 4) != nil ? String(cString: sqlite3_column_text(statement, 4)) : nil
        let album = sqlite3_column_text(statement, 5) != nil ? String(cString: sqlite3_column_text(statement, 5)) : nil
        let albumArtist = sqlite3_column_text(statement, 6) != nil ? String(cString: sqlite3_column_text(statement, 6)) : nil
        let year = Int(sqlite3_column_int(statement, 7))
        let trackNumber = Int(sqlite3_column_int(statement, 8))
        let genre = sqlite3_column_text(statement, 9) != nil ? String(cString: sqlite3_column_text(statement, 9)) : nil
        let duration = sqlite3_column_double(statement, 10)
        
        // Read album art BLOB
        var albumArtData: Data?
        if let blob = sqlite3_column_blob(statement, 11) {
            let blobSize = sqlite3_column_bytes(statement, 11)
            if blobSize > 0 {
                albumArtData = Data(bytes: blob, count: Int(blobSize))
            }
        }
        
        let playCount = Int(sqlite3_column_int(statement, 12))
        let lastPlayedTimestamp = sqlite3_column_int64(statement, 13)
        let lastPlayed = lastPlayedTimestamp > 0 ? Date(timeIntervalSince1970: TimeInterval(lastPlayedTimestamp)) : nil
        let isFavorite = sqlite3_column_int(statement, 14) == 1
        let rating = Int(sqlite3_column_int(statement, 15))
        let fileSize = sqlite3_column_int64(statement, 16)
        let addedDate = Date(timeIntervalSince1970: TimeInterval(sqlite3_column_int64(statement, 17)))
        let modifiedDate = Date(timeIntervalSince1970: TimeInterval(sqlite3_column_int64(statement, 18)))
        // Column 19 (disc_number) may not exist on databases created before this
        // migration ran within the current process; sqlite3_column_int returns 0
        // for out-of-range indices, which maps to "no disc number" below anyway.
        let discNumber = Int(sqlite3_column_int(statement, 19))
        let fileFingerprint = sqlite3_column_text(statement, 20) != nil ? String(cString: sqlite3_column_text(statement, 20)) : nil
        
        return Track(
            id: id,
            filePath: filePath,
            fileName: fileName,
            title: title,
            artist: artist,
            album: album,
            albumArtist: albumArtist,
            year: year > 0 ? year : nil,
            trackNumber: trackNumber > 0 ? trackNumber : nil,
            discNumber: discNumber > 0 ? discNumber : nil,
            genre: genre,
            duration: duration,
            albumArtData: albumArtData,
            playCount: playCount,
            lastPlayed: lastPlayed,
            isFavorite: isFavorite,
            rating: rating,
            fileSize: fileSize,
            addedDate: addedDate,
            modifiedDate: modifiedDate,
            fileFingerprint: (fileFingerprint?.isEmpty ?? true) ? nil : fileFingerprint
        )
    }
    
    // MARK: - Playlist Operations
    func loadPlaylists() async throws -> [Playlist] {
        print("💾 DatabaseService.loadPlaylists: Starting to load playlists...")
        var playlists: [Playlist] = []
        let sql = "SELECT * FROM playlists ORDER BY name;"
        
        var statement: OpaquePointer?
        if sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK {
            print("💾 SQL query prepared successfully")
            while sqlite3_step(statement) == SQLITE_ROW {
                if let playlist = parsePlaylistRow(statement) {
                    print("💾 Loaded playlist: \(playlist.name) with \(playlist.trackStableIDs.count) tracks")
                    playlists.append(playlist)
                }
            }
        } else {
            let error = String(cString: sqlite3_errmsg(db)!)
            print("❌ Failed to prepare playlist load statement: \(error)")
        }
        sqlite3_finalize(statement)
        
        print("💾 DatabaseService.loadPlaylists: Returning \(playlists.count) playlists")
        return playlists
    }
    
    func savePlaylist(_ playlist: Playlist) async throws {
        print("💾 DatabaseService.savePlaylist: \(playlist.name) (id: \(playlist.id))")
        let trackStableIDsJSON = try JSONEncoder().encode(playlist.trackStableIDs)
        let trackStableIDsString = String(data: trackStableIDsJSON, encoding: .utf8) ?? "[]"
        print("💾 Track Stable IDs JSON: \(trackStableIDsString)")
        
        let sql = """
        INSERT OR REPLACE INTO playlists (id, name, track_ids, created_date, modified_date, is_favorite)
        VALUES (?, ?, ?, ?, ?, ?);
        """
        
        var statement: OpaquePointer?
        if sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK {
            let SQLITE_TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
            sqlite3_bind_text(statement, 1, (playlist.id.uuidString as NSString).utf8String, -1, SQLITE_TRANSIENT)
            sqlite3_bind_text(statement, 2, (playlist.name as NSString).utf8String, -1, SQLITE_TRANSIENT)
            sqlite3_bind_text(statement, 3, (trackStableIDsString as NSString).utf8String, -1, SQLITE_TRANSIENT)
            sqlite3_bind_int64(statement, 4, Int64(playlist.createdDate.timeIntervalSince1970))
            sqlite3_bind_int64(statement, 5, Int64(playlist.modifiedDate.timeIntervalSince1970))
            sqlite3_bind_int(statement, 6, playlist.isFavorite ? 1 : 0)
            
            if sqlite3_step(statement) != SQLITE_DONE {
                let error = String(cString: sqlite3_errmsg(db)!)
                print("❌ Failed to save playlist: \(error)")
            } else {
                print("✅ Playlist saved to database successfully")
            }
        } else {
            let error = String(cString: sqlite3_errmsg(db)!)
            print("❌ Failed to prepare playlist save statement: \(error)")
        }
        sqlite3_finalize(statement)
    }
    
    func updatePlaylist(_ playlist: Playlist) async throws {
        try await savePlaylist(playlist) // UPSERT handles update
    }
    
    func deletePlaylist(_ playlistID: UUID) async throws {
        let sql = "DELETE FROM playlists WHERE id = ?;"
        
        var statement: OpaquePointer?
        if sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK {
            sqlite3_bind_text(statement, 1, playlistID.uuidString, -1, nil)
            sqlite3_step(statement)
        }
        sqlite3_finalize(statement)
    }
    
    private func parsePlaylistRow(_ statement: OpaquePointer?) -> Playlist? {
        guard let statement = statement else { return nil }
        
        let idString = String(cString: sqlite3_column_text(statement, 0))
        guard let id = UUID(uuidString: idString) else { return nil }
        
        let name = String(cString: sqlite3_column_text(statement, 1))
        let trackStableIDsString = String(cString: sqlite3_column_text(statement, 2))
        let createdDate = Date(timeIntervalSince1970: TimeInterval(sqlite3_column_int64(statement, 3)))
        let modifiedDate = Date(timeIntervalSince1970: TimeInterval(sqlite3_column_int64(statement, 4)))
        let isFavorite = sqlite3_column_int(statement, 5) == 1
        
        let trackStableIDs = (try? JSONDecoder().decode([String].self, from: trackStableIDsString.data(using: .utf8) ?? Data())) ?? []
        
        return Playlist(
            id: id,
            name: name,
            trackStableIDs: trackStableIDs,
            createdDate: createdDate,
            modifiedDate: modifiedDate,
            isFavorite: isFavorite
        )
    }
    
    // MARK: - Cleanup
    deinit {
        sqlite3_close(db)
    }
}

// MARK: - Helper Extension
extension OpaquePointer {
    func getString(_ index: Int32) -> String? {
        guard let cString = sqlite3_column_text(self, index) else { return nil }
        return String(cString: cString)
    }
}
