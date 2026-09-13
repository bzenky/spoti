# Spoti Project Plan

A local-first command-line client for controlling Spotify from the terminal.

The main idea is to build a keyboard-first Spotify experience for developers who spend most of their day in the terminal.

## 1. Project Goal

Build a CLI that can:

- Authenticate with Spotify
- Search for music
- Play tracks, albums, artists, and playlists
- Pause and resume playback
- Skip to the next or previous track
- Show the currently playing track
- Manage the queue
- Control volume, shuffle, repeat, and seek
- Select the Spotify playback device
- Eventually provide an interactive terminal UI

Spotify itself will remain responsible for audio playback.

The CLI will control an active Spotify client through the Spotify Web API and Spotify Connect.

---

## 2. Recommended Stack

### Core

- Node.js
- TypeScript
- Spotify Web API
- Native `fetch`
- Commander.js

### CLI Interaction

- Inquirer or Clack
- Chalk
- Ora

### Validation

- Zod

### Testing

- Vitest

### Future TUI

- Ink
- React

---

## 3. Project and Command Name

Project name:

```text
spoti
```

Executable name:

```bash
spoti
```

Example usage:

```bash
spoti play "Numb"
spoti pause
spoti next
spoti now
```

---

## 4. High-Level Architecture

```text
CLI
 │
 ▼
Commands
 │
 ▼
Application Services
 │
 ├── AuthService
 ├── PlayerService
 ├── SearchService
 ├── DeviceService
 ├── QueueService
 └── LibraryService
 │
 ▼
Spotify Client
 │
 ▼
Spotify Web API
```

The CLI commands should not call Spotify endpoints directly.

This separation will make it easier to:

- test business logic
- reuse the services in an interactive TUI
- change the terminal library later
- handle Spotify API errors consistently

---

## 5. Suggested Folder Structure

```text
spoti/
├── src/
│   ├── cli.ts
│   │
│   ├── commands/
│   │   ├── login.ts
│   │   ├── logout.ts
│   │   ├── play.ts
│   │   ├── pause.ts
│   │   ├── next.ts
│   │   ├── previous.ts
│   │   ├── now.ts
│   │   ├── search.ts
│   │   ├── queue.ts
│   │   ├── volume.ts
│   │   └── devices.ts
│   │
│   ├── services/
│   │   ├── auth.service.ts
│   │   ├── player.service.ts
│   │   ├── search.service.ts
│   │   ├── queue.service.ts
│   │   └── device.service.ts
│   │
│   ├── spotify/
│   │   ├── client.ts
│   │   ├── endpoints.ts
│   │   ├── scopes.ts
│   │   └── types.ts
│   │
│   ├── storage/
│   │   ├── config.ts
│   │   └── credentials.ts
│   │
│   ├── ui/
│   │   ├── prompts.ts
│   │   ├── output.ts
│   │   └── progress.ts
│   │
│   ├── utils/
│   │   ├── errors.ts
│   │   └── time.ts
│   │
│   └── types/
│
├── tests/
├── package.json
├── tsconfig.json
├── eslint.config.js
├── README.md
└── .gitignore
```

---

# 6. Authentication

Use Spotify OAuth Authorization Code with PKCE.

## Login flow

```text
spoti login
    │
    ▼
Generate PKCE verifier
    │
    ▼
Generate challenge
    │
    ▼
Start temporary local HTTP server
    │
    ▼
Open Spotify authorization page
    │
    ▼
User authorizes application
    │
    ▼
Spotify redirects to local callback
    │
    ▼
CLI receives authorization code
    │
    ▼
Exchange code for tokens
    │
    ▼
Save refresh token locally
```

Example callback:

```text
http://127.0.0.1:43821/callback
```

Avoid using `localhost` for the Spotify redirect URI.

---

## 7. Token Storage

Initial implementation:

```text
~/.config/spoti/
├── config.json
└── credentials.json
```

Example:

```json
{
  "refreshToken": "...",
  "accessToken": "...",
  "expiresAt": 1780000000
}
```

Later, credentials can be migrated to:

- macOS Keychain
- Linux Secret Service
- Windows Credential Manager

The CLI should automatically refresh expired access tokens.

---

# 8. Spotify Scopes

Start with:

