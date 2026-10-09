# Jade & Ember — QA and critique (concept v0.3.1, cinematic hero loop on desktop widths)

Branch `feature/jade-and-ember-brief`. Dates: 2026-10-09. Tooling: Playwright 1.64 + axe-core 4.13, Lighthouse 12.6.1 (`@lhci/cli` 0.15 for the mobile preset, the Lighthouse CLI for the desktop preset), Chromium 1194 (headless, Linux), ffmpeg 6.1. **Nothing was run on a real device.**

Re-runnable: `npm run test:a11y`, `npm run test:contrast`, `npm run test:lighthouse`, `npm run test:video-tools`, and `python3 tools/video-qa.py media/hero-loop.webm --poster media/hero-wok.webp`.

## What v0.3.1 changed
The hero clip now plays **only at viewport widths of 960 px and above**, whatever the device or its orientation (decision after the v0.3 review). Below 960 px, including phones in landscape, small tablets and narrow windows, the poster with the slow push and the Pause button stays (v0.2 behaviour). `site.js` uses one `(min-width: 960px)` test, which also starts or drops the clip live when a window is resized across 960 px. The existing footage, flame speed, encodes, markup and other fallbacks are unchanged. Nothing was generated and no credits were spent.

Tests changed: the landscape-phone scenario now asserts that no video is requested; new scenarios for an 820×1180 tablet, 959 px (no video), 960 px (plays, Pause works), a touch device at 1280 px (plays: width decides, not device type) and resizing across 960 px; `tests/contrast.mjs` now expects video on every viewport of 960 px and above and fails if it does not play, and expects none below.

## What v0.3 changed
The approved Gate A clip (one 5-credit Kling 3.0 Omni generation, see `docs/JADE_AND_EMBER_GATE_A_RESULT.md`) is optimised and wired into the hero, following `docs/JADE_AND_EMBER_HERO_VIDEO_PLAN.md`. No footage was generated and no credits were spent in this step.

