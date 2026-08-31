// SyncManifest.swift
// Decodes the desktop's post-sync library manifest
// (Documents/SyncData/library-manifest.json), which the desktop writes only
// after audio, playlists, and play_counts.json have all been pushed
// successfully. Its presence and revision are the authoritative signal that a
// sync fully completed and its metadata can be trusted without re-parsing
// tags on the phone.

import Foundation

struct SyncManifest: Decodable {
    let schemaVersion: Int
    let revision: String
    let generatedAt: String?
    let files: [SyncManifestFile]
}

struct SyncManifestFile: Decodable {
    let fileName: String
    let title: String?
    let artist: String?
    let album: String?
    let albumArtist: String?
    let year: Int?
    let trackNumber: Int?
    let discNumber: Int?
    let genre: String?
    let duration: Double?
    let fileSize: Int64?
    /// Desktop-side fingerprint (size + source mtime). Not compared directly
    /// against on-device files: AFC transfers do not preserve source mtime, so
    /// the phone instead matches manifest entries by fileName + fileSize (see
    /// MusicLibraryManager.reconcileLibraryIncrementally).
    let fingerprint: String?
}

enum SyncManifestReader {
    /// Reads and decodes the manifest from Documents/SyncData/library-manifest.json.
    /// Returns nil if the file is absent, unreadable, or malformed — callers
    /// must treat a nil result as "fall back to filesystem-only reconciliation
    /// and keep whatever manifest revision was previously accepted", never as
    /// "the library is empty".
    static func readFromDisk() -> SyncManifest? {
        guard let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
            return nil
        }
        let manifestURL = documentsURL
            .appendingPathComponent("SyncData")
            .appendingPathComponent("library-manifest.json")
        
        guard FileManager.default.fileExists(atPath: manifestURL.path) else {
            return nil
        }
        
        do {
            let data = try Data(contentsOf: manifestURL)
            return try JSONDecoder().decode(SyncManifest.self, from: data)
        } catch {
            print("⚠️ Failed to decode sync manifest (will fall back to filesystem-only reconciliation): \(error)")
            return nil
        }
    }
}
