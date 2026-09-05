# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-09-05

### Added

- Persistent configuration with `config`, `config get`, `config set`, and `config reset` commands.
- Live playback watch mode for `now` and `play` with configurable refresh intervals.
- Absolute and relative volume control.
- Spotify Connect device listing and playback transfer.
- Absolute and relative seek controls.
- Playback queue viewing and track search-to-queue.

### Changed

- Automatically target the only controllable Spotify device when playback has no active device.
- Track granted OAuth scopes and request reauthorization when a release requires new permissions.
- Derive the CLI version from `package.json` to keep npm packages and release tags synchronized.

## [0.1.0] - 2026-09-04

### Added

- Authorization Code with PKCE login, logout, and authentication status.
- Secure local credential storage and automatic access-token refresh.
- Current playback display.
- Track search and interactive track selection.
- Play, pause, resume, next, and previous playback commands.
- Spotify API error mapping, request timeouts, and rate-limit backoff.
