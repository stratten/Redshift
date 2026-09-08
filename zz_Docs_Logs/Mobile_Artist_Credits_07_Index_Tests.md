# Mobile Artist Credits: Unit Tests

Modify `RedShiftMobile/RedShiftMobileTests/LibraryIndexTests.swift`. Immediately before the exact declaration `func testBuildCompletesQuicklyAtFiveHundredTracks() {`, insert:

func testParsesSupportedCreditsWithoutChangingRawMetadata() {
    let explicit = Track(filePath: "/e.mp3", fileName: "e.mp3", title: "Song", artist: "Eminem feat. Rihanna & Skylar Grey")
    XCTAssertEqual(explicit.artistCredit.primaryArtists, ["Eminem"])
    XCTAssertEqual(explicit.artistCredit.featuredArtists, ["Rihanna", "Skylar Grey"])
    XCTAssertEqual(explicit.artistCredit.allArtists, ["Eminem", "Rihanna", "Skylar Grey"])
    XCTAssertEqual(explicit.displayArtist, "Eminem feat. Rihanna & Skylar Grey")

    let coPrimary = Track(filePath: "/j.mp3", fileName: "j.mp3", artist: "Jay-Z x Kanye West ft. Rihanna")
    XCTAssertEqual(coPrimary.artistCredit.primaryArtists, ["Jay-Z", "Kanye West"])
    XCTAssertEqual(coPrimary.artistCredit.featuredArtists, ["Rihanna"])

    let unsupported = Track(filePath: "/d.mp3", fileName: "d.mp3", artist: "Drake with 21 Savage")
    XCTAssertEqual(unsupported.artistCredit.primaryArtists, ["Drake with 21 Savage"])
    XCTAssertTrue(unsupported.artistCredit.featuredArtists.isEmpty)
}

func testTitleSuffixCreatesContributorWithoutOverridingExplicitCredit() {
    let titleOnly = Track(filePath: "/a.mp3", fileName: "a.mp3", title: "Love The Way You Lie (feat. Rihanna)", artist: "Eminem")
    XCTAssertEqual(titleOnly.artistCredit.primaryArtists, ["Eminem"])
    XCTAssertEqual(titleOnly.artistCredit.featuredArtists, ["Rihanna"])
    XCTAssertTrue(titleOnly.matches("rihanna"))

    let explicit = Track(filePath: "/b.mp3", fileName: "b.mp3", title: "Song (feat. Skylar Grey)", artist: "Eminem ft. Rihanna")
    XCTAssertEqual(explicit.artistCredit.featuredArtists, ["Rihanna"])
}

func testCanonicalArtistGroupsSeparatePrimaryAndFeaturedTracks() {
    let primary = Track(filePath: "/a.mp3", fileName: "a.mp3", title: "Love The Way You Lie (feat. Rihanna)", artist: "Eminem", album: "Recovery")
    let explicitFeature = Track(filePath: "/b.mp3", fileName: "b.mp3", title: "The Monster", artist: "Eminem feat. Rihanna", album: "MMLP2")
    let index = LibraryIndex.build(from: [primary, explicitFeature])

    guard let eminem = index.artists.first(where: { $0.id == "eminem" }),
          let rihanna = index.artists.first(where: { $0.id == "rihanna" }) else {
        return XCTFail("Expected canonical Eminem and Rihanna artist groups")
    }
    XCTAssertEqual(eminem.primaryTracks.map(\.id), [primary.id, explicitFeature.id])
    XCTAssertTrue(eminem.featuredTracks.isEmpty)
    XCTAssertEqual(eminem.primaryAlbumCount, 2)
    XCTAssertTrue(rihanna.primaryTracks.isEmpty)
    XCTAssertEqual(rihanna.featuredTracks.map(\.id), [primary.id, explicitFeature.id])
    XCTAssertEqual(rihanna.featuredAlbumCount, 2)
}

These tests cover empty-feature fallback via existing tests, explicit and title-only feature credits, co-primary splitting, unsupported credit preservation, canonical search, and primary-versus-appearance navigation data. The existing 500- and 5,000-track performance tests verify the revised index remains bounded.
