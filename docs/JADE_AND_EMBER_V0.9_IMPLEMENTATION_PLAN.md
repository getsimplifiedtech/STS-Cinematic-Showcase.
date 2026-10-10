# Jade & Ember v0.9: implementation plan for the HTML-first, platform-independent STS engineering framework

**Status:** plan for owner review. **Nothing in v0.9 is implemented.** No media generated, nothing merged or deployed.
**Branch:** `feature/jade-and-ember-v0.9`, created from `81311f7` (v0.8 plus documentation-only records; no site, config, media or code file differs from the v0.8 source commit `32afde7`).
**Baseline:** v0.8 is frozen: `baselines/jade-and-ember-v0.8/BASELINE.md`. It is **design-baseline approved, not approved for public deployment or client production**, and **visually immutable** (`APR-JE-017`).
**Authority (`APR-JE-016`, `APR-JE-018`):** Anthropic Frontend Design governs creative direction. STS governs engineering, architecture, reusable components, configuration, accessibility, security, performance, QA, portability and release controls. No competing aesthetic rules; the retired STS Premium Web Design skill is not reintroduced.
**Companion:** `docs/JADE_AND_EMBER_ENGINEERING_REQUIREMENTS_LEDGER.md` (76 requirements mapped row by row, with sources and evidence).

## 1. What v0.9 is, and is not
**Is:** an engineering framework, proven on the frozen Jade & Ember build, that any static (HTML-first) STS site can use on any host: a requirements ledger, typed configuration schemas, component contracts, a single `verify` check suite, host-neutral output and security artifacts, and release controls.
**Is not:** a redesign, a copy edit, a media change, a deployment, a Lovable pipeline, or a revival of STS visual packages. The framework's Design Profile, compiler and package model (specs 02 to 08, 11, 12) are **parked**, not ported (ledger ENG-028 to ENG-031).

## 2. Findings from mapping the framework against v0.8
Ledger totals: **76 requirements**. Class: 39 universal engineering (keep), 15 valid but worded for Lovable or the compile pipeline (generalise), 12 new (HTML-first, portability, security), 5 pipeline or taxonomy specific (park), 3 Lovable-specific (retire), 2 aesthetic (delegated to Frontend Design). Status in v0.8: **28 implemented, 26 partial, 12 missing, 10 not applicable**. Visual impact of the planned actions: 69 none, 4 guarded, 3 need owner approval.

**Strong already:** static-first behaviour, config-driven build with fail-closed validation, WCAG 2.2 AA scan on all five pages, measured contrast, reduced-motion and Save-Data handling, no third-party requests, a verified distributable, deterministic output (verified by hand).
**Main gaps:** no typed schemas; no keyboard, text-spacing, zoom, forced-colours or accessibility-tree checks; no budget, media, privacy, dependency or security-header checks; no CI; no release manifest, severity gate or version source; no cache-safe asset names; sitemap, robots and structured data promised but absent; Chromium only.

## 3. Obsolete Lovable-specific requirements (disposition)
| Requirement | Source | Disposition |
|---|---|---|
| Lovable is the builder and receives only compiled specifications | `README.md:6-8`; `01-layer-model-v2.md:28-31` | **Retire.** Replace with "output is a deterministic static render" |
| Compile to a "Lovable-facing rendering"; pipeline steps 12 and 13 | `08` §Canonical pipeline | **Retire** (the build is the renderer) |
| Context-budget partitioning for Lovable passes | `08` §Context budget and partitioning | **Retire** |
| Builder-default overrides to stop Lovable homogenising output | `04` §Builder-default overrides | **Retire**; keep only "no framework default leaks into a client build" |
| "Lovable never arbitrates conflicts" | `README.md:28`; `01` | **Generalise:** all conflicts resolved at build time or the build fails; nothing is arbitrated by a host or runtime |
| Builder drift check after each Lovable pass | `09` §Builder drift | **Generalise** to output-versus-configuration conformance (exists: `tests/site.mjs`) |
| Architecture and validation precede Lovable-credit spend | `README.md:31`; `08` §Credit discipline | **Generalise** to "offline validation precedes any paid spend; no paid generation without approval" |
| Lovable pilot and parity gates before cutover | `10` Phases 5 to 8 | **Retire** as written; framework-internal |
| Lock emitted "before builder use" | `14` §Lockfile | **Generalise** to a release manifest (WP7) |
| Design Profile, compiler and lockfile as the only route to a build | `03`, `08`, `14` | **Park** for HTML-first projects |
| Visual-system taxonomy and visual packages | `02`, `04`, `11` | **Park; never carry as aesthetic rules** (policy `APR-JE-016`). Tokens and configurations may be extracted (WP5) |

