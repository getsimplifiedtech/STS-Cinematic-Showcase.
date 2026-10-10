# Jade & Ember — five-page architecture (proposal)

**Status:** proposal for review. **Nothing is implemented.** No media is generated, nothing is merged or deployed.
**Baseline:** v0.5 Jade Lacquer (`0ae79f3`), approved as the visual design.
**Branch:** `feature/jade-and-ember-brief`. **Date:** 2026-10-09.
**Design authority:** Anthropic's `frontend-design` skill (`getsimplifiedtech/sts-web-design-framework`, branch `feature/anthropic-frontend-design-standard`). The retired STS Premium Web Design skill is not used. Engineering rules (accessibility, performance, fallbacks, `noindex`, honest QA) come from this project's own brief and `QA.md`.

---

## 1. What this has to be

Jade & Ember is an STS portfolio demonstration of a restaurant product. Diners are the simulated end users; restaurant owners are the commercial audience. The product must be **a five-page website**, not one page with five sections. Each page needs its own purpose, URL, title, single `h1`, composition and opening move, and the shared parts (header, footer, tokens, components) must be built once and reused.

**Fixed (from the approved v0.5, not reopened here)**
- Jade Lacquer palette and roles: jade ground, charcoal "kitchen", ember for fire only, rice type.
- Young Serif and Karla, sentence case, no decorative labels, numbering only for real sequences.
- The cinematic hero (still, 1280×720 flame loop at 960 px and wider, slow-push and Pause fallbacks, reduced-motion, Save-Data and 2g rules).
- Existing assets only: `hero-wok.webp`, `hero-wok-m.webp`, `hero-loop.webm/.mp4`, three dish photos, `story-jade-bowls.webp`, the three fonts, the 玉火 seal subset.
- Accessibility and performance standards from `QA.md` (axe 0 violations, measured text contrast, 24 px targets, CLS 0, Lighthouse mobile performance at or above 95).

**Not allowed in this step:** implementation, new media, merge, deployment.

## 2. Sitemap and URLs

| # | Page | File | Nav label | `h1` (demo copy) |
|---|---|---|---|---|
| 1 | Home | `index.html` | Home | The breath of the wok. |
| 2 | Menu | `menu.html` | Menu | Sample menu |
| 3 | Our Story | `our-story.html` | Our story | A small kitchen, one very hot wok. |
| 4 | Visit Us | `visit-us.html` | Visit us | Visit us (sample details) |
| 5 | Order Online | `order-online.html` | Order online | Dinner, to go. |

- **Flat structure, relative links** (`menu.html`, `../` for the STS showcase). This works from `file://`, from the preview server and from Cloudflare Pages at `/jade-and-ember/` (Pages serves `menu.html` at `/menu` too, and redirects between the two). The folder-per-page alternative (`/menu/index.html`) gives cleaner URLs but needs `../` asset paths and cannot be opened by double-click, so I do not recommend it for a portfolio demo that people open locally.
- Nav labels are sentence case ("Our story", "Visit us", "Order online") to match the skill's guidance; the page names you gave stay as the document names. Decision 1 (section 14).
- No breadcrumbs: five flat pages do not need them.
- Every page is `noindex, nofollow` while the demo is fictional (a config flag, section 7).

```
index.html ──┬── menu.html          (full menu, jump links, order CTA)
             ├── our-story.html     (the long version of the Home teaser)
             ├── visit-us.html      (address, hours, good to know, contact)
             └── order-online.html  (how ordering works, the one primary action)
Every page: shared disclosure bar, header (5 links), footer (5 links + disclosure)
```

## 3. Page by page

The skill asks that each page open with the most characteristic thing for its job, in the form that fits, and that structure encode information. The pages therefore do not share a banner template: each has a different opening move, and every shared pattern below is a component, not a layout.

