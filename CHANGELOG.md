# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.9.0] - 2026-09-12

### Added

- A responsive static project website for `spoti.bzenky.dev`, including installation, Spotify setup, CLI/TUI examples, limitations, privacy information, and LRCLIB attribution.
- Vercel static-site configuration with clean URLs and restrictive browser security headers.
- Structured LRCLIB search fallback when exact metadata lookup does not find lyrics.

### Changed

- Accept fallback lyrics only when normalized title, primary artist, album, and duration produce a strong, unambiguous match.
- Refresh Spotify playback at the normal bounded interval while Lyrics is open so track changes load the new song's lyrics automatically.
- Refresh playback immediately when returning to Player while preserving single-flight polling and quota-aware pauses.
- Point the npm package homepage and README website link to `https://spoti.bzenky.dev`.

### Fixed

- Reject weak, incorrect-version, and ambiguous LRCLIB fallback results instead of displaying potentially unrelated lyrics.

## [0.8.0] - 2026-09-11

### Added

- LRCLIB lyrics for the current track or a Spotify search result through `spoti lyrics`, its `spoti ly` alias, and `--first` selection.
- A TUI Lyrics screen opened with `y`, including synchronized current-line highlighting, automatic following, manual scrolling, and retry controls.
- Defensive LRCLIB response validation, client identification, request cancellation, a ten-second timeout, bounded `429`/`503` retries, and a session-only lyrics cache.
- Visible LRCLIB attribution and documentation describing metadata sharing, availability, and lyric-content licensing limitations.

### Changed

- Continue advancing the local playback clock while synchronized lyrics are open without polling Spotify outside the Player screen.
- Add lyrics commands and aliases to Bash, Zsh, and Fish completion scripts.

### Fixed

- Run POSIX file-permission assertions only on platforms that expose POSIX permission semantics.
- Increase the Vitest timeout budget for slower Ink tests on Windows CI while retaining bounded test execution.

## [0.7.0] - 2026-09-10

### Added

- A full Ink-based terminal UI through `spoti interactive` and `spoti i`, with dedicated Player, Search, Queue, Devices, Library, and Help screens.
- Keyboard playback controls for play/pause, track navigation, seeking, volume, shuffle, repeat, and manual refresh.
- Responsive list viewports, compact narrow-terminal layouts, grapheme-safe query editing, and scrollable shortcut help.
- Cross-platform CI coverage for Node.js 22 on Linux, macOS, and Windows, plus Node.js 24 compatibility coverage on Linux.

### Changed

- Replace the previous interactive-search-only mode with the complete TUI while preserving every command-driven CLI workflow.
- Require Node.js 22 or newer and update Ink, React, Commander, TypeScript, Vitest, ESLint, and related tooling.
- Keep Search and Library pages cached while navigating between TUI screens.
- Update queue additions, device transfers, and deterministic Player controls optimistically to avoid unnecessary Spotify state requests.
- Cache credentials in memory during a running process and coordinate short rate-limit cooldowns across concurrent API requests.
- Use `npm.cmd` for self-updates on Windows and document PowerShell environment configuration.

### Fixed

- Cancel stale playback, search, queue, device, library, and watch-mode requests when changing screens or exiting.
- Prevent overlapping Player polls and repeated manual refresh requests, and stop automatic polling after Spotify development quota exhaustion until a manual retry.
- Avoid redundant token refreshes when a delayed `401` response arrives after another request already refreshed the access token.
- Restore alternate-screen and cursor state after TUI or watch-mode termination signals.
- Keep long Spotify metadata within terminal bounds and provide a minimum-size fallback for very small terminals.

## [0.6.0] - 2026-09-08

### Added

- Lazy, cached `n`/`p` pagination for artist albums, playlists, playlist tracks, liked tracks, and recently played tracks.
- Direct track selection from playlist details and Back navigation throughout the nested artist-album flow.
- Current-volume output when `spoti volume` or `spoti vol` is run without a value.
- `alb`, `art`, and `sk` aliases for album, artist, and seek commands.

### Changed

- Show visible progress while `spoti play <query>` searches Spotify and document that ordinary multi-word queries do not require quotes.
- Order each artist-album page newest-first and fetch additional pages only when requested.
- Preserve Spotify playlist order so global displayed numbers can resolve playlists beyond the first page.
- Treat collection `--limit` values as page sizes while keeping search capped at 10 results.

### Fixed

- Stop long Spotify `Retry-After` windows from holding the terminal on a spinner; waits over five seconds now produce an immediate human-readable rate-limit message.
- Make network, timeout, malformed-response, and temporary Spotify server failures provide actionable retry guidance.
- Enforce safe offset and mutually exclusive cursor pagination without following Spotify-provided continuation URLs.

## [0.5.0] - 2026-09-07

### Added

- TTY-aware semantic terminal styling with `NO_COLOR` support and safe normalization of Spotify-provided text.
- Optional numbered playback selection after listing playlists, liked tracks, or recently played tracks.
- Current-state output when `spoti shuffle` or `spoti repeat` is run without a value.

### Changed

- Make interactive search editable, cache results for the active query, and allow retries after temporary search or playback failures.
- Cancel in-flight interactive requests immediately on `Esc` or `Ctrl+C`, including device discovery, rate-limit waits, and response parsing.
- Prefer an active controllable device during playback fallback and preserve request parameters when retrying playback.
- Report an empty queue when Spotify returns only repeated copies of the current track.

### Fixed

- Restore terminal state reliably after interactive completion, cancellation, setup errors, and cleanup failures.
- Validate numbered prompts with a clear error and retry instead of silently accepting invalid input.
- Report unknown commands explicitly and tighten Spotify API error, rate-limit, and external-text handling.

## [0.4.0] - 2026-09-06

### Added

- Keyboard-driven multi-category search through `spoti interactive` and its `spoti i` alias.
- Short aliases for common playback, search, queue, device, playlist, and library commands.
- Static Bash, Zsh, and Fish completion scripts through `spoti completion <shell>`.
- TTY-only loading indicators for interactive network operations.
- `spoti config path` for locating the active configuration file.
- `spoti config unset <key>` for resetting one setting without clearing the full configuration.

### Changed

- Show the complete command overview when `spoti` is run without a command.
- Upgrade GitHub Actions checkout and Node setup actions to their Node 24-based releases.

### Fixed

- Restore terminal input and screen state after interactive search exits, is cancelled, or encounters an error.
- Stop interactive search from keeping the Node.js process alive after the terminal UI closes.

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
