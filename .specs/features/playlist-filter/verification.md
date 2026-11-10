# Playlist filtering verification

**Verdict**: FAIL
**Proofs**: `proofs.md` at b07dd0cfcb451661a58394ee02bf4f43a5881b8f
**Verifier**: independent sub-agent (author != verifier)

Reviewed the approved plan, check claims and selected proofs, and the diff from
8020fa28bfdaaa338f0ed9ef670eb7f9655a7d6b. Did not read Handoff or rerun the proof
suite. The findings distinguish a reproduced behavior defect from missing proof;
missing proof does not mean that the present implementation is broken.

## Checks

| Check | Test | Holds |
| --- | --- | --- |
| C1 | `tests/playlist-filter.test.ts` `matches words across title and artists while ignoring case and accents` | yes - positive and negative all-word cases, accents, case, title/artist fields, excluded album and empty queries assert exact booleans |
| C2 | `tests/playlist-filter.test.ts` and `tests/tui-playlist-filter.test.tsx` `preserves order and duplicate matches` | yes - exact array and rendered row sequence retain both occurrences |
| C3 | `tests/tui-playlist-filter.test.tsx` `loads the whole playlist progressively without restarting for query changes` | no - cached first page and one missing final page do not prove continuing through multiple missing pages sequentially (AC4) |
| C4 | `tests/tui-playlist-filter.test.tsx` `treats shortcut letters as text and removes a whole grapheme` | no - `npe` is one input event; independent shortcut keys and selection reset after query edits are untested (AC5) |
| C5 | `tests/tui-playlist-filter.test.tsx` `plays the selected match with album context and keeps the filter` | yes - exact URI/context, one call, retained selection/query, Up wrapping and live background scan are asserted |
| C6 | `tests/tui-playlist-filter.test.tsx` `restores the original page and selection on Escape` | no - restores page/row and subsequent navigation, but never starts pending filtered playback before Esc and therefore cannot prove its cancellation (AC7) |
| C7 | `tests/tui-playlist-filter.test.tsx` `aborts filtering and ignores late pages on exit` | yes - Esc, Ctrl+X and unmount each abort the signal and reject late cache writes |
| C8 | `tests/tui-playlist-filter.test.tsx` `distinguishes searching from no matches and never plays an empty result` | yes - pending/completed zero matches, empty playlist count, and absence of playback asserted |
| C9 | `tests/tui-playlist-filter.test.tsx` `retries failed pages while preserving cached matches and query` | yes - sanitized error, partial match, retry guidance and exact repeated missing offset asserted; existing service/client retry handling is reused |
| C10 | `tests/tui-playlist-filter.test.tsx` `reuses session pages when filtering is reopened` | no - query reset/cache reuse asserted, but first session never moves off selection zero and reopened selection is not asserted (AC11) |
| C11 | `tests/tui-app.test.tsx` `keeps filtering within a small TUI viewport` | no - only short metadata/query/rows; a long playlist title hides Filter input at the required size, reproduced below (AC12) |
| C12 | `tests/tui-app.test.tsx` `documents playlist filtering and retry shortcuts` | no - checks Help descriptions only; wrong key labels or absent README/website descriptions still pass (AC13) |
| C13 | `tests/tui-playlist-filter.test.tsx` `treats shortcut letters as text and removes a whole grapheme` | no - batched `npe` cannot catch leaking standalone printable edit/page shortcuts; no move operation on the restored unfiltered selection is exercised (AC14) |

## Findings

| Finding | Evidence | Fix | Closed |
| --- | --- | --- | --- |
| F1: Long playlist heading obscures the filter input at 40×18 | `src/tui/library-screen.tsx:616` wraps the title. Own example with name `'A playlist with a very long title '.repeat(8)` and 24 results renders no `Filter:` after resize to 40×18. C11 uses `Workout` and short row/query text only. | Bound/truncate the heading and other variable-height filter metadata. Add a 40×18 regression with long playlist/title/artist/query text asserting visible Filter input, selected result, bounded frame and exit control. |94656b4 — C11 |
| F2: The full-playlist proof stops after one missing page | `tests/tui-playlist-filter.test.tsx:33` supplies a cached first page and a final second page. Stopping after that page, or overlapping subsequent requests, cannot fail this test. | Extend the scan case through at least two missing pages using deferred responses; assert no next request before the current one resolves, offsets/sizes, progressive counts, and the final page's matching result. |94656b4 — C3 |
| F3: Shortcut isolation and selection resets are not proven | `tests/tui-playlist-filter.test.tsx:71` sends `npe` in one event rather than standalone `n`, `p`, `e`. That bypasses existing equality-based shortcuts. C4 never edits after choosing a nonfirst result; C10 never establishes a nonzero filtered selection or checks the reopened marker. | Send shortcut characters individually, including the edit/move sequence; assert no writes/ownership lookup/page navigation while filtering. Select a nonfirst result before both an input edit/Backspace and closing/reopening; assert first-match selection and exact playback. Exercise edit/move after Esc on the original nonfirst unfiltered row. |94656b4 — C4, C10, C13 |
| F4: Esc cancellation of filtered playback is missing from selected proofs | C6 at `tests/tui-playlist-filter.test.tsx:117` presses Enter only after closing filtering. C7 defers reads, not playback. Removing the filter Esc branch's playback cancellation could leave both proofs green. | Defer playTrack while a scan is also pending; Esc must abort both signals, restore the origin, and suppress late playback success/error effects. |94656b4 — C6, C7 |
| F5: Discoverability proof does not hold shortcut labels or documentation | `tests/tui-app.test.tsx:155` asserts description text only. AC13 also fixes `/`, `Ctrl+R`, README and website explanations. The changed documentation currently contains the requested information, but none is held by the selected proof. | Assert the key/description association in Help, and add a focused documentation proof for full-playlist title/artist filtering and Esc restoration in README and website. |94656b4 — C12 |

## Own examples

Executed only these two new examples at the stated HEAD with
`npm test -- tests/playlist-filter-verifier.examples.test.tsx --reporter=verbose`:

1. PASS: `{ name: 'A\u030Angstro\u0308m Echo', artists: ['João', 'Zoë', 'Édith'] }`
   matches `' EDITH\tangstrom\u2003JOAO '` and rejects the same query plus
   `absent`. Probes decomposed accents, multiple artists, non-ASCII whitespace
   and an additional required word beyond the plan's examples.
2. FAIL: Open a 24-track playlist with title
   `'A playlist with a very long title '.repeat(8)`, enter filtering, wrap Up to
   `Final boundary song`, resize from 100×30 to 40×18. The selected result and
   Ctrl+X remain visible, but `Filter:` is absent and wrapped title fragments
   overwrite other header rows. This is F1.

The temporary fixture was removed from the repository after execution and retained
at `/tmp/spoti-playlist-filter-verifier.examples.test.tsx` for reproduction (copy
it to the original tests filename to run). No implementation files were changed
and no commits were made. No binding capture exists, so no screens judgment was
required.

## Author fix follow-up

All five findings were addressed in `94656b4` after the independent review:
heading truncation is scoped to filtering, and the existing tests now cover the
reported boundaries and stronger cases. This preserves the original Verifier
judgment at b07dd0c; the final proof run and completion gate assess the fixes.
