# G6-6: extraction into the framework repository, report

Work package G6-6, authorised by `APR-JE-047`. **Implemented and verified; awaiting owner review.** Nothing was merged, tagged, deployed, previewed or published; no pull request was created; no account, key, signing step or client approval was introduced. G6-7 and G6-8 have not been started. G6-5 was not reopened.

**Framework repository** `getsimplifiedtech/sts-web-design-framework`, branch `feature/sts-engineering-framework`, created from `main` at `f05f41f` (verified before the branch was cut), head **`3286f8b`**. The diff against `f05f41f` is **266 added files and nothing else** (no modification, deletion or rename): `architecture/16-engineering-framework-v1.md`, `engineering/**`, `.github/workflows/engineering-fixture.yml`. The 15 frozen specifications, the README, the reviews, the skills, the templates, the existing workflows and every other branch are untouched. The reviewer evidence bundle is `engineering/docs/REVIEW-BUNDLE.md` in that branch.

**This repository** (`feature/jade-and-ember-v0.9`): only governance records changed during G6-6, as the work package allows: the approvals ledger and the Gate 6 documents at the start (`cf9490f`), and this report with its evidence and the matrix status at the end. The delivered website, the renderer, the engineering code, the schemas, the policies, every record, the release-authentication hard stop (`lib/authenticity.mjs`), the reviewer table, the frozen release-control proof of concept and every `.github` file are byte-identical to `dfb7fc4`.

## 1. What exists in the framework branch

| Part | Does |
|---|---|
| `architecture/16-engineering-framework-v1.md` | Specification 16, "Engineering Framework v1": authorities, one base engineering, the project manifest, standards and records, the check registry, adapters, search artefacts, release controls, consumption and self-verification, traceability, and the known limits. Written first and reviewed independently in three rounds before any code was extracted. |
| `engineering/` (code) | The reusable engineering: 198 files extracted from this project at `dfb7fc4` with the SHA-256 of every source file (`EXTRACTION-MANIFEST.json`), the first copy byte-identical (commit `c2ceca6`), and every later change entered in a change ledger with its reason (90 entries: 81 changed, 9 removed). `tools/verify-extraction.mjs` and the new `check:extraction` fail on any difference without an entry. `lib/authenticity.mjs` (the production hard stop) is **protected**: byte-identical to its source, its hash pinned a second time in the check's code. |
| `engineering/standards/` | The framework's standards (a11y, privacy, security, HTML, dependencies, environment, Lighthouse, release policy, the retired-skill rule) with the project values removed and an **overlay rule** (`lib/policy.mjs`): a project's file of the same name is accepted only inside the limits the standard declares; anything undeclared is frozen. Project records (`lib/project-records.mjs`) have no framework default and never fall back to another project. |
| `engineering/fixtures/generic` | "Quillfeather Letterpress", an invented three-page letterpress studio with its own manifest, builder, records and approvals log (no restaurant, no baseline, no hero, no video; it names nothing of this project). `npm run verify` runs the whole pipeline on it. |
| `engineering/adapters/hosting`, `hosting/` | Cloudflare Pages, Vercel and a static server, preserved byte for byte, with their provider facts and golden files. |
| `.github/workflows/engineering-fixture.yml` | The framework's workflow: `verify` (Ubuntu 24.04, Node 24, Chromium, blocking), macOS fast checks, Firefox, WebKit, external links, Lighthouse, supply-chain report (informational). It deploys, merges and publishes nothing. |
| `engineering/tools/reference-consumer.sh`, `docs/REVIEW-BUNDLE.md` | The procedure that runs this project against the framework, and the commands by which a reviewer reproduces each claim. |

## 2. Your ten conditions

