// ID3TagReader.swift
// Lightweight ID3v2 reader for common text frames (TALB/TIT2/TPE1/TPE2/TCON/TYER/TDRC/COMM)

import Foundation

struct ID3Tag {
    let title: String?
    let artist: String?
    let album: String?
    let albumArtist: String?
    let genre: String?
    let year: String?
    let comment: String?
}

final class ID3TagReader {
    private struct Header {
        let versionMajor: UInt8
        let versionMinor: UInt8
        let flags: UInt8
        let tagSize: Int
    }

    static func read(from fileURL: URL) -> ID3Tag? {
        guard let data = try? Data(contentsOf: fileURL, options: .mappedIfSafe) else { return nil }
        guard let header = parseHeader(data: data) else { return nil }

        // Slice raw tag bytes (after 10-byte header)
        let rawStart = 10
        let rawEnd = min(rawStart + header.tagSize, data.count)
        guard rawStart < rawEnd else { return nil }
        var tag = Data(data[rawStart..<rawEnd])

        // Remove unsynchronization if set at tag-level (common in v2.3/v2.4)
        if (header.flags & 0x80) != 0 { // bit 7
            tag = removeUnsynchronization(tag)
        }

        var offset = 0
        let end = tag.count

        // Extended header
        if (header.flags & 0x40) != 0 { // bit 6
            if offset + 4 <= end {
                let sizeBytes = tag[offset..<(offset + 4)]
                let extSize = header.versionMajor >= 4 ? decodeSyncSafe32(sizeBytes) : decodeUInt32(sizeBytes)
                offset += 4 + Int(extSize)
            }
        }

        var title: String?
        var artist: String?
        var album: String?
        var albumArtist: String?
        var genre: String?
        var year: String?
        var comment: String?

        if header.versionMajor == 2 {
            // ID3v2.2: frames have 3-byte IDs and 3-byte sizes, no flags
            while offset + 6 <= end, offset < end {
                let idData = tag[offset..<(offset + 3)]
                guard let frameId = String(data: idData, encoding: .isoLatin1), frameId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false else { break }
                offset += 3

                let sizeBytes = tag[offset..<(offset + 3)]
                offset += 3
                let frameSize = decodeUInt24(sizeBytes)
                if frameSize <= 0 { break }

                let frameEnd = min(offset + frameSize, end)
                if frameEnd <= offset { break }
                let frameData = tag[offset..<frameEnd]
                offset = frameEnd

                if frameId.first == "T" { // Text frame
                    if let text = decodeTextFrame(frameData) {
                        print("ID3 v2.2 frame \(frameId): \(text)")
                        switch frameId {
                        case "TT2":
                            if title == nil { title = text }
                        case "TP1":
                            if artist == nil { artist = text }
                        case "TAL":
                            if album == nil { album = text }
                        case "TP2":
                            if albumArtist == nil { albumArtist = text }
                        case "TCO":
                            if genre == nil { genre = text }
                        case "TYE":
                            if year == nil { year = text }
                        default:
                            break
                        }
                    }
                } else if frameId == "TXX" { // User text
                    if let pair = decodeUserTextFrame(frameData) {
                        print("ID3 v2.2 TXX: \(pair.descriptor) = \(pair.text)")
                        if pair.descriptor.lowercased().contains("album"), album == nil { album = pair.text }
                    }
                } else if frameId == "COM" { // Comment frame
                    if let commText = decodeCommentFrame(frameData) {
                        print("ID3 v2.2 COM: \(commText)")
                        if comment == nil || (comment?.isEmpty ?? true) { comment = commText }
                    }
                }
            }
        } else {
            // ID3v2.3 / 2.4: 4-byte IDs, 4-byte sizes, 2-byte flags
            while offset + 10 <= end, offset < end {
                let frameIdData = tag[offset..<(offset + 4)]
                guard let frameId = String(data: frameIdData, encoding: .isoLatin1), frameId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false else { break }
                offset += 4

                let sizeBytes = tag[offset..<(offset + 4)]
                offset += 4
                offset += 2 // skip flags

                let frameSize = header.versionMajor >= 4 ? decodeSyncSafe32(sizeBytes) : decodeUInt32(sizeBytes)
                if frameSize <= 0 { break }

                let frameEnd = min(offset + frameSize, end)
                if frameEnd <= offset { break }
                let frameData = tag[offset..<frameEnd]
                offset = frameEnd

                if frameId.first == "T" { // Text frame
                    if let text = decodeTextFrame(frameData) {
                        print("ID3 v2.\(header.versionMajor) frame \(frameId): \(text)")
                        switch frameId {
                        case "TIT2":
                            if title == nil { title = text }
                        case "TPE1":
                            if artist == nil { artist = text }
                        case "TALB":
                            if album == nil { album = text }
                        case "TPE2":
                            if albumArtist == nil { albumArtist = text }
                        case "TCON":
                            if genre == nil { genre = text }
                        case "TYER", "TDRC":
                            if year == nil { year = text }
                        default:
                            break
                        }
                    }
                } else if frameId == "TXXX" { // User text
                    if let pair = decodeUserTextFrame(frameData) {
                        print("ID3 v2.\(header.versionMajor) TXXX: \(pair.descriptor) = \(pair.text)")
                        if pair.descriptor.lowercased().contains("album"), album == nil { album = pair.text }
                    }
                } else if frameId == "COMM" { // Comment frame
                    if let commText = decodeCommentFrame(frameData) {
                        print("ID3 v2.\(header.versionMajor) COMM: \(commText)")
                        if comment == nil || (comment?.isEmpty ?? true) { comment = commText }
                    }
                }
            }
        }

        if title == nil && artist == nil && album == nil && albumArtist == nil && genre == nil && year == nil && comment == nil {
            return nil
        }

        return ID3Tag(title: title, artist: artist, album: album, albumArtist: albumArtist, genre: genre, year: year, comment: comment)
    }

