# G6-8 Stage C report: validation (V1 to V4), the seven remaining risks, and what is left

Authorised by `APR-JE-051` (2026-10-13). Stage B was closed for engineering purposes at Jade & Ember commit `e17560d` (snapshot tree `a7ac4a6f4cb6050bcd7fc6b81d62cc3565a5c482`). This report is the Stage C hand-over. **G6-8 is not declared complete here; that is the owner's decision.** Nothing was merged, tagged, released, deployed or published; no infrastructure, credential or account was created; MONOLITH was not started; no check was weakened; no approved snapshot file was touched (the public tree is still `a7ac4a6f…`, re-proved from the framework's newest commit); the renderer, delivered site, lockfile, frozen release-control code and hard stop are unchanged. The V1, V3 and V4 documents that name private framework files live in the private framework repository; this report states their results.

## 1. Summary

| Level | Result |
|---|---|
| **V1** generic fixture, mandatory checks, three engines | **Met.** Fixture: 38 of 38 (2 not applicable) locally and in CI, Chromium; Firefox and WebKit 12 passed, 0 failed, 1 not applicable each; 73 mutation and negative cases (27 caught, 46 held). Every not-applicable check names its reason; one declared limit: runtime budgets are measured in Chromium only. |
| **V2** Jade & Ember as a consumer | **Met.** A fresh clone of `e17560d`, tools installed beside the snapshot as CI does, `npm run verify`: 45 of 45; 319 of 319; 41 of 41; candidate `69f9f18f…` and SBOM `a1dbdd12…` identical to the baseline. Every regression report (thresholds included) and all 33 baseline images are identical to a clean run at the pre-migration commit; the only difference is the three added checks. |
| **V3** the cinematic template, read-only | **Run; 10 of 38 pass, 2 not applicable, 26 fail closed.** The template's 36 files were proved unchanged; creative authority untouched. The failures sort into findings about the template, ordinary onboarding steps and seven findings about the core (section 3). Nothing passed by being skipped. |
| **V4** independent review | Bundle prepared; review performed (section 5). |
| **Seven Stage B risks** | Assessed with experiments (section 4): two are real and confirmed by test (silent not-applicable scenarios, the project-code blind spot of one scan), none is a blocker. |
| **V5** readiness checklist | Prepared, **not signed** (`G6-8-V5-READINESS-CHECKLIST.md`). 2 of 9 items ready; the rest need the owner. |

A defect in Stage B was found and fixed during Stage C: see section 6.

## 2. V1 and V2 in detail

**V1.** Framework head `a0265ca` (public set unchanged since `23fafcd`): the generic fixture *Quillfeather Letterpress*, an invented non-restaurant site. Local full tier 38 of 38. GitHub Actions run 21, all eight jobs read individually: the blocking Chromium job 38 of 38; Firefox and WebKit 12 passed, 0 failed, 1 not applicable of 13 browser-driven checks each (`check:regression`: the fixture declares no baseline); the macOS fast tier, Lighthouse, external links, supply chain and the caller-layout simulation (a client calling by SHA, and the public consumer with the verified snapshot, including the release dry run in that layout) succeeded. The skip audit: in Firefox and WebKit the not-applicable checks are the engine-independent ones (run in the Chromium job), the self-tests of the checks (they damage copies and prove the checks, not the engine) and `check:budgets`, whose runtime part uses Chromium-only performance APIs. The release dry run on the fixture is 319 of 319 with 3 scenarios named as not applicable to it.

**V2.** The reference consumer from a fresh clone at exactly the accepted commit, `npm ci --ignore-scripts --engine-strict` in `engineering/` (no `node_modules` in the project, as in CI), `STS_REQUIRE_AUDIT=1 npm run verify`: **45 of 45**, verification record clean (`dirty: false`), working tree still clean afterwards. `g6-8-evidence/stage-c/compare-reports.mjs` flattens each JSON report, ignores only volatile fields (times, seals, digests of the verifying code, absolute paths) and compares what is left, and compares every image byte for byte: nine regression reports and 33 images **identical** to the clean baseline run at `2bb1737`, including the comparison tolerances (pixel threshold 0.1, maximum difference ratio 0.0005); in `verify.json` the 42 baseline check ids pass exactly as before and the three added ones are the only difference. The migrated run also writes files the old engine did not (cross-browser and pixel reports); they are listed, not judged.

