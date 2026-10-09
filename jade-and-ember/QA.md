# Jade & Ember — QA and critique (concept v0.2, still-image hero)

Branch `feature/jade-and-ember-brief`. Dates: 2026-10-09. Tooling: Playwright 1.64 + axe-core 4.13 (via @axe-core/playwright), Lighthouse 12.6.1 via @lhci/cli 0.15, Chromium 1194 (headless, Linux). **Nothing was run on a real phone.**

Everything is re-runnable: `npm run test:a11y`, `npm run test:contrast`, `npm run test:lighthouse`.

## What v0.2 changed (refinement of `809e3db`)
| Documented shortcoming in v0.1 | Change |
|---|---|
| Brand specificity "moderate"; swap test mostly passed | Jade-to-ember gradient dash as one recurring mark (section labels, captions, first rule of the index); "wok hei" index of the brief's own four words (fire, steam, texture, the plate); three-dot heat scale on dishes and menu; mapo tofu in a celadon bowl; story rewritten around the bowls and the name-as-palette idea; all six images share one split-tone grade |
| Hero a single frozen frame, handle visible, soft | New hero (a real flame flare over the pan), no handle, 1920 px source (v0.1 was 1536 px), separate generated portrait hero, not a crop |
| Dishes pale, unrequested candle, stray hand, strip was an upscaled crop | Six new images in one family (slate, matte black, celadon, one warm light), no hands, no candles, story strip replaced by a real celadon-bowl image |
| Mobile first focal point undecided | Headline → flame → one action; disclosure bar one line; Pause icon-only; secondary order link is a text link; menu order button moved to the end of the list; element index stacks |
| Unresolved hero contrast measurement (headline dipped to ~2.6:1; shadow never re-measured) | Scrim redesigned, text-shadow removed, and a reproducible measurement added (`tests/contrast.mjs`), see below |
| `noindex` | `<meta name="robots" content="noindex, nofollow">`, test-enforced |

## Automated results
| Check | Result |
|---|---|
| axe (wcag2a/aa, 21a/aa, 22aa, best-practice) at 1440, 820, 390, 320, 844×390 landscape and under reduced motion | 0 violations |
| Overflow, duplicate ids, one `h1`, image alt, 24 px targets, external requests, HTTP and JS errors, same viewports | none |
| Behaviour: menu tabs (click, ArrowRight, End), mobile nav (open, aria-expanded, Escape), Pause (running → paused, aria-pressed), reduced motion = no animation and no button, simulated no-JS (all five categories, nav, no unpausable motion), `noindex` meta, three signature dishes, every heat indicator labelled "Heat n of 3", phone shows the short disclosure and an icon-only Pause named "Pause motion" at least 44 px wide | all pass |
| Lighthouse, 3 runs, default mobile preset, local static server | performance 99, accessibility 100, best-practices 100, SEO **63**; LCP 1.8 s, FCP 1.2–1.4 s, CLS 0, TBT 0 ms, 139 KiB total (v0.1: 178 KiB, SEO 100) |

**SEO 63 is the intentional `noindex`:** the only failing SEO audit is `is-crawlable`. The Lighthouse config now warns below 0.6 instead of 0.9 and turns that one audit off; restore both when the demonstration is cleared for indexing.

## Hero contrast: resolved
`tests/contrast.mjs` hides the hero's glyphs (buttons, borders and scrims stay), screenshots the hero, and compares the pixels behind every line of text with the text's computed colour (WCAG relative luminance; 4.5:1, or 3:1 for large text). It runs 14 viewports (1920×1080 down to 320×640, plus 844×390 and 667×375 landscape phones) at three points of the 38 s push (start, middle, end), 294 measurements. The gate is "at least 99% of the sampled pixels meet the ratio" because film grain and sparks make a single-pixel gate meaningless; the worst single pixel is reported as well.

Result: **0 of 294 below the gate.** Worst single sampled pixel anywhere: 5.28:1 (hero paragraph at 320×640). Per element, the worst pixel across all viewports and push positions:

| Element | Worst pixel | Where |
|---|---|---|
| Eyebrow | 8.31:1 | 430×932 start |
| Headline line 1 | 13.72:1 | 768×1024 end |
| Headline line 2 ("of the wok.") | 11.76:1 | 768×1024 middle |
| Hero paragraph | 5.28:1 (1st percentile 8.27:1) | 320×640 start |
| Buttons | 6.57:1 | 820×1180 start |
| Caption | 9.12:1 | all |
| Pause label | 12.72:1 | 667×375 end |

