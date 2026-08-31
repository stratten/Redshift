// TrackOrderingTests.swift
// Verifies Track.albumOrder produces a deterministic album track order even
// when disc/track metadata is partially or entirely missing — the exact bug
// reported as "album order is random on mobile".

import XCTest
@testable import RedShiftMobile

final class TrackOrderingTests: XCTestCase {
    private func track(title: String, fileName: String, track: Int?, disc: Int? = nil) -> Track {
        Track(filePath: "/synthetic/\(fileName)", fileName: fileName, title: title, trackNumber: track, discNumber: disc)
    }
    
    func testOrdersByTrackNumberWithinSingleDisc() {
        let t3 = track(title: "Third", fileName: "03.mp3", track: 3)
        let t1 = track(title: "First", fileName: "01.mp3", track: 1)
        let t2 = track(title: "Second", fileName: "02.mp3", track: 2)
        let ordered = [t3, t1, t2].sorted(by: Track.albumOrder)
        XCTAssertEqual(ordered.map { $0.title }, ["First", "Second", "Third"])
    }
    
    func testOrdersByDiscThenTrackForMultiDiscSets() {
        let disc2Track1 = track(title: "D2T1", fileName: "d2t1.mp3", track: 1, disc: 2)
        let disc1Track2 = track(title: "D1T2", fileName: "d1t2.mp3", track: 2, disc: 1)
        let disc1Track1 = track(title: "D1T1", fileName: "d1t1.mp3", track: 1, disc: 1)
        let ordered = [disc2Track1, disc1Track2, disc1Track1].sorted(by: Track.albumOrder)
        XCTAssertEqual(ordered.map { $0.title }, ["D1T1", "D1T2", "D2T1"])
    }
    
    func testUnnumberedTracksSortAfterNumberedTracksDeterministically() {
        let numbered = track(title: "Numbered", fileName: "01.mp3", track: 1)
        let unnumberedB = track(title: "Bravo", fileName: "b.mp3", track: nil)
        let unnumberedA = track(title: "Alpha", fileName: "a.mp3", track: nil)
        
        let ordered = [unnumberedB, numbered, unnumberedA].sorted(by: Track.albumOrder)
        // Numbered track always comes first...
        XCTAssertEqual(ordered.first?.title, "Numbered")
        // ...and unnumbered tracks are deterministically ordered by title, not
        // left in arbitrary array order (the reported "random order" bug).
        XCTAssertEqual(ordered.map { $0.title }, ["Numbered", "Alpha", "Bravo"])
    }
    
    func testRepeatedSortsProduceIdenticalOrderRegardlessOfInputOrder() {
        let a = track(title: "Alpha", fileName: "a.mp3", track: nil)
        let b = track(title: "Bravo", fileName: "b.mp3", track: nil)
        let c = track(title: "Charlie", fileName: "c.mp3", track: nil)
        
        let orderedOnce = [c, a, b].sorted(by: Track.albumOrder).map { $0.title }
        let orderedAgain = [b, c, a].sorted(by: Track.albumOrder).map { $0.title }
        XCTAssertEqual(orderedOnce, orderedAgain)
        XCTAssertEqual(orderedOnce, ["Alpha", "Bravo", "Charlie"])
    }
    
    func testFilenameBreaksTiesWhenTitlesAreIdentical() {
        let one = track(title: "Same Title", fileName: "b.mp3", track: nil)
        let two = track(title: "Same Title", fileName: "a.mp3", track: nil)
        let ordered = [one, two].sorted(by: Track.albumOrder)
        XCTAssertEqual(ordered.map { $0.fileName }, ["a.mp3", "b.mp3"])
    }
}
