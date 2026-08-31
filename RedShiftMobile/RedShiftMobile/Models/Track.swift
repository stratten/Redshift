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
    var discNumber: Int?
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
    /// Cheap "did this on-disk file change" signal derived from file size and
    /// modification time, persisted so reconciliation can skip tag parsing for
    /// files whose fingerprint hasn't changed since the last scan/reconcile.
    var fileFingerprint: String?
    
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
        discNumber: Int? = nil,
        genre: String? = nil,
        duration: TimeInterval = 0,
        albumArtData: Data? = nil,
        playCount: Int = 0,
        lastPlayed: Date? = nil,
        isFavorite: Bool = false,
        rating: Int = 0,
        fileSize: Int64 = 0,
        addedDate: Date = Date(),
        modifiedDate: Date = Date(),
        fileFingerprint: String? = nil
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
        self.discNumber = discNumber
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
        self.fileFingerprint = fileFingerprint
    }
}

extension Track {
    /// Fast, tag-free fingerprint of an on-disk file used to detect changes
    /// without re-parsing audio metadata. Two different fingerprints always
    /// means "re-read tags"; matching fingerprints means "trust the existing
    /// database row as-is".
    static func fingerprint(fileSize: Int64, modifiedDate: Date) -> String {
        "\(fileSize)_\(Int(modifiedDate.timeIntervalSince1970))"
    }
}

// MARK: - Helper Extensions
extension Track {
    var formattedDuration: String {
        let minutes = Int(duration) / 60
        let seconds = Int(duration) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
    
    /// Stable identifier based on metadata (survives file moves/renames)
    /// Uses: title + artist + album + duration as composite key
    var stableID: String {
        let title = self.title ?? self.fileName
        let artist = self.artist ?? "Unknown"
        let album = self.album ?? "Unknown"
        let durationInt = Int(self.duration)
        return "\(title)|\(artist)|\(album)|\(durationInt)"
    }

    /// Case- and diacritic-insensitive match against every field a user could
    /// reasonably expect a search to cover: title, artist, album artist, album,
    /// genre, and filename. Used as the single shared predicate across the songs
    /// list, artist/album/genre browsers, recently played, and playlists so search
    /// behaves the same everywhere.
    func matches(_ query: String) -> Bool {
        guard !query.isEmpty else { return true }
        return displayTitle.matchesSearch(query) ||
            displayArtist.matchesSearch(query) ||
            displayAlbum.matchesSearch(query) ||
            (albumArtist?.matchesSearch(query) ?? false) ||
            (genre?.matchesSearch(query) ?? false) ||
            fileName.matchesSearch(query)
    }

    /// Deterministic ordering for album track lists and album playback queues:
    /// disc number, then track number, then title, then filename. Tracks missing
    /// disc/track metadata sort after numbered tracks instead of all colliding at
    /// the same fallback value (which previously made album order effectively
    /// random for files without embedded track numbers).
    static func albumOrder(_ lhs: Track, _ rhs: Track) -> Bool {
        let lhsDisc = lhs.discNumber ?? Int.max
        let rhsDisc = rhs.discNumber ?? Int.max
        if lhsDisc != rhsDisc { return lhsDisc < rhsDisc }

        let lhsTrack = lhs.trackNumber ?? Int.max
        let rhsTrack = rhs.trackNumber ?? Int.max
        if lhsTrack != rhsTrack { return lhsTrack < rhsTrack }

        if lhs.displayTitle != rhs.displayTitle {
            return lhs.displayTitle.localizedCaseInsensitiveCompare(rhs.displayTitle) == .orderedAscending
        }
        return lhs.fileName.localizedCaseInsensitiveCompare(rhs.fileName) == .orderedAscending
    }
}

extension String {
    /// Case- and diacritic-insensitive substring match, safe for arbitrary user
    /// search input (e.g. "café" matches "cafe" and vice versa).
    func matchesSearch(_ query: String) -> Bool {
        guard !query.isEmpty else { return true }
        let foldedSelf = self.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: nil)
        let foldedQuery = query.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: nil)
        return foldedSelf.contains(foldedQuery)
    }
}
