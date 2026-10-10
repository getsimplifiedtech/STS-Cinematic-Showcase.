# STS engineering requirements ledger: existing requirements mapped to the Jade & Ember v0.8 codebase

**Status:** v0.9 planning input. **Nothing here is implemented.** v0.8 (`32afde7`) is frozen and visually immutable; this ledger only reads it.
**Method:** adapted from the framework's own Editorial Migration Plan (`architecture/10`, Phase 2 "Rule ledger": inventory and classify before migrating; ambiguous rules are flagged, never guessed). Every row classifies one existing or newly identified requirement.
**Authority split (owner policy, `APR-JE-016`, `APR-JE-018`):** Anthropic Frontend Design governs creative direction. STS governs engineering, architecture, reusable components, configuration, accessibility, security, performance, QA, portability and release controls. The retired STS Premium Web Design skill is **not** a source of aesthetic rules; where an engineering requirement was originally written inside it, the row says so and carries only the engineering substance.

## Legend
**Sources** (framework = `getsimplifiedtech/sts-web-design-framework` @ `d2803c0`): `README` = `README.md`; `01`..`15` = `architecture/NN-*.md`; `TPL` = `templates/sts-cinematic-template-v02` (v0.3.1); `RET` = engineering sections of the retired `skills/PREMIUM_WEB_DESIGN.md` (engineering substance only); `AUD` = the 2026-10-10 compliance audit finding; `NEW` = not in the framework, needed for an HTML-first, platform-independent framework.

**Class:** **U** universal engineering requirement, keep. **G** valid in intent but worded for Lovable or the compile pipeline, generalise to platform-neutral. **R** Lovable-specific, retire. **P** pipeline or taxonomy specific (profile, compiler, packages, vocabularies), park: not carried into the HTML-first framework. **A** aesthetic: delegated to Frontend Design, never carried as an STS rule. **N** new requirement.

**Status in v0.8:** Implemented, Partial, Missing, or N/A. **Visual impact of the v0.9 action:** **None** (tests, docs, tooling; output files unchanged), **Guarded** (output files may change, pixels, visible text, assets, fonts and motion must stay identical, proven by the immutability harness WP1), or **Approval** (any realisation would change what a visitor sees or reads; needs separate owner approval first).

## A. Governance and authority
| ID | Requirement | Source | Class | v0.8 evidence | Status | v0.9 action | Visual |
|---|---|---|---|---|---|---|---|
| ENG-001 | Frontend Design governs creative direction; STS governs engineering | owner policy `APR-JE-016` | U | `docs/JADE_AND_EMBER_FRAMEWORK_REFERENCE.md` §4; README line 5 | Implemented (docs) | Keep; machine check that no active file names the retired skill as authority (WP2 `check:authority`) | None |
| ENG-002 | STS visual packages supply tokens and configurations only; no competing aesthetic rules | owner policy `APR-JE-016` | U | No packages exist; tokens are 31 CSS custom properties in `styles.css` `:root` | Partial | Token contract and extraction (WP5); a check that engineering files contain no aesthetic rule text | Guarded |
| ENG-003 | Retired skill historical only | audit M-3 | U | Amended brief, hero plan, QA note (`81311f7`) | Implemented (docs) | Add the automated authority check (WP2) | None |
| ENG-004 | Pin the framework reference; no silent version change | README:30; 14 §Framework Release, §No range resolution | U | `docs/..._FRAMEWORK_REFERENCE.md` (commit and hashes) | Implemented (manual) | Machine-readable `framework.lock.json` plus a consistency check (WP7) | None |
| ENG-005 | Approvals are separate records bound to the exact state | 15 §Approval record | G | `docs/JADE_AND_EMBER_APPROVALS.md` (bound to commits) | Implemented (manual) | Release gate reads the approvals file (WP7) | None |
| ENG-006 | Industry informs design but does not determine it; stereotype test | README governing rules; 07 §Stereotype test | A | Followed in the direction proposals | N/A (design process) | Delegated to Frontend Design; no engineering action | None |
| ENG-007 | Brand is a formal authority; brief-pinned direction wins | README; skill rule | U | Brief palette honoured (`docs/..._BUILD_BRIEF.md` §3) | Implemented | Keep | None |
| ENG-008 | Engineering core stays free of aesthetic taste ("CORE purity") | 01 §CORE; 10 §Phase 3, §Primary migration risk | U | Tests measure contrast, not taste | Implemented | Add an engineering-purity review step to the v0.9 extraction (WP9) | None |

