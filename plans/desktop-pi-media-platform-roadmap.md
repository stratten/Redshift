# Desktop + Raspberry Pi Media Platform Roadmap

## Purpose and scope

This document tracks the staged work required to evolve RedShift Desktop from a local music manager into a desktop-first media manager with video playback, multiple libraries, library-to-library transfer and reconciliation, and an autonomous Raspberry Pi TV appliance. It is a roadmap and progress register, not an implementation-ready specification. Each package must receive its own approved implementation plan before functional code work starts.

In scope: the existing Electron desktop app, local desktop video management/playback, Raspberry Pi HDMI playback, paired-library transfer, reconciliation between any two libraries, and desktop control of the Pi when it is reachable.

Out of scope for this roadmap's first release sequence: iOS video playback, public internet exposure, cloud storage, multi-user accounts, arbitrary-device transcoding, live-TV/tuner support, HDMI pass-through, and replacement of the TV's native apps.

## Settled product decisions — do not re-litigate during package execution

- The current desktop app remains a first-class local media manager and playback device, in the spirit of iTunes. Raspberry Pi support must not make desktop use dependent on a Pi.
- The Raspberry Pi is an autonomous TV media appliance. It must boot into and operate a fullscreen TV interface, play its own locally available media over HDMI, and remain usable when the desktop is off or unreachable.
- Media acquisition commonly begins on the desktop. The user must be able to choose a destination library when importing or dropping media, including a paired Pi library.
- Libraries and playback devices are separate concepts. A user can browse one library, import into another, and choose either the desktop or Pi as the playback target.
- Any two paired libraries must eventually be comparable and reconcilable. Reconciliation is a user-reviewed operation; it is not an implicit destructive mirror.
- The initial Pi video path prioritizes direct playback of compatible files stored on the Pi. Transcoding is a later capability, not a prerequisite for the first TV appliance release.
- Desktop-to-Pi remote control is optional convenience. The Pi's local catalog, queue, player, and HDMI output must never require a live desktop connection.

## Current technical baseline

| Area | Current state | Reusable foundation | Gap to target |
| --- | --- | --- | --- |
| Desktop application | Electron 27/macOS music manager; renderer is vanilla JavaScript and main process owns native integration. | `RedShift_Desktop/src/main/main.js`, `src/main/preload.js`, and the renderer component structure. | Music-only model and macOS-focused packaging. |
| Local library | One configured music-library path is scanned into a `songs` SQLite table. | `MusicLibraryCache.js`, `LibraryHandlers.js`, and `Database.js`. | No durable library identity, multiple-library registry, video schema, or media-item abstraction. |
| Desktop audio | Local audio elements, Web Audio features, queue, crossfade, and media keys exist. | `AudioPlayer.js`, `AudioPlayerCrossfade.js`, and main-process audio services. | No desktop video playback abstraction, video controls, subtitles, or watch progress. |
| File import | Desktop can copy imported music into its configured master library. | `LibraryHandlers.js`. | No import-target selection, remote destination, resumable transfer protocol, or atomic remote ingest. |
| Sync | USB/Wi-Fi music sync tracks transfers and uses SHA-256 in parts of the flow. | `DopplerSyncService.js`, `DopplerSyncAnalysis.js`, `DopplerSyncTransfer.js`, and `transferred_files`. | Device-specific, music-specific workflows; no symmetric library inventory or reconciliation contract. |
| Pairing/transport | WebSocket pairing exists for a third-party Doppler service. | `WebSocketPairingService.js` and `ws`. | It relies on `doppler-transfer.com` and cannot serve as the Pi trust, discovery, or transfer protocol. |
| Pi appliance | No Pi software, package target, service, or TV UI exists. | Electron/Node/SQLite product knowledge only. | All Pi runtime, packaging, local UI, player integration, and operational setup remain unbuilt. |

## Terms and boundaries

| Term | Meaning |
| --- | --- |
| Library | A named, durable collection with a stable library ID, a locally owned media root, a local inventory database, and a scan/reconciliation lifecycle. A path alone is not a library identity. |
| Library endpoint | A device that owns and exposes a library. Initially this is the desktop app or the Pi appliance. |
| Browse library | The inventory currently displayed in the UI. It does not by itself choose where imports go or where playback happens. |
| Import destination | The library that receives newly dropped/acquired files. Remote imports enter a persistent transfer queue. |
| Playback target | The device that renders media: This Device or a paired Pi TV. It is independent from the browse library. |
| Reconciliation pair | Two selected libraries whose inventories and selected metadata are compared to produce a previewed change set. |
| Direct play | The target device decodes the original stored file without server-side transcoding. |

