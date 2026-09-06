# Edits: `RedShiftMobile/RedShiftMobile/Views/NowPlayingView.swift`

Adds the large visualizer bars, centered, between the track info block and the progress slider.

## Edit 1 - add the EnvironmentObject

Anchor (unique):

```swift
struct NowPlayingView: View {
    @EnvironmentObject var audioPlayer: AudioPlayerService
    @EnvironmentObject var libraryManager: MusicLibraryManager
```

Replacement:

```swift
struct NowPlayingView: View {
    @EnvironmentObject var audioPlayer: AudioPlayerService
    @EnvironmentObject var libraryManager: MusicLibraryManager
    @EnvironmentObject var spectrumAnalyzer: AudioSpectrumAnalyzer
```

## Edit 2 - insert the bars between track info and the progress slider

Anchor (unique):

```swift
                        .padding(.horizontal, 32)
                        .padding(.top, 24)
                        
                        // Progress slider
                        VStack(spacing: 8) {
```

Replacement:

```swift
                        .padding(.horizontal, 32)
                        .padding(.top, 24)
                        
                        VisualizerBarsView(
                            levels: spectrumAnalyzer.bandLevels,
                            isActive: audioPlayer.isPlaying,
                            minHeight: 6,
                            maxHeight: 32,
                            barWidth: 6,
                            spacing: 5
                        )
                        .frame(maxWidth: .infinity)
                        .padding(.top, 20)
                        
                        // Progress slider
                        VStack(spacing: 8) {
```

## Edit 3 - fix the preview (crashes without the new environment object)

Anchor (unique):

```swift
#Preview {
    NowPlayingView()
        .environmentObject(AudioPlayerService())
        .environmentObject(MusicLibraryManager())
}
```

Replacement:

```swift
#Preview {
    NowPlayingView()
        .environmentObject(AudioPlayerService())
        .environmentObject(MusicLibraryManager())
        .environmentObject(AudioSpectrumAnalyzer())
}
```