In v0.1 this was the 2.6:1 region on the headline's full stop. Of the contrast tool itself: sampling takes every second pixel, in Chromium on Linux with fonts as loaded locally. It measures the hero only; text elsewhere sits on flat charcoal, rice or slate and is covered by axe. The phone's icon-only Pause button is not measured in pixels; its worst case by calculation (82% charcoal backing over a pure-white background pixel, rice icon) is about 3.7:1 against a 3:1 non-text requirement.

## Limits that remain
- **[unverified] iPhone / Safari / any real device.** Only headless Chromium on Linux. Not tested: iOS Low Power Mode, address-bar `svh` behaviour, WebP and font rendering in Safari, touch performance, thermal behaviour.
- Lighthouse is the lab mobile simulation, not field data. Desktop preset not run.
- No screen-reader pass (VoiceOver, NVDA, TalkBack), no 200% zoom or text-spacing override test. 320 px reflow passes. Keyboard behaviour is tested by script for tabs, nav and Pause, not by a full manual tab-order walk.
- Fonts have metric-matched fallbacks (CLS 0 on a local server); not tested over a real network.
- **Generated images** are still concept art (see `media/PROVENANCE.md`). The food is plausible, not studio-grade; "gai lan" renders as broccoli (labelled broccoli); the hero flame is one frozen frame; the hero kitchen is out-of-focus steel pots; the story image's rice bowl is generic; one image (story) was retouched to remove a candle flame (fill from surrounding slate). The generator ignored "no candles" and added candles to several candidates until the prompt stopped mentioning them, so a human should check any regeneration. Replace all six for a real client.
- `noindex` is a meta tag. A Cloudflare Pages `_headers` rule (`X-Robots-Tag`) would be the belt-and-braces option and is not added, because it would live outside this folder.
- The hero push (38 s, with Pause) still adds little to a hero that is now more dramatic; it remains mainly to prove the pause and fallback plumbing for the video milestone. A fully still hero is a reasonable alternative.

## Anchored critique (Part X language; observations, not a score)
- **Swap test:** now partly fails. Swap the name and copy and these remain tied to Jade & Ember: the jade-to-ember mark, the celadon ware, the four-part wok-hei index, the heat scale, the 玉火 seal, the flame-as-hero composition. What would survive is the page grammar (hero, three dishes, menu, story, visit), which is ordinary restaurant structure. Moderate-to-good specificity, not total.
- **Mute test (no motion):** passes; the page is a designed still by default.
- **One-sentence thesis:** "A modern Chinese kitchen shown through the wok's fire and steam, in a quiet, precise voice, restrained everywhere else." Still specific enough to reject other cuisines.
- **Squint test (8 px blur of the hero):** desktop, the flame is the first mass, the headline the second, the ember buttons third (the header and hero order buttons plus the flame put ember at the top of its restraint budget). Phone, the order reads headline, flame, primary button; this is the decisive improvement over v0.1.
- **Hierarchy and rhythm:** the new four-column index follows the intro line as a ruled list, not cards. The signature section still uses three different compositions. Quietest section (story) sits before the closing order block.
- **Media consistency:** the six images now share a surface (slate), tableware (matte black or celadon), a warm directional light and one grade, so they read as one set; the hero kitchen is brighter and greyer than the dishes' dark studio, which is the largest remaining inconsistency.
- **Hero crop spec:** desktop 1920×1080, focal 56% 50% in a 68% wide window; phone portrait 810×1440, focal 50% 62%. Text zones: dark left (desktop), dark upper third and lower scrim (phone). Safe area: pan, food, flame. Bleed: left kitchen, right wall.
- **Motion budget:** one ambient motion; Pause control kept; reduced-motion, Save-Data and no-JS get the still.
- **Gaps against the brief:** not yet a cinematic demonstration (acceptance #2 needs approved video); menu is browse-only; no map; the ordering destination is intentionally a nonfunctional example.

## Next gate (not started)
Cinematic hero plan for review: the approved still (`hero-wok.webp` source frame or a better one), the intended motion (flame flare and steam, not a re-cooked dish), duration, loop method, delivery size, cost. No video is generated until approved.
