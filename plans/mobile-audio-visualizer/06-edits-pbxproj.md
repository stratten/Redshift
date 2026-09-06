# Edits: `RedShiftMobile/RedShiftMobile.xcodeproj/project.pbxproj`

Registers the 4 new files (3 app-target Swift files, 1 test-target Swift file) using the same three-digit ID convention already used in this file (e.g. `120`/`020` for `CustomTabBar.swift`). New IDs used here, none of which currently exist in the file:

- `AudioSpectrumAnalyzer.swift` — fileRef `121`, buildFile `021`
- `AudioSpectrumAnalyzer+FFT.swift` — fileRef `122`, buildFile `022`
- `VisualizerBarsView.swift` — fileRef `123`, buildFile `023`
- `AudioSpectrumAnalyzerTests.swift` — fileRef `958`, buildFile `968`

## Edit 1 - PBXBuildFile section, app-target entries

Anchor (unique, last line of the app-target build files before the test build files):

```text
		020 /* CustomTabBar.swift in Sources */ = {isa = PBXBuildFile; fileRef = 120 /* CustomTabBar.swift */; };
		962 /* TrackOrderingTests.swift in Sources */ = {isa = PBXBuildFile; fileRef = 952 /* TrackOrderingTests.swift */; };
```

Replacement:

```text
		020 /* CustomTabBar.swift in Sources */ = {isa = PBXBuildFile; fileRef = 120 /* CustomTabBar.swift */; };
		021 /* AudioSpectrumAnalyzer.swift in Sources */ = {isa = PBXBuildFile; fileRef = 121 /* AudioSpectrumAnalyzer.swift */; };
		022 /* AudioSpectrumAnalyzer+FFT.swift in Sources */ = {isa = PBXBuildFile; fileRef = 122 /* AudioSpectrumAnalyzer+FFT.swift */; };
		023 /* VisualizerBarsView.swift in Sources */ = {isa = PBXBuildFile; fileRef = 123 /* VisualizerBarsView.swift */; };
		962 /* TrackOrderingTests.swift in Sources */ = {isa = PBXBuildFile; fileRef = 952 /* TrackOrderingTests.swift */; };
```

## Edit 2 - PBXBuildFile section, test-target entry

Anchor (unique, last line of the test build files before the section end):

```text
		967 /* DatabaseReconciliationTests.swift in Sources */ = {isa = PBXBuildFile; fileRef = 957 /* DatabaseReconciliationTests.swift */; };
/* End PBXBuildFile section */
```

Replacement:

```text
		967 /* DatabaseReconciliationTests.swift in Sources */ = {isa = PBXBuildFile; fileRef = 957 /* DatabaseReconciliationTests.swift */; };
		968 /* AudioSpectrumAnalyzerTests.swift in Sources */ = {isa = PBXBuildFile; fileRef = 958 /* AudioSpectrumAnalyzerTests.swift */; };
/* End PBXBuildFile section */
```

## Edit 3 - PBXFileReference section, app-target entries

Anchor (unique):

```text
		120 /* CustomTabBar.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = CustomTabBar.swift; sourceTree = "<group>"; };
		951 /* RedShiftMobileTests.xctest */ = {isa = PBXFileReference; explicitFileType = "wrapper.cfbundle"; includeInIndex = 0; path = RedShiftMobileTests.xctest; sourceTree = BUILT_PRODUCTS_DIR; };
```

Replacement:

```text
		120 /* CustomTabBar.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = CustomTabBar.swift; sourceTree = "<group>"; };
		121 /* AudioSpectrumAnalyzer.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = AudioSpectrumAnalyzer.swift; sourceTree = "<group>"; };
		122 /* AudioSpectrumAnalyzer+FFT.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = "AudioSpectrumAnalyzer+FFT.swift"; sourceTree = "<group>"; };
		123 /* VisualizerBarsView.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = VisualizerBarsView.swift; sourceTree = "<group>"; };
		951 /* RedShiftMobileTests.xctest */ = {isa = PBXFileReference; explicitFileType = "wrapper.cfbundle"; includeInIndex = 0; path = RedShiftMobileTests.xctest; sourceTree = BUILT_PRODUCTS_DIR; };
```

## Edit 4 - PBXFileReference section, test-target entry

Anchor (unique):

```text
		957 /* DatabaseReconciliationTests.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = DatabaseReconciliationTests.swift; sourceTree = "<group>"; };
/* End PBXFileReference section */
```

Replacement:

```text
		957 /* DatabaseReconciliationTests.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = DatabaseReconciliationTests.swift; sourceTree = "<group>"; };
		958 /* AudioSpectrumAnalyzerTests.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = AudioSpectrumAnalyzerTests.swift; sourceTree = "<group>"; };
/* End PBXFileReference section */
```

## Edit 5 - `RedShiftMobileTests` group, add the new test file

Anchor (unique):

