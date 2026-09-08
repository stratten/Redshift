# Mobile Artist Credits: Genre Sorting

Modify `RedShiftMobile/RedShiftMobile/Views/LibraryDetailViews.swift`. In the unique `.artist` branch of `GenreDetailView.tracks`, replace:

return filtered.sorted { ($0.artist ?? "") < ($1.artist ?? "") }

with:

return filtered.sorted { $0.primaryArtistName.localizedCaseInsensitiveCompare($1.primaryArtistName) == .orderedAscending }

This affects only the artist ordering within genre results. It does not alter track metadata, the album grouping policy, or raw artist-credit display.
