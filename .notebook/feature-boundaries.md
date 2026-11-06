# Feature boundaries
> Existing service support versus exposed commands

Entry: `src/app.ts:createProgram()` — command registration.

- `src/app.ts:selectPlaybackItem()` routes track, album, and artist input through search; playlist input supports displayed numbers or search. No direct Spotify URL/URI branch.
- `src/services/player.service.ts:PlayerService.playTrack()` and `PlayerService.playContext()` already accept Spotify URIs.
- `src/services/playlist.service.ts:PlaylistService.removeItems()` exists; no callers under `src/`. Request coverage: `tests/playlist.test.ts`.
- Playlist removal accepts URIs; selecting a displayed occurrence requires checking duplicate-removal semantics before exposing a position-based action.

Updated: 2026-11-04