    // MARK: - Parsing Helpers

    private static func parseHeader(data: Data) -> Header? {
        guard data.count >= 10 else { return nil }
        let id = data[0..<3]
        guard String(data: id, encoding: .isoLatin1) == "ID3" else { return nil }
        let verMajor = data[3]
        let verMinor = data[4]
        let flags = data[5]
        let sizeBytes = data[6..<10]
        let tagSize = decodeSyncSafe32(sizeBytes)
        return Header(versionMajor: verMajor, versionMinor: verMinor, flags: flags, tagSize: tagSize)
    }

    private static func decodeSyncSafe32(_ bytes: Data) -> Int {
        guard bytes.count == 4 else { return 0 }
        let b0 = Int(bytes[bytes.startIndex]) & 0x7F
        let b1 = Int(bytes[bytes.startIndex + 1]) & 0x7F
        let b2 = Int(bytes[bytes.startIndex + 2]) & 0x7F
        let b3 = Int(bytes[bytes.startIndex + 3]) & 0x7F
        return (b0 << 21) | (b1 << 14) | (b2 << 7) | b3
    }

    private static func decodeUInt32(_ bytes: Data) -> Int {
        guard bytes.count == 4 else { return 0 }
        var value: UInt32 = 0
        for b in bytes { value = (value << 8) | UInt32(b) }
        return Int(value)
    }

    private static func decodeUInt24(_ bytes: Data) -> Int {
        guard bytes.count == 3 else { return 0 }
        var value: Int = 0
        for b in bytes { value = (value << 8) | Int(b) }
        return value
    }

