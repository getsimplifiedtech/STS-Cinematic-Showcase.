# Jade & Ember Firelight: state of the 45-check gate

> **Latest (2026-10-18): 45 of 45 on Node 24.21.0 at `42bb148`; see "Update: final engineering corrections". The sections below are the history.**

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

Result is unchanged: **35 of 45 pass, the same 10 fail** (8 baseline-bound, `check:ci`, `check:portability`), none removed or weakened. Home script is 14,746 B gzip against the 15,600 B Home limit; the other pages stay at 2,981 B or less against 3,000 B (Our story, after the card system).

What changed in the site: the Home headline is 6vw (was 7.2vw, cap 7rem) and the footage is slid right by 3.2vw on wide screens, so the first line ends 6 to 8vw before the wok's rim at every desktop size from 1024 to 1920 px wide (measured). The hero paragraph's closing sentence is its own line and no paragraph width ends on a single word (15 widths from 320 to 1920 px checked). The footer no longer shows the development stamp ("Concept v0.8..."); it stays in the page source as a comment and in `config/site.json`, which `check:release` requires. Visit hours no longer break across lines on phones. A new case in `tests/site.mjs` fails if any page shows lab, prototype, staging or version wording. The lab label named in the review exists only in the retired lab prototype on its own branch, never in this build.

## Update: Rounds 1 and 2 reconciliation (owner decision 5, 2026-10-17)

**Result: 35 of 45 pass, the same 10 fail, none removed, skipped or weakened.** The Round 1 and 2 work briefly added three failures (`check:contracts`, `check:tokens`, `check:reflow`) and a schema regression; each was fixed in the site, not in the check (contracts string updated for the new menu section markup; the colour-literal count is back at its ratchet of 29 using existing tokens and `color-mix`; the teaser art stays inside its box with no `overflow:hidden`; the new page art lives in code, not in the shared copy schema). The project-owned Home budget also passes (`check:budgets-firelight`, static and runtime): the Home page weight grew with the teaser image, so the image was right-sized (860 px copy, 14 KB) rather than the recorded measurement being raised.

### The ten, one by one

| Check | Kind | What it protects | Why it fails | Status and next step |
|---|---|---|---|---|
| `check:delivery` | baseline-bound | the delivered file set equals the v0.8 preview package | Firelight adds and removes files by design | Cannot pass until the owner approves a new baseline. |
| `check:security` | baseline-bound + environment | CSP and header probes; candidate equals v0.8 under the headers | the 60 v0.8 comparisons differ by design; Chromium software-GL notice "GPU stall due to ReadPixels" | CSP (0 violations), header and request checks pass. Needs a new baseline; notice needs a framework follow-up. |
| `check:assets` | baseline-bound + tool limit | delivered files match recorded checksums | files differ from v0.8; hashed-copy tool rewrites only one stylesheet | Manifest check passes (36 files). Needs a new baseline and the tool follow-up. |
| `check:budgets` | baseline-bound | page weights against the v0.8 export | the export has no `home.css` | Replaced for this branch by `check:budgets-firelight` (passes, static and runtime). |
| `check:regression` | baseline-bound | candidate versus v0.8 text, structure, styles, pixels | stops on the missing `home.css` | Needs a new baseline. |
| `check:selftest` | baseline-bound | Gate 1 mutation tests start from the v0.8 baseline | same missing file | Needs a new baseline. |
| `check:selftest-gate2` | baseline-bound + generic fixture | 34 mutation cases | six `budgets` cases stop on the baseline; two generic cases name the old markup | 26 hold; the two markup cases are re-pointed in the project suite, where they pass. |
| `check:selftest-je-markup` | baseline-bound | the project's own copy of the self-tests | the Gate 1 start-up and six `budgets` cases | Every case aimed at the Firelight markup passes. |
| `check:ci` | environment | local framework action only in the listed repository | this clone's remote is lowercase `sts-cinematic-showcase.` | **Passes** when run as the real repository (`GITHUB_REPOSITORY=getsimplifiedtech/STS-Cinematic-Showcase.`), so the redesign is not the cause. |
| `check:portability` | environment | serving conventions | Chromium software-GL notice on Home at phone width | Every serving convention passes; the notice is engine noise (no page code reads pixels back). |

