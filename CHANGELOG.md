# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-09-06

### Added

- Album, artist, and playlist discovery with guided interactive playback actions.
- Explicit track, album, artist, and playlist context playback through `spoti play <type>`.
- User playlist listing and deterministic numeric playlist selection.
- Shuffle and repeat playback controls.
- Liked-track listing plus commands to like or unlike the current track.
- Recently played track history.
- Cached, non-blocking npm update notifications and explicit `spoti update --check` and confirmed `spoti update` commands.
- Persistent Spotify client ID setup through `spoti setup` and `spoti config set spotifyClientId`.
- Numeric Spotify Connect device selection.

### Changed

- Sort devices and user playlists deterministically so displayed numbers remain stable across commands.
- Prefer `SPOTIFY_CLIENT_ID` when present, then fall back to the locally stored client ID.
- Request only the additional scopes needed for private playlists, library access, and recently played tracks.
- Use current Spotify playlist item endpoints and response fields instead of deprecated variants.

### Fixed

- Accept successful playback mutations when Spotify returns an undocumented non-JSON response body.
- Handle episodes, local tracks, unavailable items, null playlist entries, and future unknown playback item types safely.
- Install the exact npm version confirmed by the update check instead of a mutable dist-tag.

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
