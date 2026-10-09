# Jade & Ember — QA and critique (concept v0.1, still-image hero)

Run on the branch `feature/jade-and-ember-brief`. Dates: 2026-10-09. Tooling: Playwright 1.64 + axe-core 4.13 (via @axe-core/playwright), Lighthouse 12.6.1 via `@lhci/cli` 0.15, Chromium 1194 (headless, Linux). Nothing was run on a real phone.

## Automated results (all re-runnable: `npm run test:a11y`, `npm run test:lighthouse`)
| Check | Result |
|---|---|
| axe (wcag2a/aa, 21a/aa, 22aa, best-practice) at 1440, 820, 390, 320, 844x390 landscape, reduced-motion | 0 violations |
| Horizontal overflow, duplicate ids, one `h1`, image alt, 24 px target size, external requests, HTTP errors, JS errors, those same viewports | none |
| Menu tabs (click, ArrowRight, End), mobile nav (open, aria-expanded, Escape), Pause motion (running → paused, aria-pressed) | pass |
| Reduced motion: animation `none`, Pause button hidden | pass |
| No-JS fallback (simulated: `site.js` blocked and the `js` class removed): all 5 menu categories, nav visible, no unpausable motion | pass (found and fixed a real defect: the push animated with no way to pause it) |
| Lighthouse, 3 runs, default mobile preset, local static server | performance 99, accessibility 100, best-practices 100, SEO 100; LCP 1.8–1.9 s, CLS 0, TBT 0 ms, 178 KiB total |

Two defects found and fixed during QA: (1) cumulative layout shift 0.25 because the mobile nav was only collapsed by JS after first paint; now collapsed in CSS, CLS 0. (2) Text contrast over the hero image failed on landscape phones (about 1.6:1 measured behind the eyebrow); scrim and layout reworked, now at least 8:1 for copy there.

## Limits of those results
- **[unverified] iPhone / Safari / any real device.** Only headless Chromium on Linux. Not tested: iOS Low Power Mode, address-bar `svh` behaviour, WebP/font rendering on Safari, touch performance.
- Lighthouse numbers are lab numbers from the mobile simulation, not field data. Desktop preset not run.
- axe cannot compute contrast for text over the hero photograph (it reports "incomplete"). I measured it separately from screenshots with the text hidden, sampling pixels behind each element: eyebrow ≥ 7.4:1, hero paragraph ≥ 6.7:1 at all tested sizes; headline line two ("of the wok.") dips to about 2.6:1 on one small region at 1440 px (the final full stop over steam; large text, 5th-percentile 7.5:1). A soft text-shadow was added; not re-measured afterwards. Treat as Minor.
- No screen-reader pass (VoiceOver/NVDA/TalkBack) and no 200% zoom / text-spacing override test were run. The 320 px reflow check passed.
- Keyboard behaviour was tested programmatically for tabs, nav and Pause only; no full manual tab-order walk.
- Fonts have metric-matched fallbacks, but font loading was tested only on a local server.

## Anchored critique (rubric language from Part X; observations, not a score)
- **Swap test:** replace the name and copy and the page would still be a dark restaurant page with a hero, three dishes and a menu. The thing that does not survive is the wok-hei idea in the headline, the pause line ("Heat is the ingredient."), the flame strip and the hero composition. That is moderate brand specificity, not total. The structure itself is conventional restaurant grammar.
- **Mute test (no motion):** passes; the page is a designed still by default.
- **One-sentence thesis:** stated in README; specific enough to reject other cuisines.
- **Squint test:** one clear mass on desktop (the wok and flame at right), headline second. On mobile the headline block and the wok split the viewport about evenly; the first focal point is less decisive there.
- **Hierarchy / rhythm:** signature section varies composition three ways, which avoids the metronome; the intro "pause" and story sections are deliberately sparse and rely on a single large italic line. They may read as thin to some reviewers.
- **Media:** the hero reads as photographic at 1440 px and has believable steam and flame, but it is a single AI frame: wok hei "tossing" is implied by food in the pan, not caught in the air. A hand-held handle is visible at the right edge. The five images share a charcoal/slate/ember grade but are different generations; the dishes are plausible, not studio quality (mapo tofu is pale; the char siu plate includes an unrequested candle; dan dan was cropped to remove a stray hand). The story strip is a 1.2× upscale of a crop of the hero and is soft. **[Generated-media QA, Part VI.6]** these should be replaced with real photography for a real client.
- **Hero crop spec:** desktop focal 78% 50% inside a 68% wide window; mobile portrait source focal 50% 70%; text zone is the dark left (desktop) and dark upper third (mobile). Safe area: wok rim and flame. Bleed: left stove, right handle.
- **Typography:** Instrument Serif display with tight tracking, Hanken Grotesk text, two weights of tracked small caps for labels. No type tests beyond rendering checks.
- **Motion:** one 38 s push on the hero still, with Pause. It adds little; it is there to prove the pause and fallback plumbing for the video milestone. A reviewer may prefer a fully still hero.
- **Gaps against the brief:** not yet a "cinematic" demonstration (acceptance #2 depends on approved video); the menu is browse-only (no search/filter); no map; no real ordering destination.

## Decisions for review
1. **Image generation.** Images were generated with the free Z-Image-Turbo Hugging Face Space via the connected Hugging Face account: 5 images, no video, no Higgsfield or other paid credits. Seeds: hero 944435, portrait hero 812827, mapo 329570, char siu 819347, dan dan 751437. Confirm that is acceptable, or supply photography.
2. **Indexing.** The page is indexable (no `noindex`), because Lighthouse SEO and discovery matter for a showcase; it is titled and labelled as fictional. Add `noindex` if you would rather not have a fictional restaurant in search results.
3. **Hero headline.** "The breath of the wok." Alternatives welcome.

## Next gate (not started)
Video: write the production plan (source frame, motion, duration, loop method, cost) for review; do not generate until approved.
