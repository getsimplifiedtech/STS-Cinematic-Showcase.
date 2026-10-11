# Jade & Ember — QA and critique (concept v0.8, all five pages)

Branch `feature/jade-and-ember-brief`. Dates: 2026-10-09. Tooling: Playwright 1.64 + axe-core 4.13, Lighthouse 12.6.1 (`@lhci/cli` 0.15 for the mobile preset, the Lighthouse CLI for the desktop preset), Chromium 1194 (headless, Linux), ffmpeg 6.1. **Nothing was run on a real device.**

> **Terminology note (2026-10-10).** The sections for v0.1 to v0.4 below use vocabulary from the **retired STS Premium Web Design skill** (swap, squint and mute tests, "Part" numbers, premium-versus-template language). They are kept as history only and are not current standards. The active creative authority is Anthropic's Frontend Design skill; see `../docs/JADE_AND_EMBER_FRAMEWORK_REFERENCE.md`. Approvals are recorded in `../docs/JADE_AND_EMBER_APPROVALS.md`; nothing in this file approves v0.8, publication or production readiness.

Re-runnable: `npm run test:a11y`, `npm run test:contrast`, `npm run test:lighthouse`, `npm run test:video-tools`, and `python3 tools/video-qa.py media/hero-loop.webm --poster media/hero-wok.webp`.

## What v0.8 (Gate 2) changed
Numbering note: this build was first labelled v0.7 (commit `bf41373`) and delivered as `jade-and-ember-v0.7-preview.zip`; it is renumbered v0.8 so that the preview you review is distinguishable from the v0.7 ZIP already downloaded. The site content is the same apart from the footer label.

Scope approved: **Our story, Visit us and Order online**, completed on the Gate 1 shared configuration and components; Home, Menu and the hero are untouched in design. Design authority: Anthropic's `frontend-design` skill. No media was generated, no credits spent, nothing merged or deployed. Plan: `docs/JADE_AND_EMBER_FIVE_PAGE_ARCHITECTURE.md`.

