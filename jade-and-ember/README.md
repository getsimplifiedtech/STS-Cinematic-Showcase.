# Jade & Ember — fictional modern Chinese kitchen (STS concept v0.2)

Standalone static site. No framework, no runtime dependencies, no external requests, no Lovable. Target path: `/jade-and-ember/`.
**Milestone 1 only:** still-image hero. There is no video in this build and none has been generated.

> Jade & Ember does not exist. Menu, prices, address, phone number and hours are invented and labelled as samples on the page.
> Food images are AI-generated concept art (Z-Image-Turbo; see `media/PROVENANCE.md`) and do not depict dishes served by any restaurant.
> **The page is `noindex, nofollow` while the fictional demonstration is under development** (`meta.robots` in `config.json`; empty the value to allow indexing).

## Run / rebuild
```
open index.html            # or: python3 -m http.server 8766   (from this folder)
node build.mjs             # rebuilds index.html from config.json (Node 18+, no deps)
npm i && npm run test:a11y && npm run test:contrast && npm run test:lighthouse   # QA (dev dependencies only)
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
- **Restraint budget:** one accent (ember, used for actions and flame only), jade as quiet label colour, rice for text and the single light section (the menu, like a printed card). Two families (Instrument Serif, Hanken Grotesk) plus a two-glyph seal font (玉 火, 1 KB). One image grade. One ambient motion (a 38 s push on the hero still).
- **Rhythm:** hero (dark, slow) → one-line pause → signature (dense, three different compositions) → menu (light, text) → story (sparse) → visit (medium) → order.
- **Mobile is a separate composition:** a separately generated portrait hero (`hero-wok-m.webp`): headline in the dark upper zone, the flame as the one focal point, one primary action at the foot (the secondary order link becomes a text link), icon-only Pause, a one-line disclosure bar; nav collapses; menu tabs wrap; landscape phones get a split layout and a non-sticky header.

## Motion, accessibility, fallbacks
- The hero push is added only when JS runs and motion is allowed. It has a visible **Pause motion** button (WCAG 2.2.2). `prefers-reduced-motion` and `Save-Data` get the still only and no button. Without JS there is no motion.
- Menu categories are tabs with arrow/Home/End keys; without JS every category is listed.
- No scroll hijacking, no autoplay video, no carousels.

## Files
`config.json` content · `build.mjs` generator · `index.html` built output · `styles.css` · `site.js` (progressive enhancement only) · `media/` · `fonts/` (OFL licences in `LICENSES.txt`) · `tests/qa.mjs` (axe and behaviour) · `tests/contrast.mjs` (hero text contrast over the photo) · `lighthouserc.json` · `QA.md` results and critique · `media/PROVENANCE.md`.

## Not done yet (separate approval gates)
1. Review of the hero source frame and a production plan for a cinematic loop (see `QA.md`).
2. Video generation, integration, Pause control retargeted to `<video>`, WCAG re-check.
3. Independent review. Merge or public deployment only with explicit authorisation.