```text
user-read-playback-state
user-read-currently-playing
user-modify-playback-state
```

Later add scopes for:

- saved tracks
- recently played music
- playlists
- user library

Only request scopes when features actually require them.

---

# 9. MVP

Version `0.1` should remain intentionally small.

## Authentication

```bash
spoti login
spoti logout
spoti status
```

## Playback

```bash
spoti play
spoti pause
spoti resume
spoti next
spoti previous
```

Aliases:

```bash
spoti n
spoti prev
```

## Current Track

```bash
spoti now
```

Example output:

```text
▶ Breaking the Habit

Linkin Park
Meteora

2:14 ━━━━━━━━━━━━━━━────── 3:16
```

## Search

```bash
spoti search "Breaking the Habit"
```

Example:

```text
1. Breaking the Habit — Linkin Park
2. Breaking the Habit - Live — Linkin Park
3. Breaking the Habit - Demo — Linkin Park

Select: 1
```

## Search and Play

```bash
spoti play "Breaking the Habit"
```

Expected flow:

```text
query
  ↓
search Spotify
  ↓
select best match
  ↓
find active playback device
  ↓
start playback
```

---

# 10. Command Design

## Playback

```bash
spoti play
spoti pause
spoti resume
spoti next
spoti previous
```

## Search

```bash
spoti search "Numb"
```

## Direct Play

```bash
spoti play "Numb"
```

## Explicit Search Type

```bash
spoti play track "Numb"
spoti play artist "Linkin Park"
spoti play album "Meteora"
spoti play playlist "Rock Classics"
```

Later, the CLI can infer the type automatically.

---

# 11. Version 0.2

Add player controls.

## Queue

```bash
spoti queue "Faint"
spoti queue "Numb"
spoti queue
```

## Volume

```bash
spoti volume 50
spoti volume +10
spoti volume -10
```

## Seek

```bash
spoti seek 1:30
spoti seek +30
spoti seek -10
```

## Devices

```bash
spoti devices
```

Example:

```text
1. MacBook Pro        active
2. iPhone
3. Living Room TV
```

Switch device using the displayed number, exact name, or Spotify device ID:

```bash
spoti device 1
spoti device "MacBook Pro"
```

## Configuration and Watch Mode

```bash
spoti config
spoti config set watchAfterPlay true
spoti now --watch
spoti play "Numb" --watch
```

---

# 12. Version 0.3

Add Spotify content and library features.

## Albums

```bash
spoti album "Meteora"
spoti play album "Meteora"
```

After inspecting an album in an interactive terminal, choose whether to play the entire album, select an individual track, or return without starting playback.

## Artists

```bash
spoti artist "Linkin Park"
spoti play artist "Linkin Park"
```

After inspecting an artist, choose whether to play the artist context, select one of the artist’s albums, or return without starting playback.

## Playlists

```bash
spoti playlists
spoti playlist 1
spoti playlist "Workout"
spoti play playlist 1
spoti play playlist "Workout"
```

Playlists preserve Spotify’s order so global displayed numbers work across paginated `spoti playlists`, `spoti playlist <number>`, and `spoti play playlist <number>`. After selecting a playlist interactively, choose whether to start playlist playback or return without starting playback.

## Shuffle and Repeat

These controls become useful once `spoti` can start album, artist, and playlist contexts.

```bash
spoti shuffle on
spoti shuffle off
spoti repeat off
spoti repeat track
spoti repeat context
```

## Library

```bash
spoti liked
spoti like
spoti unlike
```

## Recently Played

```bash
spoti recent
```

## Update Notifications

Periodically check npm for a newer `@bzenky/spoti` version without slowing down normal commands.

- Run the check in a non-blocking way
- Cache the result and check at most once every 24 hours
- Do not display anything when the installed version is current or the check fails
- When an update exists, show the installed and latest versions with the upgrade command:

```text
Update available: 0.2.0 → 0.3.0
Run: spoti update
```

Explicit commands:

```bash
spoti update --check
spoti update
```

`spoti update --check` only checks npm. `spoti update` requests confirmation before running the npm global installation; it never updates silently.

---

# 13. Version 0.4

Focus on CLI experience.

## Fuzzy Search