1. **Branch from the verified base; new files only; the 15 specifications untouched; no merge, tag, deploy, publish.** `git diff --name-status f05f41f..HEAD` shows 266 `A` lines and no other letter. The base was checked to be `f05f41f` before the branch was created. `main` has since moved (see section 6).
2. **Specification 16 implemented and reviewed independently before continuing.** Three review rounds before extraction (their disposition is in the branch history, commits `b42a124`, `8fd8576`, `6fdcee4`).
3. **Extraction with source hashes and proven initial parity.** 198 files; every recorded source hash equals the git object at `dfb7fc4` (an independent reviewer recomputed them, including `lib/authenticity.mjs`, `0b57bc98…`); the first commit is a byte-identical copy; `verify-extraction` passes with `--source` pointing at this repository.
4. **Standards separated from project records.** Section 1; the generic-fixture suite holds the overlay refusals, the records-without-fallback cases and the findings rules (52 cases).
5. **The generic fixture runs the full verification pipeline independently.** Local `npm run verify` on the fixture: **passed, 38 of 38 checks, two reported not applicable** (`check:baseline`, `check:regression`: the fixture declares no baseline), and the run states that no release record can come of it. GitHub Actions: section 3.
6. **The same mandatory base engineering for Essential, Premium and Cinematic.** The manifest has no key that removes, skips or weakens a check; `offering` is read by no code path. The generic suite changes `offering` to each of the three and compares the registry, its digest and the manifest review. The independent review tried to find a manifest or overlay that weakens a base check and found none; it did find places where a project's own records could (section 5), now closed or recorded.
7. **Both hosting adapters preserved.** `adapters/hosting/**` and `hosting/**` are byte-identical to their source (37 files); `check:hosting` and `check:portability` pass on the fixture under Cloudflare Pages and Vercel, and a generic case stages the fixture with all three adapters and checks that each bundle carries the delivered folder unaltered.
8. **Release-authentication hard stop, provenance requirements and production blockers preserved.** `lib/authenticity.mjs` is byte-identical; the reviewer table of the fixture is empty (`[]`) and so is this project's; no reviewer, identity or evidence was invented; a client-production release of the fixture is blocked (19 unmet requirements, authenticity among them); the gate 6 and release dry-run cases pass; **319 of 319** dry-run scenarios pass on the fixture and on this project as a consumer. Build provenance is still not implemented.
9. **This project's delivered website, renderer, approved visuals and production behaviour unchanged.** The delivered tree hash is `9061a227…` (23 files) before and after; the candidate digest `69f9f18f…` is the same; the diff of this repository from `dfb7fc4` touches only the governance records listed above.
10. **Anthropic Frontend Design stays the sole creative authority; the retired STS skill is not reactivated; the already-approved skill branch is recorded.** The creative authority's name, skill and licence are now fixed by the base standard and a project record that names another is refused; the retired-skill markers are the standard's alone. The approved branch `feature/anthropic-frontend-design-standard` (`d2803c02408c27d4489ccddee0a11478621e26dd`) is **not merged and not modified**; it is recorded for later reconciliation in specification 12 and in this project's authority record (unchanged). Where the framework checkout is provided, `check:authority` verifies the skill and licence hashes against it.

## 3. Verification

