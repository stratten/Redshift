// Playlist.swift
// Data model for a playlist

import Foundation

struct Playlist: Identifiable, Codable, Hashable {
    let id: UUID
    var name: String
    var trackIDs: [UUID] // References to Track IDs
    var createdDate: Date
    var modifiedDate: Date
    var isFavorite: Bool
    
    init(
        id: UUID = UUID(),
        name: String,
        trackIDs: [UUID] = [],
        createdDate: Date = Date(),
        modifiedDate: Date = Date(),
        isFavorite: Bool = false
    ) {
        self.id = id
        self.name = name
        self.trackIDs = trackIDs
        self.createdDate = createdDate
        self.modifiedDate = modifiedDate
        self.isFavorite = isFavorite
    }
    
    var trackCount: Int {
        return trackIDs.count
    }
}