## B. Architecture and configuration
| ID | Requirement | Source | Class | v0.8 evidence | Status | v0.9 action | Visual |
|---|---|---|---|---|---|---|---|
| ENG-010 | Static-first: complete and readable without JavaScript | TPL README "Standards followed"; RET Part VI §4 | U | `tests/qa.mjs` no-JS scenarios (also `.js`-class gating in `src/components/document.mjs`) | Implemented | Keep; contract test per component (WP4) | None |
| ENG-011 | Config-driven build; a variation is config plus media | TPL README lines 1 to 12 | U | `config/*.json`, `build.mjs`, `src/` | Implemented | Document as the framework's core contract (WP10) | None |
| ENG-012 | Typed, machine-validated configuration ("a JSON Schema is the implementation artifact") | 03 §Closed fields, §Validation | G | Hand-written checks in `src/lib/config.mjs` (about 120 lines); no schema files | Partial | JSON Schema for the four config files and a new `engineering.json`; one validator (WP3) | None |
| ENG-013 | Closed value sets; unknown values fail closed | 02 §ID grammar | G | Enumerations in code (heat 0 to 3, `headerCta`, tags) | Partial | Move enumerations into the schemas (WP3) | None |
| ENG-014 | Invalid configuration fails the build and writes nothing | 08 §Compile-time QA | G | `tests/variants.mjs` (9 invalid configurations) | Implemented | Keep; extend with schema-driven cases (WP3) | None |
| ENG-015 | Deterministic build: same inputs, same bytes | 08 §Determinism | U | Verified once by hand (fresh build equals committed pages); no automated test | Partial | `check:determinism` builds twice and compares (WP2) | None |
| ENG-016 | Provenance for every generated artifact | 01 §QA; 06 §Provenance | G | `media/PROVENANCE.md`; no build manifest | Partial | Build manifest: inputs, hashes, versions (WP7) | None |
| ENG-017 | Reusable components publish a contract (use, anti-use, accessibility and performance risks, fallbacks, QA hooks) | 04 §Required sections | G | Eight components in `src/components/`; no contracts | Partial | Component contracts as docs plus contract tests; no markup change (WP4) | None |
| ENG-018 | Tokens are concrete, named and related, never adjectives | 04 §Tokens; 12 | G | `:root` tokens (hex, rem, px); not separable from `styles.css` | Partial | `tokens` source and a generated `:root` block, output byte-identical (WP5) | Guarded |
| ENG-019 | "Builder-default overrides" to stop Lovable homogenising output | 04 §Builder-default overrides | R | Not applicable: no builder | N/A | Retire the concept; keep only "no framework default leaks into a client build" (covered by ENG-054) | None |
| ENG-020 | Page inventory, hierarchy and navigation live in config | 03 §Site Architecture | U | `config/site.json` registry drives header, footer and tests | Implemented | Keep | None |
| ENG-021 | Capability tiers cap pages, experience and motion | 13 | G | Five pages; implicit "standard" tier | Partial | Optional `tier` field with a check (WP3) | None |
| ENG-022 | Versions and lifecycle are explicit data | 14 §Lifecycle registry | G | `package.json` 0.1.0 vs v0.8 (audit m-1); no `VERSION.json` | Missing | `VERSION.json` as the single source (WP7); the visible footer stamp is a separate decision (D-1) | Approval (stamp text only) |
| ENG-023 | Compile context-budget partition plan for Lovable passes | 08 §Context budget and partitioning | R | n/a | N/A | Retire | None |
| ENG-024 | Compile to a deterministic "Lovable-facing rendering" | README lines 6 to 8; 01 §Compiler model; 08 steps 12 and 13 | R | n/a (HTML-first) | N/A | Retire; replaced by "deterministic static render" (ENG-015) | None |
| ENG-025 | "Lovable never arbitrates conflicts" | README line 28; 01 | G | All conflicts are resolved at build time or fail | Implemented | Restate platform-neutrally: no runtime or host-side arbitration | None |
| ENG-026 | Compare the build with the specification after each builder pass ("builder drift") | 09 §Builder drift | G | `tests/site.mjs` checks output against config on every run | Implemented | Rename as output-versus-config conformance (WP10) | None |
| ENG-027 | Offline validation precedes any paid spend; no paid generation without approval | README line 31; 08 §Credit discipline | G | One approved 5-credit generation, recorded; all QA offline | Implemented | Add a media-spend ledger check against `PROVENANCE.md` (WP2) | None |
| ENG-028 | Design Determination interface (Rae) | 07 | P | n/a | N/A | Park: upstream tool, out of scope for the engineering framework | None |
| ENG-029 | Design Profile, Design Analysis and Design Brief as typed records | 03; 07; 15 | P | Direction proposals and approvals exist as prose | N/A | Park the schema; keep a plain "design direction record" per project (WP10) | None |
| ENG-030 | Layer registry, controlled vocabulary of visual systems, compatibility matrix, slot precedence, contribution records | 02; 05; 06; 11; 12 | P / A | Not used; spec-only upstream | N/A | Park. The `visual.*` taxonomy is aesthetic and conflicts with the policy; reuse only the structural ideas (one owner per concern, deterministic merge) | None |
| ENG-031 | Editorial migration plan | 10 | P | n/a | N/A | Framework-internal; its ledger method is reused here | None |

