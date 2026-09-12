# spoti

A local-first command-line client for controlling Spotify through Spotify Connect.

[Website](https://spoti.bzenky.dev/) · [npm](https://www.npmjs.com/package/@bzenky/spoti) · [Releases](https://github.com/bzenky/spoti/releases)

> `spoti` is an independent project and is not affiliated with, endorsed by, or sponsored by Spotify AB.

`spoti` controls playback on an existing Spotify client or Connect device; it does not stream audio itself.

## Requirements

- Node.js 22 or newer
- A Spotify developer application and client ID
- Spotify Premium for playback-control commands
- A Spotify client or Connect device available for playback

## Spotify application setup

Create an application in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and register this exact redirect URI:

```text
http://127.0.0.1:43821/callback
```

After installing `spoti`, save the application's client ID once:

```bash
spoti setup
spoti login
```

When developing from source, use:

```bash
npm run dev -- setup
npm run dev -- login
```

The setup command stores the public client ID in your local `spoti` configuration. For temporary sessions, CI, or an explicit override, you can still use:

```bash
export SPOTIFY_CLIENT_ID="your-client-id"
```

PowerShell:

```powershell
$env:SPOTIFY_CLIENT_ID = "your-client-id"
```

The environment variable takes precedence over the stored value. To use a different local callback, register it in the same Spotify application and set:

```bash
export SPOTIFY_REDIRECT_URI="http://127.0.0.1:5000/callback"
```

PowerShell:

```powershell
$env:SPOTIFY_REDIRECT_URI = "http://127.0.0.1:5000/callback"
```

The redirect URI must use HTTPS except for local development, where an explicit `http://127.0.0.1` URI is allowed. Do not use `localhost` or wildcard redirect URIs. No client secret is needed or accepted by `spoti`; authentication uses Authorization Code with PKCE.

## Installation

Once published to npm:

```bash
npm install --global @bzenky/spoti
spoti --help
```

## Install for development

```bash
npm install
npm run build
npm link
```

Then verify the executable:

```bash
spoti --help
```

You can also run commands without linking:

```bash
npm run dev -- --help
npm run dev -- status
```

## Usage

Run `spoti` with no command, or use `spoti --help`, to see the complete command overview:

```bash
spoti
spoti --help
```

Open the full interactive TUI explicitly:

```bash
spoti interactive
# alias: spoti i
```

The TUI opens on current playback, updates progress locally every second, and refreshes Spotify state every ten seconds only while the Player screen is active. Use:

```text
1       Player
/       Search
q       Queue
d       Devices
l       Library
y       Lyrics
?       Help

Space   play or pause (Player)
n       next track (Player)
p       previous track (Player)
← / →   seek backward or forward 10 seconds (Player)
- / +   lower or raise volume by 5% (Player)
s       toggle shuffle (Player)
r       cycle repeat off, track, and context (Player)
Ctrl+R  refresh now (Player)

Esc     back one level, or exit from Player
x       exit from Player or Help
Ctrl+X  exit from Search, Queue, Devices, or Library
```

On Search, type a query and press Enter. Use up/down to select a result, then Enter to play it. Tab or left/right switches between tracks, albums, artists, and playlists. Search results are cached for the active TUI session, stale requests are cancelled when the query changes, and leaving Search cancels an in-flight search or playback request.

Queue displays the current item and Spotify's upcoming items. Press `a` to search for a track, use up/down to select it, and press Enter to add it. Press `r` to refresh. Spotify does not expose arbitrary queue removal or position jumping, so the TUI does not offer those actions.

Devices lists controllable Spotify Connect devices with active status, type, and volume. Use up/down and Enter to transfer playback, or `r` to refresh.

Library uses Tab or left/right to switch among Playlists, Liked, and Recent. Use up/down and Enter to open a playlist or play a track; `n` and `p` navigate lazily loaded pages. Previously visited pages remain cached for the TUI session, and Esc returns from playlist tracks to the playlist list before returning to Player.

Press `y` from Player to open lyrics for the current track. When synchronized lyrics are available, the TUI follows and highlights the current line; use up/down to scroll manually and `f` to resume following. Lyrics are loaded live from LRCLIB and are not stored persistently.

All command-driven usage remains available. The `interactive` command requires an interactive stdin and stdout; outside a TTY it prints its command help instead of starting Ink.

Authenticate once through Spotify's browser authorization page:

```bash
spoti login
spoti status
```

Control playback. Quotes are optional for ordinary multi-word queries because `spoti` combines the remaining command arguments. Use quotes when a query contains shell-special characters such as `&`, `*`, `?`, or parentheses.

```bash
spoti now
spoti now --watch
spoti play Numb
spoti play Fear of the Dark
spoti play Numb --first
spoti play Numb --watch
spoti play Numb --no-watch
spoti pause
spoti resume
spoti next
spoti previous
spoti volume
spoti volume 50
spoti volume +10
spoti volume -10
spoti shuffle
spoti shuffle on
spoti shuffle off
spoti repeat
spoti repeat off
spoti repeat track
spoti repeat context
spoti lyrics
spoti lyrics Numb Linkin Park
spoti lyrics Numb --first
```

Manage playback devices:

```bash
spoti devices
spoti device 2
spoti device "My Computer"
```

Use the displayed one-based number, exact device name, or Spotify device ID.

When playback reports no active device, `spoti play` and `spoti resume` retry the one active controllable device if Spotify reports one, or the only controllable device when exactly one is available. If several inactive devices are available, `spoti` asks you to select one explicitly.

Seek within the current track:

```bash
spoti seek 1:30
spoti seek +30
spoti seek -10
```

View the queue or search for a track to add. When Spotify represents an otherwise empty queue by repeating only the current track, `spoti` reports the queue as empty instead of printing duplicate entries:

```bash
spoti queue
spoti queue "Faint"
spoti queue "Faint" --first
```

Search without starting playback:

```bash
spoti search "Breaking the Habit"
spoti search "Breaking the Habit" --limit 5
```

Search, inspect, and play Spotify contexts:

```bash
spoti album "Meteora"
spoti artist "Linkin Park"
spoti playlists
spoti playlist 1
spoti playlist "Workout"
spoti play track "Numb"
spoti play album "Meteora"
spoti play artist "Linkin Park"
spoti play playlist "Workout"
spoti play playlist 1
```

User playlists preserve Spotify’s order so their global displayed numbers remain stable across pages. A displayed number can be reused with `spoti playlist <number>` or `spoti play playlist <number>`, including numbers beyond the first page.

In an interactive terminal, `spoti album` can play the entire album or a selected track after showing its details. `spoti artist` can play the artist context or let you browse the artist’s albums lazily, with each fetched page ordered from newest to oldest by release date. From an album selected through an artist, choose **Back to albums** to reuse that list and select another release; pressing Enter in the album browser returns to the artist actions. `spoti playlist` can start the selected playlist or browse its tracks across all available pages and play one directly. Non-interactive runs remain display-only and never start playback implicitly.

`spoti play <query>` remains shorthand for track playback. The words `track`, `album`, `artist`, and `playlist` are treated as explicit types when followed by another argument. For a track query that starts with one of those reserved words, use `spoti play track <query>` (or quote the complete query as one shell argument). Context commands support `--first` to skip interactive selection.

Manage and inspect your Spotify library:

```bash
spoti liked
spoti liked --limit 10
spoti like
spoti unlike
spoti recent
spoti recent --limit 10
```

`spoti like` and `spoti unlike` operate on the currently playing track. Episodes, advertisements, local files, and unavailable items are ignored safely. Artist albums, `spoti playlists`, `spoti liked`, and `spoti recent` use paginated browsers: enter a displayed number to select it, `n` for the next page, `p` for the previous page, or press Enter to go back or leave playback unchanged. Pages are requested only when needed, and previously visited pages are cached for the duration of the command. Short Spotify rate limits are retried automatically with bounded backoff; when `Retry-After` exceeds five seconds, `spoti` exits immediately with a human-readable retry time instead of holding the terminal on a spinner. For collection commands, `--limit` controls the page size from 1 to 50; artist album pages use Spotify’s maximum of 10. Non-interactive runs display only the first page and never start playback implicitly.

Check for updates or install the latest npm release:

```bash
spoti update --check
spoti update
```

`spoti update` asks for confirmation before installing the exact version returned by the update check. It never installs an update silently. Normal commands use a cached update result and refresh it in a detached process at most once every 24 hours, so npm availability does not delay or break Spotify controls.

Remove local credentials:

```bash
spoti logout
```

When attached to an interactive terminal, `spoti play <query>` asks you to select a result. In non-interactive usage it chooses the first result automatically; `--first` makes that behavior explicit.

Watch mode continuously refreshes the current track and progress until `Ctrl+C` is pressed. `--watch` enables it for one command, while `--no-watch` overrides a saved preference. Run `spoti volume`, `spoti shuffle`, or `spoti repeat` without a value to inspect the current state. Pass a volume value or use `spoti shuffle on|off` or `spoti repeat off|track|context` to change it.


### Command aliases

Common aliases include:

```text
i     interactive  p     play       pa    pause
ly    lyrics       r     resume       np    now        q     queue      s     search
vol   volume       sk    seek        alb   album
art   artist       dev   device      devs  devices
pl    playlist     pls   playlists   rep   repeat
rec   recent       n     next        prev  previous
```

### Shell completions

Generate a static completion script without invoking Spotify or making network requests:

```bash
spoti completion bash
spoti completion zsh
spoti completion fish
```

For the current shell session:

```bash
source <(spoti completion bash) # Bash
source <(spoti completion zsh)  # Zsh
spoti completion fish | source  # Fish
```

Interactive network operations display a spinner on stderr. Indicators remain disabled outside a TTY.

### Terminal formatting

Interactive terminals use restrained styling for names, metadata, headings, and playback progress. Redirected output remains plain text. Set the standard `NO_COLOR` environment variable to disable decorative styling:

```bash
NO_COLOR=1 spoti now
```

PowerShell:

```powershell
$env:NO_COLOR = "1"
spoti now
```

Spotify-provided names and descriptions are normalized to safe single-line terminal text before display.

### Lyrics and LRCLIB

Spotify's Web API does not provide lyrics. `spoti lyrics` and the TUI Lyrics screen therefore query the community-operated [LRCLIB](https://lrclib.net) service using the selected track's title, artists, album, and duration. This metadata is sent to LRCLIB only when lyrics are requested. `spoti` identifies itself through the required `User-Agent`, performs bounded retries for short `429` and `503` responses, and does not persist lyrics locally.

Lyrics are displayed for personal, immediate use with visible LRCLIB attribution. LRCLIB's software license does not grant redistribution rights to copyrighted song lyrics; do not treat displayed lyrics as freely licensed content. Availability and synchronization depend on LRCLIB's community data, and some tracks may be missing, instrumental, or incorrectly matched.

## Configuration

View all settings:

```bash
spoti config
```

Read, update, or reset settings:

```bash
spoti config get spotifyClientId
spoti config set spotifyClientId "your-client-id"
spoti config get watchAfterPlay
spoti config set watchAfterPlay true
spoti config set refreshIntervalMs 2000
spoti config unset spotifyClientId
spoti config path
spoti config reset
```

Available settings:

| Setting | Default | Description |
| --- | ---: | --- |
| `spotifyClientId` | `null` | Public Spotify application client ID saved by `spoti setup`. |
| `watchAfterPlay` | `false` | Keep `spoti play` open in watch mode after playback starts. |
| `refreshIntervalMs` | `1000` | Watch refresh interval from `1000` to `30000` milliseconds. |

Command flags take precedence over saved configuration. Application preferences are stored in `$XDG_CONFIG_HOME/spoti/config.json`, or `~/.config/spoti/config.json` when `XDG_CONFIG_HOME` is not set. This path convention is currently used on Linux, macOS, and Windows; run `spoti config path` to print the exact path for the current system.

## Credentials

Credentials are stored locally in:

```text
$XDG_CONFIG_HOME/spoti/credentials.json
```

or, when `XDG_CONFIG_HOME` is not set:

```text
~/.config/spoti/credentials.json
```

On POSIX systems, the credentials file is created with user-only permissions (`0600`). Access tokens refresh automatically using the environment client ID when present, otherwise the client ID saved by `spoti setup`. Version `0.3.0` adds minimum permissions for private playlist listing, liked-track access, library modification, and recently played tracks. Existing installations will be asked to run `spoti login` once after upgrading. Never provide or store a Spotify client secret in `spoti`.

## Spotify API policy

`spoti` uses Spotify data only for immediate command output and playback control. It does not persist Spotify catalog content, use Spotify data for machine-learning training, or download audio. Spotify content and links remain attributed to Spotify.

Endpoint work must be checked against Spotify's [official OpenAPI specification](https://developer.spotify.com/reference/web-api/open-api-schema.yaml) and [Developer Terms](https://developer.spotify.com/terms).

### Spotify quota and rate limits

Spotify can return HTTP `429` for two related situations:

- a normal short-term rate limit, which can usually be retried after the response's `Retry-After` delay
- development quota exhaustion, reported by Spotify as `QUOTA_EXCEEDED`, which may have a much longer delay

`spoti` automatically retries only bounded waits of five seconds or less. Longer waits exit immediately and show when to try again. Development quota cannot be manually cleared from `spoti`.

Spotify development mode currently supports a small allowlist of users and requires the app owner to have Premium. Quota may be shared by development-mode applications owned by the same Spotify developer account, so creating another application under that account is not a reliable way to obtain fresh quota. Extended quota access is subject to Spotify's eligibility and application requirements.

Each user should create their own Spotify developer application and save its public client ID:

```bash
spoti setup
spoti login
```

This avoids putting all public `spoti` users on one developer application's quota. A client ID is public configuration; never provide a client secret to `spoti`.

See Spotify's official documentation for current details:

- [Rate limits](https://developer.spotify.com/documentation/web-api/concepts/rate-limits)
- [Quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes)

## Development

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Releases

GitHub Releases are created automatically when a version tag is pushed. The tag must match the version in `package.json`:

```bash
npm version patch
npm run verify
git push origin main
git push origin v0.1.1
```

The release workflow attaches the npm package tarball and a `SHA256SUMS` file, and generates release notes from the Git history. Publishing to npm remains a separate explicit step.

## Current scope

Version `0.6.0` adds lazy collection pagination, nested Back navigation, playlist-track selection, current-volume output, new command aliases, visible play-search progress, and bounded rate-limit handling. Development toward `v1.0.0` now includes functional Player, Search, Queue, Devices, and Library TUI screens, shared navigation and keyboard Help, lazy session-cached collection pagination, cancellation-aware requests, and quota-aware error handling.
