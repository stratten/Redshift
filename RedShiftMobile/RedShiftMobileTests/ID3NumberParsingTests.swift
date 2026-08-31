// ID3NumberParsingTests.swift
// Verifies ID3TagReader.leadingInt correctly parses the "N" and "N/TOTAL"
// track/disc number formats ID3 tags commonly use. The root cause of the
// reported "album order is random" bug was that this parsing didn't exist at
// all, so trackNumber/discNumber were always nil.

import XCTest
@testable import RedShiftMobile

final class ID3NumberParsingTests: XCTestCase {
    func testParsesPlainNumber() {
        XCTAssertEqual(ID3TagReader.leadingInt(from: "3"), 3)
    }
    
    func testParsesNumberOverTotalFormat() {
        XCTAssertEqual(ID3TagReader.leadingInt(from: "3/12"), 3)
    }
    
    func testParsesZeroPaddedNumber() {
        XCTAssertEqual(ID3TagReader.leadingInt(from: "03/12"), 3)
    }
    
    func testReturnsNilForNilInput() {
        XCTAssertNil(ID3TagReader.leadingInt(from: nil))
    }
    
    func testReturnsNilForNonNumericInput() {
        XCTAssertNil(ID3TagReader.leadingInt(from: "unknown"))
    }
    
    func testReturnsNilForEmptyString() {
        XCTAssertNil(ID3TagReader.leadingInt(from: ""))
    }
}
