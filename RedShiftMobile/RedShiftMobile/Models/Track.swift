// Track.swift
// Data model for a music track

import Foundation

struct Track: Identifiable, Codable, Hashable {
    let id: UUID
    let filePath: String
    var fileName: String
    
    // Metadata
    var title: String?
    var artist: String?
    var album: String?
    var albumArtist: String?
    var year: Int?
    var trackNumber: Int?
    var genre: String?
    var duration: TimeInterval
    var albumArtData: Data?
    
    // User data
    var playCount: Int
    var lastPlayed: Date?
    var isFavorite: Bool
    var rating: Int // 0-5
    
    // File info
    var fileSize: Int64
    var addedDate: Date
    var modifiedDate: Date
    
    var fileURL: URL {
        return URL(fileURLWithPath: filePath)
    }
    
    var displayTitle: String {
        return title ?? fileName.replacingOccurrences(of: ".mp3", with: "")
            .replacingOccurrences(of: ".m4a", with: "")
            .replacingOccurrences(of: ".flac", with: "")
    }
    
    var displayArtist: String {
        return artist ?? "Unknown Artist"
    }
    
    var displayAlbum: String {
        return album ?? "Unknown Album"
    }
    
    init(
        id: UUID = UUID(),
        filePath: String,
        fileName: String,
        title: String? = nil,
        artist: String? = nil,
        album: String? = nil,
        albumArtist: String? = nil,
        year: Int? = nil,
        trackNumber: Int? = nil,
        genre: String? = nil,
        duration: TimeInterval = 0,
        albumArtData: Data? = nil,
        playCount: Int = 0,
        lastPlayed: Date? = nil,
        isFavorite: Bool = false,
        rating: Int = 0,
        fileSize: Int64 = 0,
        addedDate: Date = Date(),
        modifiedDate: Date = Date()
    ) {
        self.id = id
        self.filePath = filePath
        self.fileName = fileName
        self.title = title
        self.artist = artist
        self.album = album
        self.albumArtist = albumArtist
        self.year = year
        self.trackNumber = trackNumber
        self.genre = genre
        self.duration = duration
        self.albumArtData = albumArtData
        self.playCount = playCount
        self.lastPlayed = lastPlayed
        self.isFavorite = isFavorite
        self.rating = rating
        self.fileSize = fileSize
        self.addedDate = addedDate
        self.modifiedDate = modifiedDate
    }
}

// MARK: - Helper Extensions
extension Track {
    var formattedDuration: String {
        let minutes = Int(duration) / 60
        let seconds = Int(duration) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
}
