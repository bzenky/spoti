# Website layout
> Static landing page; grid tracks must shrink around command content

Entry: `docs/index.html` → `docs/styles.css`

- `docs/styles.css`: `.examples-grid` and mobile single-column grids previously used automatic minimum track sizes; long CLI commands expanded the document to 454px on phones.
- Fractional tracks use zero minimums; nested `.steps li` content track follows the same rule so setup commands stay contained.
- `.install`, `.command-list`, `.code-block`: horizontal scrolling stays within command boxes. Preserve this when changing grid sizing.
- Verification: local Chromium via cached Playwright; document scroll width equals viewport width at 18 widths from 320–1920px, including both sides of 700px and 980px breakpoints.
- Player screenshot: `docs/images/spoti-interactive.png` — 1022×554 live Player capture, with artwork and saved status. Captured a dedicated Kitty X11 window through `xwd`; converted its native BGRX pixel buffer to PNG. Terminal palette uses Spotify green. A temporary service wrapper replaces the live device name with `Spotify Connect`; playback and saved status remain live and unchanged.
- Recapture: update image width/height, track-specific alt text, and caption in `docs/index.html` together. Current capture includes artwork; caption must not describe it as text-only.
- Latest screenshot verified in local Chromium at 320, 390, 768, and 1440px: image loads at its declared dimensions; no horizontal page overflow.

Updated: 2026-11-05
