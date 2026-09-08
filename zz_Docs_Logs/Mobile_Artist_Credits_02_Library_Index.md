# Mobile Artist Credits: Canonical Index

Modify `RedShiftMobile/RedShiftMobile/Services/LibraryIndex.swift`. Keep album and genre grouping unchanged. Replace the exact block from `struct ArtistGroup: Identifiable, Hashable {` through its closing brace immediately before `struct AlbumGroup` with:

struct ArtistGroup: Identifiable, Hashable {
    let id: String
    let name: String
    let primaryTracks: [Track]
    let featuredTracks: [Track]
    let primaryAlbumCount: Int

    var tracks: [Track] {
        var seen = Set<UUID>()
        return (primaryTracks + featuredTracks).filter { seen.insert($0.id).inserted }
    }

    var featuredAlbumCount: Int {
        Set(featuredTracks.compactMap(\.album)).count
    }

    static func == (lhs: ArtistGroup, rhs: ArtistGroup) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    func matches(_ query: String) -> Bool {
        guard !query.isEmpty else { return true }
        return name.matchesSearch(query) || tracks.contains { $0.matches(query) }
    }
}

Replace the complete `static func build(from tracks: [Track]) -> LibraryIndex` body, from its opening brace to its closing brace, with:

static func build(from tracks: [Track]) -> LibraryIndex {
    struct ArtistBucket {
        var name: String
        var primaryTracks: [Track] = []
        var featuredTracks: [Track] = []
    }

    var artistBuckets: [String: ArtistBucket] = [:]
    var albumBuckets: [String: [Track]] = [:]
    var genreBuckets: [String: [Track]] = [:]

    for track in tracks {
        let credit = track.artistCredit
        for artist in credit.primaryArtists {
            let key = ArtistCredit.normalizedKey(artist)
            guard !key.isEmpty else { continue }
            var bucket = artistBuckets[key] ?? ArtistBucket(name: artist)
            bucket.primaryTracks.append(track)
            artistBuckets[key] = bucket
        }
        for artist in credit.featuredArtists {
            let key = ArtistCredit.normalizedKey(artist)
            guard !key.isEmpty else { continue }
            var bucket = artistBuckets[key] ?? ArtistBucket(name: artist)
            bucket.featuredTracks.append(track)
            artistBuckets[key] = bucket
        }
        if let album = track.album, !album.isEmpty {
            albumBuckets[album, default: []].append(track)
        }
        if let genre = track.genre, !genre.isEmpty {
            genreBuckets[genre, default: []].append(track)
        }
    }

    let artists = artistBuckets.map { key, bucket in
        ArtistGroup(
            id: key,
            name: bucket.name,
            primaryTracks: bucket.primaryTracks,
            featuredTracks: bucket.featuredTracks,
            primaryAlbumCount: Set(bucket.primaryTracks.compactMap(\.album)).count
        )
    }.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }

    let albums = albumBuckets.map { name, albumTracks -> AlbumGroup in
        let orderedTracks = albumTracks.sorted(by: Track.albumOrder)
        let representative = orderedTracks.first
        return AlbumGroup(
            id: name,
            album: name,
            albumArtist: representative?.albumArtist ?? representative?.artist ?? "Unknown Artist",
            year: representative?.year,
            albumArtData: albumTracks.first(where: { $0.albumArtData != nil })?.albumArtData,
            tracks: orderedTracks
        )
    }.sorted { $0.album.localizedCaseInsensitiveCompare($1.album) == .orderedAscending }

    let genres = genreBuckets.map { name, genreTracks in
        GenreGroup(id: name, genre: name, tracks: genreTracks)
    }.sorted { $0.genre.localizedCaseInsensitiveCompare($1.genre) == .orderedAscending }

    return LibraryIndex(artists: artists, albums: albums, genres: genres)
}

The canonical-key map is derived on every `tracks` update by `MusicLibraryManager`; no database migration, sync-manifest change, or cache rebuild beyond the existing `libraryIndex = LibraryIndex.build(from: tracks)` assignment is needed.
