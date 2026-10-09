# Jade & Ember — fictional modern Chinese kitchen (STS concept v0.4)

Standalone static site. No framework, no runtime dependencies, no external requests, no Lovable. Target path: `/jade-and-ember/`.
**v0.4:** composition refinement only. Photographs are frameless and feathered into the page (CSS masks, no new media), the three signature plates bleed and overlap differently, the section rhythm is varied, and boxed or ruled elements are removed. Content, hero, video behaviour and fallbacks are unchanged. See `QA.md`.

**v0.3:** the hero plays one short cinematic loop (concept footage) over the still, on desktop widths (960 px and up) where the visitor allows it. The still stays the poster and the fallback.

> Jade & Ember does not exist. Menu, prices, address, phone number and hours are invented and labelled as samples on the page.
> Food images and the hero video are AI-generated concept media (see `media/PROVENANCE.md`) and do not depict dishes served by any restaurant.
> **The page is `noindex, nofollow` while the fictional demonstration is under development** (`meta.robots` in `config.json`; empty the value to allow indexing).

## Run / rebuild
```
open index.html            # or: python3 -m http.server 8766   (from this folder)
node build.mjs             # rebuilds index.html from config.json (Node 18+, no deps)
npm i && npm run test:a11y && npm run test:contrast && npm run test:contrast-sections && npm run test:lighthouse   # QA (dev dependencies only)
python3 tools/video-qa.py media/hero-loop.webm --poster media/hero-wok.webp   # numeric checks on the loop (needs ffmpeg, numpy, Pillow)
npm run test:video-tools   # dry run of that checker on synthetic clips
```
If Playwright cannot find its browser, set `CHROMIUM_PATH` (tests) / `CHROME_PATH` (Lighthouse) to a Chromium binary.

## Reuse for another restaurant
Everything restaurant-specific is in `config.json`: brand, seal glyphs, copy, nav, hero image paths and crop focal points,
signature dishes, full menu, story, address/hours, disclosure text. Replace files in `media/`, edit the config, run `node build.mjs`.
`styles.css` holds the palette as tokens at the top of `:root`.

### Ordering URL (MenuSifu or any other)
`ordering.url` in `config.json`. While it is `null`, every "Order online" button points to `#order`, which says plainly that the
example is nonfunctional. Set an `https://` URL and every button links out (new tab, `rel="noopener noreferrer"`) and the notice is removed.
This is a link only. No MenuSifu API, iframe, checkout or partnership integration has been built, tested or verified.
No cart, payment or POS code exists.

## Art direction (STS Premium Web Design v2.0)
- **Visual thesis:** a modern Chinese kitchen shown through the wok's fire and steam, in a quiet, precise voice, restrained everywhere else.
- **Axes:** warm-on-dark, sparse, hard contrast, quiet, tactile (carbon steel, slate, glazed ceramic), editorial.
- **Brand specifics:** wok hei ("breath of the wok") is the one idea, and the name is the palette: jade (celadon bowls, the cool shadows) and ember (the flame, actions) meet in one recurring gradient dash on every section label, caption and the first rule of the wok-hei index. The wok-hei index (fire, steam, texture, the plate) is the brief's own four words. Dishes carry a three-dot heat scale (text-labelled, not colour-only). Mapo tofu is served in the celadon bowl. Banned moves: cards with icons, pill badges, gradient text, glass, fade-up on everything.
- **Restraint budget:** one accent (ember, used for actions and flame only), jade as quiet label colour, rice for text and the single light section (the menu, like a printed card). Two families (Instrument Serif, Hanken Grotesk) plus a two-glyph seal font (玉 火, 1 KB). One image grade. One primary motion at a time (the hero loop, or the 38 s push on the still when the loop cannot play).
- **Rhythm:** hero (dark, slow) → one-line pause → signature (dense, three different compositions) → menu (light, text) → story (sparse) → visit (medium) → order.
- **Mobile is a separate composition:** a separately generated portrait hero (`hero-wok-m.webp`): headline in the dark upper zone, the flame as the one focal point, one primary action at the foot (the secondary order link becomes a text link), icon-only Pause, a one-line disclosure bar; nav collapses; menu tabs wrap; landscape phones get a split layout and a non-sticky header.

## Hero video: how it behaves
Files: `media/hero-loop.webm` (VP9, 584 KB) and `media/hero-loop.mp4` (H.264, 891 KB), 1280×720, silent, 5.04 s, looped. Configured in `config.json` (`hero.video`; remove the key and the page falls back to the still).

| Visitor or condition | What renders |
|---|---|
| Viewport 960 px wide or more (any device, any orientation); motion allowed; normal connection; JS on | The poster paints first (it is the LCP image). After the page `load` event and an idle moment, the clip is requested (WebM first, MP4 second), starts muted and inline, and crossfades in over 400 ms. The CSS push is off while it plays. |
| Pause motion pressed | The clip pauses; the button becomes Play motion. A user pause is never overridden by the scroll or tab-visibility logic. |
| Hero scrolled off screen, or tab hidden | The clip pauses and resumes by itself unless the visitor paused it. |
| `prefers-reduced-motion: reduce`, `Save-Data`, or `2g`/`slow-2g` connection | Never requested. The still only, no Pause button. |
| Viewport under 960 px wide: phones (portrait or landscape), small tablets, narrow windows | Never requested. The poster with the slow push and a Pause button (v0.2 behaviour). Resizing across 960 px starts or drops the clip live. |
| Clip fails (network error, no playable source), does not start within 6 s, stalls for 3 s, or autoplay is refused | The clip is dropped and the poster with the slow push and Pause stays. No play button is ever drawn over the hero. |
| No JS | The still only; the `<video>` has no source and is invisible. |

The Pause control is mandatory because the loop auto-plays for more than 5 seconds beside content (WCAG 2.2.2). The video is decorative (`aria-hidden`, no audio track, no captions needed).
The loop's first frame is the poster, so the handoff is invisible; its last frame is not the first frame (the flame never returns to the same shape), so the loop point is a hard cut that sits inside the flame's normal frame-to-frame change. See `docs/JADE_AND_EMBER_GATE_A_RESULT.md`.

### Other motion and accessibility
- Menu categories are tabs with arrow/Home/End keys; without JS every category is listed.
- No scroll hijacking, no sound, no carousels.

## Files
`config.json` content · `build.mjs` generator · `index.html` built output · `styles.css` · `site.js` (progressive enhancement only) · `media/` · `fonts/` (OFL licences in `LICENSES.txt`) · `tests/qa.mjs` (axe and behaviour, including every video fallback) · `tests/contrast.mjs` (hero text contrast over the photo and the video frames) · `tests/serve.mjs` (test server with Range support) · `tools/video-qa.py` and `tools/video-qa-selftest.py` (loop checker and its dry run) · `lighthouserc.json` · `QA.md` results and critique · `media/PROVENANCE.md`.

## Not done yet
1. Real-device testing: iPhone, Safari (including WebM VP9 playback and Low Power Mode), Android **[unverified]**. The H.264 fallback is untested in this build's browser (Playwright's Chromium cannot decode H.264).
2. Independent review. Merge or public deployment only with explicit authorisation.
