# Mobile Artist Credits: Primary and Appears-On Navigation

Modify `RedShiftMobile/RedShiftMobile/Views/LibraryDetailViews.swift`. `artistID` is the canonical key carried through navigation; `artistName` is the preserved display spelling. All anchors are unique.

Replace:

let artist: String

private var allTracks: [Track] {
    libraryManager.libraryIndex.artists.first { $0.id == artist }?.tracks ?? []
}

with:

let artistID: String

private var artistGroup: ArtistGroup? {
    libraryManager.libraryIndex.artists.first { $0.id == artistID }
}

private var artistName: String {
    artistGroup?.name ?? "Unknown Artist"
}

private var primaryTracks: [Track] {
    artistGroup?.primaryTracks ?? []
}

private var featuredTracks: [Track] {
    artistGroup?.featuredTracks ?? []
}

Replace the `albums` property with:

private var albums: [AlbumGroup] {
    let names = Set(primaryTracks.compactMap(\.album))
    return libraryManager.libraryIndex.albums.filter { names.contains($0.album) }
}

Make these exact single-expression replacements in the same type:

Text(artist) → Text(artistName)

Text("\(allTracks.count) song\(allTracks.count == 1 ? "" : "s")") → Text("\(primaryTracks.count) song\(primaryTracks.count == 1 ? "" : "s")")

audioPlayer.playQueue(allTracks, startingAt: 0) → audioPlayer.playQueue(primaryTracks, startingAt: 0)

NavigationLink(destination: ArtistAllTracksView(artist: artist)) → NavigationLink(destination: ArtistAllTracksView(artistID: artistID, creditRole: .primary))

Text("\(allTracks.count) song\(allTracks.count == 1 ? "" : "s")") → Text("\(primaryTracks.count) song\(primaryTracks.count == 1 ? "" : "s")")

Text(artist) in the `.principal` toolbar item → Text(artistName)

Immediately after the complete primary “All Tracks” `NavigationLink` (the block ending in `.buttonStyle(PlainButtonStyle())` before `// Albums section`), insert:

if !featuredTracks.isEmpty {
    NavigationLink(destination: ArtistAllTracksView(artistID: artistID, creditRole: .featured)) {
        HStack(spacing: 12) {
            Image(systemName: "person.2.badge.plus")
                .font(.title3)
                .foregroundColor(.purple)
                .frame(width: 50, height: 50)
                .background(Color.purple.opacity(0.1))
                .cornerRadius(8)
            VStack(alignment: .leading, spacing: 4) {
                Text("Appears On")
                    .font(.headline)
                    .foregroundColor(.primary)
                Text("\(featuredTracks.count) song\(featuredTracks.count == 1 ? "" : "s")")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Color(.systemBackground))
    }
    .buttonStyle(PlainButtonStyle())
}

Replace `let artist: String` in `ArtistAllTracksView` with:

let artistID: String
let creditRole: ArtistCreditRole

Immediately before `enum SortOption`, insert:

enum ArtistCreditRole {
    case primary
    case featured

    var navigationTitle: String {
        self == .primary ? "All Tracks" : "Appears On"
    }
}

Replace the `base` declaration in the `tracks` property with:

let group = libraryManager.libraryIndex.artists.first { $0.id == artistID }
let base = creditRole == .primary ? (group?.primaryTracks ?? []) : (group?.featuredTracks ?? [])

Replace `.navigationTitle("All Tracks")` with `.navigationTitle(creditRole.navigationTitle)`. This keeps album navigation primary-only and makes contributor playback/search operate only on the selected role’s tracks.
