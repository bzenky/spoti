# CLI Selection Cancellation
> Readline pickers used by play and collection commands

Entry: `src/app.ts:createProgram()` — `play` / `p` → `selectPlaybackItem()` → `src/ui/prompts.ts:selectTrack()`.
- Null selection returns before playback or watch starts.
- Item/action pickers → `promptForSelection()`; paginated pickers → `selectPageAction()`.
- All readline prompts use `questionWithEscape()`: Escape, Ctrl+C, and interface close abort the pending question and return null; listeners removed in finally.
- `confirmUpdate()` distinguishes null cancellation from empty Enter confirmation; setup returns null without saving a partial ID.
- Readline manages raw mode through interface creation/close; arrow escape sequences remain regular editing keys.
- Tests: `tests/prompts-interactive.test.ts` exercises readline with terminal-like streams; `tests/app.test.ts` checks cancelled play leaves playback untouched.
- `src/tui/library-screen.tsx`: Escape from edits aborts pending save/move; ownership results checked for cancellation before proceeding.
- Library and playlist picker register unmount cleanup independently of page loading: cached pages return early from load effects, so load-effect cleanup alone cannot cover pending actions.
- `src/tui/app.tsx:TuiApp()` keeps root input active for undersized terminals: child screens are absent, so root must handle Escape/x even from Lyrics or Library.

Updated: 2026-10-05
