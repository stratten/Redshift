# Edit: `RedShift_Desktop/src/renderer/index.html`

Add the new script tag after `AudioPlayerPlayback.js` and before `AudioPlayerControls.js`, since
`AudioPlayerCrossfade` depends on `AudioPlayerPlayback.peekNextTrack`/`commitAdvance` existing on
the prototype but is only ever *instantiated* later, inside `AudioPlayer`'s constructor - so load
order just needs the class definition present before `components/AudioPlayer.js` runs, which is
also satisfied by any position in this block.

Anchor:

```html
    <script src="components/audioplayer/AudioPlayerOutputDevice.js"></script>
    <script src="components/audioplayer/AudioPlayerPlayback.js"></script>
    <script src="components/audioplayer/AudioPlayerControls.js"></script>
```

Replacement:

```html
    <script src="components/audioplayer/AudioPlayerOutputDevice.js"></script>
    <script src="components/audioplayer/AudioPlayerPlayback.js"></script>
    <script src="components/audioplayer/AudioPlayerCrossfade.js"></script>
    <script src="components/audioplayer/AudioPlayerControls.js"></script>
```