## 4. Visual immutability contract
**"Visual" means anything a visitor or assistive technology can perceive:** rendered pixels at any viewport, visible text, labels and alt text, layout, colours, fonts, imagery, video and its behaviour (autoplay rules, fallbacks, Pause), motion, focus appearance, print layout, and the document title. **Non-visual:** build tooling, tests, docs, HTML attributes with no rendering effect (asset URL hashes, `<meta>` and `<link>` additions, JSON-LD), response-header files, release artifacts.

**Enforced by a harness (WP1) that every later work package must pass:**
1. **Pixels.** Build the frozen baseline from the tag in a clean worktree and the candidate from the working tree; render five pages at seven viewports (2560×1440, 1440×900, 1024×768, 820×1180, 390×844, 320×640, 844×390) with reduced motion, plus the states already tested (phone menu open, current Menu jump link, first-link focus ring, Menu print emulation). **Zero differing pixels.** Baselines are rebuilt in the same pinned environment on each run (Playwright 1.64.0, Chromium 1194, same fonts) so rasterisation differences cannot cause false results, and are not stored as images.
2. **Text.** `innerText` and the accessibility-tree snapshot of every page are identical.
3. **Styles.** A hash of every element's computed style is identical.
4. **Assets.** Image, video and font bytes are identical (file names may change only through the hashing step, with a recorded mapping).
5. **Behaviour.** The hero state-machine scenarios (`tests/qa.mjs`) produce the same results.
6. **Source bytes.** Built HTML may differ from the baseline only in an allowlist of non-visual categories (`engineering/immutability-allowlist.json`), each entry naming its work package; **any other difference fails the build**. A visual change cannot enter without an owner approval ID in that file.

**Visual-affecting proposals, none applied, each needing separate owner approval:**
| ID | Proposal | Why it would be visual | Ledger |
|---|---|---|---|
| VP-1 | Footer stamp text "Concept v0.8 ..." to v0.9, or a version-driven stamp | Visible text on every page | ENG-022 |
| VP-2 | Replace the spaced em dash in the disclosure bar (audit m-5a) | Visible text on every page | audit |
| VP-3 | Branded 404 page | New page | ENG-101 |
| VP-4 | Social preview image and icon set | New or reused imagery | ENG-103 |
| VP-5 | Any fix for defects the new reflow, keyboard, forced-colours or contrast checks find | Rendering would change | ENG-042 to ENG-050 |
| VP-6 | The hero descriptor above the `h1` (audit m-5b) and the repeated closing band (m-5d) | Layout and copy | audit |
Refactoring inline `style` attributes into CSS (for a strict content security policy) is **guarded, not proposed**: it proceeds only if the harness proves identical computed styles; if it cannot, it becomes a proposal.

## 5. Work packages
Size: S small, M medium, L large. "Visual" uses the ledger's three levels.