## Target operating model

```text
Desktop RedShift                                      Raspberry Pi RedShift TV
----------------                                      ------------------------
Local library and local playback                      Pi-local library and catalog
Import/drop into selected library                     Fullscreen ten-foot UI
Persistent transfer queue  ── secure paired link ──>  Atomic ingest and local scans
Reconciliation preview    <── inventory/status ───>  Local queue/watch progress
Optional remote control   ── commands/status ─────>  mpv-backed HDMI playback
```

The Pi owns media that has reached its library root, its current queue, player clock, watch state, and HDMI output. The desktop can inspect and command those states when paired, but it is not their runtime dependency. Each endpoint keeps its own durable catalog; no endpoint directly shares or mutates another endpoint's SQLite database.

## Roadmap tracking table

Status vocabulary: `Foundation only` means related code exists but does not satisfy the package. `Discovery required` means an unresolved implementation decision blocks a build plan. `Not started` means no package implementation work exists.

| ID | Package | Classification | Scope and required outcomes | Dependencies | Current state | Measurable exit criteria |
| --- | --- | --- | --- | --- | --- | --- |
| M0 | Platform architecture and Pi feasibility spike | Discovery/decision | Confirm Pi model, RAM, storage, OS/display stack, remote-input method, media mount strategy, Electron-on-ARM viability, and `mpv` HDMI/hardware-decode behavior with representative files. Select the Pi runtime topology and record supported first-release codecs. | None | Discovery required | A tested Pi development image plays representative H.264/H.265 files over HDMI with audio, receives selected remote input, starts the chosen UI at boot, and has a recorded supported-format matrix. |
| M1 | Canonical media, library, and identity model | Build-ready only after M0 decisions | Replace the single music-path assumption with a library registry. Define stable library IDs, endpoint IDs, media-item IDs, content hashes, physical-file records, collection/season/episode metadata, and watch-state ownership. Preserve all current music behavior through migration. | M0 | Foundation only: `songs`, playlists, transfer history, and settings exist. | A local library can be registered, renamed, scanned, and reopened by ID; existing music imports and playback retain their current metadata and state. |
| M2 | Desktop local-video vertical slice | Build | Add a desktop Video area that scans a local library, shows video records, imports/drops supported files, plays locally, persists resume progress, and handles missing/unplayable files visibly. Begin with one clear direct-play format set from M0. | M1 | Not started | A local video can be imported, displayed with durable metadata, played, stopped, resumed, and removed/made unavailable without corrupting the library index. |
| M3 | Metadata, artwork, and video organization | Build plus vendor configuration | Add poster/backdrop storage, title/year/duration extraction, movie and TV grouping, season/episode ordering, recently added, and continue watching. Decide and configure a metadata provider and attribution/API-key handling. | M1, M2 | Foundation only: music artwork and MusicBrainz integrations exist. | Movies and episodic video have deterministic organization; malformed or incomplete metadata has a usable fallback; provider failures and offline scans remain usable. |
| M4 | Multiple-library desktop experience | Build | Add library registry UI and explicit controls for Browse library, Import destination, Playback target, and Reconcile pair. Ensure local libraries remain usable without any paired endpoint. | M1, M2 | Not started | The user can create/select two local libraries, browse either, import into either, and see which library each action affects without ambiguity. |
| M5 | Pi endpoint service, trust, and discovery | Build plus operational configuration | Implement a Pi-local service with endpoint identity, paired-device authentication, local inventory/status APIs, transfer APIs, and command/status channels. Use local-network trust first; evaluate Tailscale or equivalent for later remote access rather than exposing a public service. | M0, M1 | Foundation only: `ws` and a Doppler-specific pairing implementation exist. | A desktop can pair with a Pi without third-party Doppler infrastructure, persist the pairing, reject unauthorized requests, and recover a connection after either endpoint restarts. |
| M6 | Reliable library-to-library transfer | Build | Implement import-to-remote-library as a persistent queue with discovery of destination free space, resumable chunks, checksums, temporary-file staging, atomic promotion, idempotent retries, progress, cancellation, and restart recovery. | M1, M4, M5 | Foundation only: music sync has transfer history and some hashing. | A large file survives disconnect, desktop sleep, and Pi restart without duplicate final files; destination scan sees a file only after checksum verification and promotion. |
| M7 | Inventory comparison and reconciliation | Build | Compare any selected pair by library ID and content identity; report local-only, remote-only, equivalent-content/different-name, metadata-conflict, unavailable, and collision states. Provide a preview and explicit selected operations. Default to additive, non-destructive behavior until a separate mirror/deletion policy is approved. | M1, M4, M5, M6 | Not started | A reconciliation preview accurately classifies test inventories; applying selected additive actions is idempotent; no file is deleted or overwritten without explicit user confirmation. |
| M8 | Pi autonomous TV shell and input | Build plus operational configuration | Package and launch a fullscreen Pi UI on boot. Provide Home, Movies, TV Shows, Recently Added, Continue Watching, search, settings, error/empty/loading states, keyboard/Bluetooth navigation, and HDMI-CEC input if the selected hardware supports it. | M0, M1, M3, M5 | Not started | With the desktop offline, the Pi boots to a usable TV UI, navigates its local catalog with the selected remote input, and displays unavailable-media states clearly. |
| M9 | Pi HDMI playback adapter | Build | Integrate the M0-selected playback engine, expected to be `mpv` behind a local IPC boundary. Support local-file play/pause/seek/stop, queue ownership, fullscreen HDMI output, audio-track selection, subtitle selection, watch-progress checkpoints, end-of-item transitions, and decoder failures. | M0, M1, M8 | Not started | The Pi plays direct-play media locally over HDMI without desktop involvement; resume, seek, subtitle/audio selection, and interrupted/restarted player recovery work from the TV UI. |
| M10 | Desktop-to-Pi playback handoff and remote control | Build | Add a paired Pi as a playback target. Permit a desktop-browsed Pi item to play on TV, synchronize command acknowledgements and authoritative status, show disconnection safely, and leave Pi playback uninterrupted if the controller disconnects. | M4, M5, M8, M9 | Not started | Desktop can send play, pause, seek, queue, and stop commands to the paired Pi; status round-trips correctly; unplugging/closing desktop does not stop Pi playback. |
| M11 | Operational quality, packaging, and release gates | Build plus operational configuration | Add Pi install/update process, data-directory backup/restore, logging, health checks, storage-space warnings, database migration/recovery, automated tests, representative-media fixtures, and packaging for the selected Pi architecture. | M0–M10 as relevant | Not started | A clean Pi can be installed/restarted/upgraded without losing its library catalog or watch state; automated tests cover core contracts; manual TV acceptance pass succeeds. |
| M12 | Deferred advanced delivery | Deferred | Add codec-profile selection, server-side transcoding, remote internet access, user profiles, mobile video clients, advanced subtitle handling, downloads, and broader streaming-device support only after direct-play Pi/desktop functionality is stable. | M0–M11 | Deferred by scope | Separate approved packages define each feature's security, performance, licensing, and verification requirements. |

