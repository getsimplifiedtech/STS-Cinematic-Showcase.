# Jade & Ember engineering checks (v0.9, Gates 1 and 2)

STS governs engineering and delivery; Anthropic Frontend Design is the creative authority (`../../docs/JADE_AND_EMBER_FRAMEWORK_REFERENCE.md`). Nothing in this folder is shipped: the website is the five HTML pages plus `styles.css`, three scripts, `fonts/` and `media/`, and it works without Node.js. Everything here is development tooling.

```
npm run verify          every check below, with a summary (about 9 minutes: it drives a browser and runs the self-tests)
npm run verify:fast     no browser (seconds): baseline, schema, determinism, delivery, authority, contracts, media and budgets (static parts)
npm run check:<name>    one check: baseline | schema | determinism | delivery | authority | contracts | media | budgets | keyboard | reflow |
                        forced-colors | a11y-tree | order | regression | selftest | selftest-gate2
```
`CHROMIUM_PATH` (or `CHROME_PATH`) selects a preinstalled Chromium; otherwise Playwright's own download, then a build under `PLAYWRIGHT_BROWSERS_PATH`, is used. Pass `--framework <dir>` (or set `STS_FRAMEWORK_DIR`) to `check:authority` to also verify the pinned framework commit and skill hashes against a local checkout of the framework (read only).

## The checks
| Check | Proves |
|---|---|
| `baseline` | The permanent branch `baseline/jade-and-ember-v0.8` is at the recorded commit; its trees, all 60 source checksums and the preview package match. Never moves. |
| `schema` | `schemas/*.schema.json` are valid JSON Schema; the four config files fit them under two independent validators; 43 realistic mistakes and variations get the right verdict from both; the build refuses broken config with path-qualified messages and writes nothing. |
| `determinism` | Two builds are byte-identical; the committed pages equal a fresh build; the result does not depend on time zone, locale, working directory, project path, file timestamps or `NODE_ENV`; no paths, timestamps or machine names in the output; the build sources contain no clock, random, environment or locale calls. |
| `delivery` | The delivered file set equals the v0.8 preview package's site files; every reference resolves inside the folder (so `index.html` opens directly); nothing delivered refers to Node.js, npm, `node_modules`, `engineering/`, a build step or a module loader. |
| `authority` | `authority.json` and the written framework reference agree (commit, hashes, skill path); the approval records exist; the retired STS Premium Web Design skill appears only in allowed historical documents next to a marker such as "retired", and never in code, configuration, styles, pages or tests; optionally the pinned hashes are confirmed against a framework checkout. |
| `regression` | The working tree, built fresh, against the frozen v0.8 baseline exported from git, in one pinned browser: source bytes, visible text, accessibility tree, computed style and geometry of every element, screenshots, and behaviour scenarios (see below). |
| `selftest` | Each check fails when it should: it damages a copy of the project or records in realistic ways and requires the right layers to notice. |

## Gate 2 checks (accessibility, performance, media, component contracts)
| Check | Proves | Thresholds in |
|---|---|---|
| `keyboard` | Real key presses on every page at 1440 and 390 px: every visible control reachable once in DOM order, no positive `tabindex`, no trap, Shift+Tab reverses, a focus indicator that changes pixels, focus not hidden behind another element (2.4.11), skip link first and into `<main>`, phone menu by keyboard (open, link order, Escape returns focus), 24 px targets and 44 px primary actions. | `a11y.json` |
| `reflow` | 320 px reflow, 200 percent zoom (640 CSS px at DPR 2) and WCAG text spacing: no sideways scroll, no clipped text (only what the spacing causes), no text over text, no overlapping controls; scrolling regions must be keyboard-reachable. | `a11y.json` |
| `forced-colors` | Forced-colours emulation: every line of text has a solid background colour behind it and 4.5:1 (3:1 large) against it, every control paints something, a focus indicator shows for one control of each kind; counts `forced-color-adjust: none` opt-outs for a human look. | `a11y.json` |
| `a11y-tree` | The accessibility tree: one banner, main and contentinfo in order, labelled and unique navigations, one h1 and no skipped levels, every link, button and image named, same-name links go to the same place, ARIA references resolve, no focusable aria-hidden, the current page marked. | none |
| `order` | DOM order of headings and controls against screen order (rows left to right; columns read in turn are accepted). | none |
| `contracts` | `contracts/components.json`: 16 components and helpers and 5 page renderers: interface (exports, parameters), root element and required markup, balanced tags, no scripts or event handlers, declared inline styles only, unique ids, ARIA references, image attributes, safe new-tab links, hostile-input escaping, purity, conditional behaviour (owner note, order target, demo-only text). Pure Node, no browser. | `contracts/` |
| `media` | Formats by their bytes (WebP, WebM VP9, MP4 H.264, WOFF2), no orphan or missing media, real image sizes against attributes and config, video size, duration and silence read from the files, alt text rules, loading and priority rules, video attributes, provenance rows and rights, a flash proxy (needs ffmpeg), and in the browser: no video and no running animation under reduced motion, Save-Data and 2g, video only at 960 px and wider and only on Home, Pause present and effective. | `findings.json` |
| `budgets` | Page weight (gzip text, images and fonts as stored), per-file limits, delivered size against the v0.8 baseline (0.5 percent), and under a throttled phone profile (150 ms, 1.6 Mbit/s, CPU x4, median of 3): requests, bytes, LCP, CLS, blocking time, interaction latency. A value over its limit, or more than 5 percent over the recorded v0.8 value, fails. | `budgets.json` |
| `selftest-gate2` | 41 targeted negative tests: each damages a copy of the site or of the sources in a realistic way and requires the matching check to report it (positive tabindex, removed focus outlines, a covering panel, shrunken buttons, sideways scroll, clipped and overlapping text, invisible forced-colour text and controls, missing alt, skipped heading, removed `<main>`, duplicate landmarks, broken ARIA references, a reversed column, 30 KB of CSS, a 120 KB image, a third script, a blocked main thread, a fake WebP, a file-name alt text, wrong image proportions, autoplay, an orphan media file, `preload=auto`, an endless animation, a synthetic strobe, an unescaped `esc`, a missing alt in a component, an uncontracted component, an extra parameter, a dangling `aria-labelledby`, an owner note in a client build, a missing skip link, an injected event handler, and the findings register itself). | none |

