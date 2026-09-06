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

Playlists are sorted consistently by name so the displayed number works across `spoti playlists`, `spoti playlist <number>`, and `spoti play playlist <number>`. After selecting a playlist interactively, choose whether to start playlist playback or return without starting playback.

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

# 14. Version 1.0

Build a proper interactive TUI using Ink.

Example:

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

Potential component structure:

```text
App
├── Player
│   ├── TrackInfo
│   ├── ProgressBar
│   └── Controls
│
├── Search
│   ├── SearchInput
│   └── SearchResults
│
├── Queue
│
└── Devices
```

---

# 15. Core Services

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

# 16. Spotify Client

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

# 17. Error Handling

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

# 18. Configuration

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

# 19. Developer Experience

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

# 20. Testing Strategy

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

# 21. Nice-to-Have Features

After the core project works:

### Lyrics

```bash
spoti lyrics
```

This would likely require a separate lyrics provider because Spotify's public API does not expose full song lyrics.

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

# 22. Potential Shell Integration

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

# 23. Development Roadmap

## Phase 1 — Bootstrap

- [ ] Create repository
- [ ] Initialize Node.js project
- [ ] Configure TypeScript
- [ ] Configure ESLint
- [ ] Configure Vitest
- [ ] Add Commander
- [ ] Create CLI executable
- [ ] Implement `spoti --help`

---

## Phase 2 — Authentication

- [ ] Create Spotify developer application
- [ ] Configure redirect URI
- [ ] Implement PKCE
- [ ] Start local callback server
- [ ] Open browser automatically
- [ ] Exchange authorization code
- [ ] Save tokens
- [ ] Implement token refresh
- [ ] Implement `spoti login`
- [ ] Implement `spoti logout`
- [ ] Implement `spoti status`

---

## Phase 3 — Spotify Client

- [ ] Create HTTP client
- [ ] Add Bearer authentication
- [ ] Add automatic token refresh
- [ ] Add Spotify API error mapping
- [ ] Add rate limit handling

---

## Phase 4 — Playback

- [ ] Get current playback state
- [ ] Implement `spoti now`
- [ ] Implement pause
- [ ] Implement resume
- [ ] Implement next
- [ ] Implement previous

---

## Phase 5 — Search

- [ ] Search tracks
- [ ] Format search results
- [ ] Add interactive selection
- [ ] Implement `spoti search`
- [ ] Implement `spoti play <query>`

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
- [x] Interactive multi-category search
- [x] aliases
- [ ] better terminal formatting
- [x] TTY-only loading indicators
- [ ] JSON output — deferred until a concrete scripting use case exists
- [x] shell completions
- [x] config path and per-key reset
- [x] Node 24-based GitHub Actions

---

## Phase 9 — TUI

- [ ] Add Ink
- [ ] Current track screen
- [ ] Playback controls
- [ ] Search screen
- [ ] Queue screen
- [ ] Device selector
- [ ] Keyboard shortcuts
- [ ] Automatic playback refresh

---

# 24. MVP Definition

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

# 25. First Development Session

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

# 26. Guiding Principle

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