    private static func decodeTextFrame(_ data: Data) -> String? {
        guard data.count >= 1 else { return nil }
        let encoding = data[data.startIndex]
        var payload = data.dropFirst()
        // Strip unsynchronization in frame payload as well
        payload = removeUnsynchronization(payload)
        switch encoding {
        case 0x00: // ISO-8859-1
            return String(data: payload, encoding: .isoLatin1)?.trimmingCharacters(in: .whitespacesAndNewlines)
        case 0x01: // UTF-16 with BOM
            return String(data: payload, encoding: .utf16)?.trimmingCharacters(in: .whitespacesAndNewlines)
        case 0x02: // UTF-16BE without BOM
            return String(data: payload, encoding: .utf16BigEndian)?.trimmingCharacters(in: .whitespacesAndNewlines)
        case 0x03: // UTF-8
            return String(data: payload, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
        default:
            return nil
        }
    }

    private static func decodeCommentFrame(_ data: Data) -> String? {
        guard data.count >= 1 else { return nil }
        let encoding = data[data.startIndex]
        var cursor = data.startIndex + 1
        let data = removeUnsynchronization(data)
        // language (3 bytes) if present
        if data.count >= cursor + 3 { cursor += 3 }

        // content descriptor (null-terminated, encoding-dependent)
        let (descriptorEnd, _) = findNullTerminator(in: data, start: cursor, encoding: encoding)
        cursor = descriptorEnd
        if cursor < data.endIndex { cursor += (encoding == 0x01 || encoding == 0x02) ? 2 : 1 }

        // remaining is the actual text
        let textData = data[cursor..<data.endIndex]
        switch encoding {
        case 0x00:
            return String(data: textData, encoding: .isoLatin1)?.trimmingCharacters(in: .whitespacesAndNewlines)
        case 0x01:
            return String(data: textData, encoding: .utf16)?.trimmingCharacters(in: .whitespacesAndNewlines)
        case 0x02:
            return String(data: textData, encoding: .utf16BigEndian)?.trimmingCharacters(in: .whitespacesAndNewlines)
        case 0x03:
            return String(data: textData, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
        default:
            return nil
        }
    }

    private static func decodeUserTextFrame(_ data: Data) -> (descriptor: String, text: String)? {
        // TXXX/TXX: [encoding][descriptor][0/00][value]
        guard data.count >= 1 else { return nil }
        let encoding = data[data.startIndex]
        var cursor = data.startIndex + 1
        let data = removeUnsynchronization(data)

        // Descriptor until null-terminator
        let (descEnd, _) = findNullTerminator(in: data, start: cursor, encoding: encoding)
        let descData = data[cursor..<min(descEnd, data.endIndex)]
        var descriptor: String?
        switch encoding {
        case 0x00: descriptor = String(data: descData, encoding: .isoLatin1)
        case 0x01: descriptor = String(data: descData, encoding: .utf16)
        case 0x02: descriptor = String(data: descData, encoding: .utf16BigEndian)
        case 0x03: descriptor = String(data: descData, encoding: .utf8)
        default: descriptor = nil
        }

        cursor = descEnd
        if cursor < data.endIndex { cursor += (encoding == 0x01 || encoding == 0x02) ? 2 : 1 }
        if cursor >= data.endIndex { return nil }

        let textData = data[cursor..<data.endIndex]
        var text: String?
        switch encoding {
        case 0x00: text = String(data: textData, encoding: .isoLatin1)
        case 0x01: text = String(data: textData, encoding: .utf16)
        case 0x02: text = String(data: textData, encoding: .utf16BigEndian)
        case 0x03: text = String(data: textData, encoding: .utf8)
        default: text = nil
        }

        if let d = descriptor?.trimmingCharacters(in: .whitespacesAndNewlines),
           let t = text?.trimmingCharacters(in: .whitespacesAndNewlines) {
            return (d, t)
        }
        return nil
    }

    private static func findNullTerminator(in data: Data, start: Data.Index, encoding: UInt8) -> (Data.Index, Bool) {
        // Returns index of last byte of descriptor (position before the null sequence), and whether found
        switch encoding {
        case 0x00, 0x03: // single 0x00
            var i = start
            while i < data.endIndex {
                if data[i] == 0x00 { return (i, true) }
                i = data.index(after: i)
            }
            return (data.endIndex, false)
        case 0x01, 0x02: // two-byte 0x00 0x00
            var i = start
            while i + 1 < data.endIndex {
                if data[i] == 0x00 && data[i + 1] == 0x00 { return (i, true) }
                i = data.index(after: i)
            }
            return (data.endIndex, false)
        default:
            return (data.endIndex, false)
        }
    }

    // Remove ID3 unsynchronization pattern 0xFF 0x00 -> 0xFF
    private static func removeUnsynchronization(_ data: Data) -> Data {
        if data.isEmpty { return data }
        var output = Data()
        output.reserveCapacity(data.count)
        var i = data.startIndex
        while i < data.endIndex {
            let byte = data[i]
            output.append(byte)
            if byte == 0xFF {
                let next = data.index(after: i)
                if next < data.endIndex && data[next] == 0x00 {
                    i = data.index(after: next)
                    continue
                }
            }
            i = data.index(after: i)
        }
        return output
    }
}