### 3.1 Home (`index.html`): "make me hungry, then point me on"
- **Job:** the cinematic arrival, then a short, appetising tour that hands off to the other four pages.
- **Opening move:** the approved hero, unchanged: copy left, flame right, video above 960 px.
- **Content (all from config, none duplicated):** hero; the four-step wok-hei process (numbered, a real sequence); "Order these first." three full-bleed dish frames, with "See the full menu" after them; **story teaser** (the pull quote set large, one link to Our story); **visit strip** (today's hours and the address in one line of serif type, one link to Visit us); **order band** (heading, one sentence, one button to the Order page).
- **Not on Home any more:** the menu list, the long story text, the hours table, the order note. The v0.5 sections become teasers, so the content lives once.
- **Assets:** hero still and video, `dish-mapo`, `dish-charsiu`, `dish-dandan`. The story teaser and visit strip are type only, so Home's weight does not grow.

```
[ hero: copy | flame video ]                       (kitchen)
-----------------------------------------------------------  (lacquer)
Heat is the ingredient.            body (cols 6-11)
o-----------o-----------o-----------o   four numbered steps
Order these first.
[ frame: Mapo ]  text below      [ text above ]  [ frame: Char Siu ]   [ frame: Dan Dan ]  text
See the full menu  (text link)
"A small kitchen, one very hot wok."                Read our story
Tuesday to Sunday, from five. 88 Example Street.    Plan your visit
Dinner, to go.                                      [ Order online ]
```

### 3.2 Menu (`menu.html`): "find what I want and know what it contains"
- **Job:** the whole menu, scannable, with heat and allergens clear. The v0.5 tabs are replaced: all five categories are on the page (no hidden content, printable, searchable, same without JavaScript) with **sticky jump links** to each category.
- **Opening move:** type and information first: the `h1`, a one-line legend (heat dots 1 to 3, allergen note), then a single reused flame band (`hero-wok.webp`, edge to edge, about 3:1, already cached from Home) as the page's only photograph.
- **Content:** categories as `h2` with the existing leader-dot item lists; heat dots; allergen tags; signature dishes carry a plain "House favourite" tag (config flag on the item); the order CTA once, as a text link at the head and a band at the foot.
- **Print:** a small print stylesheet (light ground, dark text, no band) because menus get printed. Optional, noted for review.
- **JS:** none required. Optional `menu.js` marks the current category in the jump links as you scroll.
- **Real clients:** `Menu` and `MenuItem` JSON-LD from `menu.json`, off in the demo (section 7).

```
Sample menu                         heat: ●○○ warm   ●●○ hot   ●●● fierce
allergen note (one sentence)
[ flame band, edge to edge ]
Small plates | From the wok | Noodles & rice | Roast & braise | Sweet & tea   (sticky)
Small plates
  Smashed Cucumber ........ $9        Pork & Chive Dumplings ........ $13
  ...
From the wok
  ...
Dinner, to go.   Order online
```

### 3.3 Our Story (`our-story.html`): "why this place"
- **Job:** the brand's reason to exist, in four short chapters (the question, the room, the wok, the name).
- **Opening move:** the `h1` quote and the existing bowls photograph, edge to edge. This page spends its one bold typographic moment on **the seal itself**: 玉 and 火 set very large in the last chapter ("the name"), because the name is the whole palette. The characters mean jade and fire; the 1 KB seal font already carries exactly these two glyphs, so no new font weight.
- **Content:** the current two paragraphs and coda, extended to four chapters. **New sample copy is needed** (about 100 words per chapter) and is flagged as sample in config. I will not invent real people, awards, dates or sourcing claims. No staff or chef photographs (none exist, and none will be generated).
- **Assets:** `story-jade-bowls.webp`; the seal font. No other media.
- **Closing:** a link to the Menu and the order band.

```
A small kitchen, one very hot wok.
[ bowls photograph, edge to edge ]
The question    text, cols 2-7
The room        text, cols 5-10 (stepped right)
The wok         text, cols 2-7
The name        玉  火   (very large, celadon and ember)   "Jade for the bowls, ember for the flame."
See the menu    Order online
```

### 3.4 Visit Us (`visit-us.html`): "can I get there, and when can I go"
- **Job:** practical certainty. This is the quiet page: type only, no photograph.
- **Opening move:** the address set large in the serif, as the page's headline element, left; hours right.
- **Content:** address; **hours** as a table (real tabular data) with today's row marked; "Good to know" (walk-ins, the wok counter seats eight, takeaway goes through the Order page, plus optional config lists for accessibility, parking and transit that appear only when filled in); phone as a `tel:` link; an optional "Get directions" link to a map provider (`visit.mapUrl`), opening in a new tab. **No embedded map** (no third-party script, no privacy or weight cost).
- **Optional enhancement:** a tiny `visit.js` computes "Open now / Closed, opens Tuesday at 5:00 pm" from the hours and a timezone in config. Without JS the table is the whole truth.
- **Demo:** the fictional-details flag (existing sample note) stays, driven by the demo flag.

```
Visit us (sample details)
88 Example Street                      Monday        Closed
Sampletown, ST 00000                   Tuesday-Thu   5:00 pm - 9:30 pm   <- today marked
Fictionland                            Friday-Sat    ...
(555) 010-0188  (sample)               Sunday        ...
Get directions
Good to know  -  walk-ins welcome; the wok counter seats eight  -  takeaway through Order online
Dinner, to go.   Order online
```

### 3.5 Order Online (`order-online.html`): "get my food"
- **Job:** the conversion page. One primary action, and what happens after it.
- **Opening move:** the `h1`, one sentence, and the single ember primary button (the only ember action on this page).
- **Content:** **three numbered steps** (a real sequence, drawn like the wok-hei line): choose from the menu (link), order and pay on the restaurant's ordering platform (name from config), collect from the pass. Pickup details; the ordering window; the allergen reminder; a phone fallback ("Prefer to call?").
- **Behaviour:** `ordering.url` set: the button opens the restaurant's own ordering page (new tab, `rel="noopener noreferrer"`, as v0.5). `ordering.url` empty (the demo): the existing non-functional example state, with the "For restaurant owners" note. **Link-out only in v1; no iframe embed** (accessibility, payment-security and weight risks), and no claim of any platform integration.
- **Assets:** none required. Optional: reuse the Dan Dan frame (a dish that travels) below the steps.

```
Dinner, to go.
Choose from the full menu and collect it hot from the pass.
[ Order online ]                (demo: shows "Order online (example)")
o--------------o--------------o
1 Choose        2 Order and pay        3 Collect
  Menu link       on {platform}          at the pass, 15-25 min [config]
Pickup details   Allergen note   Prefer to call? (555) ...
For restaurant owners  (demo flag only)
```

## 4. Shared components

Built once as build-time functions (`src/components/*.mjs`, each returns an HTML string from config). No client-side includes: a fetch-and-inject header would flash, break without JS and cost a request. Every page is complete static HTML.

| Component | Used on | Notes |
|---|---|---|
| `head` | all | Per-page `<title>` (`{Page} | {Brand}`), description, canonical (when `baseUrl` is set), Open Graph, `theme-color`, `robots` from the noindex flag, font preloads, favicon |
| `disclosureBar` | all (demo flag) | Existing bar, long and short text; absent when `demo` is false |
| `header` | all | Brand link, five-link nav, order CTA, mobile toggle; `aria-current="page"` on the current link, set at build time |
| `footer` | all | Five links, contact, disclosure text (demo), "Back to the STS showcase" and credit, concept stamp |
| `frame` | Home, Menu, Story | Edge-to-edge photograph (`src`, `alt`, `pos`, `ratio`, `loading`, `fetchpriority`), the 1680 px cap and edge softening from v0.5, width and height always set |
| `pageHead` | Menu, Visit, Order | `h1` plus one optional sentence; variants only change composition, not markup |
| `dish` | Home | Frame plus name, description, price, heat, tag; text above or below |
| `steps` | Home (wok hei), Order | Numbered, joined by one line; horizontal, two-row and vertical variants from v0.5 |
| `menuCategory` | Menu | `h2`, leader-dot items, heat, tags, house-favourite tag |
| `hours` | Home strip (today only), Visit | One data source; "today" marked at build or by the optional script |
| `ctaBand` | Home, Menu, Story, Visit | Heading, one sentence, one action |
| `ownerNote` | Order (and Visit address note) | Demo flag only; "For restaurant owners" |
| `orderLink` | all | One function decides the target: the Order page, or straight to the platform if `ordering.headerCta` is `direct`; handles the example state |

Rules for every component: one `h1` per page; heading levels never skip; images always carry width, height and alt text; no component writes a colour or font that is not a token; every action keeps the same name across pages ("Order online" is "Order online" everywhere).

## 5. Navigation

- **Desktop:** brand (Home) at the left; Home, Menu, Our story, Visit us as links; **Order online** at the right, styled as the outlined action. Five destinations, one pattern. The hero page keeps its ember "See the menu" button as the single primary there.
- **Current page:** `aria-current="page"` plus an underline in celadon; the current page's link does not look like a button.
- **Phone (under 760 px):** the existing toggle opens a full list of the five links, Order online last and ember-coloured.
- **Footer:** the same five links, in the same order, so the nav is identical on all five pages (WCAG 3.2.3 consistent navigation).
- **Skip link** to `#main` on every page. Focus is visible everywhere (celadon outline, as v0.5).
- **Header Order CTA target:** the Order page by default (it explains pickup and the platform); `ordering.headerCta: "direct"` sends it straight to the platform for clients who prefer one tap.
- **Page changes:** ordinary navigations. No client-side routing, no page-transition animation in v1 (the skill asks for motion only where it earns it; a cross-fade would also risk a flash behind the hero video). Recorded as a later option.

## 6. Build and file structure

```
jade-and-ember/
  config/
    client.json     business facts and switches (section 7)
    menu.json       categories and items, single source
    copy.json       per-page copy and per-page SEO
    site.json       page registry, nav order, labels, disclosure texts
  src/
    lib/            esc, money, heat, load+validate config, link helper
    components/     head, disclosure, header, footer, frame, dish, steps, menu-category, hours, cta-band, owner-note
    pages/          home.mjs, menu.mjs, story.mjs, visit.mjs, order.mjs
  build.mjs         reads config/, renders the five pages, validates, writes ./*.html
  styles.css        one shared stylesheet (tokens, base, components, page scopes)
  site.js           nav toggle (all pages)
  hero.js           the existing hero logic, moved verbatim; Home only
  menu.js           optional jump-link highlight; Menu only
  visit.js          optional "open now"; Visit only
  fonts/ media/     unchanged
  index.html menu.html our-story.html visit-us.html order-online.html   (generated, committed)
  tests/            qa.mjs, contrast.mjs, contrast-sections.mjs, site.mjs (new), serve.mjs
```

- **One stylesheet.** At about 22 KB (about 6.5 KB gzipped) one cached file beats five small ones, and no page is render-blocked by a second request. Revisit only if it passes 35 KB. Tokens stay in a clearly marked block at the top (`:root`), so a client reskin is a one-block change; generating tokens from config is deferred as over-engineering.
- **JS is split by page.** The hero script (about 5 KB of the current 8.5 KB `site.js`) is no longer sent to four pages that do not need it. Each script is `defer`, small and optional except the nav toggle, and each page works without JS. The v0.5 menu tabs script is retired in favour of real anchors.
- **Generated HTML is committed** (as now) so the repo can be served and previewed without a build step.
- **No new runtime dependencies.** The build stays plain Node.

## 7. Reusable client configuration

The aim: a new restaurant means editing four JSON files and replacing images, with no code edits. Two rules: business facts exist **once** (address, hours and phone appear on four pages), and everything specific to the STS demonstration is behind **one** flag so a client site ships none of it.

`config/client.json` (outline; demo values in brackets)
```jsonc
{
  "brand":   { "name": "Jade & Ember", "descriptor": "Modern Chinese kitchen", "seal": ["玉","火"], "sealLabel": "Jade and fire" },
  "contact": { "phone": { "display": "(555) 010-0188", "href": "tel:+15550100188" }, "email": null },
  "address": { "lines": ["88 Example Street", "Sampletown, ST 00000", "Fictionland"], "mapUrl": null },
  "hours":   { "timezone": "America/New_York", "rows": [ { "days": "Monday", "time": "Closed" } ] },
  "ordering":{ "url": null, "label": "Order online", "platformName": "the restaurant's ordering page",
               "headerCta": "page", "pickupNote": "Ready in about 20 minutes", "phoneFallback": true },
  "seo":     { "baseUrl": null, "titleTemplate": "{page} | {brand}", "noindex": true, "structuredData": false },
  "flags":   { "demo": true, "heroVideo": true }
}
```
- **`flags.demo`** controls the STS disclosure bar, the footer disclosure, every "sample" marker, the owner notes and the "Back to the STS showcase" link. A client build sets it to `false` and none of that appears.
- **`seo.noindex`** drives the robots meta on all five pages. With a real `baseUrl` and `noindex: false` the build also writes canonical tags, `sitemap.xml` and `robots.txt`. `structuredData` adds Restaurant and Menu JSON-LD for real clients only; it stays off in the fictional demo, because it would present invented facts as data.
- **`ordering`** is link-out only. `platformName` is plain text for the steps ("MenuSifu" is an allowed value; no integration is implied or built).
- **`flags.heroVideo`** lets a client without hero footage fall back to the still without code changes (the video fallback logic already exists).

`config/menu.json`: categories with `id`, `name`, `items[{ name, text, price, heat 0-3, tags[], signature }]`; the three Home dishes are items flagged `signature` with an `image`, `alt` and `focus`.

`config/copy.json`: for each page `meta.title`, `meta.description`, `h1`, intro text and chapters or steps; items marked `"sample": true` are STS-authored placeholders that the client replaces.

`config/site.json`: the page registry (slug, file, nav label, order) from which the header, footer, sitemap and tests are all generated, so adding or reordering a page is one entry.

**Build-time validation (fails the build, not the page):** required fields present; hours rows parse; `ordering.url` is `https://` or null; menu ids unique; prices numeric; heat 0 to 3; every referenced image exists and has alt text and dimensions; every page has a unique title and description and exactly one `h1`; `flags.demo: false` with any "sample" text still present is an error.

## 8. Assets and performance

| Page | Photographs (all existing) | Budget, transfer, without the video |
|---|---|---|
| Home | hero still (desktop or mobile), 3 dish frames (lazy) | at most 190 KiB (v0.5 measures 174) |
| Menu | `hero-wok.webp` flame band | at most 130 KiB |
| Our story | `story-jade-bowls.webp` | at most 110 KiB |
| Visit us | none | at most 80 KiB |
| Order online | none (optional Dan Dan frame, lazy) | at most 80 KiB |

- Shared across pages and cached after the first: CSS, nav script, the two preloaded fonts (about 40 KB). The 584 KB hero video is requested only on Home, after load, at 960 px and wider, as today.
- Only Home preloads the hero image. The first image on Menu and Story is the page's LCP candidate (eager, `fetchpriority="high"`); every other image stays lazy.
- No prefetching of other pages by default (metered data), no third-party requests on any page.
- **Gates:** Lighthouse mobile performance at or above 95 and accessibility 100 on all five pages, CLS 0 everywhere, LCP at or below 2.5 s on the mobile preset. Upscaling limits from v0.5 remain (1200 px photographs, capped at 1680 px).

## 9. Accessibility (carried over, extended)

- Same landmarks on every page: skip link, `header`, `nav aria-label="Primary"`, `main#main`, `footer` with `nav aria-label="Footer"`.
- One `h1` per page and a logical heading order; the document title changes per page (WCAG 2.4.2); `aria-current` on the current link; identical nav order on all pages.
- Menu: with all categories visible, nothing is hidden behind a control; the sticky jump links respect the sticky header (`scroll-padding-top`), and the focused heading is never covered (WCAG 2.4.11).
- The hero keeps its Pause control, reduced-motion, Save-Data and 2g rules. No other autoplay anywhere.
- Heat is always paired with text (`role="img"` and "Heat n of 3"); numbering stays `aria-hidden` where the list order already says it.
- Targets stay at 44 px (24 px minimum); focus is visible; text uses measured contrast, now on all five pages.

## 10. QA plan

| Check | Scope |
|---|---|
| `tests/site.mjs` (new): five files exist; titles and descriptions unique; one `h1` each; nav identical and `aria-current` exactly once; every internal link resolves; no duplicate ids; every `src` exists; no external requests; robots meta matches config; hero video only on Home; no JS errors | all five |
| `tests/qa.mjs` (axe, overflow, targets, reduced motion, no-JS, video scenarios) | parameterised over the page registry; video scenarios stay on Home |
| `tests/contrast.mjs` (hero over the moving video) | Home |
| `tests/contrast-sections.mjs` (all text below the hero) | all five, 13 viewports |
| Lighthouse mobile (3 runs) and desktop | five URLs |
| Page-weight check against the section 8 budgets | five |
| Visual review at 1440, 820, 390 and 844×390, plus a screenshot diff of Home against v0.5 | five |
| Real devices (iOS Safari, Android, Firefox), 200 % zoom, screen reader | **[unverified]** until a person runs them; reported as such |

## 11. Migration plan and gates

Nothing starts until you approve this document. Proposed order, each step committed to `feature/jade-and-ember-brief`:

1. **Gate 1: foundation.** Config split and validator, build system, shared components, header and footer, Home (v0.5 parity plus the three teasers) and Menu. Review: a preview zip of those two pages and the QA output.
2. **Gate 2: remaining pages.** Our story, Visit us and Order online, the optional scripts, the print stylesheet, full QA across all five pages, preview zip, `QA.md` and `README.md` updated (including a short "new client" checklist for restaurant owners).
3. Stop for review after each gate. No merge, deployment or publishing, and no media generation at any point. (You may prefer one gate; see decision 5.)

## 12. Self-review against the frontend-design defaults

Checked against the skill's list of generic traits, applied to the sub-pages:

- **The sub-page banner:** a coloured strip with breadcrumb, `h1` and a lead paragraph on every inner page is the template tell. Rejected: each page has a different opening move (hero; type plus flame band; quote plus photograph and the seal; the address as the headline; one action and three steps).
- **Card grids:** none. Teasers are single typographic lines; categories are lists; steps are a joined line.
- **Eyebrows, caps labels, "WORD — fragment", middle dots, arrows on links:** none, as in v0.5.
- **Numbering:** only the two real sequences (the wok-hei process and the ordering steps). The four story chapters are headed, not numbered.
- **Boilerplate sections:** no testimonials, no "our values" icon row, no newsletter or contact form (there is no backend to receive one; the phone and the ordering platform are the contact routes), no embedded map.
- **Motion:** unchanged: the hero is the single orchestrated moment; no scroll or hover entrances were added to the other pages.
- **Copy:** each page's text is written for the diner in plain verbs; actions keep one name across pages; the owner-facing note is clearly marked and removable with one flag.
- **Honest weakness:** the Visit and Order pages are type-led and, without photography, risk feeling thin next to Home. The mitigations (the address as a large headline, the steps line, the optional reused dish frame) are untested design bets for review, not proven ones.

## 13. Risks and open points

- **Content volume.** Story, Visit and Order need more text than exists today. I will write clearly flagged sample copy; a real client must replace it.
- **Thin pages.** See section 12. A second reused photograph on Visit or Order is available if you prefer to see them heavier.
- **Hero only on Home.** Each inner page therefore has no moving image; this is deliberate (one cinematic moment, less data), but it is a visible difference.
- **Tabs removed.** The Menu loses the one-category-at-a-time tabs in favour of a complete list with jump links; a different interaction, chosen for robustness and print.
- **Today's hours.** The "open now" status depends on the device clock and the configured timezone; it is an enhancement and the table is always present.
- **Fonts.** Three font files cost about 53 KB on a first visit and are cached for the other pages.
- **Out of scope for v1:** reservations or any form, an ordering iframe or integration, a map embed, page-transition animation, multiple languages, a blog, new photography or video.

## 14. Decisions requested

1. **Names and labels:** sentence-case nav ("Our story", "Visit us", "Order online"), or exactly "Our Story", "Visit Us", "Order Online"?
2. **File names:** `our-story.html`, `visit-us.html`, `order-online.html` as proposed?
3. **Menu:** all categories on one page with sticky jump links (recommended), or keep the tabs?
4. **Imagery:** keep Visit and Order type-only and reuse the flame band on Menu, or reuse a dish frame on Order as well?
5. **Gates:** two gates as in section 11 (recommended), or a single implementation pass?
6. **Header Order CTA:** the Order page by default (recommended), or straight to the platform?
7. **Story copy:** may I write four sample chapters (about 100 words each), clearly flagged as samples?
8. **Print stylesheet and "open now" status:** include in v1, or later?

---

## 15. Implementation log (added after approval)
- **Gate 1 (`b19f0eb`):** shared configuration and components, Home, Menu. Decisions applied as approved: sentence-case navigation, the proposed file names, menu jump links (no tabs), type-led Visit and Order, two gates, the header button goes to the Order page, the menu print stylesheet; "open now" deferred.
- **Gate 2:** Our story (four sample chapters, the last one the seal), Visit us, Order online; `owner-note`; variant and extracted-folder tests. See `jade-and-ember/QA.md` for results and the honest critique.
- **Changes from this plan:** a build-time demo-wording scan (a client build fails if demonstration text remains); the story chapters are three headed chapters plus the name band; the hero's hidden AI-generated caption note is demo-only; the owner note appears only while the order button is the nonfunctional example; `serve.py` (with video Range support) is part of the folder; `status` is not part of the page registry.
