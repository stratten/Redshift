// SearchPredicateTests.swift
// Verifies the shared search predicate (String.matchesSearch / Track.matches /
// AlbumGroup.matches) behaves consistently across every field, and that album
// search matches by artist even when the album's own name doesn't contain the
// query — the exact "search by artist in Album list does nothing" bug report.

import XCTest
@testable import RedShiftMobile

final class SearchPredicateTests: XCTestCase {
    func testCaseInsensitiveMatch() {
        XCTAssertTrue("The Beatles".matchesSearch("beatles"))
        XCTAssertTrue("The Beatles".matchesSearch("BEATLES"))
    }
    
    func testDiacriticInsensitiveMatch() {
        XCTAssertTrue("Café del Mar".matchesSearch("cafe"))
        XCTAssertTrue("Beyoncé".matchesSearch("beyonce"))
    }
    
    func testEmptyQueryMatchesEverything() {
        XCTAssertTrue("anything".matchesSearch(""))
    }
    
    func testNoMatchReturnsFalse() {
        XCTAssertFalse("The Beatles".matchesSearch("Zeppelin"))
    }
    
    func testTrackMatchesAcrossAllFields() {
        let track = Track(
            filePath: "/synthetic/song.mp3",
            fileName: "song.mp3",
            title: "Hey Jude",
            artist: "The Beatles",
            album: "1967-1970",
            albumArtist: "The Beatles",
            genre: "Rock"
        )
        XCTAssertTrue(track.matches("jude"))
        XCTAssertTrue(track.matches("beatles"))
        XCTAssertTrue(track.matches("1967"))
        XCTAssertTrue(track.matches("rock"))
        XCTAssertFalse(track.matches("jazz"))
    }
    
    func testTrackWithNoMetadataFallsBackToFilename() {
        // Filename-only metadata: title/artist/album all nil, so displayTitle
        // falls back to the filename and search must still find it.
        let track = Track(filePath: "/synthetic/unknown_track.mp3", fileName: "unknown_track.mp3")
        XCTAssertTrue(track.matches("unknown_track"))
    }
    
    func testAlbumGroupMatchesByArtistEvenWhenAlbumNameDoesNotContainQuery() {
        let track = Track(
            filePath: "/synthetic/song.mp3",
            fileName: "song.mp3",
            title: "Track One",
            artist: "Radiohead",
            album: "OK Computer",
            albumArtist: "Radiohead"
        )
        let group = AlbumGroup(id: "OK Computer", album: "OK Computer", albumArtist: "Radiohead", year: 1997, albumArtData: nil, tracks: [track])
        
        // The album name itself doesn't contain "radiohead", but searching by
        // artist must still surface it — this is the reported desktop/mobile
        // search parity gap.
        XCTAssertTrue(group.matches("radiohead"))
        XCTAssertTrue(group.matches("ok computer"))
        XCTAssertFalse(group.matches("pink floyd"))
    }
    
    func testArtistGroupMatchesViaConstituentTrackFields() {
        let track = Track(
            filePath: "/synthetic/song.mp3",
            fileName: "song.mp3",
            title: "Paranoid Android",
            artist: "Radiohead",
            album: "OK Computer",
            genre: "Alternative"
        )
        let group = ArtistGroup(id: "radiohead", name: "Radiohead", primaryTracks: [track], featuredTracks: [], primaryAlbumCount: 1)
        XCTAssertTrue(group.matches("paranoid"))
        XCTAssertTrue(group.matches("alternative"))
        XCTAssertFalse(group.matches("jazz"))
    }
}