Running `spoti` with no arguments shows the full command overview. Interactive search is explicit:

```bash
spoti interactive
spoti i
```

This opens:

```text
Search Spotify

> numb

Tracks

▶ Numb
  Linkin Park · Meteora

  Numb / Encore
  JAY-Z · Collision Course
```

Keyboard controls:

```text
↑ / ↓   select
Enter   search or play
Tab     change result category
Esc     close
```


## Shell Completions

```bash
spoti completion bash
spoti completion zsh
spoti completion fish
```

Completion scripts are static and never invoke Spotify or contact the network.

## CLI Polish

- TTY-only loading indicators for network operations
- No-argument command overview instead of forcing an interactive mode
- Short command aliases such as `i`, `p`, `pa`, `np`, `q`, `s`, `dev`, `pls`, and `rec`
- `spoti config path`
- `spoti config unset <key>`
- GitHub Actions upgraded to Node 24-based action runtimes

---

# 14. Version 0.5

Focus on terminal presentation, interactive search usability, and playback reliability.

## Terminal Presentation

- Apply restrained semantic styling to names, metadata, headings, and progress in interactive terminals.
- Keep redirected output plain and respect the standard `NO_COLOR` environment variable.
- Normalize Spotify-provided text before writing it to the terminal.

## Interactive Search Polish

- Allow query editing after results are displayed.
- Keep temporary search and playback errors inside the interface so users can retry.
- Cache category results for the active query during the session.
- Print a durable playback confirmation after restoring the terminal screen.
- Let users select and play a numbered item after viewing playlists, liked songs, or recent history.
- Preserve terminal state when setup, rendering, search, playback, or cleanup fails.

## Reliability

- Show the current shuffle or repeat state when its command is run without a value.
- Normalize Spotify's repeated-current-track placeholder into an empty queue.
- Prefer the one active controllable device during playback fallback, then the only controllable device.
- Preserve request parameters when retrying playback against a selected device.
- Restrict no-active-device error mapping to playback-control endpoints and matching Spotify errors.
- Normalize rate-limit retry information and sanitize externally supplied error text.
- Report unknown commands explicitly instead of treating them as excess arguments.
- Expand formatter, interactive-search, player fallback, and Spotify client tests.

The compact `now` output and `open` command are intentionally not part of this release.

---

# 15. Version 0.6

Collect reliability and documentation improvements discovered during daily use.

- Show visible progress while `spoti play <query>` searches Spotify.
- Make network, timeout, malformed-response, and temporary Spotify server failures actionable with an explicit retry message.
- Bound automatic rate-limit waits to five seconds and report longer `Retry-After` windows immediately in human-readable form.
- Document that quotes are optional for ordinary multi-word queries and needed only when required by shell syntax.
- Show the active device volume when `spoti volume` or `spoti vol` is run without a value.
- Add `alb`, `art`, and `sk` aliases for album, artist, and seek.
- Order each lazily loaded artist-album page by release date, newest first.
- Support Back navigation from a selected artist album to the cached album list, and from the album picker to the artist actions.
- Add lazy, cached `n`/`p` pagination with global numbering for artist albums, playlists, playlist tracks, liked tracks, and recently played tracks.
- Use Spotify offset pagination for collections and cursor pagination for recent history without following API-provided URLs.
- Keep search intentionally capped at 10 results and non-interactive collection output limited to the first page.

---

# 16. Version 1.0

Version `1.0.0` will add a proper interactive TUI using Ink while preserving the existing command-driven CLI.

```text
spoti <command>      → run a quick command and exit
spoti                → show the command overview
spoti --help         → show the command overview
spoti interactive    → open the TUI in an interactive terminal
spoti i              → open the TUI using its short alias
```

The `interactive` command replaces the pre-v1 standalone interactive search. Search is available inside the TUI with `/`. When stdin or stdout is not interactive, `spoti interactive` must print command help rather than attempting to start Ink.

## TUI experience

```text
┌──────────────── Spotify ────────────────┐
│                                        │
│ ▶ Breaking the Habit                   │
│   Linkin Park                          │
│   Meteora                              │
│                                        │
│ 2:14 ━━━━━━━━━━━━━━━─────── 3:16       │
│                                        │
│ [space] Play/Pause                     │
│ [n]     Next                           │
│ [p]     Previous                       │
│ [q]     Queue                          │
│ [/]     Search                         │
│ [d]     Devices                        │
│                                        │
└────────────────────────────────────────┘
```

