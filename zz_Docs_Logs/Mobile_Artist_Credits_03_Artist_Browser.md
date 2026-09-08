# Mobile Artist Credits: Browser and Card Presentation

Modify `RedShiftMobile/RedShiftMobile/Views/LibraryBrowserView.swift`. All anchors are unique. Replace the Artists case in `itemCount(for:)`:

case .artists:
    let count = Set(libraryManager.tracks.compactMap { $0.artist }).count
    return "\(count) artist\(count == 1 ? "" : "s")"

with:

case .artists:
    let count = libraryManager.libraryIndex.artists.count
    return "\(count) artist\(count == 1 ? "" : "s")"

Replace both occurrences of:

NavigationLink(destination: ArtistDetailView(artist: artist.name))

with:

NavigationLink(destination: ArtistDetailView(artistID: artist.id))

In `ArtistRowView`, replace:

Label("\(artist.albumCount)", systemImage: "square.stack")
    .font(.caption)
    .foregroundColor(.secondary)

// Track count
Label("\(artist.tracks.count)", systemImage: "music.note")
    .font(.caption)
    .foregroundColor(.secondary)

with:

Label("\(artist.primaryAlbumCount)", systemImage: "square.stack")
    .font(.caption)
    .foregroundColor(.secondary)

Label("\(artist.primaryTracks.count)", systemImage: "music.note")
    .font(.caption)
    .foregroundColor(.secondary)

if !artist.featuredTracks.isEmpty {
    Label("\(artist.featuredTracks.count)", systemImage: "person.2.badge.plus")
        .font(.caption)
        .foregroundColor(.secondary)
}

In `ArtistGridItemView`, replace:

Text("\(artist.albumCount) album\(artist.albumCount == 1 ? "" : "s")")
    .font(.caption2)
    .foregroundColor(.secondary)

Text("•")
    .font(.caption2)
    .foregroundColor(.secondary)

Text("\(artist.tracks.count) song\(artist.tracks.count == 1 ? "" : "s")")
    .font(.caption2)
    .foregroundColor(.secondary)

with:

Text("\(artist.primaryAlbumCount) album\(artist.primaryAlbumCount == 1 ? "" : "s")")
    .font(.caption2)
    .foregroundColor(.secondary)

Text("•")
    .font(.caption2)
    .foregroundColor(.secondary)

Text("\(artist.primaryTracks.count) song\(artist.primaryTracks.count == 1 ? "" : "s")")
    .font(.caption2)
    .foregroundColor(.secondary)

if !artist.featuredTracks.isEmpty {
    Text("\(artist.featuredTracks.count) appearance\(artist.featuredTracks.count == 1 ? "" : "s")")
        .font(.caption2)
        .foregroundColor(.secondary)
}

Artist cards retain the first source spelling as their label, use lowercased canonical keys only for identity/navigation, and show primary releases separately from contributor appearances.