```text
		950 /* RedShiftMobileTests */ = {
			isa = PBXGroup;
			children = (
				952 /* TrackOrderingTests.swift */,
				953 /* SearchPredicateTests.swift */,
				954 /* LibraryIndexTests.swift */,
				955 /* SyncManifestTests.swift */,
				956 /* ID3NumberParsingTests.swift */,
				957 /* DatabaseReconciliationTests.swift */,
			);
			path = RedShiftMobileTests;
			sourceTree = "<group>";
		};
```

Replacement:

```text
		950 /* RedShiftMobileTests */ = {
			isa = PBXGroup;
			children = (
				952 /* TrackOrderingTests.swift */,
				953 /* SearchPredicateTests.swift */,
				954 /* LibraryIndexTests.swift */,
				955 /* SyncManifestTests.swift */,
				956 /* ID3NumberParsingTests.swift */,
				957 /* DatabaseReconciliationTests.swift */,
				958 /* AudioSpectrumAnalyzerTests.swift */,
			);
			path = RedShiftMobileTests;
			sourceTree = "<group>";
		};
```

## Edit 6 - `Views` group, add `VisualizerBarsView.swift`

Anchor (unique):

```text
		304 /* Views */ = {
			isa = PBXGroup;
			children = (
				102 /* ContentView.swift */,
				103 /* LibraryView.swift */,
				114 /* LibraryBrowserView.swift */,
				115 /* LibraryDetailViews.swift */,
				104 /* NowPlayingView.swift */,
				105 /* PlaylistsView.swift */,
				106 /* SettingsView.swift */,
				113 /* MiniPlayerView.swift */,
				120 /* CustomTabBar.swift */,
			);
			path = Views;
			sourceTree = "<group>";
		};
```

Replacement:

```text
		304 /* Views */ = {
			isa = PBXGroup;
			children = (
				102 /* ContentView.swift */,
				103 /* LibraryView.swift */,
				114 /* LibraryBrowserView.swift */,
				115 /* LibraryDetailViews.swift */,
				104 /* NowPlayingView.swift */,
				105 /* PlaylistsView.swift */,
				106 /* SettingsView.swift */,
				113 /* MiniPlayerView.swift */,
				120 /* CustomTabBar.swift */,
				123 /* VisualizerBarsView.swift */,
			);
			path = Views;
			sourceTree = "<group>";
		};
```

## Edit 7 - `Services` group, add the analyzer + its FFT extension

Anchor (unique):

```text
		306 /* Services */ = {
			isa = PBXGroup;
			children = (
				109 /* AudioPlayerService.swift */,
				110 /* MusicLibraryManager.swift */,
				111 /* DatabaseService.swift */,
				116 /* ID3TagReader.swift */,
				118 /* LibraryIndex.swift */,
				119 /* SyncManifest.swift */,
			);
			path = Services;
			sourceTree = "<group>";
		};
```

Replacement:

```text
		306 /* Services */ = {
			isa = PBXGroup;
			children = (
				109 /* AudioPlayerService.swift */,
				110 /* MusicLibraryManager.swift */,
				111 /* DatabaseService.swift */,
				116 /* ID3TagReader.swift */,
				118 /* LibraryIndex.swift */,
				119 /* SyncManifest.swift */,
				121 /* AudioSpectrumAnalyzer.swift */,
				122 /* AudioSpectrumAnalyzer+FFT.swift */,
			);
			path = Services;
			sourceTree = "<group>";
		};
```

## Edit 8 - app-target `Sources` build phase (`500`)

Anchor (unique, last two lines of the `files` list):

```text
				018 /* LibraryIndex.swift in Sources */,
				019 /* SyncManifest.swift in Sources */,
			);
			runOnlyForDeploymentPostprocessing = 0;
		};
		971 /* Sources */ = {
```

Replacement:

```text
				018 /* LibraryIndex.swift in Sources */,
				019 /* SyncManifest.swift in Sources */,
				021 /* AudioSpectrumAnalyzer.swift in Sources */,
				022 /* AudioSpectrumAnalyzer+FFT.swift in Sources */,
				023 /* VisualizerBarsView.swift in Sources */,
			);
			runOnlyForDeploymentPostprocessing = 0;
		};
		971 /* Sources */ = {
```

## Edit 9 - test-target `Sources` build phase (`971`)

Anchor (unique):

```text
				966 /* ID3NumberParsingTests.swift in Sources */,
				967 /* DatabaseReconciliationTests.swift in Sources */,
			);
			runOnlyForDeploymentPostprocessing = 0;
		};
/* End PBXSourcesBuildPhase section */
```

Replacement:

```text
				966 /* ID3NumberParsingTests.swift in Sources */,
				967 /* DatabaseReconciliationTests.swift in Sources */,
				968 /* AudioSpectrumAnalyzerTests.swift in Sources */,
			);
			runOnlyForDeploymentPostprocessing = 0;
		};
/* End PBXSourcesBuildPhase section */
```

## Apply order

Apply edits 1-9 in any order — each anchor is unique and none overlap with another edit's anchor text, since `PBXBuildFile`, `PBXFileReference`, `PBXGroup`, and `PBXSourcesBuildPhase` are distinct sections of the file.