## C. Accessibility
| ID | Requirement | Source | Class | v0.8 evidence | Status | v0.9 action | Visual |
|---|---|---|---|---|---|---|---|
| ENG-040 | WCAG 2.2 AA automated scan on every page and context | 09 §Tier 1; RET Part XI | U | `tests/qa.mjs:54`, five pages by six contexts, 0 violations | Implemented | Keep | None |
| ENG-041 | Text contrast verified over images and video at real crops and all breakpoints | RET Part XI | U | `tests/contrast.mjs`, `tests/contrast-sections.mjs` | Implemented | Keep; move thresholds to `engineering.json` (WP3) | None |
| ENG-042 | Logical focus order, no traps, focus visible and not obscured (2.4.11) | RET Part XI | U | Spot checks (`tests/qa.mjs:119`, Menu jump bar); no full tab-order check | Partial | `check:keyboard`: per-page tab-order snapshot and focus-visible assertions (WP2) | None |
| ENG-043 | Target size 24 px minimum, 44 px for primary actions (2.5.8) | RET Part XI | U | 24 px asserted; 44 px not asserted | Partial | Assert the 44 px rule for configured primary actions (WP2) | None |
| ENG-044 | Reflow at 320 px (1.4.10), text spacing (1.4.12), 200 percent zoom (1.4.4) | RET Part VII, Part XI | U | 320 px reflow tested; spacing and zoom not tested | Partial | `check:reflow` injects spacing overrides and zoom and fails on clipping or overlap (WP2). Findings become proposals | None (Approval if a fix is needed) |
| ENG-045 | Reduced motion honoured; pause control for motion over 5 seconds (2.2.2) | RET Part V §6 | U | `tests/qa.mjs:154,211-221`, `hero.js` | Implemented | Keep | None |
| ENG-046 | No flashing above three per second (2.3.1) | RET Part XI | U | `tools/video-qa.py` flash proxy on the hero clip only | Partial | Fold into the media check for any video asset (WP2) | None |
| ENG-047 | Meaningful alt text; decorative media hidden from assistive technology | RET Part XI | U | `tests/site.mjs`; validator requires alt or `decorative` | Implemented | Keep | None |
| ENG-048 | Reading order equals visual order; no meaning carried by CSS reordering | RET Part VII | U | Dish 2 reordered in the DOM, not in CSS; no automated check | Partial | `check:order` compares DOM order with rendered order for key blocks (WP2) | None |
| ENG-049 | Screen-reader pass and accessibility-tree review | RET Part XI | U | None (disclosed `QA.md`) | Missing | Automated accessibility-tree snapshot per page (WP2); human screen-reader protocol (WP8) | None |
| ENG-050 | Forced-colours and high-contrast modes usable | NEW (CSS rule exists) | N | `@media (forced-colors:active)` rule; untested | Partial | `check:forced-colors` renders in forced-colours emulation and checks controls remain perceivable (WP2) | None |
| ENG-051 | Language, title, landmarks, single `h1`, heading order | 09 §Tier 1 | U | `tests/site.mjs:72` | Implemented | Keep | None |
| ENG-052 | Real-device matrix with recorded evidence in the repository | RET Part XI | U | None; disclosed `[unverified]` | Missing | Protocol and evidence template (WP8); execution is the owner's or a human tester's | None |

