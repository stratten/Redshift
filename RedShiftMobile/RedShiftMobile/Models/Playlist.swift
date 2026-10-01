// Playlist.swift
// Data model for a playlist
//
// IMPORTANT: Playlists store track STABLE IDs (metadata-based), not UUIDs.
// Stable IDs are computed from: title + artist + album + duration
// This ensures playlists survive:
// - Library rescans (UUIDs regenerate)
// - File moves/renames (paths change)
// - File reorganization (directory structure changes)

import Foundation

struct Playlist: Identifiable, Codable, Hashable {
    let id: UUID
    var name: String
    var trackStableIDs: [String] // Metadata-based stable identifiers
    var createdDate: Date
    var modifiedDate: Date
    var isFavorite: Bool
    
    init(
        id: UUID = UUID(),
        name: String,
        trackStableIDs: [String] = [],
        createdDate: Date = Date(),
        modifiedDate: Date = Date(),
        isFavorite: Bool = false
    ) {
        self.id = id
        self.name = name
        self.trackStableIDs = trackStableIDs
        self.createdDate = createdDate
        self.modifiedDate = modifiedDate
        self.isFavorite = isFavorite
    }
    
    var trackCount: Int {
        return trackStableIDs.count
    }
    
    // Helper method to resolve stable IDs to Track objects
    func getTracks(from library: [Track]) -> [Track] {
        return trackStableIDs.compactMap { stableID in
            library.first(where: { $0.stableID == stableID })
        }
    }

    static func nextModifiedDate(after previous: Date, now: Date = Date()) -> Date {
        let nowSeconds = now.timeIntervalSince1970.rounded(.down)
        let previousSeconds = previous.timeIntervalSince1970.rounded(.down)
        return Date(timeIntervalSince1970: max(nowSeconds, previousSeconds + 1))
    }
}

enum PlaylistSyncImportPolicy {
    enum Decision: Equatable {
        case create
        case replace
        case keepLocal
        case unchanged
    }

    static func decide(local: Playlist?, incomingTrackStableIDs: [String], incomingModified: Date) -> Decision {
        guard let local = local else { return .create }
        if local.trackStableIDs == incomingTrackStableIDs { return .unchanged }
        let incomingSeconds = incomingModified.timeIntervalSince1970.rounded(.down)
        let localSeconds = local.modifiedDate.timeIntervalSince1970.rounded(.down)
        return incomingSeconds >= localSeconds ? .replace : .keepLocal
    }
}