## Overall progress snapshot

| Measure | Current value | Definition |
| --- | --- | --- |
| Platform packages completed | 0 of 13 | M0–M12 count as completed only when their exit criteria are verified. |
| Packages in implementation | 0 | No work from this roadmap has begun. |
| Existing foundations | Desktop local music library, local audio player, SQLite state, file import, hashing in parts of sync, and WebSocket experience. | Foundations reduce discovery but are not counted as package completion. |
| First user-visible milestone | M2 | Local desktop video import, browse, play, and resume. |
| First independent-TV milestone | M8 + M9 | Pi boot-to-TV UI and local HDMI playback with no desktop dependency. |
| First distributed-library milestone | M5 + M6 + M7 | Paired Pi transfer queue and safe reconciliation preview. |

## Cross-package contract rules

- Files are immutable content for identity purposes. A content hash is authoritative for deduplication; names, paths, titles, artwork, and imported timestamps are metadata and may differ across libraries.
- Every transfer is staged outside the destination library's scanned final location, checksummed, and atomically promoted before inventory publication.
- Scanning the physical media root is the durable authority for a library's file availability. The database accelerates and enriches that inventory; it does not make missing local bytes playable.
- A successful transfer triggers destination rescan/indexing. Reconciliation never assumes a transfer completed merely because a command was sent.
- Reconciliation must distinguish file-content conflicts from metadata conflicts. It must preview every requested change before applying it.
- The Pi exposes commands and state; it never permits a desktop client to directly operate its filesystem or database.
- A command is acknowledged only after the Pi's local player/service accepts it. UI state must reconcile against the Pi's reported state rather than predicted timeouts.
- The initial network boundary is a trusted paired home network. Public routing, internet authentication, and encryption policy beyond the chosen local trust mechanism belong to a later approved package.

