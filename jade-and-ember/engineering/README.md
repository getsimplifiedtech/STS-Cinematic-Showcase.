# Jade & Ember engineering checks (v0.9, Gate 1)

STS governs engineering and delivery; Anthropic Frontend Design is the creative authority (`../../docs/JADE_AND_EMBER_FRAMEWORK_REFERENCE.md`). Nothing in this folder is shipped: the website is the five HTML pages plus `styles.css`, three scripts, `fonts/` and `media/`, and it works without Node.js. Everything here is development tooling.

```
npm run verify          all Gate 1 checks, with a summary (about 4 to 5 minutes: it drives a browser)
npm run verify:fast     no browser: baseline, schema, determinism, delivery, authority (seconds)
npm run check:<name>    one check: baseline | schema | determinism | delivery | authority | regression | selftest
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

## Not in Gate 1
Keyboard, reflow, text-spacing and zoom suites, accessibility-tree and forced-colour checks, performance and media budgets, privacy, security-header and dependency checks, HTML validation and links, portability (subpath, pretty URLs, other operating systems), release manifest and approvals, Firefox and WebKit runs (the harness accepts `--browser firefox|webkit`, but those browsers are not installed in the Gate 1 environment), CI, tokens, hashed assets, Content Security Policy, SEO files. See `../../docs/JADE_AND_EMBER_V0.9_IMPLEMENTATION_PLAN.md`.
