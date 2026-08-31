// SyncManifestTests.swift
// Verifies the desktop manifest JSON decodes correctly, and that a malformed
// or incomplete manifest fails to decode rather than crashing or silently
// producing garbage data — required by the settled "retain the prior
// snapshot and report a recoverable sync status on malformed manifest"
// decision. SyncManifestReader.readFromDisk() itself is not exercised here
// because it depends on the app's real Documents directory; this suite
// covers the pure decode contract it relies on internally.

import XCTest
@testable import RedShiftMobile

final class SyncManifestTests: XCTestCase {
    func testDecodesWellFormedManifest() throws {
        let json = """
        {
          "schemaVersion": 1,
          "revision": "1234567890",
          "generatedAt": "2026-01-01T00:00:00.000Z",
          "files": [
            {
              "fileName": "song.mp3",
              "title": "Hey Jude",
              "artist": "The Beatles",
              "album": "1967-1970",
              "albumArtist": "The Beatles",
              "year": 1970,
              "trackNumber": 3,
              "discNumber": 1,
              "genre": "Rock",
              "duration": 245.5,
              "fileSize": 5242880,
              "fingerprint": "5242880-1700000000000"
            }
          ]
        }
        """
        let manifest = try JSONDecoder().decode(SyncManifest.self, from: Data(json.utf8))
        XCTAssertEqual(manifest.schemaVersion, 1)
        XCTAssertEqual(manifest.revision, "1234567890")
        XCTAssertEqual(manifest.files.count, 1)
        XCTAssertEqual(manifest.files.first?.fileName, "song.mp3")
        XCTAssertEqual(manifest.files.first?.discNumber, 1)
    }
    
    func testDecodesManifestWithNullOptionalFields() throws {
        // A file with only the fields the desktop can always populate
        // (fileName/duration/fileSize) and every optional tag field null —
        // simulates a file with no usable ID3 tags at all.
        let json = """
        {
          "schemaVersion": 1,
          "revision": "1",
          "generatedAt": null,
          "files": [
            {
              "fileName": "untagged.mp3",
              "title": null,
              "artist": null,
              "album": null,
              "albumArtist": null,
              "year": null,
              "trackNumber": null,
              "discNumber": null,
              "genre": null,
              "duration": 0,
              "fileSize": 1024,
              "fingerprint": "1024-0"
            }
          ]
        }
        """
        let manifest = try JSONDecoder().decode(SyncManifest.self, from: Data(json.utf8))
        XCTAssertEqual(manifest.files.first?.fileName, "untagged.mp3")
        XCTAssertNil(manifest.files.first?.title)
    }
    
    func testMalformedManifestFailsToDecodeRatherThanProducingGarbageData() {
        let malformed = Data("{ this is not valid JSON".utf8)
        XCTAssertThrowsError(try JSONDecoder().decode(SyncManifest.self, from: malformed))
    }
    
    func testManifestMissingRequiredFieldFailsToDecode() {
        // Missing "revision", which reconciliation depends on to record
        // acceptance — must fail decode, not silently default to "".
        let json = """
        { "schemaVersion": 1, "files": [] }
        """
        XCTAssertThrowsError(try JSONDecoder().decode(SyncManifest.self, from: Data(json.utf8)))
    }
}