### What only the owner can unlock

1. Approve a Firelight baseline (APR-JE-017 says the baseline never changes, so a new one needs a signed record). That turns the eight baseline-bound checks into meaningful ones. A baseline branch was not created: that would be freezing.
2. The two framework follow-ups listed above (the snapshot is not edited here).

## Update: delivered-site budget after the Visit Us photographs (owner decision, 2026-10-17)

The three approved interior photographs for Visit Us (commit 1da3035) took the measured delivered-site total from within the v0.9 limit of 2,176,000 B to 2,307,074 B. The owner approved a Firelight-specific limit of **2,537,781 B** (the measured total plus 10 percent). It is recorded in `engineering/budgets-firelight.json` under `site`, and `engineering/project-owned/budgets-firelight.mjs` reads it. Unchanged: every page-specific limit, the Home script ceiling of 15,600 B gzip, the 68,000 B image limit, the 390 px limits (192,000 B and 11 requests), `engineering/budgets.json` (v0.9) and the v0.8 baseline. `check:budgets-firelight` is not one of the 45 checks, and none of the 45 was changed.

## Update: sharper desktop hero for Visit Us (owner decision, 2026-10-17)

The opening photograph was visibly soft on wide and 2x screens because its only desktop file was 1280 px wide, resized from the 5056 px master to fit the 68,000 B image limit. Approved and done, with no new generation: two larger sizes of the same master, chosen by `srcset` (`<source>` inside `<picture>`): `media/visit-room-a-1920.webp` (140,076 B, q54) and `media/visit-room-a-2560.webp` (196,944 B, q50). The 1280 px file stays for 1x screens up to about 1300 px and as the fallback. Phones (up to 759 px) keep their own 720 px crop and never request the larger files (verified at 390, 430 and 759 px). Wide windows at 1x choose 1920 px; 2x screens at 1440 px and wider choose 2560 px. Layout is unchanged (same box, same aspect ratio, explicit width and height, no layout shift).

Budgets: a narrowly scoped image exception for those two files only (142,000 B and 200,000 B), under `site.imageExceptions` in `engineering/budgets-firelight.json`; the 68,000 B limit still applies to every other image. The delivered-site total limit moves from 2,537,781 B to 2,777,089 B (measured 2,644,847 B plus 5 percent), because the two files add 337 KB. Every page limit (Visit full-page and 390 px limits included), the Home script ceiling of 15,600 B gzip, `budgets.json` (v0.9) and the 45 checks are unchanged.

## Update: ember-lacquer card system (owner decision, 2026-10-17, Premium Card Redirection)

The square green panels were replaced by one shared card, `.lq` in `styles.css`: smoked jade-black lacquer, a fine jade inlay edge with one highlight where the top edge catches the light, depth inside the surface, and one corner pair eased more than the other. Heat lives in the edge: a thread of ember travels the perimeter in a slow, uneven lap (31 to 47 s, offset per card), a wider glow follows a moment behind and lights the lacquer from within, and a corner flares now and then. It is CSS only (an inset shadow shown through a moving conic mask on two pseudo-elements, one animated angle), with no image, no blur filter, no per-frame script and no third-party code. The technology reference registry was consulted first: every entry is a JavaScript runtime, none suits the script budgets, so nothing was installed or integrated.

Used where a block was heavy or generic: the five Menu categories, the Order Pickup and Allergies cards, the Visit Us information panel (smoked glass over the photograph) and the Story name section. Left as editorial or atmospheric on purpose: every photograph outside those cards, the Order ticket, the closing bands and Home.

