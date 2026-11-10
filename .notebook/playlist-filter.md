# Playlist filtering
> Full-playlist title/artist matching in the interactive Library

Entry: `src/tui/library-screen.tsx:LibraryScreen()` — `/` inside a loaded playlist.
Matching: `src/tui/playlist-filter.ts:matchesPlaylistTrack()` — all words, NFD accent folding, title plus artist names; empty query matches everything loaded.

Scan: separate abort controller; sequential 50-item pages reuse the Library session cache. Query changes do not restart reads. Missing-page errors retain matches; Ctrl+R resumes from the cache boundary. Cached pages preserve playlist order and duplicate occurrences.
Input: query and selection refs handle input arriving before the next React render. Printable n/p/e remain text. Enter plays the selected match while scanning continues. Esc cancels filter/playback work and restores the original unfiltered page and selection.

Viewport: filtering truncates long playlist headings and reserves rows for input, counts, errors, and hints. Existing compact Player/category screens can clip content at 40x18; the filter resize test enters at a larger size before checking the new screen at 40x18, avoiding unrelated layout changes.
Proofs and plan: `.specs/features/playlist-filter/`.

Updated: 2026-11-10
