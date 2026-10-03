# TUI Playback
> Current playback flows from Spotify item mapping into the Ink Player

Entry: `src/tui/index.tsx:startTui()`
Flow: `PlayerService.getCurrentPlayback()` → `mapPlaybackItem()` → `Track` → `TuiApp` → `PlaybackView()`

Artwork: `mapTrack()` takes the first Spotify album image URL; image-capable terminals render through `ink-picture`. `InkPictureProvider` wraps the app and cache is disabled. `PlaybackView()` renders an 18-column by 9-row cover without an item link. Other terminals keep the track details.

Controls: `src/tui/app.tsx:TuiApp()` shares playback actions between Player and Lyrics; navigation and add-to-playlist remain Player-only. `src/tui/lyrics-screen.tsx:LyricsScreen()` owns scrolling, follow, Enter retry, Esc, and Ctrl+X. Playback status/action/error props reserve lyric viewport rows.

Polling: Player and Lyrics share the polling lifecycle; next/previous refresh immediately. `preserveTrackReference()` avoids lyrics reloads for same-track snapshots.

Updated: 2026-10-03
