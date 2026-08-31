// LibraryIndexTests.swift
// Verifies LibraryIndex.build groups tracks correctly and stays fast even at
// synthetic 500/5,000-track library sizes (the reported "sluggish at ~500
// tracks, will it scale?" concern).

import XCTest
@testable import RedShiftMobile

final class LibraryIndexTests: XCTestCase {
    private func syntheticTracks(count: Int) -> [Track] {
        (0..<count).map { i in
            let albumNumber = i / 12 // ~12 tracks per album
            let artistNumber = albumNumber % 25 // ~25 distinct artists
            return Track(
                filePath: "/synthetic/artist\(artistNumber)/album\(albumNumber)/track\(i).mp3",
                fileName: "track\(i).mp3",
                title: "Track \(i)",
                artist: "Artist \(artistNumber)",
                album: "Album \(albumNumber)",
                albumArtist: "Artist \(artistNumber)",
                trackNumber: (i % 12) + 1,
                genre: "Genre \(artistNumber % 5)"
            )
        }
    }
    
    func testGroupsByArtistAlbumAndGenre() {
        let tracks = syntheticTracks(count: 120) // 10 albums, 10 artists
        let index = LibraryIndex.build(from: tracks)
        
        XCTAssertEqual(index.artists.count, 10)
        XCTAssertEqual(index.albums.count, 10)
        XCTAssertEqual(index.genres.count, 5)
        
        // Artists must be sorted for stable, predictable UI order.
        let names = index.artists.map { $0.name }
        XCTAssertEqual(names, names.sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending })
    }
    
    func testAlbumGroupTracksAreDeterministicallyOrdered() {
        let tracks = syntheticTracks(count: 12) // one album's worth
        let index = LibraryIndex.build(from: tracks)
        guard let album = index.albums.first else {
            return XCTFail("Expected exactly one album group")
        }
        let trackNumbers = album.tracks.compactMap { $0.trackNumber }
        XCTAssertEqual(trackNumbers, trackNumbers.sorted())
    }
    
    func testTracksMissingArtistAlbumOrGenreAreExcludedFromThatBucketOnly() {
        let tagged = Track(filePath: "/synthetic/a.mp3", fileName: "a.mp3", artist: "Known Artist", album: "Known Album", genre: "Known Genre")
        let untagged = Track(filePath: "/synthetic/b.mp3", fileName: "b.mp3")
        let index = LibraryIndex.build(from: [tagged, untagged])
        
        XCTAssertEqual(index.artists.count, 1)
        XCTAssertEqual(index.albums.count, 1)
        XCTAssertEqual(index.genres.count, 1)
    }
    
    func testDuplicateAlbumTitlesAcrossDifferentArtistsMergeIntoOneGroupByDesign() {
        // AlbumGroup is keyed by album name alone (matching the app's existing,
        // pre-existing album-detail navigation which also addresses albums by
        // name only). Two different artists releasing a same-titled album is an
        // accepted, documented edge case rather than a regression introduced by
        // this package: both artists' tracks appear together under one album
        // entry, and AlbumGroup.albumArtist reflects whichever track happened to
        // sort first. This test pins that documented behavior so a future change
        // to the grouping key is a deliberate decision, not an accidental break.
        let artistOneTrack = Track(filePath: "/synthetic/artist-one/greatest-hits/t1.mp3", fileName: "t1.mp3", title: "Song One", artist: "Artist One", album: "Greatest Hits", albumArtist: "Artist One", trackNumber: 1)
        let artistTwoTrack = Track(filePath: "/synthetic/artist-two/greatest-hits/t1.mp3", fileName: "t1.mp3", title: "Song Two", artist: "Artist Two", album: "Greatest Hits", albumArtist: "Artist Two", trackNumber: 1)
        
        let index = LibraryIndex.build(from: [artistOneTrack, artistTwoTrack])
        
        XCTAssertEqual(index.albums.count, 1)
        XCTAssertEqual(index.albums.first?.tracks.count, 2)
        XCTAssertEqual(index.artists.count, 2)
    }
    
    func testBuildCompletesQuicklyAtFiveHundredTracks() {
        let tracks = syntheticTracks(count: 500)
        measure {
            _ = LibraryIndex.build(from: tracks)
        }
    }
    
    func testBuildCompletesQuicklyAtFiveThousandTracks() {
        let tracks = syntheticTracks(count: 5000)
        let start = Date()
        let index = LibraryIndex.build(from: tracks)
        let elapsed = Date().timeIntervalSince(start)
        
        XCTAssertFalse(index.artists.isEmpty)
        // Generous ceiling: a single-pass bucket build over 5,000 in-memory
        // structs should never approach this on any supported device.
        XCTAssertLessThan(elapsed, 2.0, "LibraryIndex.build took too long for 5,000 tracks: \(elapsed)s")
    }
}