## D. Performance
| ID | Requirement | Source | Class | v0.8 evidence | Status | v0.9 action | Visual |
|---|---|---|---|---|---|---|---|
| ENG-060 | Core Web Vitals targets (LCP at most 2.5 s, INP at most 200 ms, CLS at most 0.1) | RET Part XI | U | Lighthouse lab LCP and CLS (`lighthouserc.json`); INP not measured | Partial | Enforce LCP and CLS as assertions; add an interaction-latency check (WP2) | None |
| ENG-061 | A per-page media budget set before building | RET Part XI; architecture doc §8 | U | Budgets written in prose, measured by hand | Partial | `config/engineering.json` budgets plus `check:budgets` (WP2, WP3) | None |
| ENG-062 | Poster first; preload only the LCP asset; reserve space for media | RET Part XI | U | Poster and `<img width height>` in components; no check | Partial | `check:media` asserts dimensions, preload count, lazy loading below the fold (WP2) | None |
| ENG-063 | Lazy-load below the fold; honour Save-Data and slow connections | RET Part VII | U | `loading="lazy"`; `tests/qa.mjs` Save-Data and 2g scenarios | Implemented | Keep | None |
| ENG-064 | No third-party requests | TPL README | U | `tests/site.mjs` external-request check | Implemented | Keep | None |
| ENG-065 | Cache-safe asset URLs (content-hashed, immutable) | NEW | N | Unversioned `styles.css`, `site.js`, `media/*` | Missing | Content-hashed filenames, build-generated (WP5). Output file names change, pixels must not | Guarded |

## E. QA, regression and release
| ID | Requirement | Source | Class | v0.8 evidence | Status | v0.9 action | Visual |
|---|---|---|---|---|---|---|---|
| ENG-070 | Layered QA: core checks, component checks, direction-conformance review | 09 Tiers 1 to 3 | G | Tier 1 largely implemented; no component tier; critique prose in `QA.md` | Partial | Define: core (automated), component (contract tests, WP4), direction review (a recorded Frontend Design critique) | None |
| ENG-071 | Severity vocabulary and a gate: no production approval with Blockers or unresolved Majors | 09 §Severity | U | `QA.md` is prose | Missing | Structured findings file; the release script refuses a production mark with open Blockers or Majors (WP7) | None |
| ENG-072 | Desktop approval never implies mobile approval | 09 §Responsive QA | U | Phone, tablet, landscape, 320 and 2560 in every suite | Implemented | Keep | None |
| ENG-073 | Regression fixtures for build output and failure cases | 09 §Regression | U | `tests/variants.mjs`; no stored golden outputs | Partial | Golden build outputs and the visual baselines (WP1) | None |
| ENG-074 | Reskin test: different clients must not look like each other | 09 §Reskin Test | A | Not run | N/A | Delegated: a design judgement under Frontend Design. Engineering keeps only "distinct configs build and validate" (done in `tests/variants.mjs`) | None |
| ENG-075 | Visual specimens before a visual system is Active | 09 §Visual specimens | P / A | n/a | N/A | Park | None |
| ENG-076 | CI runs build-diff, accessibility and performance checks on every change | TPL `.github/workflows/template-quality.yml` | G | No CI; commands run by hand | Missing | One platform-neutral `npm run verify`; thin CI wrappers (GitHub Actions first) (WP6) | None |
| ENG-077 | Committed pages equal a fresh build | TPL workflow line 31 | U | True now (verified 2026-10-10); not enforced | Partial | `check:determinism` plus the CI step (WP2, WP6) | None |
| ENG-078 | The distributable works when extracted and opened from `index.html` | NEW (built in v0.8) | N | `tests/extracted.mjs` | Implemented | Keep; run on every release package (WP7) | None |
| ENG-079 | Release package carries its commit, hashes and manifest | NEW | N | `START-HERE.txt` names the commit; no manifest | Partial | Reproducible release package with `SHA256SUMS` and `release-manifest.json` (WP7) | None |
| ENG-080 | Immutable baselines and tags | 14 | G | Baseline recorded (`baselines/`); remote refused the tag push | Partial | Verify-baseline script; request a remote-tag route from the owner (D-6) | None |
| ENG-081 | No merge, deployment or publication without explicit authorisation | all handoffs; APPROVALS §B | U | Followed | Implemented | The release tooling contains no deploy step and checks the approvals file (WP7) | None |
| ENG-082 | `noindex` while the demonstration is fictional | `config/client.json` `seo.noindex` | U | Tested (`tests/site.mjs`) | Implemented | Keep | None |