| Page | What it is |
|---|---|
| Our story (`our-story.html`) | The quote as `h1`, the bowls photograph edge to edge, three short chapters (the question, the room, the wok) stepped across the page, then **the seal itself**: 玉 in celadon and 火 in ember set very large on the pine band, with a line saying what they mean. The page's one bold moment. Chapters are **sample copy** written for this fictional restaurant (no real people, awards or dates), flagged `"sample": true` in config. No new photograph, and no staff or chef images |
| Visit us (`visit-us.html`) | Type only. The address is the headline element, hours as a table beside it, phone as a `tel:` link, "Get directions" only when `address.mapUrl` is set (no embedded map, no third-party request), then "Good to know" groups (seating, takeaway, getting here, access; the last two are sample copy). No "open now" status, by decision |
| Order online (`order-online.html`) | One action and what follows: `h1`, one sentence, the button (the plainly labelled non-link "Order online (example)" while `ordering.url` is empty; a safe new-tab link when live), three numbered steps (choose, order and pay on the platform, collect), pickup, allergies (the Menu's own note) and a phone fallback, then **"For restaurant owners"** (demo only, and only while the button is the example) |
| Shared | `steps` takes optional links and a modifier; `cta-band` takes a secondary link; new `owner-note` component; the holding-page renderer is deleted; `status` removed from the page registry |
| Configuration | New copy structures for the three pages, validated at build; `client.ordering.pickupNote`. A client build now fails if **any demonstration wording** (fictional, sample, invented, Sampletown, Example Street, (555)...) is left in client, menu, copy or site data. The hero's hidden "AI-generated concept image and video" caption text is now demo-only |

## Results after Gate 2
| Check | Result |
|---|---|
| `tests/site.mjs` | all 7 groups pass, including the structure of the three new pages (chapters and seal, hours and address from config, no photographs on Visit and Order, the example button is not a link, no unreplaced placeholders) |
| `tests/qa.mjs`: axe (WCAG 2.0/2.1/2.2 A and AA, best practice) on **all five pages** at 1440, 820, 390, 320, 844×390 and reduced motion; overflow, 24 px targets, alt text, ids, external requests; hero video, Pause, off-screen pause, mobile nav, reduced motion, no JavaScript, 14 video scenarios; Menu behaviour and print | all pass, 0 violations. It caught two inline links under 24 px on the new pages; both fixed |
| `tests/contrast.mjs` (hero, 374 lines) | 0 below the gate |
| `tests/contrast-sections.mjs`, five pages × 13 viewports | 4267 text blocks, 0 below the 99 % gate (includes the huge seal characters on pine) |
| `tests/variants.mjs` (new) | 9 invalid configurations fail the build and write nothing; a live ordering URL gives a safe `_blank` link on the Order page and goes direct from the header; a **client build** (demo off, indexable, no hero video, live ordering) has no demonstration text, canonical links, no disclosure, no owner note and no "fictional" in any title |
| `tests/extracted.mjs` (new): **index.html in a folder, clicked through all five pages** | pass on the repository folder **and on the extracted v0.8 preview ZIP** (folder contents; `file://` from index.html on desktop and through the 390 px phone menu; `python3 serve.py` on desktop and phone): every page's `h1`, current-nav marker, images, web fonts, no horizontal overflow, the hero video playing on Home (desktop), the Menu jump link landing clear of the sticky bars, and the brand link back to Home |
| Lighthouse mobile preset, 3 runs per page | all five pages: accessibility 100, best practices 100, CLS 0, TBT 0, performance 99 to 100; LCP 1.4 to 2.0 s. SEO 60 to 63: the only failing audit is "page is crawlable", because every page is noindex |
| Lighthouse desktop preset | all five pages: performance, accessibility and best practices 100; LCP 0.4 s; CLS 0 |
| Weight against the architecture budgets (mobile, no video) | Home 174 KiB (190), Menu 129 KiB (130, **tight**), Our story 91 KiB (110), Visit us 67 KiB (80), Order online 67 KiB (80). Home on desktop 799 KiB including the 584 KB WebM |

## Honest critique after Gate 2 (frontend-design standard)
- **Visit and Order are quiet by design, and they read as quiet.** They are the least memorable pages. The address as a headline and the joined steps line carry them; whether that is "restrained" or "thin" next to Home and Our story is for your eye. An optional reused dish frame on Order remains available, at a weight cost.
- **Our story takes its one risk on the seal.** Large Chinese characters can read as decoration. The text beside them says what they mean and the characters are the brand's own mark, but a native reader's view would be worth having. **[unverified]**
- **Chapters, and Visit's "getting here" and "access", are invented sample copy.** Nothing in them is a claim about a real place, and the build refuses to publish them in a client build until they are replaced.
- **Order in the demo state:** the primary action is deliberately a plain, non-link label, so the page has no strong button until ordering is live (the live state, tested, shows the ember button).
- **Repetition:** every page ends with the same closing-band pattern (heading, sentence, ember button). It is consistent, and it is also a template habit.
- **Menu weight (129 of 130 KiB)** is unchanged and leaves no room for a second image there.
- **Unverified:** real devices (iOS Safari including the sticky Menu bar, Android, Firefox), the print layout on paper, 200 percent zoom, a screen reader, and the MP4 fallback in a browser. On `file://` the browser refuses the crossorigin font preload (console message only; fonts load through the CSS and are verified).

## Superseded: v0.6 Gate 1 notes
The Gate 1 section below is kept for history; its "holding pages" no longer exist.

## What v0.6 (Gate 1) changed
Scope approved: shared configuration and components, **Home** and **Menu** only. The Jade Lacquer design (v0.5) is unchanged and the hero (markup, `hero.js`, video logic, fallbacks) is moved, not edited. Design authority: Anthropic's `frontend-design` skill. No media was generated, no credits spent, nothing merged or deployed. Plan: `docs/JADE_AND_EMBER_FIVE_PAGE_ARCHITECTURE.md` (approved at `d717896`).

| Area | Gate 1 |
|---|---|
| Configuration | `config.json` replaced by `config/client.json`, `menu.json`, `copy.json`, `site.json`. Business facts once; the three Home dishes are the menu items that carry a `signature` block, so a price can no longer differ between pages. `flags.demo` controls every STS demonstration element. A validator fails the build on bad config (missing fields, non-https order URL, duplicate ids or titles, missing media, missing alt text, price or heat out of range, sample copy in a client build) |
| Build | `build.mjs` plus `src/lib`, `src/components` (document, frame, dish, steps, hours, menu-category, cta-band) and `src/pages` (home, menu, pending). One standalone HTML file per page in the registry |
| Home (`index.html`) | The v0.5 hero and process unchanged, the three dishes, then **a link to the full menu, a story teaser, a visit strip (address and compact hours) and an order band**. The long menu, story, hours table and order note no longer sit on Home |
| Menu (`menu.html`) | `h1` and a heat legend with the allergen note, one reused flame band (`hero-wok.webp`, already cached from Home, decorative), **sticky jump links**, then all five categories (heading left, list right; the heading stays in view on wide screens). No tabs, nothing hidden. "House favourite" marks the three dishes shown on Home. A print stylesheet gives a plain black-on-white two-column menu |
| Navigation | Home, Menu, Our story, Visit us in the nav, **Order online** as the button at the right (and last in the phone menu); identical on every page with `aria-current="page"`; footer carries the same five links. The header button goes to the Order page |
| Pages not built yet | Our story, Visit us and Order online are **plain holding pages** (real header and footer, one heading, a sentence saying they are built in Gate 2, a link back) so that no navigation link is dead. They are not designed pages and are noindex like the rest |
| Scripts | `site.js` (nav, all pages, 1.1 KB), `hero.js` (Home only, the old hero code verbatim, 5.8 KB), `menu.js` (Menu only, marks the current jump link, 1 KB). The old tab script is gone |
| Content fixes | Menu allergen tags now match the Home dishes (Mapo Tofu "Contains soy", Dan Dan Noodles "Contains peanuts, sesame", which the old list omitted in part). Tags are joined with a comma, not a middle dot. The menu note is split into the allergen sentence (always shown) and the invented-prices sentence (demo only) |

## Results after Gate 1
| Check | Result |
|---|---|
| `tests/site.mjs` (new): five files; unique titles and descriptions; one `h1` per page; heading order; landmarks; ids; nav identical and one current page on every page; footer matches; every internal link and fragment resolves; robots matches config; no external requests or errors; hero video and scripts only where they belong; address, phone, hours and prices come from config | all 6 groups pass |
| `tests/qa.mjs`: axe (WCAG 2.0/2.1/2.2 A and AA, best practice) on **all five pages** at 1440, 820, 390, 320, 844×390 and reduced motion, with overflow, duplicate ids, alt text, 24 px targets, external requests | all pass, 0 violations |
| `tests/qa.mjs` behaviour: Home hero video, Pause, off-screen pause, mobile nav and hero chrome, reduced motion, no JavaScript, 14 video scenarios | all pass (49 checks in the run) |
| `tests/qa.mjs`: **Menu** (five categories visible, no tab roles, sticky jump links sit under the header, every jumped-to heading clear of the sticky bars, current link marked, keyboard order, print layout hides header, band, jump links and order band, white ground, two columns, prints in 1 to 3 pages) | pass |
| `tests/contrast.mjs` (hero, 374 lines) | 0 below the gate; worst single pixel 5.63:1 |
| `tests/contrast-sections.mjs` now over **five pages × 13 viewports** | 3422 text blocks, 0 below the 99 % gate |
| Lighthouse mobile preset, 3 runs per page | all five: accessibility 100, best practices 100, CLS 0, TBT 0; performance 99 to 100; LCP 1.7 to 1.9 s on Home and Menu, 1.4 s on the holding pages; SEO 63 (Home, Menu) and 60 (holding pages), because every page is noindex |
| Lighthouse desktop preset | Home and Menu: performance 100, accessibility 100, best practices 100, LCP 0.4 s, CLS 0 |
| Weight against the architecture budgets (mobile transfer, no video) | Home 173 KiB (budget 190), Menu 128 KiB (budget 130, **tight**), holding pages 65 KiB. Home desktop 793 KiB including the 584 KiB WebM |

## Honest critique after Gate 1 (frontend-design standard)
- **Home is now a tour, and it reads quieter.** After the dish frames come three type-only bands (story teaser, visit strip, order band) that each use a heading, a short block and one link. Their tones alternate (pine, lacquer, pine) and the story teaser is indented, but the repeated heading-plus-text pattern is the most "template" part of the page. The links are small text links and may under-sell the next step; the order band's ember button is the only strong action below the dishes.
- **Menu works as information; it is not an immersive page.** One photograph (the reused flame band), then lists. That suits a menu, and the sticky headings and jump links help, but nothing on the page is as memorable as the hero. Whether the band reads as relevant or as a stock banner needs your eye.
- **The Menu sits at its weight budget (128 of 130 KiB)** because the band is a 61 KB poster crop. Any further image on that page would break the budget.
- **Holding pages are plainly unfinished** by design; the preview shows them as such.
- **Menu list layout:** at 1024 to 1279 px the list is a single column and long; on a phone the jump bar scrolls sideways (links stay focusable); the "House favourite" line adds a row to three items.
- **Unverified:** real devices (Safari/iOS sticky behaviour and the sideways jump bar, Android, Firefox), the printed menu on paper or in other browsers, 200 percent zoom, a screen reader, and the MP4 fallback in a browser.
- **Changes from the approved plan:** holding pages added so the navigation has no dead links; the allergen tags and the middle-dot separator fixed as part of the menu migration; the footer now carries the five-link navigation; a visually hidden "(example, not functional)" suffix is no longer needed in the header because its button goes to a real page.

## Superseded: v0.5 (single page)
The sections below describe earlier single-page versions. They are kept for history.

## What v0.5 changed (Direction B, Jade Lacquer, with Direction A's four-step process)
**Design authority changed.** The deprecated STS Premium Web Design skill is no longer used. Creative direction follows Anthropic's `frontend-design` skill (`getsimplifiedtech/sts-web-design-framework`, branch `feature/anthropic-frontend-design-standard`, `.claude/skills/frontend-design/SKILL.md`). The brief's pinned palette (charcoal, jade, warm ember, rice) is kept; engineering rules (fallbacks, accessibility, performance, `noindex`, the approved hero footage) are unchanged. Approved by the owner after a written proposal. No media was generated, no credits spent, nothing merged or deployed. This is an STS portfolio demonstration: diners are the simulated end users, restaurant owners are the commercial audience.

| Area | v0.5 |
|---|---|
| Palette | The page is a deep jade lacquer `#1E4A3C`, with Pine `#12302A` for the menu, visit and header, Kitchen `#101211` for the hero, disclosure bar and footer, Celadon `#A9D2BE` for quiet accents, Rice `#F1EBDB` for type. **Ember `#F08A3C` is fire only**: the flame, heat dots, the first process node, the seal and the one primary button (See the menu) |
| Type | Young Serif (display, one weight) and Karla (text, 400 and 600), self-hosted with metric-matched fallbacks (CLS stays 0). Instrument Serif and Hanken Grotesk removed; licences updated. Sentence case throughout; lining proportional numerals in the serif |
| Photography | Three dishes and the story picture run edge to edge as 2.2:1 frames, no inset, frame, card or fade. Above 1680 px the frame is capped (the sources are 1200 px) and its outer edges soften into the jade. The second plate puts its text above its frame so the three do not repeat the same picture-then-caption rhythm |
| Removed | All eyebrow labels and gradient dashes (the hero keeps one plain sentence-case descriptor), the 01 to 03 numbering on dishes (not a sequence), caps-tracked buttons, spaced em-dash labels, middle dots, the dashed button, the cream menu section, the v0.4 feathered masks |
| Kept as information | Heat dots, dotted menu leaders, allergen tags, hours table, the fictional disclosures |
| Process | "Heat is the ingredient" now has the four wok-hei steps joined by one line and numbered 1 to 4, because they are a real sequence (fire, steam, toss, plate). Horizontal on desktop, two rows on tablets, a vertical line on phones |
| Copy | "Order these first." replaces "Three plates we are known for."; "Find us (sample details)"; the example-order note is now headed "For restaurant owners"; the example button reads "Order online (example)"; footer lines separated without middle dots |
| Kept | Hero markup, video logic and every fallback; `site.js` untouched; menu tabs; order and nav behaviour |

**Results after v0.5**
| Check | Result |
|---|---|
| `tests/qa.mjs` (axe at 1440, 820, 390, 320, 844×390, reduced motion; overflow, 24 px targets, video scenarios, tabs, nav, no-JS) | all 24 pass, 0 axe violations |
| `tests/contrast.mjs` (hero, 374 lines, 14 viewports, video frames at 960 px and up) | 0 below the gate; worst single pixel 5.63:1 |
| `tests/contrast-sections.mjs` (now **all text below the hero**: disclosure bar, header, every section, footer; 13 viewports from 2560 down to 320 and 844×390) | 1232 text blocks, 0 below the 99 % gate. The worst single pixel (1.40:1) is the header button's celadon border, not text |
| Lighthouse mobile preset, 3 runs | performance 100, accessibility 100, best practices 100, SEO 63 (intentional `noindex`); LCP 1.7 to 1.9 s, CLS 0, TBT 0 |
| Lighthouse desktop preset | performance 100, accessibility 100, best practices 100; LCP 0.5 s, CLS 0, TBT 0; 802 KiB total (584 KiB of it the WebM) |
| Weight | mobile transfer rose from 142 KiB to 174 KiB: three font files are used above the fold (Young Serif 27 KB, Karla 400 and 600 at 13 KB each) against two before |

One test fix: `tests/contrast.mjs` failed once with a non-finite video duration (it seeked before the metadata arrived). It now waits for the duration first; two full re-runs pass. The test, not the page, was at fault, but I did not investigate the original flake further.

**Honest critique against the `frontend-design` skill**
- *Where it earns its place:* jade is now the ground and not a small accent, the flame hero is still the one memorable thing, ember is rationed, and the numbered process is a real sequence.
- *Still on the default list:* a dark kitchen hero with an orange accent is the skill's trait #2. The brief pins the palette, so I limited ember to fire and made jade the ground; I have not seen a real viewer's reaction. The hero is still left text over a right-hand image. Young Serif plus a clean grotesque is a considered pairing, not a risky one.
- *Rhythm:* four full-width 2.2:1 frames (three dishes and the story) share one crop and one grade. The second plate's text-above order and the quote-first story break it only a little. The three dishes are all dark ceramic on grey slate, so they can feel alike.
- *Resolution:* the 1200 px photographs are shown up to 1680 px wide (1.4× upscaling), softest on large screens. I have not checked this on a real 4K or high-density display. [unverified]
- *Colour:* the jade ground is judged by computed contrast and screenshots only; real monitors will vary. [unverified]
- *Not tested:* real devices (Safari/iOS, Android, Firefox), 200 percent zoom, a screen reader, and the MP4 fallback in a browser.
- *Typography judgement:* Young Serif is heavier and friendlier than the previous display face; whether it fits a "modern" kitchen is a taste call for review.

## Superseded: v0.4 (feathered photography)
The v0.4 section below describes the previous direction (dark ground, feathered plates, cream menu). It is kept for history; v0.5 replaces it.

## What v0.4 changed (composition only)
Brief: the photo presentation read as blocky and early-2000s; make it more immersive, editorial and future-forward without neon or gimmicks. Kept: brand, palette, type, cinematic hero and its video logic and fallbacks, content and section order, `noindex`, performance and accessibility rules. No media was generated or edited, no credits spent, nothing merged or deployed. `styles.css` and the menu markup in `build.mjs` changed; `site.js` did not.

**What looked wrong in v0.3.1 (my critique before changing anything)**
- Every photograph was a hard-edged rectangle, about half the content width, sitting on a page that is much darker than the photo's own backdrop (source images are mid-grey at their edges, the page is #0f1110). The boxes were visible even on a dark page.
- Every section opened the same way: label dash, heading, then one block. Image-beside-text appeared three times in a row (signature) and once more (story).
- Boxed or ruled furniture: ruled four-up index, dashed order note, dashed example button, outlined hero button, a ruled row table for the hours, filled button in the menu bar, hard seams (a rule and a tonal step) before Visit and Order, and a hard cut at the foot of the hero.

**Design thesis:** plates are lit out of the page's own darkness. Type sits in the negative space and steps onto the feathered edge of the light.

| Area | v0.4 |
|---|---|
| Photographs | No frame. CSS `mask-image` with eased (smoothstep) feathers on every edge that is not the screen edge. Linear feathers still showed an edge on the bright source backdrops; the eased ramps fixed that. Browsers without mask support get a plain rectangle (degrades, not breaks) |
| Signature | Three different relationships to the screen edge: plate 1 bleeds off the left and its name steps onto the feathered right edge; plate 2 bleeds off the right with the text hanging low on the left; plate 3 is one wide band, feathered on both sides, with the text sliding up under it. Names are larger, numerals smaller, the rule above the meta line is gone |
| Rhythm | Intro is type only; its four elements step down the page instead of a ruled row. Signature is image-led and bleeding. Menu is a split (heading and note left, list right). Story overlaps quote and picture and bleeds right. Visit is type only with a serif hours list. Order is a quiet close. The hero now dissolves into the page |
| De-boxing | Dashed order note and dashed example button, outlined hero button, ruled hours table, filled menu button, section border and tonal step before Visit and Order all removed or softened |
| Phones | Plates run edge to edge, feathered at the foot, the name rising into the feather; plates 2 and 3 inset on opposite sides. Story picture is drawn up under the quote |
| Kept | Hero markup and CSS (only a bottom fade and a text-link secondary button were added), `site.js`, tab behaviour, all copy, palette, fonts |

**New test:** `tests/contrast-sections.mjs` (`npm run test:contrast-sections`) measures text that sits on or beside a photograph below the hero. It found a real failure on its first run: the small plate numerals overlapped the photo on tablets and phones (down to 2.6:1). Fixed by reducing the overlap there. Now 260 text blocks over 13 viewports (2560 down to 320, plus 844×390): 0 below the 99% gate, worst single pixel 4.15:1.

**Results after v0.4**
| Check | Result |
|---|---|
| `tests/qa.mjs` (axe at 1440, 820, 390, 320, 844×390, reduced motion; overflow, targets, video scenarios, tabs, nav, no-JS) | all pass, 0 axe violations |
| `tests/contrast.mjs` (hero, 374 lines) | 0 below gate, unchanged |
| `tests/contrast-sections.mjs` (new) | 260 blocks, 0 below gate |
| Lighthouse mobile preset, 3 runs | performance 99 to 100, accessibility 100, best practices 100, SEO 63 (intentional `noindex`); LCP 1.7 to 2.0 s, CLS 0, TBT 0, 142 KiB |
| Lighthouse desktop preset | performance 100, accessibility 100, best practices 100; LCP 0.5 s, CLS 0, TBT 0; 839 KiB (584 KiB of it the WebM) |
| Page weight | `styles.css` grew from 24 KB to 31 KB raw (the eased gradient strings); mobile transfer is unchanged at 142 KiB |

**Honest critique after the change (swap, squint, mute)**
- *Squint:* the page now reads as light pools in the dark with type beside them, where before it read as boxes. The one remaining hard block is the cream menu section, kept on purpose as the "printed menu".
- *Swap test:* the feathered-plate-on-black treatment is more current than before, but it is a recognised premium-restaurant idiom, not something only Jade & Ember could say. The brand-specific parts are still the jade/ember dash, the flame hero and the copy.
- *Mute:* unchanged; reduced-motion and Save-Data visitors still get the designed still.
- *Still template-like:* the label-dash-plus-heading opening is still used on every section (kept as the brand device); section padding is still generous and fairly even; the hero is still a left-text, right-image split.
- *Image resolution:* the plates are 1200 px sources shown up to 1320 px (desktop cap) and the dish-3 band up to 1560 px, so up to 1.3× upscaling. The feathering and darkness hide it at 1440; I have not judged it on a high-DPI 27 inch or 4K display. [unverified]
- *Cropping:* the large crops (5:4 and 21:9) trim the plates' sides; Mapo Tofu bleeds close to the left edge. Looks intended in screenshots, but it is a taste call.
- *Menu split:* the left column is empty for much of its height on desktop, and the tab panels change the list height. Acceptable, not elegant.
- *Not checked:* real devices (Safari/iOS mask rendering, `mask-composite` in older Safari, Firefox), scroll feel, 200 percent zoom, a screen reader. [unverified]

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

## v0.9 Gate 1: engineering checks (2026-10-10, owner authorisation `APR-JE-020`)
Chromium 141.0.7390.37 via `CHROMIUM_PATH`, Playwright 1.64.0, Node 22. Run with `npm run verify` (details: `engineering/README.md`). **Result: 7 of 7 checks pass; the candidate is identical to the frozen v0.8 baseline in every layer.**
| Check | Result |
|---|---|
| `check:baseline` | Branch `baseline/jade-and-ember-v0.8` at `32afde77d29b3a30443c17ad7ea27d7882adcd5d`; trees match; 60/60 source checksums; preview package matches |
| `check:schema` | 4 schemas valid (Ajv strict); config valid under both validators; 43/43 corpus cases agree; the build refuses broken config and writes nothing |
| `check:determinism` | Two builds identical; committed pages equal a fresh build; identical under another time zone, locale, cwd, project path, timestamps, `NODE_ENV`; 17 build sources free of clock, random, environment and locale calls |
| `check:delivery` | 23 delivered files, same as the v0.8 package; 143 references resolve inside the folder; no tooling or module references |
| `check:authority` | Authority record and framework reference agree; APR-JE-016 to 020 present; 30 mentions of the retired skill, all historical and marked; against a framework checkout: skill and licence SHA-256 match at `d2803c0` |
| `check:regression` | source 27, text 35, structure 35, styles 35, pixels 39, behaviour 13 comparisons: **0 differences**, no pixel tolerance needed |
| `check:selftest` | 27 mutation cases (wrong baseline, hand-edited page, random output, forged hash, retired skill as authority, absolute path, module import, one added character, 2 px seal change, one-step colour change, changed Pause label, replaced font, changed config) all caught by the intended layers |
Existing suites re-run on the same build: `test:a11y`, `test:site`, `test:variants`, `test:extracted`, `test:contrast` pass. **Not covered by Gate 1:** keyboard, reflow, text-spacing and zoom suites, forced colours, budgets, security headers, links, portability, Firefox and WebKit (not installed here), CI, real devices.

## v0.9 Gate 2: accessibility, performance, media and component contracts (2026-10-10, `APR-JE-021`)
Chromium 141.0.7390.37, Playwright 1.64.0, Node 22. `npm run verify`: **16 of 16 checks pass, 8 min 21 s** (Gate 1 suite before Gate 2 changes: 7 of 7, 3 min 55 s). Gate 1 groups re-run after the changes: baseline, schema, determinism, delivery, authority, regression (0 differences in source, text, structure, styles, pixels and behaviour) and the mutation self-test all pass.
| Check | Result on v0.8 |
|---|---|
| `check:keyboard` | 172 Tab stops (5 pages x 1440 and 390 px): DOM order, no trap, Shift+Tab reverses, 172 focus indicators visible by pixel comparison, none hidden, skip link into `<main>`, phone menu by keyboard, 162 target sizes (24 px all, 44 px primary actions). No defect |
| `check:reflow` | 320 px, 200% zoom and text spacing on all pages: no sideways scroll, clipping or overlap. No defect |
| `check:forced-colors` | 683 text lines and 162 controls in forced-colours emulation: readable, controls drawn, focus indicators shown; 0 `forced-color-adjust: none` opt-outs. No defect |
| `check:a11y-tree` | 937 tree nodes: landmarks, headings, names, ARIA references, current page. No defect |
| `check:order` | 234 consecutive heading and control pairs: screen order follows DOM order. No defect |
| `check:budgets` | Delivered 1,977,386 bytes, +0.00% against the v0.8 baseline. Page initial transfer at most 232,012 bytes gzip (upper bound); at 390 px, throttled (150 ms, 1.6 Mbit/s, CPU x4): worst LCP 1,052 ms, CLS 0, blocking 45 to 57 ms, interaction 32 ms, 10 requests, 173,982 bytes |
| `check:media` | 8 media files and 4 fonts: formats by bytes, sizes, config, alt text, loading, video attributes, silence, 5.04 s duration; flash proxy 0 reversals per second on both clips; no video or animation under reduced motion, Save-Data or 2g; video only at 960 px and wider on Home; Pause present and effective. One documentation finding, F-G2-01 |
| `check:contracts` | 16 components and helpers and 5 page renderers, 170 assertions. Found one engineering inconsistency (see below) |
| `check:selftest-gate2` | 41 targeted negative tests, all caught by the intended check |
Existing suites re-run: `test:a11y`, `test:site`, `test:variants`, `test:extracted`, `test:contrast`, `test:contrast-sections` pass (contrast: 0 of 374 hero lines and 0 of 4,267 other blocks below the gate).

**Findings.** No accessibility, performance or media defect needing a visible change was found; nothing was changed in the approved appearance. (1) **F-G2-01 (Minor, documentation, non-visual, open):** `media/PROVENANCE.md` states no licence or rights terms (audit m-8). Proposed correction: add a short "Rights and licence" section. It sits in the frozen `media/` folder and the preview package, so it needs owner approval; not changed. (2) **Engineering correction made (non-visual, output byte-identical):** the contract check showed that the `cls` parameter of `orderLink` (`shared.mjs`) and `frame` (`frame.mjs`) was written into markup without escaping. All callers pass constants, so no page was affected, but the contract says every input is escaped; both now call `esc()`. The five built pages are byte-identical before and after (determinism and regression checks).

**Manual verification still required (not replaced by automation):** screen-reader pass (NVDA, VoiceOver, TalkBack); real iPhone, Android and tablet; real Windows high-contrast mode; real-browser 200 and 400 percent zoom and text-only zoom; a person's keyboard-only walk; a person's look at the hero clip for flicker and the loop seam; the direction-conformance critique against Anthropic Frontend Design; field (not lab) performance. **Not covered:** Firefox and WebKit (not installed here), security headers and CSP, privacy/dependency/secrets checks, HTML validation and links, portability, CI, release manifest.

## v0.9 Gate 3: security, portability, integrity and CI (2026-10-10, `APR-JE-022`)
Chromium 141.0.7390.37, Playwright 1.64.0, Node 22. **`npm run verify`: 25 of 25 checks pass, in a fresh clone of the pushed commit after `npm ci --ignore-scripts` (the CI steps, run locally): 14 min 02 s including the install; 13 min 16 s for the same suite in the working tree.** Gate 2 suite before Gate 3 changes: 16 of 16, 8 min 21 s. The Gate 1 and 2 groups pass unchanged, including the regression check (0 differences from v0.8 in source, text, structure, styles, pixels and behaviour). Existing suites (`test:a11y`, `test:site`, `test:variants`, `test:extracted`, `test:contrast`, `test:contrast-sections`) pass.
| Check | Result on v0.8 |
|---|---|
| `check:security` | `default-src 'none'` CSP without `unsafe-inline` or `unsafe-eval`; the one inline script and six inline style attributes by SHA-256 hash; 8 headers; `_headers`, nginx and Apache outputs agree. 10 page loads under the headers: 0 violations, 0 console messages, hero video plays. Candidate under the headers equals v0.8 served plain: 60 comparisons, 0 differences. Probes blocked over HTTP: injected inline script, inline handler, external script, unlisted inline style, iframe, external image; the same injected script runs over `file://` |
| `check:privacy` | 8 scripts scanned for 30 forbidden APIs; 5 outbound links all to `getsimplifiedtech.com`; 10 browser loads: no cookies, storage, service worker; only same-origin requests |
| `check:deps` | No runtime dependencies; 7 development tools pinned exactly; 341 locked packages (registry, https, sha512); licences allow-listed, one unverified (`parse-cache-control`); audit: 0 production, 0 critical, 11 high in the development-only Lighthouse CI tree (recorded) |
| `check:secrets` | Working tree and every commit's added lines: none found |
| `check:tokens` | 31 tokens equal the frozen snapshot; 33 `var()` references defined; 42 colour literals outside `:root` (recorded 42); 16 contrast pairs pass |
| `check:assets` | Manifest of 23 delivered files (1,977,386 bytes) equals a fresh build and the v0.8 checksums; hashed copy (18 files renamed) equals v0.8 in the browser: 63 comparisons, 0 differences |
| `check:portability` | Extracted ZIP in a path with spaces, `&`, em dash, `#`, brackets over `file://`; domain root; `/clients/acme/jade-and-ember/`; no-trailing-slash redirect; extension-less URLs; no Range support; query strings and fragments: all walks pass (desktop, phone menu, brand and footer links, Back/Forward). Known finding F-G3-01 |
| `check:ci` | Workflow read-only, 4 actions pinned to SHAs, no secrets, deployment, merge or AI service, `npm ci --ignore-scripts`, timeouts, documented. **Not yet run on GitHub** |
| `check:selftest-gate3` | 68 targeted negative tests, all caught |

**Findings (none visual).** F-G2-01: wording for the media rights amendment proposed in `docs/JADE_AND_EMBER_MEDIA_RIGHTS_PROPOSAL.md`, **not applied**, nothing asserted. F-G3-01: over `file://` Chromium logs up to 6 console messages per page load about the two font preloads (CORS from origin "null"); fonts load, nothing changes on screen. Open decision D-11: the CSP relies on `'unsafe-hashes'` for six inline style attributes (image crop points); Chromium honours it, Firefox and Safari are untested (see `engineering/ENG-SECURITY.md`).

**Not covered / release blockers:** v0.8 and v0.9 are not approved for deployment or production; no deployment has been made. Open: Firefox and WebKit runs, real-device and screen-reader testing, HTML validation and link checks, release manifest and approvals gate, production SEO files (D-7), the CI run on GitHub, Windows and macOS tooling, decision D-11, owner decisions on F-G2-01 and F-G3-01, license verification of the generated media and of `parse-cache-control`.

## v0.9 Gate 4: validation, SEO files, release control and hosting (2026-10-10, `APR-JE-023`)
Chromium 141.0.7390.37, Playwright 1.64.0, Node 22. **`npm run verify`: 31 of 31 checks pass locally (17 min 57 s), and again after the budget correction (31 of 31, `b24ec81`)**; the Gate 1 to 3 groups pass unchanged (regression against v0.8: 0 differences in source, text, structure, styles, pixels and behaviour; delivered bytes 1,977,386, +0.00%). Older suites: `test:a11y`, `test:site`, `test:variants`, `test:extracted` and `test:contrast-sections` pass; `test:contrast` passed on one run and failed on another with a timeout waiting for the hero video's metadata (a flaky wait in a test file untouched since v0.5, outside `verify` and CI; reported, not changed).

| Check | Result |
|---|---|
| `check:html` | 5 demonstration pages and 5 indexable client-build pages pass html-validate (recommended, document, accessibility). 4 rules off, each with a recorded reason. Known finding F-G4-01: 6 phone numbers can wrap (owner decision; recommended: leave) |
| `check:links` | Every `href`, `src`, `srcset`, video source and CSS `url()` resolves with exact letter case; every fragment names exactly one element; all pages reachable and cross-linked; client sitemap and canonicals name delivered pages. **External reachability was not verified** (the sandbox proxy refuses outbound requests); `npm run check:links -- --online` is ready |
| `check:seo` | Demonstration: all five pages `noindex, nofollow`, no canonical, JSON-LD, sitemap or robots file. Indexable client build: unique canonicals, `sitemap.xml`, `robots.txt`, Restaurant JSON-LD on Home only; byte-identical across two builds; hostile text cannot break out of markup; no licence or rights claim; served correctly in the browser |
| `check:release` | `VERSION.json` 0.9.0-dev, channel demonstration (inferred from the configuration); manifest valid under two validators and deterministic; gate passes a fully approved invented client build and blocks it for each of 27 single missing requirements; a demonstration passes only while `noindex`. **Real state: a client-production release would be blocked by 11 unmet requirements** (clean tree, verification of the release commit, stable version, release approval, rights verification, real-device, screen-reader, browser-matrix and CI evidence, no demo text, production SEO) |
| `check:hosting` | Static folder under the Cloudflare Pages limits, no application, redirect, worker, vendor or secret file, nothing referring to Vercel; generated `_headers` (domain root and sub-path, both builds) within 100 rules and 2000-character lines, security headers once, CSP equal to the computed policy |
| `check:selftest-gate4` | 93 targeted negative tests, all caught |

**Dependency advisories (scope item 7).** `engineering/DEPENDENCY-ADVISORIES.md`: the 11 high advisories are all in the development-only Lighthouse CI tree (`@lhci/cli` 0.15.1, the latest release), four real advisories (extract-zip, basic-ftp, tmp, plus moderate uuid and sprintf-js) and the rest inherited. None is reachable in this project's use (no untrusted archive, FTP server, PAC proxy or editor prompt) and none is in `verify` or the delivered site. Tested in a scratch copy only: overrides cut 11 high to 6 (extract-zip has no patched release); removing the package gives 0. No change made; the owner chooses.

**Remote CI (scope item 1), actual results.** Run 1 (`3c3c79a`) and run 2 (`d205d26`) failed; run 3 (`8a3c9af`, the Gate 4 push) failed: 30 of 31 checks passed on the GitHub runner, including all Gate 4 checks and the regression against v0.8 (0 differences); the macOS fast job passed. The only failure was `check:budgets` interaction latency (567 to 746 ms with an idle main thread). The correction is described in `engineering/CI.md`: the budget gates the page's own handler time, with a negative test for a slow handler. Run 4 (`38059526037`, `b24ec81`, the push carrying the correction) **succeeded**, confirmed from the GitHub API: `verify` on Ubuntu 24.04 (all 31 checks, 11 min 54 s) and the informational macOS job. The correction changed what is measured after a remote failure (see `engineering/CI.md`), so it is for the owner to accept. A later docs-only push starts another run; its result is not assumed.

**Decisions recorded (`APR-JE-023`).** D-11: the hash-based CSP is retained; Firefox and WebKit must be tested before production deployment; photo cropping is not refactored. F-G2-01: media rights Option A accepted as a documentation policy (`docs/JADE_AND_EMBER_MEDIA_RIGHTS_POLICY.md`); nothing asserted; the frozen baseline untouched. F-G3-01: accepted as a documented limitation.

**Not covered / release blockers:** v0.8 and v0.9 are not approved for deployment or client production; nothing was merged, deployed or published, no media was added, no paid AI call was made, and the STS framework repository was not changed. Open: Firefox and WebKit runs, real-device and screen-reader testing, external link reachability, the remote CI pass, owner decisions on F-G4-01 and on the advisory options, no release approval and no rights verification exist, Windows tooling.

## v0.9 Gate 4 reconciliation (2026-10-10, `APR-JE-024`; not Gate 5)
Chromium 141.0.7390.37, Playwright 1.64.0, Node 22. **`npm run verify`: 32 of 32 checks pass locally (about 16.5 minutes of checks)**; 159 Gate 4 negative tests (151 detections, 8 "must find nothing" assertions) all behave. Older suites: `test:a11y`, `test:site`, `test:variants`, `test:extracted`, `test:contrast` and `test:contrast-sections` pass (`test:contrast` failed once earlier on a timeout waiting for the hero video's metadata and passed on its two other runs; a flaky wait in a test untouched since v0.5, outside `verify` and CI). No change to any page, style, script, media or font of the demonstration (`check:determinism`, `check:regression`: 0 differences against v0.8; delivered bytes 1,977,386, +0.00%).

| Item | Result |
|---|---|
| `llms.txt` | Generated for indexable client builds only, validated against the pages (links = sitemap, facts printed on the Visit page, no invented fact, no foreign host, no local path or secret, no demo or rights wording, Markdown-injection safe). The fictional demo publishes none (checked in `check:seo`, `check:hosting`) |
| Crawler policy | `seo.crawlers` (search, aiSearch, training) rendered into `robots.txt`; four variants verified; search indexing cannot be disallowed. **The agent names were not re-fetched from provider pages (no network): re-verify before release** |
| SEO validation | Unique non-empty titles and descriptions, `og:url` equal to the public URL (indexable only), facts agreeing across pages, structured data and `llms.txt`, foreign and staging/example hosts excluded (15 reserved names recognised, 4 real-looking domains not flagged). The build now also refuses structured data whose address is not the one printed |
| Host-aware URLs | `seo.host` and `seo.urlStyle`; canonical, `og:url`, sitemap, JSON-LD and `llms.txt` use the final public URL; the `.html` files stay for local use. Simulated hosts: Cloudflare Pages and Vercel with `cleanUrls` (17 public URLs answer 200 directly, 54 internal links resolve, 25 of them after one redirect to the same page), Vercel default and a plain server (no redirects). Cloudflare Pages with extension URLs is refused by the build, and the simulation reports 308s for it. **Provider documentation was not re-fetched and nothing was deployed; the behaviour modelled is the owner-confirmed behaviour. Live verification is still required** (see `engineering/HOSTING.md`) |
| Release gate | `search-review` approval bound to the digest of the generated search artifacts; `productionDomain`; `searchReadiness`. 40 single defects each block a client-production release. **No search review, release approval or rights verification exists**; a client-production release is blocked by 13 unmet requirements |
| F-G4-01 phone numbers | `check:phone`: 27 measurements (3 phone links x 9 supported widths, 320 to 768, portrait and landscape): none wraps, overflows, is clipped or covered; all are readable and pressable. Accepted without visual change |
| Latency | See the next paragraph |

**Interaction latency, honest status.** Remote run 6 (`6f718a8`) succeeded (all 32 checks; verify step 13 min 00 s; macOS job succeeded). In that run `check:budgets` reported, for the first time, the end-to-end figure: **784 ms, of which 751 ms input delay, handler 2 ms, presentation 29 ms**, on the runner (Chromium 156). The probe, run minutes later on the same runner with the same CPU x4 + network profile, measured **at most 26 ms** for opening the phone menu in every condition and dispatch method it tried (heartbeat gap at most 47 ms, no long task over a few). So the page's code is not slow, and the main thread was idle during the long delay, but the delay is **reproducible only inside `check:budgets`'s own sequence on the runner**, not in the probe's click. The difference between the two is that `check:budgets` also presses Escape 150 ms after the click and that Playwright's click first moves the mouse (`pointerover`/`pointerenter`/`mouseover` events precede `pointerdown`). Locally the same sequence is fast (13 to 30 ms). The budget check now names the slowest event, and the probe now replays the exact sequence and lists delay/handler/duration per event name; their runner output decides which event is slow. **Cause unproven; recurring user-visible latency is not demonstrated either way** (the lab figure is a headless synthetic input; no real device has shown it).

**Remote CI.** Runs 6 (`6f718a8`) and 7 (`db6439e`) succeeded, both jobs each, confirmed from the API (32 of 32 checks on the runner; regression against v0.8: 0 differences in source, text, structure, styles, pixels and behaviour). Run 7 named the slow event: **`pointerover`** (the hover event of Playwright's mouse move), input delay 771 ms, handler 2 ms; no page code listens to it, the probe reproduces the identical events on the same runner at 1 to 5 ms. The delay is therefore deterministic and tied to the budget check's own set-up, not to the website and not to general runner slowness. Run 8 (`2a52156`, both jobs succeeded) added an isolation experiment: the response-body hook, the older test server and the budget check's observer script, one at a time and all together, each give `pointerover` delays of 0.4 to 1.4 ms on the same runner while `check:budgets` in the same job reported 753 ms. So none of the three explains it. **The cause is not proven**: ruled out are the page's code, the Escape key and those three set-up details; open are state of the long-running `verify` process or contention while the budget check runs, the budget check's own driving, or the runner at that moment. A further experiment (the real `measureRuntime` in a fresh process after `verify`) is proposed in `engineering/CI.md` and awaits the owner's go.

**Decisions and restrictions kept.** v0.8 baseline unchanged (`32afde7`); no design or media change; no framework-repository change; no merge, deployment, preview or paid call. v0.8 and v0.9 are still not approved for deployment or client production.

## v0.9 Gate 4: CLOSED (2026-10-10, `APR-JE-025`)
**Gate 4 and its reconciliation are approved and closed by the owner on the evidence below.** Closure approves engineering work only: it is not a release, rights, search-review or deployment approval, and it does not begin Gate 5.

| Preserved evidence | Result |
|---|---|
| Local `npm run verify` | **32 of 32 checks** (about 16.5 minutes of checks); regression against v0.8: 0 differences in source, text, structure, styles, pixels and behaviour |
| Gate 4 negative tests | **159** (151 detections, 8 "must find nothing" assertions), all behave; Gate 2: 42, Gate 3: 68, Gate 1 mutation tests: all pass |
| Remote CI, confirmed from the GitHub API | Run 7 `db6439e` success (both jobs); **run 8 `2a52156` success (both jobs): the last verified code commit**; **run 9 `14f09f1` success (both jobs): the documentation commit**. Runs 1 to 3 failed earlier for the reasons recorded in `engineering/CI.md` |
| Demo vs v0.8 | A fresh build equals the v0.8 commit's five pages byte for byte; no delivered file or configuration differs from `32afde7`; the baseline branch is unchanged |
| F-G4-01 | **Accepted without visual changes** (`APR-JE-024`); `check:phone` holds the condition: readable, operable, no overflow or clipping at 9 supported mobile widths |

**Open, non-blocking diagnostic: interaction-latency anomaly.** On the CI runner, `check:budgets` reports end-to-end 753 to 792 ms for opening the phone menu (slowest event `pointerover`, handler 2 ms, main thread idle); locally it is 40 to 56 ms and the probe's identical events on the same runner take 0.4 to 5 ms. Ruled out: the page's code, the Escape key, the response-body hook, the test server and the observer script. Cause unproven (state of the `verify` process or contention, the budget check's own driving, or the runner). The handler-time limit remains the enforced budget; end-to-end latency stays reported and not gated. By owner decision no further experiment is run and no threshold is relaxed.

**Production-release blockers preserved (none resolved by this closure):** no release approval; no rights verification (generated media rights unverified); no search review for the generated search artifacts; no real-device, screen-reader or Firefox/WebKit browser-matrix evidence; a client-production release would be blocked by 12 unmet requirements on a clean tree (13 on a dirty one); no stable version (0.9.0-dev); crawler agent names not re-fetched from provider pages; Cloudflare Pages and Vercel behaviour simulated, not verified live; external link reachability not checked; the 11 high development-dependency advisories accepted, none remediated; `og:image` not generated. v0.8 and v0.9 are not approved for public deployment or client production.

**Post-closure housekeeping (owner instruction).** Closure commit `7980cf4`: GitHub Actions run 10 successful on both jobs (confirmed from the API). The temporary latency probe step was then removed from the routine workflow; `engineering/tools/latency-probe.mjs`, the recorded evidence and the findings are preserved, and `check:budgets` remains in `npm run verify` with unchanged limits and handler-time enforcement (details and the result of the housekeeping commit's run: `engineering/CI.md`). No site, design, media, framework, threshold or experiment change; Gate 4 is not reopened.

**Next milestone.** Gate 5 is authorised for planning and assessment only (`APR-JE-026`); the plan is `engineering/GATE-5-PLAN.md` and awaits the owner's review. Nothing in it is implemented. It is to cover the remaining cross-browser, real-device, accessibility, external-link and release-readiness requirements without reopening approved Gate 4 engineering.

## v0.9 Gate 5, Phase 0: baseline (2026-10-10, `APR-JE-027`)
**Approved starting commit: `51c7377`** (the Gate 5 plan, approved by the owner). Frozen v0.8 baseline: branch `baseline/jade-and-ember-v0.8` at `32afde7`, unchanged; the demonstration's five pages are byte-identical to it and no delivered file or configuration differs from it.

| Item | Baseline |
|---|---|
| Housekeeping commit `5d1614e` (probe step removed) | Its own run, **run 11, was cancelled**, not passed: the workflow cancels an older run when a newer push arrives and the plan commit was pushed while it ran. It is verified by **run 12**, which carries the same tree and workflow: the `verify` job's steps no longer include the probe step. |
| Planning commit `51c7377` | **Run 12 (`38086392105`) succeeded on both jobs**, confirmed from the GitHub API: `verify` on Ubuntu 24.04 (all 32 checks; verify step 13 min 45 s) and the informational macOS job. |
| Gate 4 closure `7980cf4` | Run 10 succeeded on both jobs (preserved from the closure record). |
| Verification baseline | 32 of 32 checks, 159 Gate 4 negative tests, 0 differences against v0.8 (source, text, structure, styles, pixels, behaviour), local and remote. Chromium only: Firefox and WebKit had never been run. |
| Findings | **No open finding.** F-G2-01 (media provenance states no licence; accepted as a documentation policy), F-G3-01 (harmless `file://` font-preload console messages; accepted), F-G4-01 (phone numbers may wrap; accepted without visual change on the condition that `check:phone` holds). The interaction-latency anomaly stays an **open, non-blocking diagnostic**, parked until real-device traces exist; the probe step is no longer in the workflow and `engineering/tools/latency-probe.mjs` is preserved. |
| Production-release blockers | Unchanged: no release approval, rights verification or search review; no real-device, screen-reader or browser-matrix evidence; version 0.9.0-dev; hosting behaviour simulated only; external links unchecked; advisories accepted. |

## v0.9 Gate 5, Phase 1: Firefox and WebKit verification (2026-10-10, `APR-JE-027`)
Two informational GitHub Actions jobs run the browser-driven checks (14 at first, 15 with `check:supports`, added with the correction below) in Firefox 157.0 and WebKit 27.2 (Playwright 1.64.0's own builds; WebKit is the Linux build, not Safari on macOS or iOS). The Chromium job and its performance budgets are unchanged. Nothing is skipped silently: each job ends with a matrix of all 34 checks (PASS, FAIL, N/A with the reason). The checks that cannot run outside Chromium are `check:budgets` (needs the DevTools protocol and Event Timing, LCP and long-task APIs; its static page-weight part runs in the Chromium job) and the self-tests (they prove the checks, not the engine).

| Check | Chromium | Firefox 157.0 | WebKit 27.2 |
|---|---|---|---|
| media, seo, privacy, security, assets, d11 (CSP and D-11), a11y-tree, order, phone, forced-colors, reflow-at-default, regression vs v0.8 | pass | pass | pass |
| keyboard | pass | pass (F-G5-03 recorded) | pass |
| portability | pass | pass (F-G5-02 recorded) | pass (F-G5-01 recorded) |
| reflow (text spacing, now at 390, 1024, 1100, 1280 and 1440 px) | pass | pass | pass (F-G5-04 resolved by the correction below) |

Genuine engine differences were findings F-G5-01 to F-G5-04 in `engineering/findings.json`: F-G5-01 and F-G5-02 accepted (APR-JE-028), F-G5-03 accepted and closed after verification, F-G5-04 corrected (below). Firefox cannot honour the `isMobile` context option; it is dropped and printed as `ADAPTED`. Real Safari, iOS, Android and screen-reader evidence is not produced by these jobs and stays a human task.

### Gate 5 Phase 1 correction (2026-10-11, `APR-JE-029`)
**F-G5-04 (WebKit: Visit hours table under text spacing) is corrected** by one approved rule in `styles.css`: `@supports (hanging-punctuation:first){.hours th{white-space:normal;min-width:max-content}}`. Root cause, candidates and evidence: `engineering/GATE-5-PHASE-1-REVIEW-INVESTIGATION.md`. Evidence from Actions run 23 (WebKit 27.2):
- text spacing (WCAG 1.4.12) passes at 390, 1024, 1100, 1280 and 1440 px on every page; the earlier overlap (3.1 px at 1440, 5.7 px at 1280, 18.2 px at 1100 and 1024) is gone, so the register entry reported `no longer occurs` and was removed;
- the normal appearance is unchanged: the regression comparison against the frozen v0.8 baseline in WebKit reports 0 problems in text, structure and pixels (39 pixel comparisons), the four hours-table labels differ in computed style only as approved (ASD-1, geometry identical); in Firefox 157.0 and Chromium the rule does not apply and styles and pixels are identical to v0.8;
- `check:supports` (new) confirms where the rule applies (WebKit yes, Firefox and Chromium no) and fails if a browser or Playwright upgrade changes that; `engine-features.json` records the expectation;
- CSP enforcement and D-11 pass in Firefox and WebKit (`check:d11`, `check:security`); the other checks are unchanged.
**Final verification: Actions run 24 (`630beec`): all four jobs green** (Chromium `verify` 35 of 35, Firefox 157.0 15 of 15, WebKit 27.2 15 of 15, macOS fast checks); details in `engineering/CI.md`.
**F-G5-03 closed** (Firefox category-strip Tab stop verified, run 19). Open findings after this correction: F-G2-01, F-G3-01 (Chromium), F-G4-01, F-G5-01 (WebKit file:// fonts, accepted), F-G5-02 (Firefox preload warning, accepted), F-G5-03 (closed, kept in the register as a known behaviour). No open finding is blocking. Safari and iOS Safari remain **[unverified]** (human device testing).

## Remaining issues (honest list)
1. **[unverified] Real devices.** Also the new CSS masks on Safari and iOS. iPhone, Safari (including whether VP9 WebM plays and is chosen, and Low Power Mode blocking autoplay), Android, Firefox, a high-refresh display, and battery or heat during the loop have not been tested. Safari and iOS are the biggest unknown.
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
