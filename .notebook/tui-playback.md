# TUI Playback
> Current playback flows from Spotify item mapping into the Ink Player

Entry: `src/tui/index.tsx:startTui()`
Flow: `PlayerService.getCurrentPlayback()` → `mapPlaybackItem()` → `Track` → `TuiApp` → `PlaybackView()`

Artwork: `mapTrack()` takes the first Spotify album image URL; image-capable terminals render through `ink-picture`. `InkPictureProvider` wraps the app and cache is disabled. Other terminals keep the track details and show a Spotify item link.

Updated: 2026-09-29
