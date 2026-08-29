# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0] - 2026-08-29

### Added

- Paired `remove()` and `restore()` operations with four built-in visual effects.
- Retained-element controls: `take()`, `discard()`, `discardAll()`, and instance cleanup through `destroy()`.
- User-defined effect pairs, opt-in audio, pluggable capture, and opt-in snapshot preparation.
- Two entry points: the dependency-free core `vanilla-disintegrate`, and `vanilla-disintegrate/snapdom` with SnapDOM wired as the default `capture` through an optional peer dependency.
- ESM and IIFE builds, TypeScript declarations, browser smoke tests, and SSR documentation in four languages.

### Changed

- Reworked the public runtime around explicit DOM removal and restoration.
- Removed obsolete `disintegrate()` and `/core` entry points.

[Unreleased]: https://github.com/uvarov-frontend/vanilla-disintegrate/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/uvarov-frontend/vanilla-disintegrate/releases/tag/v1.0.0