| WP | Scope | Main outputs | Acceptance | Visual | Size |
|---|---|---|---|---|---|
| **WP0** | Freeze v0.8 (done) | `baselines/jade-and-ember-v0.8/`, `APR-JE-017`, `APR-JE-018`, this plan | Checksums match; ZIP equals source commit | None | done |
| **WP1** | Immutability harness | `engineering/checks/immutability.mjs`, allowlist, worktree builder | Zero-diff on the unchanged branch; fails on a one-pixel and a one-character mutation (self-test) | None | M |
| **WP2** | Check suite expansion (section 7) | `engineering/checks/*`, `npm run verify` (fast and full tiers) | Every new check passes on v0.8 output or reports a finding; findings are not auto-fixed | None | L |
| **WP3** | Typed configuration | JSON Schemas for `client`, `menu`, `copy`, `site` and new `engineering.json` (budgets, tier, thresholds, security policy); one validator | Build output byte-identical to v0.8; every `tests/variants.mjs` failure case still fails with a clear message | None | M |
| **WP4** | Component contracts | One contract per component (inputs, markup guarantees, accessibility and performance notes, fallbacks, tests) and contract tests | No markup change; contract tests pass | None | M |
| **WP5** | Platform-independent output | (a) tokens source and a generated `:root` block; (b) content-hashed asset names; (c) `dist/` plus host adapters generated from one policy (headers, redirects, cache rules) for static hosts; (d) sitemap, robots, JSON-LD behind flags (audit M-4), off while `noindex` | Immutability harness passes; generated CSS byte-identical to v0.8 `styles.css`; adapters validated by tests, not deployed | Guarded | L |
| **WP6** | Portability and CI | `engines`, Windows-safe tests, subpath and pretty-URL serving tests, a CI matrix, thin CI wrappers around `npm run verify` | Passes at `/` and `/jade-and-ember/`; same results on two operating systems | None | M |
| **WP7** | Release controls | `VERSION.json`, `release-manifest.json`, `SHA256SUMS`, `framework.lock.json`, structured severity findings, release script, reproducible preview ZIP | Script refuses a production mark without approvals or with open Blockers or Majors; contains no deploy step; the extracted ZIP passes `tests/extracted.mjs` | None | M |
| **WP8** | Browser and real-device programme (audit M-5) | Firefox and WebKit runs where installable; real-device protocol and evidence template | Automated cross-browser results recorded; device evidence recorded **by the owner or a human tester** | None | M, human-dependent |
| **WP9** | Framework extraction (framework repository) | A reviewed proposal and then changes: engineering ledger, schemas, checks, contracts, release docs; Lovable documents marked superseded; README rewritten; audit findings F-1 to F-9 | **Separate owner approval required before any change to `getsimplifiedtech/sts-web-design-framework`** | None | L |
| **WP10** | Documentation | `docs/` engineering guide, "start a new client project" checklist, glossary | A new person can build and verify a client project from the docs alone | None | S |

**Files in this repository expected to change in v0.9** (all non-visual or guarded): `package.json` (scripts, engines, version), `build.mjs`, `src/lib/config.mjs`, `src/components/document.mjs` (hashed URLs, optional metadata), `config/*.json` (schema references; new `engineering.json`), `styles.css` generation (byte-identical), new `engineering/`, new tests, docs. **Not changed:** `media/`, `fonts/`, `hero.js` logic, `site.js`, `menu.js`, page copy, `config/copy.json` text, labels in `config/site.json`, and every rendering rule.

## 6. Proposed repository layout (v0.9 branch)
*Gate 1 note: implemented as `jade-and-ember/engineering/` so Node resolves its development dependencies from the project; the contents below are unchanged.*
```
jade-and-ember/         the frozen reference implementation (changes limited as above)
engineering/            project-agnostic framework code, extractable to the framework repository
  requirements/         the ledger, evolved into ENGINEERING_REQUIREMENTS.md
  schemas/              *.schema.json
  checks/               one script per check, shared helpers
  contracts/            component contracts
  release/              manifest, severity gate, packager
  hosts/                adapter templates (headers, redirects) for static hosts
baselines/              frozen records (v0.8 present)
docs/                   plans, approvals, references
```
**Strategy (recommended):** build and prove the framework here first, against the frozen site, then extract it to the framework repository in WP9 after the owner approves that change. This avoids touching the framework repository before the checks are proven and keeps the framework "executable by qualified humans and AI agents without undocumented knowledge" (`01` §QA).