## F. Security and privacy (STS-governed; the framework text is thin here)
| ID | Requirement | Source | Class | v0.8 evidence | Status | v0.9 action | Visual |
|---|---|---|---|---|---|---|---|
| ENG-090 | No external requests; no third-party scripts | TPL README | U | 0 external `src`; 5 outbound `href`s (the STS credit link) | Implemented | Keep | None |
| ENG-091 | External links open safely (`noopener noreferrer`) | NEW (built in v0.8) | N | `tests/variants.mjs` live-ordering case | Implemented | Keep | None |
| ENG-092 | No payments, carts or secrets in the site; ordering is link-out only | brief §6; `docs/..._ARCHITECTURE.md` | U | Confirmed | Implemented | Add a repository secrets scan (WP2) | None |
| ENG-093 | Security headers (content security policy, referrer, frame, content-type options) | NEW | N | None (no host files). Obstacles to a strict policy: 1 inline script per page, 6 inline `style` attributes on two pages | Missing | `security` policy in `engineering.json`; generated host snippets (WP5). A strict policy needs the inline items refactored or hashed | Guarded |
| ENG-094 | No cookies, storage, analytics or fingerprinting by default | NEW | N | Verified by search: none in `site.js`, `hero.js`, `menu.js` | Implemented | `check:privacy` asserts it (WP2) | None |
| ENG-095 | Dependency audit and licence check | NEW | N | `package-lock.json` pins; no audit or licence check | Missing | `check:deps` (audit and licence allow-list; needs network) (WP2) | None |
| ENG-096 | Media rights and provenance stated | AUD m-8 | U | `media/PROVENANCE.md` lacks licence terms | Partial | Provenance schema with a rights field; check every media file has a row (WP2) | None |