Motion gate and Pause: the ember runs only when `<html>` has `lit`, which each page script adds after the existing reduced-motion, Save-Data and 2g test; otherwise the cards rest with the ember parked low on the left. Every Pause button now also sets `still`, which stops it. Menu and Order, whose only motion is the cards, carry their own Pause button (`data-lq`, hidden until the ember runs; new `order.js`, listed in `sts.engineering.json`). On Visit, Pause also settles the scroll choreography, because `check:media` counts it. Forced colours: flat Canvas card with a CanvasText border. Print: no card styling.

Budgets and checks: nothing weakened and no limit raised. Colour literals in `styles.css` stay at 29; the other pages' scripts are at most 2,981 B gzip (limit 3,000; Our story is the tightest); Home script 14,746 B (limit 15,600); delivered 2,651,803 B (limit 2,777,089). One side effect handled: removing the Visit panel's 2 px border moved the second photograph 2 px up, which made a phone request it early (12 requests, over 11), so the border is transparent again and the second photograph has 24 px more air above it on a phone. Real-device Safari, frame rate, scroll smoothness and battery for the ember are **[unverified]**.

## Update: contrast review (owner decision, 2026-10-17, Contrast Review and Final Closeout)

`npm run test:contrast-sections` had 60 findings at b389fc1. It is **40 now**; the test, its 99% gate and its thresholds are unchanged.

Genuine defects, fixed in CSS only (ember-lacquer cards untouched):
- Home, phones: the opening sentence and each chapter's copy sat over the bright wok. Each now has its own soft shade, the phone darkening gradient is deeper at the top and bottom, and the dish name has a shade too.
- Home, phone held sideways (844 x 390): the dark on the left reaches further and the chapter copy has a shade.
- Home, tablets: the teaser paragraph no longer runs under the large glyph.
- Visit us: photograph captions sit on a dark pill so they read over any part of the picture.

Left as they are, by cause:
- Decorative, `aria-hidden` glyphs on Home (teaser) and Our story (the name characters): 35 rows. They are drawn, not read; the characters carry no information.
- Home chapter text at opacity 0 in the resting state the test screenshots (the beats are stacked there and only one shows at a time): 5 rows. A separate probe that scrolls through the sequence and measures only text that is visible (calm and live, 7 viewports) finds all body copy at or above 4.5:1.
- Large display words ("Fire", "Steam", "Texture") over flame and steam at 844 x 390 live, 97.7 to 98.1% of pixels at 3:1 while they fade in: the test measures the whole line box, not the glyphs. Not changed; no design compromise made to chase the number.

## Update: framework reconciliation, first part (owner authorization, 2026-10-17, Contrast Acceptance and Framework Reconciliation)

Authorized: a narrowly scoped reconciliation of the eight baseline-bound checks. Not authorized and not done: freezing Firelight, merging, or changing the frozen v0.8 record (`engineering/baseline.json`, `baselines/jade-and-ember-v0.8`, branch `baseline/jade-and-ember-v0.8`).

**What changed (all project-owned).**
- A **provisional reference** pinned to the Firelight commit `e264589` (`baselines/jade-and-ember-firelight-provisional-1/`, `engineering/baseline-firelight-provisional.json`, branch `reference/jade-and-ember-firelight-provisional-1`). `sts.engineering.json` now points the baseline-bound checks at it. It is a ratchet, not a freeze: no owner sign-off, tag, merge or deployment. Deleting the branch and reverting this commit undoes it.
- `immutability-allowlist.json` is empty again: the reference already contains the one entry (IMM-1) it used to explain.
- `budgets.json` carries the owner-approved Firelight values (delivered 2,777,089 B, Home page limits, three image exceptions) and the Firelight measurements for the 5% drift guard. The Home limits and image exceptions are read by the check only once the framework snapshot has per-page support (see below).
- Self-test expectations that named the old design were updated, with the same protections: the Pause label mutant now edits `breath.js`, the blocking-time mutant replaces the 41-byte inline script instead of adding a second one, and the blocked-video scenario no longer waits for a class Firelight does not add.