* **Framework, local, on the fixture:** `npm run verify` passed (38 of 38, two not applicable); `check:selftest-generic` 52 cases; `check:project` (manifest, 16 refusals, purity review: 108 reusable files and the JSON standards scanned, 29 remaining values in 9 entries, all test material of the framework's own checks); `check:extraction` (198 files, 108 identical, 81 changed with a ledger entry, 9 removed).
* **GitHub Actions on the final head `3286f8b`** (run `38343904952`), read at the level of each job and its log:

| Job | Result |
|---|---|
| `verify` (Ubuntu 24.04, Node 24, Chromium; blocking) | success: `verify passed (38 of 38 checks; 2 of them not applicable to this project, so no release record can come of this run)`; candidate digest `e9dd4db3…` and composite SBOM digest `2f804f17…`, both equal to the local run |
| `cross-browser: Firefox` (informational) | success: `firefox: 12 passed, 0 failed, 1 not applicable, of 13 browser-driven checks run` |
| `cross-browser: WebKit` (informational) | success: `webkit: 12 passed, 0 failed, 1 not applicable, of 13 browser-driven checks run` |
| `fast checks on macos-latest` (informational) | success: `verify passed (22 of 22 checks; 1 of them not applicable ...)` |
| `external links` (informational) | success (the destinations of the fixture's record verified; record printed in the log) |
| `lighthouse` (informational) | success: `PASS lighthouse (0 error(s), 0 warning(s))`, three runs per page, medians 1 / 1 / 1 / 0.6 or better against the floors 0.8 / 0.95 / 0.9 / 0.6 |
| `supply chain report` (informational) | success (signatures, advisories, SBOM and outdated report printed) |

  The same seven jobs were green on the earlier heads `93a10e0` (run `38332931923`) and `dd9fc63` (run `38341252477`). The two earlier red runs (`d9eb872`, `62a8036`) were the incomplete states the work passed through and are not hidden.
* **Reference consumer (specification 10.7):** this project at `dfb7fc4` running against the framework (`dd9fc63`): **full run 42 of 42 passed, fast run 24 of 24**; delivered tree hash, candidate digest, composite SBOM digest, 319 of 319 dry-run scenarios and every check's notes equal to the reports this project produced when it carried the engineering itself, apart from 100 (full) and 64 (fast) lines each pinned with its reason. Case level: 511 of 520 `caught:`/`held:` lines of the reference are reproduced; the 9 that are not are the G6-5 generic-fixture cases that were rewritten. [`g6-6-evidence/`](g6-6-evidence/README.md).
* **Hosting portability:** `check:hosting` and `check:portability` on the fixture under both providers' simulation profiles; the three adapters stage the fixture; all three adapters' golden files unchanged.
* **Three-offering invariance:** generic suite, cases "offerings".
* **Parity of the delivered site:** unchanged hashes above.

## 4. Independent review

A separate model session reviewed the framework branch (head `0e8dc44` at the time) with the repository and your conditions, without the author's conclusions. It confirmed additions only, byte parity of the extraction (198 hashes and the hard stop), the hosting adapters, the standards against their sources, the absence of any manifest key that disables a check, and this project's unchanged state. It found **no blocker and eight majors**; all are dispositioned:

| Finding | Disposition |
|---|---|
| M1 the extraction verifier ran nowhere | Fixed: `check:extraction` in the registry (so in `npm run verify` and the workflow); the hard-stop hash pinned a second time in its code |
| M2 ledger reasons are shared boilerplate | Not fixed, recorded: a reviewer must read the diff of a security-relevant file (specification 12) |
| M3 the sole creative authority was not enforced | Fixed: name, skill and licence fixed by the standard; required approvals and statements of authority must be non-empty |
| M4 a project could disable the retired-skill check by its own markers | Fixed: markers are the standard's alone; patterns escaped |
| M5 a project could turn any waivable failure into a note by labelling it Info | Partly fixed: flash and motion measurements of the media check can never be findings; the severity label remains the project's, recorded as a limit |
| M6 `secrets-allow.json` was an unrecorded waiver | Fixed: a reason of 30 characters or more is required, and every allowance is listed in the check's notes |
| M7 statements of the specification the code did not back | Fixed or corrected: design-value scan of the manifest (implemented), build script and source roots of any language (implemented), missing-record message (extended to the authority, reviewer, demonstration, media-inventory, candidate and contracts reads), the evidence bundle (written), offering invariance, floors and documentation text, static-adapter URL style, determinism of a hand-authored site (specification corrected to say it is not applicable) |
| M8 `main` has moved; merging would break `check:ci` | Recorded for the merge decision (section 6) |

The nine minors: the vacuous hosting case was replaced by a real staging run; `npm run` scripts now require `STS_PROJECT_DIR`; the verify summary states how many checks were not applicable; a garbled sentence of the release policy was fixed; the others are recorded as limits (undeclared video, the motion-free fixture, the narrow bypass scan, leftovers in industry-adapter data). Running this project as a consumer found five more defects, all fixed and each with a ledger entry: the contracts check and a self-test used the framework's generators instead of the project's, the determinism copy omitted the engineering, the dependency standard froze a project's account of a retired package, the release dry run edited a standard that a project's overlay masks, and the base self-test's authority copy omitted documents.

## 5. Assumptions and limits that remain (specification 12 lists them)

* **The framework's self-test suites name the fixture's markup in part.** On another project those cases report **not applicable** one by one (and fail on the fixture itself if the fixture drifts); the project supplies its own cases. This project's original suites, unchanged, pass against the core (section 3), but how a consumer registers its own cases is not decided: it needs your ruling and belongs to G6-7.
* **A baseline is required for release.** A project without one runs everything else and cannot be released (`N/A` is refused by the release record).
* **The frozen release-control proof of concept is not extracted and was not re-run** against the framework's sandbox (OI-9).
* **Purity**: the scan covers JavaScript and JSON standards, not prose; 29 values in 9 entries are listed, all test material; industry adapters (the restaurant adapter's schemas and component contracts) carry this project's names as adapter data.
* **Findings** carry the project's own severity label; the media flash and motion measurements cannot be excused.
* **Two reads of a project's non-engineering files** (`VERSION.json`, the page registry) still end in a file-system error rather than the clear message.
* The fixture has no video, hero or Pause control; the motion branches of a Cinematic site run on no framework fixture (they run on this project's site).
* Fixture records are fixture-only; the crawler review is a copy that ages out after 180 days.
* **OI-1 and OI-2 remain deferred**; nothing in the specification contradicts either answer. The duplicate ids OI-4 and OI-5 in the matrix are unchanged. RB-01 to RB-16 are unchanged.

## 6. Decisions and warnings for you

1. **`main` of the framework repository has moved** (to `a087e08` at the time of the review, 52 commits ahead of `f05f41f`, including `.github/workflows/import-openmontage.yml` and a vendored tree). The branch was cut from the approved base and does not include it. Merging would give the repository a second workflow, which `check:ci` refuses; whether the check or the new workflow yields is yours to decide when the merge is decided. Nothing was merged.
2. **How a consumer supplies its own self-test cases** (section 5), and whether a hand-authored site (no builder) should be releasable.
3. **Skill branch reconciliation** (`d2803c0`): unchanged, recorded.
4. The remaining production blockers and the decisions listed in the G6-5 report (the 404 page, the hero-video host, wiring the host bundle into the gate, who re-reads the provider pages, deployment method per client, the Cloudflare CORS header, the eleven G6-3A decisions) are unchanged.

## 7. Stopped for owner review

G6-7 (this project consuming the framework) and G6-8 have not been started. The framework branch is a development branch; nothing in the framework's `main` or in this repository's `main` or baseline branches changed.
