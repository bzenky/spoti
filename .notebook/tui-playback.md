# TUI Playback
> Current playback flows from Spotify item mapping into the Ink Player

Entry: `src/tui/index.tsx:startTui()`
Flow: `PlayerService.getCurrentPlayback()` → `mapPlaybackItem()` → `Track` → `TuiApp` → `PlaybackView()`

Artwork: `mapTrack()` takes the first Spotify album image URL; image-capable terminals render through `ink-picture`. `InkPictureProvider` wraps the app and cache is disabled. `PlaybackView()` renders an 18-column by 9-row cover without an item link. Other terminals keep the track details.

Controls: `src/tui/app.tsx:TuiApp()` shares playback actions between Player and Lyrics; navigation and add-to-playlist remain Player-only. `src/tui/lyrics-screen.tsx:LyricsScreen()` owns scrolling, follow, Enter retry, Esc, and Ctrl+X. Playback status/action/error props reserve lyric viewport rows.

Polling: Player and Lyrics share the polling lifecycle; next/previous refresh immediately. `preserveTrackReference()` avoids lyrics reloads for same-track snapshots.

Saved tracks: `LibraryService.isTrackLiked()` uses `/me/library/contains` with a track URI. `TuiApp()` loads saved status per track or Player/Lyrics entry; Ctrl+R rechecks. `h` toggles through the shared player-action lock; success updates the indicator and invalidates the `liked` Library cache. URI-bound reads abort on changes; failed reads never imply an unliked track. Compact hints must fit the viewport without displacing the Lyrics heading.

Layout: `PlaybackDetails()` keeps saved status on its own row below progress. Title and artist/album use consecutive lines, followed by one blank row before progress and saved status. Below 16 terminal rows, omit that spacer to keep the title visible. Track titles contain only playback status and the name.

Hints: Player and Lyrics display `[h] Like` for unsaved tracks, `[h] Unlike` for saved tracks, and a neutral heart while status is unknown. Live TUI toggle checked against Spotify on 2026-11-05: like and unlike both confirmed; the originally unsaved track was restored to unsaved. Existing toggle tests also assert the dynamic hints.

Tests: `tests/tui-app.test.tsx` keyboard-help assertions wait for saved status as well as playback. Checking only the track title can capture the transient neutral hint, which wraps footer labels differently on macOS and Windows CI.

Updated: 2026-11-05
