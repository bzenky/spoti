# Playlist filtering checks

Build: `npm run typecheck`; `npm run lint`; `npm run build`
Run unit: `npm test -- --reporter=verbose`
Plan: `.specs/features/playlist-filter/plan.md`

## Intent

13 checks in 1 slice · 0 one-way doors · 0 open

## Checks

### S1 - Find and play playlist matches

**C1** - Matching uses all words, case/accent folding, title/artist fields and empty-query semantics (AC 2)
Proof: run unit | ✓ matches words across title and artists while ignoring case and accents

**C2** - Results retain playlist order and duplicate occurrences (AC 3)
Proof: run unit | ✓ preserves order and duplicate matches
Proof: run unit | ✓ tests/tui-playlist-filter.test.tsx > playlist filtering > preserves order and duplicate matches

**C3** - Slash enters a playlist filter and loads beyond the cached first page (AC 1, 4)
Proof: run unit | ✓ loads the whole playlist progressively without restarting for query changes

**C4** - Query input consumes shortcuts and removes complete graphemes (AC 5)
Proof: run unit | ✓ treats shortcut letters as text and removes a whole grapheme

**C5** - Arrow selection and Enter play the exact match while retaining the filter (AC 6)
Proof: run unit | ✓ plays the selected match with album context and keeps the filter

**C6** - Esc restores the original page and selected track, then existing navigation (AC 7)
Proof: run unit | ✓ restores the original page and selection on Escape

**C7** - Cancelled or unmounted scans cannot update caches with late responses (AC 8)
Proof: run unit | ✓ aborts filtering and ignores late pages on exit

**C8** - Empty results distinguish completed scans from pending reads (AC 9)
Proof: run unit | ✓ distinguishes searching from no matches and never plays an empty result

**C9** - Read failures retain partial results and Ctrl+R resumes from the failed page (AC 10)
Proof: run unit | ✓ retries failed pages while preserving cached matches and query

**C10** - Reopened filters reuse complete session pages without preserving the query (AC 11)
Proof: run unit | ✓ reuses session pages when filtering is reopened

**C11** - Filtering preserves keyboard controls and bounded small-terminal rendering (AC 12)
Proof: run unit | ✓ keeps filtering within a small TUI viewport

**C12** - Filtering help is discoverable (AC 13)
Proof: run unit | ✓ documents playlist filtering and retry shortcuts

**C13** - Filter typing cannot edit or reorder a playlist (AC 14)
Proof: run unit | ✓ treats shortcut letters as text and removes a whole grapheme

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| Matching cases (7) | cross-field words C1 · case C1 · accents C1 · absent word C1 · album-only C1 · empty C1 · whitespace C1 | - |
| Filter controls (8) | slash C3 · printable letters C4 · Backspace C4 · Up C5 · Down C5 · Enter C5 · Esc C6 · Ctrl+R C9 | - |
| Scan states (5) | partial C3 · complete C3 · empty C8 · failed C9 · cancelled C7 | - |
| Lifecycle (3) | active query change C3 · reopen C10 · exit/unmount C7 | - |
| Result identity (2) | duplicate occurrences C2 · album-context selection C5 | - |
| Surface routes (0) | none added; existing authenticated Spotify API | - |

## Swept

- validation: C1, C4; existing terminal sanitization retained
- failure modes: C8, C9
- idempotency: C3, C10; read-only cached scan
- authorization: existing - SpotifyClient/AuthService scope and token checks; editing ownership guard untouched
- concurrency: C3, C7
- data lifecycle: C6, C10; session-only pages
- dependency failure: C9; existing Spotify retry/rate-limit behavior
- state transitions: C3, C5, C6, C7, C8, C9
- observability: C3, C8, C9; visible loading progress and errors

## Handoff

- **Settled mid-build:** none; initial user approval: "ok good to go" (2026-11-10).
- **Dispatched:** none.
- **Boundary:** implementation and targeted proofs complete; full proof run and independent review pending.
- **Abandoned:** none.
- **Walked:** Running TuiApp in a real 80x24 PTY with deterministic demo services: l -> playlist Enter -> / showed cached matches and Loading playlist; typed cafe BEYONCE -> later-page Café by Beyoncé; Enter recorded spotify:track:cafe with the filter retained; Esc restored page 1 and Numb selection; Ctrl+X exited. Page log: offsets 0, 50; no Spotify playback was changed. Automated TuiApp interaction also verifies resize to 40x18, selection scrolling, and Help. No binding visual captures were supplied; screenshots and screens judge are not required.