## Required decisions before implementation plans

| Decision | Why it gates work | Owner | Target package |
| --- | --- | --- | --- |
| Exact Pi model, RAM, boot medium, media-storage topology, and Raspberry Pi OS/display stack | Determines decoder performance, packaging architecture, boot behavior, and available storage semantics. | User, validated by M0 | M0 |
| Pi UI runtime: Electron reuse, fullscreen local web frontend, or another UI shell | Determines code sharing, ARM dependency strategy, GPU behavior, and packaging. | User after M0 evidence | M0/M8 |
| Pi player engine and supported first-release codec/container profile | Determines direct-play guarantees and whether a file can play without transcoding. | User after M0 evidence | M0/M9 |
| Library-root organization and ownership policy | Determines where imports land, whether media is copied or adopted in place, and how removable/network volumes are handled. | User | M1 |
| Reconciliation policy beyond additive transfer | Deletes, move/rename propagation, metadata precedence, and conflict resolution are destructive or product-significant choices. | User | M7 |
| Metadata provider and API credential/attribution approach | Determines vendor terms, poster/episode coverage, offline behavior, and shipping configuration. | User | M3 |
| Home-network trust approach and later remote-access posture | Determines pairing protocol, TLS/VPN needs, firewall exposure, and recovery behavior. | User | M5 |

## Verification map for future package plans

| Acceptance concern | Packages that must verify it | Minimum proof |
| --- | --- | --- |
| Current desktop music behavior remains intact | M1–M4 | Existing desktop test command from `RedShift_Desktop/package.json` plus targeted manual music scan, queue, and sync regression checks. |
| Desktop local video is useful without a Pi | M2–M4 | Import, play, pause, seek, resume, missing-file, malformed-file, long-file, and empty-library checks. |
| Pi works without desktop interaction | M8–M9 | Cold boot with desktop powered off; remote navigation; local play/resume/next; player restart and power-loss recovery. |
| Transfers never create corrupt or duplicate media | M6 | Checksum mismatch, interrupted upload, restart recovery, duplicate retry, insufficient storage, cancellation, and concurrent transfer tests. |
| Reconciliation is correct and safe | M7 | Empty, disjoint, duplicate-content/different-name, same-name/different-content, stale index, unavailable file, and explicit deletion-policy tests. |
| Remote control does not own Pi playback | M10 | Controller disconnect/reconnect while Pi plays; stale command; repeated command; Pi-side navigation while desktop status is open. |
| Pi operational release is repeatable | M11 | Fresh installation, data migration, upgrade, rollback/restore exercise, storage-full warning, and offline network behavior. |

## Explicit deferrals

- **iOS video playback:** deferred to a future mobile-media package. The library and endpoint contracts must remain transport-neutral so an iOS client can consume them later.
- **Transcoding:** deferred until direct-play device compatibility and actual media inventory prove it is required. The Pi hardware cannot be assumed to handle arbitrary real-time conversion acceptably.
- **Public internet access:** deferred in favor of an initially paired home-network service. A later package must choose VPN/Tailscale versus a hardened public service and define authentication/TLS requirements.
- **TV tuner, HDMI input/pass-through, and replacement of TV-native applications:** not part of the media-library appliance. The target is a Plex-style app running on one HDMI input.

## Roadmap self-audit

- `Self-audit: passed`
- All initial workstreams are packaged and classified as build, discovery/decision, operational/vendor configuration, or deferred.
- Current code foundations and material gaps are documented without claiming they satisfy future packages.
- Every package has dependencies, current status, and measurable exit criteria.
- Settled product decisions are explicit, and unresolved decisions are surfaced as gates rather than hidden implementation assumptions.
- The roadmap records source-of-truth, offline operation, transfer integrity, reconciliation, recovery, and stale-state rules.
- This document intentionally contains no file-edit anchors or incomplete implementation snippets because it is a tracking roadmap; future build packages require their own implementation-ready plans.
