# Mobile Artist Credits: Song Sorting

Modify `RedShiftMobile/RedShiftMobile/Views/LibraryView.swift`. In the unique `.artist` branch of `filteredTracks`, replace:

let comparison = ($0.displayArtist, $0.displayAlbum, $0.trackNumber ?? 0) < ($1.displayArtist, $1.displayAlbum, $1.trackNumber ?? 0)

with:

let comparison = ($0.primaryArtistName, $0.displayAlbum, $0.trackNumber ?? 0) < ($1.primaryArtistName, $1.displayAlbum, $1.trackNumber ?? 0)

Raw track-credit strings remain visible in every track row; only sorting uses the first parsed primary artist so feature text does not create a separate artist-sort region.
