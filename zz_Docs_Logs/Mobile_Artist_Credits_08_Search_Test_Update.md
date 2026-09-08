# Mobile Artist Credits: Search Test Contract Update

Modify `RedShiftMobile/RedShiftMobileTests/SearchPredicateTests.swift`. Replace the unique `ArtistGroup` initializer:

let group = ArtistGroup(id: "Radiohead", name: "Radiohead", tracks: [track], albumCount: 1)

with:

let group = ArtistGroup(id: "radiohead", name: "Radiohead", primaryTracks: [track], featuredTracks: [], primaryAlbumCount: 1)

The existing assertions continue to prove that artist-group searching delegates to the shared track predicate, which now recognizes every canonical artist credit.
