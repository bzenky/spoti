# spoti

A local-first command-line client for controlling Spotify through Spotify Connect.

> `spoti` is an independent project and is not affiliated with, endorsed by, or sponsored by Spotify AB.

`spoti` controls playback on an existing Spotify client or Connect device; it does not stream audio itself.

## Requirements

- Node.js 20 or newer
- A Spotify developer application and client ID
- Spotify Premium for playback-control commands
- A Spotify client or Connect device available for playback

## Spotify application setup

Create an application in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and register this exact redirect URI:

```text
http://127.0.0.1:43821/callback
```

Export the application's client ID before running authentication:

```bash
export SPOTIFY_CLIENT_ID="your-client-id"
```

To use a different local callback, register it in the same Spotify application and set:

```bash
export SPOTIFY_REDIRECT_URI="http://127.0.0.1:5000/callback"
```

The redirect URI must use HTTPS except for local development, where an explicit `http://127.0.0.1` URI is allowed. Do not use `localhost` or wildcard redirect URIs. No client secret is needed or accepted by `spoti`; authentication uses Authorization Code with PKCE.

## Installation

Once published to npm:

```bash
npm install --global spoti
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

Authenticate once through Spotify's browser authorization page:

```bash
spoti login
spoti status
```

Control playback:

```bash
spoti now
spoti play "Numb"
spoti play "Numb" --first
spoti pause
spoti resume
spoti next
spoti previous
```

Search without starting playback:

```bash
spoti search "Breaking the Habit"
spoti search "Breaking the Habit" --limit 5
```

Remove local credentials:

```bash
spoti logout
```

When attached to an interactive terminal, `spoti play <query>` asks you to select a result. In non-interactive usage it chooses the first result automatically; `--first` makes that behavior explicit.

## Credentials

Credentials are stored locally in:

```text
$XDG_CONFIG_HOME/spoti/credentials.json
```

or, when `XDG_CONFIG_HOME` is not set:

```text
~/.config/spoti/credentials.json
```

The credentials file is created with user-only permissions (`0600`). Access tokens refresh automatically. Keep `SPOTIFY_CLIENT_ID` available in the environment because Spotify requires it during token refresh. Never provide or store a Spotify client secret in `spoti`.

## Spotify API policy

`spoti` uses Spotify data only for immediate command output and playback control. It does not persist Spotify catalog content, use Spotify data for machine-learning training, or download audio. Spotify content and links remain attributed to Spotify.

Endpoint work must be checked against Spotify's [official OpenAPI specification](https://developer.spotify.com/reference/web-api/open-api-schema.yaml) and [Developer Terms](https://developer.spotify.com/terms).

## Development

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Current scope

Version `0.1.0` supports authentication, current playback, track search, direct track playback, pause/resume, and next/previous controls. Queue, volume, seek, shuffle, repeat, device switching, library features, JSON output, and a TUI are planned for later releases.
