# Live terminal verification — 2026-11-11

Build: local compiled TUI at commit 0058c7f; real Spotify authentication and API,
launched with `node dist/cli.js interactive` in an interactive PTY.

- Opened Library and owned playlists with keyboard navigation.
- Matched a real title plus artist using a mixed-case multiword query.
- Observed progressive filtering go from 50 to 61 loaded tracks in an owned playlist.
- Scrolled to its final track and found that later-page track with a title/artist query.
- Reopened filtering with cached pages and a cleared query, without another loading phase.
- Entered a nonmatching query and observed `0 matches` and `No matching tracks.`
- Cleared with Esc and restored page 2 and its previously selected final row.
- Exited using Ctrl+X. No track-playback or playlist-write actions were invoked.

One followed playlist returned Spotify `Forbidden` before its tracks could load;
owned-playlist checks passed. This was an API access response, not a filter result.
No playlist IDs, names, track names, or raw API payloads are retained in this record.