**Result.** Run on this tree: 38 of 45 pass (delivery, selftest and, with the exact repository identity, ci now pass). Seven fail:
- security and portability: Chromium's software-GL "GPU stall due to ReadPixels" console notice (environmental; not waived). Security also shows the same server-port difference in computed image URLs as regression (3 style comparisons), which framework edit 3 removes.
- regression: source, text, structure, pixels and behaviour show 0 differences. The styles layer shows 7 differences, all on Home, all the test server's port number inside computed `background-image` URLs (baseline and candidate are served on different ports); a scratch copy with the framework edit that removes the origin shows 0. It also fails here because this sandbox runs Node 22 and the harness needs Node 24.8 or later. (An earlier note in this section and in the status report said all six layers were clean; that was true only of the scratch copy with the framework edit.)
- assets and budgets: need the framework edits (hashed copy with several stylesheets, per-page budget limits, hash-name-neutral style comparison). Without the first, the hashed copy of the site loses the five per-page stylesheets, so the whole browser comparison fails. Tested in a scratch copy: both pass.
- selftest-gate2: three generic test cases assume the old hero markup and message names.
- selftest-je-markup: the stale Firelight expectations are corrected (see the second part below); one case remains, blocked on the same server-port difference in the styles layer.

**Not done.** The framework edits need the controlled snapshot re-export and the owner's approval; the framework repository and `engineering/` were not touched. Patches and gate logs: `/mnt/project-files/jade-and-ember/firelight-2026-10-16/closeout/reconciliation-wip/`.

## Update: project self-test corrections (owner approval, 2026-10-17, Continue Self-Test Reconciliation)

Corrected in project-owned self-tests only, each keeping its assertion:
- `je-selftest.mjs`, "an unexpected delivered file": the expected message now names whichever baseline is current ("not in the ... preview package") instead of the literal "v0.8".
- `je-selftest.mjs`, "a 2 px change to the brand seal width": Firelight's seal is `inline-grid` and 34 px wide, so the mutation now changes that rule from 34 to 36 px. It must still be caught by the source, styles and pixels layers.
- `je-selftest-gate2.mjs`, "the main thread blocked at load": Home's blocking-time guard is the owner-approved 9 s for the live WebGL sequence, so a 700 ms stall can no longer be seen there. The stall now goes into `menu.js` and is measured on Menu, whose limit is the original 200 ms. The case still fails if the check stops reporting blocking time.
- Not stale, left as is: "the Pause control label changed" must leave the styles layer clean. It fails today only because of the server-port artifact above, so it waits for framework edit 3.
- The three generic `check:selftest-gate2` cases ("hero text left on the photograph", "the menu button draws nothing", "the main thread blocked at load") are hard-coded in the framework snapshot and cannot be corrected project-side without removing or relaxing a check, which `check:project` forbids. The project-owned equivalents in `je-selftest-gate2.mjs` cover all three and pass. They need the framework's not-applicable mechanism.

## Update: framework compatibility corrections (owner approval, 2026-10-18, Framework Compatibility Approval)

The owner approved three scoped corrections to the shared testing framework. They were made on an isolated branch of the framework repository, `firelight/framework-compat-1` (commit `579a0dc`, based on the previously approved `23fafcd`; its main branch is untouched), and brought into this branch as a re-exported, hash-verified snapshot (snapshot tree `d4fd0b90138efc7c760b9cff062e215bad627e88`, 249 files; the previous approved tree was `a7ac4a6f4cb6`). Five framework files changed (`lib/hashed.mjs`, `lib/regression.mjs`, `checks/assets.mjs`, `checks/budgets.mjs`, `checks/selftest-generic.mjs`). **This snapshot tree has not yet been approved by the owner**; this branch is isolated and the framework's main branch does not carry it. Approval record: APR-JE-053.