## 7. Missing automated checks (all run in `npm run verify`; none alters output)
| Check | Verifies | Ledger | Notes |
|---|---|---|---|
| `check:immutability` | Pixels, text, computed styles, assets, behaviour against the v0.8 build | ENG-073 | WP1; the gate for everything else |
| `check:schema` | Config files against JSON Schema | ENG-012, ENG-013 | WP3 |
| `check:determinism` | Two builds equal; committed pages equal a fresh build | ENG-015, ENG-077 | |
| `check:authority` | No active document names the retired skill as authority; reference hashes agree | ENG-001 to ENG-004 | |
| `check:keyboard` | Per-page tab-order snapshot; focus visible and not obscured | ENG-042 | |
| `check:reflow` | 320 px reflow, text-spacing overrides, 200 percent zoom | ENG-044 | Findings become proposals |
| `check:order` | DOM order equals visual order for key blocks | ENG-048 | |
| `check:a11y-tree` | Accessibility-tree snapshot per page; landmarks, names, roles | ENG-049 | Complements, does not replace, a human screen-reader pass |
| `check:forced-colors` | Controls perceivable in forced-colours emulation | ENG-050 | |
| `check:targets` | 24 px minimum and 44 px for configured primary actions | ENG-043 | |
| `check:budgets` | Per-page transfer and media budgets from `engineering.json`; LCP and CLS assertions | ENG-060, ENG-061 | |
| `check:media` | Dimensions on every image, preload count, lazy loading, every file has a provenance row and a rights field, flash check on video | ENG-046, ENG-062, ENG-096 | |
| `check:privacy` | No cookies, storage, beacons, third parties | ENG-094 | |
| `check:security` | Generated header files and policy; no inline allowances beyond the declared set | ENG-093 | After WP5 |
| `check:html` | HTML validity | NEW | Dev dependency; decision D-8 |
| `check:links` | Internal links, fragments, assets (offline); external links optional | ENG-051 | |
| `check:deps` | `npm audit` and a licence allow-list | ENG-095 | Needs network |
| `check:secrets` | Repository secrets scan | ENG-092 | |
| `check:portability` | Serve at `/` and `/jade-and-ember/`, with extension-less URLs | ENG-102 | WP6 |
| `check:seo` | Sitemap, robots, canonical, JSON-LD validity when indexable; absent while `noindex` | ENG-100 | WP5 |
| `check:release` | Version agreement, approvals present, open severity, manifest and checksums | ENG-071, ENG-079, ENG-080 | WP7 |
| `check:collisions` | Sticky bars, Pause and controls never overlap (the template's guard) | audit m-6 | |
| Cross-browser run of the existing suites | Firefox and WebKit | ENG-106 | WP8 |

## 8. Sequencing and gates
Each gate ends with a report, evidence and a stop for review.
1. **Gate 0 (done):** baseline freeze, records, this plan.
2. **Gate 1 (implemented 2026-10-10, awaiting owner review, `APR-JE-020`):** WP1 harness, WP3 schemas, `check:determinism`, `check:authority`, plus `check:baseline`, `check:delivery` and a mutation self-test, integrated in `npm run verify`. Output byte-identical to v0.8; harness self-tested. Results: `jade-and-ember/QA.md`, section "v0.9 Gate 1". Deviations from this plan: the framework code lives in `jade-and-ember/engineering/` (not a repository-root `engineering/`) so its dependencies resolve from the project's `node_modules`; the tolerance rules, pinned environment and Firefox/WebKit support are as specified in `engineering/environment.json` but Firefox and WebKit are not installed here, so those runs are pending.
3. **Gate 2:** remaining WP2 checks and WP4 contracts. A findings report (real defects are listed, not fixed).
4. **Gate 3:** WP5 and WP6: tokens, hashed assets, adapters, SEO files behind flags, portability, CI.
5. **Gate 4:** WP7 release controls; a v0.9 release-candidate preview ZIP and manifest.
6. **Gate 5:** WP8 cross-browser and the real-device protocol (human-dependent).
7. **Gate 6:** WP10 documentation, then WP9 framework extraction **only after a separate approval**.
Visual proposals VP-1 to VP-6 are handled outside these gates, one decision at a time, after Gate 2 findings exist.

## 9. Audit findings carried into v0.9
M-4 to WP5 (SEO files, structured data flag made real or removed); M-5 to WP8; m-1 to WP7; m-2 to WP6; m-3 to WP10; m-4 to WP7; m-5 to VP-2 and VP-6 (approval); m-6 to `check:collisions`; m-7 to WP2 and WP3; m-8 and m-9 to WP2; F-1 to F-9 to WP9. M-1 to M-3 are closed (`81311f7`).

## 10. Risks
| Risk | Mitigation |
|---|---|
| Pixel comparisons fail on environment differences | Rebuild both sides in one pinned environment each run; document the pinned versions; no stored image baselines |
| Hashed asset names or generated CSS alter bytes | Byte-identical CSS test; HTML allowlist; asset byte checks |
| A strict content security policy conflicts with 1 inline script and 6 inline style attributes | Decision D-5; refactor only if computed styles stay identical |
| New checks find real accessibility defects | Reported as findings and proposals; no auto-fix; visual fixes need approval |
| Scope creep into design | Immutability harness is a gate; proposals are logged, not applied |
| Coupling to the framework repository too early | Project-first strategy; WP9 needs separate approval |
| `verify` becomes slow | Fast and full tiers; CI runs full, local default fast |
| Added dev dependencies | Dev-only, licence-checked, pinned by lockfile; decision D-8 |
| Windows or macOS differences | WP6 matrix; avoid symlinks and shell-specific code in tests |
| Human-dependent real-device work stalls release | Separated into Gate 5; production is not authorised by v0.9 anyway |

## 11. Decisions requested
1. **D-1 Footer stamp (VP-1):** keep the frozen text for now (recommended; it will read "v0.8" while the branch is v0.9), or approve a change. Version data drives non-visual metadata only until decided.
2. **D-2 Strategy:** project-first, extract later (recommended), or build directly in the framework repository.
3. **D-3 Framework repository:** confirm that WP9 will need its own approval, and whether it may be prepared as a pull-request proposal.
4. **D-4 CI:** may I add a CI workflow to this repository (GitHub Actions wrapper around `npm run verify`)?
5. **D-5 Security headers:** (a) a hash-based policy with the inline style attributes refactored under the harness (recommended); (b) allow inline styles; (c) a baseline set without a content security policy.
6. **D-6 Remote tag:** the push of `jade-and-ember-v0.8` was refused by the remote. Please create the tag on GitHub, or approve an alternative marker such as a `baseline/jade-and-ember-v0.8` branch.
7. **D-7 SEO files for the demo:** keep sitemap, robots and structured data absent while `noindex` (recommended); implement the code and exercise it only in client-build tests.
8. **D-8 Dev dependencies:** allow a small dev-only set (for example a JSON Schema validator and an HTML validator) with licence checks, or require zero-dependency custom code.
9. **D-9 Browsers:** may the development environment download Firefox and WebKit for Playwright, and will you or a tester run the real-device protocol?
10. **D-10 Preview naming:** adopt "version plus short commit" in every preview file name (for example `jade-and-ember-v0.9-rc1-<sha>.zip`) to avoid another duplicate-label problem.

## 12. What this plan does not do
It does not modify v0.8 files, implement any work package, change a pixel, word, image, font or motion rule, generate media, spend credits, modify the framework repository, merge, deploy or publish. It does not approve v0.8 for deployment or client production, and it does not reintroduce the retired STS Premium Web Design skill.