## G. SEO, portability and hosting independence
| ID | Requirement | Source | Class | v0.8 evidence | Status | v0.9 action | Visual |
|---|---|---|---|---|---|---|---|
| ENG-100 | Baseline SEO: unique titles and descriptions, canonical, sitemap, robots, structured data for an indexable client build | 09 §Tier 1; AUD M-4; `docs/..._ARCHITECTURE.md` §7 | U | Titles, descriptions, canonical in `src/components/document.mjs`; no sitemap, robots or JSON-LD; `seo.structuredData` is a dead flag | Partial | Implement behind flags, off while `noindex` (WP5). Demo output stays free of sitemap, robots and JSON-LD | None |
| ENG-101 | A branded 404 page | NEW | N | None | Missing | Proposal only: a new page is a visual addition | Approval |
| ENG-102 | Works at any base path and with or without pretty URLs | NEW | N | Relative links; never tested under a subpath or a pretty-URL host | Partial | `check:portability` serves the build at `/` and `/jade-and-ember/` and with extension-less URLs (WP6) | None |
| ENG-103 | Social preview image and icon set | NEW | N | `og:image` absent; inline SVG favicon only | Missing | Proposal only: needs new or reused imagery | Approval |
| ENG-104 | Runtime and platform support declared and tested (Node, Python, operating systems) | TPL README | U | "Node 18+" in README; no `engines`; `tests/variants.mjs` uses symlinks | Partial | `engines`, a Windows-safe test path, a CI matrix (WP6) | None |
| ENG-105 | Host-neutral deployment output: `dist/` plus optional per-host adapters | NEW | N | The committed folder is the output; no host files | Missing | `dist/` build and adapters for static hosts (WP5, WP6); no deployment is performed | None |
| ENG-106 | Cross-browser: Chromium, Firefox, WebKit | 09 §Tier 1 "browser resilience" | U | Chromium only | Missing | Automated Firefox and WebKit runs where browsers are installable (WP8); real devices remain human work | None |
| ENG-107 | Valid HTML and fully resolving internal links | NEW | N | Never validated; `tests/site.mjs` checks some links | Partial | `check:html` (html-validate) and `check:links` (every href, src, srcset, fragment, CSS url(), video source; exact letter case; reachability graph). Phone-number wrapping (F-G4-01) is a known finding | None |
| ENG-108 | `llms.txt` generated from verified business facts and validated (STS Search and AI Discovery Readiness, item 5) | framework standard `architecture/11-core-search-ai-discovery-readiness-v1.md` | N | Absent | Missing | `llmsTxt` (indexable client builds only; never the demonstration) and `llmsProblems` in `check:seo`: links equal the sitemap, facts printed on the pages, no invented fact, no foreign host, no local path or secret, Markdown-injection safe | None |
| ENG-109 | Crawler policy per client separating search, AI retrieval and training (standard item 9) | same standard | N | One fixed `User-agent: *` allow file | Missing | `seo.crawlers` and `src/lib/crawlers.mjs`; `robotsProblems`; search indexing can never be disallowed on an indexable build. The agent list was not re-fetched from provider pages (no network) and must be re-verified before release | None |
| ENG-110 | Host-aware public URLs: canonical, sitemap, JSON-LD and `llms.txt` use the URL the host finally serves | owner decision (Cloudflare Pages redirects `.html`; Vercel needs `cleanUrls`) | N | `.html` canonicals everywhere | Missing | `seo.host`, `seo.urlStyle`, `publicUrl`; host simulations in `lib/server.mjs`; `urlStrategyProblems`. Live verification on real hosts is still required | None |
| ENG-111 | Human search review before a production release (facts, structured data, crawler policy) | same standard | N | None | Missing | `search-review` approval bound to `npm run release:search-digest`; gate requirements `searchReadiness` and `productionDomain` | None |

## Gate 2 update (2026-10-10, `APR-JE-021`)
Rows whose status changed because Gate 2 implemented the checks proposed above. The v0.8 column above is the baseline analysis and is not edited. "Automated" means a check in `npm run verify`; a human pass is still required where stated.

| ID | New status | Check | Result on v0.8 |
|---|---|---|---|
| ENG-042 | Implemented (automated) | `check:keyboard` | 172 Tab stops on 5 pages x 2 widths: DOM order, no trap, reverse order, focus visible by pixel comparison, not obscured, skip link, phone menu. No defect |
| ENG-043 | Implemented (automated) | `check:keyboard` | 24 px for every control, 44 px for `.btn`, `.top-cta`, `.nav-toggle`, `.pause`. No defect |
| ENG-044 | Implemented (automated) | `check:reflow` | 320 px, 200% zoom and WCAG text spacing on every page: no sideways scroll, no clipping, no overlap. No defect |
| ENG-046 | Implemented (automated, proxy) | `check:media` | Flash proxy on both hero clips: 0 reversals per second. Needs ffmpeg; a human look remains for real flicker |
| ENG-048 | Implemented (automated) | `check:order` | 234 consecutive heading and control pairs: screen order follows DOM order (columns read in turn are accepted) |
| ENG-049 | Partial | `check:a11y-tree` | Landmarks, headings, names, references on every page. **A human screen-reader pass is still required** (ENG-052, WP8) |
| ENG-050 | Implemented (automated) | `check:forced-colors` | 683 lines of text and 162 controls in forced-colours emulation. No defect |
| ENG-060 | Implemented (lab) | `check:budgets` | Throttled 390 px: worst LCP 1.0 s, CLS 0, blocking 57 ms at most, interaction 32 ms. Lab values; real devices remain a release requirement |
| ENG-061 | Implemented | `check:budgets`, `budgets.json` | Limits plus regression detection against the recorded v0.8 values. Budgets live in `engineering/budgets.json`, not `config/` (the frozen configuration folder is not extended) |
| ENG-062 | Implemented (automated) | `check:media` | One priority image per page, never lazy; others lazy; every image sized; only fonts and the priority image are preloaded |
| ENG-070 | Partial | `check:contracts` | Component tier implemented for all 16 shared components and 5 page renderers; the direction-conformance review remains a recorded human critique |
| ENG-096 | Partial | `check:media` | Every media file has a provenance row; the rights statement is missing: **known finding F-G2-01** (documentation only, needs owner approval because `media/` is frozen) |