1. **Hashed copy of several stylesheets.** The hashed copy now rewrites and renames every stylesheet the project delivers, not only the main one; a stylesheet linked by a delivered page that is not a delivered shared file is reported. A one-stylesheet project gets a byte-identical hashed copy (checked against the unedited framework on the generic fixture). `check:assets` passes (63 browser comparisons).
2. **Approved budget exceptions.** `budgets.json` may carry `exceptions.pages` and `exceptions.images`; each entry needs an approval id found in the approvals log, a reason, and a positive whole-number limit for a limit name that may have an exception, and must name a delivered page or image. If any entry is invalid, none applies and the check fails. Firelight's values are exactly the ones already approved (Home under APR-JE-052, three image limits under APR-JE-053); none was raised. The four other pages and every other image keep the shared limits. `check:budgets` passes (Home script 14,746 B of 15,600 B; delivered 2,653,566 B of 2,777,089 B).
3. **Style comparison.** The test server's own origin is removed from computed `url()` values before baseline and candidate styles are compared. Paths, file names, other origins and every other property still differ. The content hash of a hashed copy's file names is ignored only when `check:assets` asks for it. The seven Home style differences are gone and `check:regression` passes under Node 24.21.0.

**Evidence the protections still bite** (all in the closeout folder, `framework-compat-1/`): 11 new generic-fixture cases (84 in total), each shown to fail against the unedited framework; the framework's own full run on the generic fixture passes 38 of 38 (2 not applicable by design, the fixture has no baseline); 16 deliberate budget faults on Firelight's real tree (a larger Menu, Our Story or Home script, a larger Menu page, an oversized image without an exception, an excepted image grown past its own limit, an unauthorised approval, a malformed or misspelled exceptions block, a grown delivered total) all fail the check, and the unfaulted tree passes; on Home, 5 deliberate style faults (another image file, another origin, a removed image, a colour change, a swapped plate) all fail the styles layer, a hashed copy is still strictly compared unless `check:assets` asks, and the same site on another port is clean.

**Complete 45-check gate under Node 24.21.0 on the committed tree `d17aa6d`:** 41 pass, 4 fail (`gate-run-node24-committed-d17aa6d.txt`). An earlier full run on the same content (the working tree before the commit) had 42 pass, 3 fail. The three that fail in both are the remaining known items: `check:security` and `check:portability` (the Chromium software-GL notice, one exact message; see `SOFTWARE-GL-NOTICE-INVESTIGATION.md`, a proposal that is not implemented) and `check:selftest-gate2` (the three generic cases; see `GENERIC-SELFTEST-APPLICABILITY-DESIGN.md`, a design awaiting approval). The fourth, `check:media`, failed once on the committed-tree run (Our Story, desktop: Pause "leaves 5 animations running" 500 ms after the click) and passed on the first full run and on 3 of 3 isolated runs of the same commit. Under artificial CPU load it fails on varying pages in about half of the runs; in a diagnostic run the click had registered (aria-pressed true, the `still` state set) and the five "running" animations were CSS transitions that had all finished by 3 s. I read this as an intermittent timing sensitivity in the check's fixed 500 ms wait on a loaded machine, not a Pause defect; it is **not** waived, and the delivered files are byte-identical to the commits that passed it before.

Previously failing, now passing: `check:regression` (also confirms Node 24.21.0), `check:assets`, `check:budgets`, `check:selftest-je-markup`. The five delivered pages, stylesheets, scripts, images and fonts are byte-identical to `c5636d7` and `e264589`.

## Update: final engineering corrections (owner decisions, 2026-10-18, Final Engineering Corrections)

**Current result: 45 of 45 checks pass on Node 24.21.0 on the committed tree `42bb148`, 0 fail** (`gate-run-node24-committed-42bb148.txt`). One generic self-test case inside `check:selftest-gate2` is counted separately as **justified not applicable** (below); nothing was suppressed, waived or removed, and the 35 of 45 figure above is history. Still true: the baseline is not frozen, Firelight is not merged, and Safari, real-device frame rate, scroll smoothness and ember battery are unverified.

