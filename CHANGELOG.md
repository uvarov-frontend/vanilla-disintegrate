# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- A reproducible `vanilla-disintegrate-iife.zip` with a minimal local example, built-in audio, and required licenses for direct CDN download.
- Complete visual-and-audio presets through `preset`, `definePreset()`, and `builtInPresets`.
- A dedicated `vanilla-disintegrate/sounds` entry with stable `dust`, `scatter`, `vapor`, and `wind` source identifiers.
- Local `Blob`/`File` and typed-array audio sources, plus browser-only custom-audio storage in the playground.
- Independent particle curve and geometry controls through `createParticleEffect()` and `particlePresets`.

### Changed

- Retime the `dust` preset to a shorter, tighter fall: 850 ms with 130 ms of stagger and a 0.55 end scale.
- Require every `Disintegrator` instance to choose exactly one complete `preset` or one object-valued custom `effect`; there is no implicit default.
- Make built-in presets audible by default and allow them to be muted only with `sound: false`; custom effects remain silent until given an explicit remove/restore sound pair.
- Decouple audio from visual effect phases, rename playback `gain` to `volume`, and use `sounds` for audio preparation selections.
- Align the four built-in preset and sound identifiers as `dust`, `scatter`, `vapor`, and `wind`, and remove the obsolete `crackle`, `whoosh`, and `snap` sound names.
- Use idle audio preparation by default and keep encoded sound files as separate cacheable assets instead of embedding them into JavaScript.

### Fixed

- Point both phases at the shared particle constant in the playground's generated code when removal and restoration match, instead of emitting `remove` alone and leaning on its implicit fallback.
- Keep two stored playground sounds that share a file name distinct in generated code, and percent-encode the name so spaces or a `#` cannot truncate the `new URL()` path.
- Split large particle fields across bounded vertex buffers so Safari renders the full element height instead of truncating horizontal trails after the first GPU buffer segment.
- Rasterize high-density SnapDOM captures at their physical size on Safari so WebKit does not enlarge a low-resolution `foreignObject` image and blur particle frames.
- Upload particle records in reverse source order to avoid Safari's order-dependent WebGL artifact that drew a vertical strip along the element's left edge.
- Clip default SnapDOM captures to the measured element bounds so particle snapshots are neither stretched nor offset when CSS minimum sizes exceed the content size.
- Read particle dissolve thresholds through a texel-centre sample instead of `texelFetch`, so Firefox no longer fades blocks that should still be intact and leaves dark gaps across the element during removal and restoration.
- Resume the shared `AudioContext` on the first user gesture, so Safari no longer plays a silent first animation or drops audio for operations started from a timer, an observer, or after an `await`.
- Decode prepared audio through an `OfflineAudioContext`, so background preparation no longer constructs a playback context before the page has been interacted with. The playback context is created during the gesture instead, which browsers start in `running`.

## [1.1.4] - 2026-08-30

### Fixed

- Made inline `style` mutations invalidate stale prepared snapshots without scheduling a new capture on every animation frame. The next operation captures the current rendered state, while added nodes, edited text, and other attributes continue to trigger background preparation.
- Refused an already-aborted SnapDOM capture before starting its non-cancellable pipeline.

## [1.1.3] - 2026-08-30

### Added

- Dedicated `/core` and `/particles` entry points so custom effects do not pull WebGL, built-in sounds, or SnapDOM into their module graph.
- Shared, reference-counted audio preparation with deterministic cleanup and bounded decoded-buffer caching.
- Core lifecycle coverage across current desktop and mobile Chromium, Firefox, and WebKit profiles, real WebGL2 renderer coverage in Chromium profiles, unit coverage thresholds, and reproducible-build verification.
- Direct layout-animation coverage for grid cleanup, delayed cancellation, and overlapping removals.
- Explicit third-party notices, a security policy, privacy pages, and user controls for documentation analytics.

### Changed

- Hardened concurrent operations, cancellation, setup failures, custom audio playback, and WebGL cleanup against leaked resources or unsettled promises.
- Made element preparation reference-counted and extended operation results with the non-mutating `rejected` status.
- Made rejected concurrent handles wait for the element's active owner before settling.
- Enforced decoded-audio LRU budgets per instance while retaining cross-instance buffer deduplication.
- Reduced particle setup and memory churn with exact typed-array allocation, block-resolution threshold textures, and cached shader, buffer, and vertex-array state.
- Replaced per-operation WebGL context destruction with an idle-prewarmed, document-scoped pool that retains at most two idle contexts for 30 seconds.
- Raised the documented API baseline to Chrome and Edge 84+, Firefox 75+, Opera 70+, and Safari 15+.
- Reduced package weight while preserving usable source maps, the CDN build, eager audio preparation, and TypeScript sources.
- Hardened release and deployment workflows with immutable action references, artifact verification, staged health checks, and rollback.

### Fixed

- Stabilized transparent WebGL particle canvases on mobile GPU compositors without changing particle motion or timing.
- Detached pooled canvases between overlays so sequential particle operations remain visible.

## [1.0.0] - 2026-08-29

### Added

- Paired `remove()` and `restore()` operations with four built-in visual effects.
- Retained-element controls: `take()`, `discard()`, `discardAll()`, and instance cleanup through `destroy()`.
- User-defined effect pairs, opt-in audio, pluggable capture, and bounded visible-idle snapshot preparation for registered elements.
- Immediate or idle audio preparation, explicit decoded-cache controls, and synchronized first playback.
- Two entry points: the dependency-free core `vanilla-disintegrate`, and `vanilla-disintegrate/snapdom` with SnapDOM wired as the default `capture` through an optional peer dependency.
- ESM and IIFE builds, TypeScript declarations, browser smoke tests, and SSR documentation in four languages.

### Changed

- Reworked the public runtime around explicit DOM removal and restoration.
- Removed obsolete `disintegrate()` and `/core` entry points.

[Unreleased]: https://github.com/uvarov-frontend/vanilla-disintegrate/compare/v1.1.4...HEAD
[1.1.4]: https://github.com/uvarov-frontend/vanilla-disintegrate/compare/v1.1.3...v1.1.4
[1.1.3]: https://github.com/uvarov-frontend/vanilla-disintegrate/compare/72cdbf64be5b2c658cc219d2ff5d0ce8ecc08ef0...v1.1.3
[1.0.0]: https://github.com/uvarov-frontend/vanilla-disintegrate/tree/72cdbf64be5b2c658cc219d2ff5d0ce8ecc08ef0