| Area | Change |
|---|---|
| Media | `media/hero-loop.webm` (VP9 CRF 34, 584 KB) and `media/hero-loop.mp4` (H.264 CRF 24, 891 KB); 1280×720, 24 fps, silent, tagged BT.709; no retouch, trim or upscale. Plan targets (MP4 ≤ 1.0 MB, WebM ≤ 0.7 MB) met. Compared with the original frame by frame: SSIM about 0.97 (VP9) and 0.99 (H.264); flame, steam and food crops are visually indistinguishable at 1.5× |
| Markup | One `<video class="hero-video">` in `.hero-media`: muted, loop, playsinline, `preload="none"`, `aria-hidden`, no controls, no `src`; sources are added by JS (`config.json` → `hero.video`) |
| Behaviour (`site.js`) | Clip requested only after the `load` event and an idle moment; WebM first, MP4 second; crossfades in over 400 ms once it is really playing; CSS push off while it plays; Pause now controls the clip; clip pauses off screen and in a hidden tab (a visitor's own pause always wins); never loads for reduced motion, Save-Data, 2g or slow-2g, or portrait phones; falls back to the poster with the slow push on a source error, a 6 s slow start, a 3 s stall or refused autoplay |
| Tests | Nine new video scenarios and a longer desktop test in `tests/qa.mjs`; `tests/contrast.mjs` now measures five positions of the video; shared `tests/serve.mjs` with Range support |
| Docs | `README.md` (behaviour table), `media/PROVENANCE.md` (loop provenance, encode commands, defects); footer and caption wording now say "image and video" |

## Automated results
| Check | Result |
|---|---|
| axe (WCAG 2.0/2.1/2.2 A and AA tags, best practice) at 1440, 820, 390, 320, 844×390 and under reduced motion | 0 violations |
| Overflow, duplicate ids, one `h1`, alt text, 24 px targets, external requests, HTTP and JS errors | none |
| Existing behaviour (menu tabs, mobile nav, reduced motion, no-JS simulation, `noindex`, heat labels, mobile hero chrome) | all pass |
| **Video:** clip is not requested before the `load` event | pass |
| **Video:** desktop plays; muted, looped, not controllable, `aria-hidden`; WebM VP9 listed before MP4; faded in; CSS push off; time advances | pass |
| **Video:** Pause stops it (time frozen, `aria-pressed`, label "Play motion"); Play motion resumes it | pass |
| **Video:** pauses when the hero is scrolled away, resumes when it returns | pass |
| **Video:** reduced motion, Save-Data, 2g: file never requested, still only, no Pause, no motion | pass (3 scenarios) |
| **Video:** request fails, or autoplay refused: poster plus slow push stays, Pause pauses the push | pass (2 scenarios) |
| **Video:** portrait phone: no request, poster plus push plus Pause (v0.2 behaviour) | pass |
| **Video:** landscape phone (844×390), tablet portrait (820×1180) and 959 px: never requested, poster plus push plus working Pause | pass (3 scenarios) |
| **Video:** 960 px, and a touch device at 1280 px: plays, Pause works | pass (2 scenarios) |
| **Video:** resizing 1280 → 800 → 1280 px: clip dropped and the push takes over, then the clip restarts and the push stops | pass |
| **Video:** no JS (simulated): no source, invisible element, no motion | pass |
| Lighthouse mobile preset, 3 runs (a portrait phone, so **no video loaded**) | performance 99, accessibility 100, best practices 100, SEO 63 (intentional `noindex`); LCP 1.8 s, CLS 0, TBT 0, 141 KiB |
| Lighthouse desktop preset, re-run after the change (video loads after `load`) | performance 100, accessibility 100, best practices 100; LCP 0.5 s, CLS 0, TBT 0; 832 KiB total, of which the WebM is 584 KiB |

## Contrast over the moving hero
`tests/contrast.mjs` hides the hero's glyphs, freezes the hero and samples the pixels behind every text line against its colour. It runs 14 viewports; where the clip plays (960 px and above: 1920, 1440, 1280, 1024, 960) it seeks the video to 0, 25, 50, 75 and 100 %; elsewhere (including both landscape phones) it uses the poster with its push. 374 measurements (200 on video frames, 174 on poster): **0 below the gate** (99 % of sampled pixels at 4.5:1, or 3:1 for large text).

| Mode | Element | Worst pixel | Where |
|---|---|---|---|
| video | eyebrow | 8.45:1 | 1920×1080 |
| video | headline line 1 / line 2 | 14.93 / 13.09:1 | 1920×1080 |
| video | hero paragraph | 11.98:1 | 960×700 |
| video | buttons | 6.39:1 | 1920×1080 |
| video | caption / Pause label | 9.12 / 15.66:1 | 1920×1080 |
| poster + push | hero paragraph | 5.28:1 | 320×640 |
| poster + push | buttons | 6.57:1 | 820×1180 |
| poster + push | headline / eyebrow / caption | at least 11.76 / 8.31 / 9.12:1 | various |

The flame sits well to the right of the copy, so the moving footage did not lower any margin the poster already had.

## Clip checks on the shipped files
`tools/video-qa.py` on `hero-loop.webm` and `hero-loop.mp4` gives the same result as the original in the Gate A report. Frame 0 matches the poster (SSIM 0.975 WebM, 0.970 MP4). In a browser the first video frame and the poster differ by an average of 1.7 levels over the desktop hero window, so the 400 ms crossfade is invisible. Two numeric checks still fail, as accepted at Gate A: rigid-region SSIM 0.92 (left handle next to the steam; 0 px of actual movement) and first/last-frame SSIM 0.87 (the flame, which can never match). The loop point is a hard cut about the size of an ordinary frame-to-frame flame change (closing step 1.2× the median).

## Remaining issues (honest list)
1. **[unverified] Real devices.** iPhone, Safari (including whether VP9 WebM plays and is chosen, and Low Power Mode blocking autoplay), Android, Firefox, a high-refresh display, and battery or heat during the loop have not been tested. Safari and iOS are the biggest unknown.
2. **The MP4 fallback is untested in a browser.** Playwright's Chromium cannot decode H.264, so only the WebM path ran. The MP4 file is valid (ffprobe, frame-accurate QA); the source order and failure logic are tested. If a browser rejects both sources, the page falls back to poster plus push.
3. **Playback quality is unproven by me.** I cannot play video here. The flame speed and the loop cut are approved, but I have not watched them in motion.
4. **720p source.** Soft on large screens; the clip is upscaled about 1.2× in a 1920-wide hero and more on high-DPI displays. No upscaler was used.
5. **Metered data at desktop widths.** Phones no longer load the clip, but a wide tablet or laptop on a metered 3g or 4g link still downloads about 584 KB (the `2g` check does not catch those). A network-based rule would be a separate, small change.
6. **Failure and autoplay-blocked paths show the slow push** rather than the bare still, as confirmed in review (the plan's wording was "poster stays").
7. **Timings differ slightly from the plan:** the startup allowance is 6 s (the plan said 3 s for a stall); a mid-play stall still fails after 3 s.
8. **Checker calibration is still open** (the endpoint check cannot pass on any flame; the rigid check mixes steam with motion). See `docs/JADE_AND_EMBER_GATE_A_RESULT.md` section 7. No thresholds were changed after the fact.
9. **Earlier limits remain:** no screen-reader pass, no 200 % zoom or text-spacing test, keyboard behaviour checked by script, fonts not tested over a real network, `noindex` is a meta tag only, imagery is AI concept art (`media/PROVENANCE.md`).
10. **Weight:** desktop visitors download about 584 KB more after the page has loaded. It does not touch LCP (0.5 s) or CLS (0).

## Critique notes (Part X language; observations, not a score)
- **Mute test:** still passes; reduced-motion and Save-Data visitors get the designed still.
- **Motion budget:** one primary motion at a time (clip, or push, or still). The CSS push never runs under the clip. The Pause control is reachable by keyboard right after the hero's own buttons.
- **Does the video earn its place?** In stills it is the strongest asset on the site: real flame, believable steam, food that stays put, a locked camera. Whether it beats the still in motion depends on the flame speed and the loop cut, which need a person watching at full size.
- **Mobile:** every phone, in either orientation, gets the poster with the slow push and Pause (the v0.2 experience). Only widths of 960 px and above get the clip.

## Decisions for you
1. **Watch the site on real devices** (at least one iPhone and one Android) before anything is shared.
2. **Metered data at desktop widths:** accept, or add a network-based rule later?
3. When ready: independent review, then explicit authorisation before any merge or deployment.
