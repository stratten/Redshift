// LibraryIndex.swift
// Immutable, one-pass snapshot of artist/album/genre groupings over the current
// track list. Rebuilt exactly once whenever MusicLibraryManager.tracks changes so
// list/detail views consume ready-made groups instead of re-filtering the full
// track array for every row on every render.

import Foundation

struct ArtistGroup: Identifiable, Hashable {
    let id: String
    let name: String
    let tracks: [Track]
    let albumCount: Int

    static func == (lhs: ArtistGroup, rhs: ArtistGroup) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    /// An artist group is a search match when its own name matches, or when any
    /// of its tracks match (covers title/album/genre/filename searches that land
    /// on this artist).
    func matches(_ query: String) -> Bool {
        guard !query.isEmpty else { return true }
        if name.matchesSearch(query) { return true }
        return tracks.contains { $0.matches(query) }
    }
}

struct AlbumGroup: Identifiable, Hashable {
    let id: String
    let album: String
    let albumArtist: String
    let year: Int?
    let albumArtData: Data?
    /// Pre-sorted via `Track.albumOrder` at index-build time so every consumer
    /// (list art, detail track list, "Play Album") sees the same deterministic
    /// order without re-sorting per view.
    let tracks: [Track]

    static func == (lhs: AlbumGroup, rhs: AlbumGroup) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    /// An album group is a search match when its album name or album artist
    /// matches, or when any constituent track matches — so searching by artist
    /// (even one not present in the album's own display name) surfaces the album,
    /// matching the desktop app's album search behavior.
    func matches(_ query: String) -> Bool {
        guard !query.isEmpty else { return true }
        if album.matchesSearch(query) || albumArtist.matchesSearch(query) { return true }
        return tracks.contains { $0.matches(query) }
    }
}

struct GenreGroup: Identifiable, Hashable {
    let id: String
    let genre: String
    let tracks: [Track]

    static func == (lhs: GenreGroup, rhs: GenreGroup) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    func matches(_ query: String) -> Bool {
        guard !query.isEmpty else { return true }
        if genre.matchesSearch(query) { return true }
        return tracks.contains { $0.matches(query) }
    }
}

struct LibraryIndex {
    let artists: [ArtistGroup]
    let albums: [AlbumGroup]
    let genres: [GenreGroup]

    static let empty = LibraryIndex(artists: [], albums: [], genres: [])

    /// Single pass over `tracks` to bucket by artist/album/genre, then one sort
    /// per bucket collection. This replaces the previous pattern of every row
    /// view independently re-filtering the entire track array.
    static func build(from tracks: [Track]) -> LibraryIndex {
        var artistBuckets: [String: [Track]] = [:]
        var albumBuckets: [String: [Track]] = [:]
        var genreBuckets: [String: [Track]] = [:]

        for track in tracks {
            if let artist = track.artist, !artist.isEmpty {
                artistBuckets[artist, default: []].append(track)
            }
            if let album = track.album, !album.isEmpty {
                albumBuckets[album, default: []].append(track)
            }
            if let genre = track.genre, !genre.isEmpty {
                genreBuckets[genre, default: []].append(track)
            }
        }

        let artists = artistBuckets.map { name, artistTracks in
            ArtistGroup(
                id: name,
                name: name,
                tracks: artistTracks,
                albumCount: Set(artistTracks.compactMap { $0.album }).count
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
}
