# Website layout
> Static landing page; grid tracks must shrink around command content

Entry: `docs/index.html` → `docs/styles.css`

- `docs/styles.css`: `.examples-grid` and mobile single-column grids previously used automatic minimum track sizes; long CLI commands expanded the document to 454px on phones.
- Fractional tracks use zero minimums; nested `.steps li` content track follows the same rule so setup commands stay contained.
- `.install`, `.command-list`, `.code-block`: horizontal scrolling stays within command boxes. Preserve this when changing grid sizing.
- Verification: local Chromium via cached Playwright; document scroll width equals viewport width at 18 widths from 320–1920px, including both sides of 700px and 980px breakpoints.

Updated: 2026-09-29