## 3. V3 in detail (summary; the evidence is in the private framework repository)

The template is a single page with chapters and two themes. It was read with `git archive`, never checked out; the engineering was a copy of the framework head; the scaffold (a manifest, a build wrapper, a workflow, and the generic fixture's overlays) was added **next to** the template's files, and a script proves all 36 template files byte-identical afterwards. The creative authority record is the fixture's, unchanged.

Of the 26 failures: **template findings** (it does not meet rules the engineering enforces: dependency pinning and a retired dependency, no `verify` script, inline styles and scripts against the security policy, page weight against the budgets, reflow, accessibility-tree and forced-colour rules, determinism); **onboarding steps** every new project has to do (tokens, asset manifest, generated procedures, a media provenance file, project-owned build recipes); and **seven findings about the core**, all of which fail closed:

| # | Core finding | Kind |
|---|---|---|
| C1 | The delivered-media digest crashes (`EISDIR`) on a nested asset folder | robustness; blocks a release of such a site |
| C2 | `check:media` crashes when `media/PROVENANCE.md` is absent instead of reporting it | robustness |
| C3 | Four browser checks refuse when `markup.selectors.navToggle` is null: a page without a navigation toggle cannot be expressed | contract |
| C4 | The per-project self-tests damage the project's own pages and cannot run on another structure | by design; per-project suites |
| C5 | The model has pages only: a second theme of one page is judged as a page that must link to the others | contract |
| C6 | The candidate digest requires a `serve.py` at the project root | adoption requirement |
| C7 | Visually hidden text may be over-reported by two rules (overlap, forced colours) | to triage |

Verdict: the core runs end to end on a non-restaurant single-page structure with a manifest and project-owned overlays and **no change to the core**, which supports the claim that the policy is profile-driven; C1 to C3 are the ones that would block a real adoption of such a page. None of this is a defect of the delivered Jade & Ember and none is a safety hole.

## 4. The seven remaining Stage B risks

Each was tested, not argued. Raw output: `g6-8-evidence/stage-c/risk-experiments-raw.txt`. The experiments ran in a throw-away clone of `e17560d`; every change was reverted.

| # | Risk (Stage B report, section 8) | Experiment and result | Assessment |
|---|---|---|---|
| 1 | **A not-applicable dry-run scenario still passes** | Baseline: `319/319`, exit 0, no scenario not applicable. Removing the head-tag recipe from the manifest: **`319/319 scenarios as expected (4 not applicable to Jade & Ember, which lacks what they exercise)`, exit 0, `PASS`**. Removing the fonts folder from the asset list: `79/255`, exit 1 (loud). | **Confirmed, narrow.** Only capability-gated scenarios degrade quietly (the count is printed, nothing fails). Today Jade & Ember has 0 of 319 not applicable (the parenthetical is absent in every run read). **Not a blocker; optional improvement before a second project's release**: assert the count (a project check, or a manifest-declared expected count in the dry run, which touches an approved snapshot file and needs renewed approval). |
| 2 | **Suite case counts are not asserted** | A suite replaced by one that returns one note and no problem passes (`{"problems":[],"notes":["0 harness tests run in 0 s"]}`); an empty report is now refused (Stage B hardening). | **Confirmed.** Counts are recorded in `parity.md` and printed in every log. **Optional**: pin the counts in the suite runner. |
| 3 | **The dry run's network and deployment scan reads the engine, not the project's code** | A `fetch(...)` line appended to a project check: dry run **passes**. The same line in engine code: the dry run **fails** (`318/319`, "deployment safety"). | **Confirmed.** The retained project code (108 modules) has no network or deploy call: a grep for `fetch(`, the network modules, deploy commands and sockets finds one hit, a Playwright `route.fetch()` in a local diagnostic tool (`tools/gate5-diagnose.mjs`) that re-issues a page request to the local test server. **Optional**: scan the project's own engineering folder too (project check, or a framework change needing renewed approval). |
| 4 | **The legacy release-control harness** | 19 single-guard removals in the frozen code: the harness **catches 8 and 11 survive**. The same 11 were run against the **original self-test in the original layout at `2bb1737`: all 11 survive there too.** | **Harness is no weaker than the original on this sample and is not vacuous** (it fails when guards that the original also protects are removed). The proof of concept's own test coverage has gaps (about 58% of the sampled guards survive single removal, partly because many guards are enforced twice by design, as the G6-3A mutation table notes for the tooling pin). Limits that stay: it validates the original behaviour in its original layout, not the split layout; `npm run rc` and `rc:demo` are unexercised there. **Not a blocker** (the proof of concept enables no release path); optional if it is ever to be used: a layout-aware revision and more tests. |
| 5 | **The snapshot proves integrity, not authenticity** | Adversarial cases (29 caught) include a file changed together with its record: it passes the consumer's own check and is **refused against the framework repository**. | **Confirmed by design.** The strong check needs the private repository and was run by hand at every stage. **Optional, no new credential needed**: a framework workflow job that checks out the public repository (public, no token) and runs `snapshot.mjs verify --against`; it needs the owner's approval because it changes a framework workflow. |
| 6 | **The 319 scenarios rehearse the direct, not the snapshot-caller, variant of the CI policy** | The real snapshot-caller workflow with `continue-on-error: true` added to the blocking job: `check:ci` **fails** ("the blocking job \"verify\" must not say continue-on-error"). The adversarial and caller-simulation cases cover the other refusals. | **Confirmed and covered elsewhere.** A real release is judged on the real workflow by the same shared function. **Optional**: dry-run scenarios for the snapshot-caller variant (framework change, renewed approval). |
| 7 | **The framework branch carries intermediate candidate commits** | Reviewed: the commits are cited by hash in reports; history rewriting is outside this scope and the branch is unmerged. | **Accepted as is.** Decide the squash policy when a merge or a Framework Release is authorised. |

## 5. V4: independent review

The bundle (how to reproduce every Stage B and Stage C claim, and what to challenge) is in the private framework repository, with the V1 and V3 documents. REVIEW_PLACEHOLDER

## 6. A defect found in Stage B and fixed now

`wp-scope` (the work-package scope verifier, `npm run gate6:scope -- G6-8`) reported one violation: Stage B had added a documentation note to `jade-and-ember/engineering/G6-3A-POC-REPORT.md`, the record of an earlier package, which G6-8's recorded scope denies. Neither CI nor the Stage B review caught it, because the scope and closure verifiers are not part of `npm run verify`. The file was restored to its baseline content; the same statement was already in allowed files (`engineering/README.md`, `G6-8-REPORT.md`, `APR-JE-050`, the harness header). `gate6:scope` now passes for G6-1 to G6-8 and `gate5:closure` reports "SUPPORTS closure". **Optional improvement:** run both verifiers in CI.

## 7. Remaining blockers and optional improvements

**Actual remaining blockers.** Two kinds, and neither is engineering work this package can do.

* *Before MONOLITH House & Design may start* (V5): the owner signs the readiness checklist, which needs the owner's inputs (industry, tier, hosting, media-rights plan, people-evidence plan) and one decision: a Framework Release does not exist (RB-14), and creating one means a merge and a tag, which this work package was told not to do; or the owner records that development may pin an exact development commit.
* *Before any client-production release* (unchanged, all active): RB-01 to RB-08 (people and client: release approval, rights verification, search review, crawler documentation, real-device, screen-reader and desktop-browser passes, a stable version and real domain and content), RB-14 (a Framework Release), RB-15 (authenticated release authorisation and verifiable build provenance, the unimplemented authenticity verifier, which is the hard stop) and RB-16 (owner approval cannot be enforced inside a client repository while coding agents act under the owner's identity). RB-09 to RB-13 are implemented in engineering and are not authorisations.

**Optional improvements** (none needed to close G6-8; each needs the owner's approval because it touches an approved snapshot file, adds a check or changes a workflow): assert the dry run's not-applicable count (risk 1); pin suite case counts (2); scan project code for network and deploy calls (3); a private-side verification job on the public repository (5); snapshot-caller dry-run scenarios (6); run `gate6:scope` and `gate5:closure` in CI (section 6); an adoption guide for a new project's manifest and recipes, and fixes for the V3 core findings C1 to C3, C6 (from V3).

## 8. What this report does not do

It does not declare G6-8 complete, sign the V5 checklist, authorise another work package, or resolve any optional improvement. It stops here for the owner.
