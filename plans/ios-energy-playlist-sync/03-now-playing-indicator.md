# 03 — Now-Playing Indicator in Track Lists

Apply after 02b. `TrackRow` must observe `AudioPlayerService`, which is only cheap once 02b stops publishing the 10 Hz position from that object.

Identity is compared by `filePath`: the file on disk is what the player opened, and every `Track` value built from the same file shares it.

`TrackRow` is used by LibraryView (Songs), PlaylistDetailView, ArtistAllTracksView, GenreDetailView and RecentlyPlayedView. Changing `TrackRow` therefore covers every list except AlbumDetailView, which has its own row layout (Edits 3.5–3.6). `AudioPlayerService` is injected at the app root (`RedShiftMobileApp`), so every one of those screens already has it in the environment.

## File: `RedShiftMobile/RedShiftMobile/Views/LibraryView.swift`

### Edit 3.1 — player access and current-row check

Find:

```swift
struct TrackRow: View {
    @EnvironmentObject var libraryManager: MusicLibraryManager
    let track: Track
```

Replace:

```swift
struct TrackRow: View {
    @EnvironmentObject var libraryManager: MusicLibraryManager
    @EnvironmentObject var audioPlayer: AudioPlayerService
    let track: Track

    private var isCurrent: Bool {
        audioPlayer.currentTrack?.filePath == track.filePath
    }
```

### Edit 3.2 — indicator over the leading album-art slot

Find:

```swift
        HStack(spacing: 10) {
            // Album art with shadow
            if let albumArtData = track.albumArtData {
                if let uiImage = UIImage(data: albumArtData) {
                    Image(uiImage: uiImage)
                        .resizable()
                        .scaledToFill()
                        .frame(width: 48, height: 48)
                        .clipped()
                        .cornerRadius(4)
                        .shadow(color: .black.opacity(0.15), radius: 3, x: 0, y: 1)
                } else {
                    // Data exists but UIImage can't decode it - show gray with warning
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color.gray.opacity(0.5))
                        .frame(width: 48, height: 48)
                        .overlay {
                            Image(systemName: "exclamationmark.triangle")
                                .font(.caption)
                                .foregroundColor(.white)
                        }
                        .shadow(color: .black.opacity(0.1), radius: 3, x: 0, y: 1)
                }
            } else {
                // No album art data
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color.purple.opacity(0.3))
                    .frame(width: 48, height: 48)
                    .overlay {
                        Image(systemName: "music.note")
                            .foregroundColor(.purple)
                    }
                    .shadow(color: .black.opacity(0.1), radius: 3, x: 0, y: 1)
            }
```

Replace:

```swift
        HStack(spacing: 10) {
            // Album art with shadow
            Group {
                if let albumArtData = track.albumArtData {
                    if let uiImage = UIImage(data: albumArtData) {
                        Image(uiImage: uiImage)
                            .resizable()
                            .scaledToFill()
                            .frame(width: 48, height: 48)
                            .clipped()
                            .cornerRadius(4)
                            .shadow(color: .black.opacity(0.15), radius: 3, x: 0, y: 1)
                    } else {
                        // Data exists but UIImage can't decode it - show gray with warning
                        RoundedRectangle(cornerRadius: 4)
                            .fill(Color.gray.opacity(0.5))
                            .frame(width: 48, height: 48)
                            .overlay {
                                Image(systemName: "exclamationmark.triangle")
                                    .font(.caption)
                                    .foregroundColor(.white)
                            }
                            .shadow(color: .black.opacity(0.1), radius: 3, x: 0, y: 1)
                    }
                } else {
                    // No album art data
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color.purple.opacity(0.3))
                        .frame(width: 48, height: 48)
                        .overlay {
                            Image(systemName: "music.note")
                                .foregroundColor(.purple)
                        }
                        .shadow(color: .black.opacity(0.1), radius: 3, x: 0, y: 1)
                }
            }
            .overlay {
                if isCurrent {
                    ZStack {
                        RoundedRectangle(cornerRadius: 4)
                            .fill(Color.black.opacity(0.6))
                        NowPlayingIndicator(isPlaying: audioPlayer.isPlaying, size: 18, color: .white)
                    }
                    .frame(width: 48, height: 48)
                }
            }
```

### Edit 3.3 — highlight the current title

Find:

```swift
                MarqueeText(text: track.displayTitle, font: .body)
                    .frame(height: 20)
```

Replace:

```swift
                MarqueeText(text: track.displayTitle, font: .body)
                    .foregroundColor(isCurrent ? .purple : .primary)
                    .frame(height: 20)
```

### Edit 3.4 — `NowPlayingIndicator`

Find:

```swift
// MARK: - Track Context Menu
struct TrackContextMenu: View {
```

Replace:

```swift
// MARK: - Now Playing Indicator
/// Static glyph marking the current track's row. A repeating symbol
/// animation would keep the display rendering for as long as the list is on
/// screen, which is exactly the energy cost this release removes elsewhere.
struct NowPlayingIndicator: View {
    let isPlaying: Bool
    var size: CGFloat = 14
    var color: Color = .purple

    var body: some View {
        Image(systemName: isPlaying ? "speaker.wave.2.fill" : "speaker.fill")
            .font(.system(size: size, weight: .bold))
            .foregroundColor(color)
            .accessibilityLabel(isPlaying ? "Now playing" : "Current track, paused")
    }
}

// MARK: - Track Context Menu
struct TrackContextMenu: View {
```

## File: `RedShiftMobile/RedShiftMobile/Views/LibraryDetailViews.swift` (AlbumDetailView)

### Edit 3.5 — indicator replaces the track number on the current row

Find:

```swift
                                if let trackNum = track.trackNumber {
                                    // A narrow number column aligns with the title's first line.
                                    Text("\(trackNum)")
                                        .font(.subheadline)
                                        .fontWeight(.medium)
                                        .foregroundColor(.secondary)
                                        .frame(minWidth: 18, alignment: .trailing)
                                }
```

Replace:

```swift
                                if audioPlayer.currentTrack?.filePath == track.filePath {
                                    NowPlayingIndicator(isPlaying: audioPlayer.isPlaying)
                                        .frame(minWidth: 18, alignment: .trailing)
                                        .frame(height: 20)
                                } else if let trackNum = track.trackNumber {
                                    // A narrow number column aligns with the title's first line.
                                    Text("\(trackNum)")
                                        .font(.subheadline)
                                        .fontWeight(.medium)
                                        .foregroundColor(.secondary)
                                        .frame(minWidth: 18, alignment: .trailing)
                                }
```

### Edit 3.6 — highlight the current title

Find:

```swift
                                    MarqueeText(text: track.displayTitle, font: .body)
                                        .foregroundColor(.primary)
```

Replace:

```swift
                                    MarqueeText(text: track.displayTitle, font: .body)
                                        .foregroundColor(audioPlayer.currentTrack?.filePath == track.filePath ? .purple : .primary)
```

## Behaviour notes

- Tracks without a track number still get the indicator in the same 18 pt column, so the current row's title shifts right by the column width. That column exists only for the current row, and the divider inset keys off `trackNumber`, so the dividers do not move.
- Purple on the white row background and white on a 60% black scrim both give strong contrast; there is no grey-on-grey.
