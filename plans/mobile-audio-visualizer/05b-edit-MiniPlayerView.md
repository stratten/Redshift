# Edits: `RedShiftMobile/RedShiftMobile/Views/MiniPlayerView.swift`

Adds the small visualizer bars between the album art and the title/artist text, inside the existing tappable `Button` (purely decorative, so it doesn't add a new touch target or compete with the play/pause/skip buttons).

## Edit 1 - add the EnvironmentObject

Anchor (unique):

```swift
struct MiniPlayerView: View {
    @EnvironmentObject var audioPlayer: AudioPlayerService
```

Replacement:

```swift
struct MiniPlayerView: View {
    @EnvironmentObject var audioPlayer: AudioPlayerService
    @EnvironmentObject var spectrumAnalyzer: AudioSpectrumAnalyzer
```

## Edit 2 - insert the bars between album art and track info

Anchor (unique):

```swift
                        VStack(alignment: .leading, spacing: 2) {
                            Text(currentTrack.displayTitle)
                                .font(.subheadline)
                                .fontWeight(.medium)
                                .lineLimit(1)
                            
                            Text(currentTrack.displayArtist)
                                .font(.caption)
                                .foregroundColor(Color(red: 0.35, green: 0.35, blue: 0.38))
                                .lineLimit(1)
                        }
                    }
                }
                .buttonStyle(.plain)
```

Replacement:

```swift
                        VisualizerBarsView(
                            levels: spectrumAnalyzer.bandLevels,
                            isActive: audioPlayer.isPlaying,
                            minHeight: 3,
                            maxHeight: 14,
                            barWidth: 2.5,
                            spacing: 2
                        )
                        
                        VStack(alignment: .leading, spacing: 2) {
                            Text(currentTrack.displayTitle)
                                .font(.subheadline)
                                .fontWeight(.medium)
                                .lineLimit(1)
                            
                            Text(currentTrack.displayArtist)
                                .font(.caption)
                                .foregroundColor(Color(red: 0.35, green: 0.35, blue: 0.38))
                                .lineLimit(1)
                        }
                    }
                }
                .buttonStyle(.plain)
```

## Edit 3 - fix the preview (crashes without the new environment object)

Anchor (unique):

```swift
#Preview {
    MiniPlayerView(onTap: {})
        .environmentObject(AudioPlayerService())
}
```

Replacement:

```swift
#Preview {
    MiniPlayerView(onTap: {})
        .environmentObject(AudioPlayerService())
        .environmentObject(AudioSpectrumAnalyzer())
}
```
