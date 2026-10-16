# Jade & Ember Firelight: Home-specific performance budget

**Approval:** APR-JE-052 (owner, 2026-10-16, "Option A approved — Home-only budget").
**Branch:** `feature/jade-and-ember-firelight` (the v0.9 branch is unchanged).
**Machine-readable limits:** `jade-and-ember/engineering/budgets-firelight.json`. **Check:** `npm run check:budgets-firelight` (`jade-and-ember/engineering/project-owned/budgets-firelight.mjs`).

## What the owner decided

1. Keep the v0.9 budgets for Menu, Our Story, Visit Us and Order Online.
2. Give Home its own budget, set from what The Breath (including its WebGL steam simulation) measurably needs.
3. Keep all 45 quality checks.
4. Leave the v0.9 branch alone.
5. Keep watching mobile loading, frame rate and responsiveness.
6. Do not remove cinematic features to fit the old 3 KB script limit.

## What changed and what did not

| Item | v0.9 limit (all pages) | Menu, Our Story, Visit Us, Order Online | Home (Firelight) |
|---|---|---|---|
| JavaScript, gzip per page | 3,000 B | **3,000 B (unchanged; measured at most 2,900 B)** | **15,600 B** |
| Script files per page | 2 | **2 (unchanged)** | **2** |
| HTML, gzip | 4,096 B | **4,096 B (unchanged)** | **4,400 B** |
| Initial load, gzip | 255,000 B | **255,000 B (unchanged)** | **280,000 B** |
| Full page, gzip | 325,000 B | **325,000 B (unchanged)** | **415,000 B** |
| Largest image | 68,000 B | **68,000 B (unchanged)** | 68,000 B, one exception: `media/dish-beef.webp` up to 135,000 B |
| Largest Contentful Paint, 390 px, throttled | 2,500 ms | **unchanged** | unchanged |
| Cumulative Layout Shift | 0.1 | **unchanged** | unchanged |
| Main-thread blocking, calm Home | 200 ms | **unchanged** | unchanged (the page without the solver meets the ordinary limit) |
| Requests at 390 px | 11 | **unchanged (11)** | 14 |
| Transfer at 390 px | 192,000 B | **unchanged (192,000 B)** | 330,000 B |

Only the items in the Home column that differ from v0.9 were changed. Every other budget in `engineering/budgets.json` is untouched, and that file is untouched.

## Measured requirements of Home

Measured on the final build (gzip bytes; headless Chromium with software rendering, so timings are not a real device [unverified]):

| Measurement | Value | Limit |
|---|---|---|
| `breath.js` (steam solver, dish renderer, scroll sequence, screen-reader list) | about 13.2 KB | |
| `site.js` (navigation toggle, scroll progress) | about 1.3 KB | |
| **Home script total (2 files)** | **14,691 B** | 15,600 B |
| Home HTML | 4,043 B | 4,400 B |
| Home initial load | 252,611 B | 280,000 B |
| Home full page | 376,419 B | 415,000 B |
| Largest image on Home | `dish-beef.webp` 123,018 B | 135,000 B |
| Home at 390 px, 150 ms / 1.6 Mbit/s, CPU x4: LCP | 1,076 ms (live), 1,068 ms (calm) | 2,500 ms |
| Home CLS | 0 | 0.1 |
| Home requests / transfer at 390 px (live or calm) | 13 / 300,189 B | 14 / 330,000 B |
| Home calm blocking time | 39 ms | 200 ms |
| v0.9 pages, worst case: LCP / blocking | 1,140 ms / 69 ms | 2,500 ms / 200 ms |

Each Home limit sits 6 to 11 percent above the measured value. The check also fails when Home grows more than 5 percent past the recorded measurement, even when it is still under its limit, so the new limit cannot quietly absorb growth.

## Why each Home limit is what it is

- **Script 15,600 B.** One script holds the whole Breath: a stable-fluids steam solver in WebGL2 (advection, divergence, pressure, vorticity, shader sources), the dish renderer, the scroll sequence, the adaptive-load logic and the Pause control. Nothing was removed to fit. The readable source is in `client/`; `tools/build-breath.mjs` bundles it into `breath.js`.
- **Full page 415,000 B and the image exception.** The finished dish is drawn at 2,400 px so the steam is composited over it at full resolution. Menu serves a 1,200 px copy (45,388 B), so no other page carries the large file.
- **Requests 14.** The page adds the footage (video, loaded after the page is idle), the calm-mode stills and the second stylesheet.
- **Live-mode blocking time.** Not judged against 200 ms. In software WebGL on a 4x slowed CPU the solver is the worst case possible, and the figure varies between runs (2.4 s to 5.5 s with the current bail-out, about 12 s when the bail-out was off). The check keeps a regression guard of 9,000 ms to catch a solver that stops handing over. The honest statement is what the page does about slow frames, not a promise about phones.

## What protects slow devices

These are behaviours, tested in headless Chromium and **not yet verified on a real phone**:

- The footage starts first. The solver is built about one second later, off the first-paint moment.
- Phones start with a lower solver tier; no device-capability reads are made (privacy standard).
- Frames over 120 ms step the load down every 8 frames; a frame over 400 ms drops it to the floor at once (not in the first 12 frames, which hitch on any device). At the floor, six slow frames in a row hand over to the calm layout.
- Calm layout (stills crossfading, no movement) is also what reduced motion, Save-Data, 2g and no WebGL2 get, and what visitors get with no JavaScript.
- Pause motion stays available throughout.

## Monitoring from here

- Re-run `npm run check:budgets-firelight` after any change to `client/`, `home.css`, Home markup or Home media. Use `--update-measured` only after an intentional, reviewed change.
- Real-device checks are still owed: first-load time and frame rate on a mid-range Android phone and an iPhone with Safari, on mobile data. Until then every device claim here is **[unverified]**.
- If the solver is later simplified or the dish image shrinks, tighten the Home limits the same way (measured plus about 6 to 10 percent).
