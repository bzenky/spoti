# playlist-filter proofs

**HEAD**: 0058c7f
**Tree**: clean
**Shell**: /bin/sh
**Result**: 21 pass, 0 fail

| Check | Proof | Result |
| --- | --- | --- |
| C1 | `run unit / ✓ matches words across title and artists while ignoring case and accents` | pass |
| C2 | `run unit / ✓ preserves order and duplicate matches` | pass |
| C2 | `run unit / ✓ tests/tui-playlist-filter.test.tsx > playlist filtering > preserves order and duplicate matches` | pass |
| C3 | `run unit / ✓ loads the whole playlist progressively without restarting for query changes` | pass |
| C4 | `run unit / ✓ treats shortcut letters as text and removes a whole grapheme` | pass |
| C4 | `run unit / ✓ keeps standalone shortcuts in query text and restores the original move position` | pass |
| C5 | `run unit / ✓ plays the selected match with album context and keeps the filter` | pass |
| C6 | `run unit / ✓ restores the original page and selection on Escape` | pass |
| C6 | `run unit / ✓ cancels pending playback and scanning on Escape without late feedback` | pass |
| C7 | `run unit / ✓ aborts filtering and ignores late pages on exit` | pass |
| C8 | `run unit / ✓ distinguishes searching from no matches and never plays an empty result` | pass |
| C9 | `run unit / ✓ retries failed pages while preserving cached matches and query` | pass |
| C10 | `run unit / ✓ reuses session pages when filtering is reopened` | pass |
| C11 | `run unit / ✓ keeps filtering within a small TUI viewport` | pass |
| C12 | `run unit / ✓ documents playlist filtering and retry shortcuts` | pass |
| C12 | `run unit / ✓ documents full-playlist filtering and Escape restoration` | pass |
| C13 | `run unit / ✓ treats shortcut letters as text and removes a whole grapheme` | pass |
| C13 | `run unit / ✓ keeps standalone shortcuts in query text and restores the original move position` | pass |
| Build | `npm run typecheck` | pass |
| Build | `npm run lint` | pass |
| Build | `npm run build` | pass |

## Output

`Run unit` - exit 0

```
 ✓ tests/tui-app.test.tsx > TuiApp > coalesces manual refreshes while playback loading is in flight 118ms
 ✓ tests/tui-app.test.tsx > TuiApp > aborts an active playback request when leaving Player 86ms
 ✓ tests/tui-app.test.tsx > TuiApp > pauses automatic polling after quota exhaustion and permits a manual retry 177ms
 ✓ tests/tui-app.test.tsx > TuiApp > keeps quota-paused Lyrics polling stopped until a manual player retry 188ms
 ✓ tests/tui-app.test.tsx > TuiApp > keeps quota-paused Lyrics polling stopped until a manual lyrics retry 157ms
 ✓ tests/tui-app.test.tsx > TuiApp > keeps Lyrics within a 32×10 terminal 93ms
 ✓ tests/tui-app.test.tsx > TuiApp > keeps Lyrics within a 40×12 terminal 93ms
 ✓ tests/tui-app.test.tsx > TuiApp > renders a minimum-size fallback and compact navigation without overflowing rows 116ms
 ✓ tests/tui-app.test.tsx > TuiApp > truncates long playback metadata within a narrow terminal 86ms
 ✓ tests/tui-app.test.tsx > TuiApp > shows actionable errors without terminating the interface 87ms

 Test Files  34 passed (34)
      Tests  446 passed (446)
   Start at  10:04:30
   Duration  14.20s (tests 76%, import 15%, transform 8%)
```