Initial component structure:

```text
TuiApp
├── PlayerScreen
│   ├── TrackInfo
│   ├── ProgressBar
│   └── PlaybackControls
├── SearchScreen
│   ├── SearchInput
│   └── SearchResults
├── QueueScreen
├── LibraryScreen
└── DeviceScreen
```

The TUI scope includes:

- current playback and progress
- play/pause, next, previous, seek, volume, shuffle, and repeat controls
- multi-category search and playback
- queue display and queue additions
- device listing and transfer
- playlist, liked-track, and recent-history browsing
- lazy pagination and cached pages
- documented keyboard shortcuts and visible loading/error states
- bounded automatic playback refresh
- cancellation and reliable terminal cleanup on success, failure, and signals
- graceful behavior in narrow terminals and with `NO_COLOR`

## Quota and reliability readiness

Before release:

- distinguish a normal HTTP `429` from Spotify development `QUOTA_EXCEEDED`
- retain and safely parse Spotify error reasons and messages
- audit every TUI screen for duplicate or eager requests
- pause or reduce polling when the TUI is hidden, idle, or receiving rate-limit responses
- keep collection loading lazy and cache data only for the active session
- document development-mode quota behavior and why each user supplies a client ID
- validate authentication, refresh, installation, update, and terminal cleanup flows
- preserve the behavior and tests of all existing CLI commands

## Companion website

A small static website is useful for discovery and onboarding, but is not a blocker for `1.0.0`. It should be built after the TUI is visually stable so it can include accurate screenshots or a short recording.

The first website should remain intentionally small:

- landing page and concise product explanation
- npm installation and Spotify application setup
- command and keyboard-shortcut examples
- TUI screenshot or recording
- Spotify Connect, Premium, and quota limitations
- links to npm, GitHub, issues, releases, privacy information, and the Spotify attribution notice

Deploy the static site to Vercel at `spoti.bzenky.dev` with no backend, accounts, analytics, Spotify tokens, or duplicated full documentation. The repository README remains the detailed source of truth.

---

# 17. Core Services

## AuthService

Responsibilities:

```ts
login()
logout()
getAccessToken()
refreshAccessToken()
isAuthenticated()
```

---

## PlayerService

```ts
play()
playTrack(uri)
playContext(uri)
pause()
resume()
next()
previous()
seek(position)
setVolume(volume)
setShuffle(enabled)
setRepeat(mode)
getCurrentPlayback()
```

---

## SearchService

```ts
search(query)
searchTracks(query)
searchAlbums(query)
searchArtists(query)
searchPlaylists(query)
```

---

## QueueService

```ts
getQueue()
addTrack(uri)
```

---

## DeviceService

```ts
getDevices()
getActiveDevice()
transferPlayback(deviceId)
```

---

# 18. Spotify Client

Create a single wrapper around Spotify HTTP requests.

Example API:

```ts
spotify.get("/me/player")
spotify.put("/me/player/play")
spotify.post("/me/player/next")
spotify.get("/search")
```

Responsibilities:

- authorization headers
- token refresh
- request serialization
- Spotify API errors
- rate limits
- retry behavior

Commands should never need to know how authentication works.

---

# 19. Error Handling

Create friendly CLI errors.

Instead of:

```text
Spotify API returned HTTP 404
```

show:

```text
No active Spotify device found.

Open Spotify on one of your devices and try again.
```

Other cases:

```text
Authentication expired.
Run:

spoti login
```

```text
No tracks found for "asdfxyz".
```

```text
Spotify Premium is required for playback control.
```

---

# 20. Configuration

Example:

```text
~/.config/spoti/config.json
```

```json
{
  "spotifyClientId": "your-client-id",
  "watchAfterPlay": false,
  "refreshIntervalMs": 1000
}
```

The Spotify client ID is public application metadata. Tokens remain isolated in `credentials.json`, and client secrets are never accepted or stored.

CLI commands:

```bash
spoti setup
spoti config
spoti config get spotifyClientId
spoti config set spotifyClientId "your-client-id"
spoti config set watchAfterPlay true
spoti config set refreshIntervalMs 2000
```

