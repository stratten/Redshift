# Mobile Artist Credits: Parser and Track Contract

Modify `RedShiftMobile/RedShiftMobile/Models/Track.swift`. Raw `title` and `artist` remain durable, synced metadata; derived credits are in-memory only. The two anchors below are unique.

Replace `import Foundation` with:

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
        var namesByKey: [String: String] = [:]
        for name in names {
            let key = normalizedKey(name)
            if !key.isEmpty, namesByKey[key] == nil {
                namesByKey[key] = name
            }
        }
        return names.compactMap { namesByKey[normalizedKey($0)] }.removingDuplicates()
    }
}

private extension Array where Element: Hashable {
    func removingDuplicates() -> [Element] {
        var seen = Set<Element>()
        return filter { seen.insert($0).inserted }
    }
}

Replace the complete `extension Track` beginning with `// MARK: - Helper Extensions` and ending immediately before `extension String` with:

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

    var stableID: String {
        let title = self.title ?? self.fileName
        let artist = self.artist ?? "Unknown"
        let album = self.album ?? "Unknown"
        let durationInt = Int(self.duration)
        return "\(title)|\(artist)|\(album)|\(durationInt)"
    }

    func matches(_ query: String) -> Bool {
        guard !query.isEmpty else { return true }
        return displayTitle.matchesSearch(query) ||
            artistCredit.allArtists.contains { $0.matchesSearch(query) } ||
            displayAlbum.matchesSearch(query) ||
            (albumArtist?.matchesSearch(query) ?? false) ||
            (genre?.matchesSearch(query) ?? false) ||
            fileName.matchesSearch(query)
    }

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