## Gate 3 update (2026-10-10, `APR-JE-022`)
| ID | New status | Check | Result on v0.8 |
|---|---|---|---|
| ENG-002, ENG-018 | Partial: tokens validated; not extracted | `check:tokens` | The 31 `:root` tokens equal a frozen snapshot (`tokens.json`), every `var()` defined, spacing scale grows, 16 contrast pairs meet WCAG, no new hard-coded colours. States no aesthetic rule. Extraction of tokens into a source file with a generated `:root` block was **not** done (not needed to validate; it would change how `styles.css` is produced) |
| ENG-064, ENG-090 | Implemented (automated) | `check:privacy` | Statically in every script and page, and in the browser: no third-party request on any page |
| ENG-065 | Partial by decision: hashing implemented as an opt-in copy | `check:assets`, `npm run build:hashed` | The delivered site keeps its plain names and paths. The hashed copy renames 18 files, rewrites every reference and equals v0.8 in the browser. Cache rules never mark plain names immutable |
| ENG-076 | Implemented | `check:ci`, `.github/workflows/jade-and-ember-verify.yml` | Read-only workflow, pinned actions, `npm ci --ignore-scripts`, no secrets, deployment, merge or AI service. **Not yet run on GitHub** |
| ENG-077 | Implemented (automated) | `check:determinism` | Enforced in `npm run verify`, and so in CI |
| ENG-092 | Implemented (automated) | `check:secrets` | Working tree and every commit's added lines: none found |
| ENG-093 | Implemented (generated, not deployed) | `check:security`, `npm run host:files` | `default-src 'none'` CSP with hashes for the one inline script and six inline style attributes, 8 headers, `_headers`/nginx/Apache outputs. Identical to v0.8 under the headers. Decision D-11 open (reliance on `'unsafe-hashes'` in browsers not tested here) |
| ENG-094 | Implemented (automated) | `check:privacy` | No cookies, storage, service worker or beacon in 10 browser loads |
| ENG-095 | Implemented | `check:deps` | 0 production dependencies; 7 exact pins; 341 locked packages with sha512; licences allow-listed (one **unverified**: `parse-cache-control`); audit: 0 critical, 11 high in the development-only Lighthouse CI tree, recorded |
| ENG-102 | Implemented (automated) | `check:portability` | Extracted ZIP over `file://`, domain root, subdirectory, no-trailing-slash redirect, extension-less URLs, no Range support, queries and fragments: all pass. Known finding F-G3-01 (console noise over `file://`) |
| ENG-105 | Partial | `npm run host:files` | Host files for Netlify/Cloudflare Pages, nginx, Apache are generated from one policy. A separate `dist/` folder was not created (the delivered folder is unchanged). Nothing is deployed |
| ENG-096 | Partial | proposal | Media rights wording proposed in `docs/JADE_AND_EMBER_MEDIA_RIGHTS_PROPOSAL.md` (Option A recommended); **not applied**, nothing asserted |