- **Decision 1, snapshot accepted.** Framework snapshot tree `d4fd0b90138efc7c760b9cff062e215bad627e88` (framework commit `579a0dc`, carried by `d17aa6d`) is recorded as accepted in APR-JE-053. Isolated only: no shared framework release or merge; all approved budgets and the frozen v0.8 baseline are preserved.
- **Decision 4, Pause settling** (`checks/media.mjs`). The fixed 500 ms wait is replaced by a bounded poll (100 ms steps, 5 s limit) that waits until no animation is running and the video has stopped, then checks `aria-pressed`. Persistent motion still fails with the animation names and the time waited. Repeats on Firelight: 10 of 10 pass in normal conditions, 10 of 10 pass with 8 busy loops on 4 cores (the earlier test used 6 and failed 2 of 4). No intermittency remains in these 20 runs; 20 runs is not proof.
- **Decision 2, software-GL notice** (`lib/engine-noise.mjs`, `checks/security.mjs`, `checks/portability.mjs`; id E-SWGL-01). Classified only when all hold: Chromium, console type `warning`, the exact anchored text of the one `GPU stall due to ReadPixels` message, the same run proves software rendering by reading the WebGL renderer string (SwiftShader, llvmpipe or softpipe), the message comes from the browser (column 0 on a page document), and no more than four per context. Counted and printed with the renderer in both checks. Page `console.warn` of the same text, other GL driver messages, WebGL errors, other warnings and errors, other engines and a hardware renderer all still fail (5 groups of negative tests). Deviation from the proposal: no project declaration, the evidence is measured instead.
- **Decision 3, applicability** (`checks/selftest-gate2.mjs`, record `engineering/selftest-applicability.json`, APR-JE-054). Cases 2 and 3 are fixed in the generic case itself (accept `text-background`; stall a local script on a page held to the shared blocking limit), no N/A. Case 1 ("forced-colors: hero text left on the photograph") is declared not applicable only because `.hero-text`, `.hero h1` and `.hero .eyebrow` do not exist on the Firelight pages (measured in the run), with a reason, an approval id in the log, and the project-owned case of the same name (`je-selftest-gate2.mjs`, which forces `.beat-0 h1, .eyebrow, .lede` onto the photograph) running and catching its defect in the same run. The generic fixture may not use an entry and still runs all its cases. Results are reported as applicable passes and justified N/A separately.
- **Evidence.** Framework generic fixture on Node 24: 38 of 38, 2 N/A by design (`framework-generic-fixture-verify-f99f6fb.txt`); `check:selftest-generic` 100 cases (16 new, each failing against the previous code); budget faults on the real tree 17 of 17 behave (`budget-faults-42bb148.txt`); delivered pages, styles, scripts, media and fonts byte-identical to `c5636d7` and `e264589` (43 files, same fingerprint).
- **Limits.** An inline script at column 0 of a page document could imitate the notice text (it is still capped at four and needs software-GL evidence). Budget exceptions are authorised by an approval id existing in the log, not by its content; `check:budgets-firelight` holds the exact values. The snapshot tree `87ce199c188e533653d1665f35b10b721f0a32f3` (framework `f99f6fb`) was verified independently and **accepted by the owner on 2026-10-18** for this consumer only (APR-JE-055); the shared framework is not released or merged.

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
2. **Framework follow-ups** (need the owner's snapshot process): the hashed-copy, per-page budget and style-comparison corrections are done on the isolated framework branch (see the update above) and wait for approval of the resulting snapshot tree. Still proposals only: recognise Chromium's software-GL notice as engine noise like the existing Firefox preload notice (`SOFTWARE-GL-NOTICE-INVESTIGATION.md`), and a project-aware applicability mechanism for the generic self-test cases (`GENERIC-SELFTEST-APPLICABILITY-DESIGN.md`).
3. **`check:ci`** should pass in the real repository (capital S) and is worth one look there.

## Not verified

Everything above ran in headless Chromium with software WebGL. Frame rate, battery, thermal behaviour, mobile data loading and Safari are **[unverified on a real device]**; the device protocol in `docs/JADE_AND_EMBER_DEVICE_TEST_PROTOCOL.md` is the way to close that.
