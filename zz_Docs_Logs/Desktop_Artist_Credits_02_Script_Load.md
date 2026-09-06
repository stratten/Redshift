# Desktop Artist Credits: Script Load Specification

## Applies
- Modify `RedShift_Desktop/src/renderer/index.html`.
- The anchor is unique and the new parser must load before both `MusicLibraryDataManager.js` and `ArtistDataProcessor.js`.

## Exact replacement
In the unique script-import block, replace the exact four lines below with the five lines below:

```text
REPLACE
    <script src="components/shared/TrackUIComponents.js"></script>
    <script src="components/shared/TrackEventHandlers.js"></script>
    <script src="components/shared/PlaylistPickerUtils.js"></script>
    <!-- Main AudioPlayer orchestrator (depends on all audioplayer modules above) -->

WITH
    <script src="components/shared/TrackUIComponents.js"></script>
    <script src="components/shared/TrackEventHandlers.js"></script>
    <script src="components/shared/PlaylistPickerUtils.js"></script>
    <script src="components/shared/ArtistCreditParser.js"></script>
    <!-- Main AudioPlayer orchestrator (depends on all audioplayer modules above) -->
```
