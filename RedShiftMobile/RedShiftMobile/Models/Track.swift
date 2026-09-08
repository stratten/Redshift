// Track.swift
// Data model for a music track

import Foundation

struct ArtistCredit: Hashable {
    let rawArtist: String
    let primaryArtists: [String]
    let featuredArtists: [String]
    let allArtists: [String]

    private static let featureMarker = try! NSRegularExpression(pattern: #"(?i)\s+(?:feat(?:\.|uring)?|ft\.?)\s+"#)
    private static let primarySeparator = try! NSRegularExpression(pattern: #"(?i)\s*(?:,|&)\s*|\s+\bx\b\s+"#)
    private static let featuredSeparator = try! NSRegularExpression(pattern: #"(?i)\s*(?:,|&)\s*|\s+\band\b\s+"#)
    private static let titleFeatureCredit = try! NSRegularExpression(pattern: #"(?i)\s*\(\s*(?:feat(?:\.|uring)?|ft\.?)\s+(.+?)\s*\)\s*$"#)

    static func parse(rawArtist: String?, title: String?) -> ArtistCredit {
        let raw = rawArtist?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !raw.isEmpty, normalizedKey(raw) != normalizedKey("Unknown Artist") else {
            return ArtistCredit(rawArtist: raw.isEmpty ? "Unknown Artist" : raw, primaryArtists: ["Unknown Artist"], featuredArtists: [], allArtists: ["Unknown Artist"])
        }

        let rawRange = NSRange(raw.startIndex..<raw.endIndex, in: raw)
        let marker = featureMarker.firstMatch(in: raw, range: rawRange)
        let primaryRaw = marker.map { (raw as NSString).substring(to: $0.range.location) } ?? raw
        let featuredRaw = marker.map { (raw as NSString).substring(from: NSMaxRange($0.range)) } ?? ""
        let primaryArtists = uniqueNames(split(primaryRaw, using: primarySeparator))
        var featuredArtists = uniqueNames(split(featuredRaw, using: featuredSeparator))

        if featuredArtists.isEmpty, let title, let match = titleFeatureCredit.firstMatch(in: title, range: NSRange(title.startIndex..<title.endIndex, in: title)), match.numberOfRanges > 1 {
            featuredArtists = uniqueNames(split((title as NSString).substring(with: match.range(at: 1)), using: featuredSeparator))
        }

        let safePrimaryArtists = primaryArtists.isEmpty ? [raw] : primaryArtists
        return ArtistCredit(rawArtist: raw, primaryArtists: safePrimaryArtists, featuredArtists: featuredArtists, allArtists: uniqueNames(safePrimaryArtists + featuredArtists))
    }

    static func normalizedKey(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private static func split(_ value: String, using separator: NSRegularExpression) -> [String] {
        let range = NSRange(value.startIndex..<value.endIndex, in: value)
        let separated = separator.stringByReplacingMatches(in: value, range: range, withTemplate: "\u{1F}")
        return separated.components(separatedBy: "\u{1F}").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
    }

    private static func uniqueNames(_ names: [String]) -> [String] {
        var keys = Set<String>()
        return names.compactMap { name in
            let key = normalizedKey(name)
            return !key.isEmpty && keys.insert(key).inserted ? name : nil
        }
    }
}

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
    var artistCredit: ArtistCredit {
        ArtistCredit.parse(rawArtist: artist, title: title)
    }

    var primaryArtistName: String {
        artistCredit.primaryArtists.first ?? "Unknown Artist"
    }

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
            artistCredit.allArtists.contains { $0.matchesSearch(query) } ||
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
