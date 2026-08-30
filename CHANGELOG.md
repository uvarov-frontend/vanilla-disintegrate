# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/uvarov-frontend/vanilla-disintegrate/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/uvarov-frontend/vanilla-disintegrate/releases/tag/v1.0.0