---

# 21. Developer Experience

Useful scripts:

```json
{
  "scripts": {
    "dev": "tsx src/cli.ts",
    "build": "tsc",
    "test": "vitest",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit"
  }
}
```

During development:

```bash
npm run dev -- play "Numb"
```

Later install globally:

```bash
npm link
```

Then:

```bash
spoti play "Numb"
```

---

# 22. Testing Strategy

Do not test Spotify itself.

Test your logic around the Spotify API.

## Unit Tests

Test:

- query parsing
- track selection
- duration formatting
- config parsing
- token expiration
- error mapping
- command arguments

Example:

```ts
expect(formatDuration(134000)).toBe("2:14")
```

## Service Tests

Mock the Spotify client.

Example:

```ts
spotifyClient.search.mockResolvedValue(...)
```

Then test:

```ts
await searchService.searchTracks("Numb")
```

## CLI Tests

Test command behavior without making real API calls.

---

# 23. Nice-to-Have Features

After the core project works:

### Lyrics

```bash
spoti lyrics
```

Implemented through LRCLIB because Spotify's public API does not expose full song lyrics. Lyrics are fetched only when requested, cached only in memory for the running process, attributed to LRCLIB, and shown as synchronized lines in the TUI when timing data is available.

### History

```bash
spoti history
```

### Favorites

```bash
spoti like
spoti unlike
```

### Open Spotify

```bash
spoti open
```

Open the current track in the Spotify application.


---

# 24. Potential Shell Integration

Example:

```bash
alias sn="spoti now"
alias sp="spoti pause"
alias ss="spoti search"
```

Or:

```bash
spoti now --short
```

Output:

```text
▶ Linkin Park - Numb
```

This could be used in a terminal prompt or status bar.

---

# 25. Development Roadmap

## Phase 1 — Bootstrap

- [x] Create repository
- [x] Initialize Node.js project
- [x] Configure TypeScript
- [x] Configure ESLint
- [x] Configure Vitest
- [x] Add Commander
- [x] Create CLI executable
- [x] Implement `spoti --help`

---

## Phase 2 — Authentication

- [x] Create Spotify developer application
- [x] Configure redirect URI
- [x] Implement PKCE
- [x] Start local callback server
- [x] Open browser automatically
- [x] Exchange authorization code
- [x] Save tokens
- [x] Implement token refresh
- [x] Implement `spoti login`
- [x] Implement `spoti logout`
- [x] Implement `spoti status`

---

## Phase 3 — Spotify Client

- [x] Create HTTP client
- [x] Add Bearer authentication
- [x] Add automatic token refresh
- [x] Add Spotify API error mapping
- [x] Add bounded rate-limit handling

---

## Phase 4 — Playback

- [x] Get current playback state
- [x] Implement `spoti now`
- [x] Implement pause
- [x] Implement resume
- [x] Implement next
- [x] Implement previous

---

## Phase 5 — Search

- [x] Search tracks
- [x] Format search results
- [x] Add interactive selection
- [x] Implement `spoti search`
- [x] Implement `spoti play <query>`

At this point the MVP is complete.

---

## Phase 6 — Player Controls

- [x] Configuration
- [x] Watch mode
- [x] Volume
- [x] Seek
- [x] Device listing
- [x] Device switching
- [x] Automatic single-device fallback
- [x] Queue management
- [x] Shuffle
- [x] Repeat

---

## Phase 7 — Spotify Library

- [x] Albums
- [x] Artists
- [x] Playlists
- [x] Liked songs
- [x] Recently played tracks

---

## Phase 8 — CLI Polish

- [x] Cached, non-blocking npm update notifications
- [x] Explicit `spoti update --check` and confirmed `spoti update`
- [x] Interactive multi-category search — replaced by the full TUI in v1
- [x] aliases

- [x] TTY-only loading indicators
- [ ] JSON output — deferred until a concrete scripting use case exists
- [x] shell completions
- [x] config path and per-key reset
- [x] Node 24-based GitHub Actions

---

## Phase 9 — CLI UX and Reliability

