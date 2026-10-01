# 06 — Mobile Playlist Sync Fixes

Apply after 02b. Edit 2b.18 already sits in `performIncrementalReconciliation`, and none of the anchors here overlap it.

Root causes on the phone:

- First launch runs `loadLibraryFromDatabase`, which imports playlists while `tracks` is still empty. Every filename fails to match, so each playlist is saved with zero tracks. `scanLibrary` then loads the tracks but never re-imports playlists.
- `importPlaylistFromJSON` replaces an existing playlist wholesale, whatever its stamp, so a phone edit loses to any file present on disk.
- The background export rewrites every JSON file unconditionally. A desktop-pushed file that has not been imported yet is overwritten with the older phone copy before it is ever read.
- Local edits reach the JSON only when the app is backgrounded, so a sync done while the app is in the foreground never sees them.

## File: `RedShiftMobile/RedShiftMobile/Models/Playlist.swift`

### Edit 6.1 — import policy and edit stamping

Find:

```swift
    // Helper method to resolve stable IDs to Track objects
    func getTracks(from library: [Track]) -> [Track] {
        return trackStableIDs.compactMap { stableID in
            library.first(where: { $0.stableID == stableID })
        }
    }
}
```

Replace:

```swift
    // Helper method to resolve stable IDs to Track objects
    func getTracks(from library: [Track]) -> [Track] {
        return trackStableIDs.compactMap { stableID in
            library.first(where: { $0.stableID == stableID })
        }
    }

    /// Whole-second stamp for a local edit that is always later than the
    /// previous stamp, so a desktop whose clock runs ahead still sees the edit
    /// as a change since the last sync.
    static func nextModifiedDate(after previous: Date, now: Date = Date()) -> Date {
        let nowSeconds = now.timeIntervalSince1970.rounded(.down)
        let previousSeconds = previous.timeIntervalSince1970.rounded(.down)
        return Date(timeIntervalSince1970: max(nowSeconds, previousSeconds + 1))
    }
}

/// Decides how a playlist JSON found in Documents/Playlists applies to the
/// local database. The desktop arbitrates conflicts during sync, so a file
/// stamped at or after the local copy is authoritative; an older file is a
/// stale leftover that must not roll back a newer local edit.
enum PlaylistSyncImportPolicy {
    enum Decision: Equatable {
        case create
        case replace
        case keepLocal
        case unchanged
    }

    static func decide(local: Playlist?, incomingTrackStableIDs: [String], incomingModified: Date) -> Decision {
        guard let local = local else { return .create }
        if local.trackStableIDs == incomingTrackStableIDs { return .unchanged }
        // Stamps are compared in whole seconds: the database stores Int64 seconds
        // and the desktop floors every stamp it writes.
        let incomingSeconds = incomingModified.timeIntervalSince1970.rounded(.down)
        let localSeconds = local.modifiedDate.timeIntervalSince1970.rounded(.down)
        return incomingSeconds >= localSeconds ? .replace : .keepLocal
    }
}
```

## File: `RedShiftMobile/RedShiftMobile/Services/MusicLibraryManager.swift`

### Edit 6.2 — `scanLibrary` imports playlists once tracks exist

Find:

```swift
            // Step 5: Load fresh data
            let loadedTracks = try await databaseService.loadTracks()
            let loadedPlaylists = try await databaseService.loadPlaylists()
            
            await MainActor.run {
                tracks = loadedTracks
                playlists = loadedPlaylists
            }
```

(The whitespace-only line contains 12 spaces.)

Replace:

```swift
            // Step 5: Load fresh data
            let loadedTracks = try await databaseService.loadTracks()
            await MainActor.run {
                tracks = loadedTracks
            }
            // Filenames in synced playlists resolve against `tracks`, so this
            // must run after the fresh library is published.
            await importPlaylistsFromSync()
```

`importPlaylistsFromSync` reloads `playlists` from the database when it finishes. If the Playlists directory is missing it returns early, and in that case the playlists the database already holds are the ones `loadLibraryFromDatabase` published.

### Edit 6.3 — never import against an empty library

Find:

```swift
    func importPlaylistsFromSync() async {
        print("📋 Starting playlist import from sync...")
```

Replace:

```swift
    func importPlaylistsFromSync() async {
        // With no tracks every filename fails to resolve and each playlist would
        // be saved empty; scanLibrary imports again once tracks are loaded.
        guard !tracks.isEmpty else {
            print("📋 Skipping playlist import: library not loaded yet")
            return
        }
        print("📋 Starting playlist import from sync...")
```

### Edit 6.4 — stamp-aware, case-insensitive import

Find:

```swift
        // Check if playlist already exists (must check database, not in-memory array)
        let existingPlaylists = try await databaseService.loadPlaylists()
        if let existingPlaylist = existingPlaylists.first(where: { $0.name == syncedPlaylist.name }) {
            // Update existing playlist
            var updatedPlaylist = existingPlaylist
            updatedPlaylist.trackStableIDs = trackStableIDs
            updatedPlaylist.modifiedDate = syncedPlaylist.modifiedDate
            try await databaseService.updatePlaylist(updatedPlaylist)
            print("📋 Updated existing playlist: \(syncedPlaylist.name) (\(trackStableIDs.count) tracks)")
        } else {
```

Replace:

```swift
        // Check if playlist already exists (must check database, not in-memory array).
        // Case-insensitive because the desktop and the JSON filename both key on lowercase names.
        let existingPlaylists = try await databaseService.loadPlaylists()
        let existingPlaylist = existingPlaylists.first(where: { $0.name.lowercased() == syncedPlaylist.name.lowercased() })
        let decision = PlaylistSyncImportPolicy.decide(
            local: existingPlaylist,
            incomingTrackStableIDs: trackStableIDs,
            incomingModified: syncedPlaylist.modifiedDate
        )
        PlaybackDiagnostics.shared.record(
            "playlist.sync",
            "\(syncedPlaylist.name): \(decision) resolved=\(trackStableIDs.count)/\(syncedPlaylist.tracks.count)"
        )
        if let existingPlaylist = existingPlaylist {
            guard decision == .replace else {
                print("📋 Kept local playlist: \(existingPlaylist.name) (\(decision))")
                return
            }
            var updatedPlaylist = existingPlaylist
            updatedPlaylist.trackStableIDs = trackStableIDs
            updatedPlaylist.modifiedDate = syncedPlaylist.modifiedDate
            try await databaseService.updatePlaylist(updatedPlaylist)
            print("📋 Updated existing playlist: \(syncedPlaylist.name) (\(trackStableIDs.count) tracks)")
        } else {
```

### Edit 6.5 — never overwrite a newer file on disk

Find:

```swift
        // Create safe filename
        let safeFilename = playlist.name.replacingOccurrences(of: "[^a-zA-Z0-9]", with: "_", options: .regularExpression).lowercased()
        let fileURL = directory.appendingPathComponent("\(safeFilename).json")
```

Replace:

```swift
        let fileURL = playlistSyncFileURL(for: playlist.name, in: directory)
        // A newer file here was pushed by the desktop and not imported yet;
        // overwriting it would discard the desktop's merge result.
        if let existingModified = exportedModifiedDate(at: fileURL),
           existingModified.timeIntervalSince1970.rounded(.down) > playlist.modifiedDate.timeIntervalSince1970.rounded(.down) {
            print("📋 Skipped export of \(playlist.name): newer synced file on disk")
            return
        }
```

### Edit 6.6 — export immediately after create and update

Find:

```swift
            try await databaseService.savePlaylist(playlist)
            print("📋 Playlist saved, reloading all playlists...")
```

Replace:

```swift
            try await databaseService.savePlaylist(playlist)
            await exportPlaylistAfterLocalEdit(playlist)
            print("📋 Playlist saved, reloading all playlists...")
```

Find:

```swift
    func updatePlaylist(_ playlist: Playlist) async {
        do {
            try await databaseService.updatePlaylist(playlist)
```

Replace:

```swift
    func updatePlaylist(_ playlist: Playlist) async {
        do {
            try await databaseService.updatePlaylist(playlist)
            await exportPlaylistAfterLocalEdit(playlist)
```

### Edit 6.7 — deleting a playlist removes its sync file

Find:

```swift
            try await databaseService.deletePlaylist(playlist.id)
```

Replace:

```swift
            try await databaseService.deletePlaylist(playlist.id)
            if let directory = playlistSyncDirectoryURL() {
                try? FileManager.default.removeItem(at: playlistSyncFileURL(for: playlist.name, in: directory))
            }
```

### Edit 6.8 — edit stamps that always advance

Find:

```swift
        if !playlist.trackStableIDs.contains(trackStableID) {
            playlist.trackStableIDs.append(trackStableID)
            playlist.modifiedDate = Date()
            await updatePlaylist(playlist)
        }
```

Replace:

```swift
        if !playlist.trackStableIDs.contains(trackStableID) {
            playlist.trackStableIDs.append(trackStableID)
            playlist.modifiedDate = Playlist.nextModifiedDate(after: latestKnownModifiedDate(for: playlist))
            await updatePlaylist(playlist)
        }
```

Find:

```swift
        playlist.trackStableIDs.removeAll { $0 == trackStableID }
        playlist.modifiedDate = Date()
        await updatePlaylist(playlist)
```

Replace:

```swift
        playlist.trackStableIDs.removeAll { $0 == trackStableID }
        playlist.modifiedDate = Playlist.nextModifiedDate(after: latestKnownModifiedDate(for: playlist))
        await updatePlaylist(playlist)
```

### Edit 6.9 — sync-file helpers at the end of the class

Find (the last lines of the file):

```swift
        try data.write(to: fileURL)
        print("📋 Exported playlist: \(playlist.name) → \(fileURL.lastPathComponent)")
    }
}
```

Replace:

```swift
        try data.write(to: fileURL)
        print("📋 Exported playlist: \(playlist.name) → \(fileURL.lastPathComponent)")
    }

    // MARK: - Playlist Sync File Helpers
    private func playlistSyncDirectoryURL() -> URL? {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first?
            .appendingPathComponent("Playlists")
    }

    /// Must match the desktop's pushPlaylistToDevice naming.
    private func playlistSyncFileURL(for name: String, in directory: URL) -> URL {
        let safeFilename = name.replacingOccurrences(of: "[^a-zA-Z0-9]", with: "_", options: .regularExpression).lowercased()
        return directory.appendingPathComponent("\(safeFilename).json")
    }

    private func exportedModifiedDate(at fileURL: URL) -> Date? {
        struct StampOnly: Decodable { let modifiedDate: TimeInterval }
        guard let data = try? Data(contentsOf: fileURL),
              let stamp = try? JSONDecoder().decode(StampOnly.self, from: data) else { return nil }
        return Date(timeIntervalSince1970: stamp.modifiedDate)
    }

    /// The later of the database stamp and the synced file's stamp, so a local
    /// edit is always newer than whatever the desktop last pushed.
    private func latestKnownModifiedDate(for playlist: Playlist) -> Date {
        guard let directory = playlistSyncDirectoryURL(),
              let exported = exportedModifiedDate(at: playlistSyncFileURL(for: playlist.name, in: directory)) else {
            return playlist.modifiedDate
        }
        return max(playlist.modifiedDate, exported)
    }

    /// Writes the playlist's sync file right away so a desktop sync started
    /// while the app is still in the foreground sees the edit.
    private func exportPlaylistAfterLocalEdit(_ playlist: Playlist) async {
        guard let directory = playlistSyncDirectoryURL() else { return }
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        do {
            try await exportPlaylistToJSON(playlist, to: directory)
        } catch {
            print("❌ Failed to export playlist \(playlist.name) after edit: \(error)")
        }
    }
}
```

## Anchor notes

- The Edit 6.9 anchor also matches the text that Edit 6.5 leaves in place: `try data.write(to: fileURL)` is not touched by 6.5. Apply 6.5 before 6.9 in any case; both anchors are unique before and after.
- `try await databaseService.deletePlaylist(playlist.id)` occurs once in the file. `try await databaseService.savePlaylist(playlist)` occurs twice, in `createPlaylist` and in the import's create branch. The 6.6 anchor includes the following `print("📋 Playlist saved, reloading all playlists...")` line, which occurs only in `createPlaylist`.
- The two `playlist.modifiedDate = Date()` anchors in 6.8 each include a distinct preceding line.
- The whitespace-only line inside the 6.2 anchor contains exactly 12 spaces.