### Known findings
A check never hides a defect, and a defect in the frozen v0.8 baseline cannot be fixed without a visible change or a change to a frozen file, which needs owner approval. `findings.json` lists such defects (id, key, severity, whether it is visual, the proposed correction, status). A check reports a known finding as a note and **fails on any new finding, on a worse one, and on a register entry that no longer occurs**, so the register can neither hide new defects nor go stale. At the end of Gate 2 the register holds one documentation finding (F-G2-01, no licence terms in `media/PROVENANCE.md`) and no visual defect.

### Manual verification that automation does not replace
- A screen-reader pass (NVDA with Firefox, VoiceOver with Safari, TalkBack) on all five pages; the accessibility-tree check only proves the structure.
- Real-device testing: at least one iPhone and one Android phone, one tablet; touch, orientation, real network, video behaviour, the phone menu.
- Real forced-colours or high-contrast mode on Windows (the check uses the browser's emulation).
- Zoom to 200 percent and 400 percent in the real browsers; text-only zoom; a keyboard-only walk by a person.
- A person looking at the hero clip for flicker, texture swimming and the loop seam; the flash check is a proxy.
- The direction-conformance review against Anthropic Frontend Design (a recorded critique, ledger ENG-070).
- Lab numbers (LCP, CLS, interaction) are not field data; real-device measurement is a release requirement.

## The regression harness
**Immutability rule.** v0.8 is visually immutable (`APR-JE-017`). The candidate must match it; the only permitted differences are entries in `immutability-allowlist.json`, which at Gate 1 is **empty**. An entry must say why, name its work package, state `visual: false`, and give normalising rules that make the candidate equal to the baseline byte for byte; a `visual: true` entry is refused unless it names an owner approval that exists in `docs/JADE_AND_EMBER_APPROVALS.md`. Pixels, text, styles and behaviour are compared whatever the allowlist says.

**Pinned environment** (`environment.json`): Playwright 1.64.0 exactly (`package.json`, lockfile), Node 20 or newer, fixed locale, time zone, colour scheme and reduced motion, fixed launch flags, seven viewports. Baseline and candidate are rendered in the same run by the same browser, so engine, font and hardware differences cancel out; different engines are never compared with each other.

**Layers** (35 page-and-viewport pairs: 5 pages x 7 viewports from 2560 px to 320 px, plus phone landscape):
- `source`: pages, scripts, styles, media, fonts and the demonstration config, byte for byte.
- `text`, `structure`: `innerText`, title and language; the ARIA tree.
- `styles`: a hash of every computed property of every element and its `::before`/`::after`, plus rounded geometry. A failure names the element and the properties.
- `pixels`: full-page screenshots, the open phone menu, the keyboard focus ring, the current menu jump link, the menu print layout. Tolerance: per-pixel colour distance 0.1 with anti-aliasing ignored, at most 0.05 percent of pixels differing, and no 32 x 32 cell with more than 12 differing pixels (so a small local change cannot hide in a large page). Difference images are written to `.reports/pixels/`.
- `behaviour`: the hero state machine (motion, Pause and Play, reduced motion, Save-Data, 2g, narrow width, blocked video), the phone navigation, menu jump links, skip link and tab order for every page, requests and console errors, every page without JavaScript, and every page opened from the folder as `file://` with no server.

**Harness pitfalls found and fixed while building it** (kept here so nobody rediscovers them): the order of custom properties in a computed style varies between pages (properties are sorted before hashing); `document.fonts.ready` can resolve before a lazily discovered font has started (every web font is loaded explicitly); smooth scrolling made the scroll position timing-dependent (`behavior: 'instant'`); Playwright's accessibility snapshot can change how a glyph is rasterised afterwards (screenshots are captured first); aborted requests are cancellations, not failures.

## Other files
`baseline.json` and `authority.json` are machine-readable records that mirror `../../baselines/jade-and-ember-v0.8/BASELINE.md` and `../../docs/JADE_AND_EMBER_FRAMEWORK_REFERENCE.md`; the checks keep each pair in agreement. `lib/schema.mjs` is the dependency-free validator the build uses, so `node build.mjs` needs only Node; Ajv (development only) cross-checks it. `.reports/` is git-ignored output.

## Not yet implemented
Privacy, security-header and dependency checks, Content Security Policy, HTML validation and links, portability (subpath, pretty URLs, other operating systems), release manifest and approvals, Firefox and WebKit runs (the harness accepts `--browser firefox|webkit`; those browsers are not installed in this environment), CI, tokens, hashed assets, SEO files. All browser checks run in Chromium only. See `../../docs/JADE_AND_EMBER_V0.9_IMPLEMENTATION_PLAN.md`.