- [x] TTY-aware semantic formatting with `NO_COLOR` support
- [x] terminal-safe Spotify metadata
- [x] editable and retryable interactive search
- [x] per-session interactive search result caching
- [x] durable interactive playback confirmation
- [x] optional playback selection from playlists, liked songs, and recent history
- [x] current shuffle and repeat state display
- [x] empty-queue normalization for repeated current-track placeholders
- [x] deterministic active-device fallback
- [x] stricter Spotify error mapping and normalized rate-limit messages
- [x] explicit unknown-command errors
- [x] validated, retryable numbered prompts
- [x] immediate interactive request cancellation

---

## Phase 10 — v1 TUI foundation

- [x] Add Ink and React with a Node.js 22 baseline
- [x] Keep services independent from Ink and reusable by both interfaces
- [x] Open the TUI from `spoti interactive`/`spoti i` and preserve bare `spoti` help
- [x] Add screen navigation, keyboard Help, and a shared shortcut model
- [x] Add current playback screen and bounded automatic refresh
- [x] Add playback state plus play/pause, track, seek, volume, shuffle, repeat, and refresh controls
- [x] Add cancellation-aware multi-category search and playback screen
- [x] Add queue display and track-add screen
- [x] Add Spotify Connect device selector
- [x] Add playlist, liked-track, and recent-history browsing with lazy cached pagination
- [x] Add initial playback loading, empty, and recoverable error states
- [x] Restore terminal state after normal exit, errors, and signals
- [x] Test narrow-terminal and `NO_COLOR` behavior

---

## Phase 11 — v1 quota and release readiness

- [x] Parse and retain Spotify API error reasons such as `QUOTA_EXCEEDED`
- [x] Distinguish development quota exhaustion from ordinary rate limiting
- [x] Audit requests, polling, lazy loading, and session caching
- [x] Add dedicated quota documentation
- [x] Validate authentication and token refresh
- [ ] Validate npm installation and self-update behavior manually on each supported OS
- [x] Run the full CLI regression suite
- [x] Test builds and automated terminal behavior on Linux, macOS, and Windows CI
- [x] Audit user-facing errors, Spotify attribution, and policy documentation

---

## Phase 12 — Companion website

- [x] Create a static landing and setup site after the TUI design stabilizes
- [x] Add installation, setup, command, shortcut, and limitations sections
- [ ] Add an accurate TUI screenshot or recording — the initial site uses a representative terminal mock
- [x] Link npm, GitHub, issues, releases, privacy information, and attribution
- [x] Configure Vercel deployment at `spoti.bzenky.dev` without a backend or user tracking

---

## Phase 13 — v0.10 final feature pass

- [x] Add the current track to an existing playlist from the CLI and TUI
- [x] Use the non-deprecated `/playlists/{playlist_id}/items` endpoint
- [x] Request only the public/private playlist-modification scopes required by that workflow
- [x] Add a configurable default playback device while preferring an active device
- [x] Add `spoti open` for the current track
- [x] Add compact `spoti now --short` output
- [x] Update static shell completions and user documentation
- [ ] Complete normal-use testing and fix regressions before release preparation

---

# 26. MVP Definition

Do not expand the scope until all of these work:

```bash
spoti login

spoti now

spoti search "Numb"

spoti play "Numb"

spoti pause

spoti resume

spoti next

spoti previous

spoti logout
```

The MVP is complete when you can comfortably control Spotify during a normal work session without opening the Spotify UI for basic playback actions.

---

# 27. First Development Session

When starting the project, focus only on:

```text
1. Initialize repository
2. Configure TypeScript
3. Add Commander
4. Make `spoti --help` work
5. Register the Spotify app
6. Implement PKCE authentication
7. Implement `spoti login`
8. Call `/me`
9. Print the authenticated Spotify user
```

A good first milestone is:

```bash
spoti login
```

followed by:

```text
✓ Logged in as Bruno
```

Once authentication works, almost every other feature becomes a relatively straightforward Spotify API integration.

---

# 28. Guiding Principle

Keep the first versions command-driven.

Do not start by building the full TUI.

Build:

```text
Spotify API integration
        ↓
services
        ↓
CLI commands
        ↓
interactive commands
        ↓
TUI
```

This keeps the project manageable while allowing the TUI to reuse all the functionality developed earlier.
