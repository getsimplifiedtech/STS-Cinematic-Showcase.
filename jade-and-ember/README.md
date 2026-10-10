# Jade & Ember — fictional modern Chinese kitchen (STS concept v0.8, all five pages)

A five-page static website: **Home, Menu, Our story, Visit us, Order online** (`index.html`, `menu.html`, `our-story.html`, `visit-us.html`, `order-online.html`).
No framework, no runtime dependencies, no external requests, no Lovable. Target path: `/jade-and-ember/`.
Design authority: Anthropic's `frontend-design` skill. Approved visual design: v0.5 Jade Lacquer. Architecture: `../docs/JADE_AND_EMBER_FIVE_PAGE_ARCHITECTURE.md`.
Governance: framework and skill reference `../docs/JADE_AND_EMBER_FRAMEWORK_REFERENCE.md`; approval records `../docs/JADE_AND_EMBER_APPROVALS.md` (v0.8 is **not** recorded as approved).

**All five pages are built** (Gate 1: shared configuration and components, Home, Menu; Gate 2: Our story, Visit us, Order online). Open `index.html`, or run `python3 serve.py`.

> Jade & Ember does not exist. Menu, prices, address, phone number and hours are invented and labelled as samples on the page.
> Food images and the hero video are AI-generated concept media (see `media/PROVENANCE.md`) and do not depict dishes served by any restaurant.
> **Every page is `noindex, nofollow` while the fictional demonstration is under development** (`seo.noindex` in `config/client.json`).

## Run / rebuild
```
open index.html            # or: python3 serve.py   (http://localhost:8766/, with video Range support)
node build.mjs             # validates config/, then rebuilds all five pages (Node 18+, no deps)
npm i && npm run test:site && npm run test:a11y && npm run test:contrast && npm run test:contrast-sections && npm run test:variants && npm run test:lighthouse
node tests/extracted.mjs [folder]   # opens index.html in a browser (file:// and serve.py, desktop and phone) and clicks through all five pages; point it at an extracted preview ZIP
python3 tools/video-qa.py media/hero-loop.webm --poster media/hero-wok.webp   # numeric checks on the loop (needs ffmpeg, numpy, Pillow)
npm run test:video-tools   # dry run of that checker on synthetic clips
```
If Playwright cannot find its browser, set `CHROMIUM_PATH` (tests) / `CHROME_PATH` (Lighthouse) to a Chromium binary.

## How it is built
```
config/   client.json  business facts and switches (address, phone, hours, ordering, seo, flags)
          menu.json    categories and items; the three Home dishes are the items that carry a "signature" block
          copy.json    per-page copy and per-page meta; "sample": true marks STS-authored placeholder copy
          site.json    the page registry (file, nav label, order, status), the demo disclosure texts, the credit line
src/      lib/ (config loader and validator, small helpers) · components/ · pages/
build.mjs reads config/, validates, and writes one standalone HTML file per page in the registry
styles.css one shared stylesheet · site.js (nav, every page) · hero.js (Home only) · menu.js (Menu only)
```
Components are build-time functions (`src/components`): `document` (head, disclosure bar, header, footer), `frame`, `dish`, `steps`, `hours`,
`menu-category`, `cta-band`, `owner-note`. Pages: `src/pages/` (home, menu, story, visit, order). Business facts exist once and appear identically wherever they are shown (`tests/site.mjs` checks this).
The build **fails** (nothing is written) on bad config: missing fields, a non-`https` ordering URL, duplicate ids or titles, missing media files,
missing alt text, prices or heat out of range, or demonstration text left in a client build (`flags.demo: false`).
`node build.mjs --config <folder> --out <folder>` builds from another config folder (used by `tests/variants.mjs`).

## Reuse for another restaurant
Edit the four files in `config/`, replace the images in `media/`, run `node build.mjs`.
Set `flags.demo` to `false` for a client site: the STS disclosure bar, footer disclosure, sample markers and demonstration notes disappear.
`flags.heroVideo: false` drops the clip: Home shows the poster still with its slow push and the Pause button. `styles.css` holds the palette as tokens at the top of `:root`.

### Ordering URL (MenuSifu or any other)
`ordering.url` in `config/client.json`. While it is `null`, the Order page shows the plainly labelled nonfunctional example.
Set an `https://` URL and the Order page's button links out (new tab, `rel="noopener noreferrer"`); with `ordering.headerCta: "direct"` the header button goes straight to the platform.
This is a link only. No MenuSifu API, iframe, checkout or partnership integration has been built, tested or verified. No cart, payment or POS code exists.

## Design (frontend-design standard, Jade Lacquer)
- **Palette:** jade lacquer ground, pine for the menu and visit tone, charcoal for the kitchen (hero, photographs, footer), celadon for quiet accents, rice for type; **ember is fire only** (the flame, heat dots, the first process node, the primary button).
- **Type:** Young Serif (display, one weight) and Karla (text), sentence case; a 1 KB seal subset (玉 火) for the brand mark.
- **Structure as information:** numbering only for real sequences (the four wok-hei steps); heat dots with text labels; dotted leaders on the menu; hours as a table. No eyebrow labels, no cards.
- **Pages:** each has its own opening move; the cinematic hero lives on Home only. The Menu shows every category with sticky jump links and prints as a plain black-on-white menu. Our story is the quote, one photograph, three short chapters and the seal (玉 火) set large. Visit us is type only, the address as the headline. Order online is one action, three numbered steps, and a note for restaurant owners (demo only). Chapters and the extra Visit details are **sample copy** (`"sample": true`) for a client to replace.

## Hero video: how it behaves
Files: `media/hero-loop.webm` (VP9, 584 KB) and `media/hero-loop.mp4` (H.264, 891 KB), 1280×720, silent, 5.04 s, looped. Configured in `config/copy.json` (`home.hero.video`; set `flags.heroVideo` to `false` and the page falls back to the still).

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
- The Menu has no tabs: every category is on the page, and the jump links are plain anchors (`menu.js` only marks the current one).
- No scroll hijacking, no sound, no carousels. Every page works without JavaScript.

## Files
`serve.py` local server · `config/` content · `src/` and `build.mjs` generator · the five `*.html` built pages · `styles.css` · `site.js`, `hero.js`, `menu.js` (progressive enhancement only) · `media/` · `fonts/` (OFL licences in `LICENSES.txt`) ·
`tests/site.mjs` (page registry, navigation, links, titles, facts, and the structure of every page) · `tests/variants.mjs` (invalid configs fail, live ordering URL, a client build with no demonstration text) · `tests/extracted.mjs` (click through the five pages from index.html in a folder or extracted ZIP) · `tests/qa.mjs` (axe on every page, behaviour, every video fallback, the Menu and its print layout) · `tests/contrast.mjs` (hero text over the photo and video frames) ·
`tests/contrast-sections.mjs` (all other text, every page) · `tests/serve.mjs` · `tools/video-qa.py` and `tools/video-qa-selftest.py` · `lighthouserc.json` (five URLs) · `QA.md` results and critique · `media/PROVENANCE.md`.

## Not done yet
1. Real-device testing: iPhone, Safari (including WebM VP9 playback, Low Power Mode and sticky behaviour), Android, Firefox **[unverified]**. The H.264 fallback is untested in this build's browser (Playwright's Chromium cannot decode H.264).
2. Independent review. Merge or public deployment only with explicit authorisation.
3. Deferred by decision: an "open now" status on Visit us.
