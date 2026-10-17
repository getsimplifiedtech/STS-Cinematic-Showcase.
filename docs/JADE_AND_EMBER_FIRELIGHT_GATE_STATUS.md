# Jade & Ember Firelight: state of the 45-check gate

**Approval:** APR-JE-052. **Branch:** `feature/jade-and-ember-firelight` (the v0.9 branch, the deployed Jade & Ember and MONOLITH are unchanged).
**Run:** `npm run verify` on the final build, Node 22, headless Chromium with software rendering (Node 24 is the recommended runtime; the checks themselves are the framework's, unmodified).

## Result in one paragraph

**35 of 45 checks pass, 10 fail, and none was removed, skipped or weakened.** Eight of the ten fail because they compare the site with the frozen v0.8 baseline (APR-JE-017: "the baseline never changes"), which a redesign cannot satisfy until the owner approves a new baseline. Two are environment issues (the clone's remote name, and a Chromium software-rendering notice). Everything that measures the site on its own terms passes: accessibility (keyboard, reflow, forced colours, accessibility tree, reading order), media, privacy, tokens, HTML, links, SEO, hosting, release, and the Home budget.

## All 45 checks

| Check | Result | Why it fails |
|---|---|---|
| `check:baseline` | pass |  |
| `check:schema` | pass |  |
| `check:determinism` | pass |  |
| `check:delivery` | **FAIL** | Baseline-bound: the delivered set must equal the v0.8 preview package. 18 files are new (Home and per-page CSS and scripts, the new media) and 6 v0.8 files are gone (`hero.js`, the old hero stills and video, `dish-charsiu.webp`). |
| `check:project` | pass |  |
| `check:extraction` | pass |  |
| `check:authority` | pass |  |
| `check:contracts` | pass |  |
| `check:media` | pass |  |
| `check:tokens` | pass |  |
| `check:secrets` | pass |  |
| `check:deps` | pass |  |
| `check:ci` | **FAIL** | Environment: this clone's remote name is lowercase (`sts-cinematic-showcase.`), and the check only accepts the local framework action in the repository on its list (`STS-Cinematic-Showcase.`). Nothing to do with the redesign; not checked in this container against the v0.9 branch. |
| `check:html` | pass |  |
| `check:links` | pass |  |
| `check:seo` | pass |  |
| `check:release` | pass |  |
| `check:framework-matrix` | pass |  |
| `check:evidence` | pass |  |
| `check:hosting` | pass |  |
| `check:privacy` | pass |  |
| `check:security` | **FAIL** | Baseline-bound plus one environment notice. Policy, CSP (0 violations), header probes and request checks pass. The 60 "candidate under the headers equals v0.8" comparisons (text, structure, styles, pixels) differ by design, and Chromium's software-GL notice "GPU stall due to ReadPixels" appears once on Home. |
| `check:assets` | **FAIL** | Baseline-bound plus a shared-tool limit. The manifest check passes (35 files, 2,037,422 B). It fails because delivered files differ from the v0.8 checksums, and because the hashed-copy tool rewrites one stylesheet only (`markup.stylesheet`), so the per-page CSS files are not found in the hashed copy. |
| `check:budgets` | **FAIL** | Baseline-bound: the shared check measures against the v0.8 export, which has no `home.css`, so it stops with a file-not-found. Replaced for this branch by `check:budgets-firelight` (passes), which keeps the v0.9 limits for four pages and has a Home-only budget. |
| `check:keyboard` | pass |  |
| `check:reflow` | pass |  |
| `check:forced-colors` | pass |  |
| `check:a11y-tree` | pass |  |
| `check:order` | pass |  |
| `check:d11` | pass |  |
| `check:supports` | pass |  |
| `check:phone` | pass |  |
| `check:portability` | **FAIL** | Environment: every serving convention passes (file://, domain root, subdirectory, pretty URLs, no Range, both host adapters). The only remaining problem is Chromium's software-GL notice "GPU stall due to ReadPixels" on Home at phone width. |
| `check:release-dryrun` | pass |  |
| `check:selftest-release-control` | pass |  |
| `check:regression` | **FAIL** | Baseline-bound: compares the candidate to the frozen v0.8 baseline (source, text, structure, styles, pixels, behaviour) and stops because the baseline has no `home.css`. |
| `check:selftest` | **FAIL** | Baseline-bound: the Gate 1 mutation tests start from the v0.8 baseline and stop for the same missing file. |
| `check:selftest-gate2` | **FAIL** | 34 cases ran; 26 hold. Six `budgets` cases stop on the v0.8 baseline. Two shared cases name the generic fixture's markup (`.hero` selectors, the v0.8 menu button) and are re-pointed in the project's own suite, where they pass. |
| `check:selftest-gate3` | pass |  |
| `check:selftest-gate5` | pass |  |
| `check:selftest-gate6` | pass |  |
| `check:selftest-generic` | pass |  |
| `check:selftest-evidence` | pass |  |
| `check:selftest-gate4` | pass |  |
| `check:selftest-je-markup` | **FAIL** | The project's own copy of the self-tests. Fails only on the same baseline-bound cases (the Gate 1 start-up and the six `budgets` cases); every case re-pointed at the Firelight markup passes. |

## Update: hero refinement (owner review, 2026-10-17)

Result is unchanged: **35 of 45 pass, the same 10 fail** (8 baseline-bound, `check:ci`, `check:portability`), none removed or weakened. Home script is 14,745 B gzip against the 15,600 B Home limit; the other pages stay at 2,900 B or less against 3,000 B.

What changed in the site: the Home headline is 6vw (was 7.2vw, cap 7rem) and the footage is slid right by 3.2vw on wide screens, so the first line ends 6 to 8vw before the wok's rim at every desktop size from 1024 to 1920 px wide (measured). The hero paragraph's closing sentence is its own line and no paragraph width ends on a single word (15 widths from 320 to 1920 px checked). The footer no longer shows the development stamp ("Concept v0.8..."); it stays in the page source as a comment and in `config/site.json`, which `check:release` requires. Visit hours no longer break across lines on phones. A new case in `tests/site.mjs` fails if any page shows lab, prototype, staging or version wording. The lab label named in the review exists only in the retired lab prototype on its own branch, never in this build.

## What was fixed in the site, not in the checks

- Reading order on Home: the four overlapping chapter panels are set aside for screen readers (script-added `aria-hidden`) and the same words are added as an ordered, visually hidden list, shown as ordinary text in forced colours.
- 320 px reflow and text spacing: decorative glows no longer overflow their sections, so no section needs clipping; headline masks have room for ascenders; the Visit hours table wraps under text-spacing overrides.
- Keyboard: the two hero buttons stay in the Tab order when faded (they come back into view on focus), so Shift+Tab walks the same order as Tab.
- Pause motion on phones sits below the header, no longer over the Menu button; the hero buttons sit inside the first screen even with the notice bar above the header.
- The footage starts before the steam solver is built, and the solver hands over to the calm layout faster on slow devices.
- Over file:// browsers refuse to hand an image to WebGL, so Home uses the calm layout there (footage still plays) with no console noise.

## Records changed (all project-owned)

`engineering/budgets-firelight.json` and `project-owned/budgets-firelight.mjs` (new), `tokens.json` (Firelight values, colour-literal ratchet tightened from 42 to 29), `assets.manifest.json`, `media-rights-inventory.json`, `findings.json` (F-G2-01 closed because the new `media/PROVENANCE.md` states rights), `contracts/components.json`, `framework-migration-matrix.json` and its generated Markdown, `sts.engineering.json`, `project-owned/client-build.mjs`, `checks/je-selftest-gate2..5.mjs` (cases re-pointed at the Firelight markup), and the approvals ledger (APR-JE-052). **The shared framework snapshot (`engineering/` at the repository root) is untouched.**

## Decisions for the owner

1. **Freeze Firelight as a new baseline once signed off.** This is the one change that turns the eight baseline-bound checks into meaningful ones again. It needs an owner-approved record (a new baseline commit, preview package, checksums and style-difference list). Until then they stay failing on purpose; I did not change or remove the baseline.
2. **Framework follow-ups** (need the owner's snapshot process, not edited here): let the hashed-copy tool handle more than one stylesheet; recognise Chromium's software-GL notice as engine noise like the existing Firefox preload notice; give the generic self-test cases a way to be marked not applicable when a project's markup differs.
3. **`check:ci`** should pass in the real repository (capital S) and is worth one look there.

## Not verified

Everything above ran in headless Chromium with software WebGL. Frame rate, battery, thermal behaviour, mobile data loading and Safari are **[unverified on a real device]**; the device protocol in `docs/JADE_AND_EMBER_DEVICE_TEST_PROTOCOL.md` is the way to close that.