## Gate 4 update (2026-10-10, `APR-JE-023`)
| ID | New status | Check | Result |
|---|---|---|---|
| ENG-071 | Implemented (automated) | `check:release`, `npm run release:gate` | Severity vocabulary enforced: an open Blocker or Major finding blocks a client-production release; an unknown severity blocks it |
| ENG-076 | Implemented; remote result recorded | `check:ci`, `engineering/CI.md` | The workflow ran on GitHub twice and failed twice; the causes and the corrections are in `engineering/CI.md`, "Remote results", together with the result of the Gate 4 push |
| ENG-079 | Implemented (manifest); package not produced | `npm run release:manifest`, `release/release-manifest.schema.json` | The manifest records version, source commit, baseline, framework reference, configuration and asset hashes, QA status and approvals; deterministic and valid under two validators. A release package is written only by `release:prepare`, and only when the gate allows it (it does not today) |
| ENG-080 | Implemented | `check:baseline` | Unchanged; the permanent branch is verified on every run |
| ENG-081 | Implemented (automated) | `check:release`, `check:hosting` | The gate and the tooling contain no deployment; no deployment approval exists. The static-folder model is checked against Cloudflare Pages limits; nothing depends on Vercel |
| ENG-082 | Implemented (automated) | `check:seo` | The demonstration stays `noindex, nofollow` on all five pages with no canonical, sitemap, robots file or structured data; a configuration that makes it indexable is refused by the build and by the gate |
| ENG-095 | Evaluated; unchanged | `check:deps`, `engineering/DEPENDENCY-ADVISORIES.md` | 11 high advisories in the development-only Lighthouse CI tree: actual exposure assessed (none reachable), four remediation options tested in a scratch copy, none applied |
| ENG-096 | Policy accepted | `docs/JADE_AND_EMBER_MEDIA_RIGHTS_POLICY.md` | Option A adopted as a documentation policy; no licence asserted; `media/PROVENANCE.md` unchanged; rights verification is a release requirement and structured data may not assert a licence |
| ENG-100 | Implemented (automated) | `check:seo` | Canonical URLs, `sitemap.xml`, `robots.txt` and Restaurant JSON-LD generated from validated client configuration for an indexable client build only; escaping, determinism and agreement between canonicals, sitemap and robots proven |
| ENG-105 | Partial | `check:hosting`, `engineering/HOSTING.md` | Static folder plus generated host files; a separate `dist/` folder still not created (decision pending) |
| ENG-107 | Implemented (automated); one known finding | `check:html`, `check:links` | All pages of the demonstration and of a client build are valid HTML5 and pass the accessibility rules; every internal reference resolves. F-G4-01 (phone numbers may wrap) awaits an owner decision |

## Gate 4 reconciliation update (2026-10-10, `APR-JE-024`)
| ID | New status | Check | Result |
|---|---|---|---|
| ENG-100 | Implemented (automated), extended | `check:seo` | Adds unique page metadata, `og:url`, facts consistent across pages, structured data and `llms.txt`, and exclusion of foreign, staging and example hosts |
| ENG-103 | Unchanged: proposal only | | `og:url` added; `og:image` still absent (needs authorised media) |
| ENG-105 | Partial | `check:hosting`, `engineering/HOSTING.md` | Platform-independent controls and host-specific adapters identified; no Vercel adapter built |
| ENG-107 | Implemented; F-G4-01 accepted | `check:html`, `check:phone` | The phone numbers do not wrap, overflow, clip or get covered at 9 supported mobile widths |
| ENG-108 | Implemented (automated) | `check:seo` | `llms.txt` generated and validated for indexable client builds; omitted from the demonstration |
| ENG-109 | Implemented (automated); agent list to re-verify | `check:seo` | Four policy variants render exactly the configured groups |
| ENG-110 | Implemented (simulated); live check pending | `check:seo`, `check:links` | Cloudflare Pages, Vercel (with and without `cleanUrls`) and a plain server: every public URL answers 200 directly; internal links resolve (one redirect hop each on clean-URL hosts) |
| ENG-111 | Implemented (gate); no review exists | `check:release` | 13 single defects added to the gate matrix; a client-production release is blocked until a search review is recorded |
| ENG-060 | Metric revised, provisional | `check:budgets`, `engineering/CI.md` | Handler time is gated; end-to-end latency is retained and reported; the investigation tool runs on the CI runner |

## Gate 4 closure (2026-10-10, `APR-JE-025`)
Gate 4 and its reconciliation are approved and closed on the evidence in `jade-and-ember/QA.md` (32/32 local, 159 Gate 4 negative tests, GitHub Actions runs 8 and 9 successful on both jobs). Statuses above stand. Changes of status only:

| ID | Status at closure |
|---|---|
| ENG-060 | Handler-time budget accepted provisionally (`APR-JE-024`); the end-to-end latency anomaly is an **open, non-blocking diagnostic** (`APR-JE-025`): no further experiments, no relaxation of thresholds |
| ENG-107 | F-G4-01 **accepted without visual changes**; `check:phone` holds the condition |
| ENG-076 | Remote CI confirmed: runs 7, 8 and 9 succeeded; runs 1 to 3 failed earlier (causes in `engineering/CI.md`) |
| ENG-106 | Cross-browser (Firefox, WebKit): **not done**; Gate 5 |
| ENG-081 | No release, rights, search-review or deployment approval exists; every production-release blocker stays |

