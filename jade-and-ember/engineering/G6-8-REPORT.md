# G6-8 report: Jade & Ember consumes the framework as a verified snapshot (Stage B)

Work package G6-8, authorised by `APR-JE-049`; replacement snapshot and release-control harness approved by `APR-JE-050` (2026-10-13). This report is the Stage B hand-over for the owner's Stage C review. **Nothing was merged into `main`, no Framework Release or tag was created, nothing was deployed or published, and MONOLITH was not started. Every production-release blocker (RB-01 to RB-16) is still active; the production-authentication hard stop is unchanged.**

## 1. Result in one paragraph

Jade & Ember no longer carries its own copy of the engineering. The engine is a verified snapshot of the framework at the repository root (`engineering/`, `.github/actions/engineering/`, integrity record `sts-framework-snapshot.json`): framework commit `23fafcd0365ef01aa2460cbb6a31beef8519f802`, git tree `a7ac4a6f4cb6050bcd7fc6b81d62cc3565a5c482`, 249 files, 2,297,963 bytes, exactly the replacement the owner approved. A full Node 24.21.0 verification passes 45 of 45 checks; the delivered website, the candidate artifact digest and the SBOM digest are identical to the pre-migration baseline; all 319 release dry-run scenarios and all 41 release-control proof-of-concept cases pass; the original Jade & Ember self-test suites keep their original case counts.

## 2. Exact commits

| Repository | Branch | Commit | What |
|---|---|---|---|
| Jade & Ember (public) | `feature/jade-and-ember-v0.9` | `2bb1737` | pre-migration baseline (G6-7 closure) |
| | | `0fe0819` | Stage B step 1 (additive): snapshot, record, third-party notices |
| | | `a312c0e` | step 2 (switch): scripts, manifest, snapshot-caller workflow, project checks |
| | | `18e5aff`, `a17be1e`, `78d93fc`, `bc9c247`, `494de4f` | review, CI and suite-adaptation fixes (work-in-progress commits) |
| | | `4a6b258` | **the owner-approved replacement snapshot** (two files and the record) |
| | | `689aac0` | `APR-JE-050`, decisions D-G68-4 and D-G68-5, references to the tree and commit, the proof-of-concept notes |
| | | `eec682f` | harness: tools installed beside the snapshot (found by CI) |
| | | final commit | review hardening, this report and the evidence (named in the owner message) |
| Framework (private) | `feature/sts-framework-consumption` | `17fc323` | the first approved snapshot (Stage A), superseded |
| | | `23fafcd` | **the approved replacement snapshot source** |
| | | `a0265ca` | inventory and licensing figures for the new tree; changes no public file (its export gives the same tree) |

The framework branch also carries intermediate candidate commits (`676b35a`, `837ff3a`, `fada0ba`, `1e5a2fa`, `fd24824`, `3d0cb9d`); two of them (`fada0ba`, `1e5a2fa`) are net-reverted by `fd24824`. The history is untidy, the content is not.

## 3. Why a replacement snapshot was needed

Verification of the first snapshot in the migrated layout found two defects in the framework's public files that cannot show up in the framework's own layout. They are the only two public files that changed (`APR-JE-050`):

1. `engineering/checks/determinism.mjs`: a project copy outside the repository (the self-tests copy projects into the operating system's temporary folder) was copied onto itself and stopped with "src and dest cannot be the same". One condition added.
2. `engineering/lib/release-dryrun.mjs`: the release dry run's throw-away sandbox models a client, but copied the repository's own workflow, the snapshot caller. The sandbox deliberately swaps in a synthetic authenticity verifier, so the snapshot-integrity check on the sandbox correctly failed; and the scenarios that edit the workflow's Node version and Action pins had nothing to edit. In a repository that carries a snapshot record, the sandbox now gets a synthetic direct workflow built from the framework's own pins, no record, no local action and no repository identity. The same change copies the engineering's `fixtures/` folder unless the project itself lives inside the engineering (a more complete copy; the previous filter dropped it for every layout).

**Trade-off, stated plainly:** the 319 scenarios no longer exercise the snapshot-caller variant of the CI policy inside the gate; they exercise the direct variant of the same shared function. The real snapshot caller is judged by `check:ci` (inside `npm run verify`), by the release gate's own `supportedRuntimes` requirement on the live workflow, by the dry run's deployment-safety scan, and by the framework's caller-layout simulation (which now also runs the dry run in the snapshot-consumer layout).

## 4. The release-control proof of concept (`APR-JE-050`, D-G68-5)

The proof of concept (`engineering/release-control/`) and its self-test (`checks/selftest-release-control.mjs`, 41 cases) are frozen and byte-identical to the baseline. They were written for the layout in which the whole engineering sits inside the project folder, and the framework's verifier now judges against the running engine rather than the tooling it is handed. The check `check:selftest-release-control` therefore runs the unchanged self-test as a program inside a throw-away copy laid out the old way (`checks/je-release-control-layout.mjs`): the snapshot laid over the project's engineering folder, the pre-migration workflow, and, in that copy only, the verifier's default `core` set to the tooling it is given. The wrapper checks that the self-test it runs is the frozen file (SHA-256), that the patched token occurs exactly once, and that the run printed a pass and its 41 cases.

**This validates the original behaviour under its original layout. It is not direct execution of the proof of concept in the new split layout.** `npm run rc` and `npm run rc:demo` are not exercised in the split layout and fail closed there. Nothing about production release is weakened by it.

## 5. Verification

### 5.1 Full verification, Node 24.21.0

| Run | Tree | Result |
|---|---|---|
| Baseline, clean | `2bb1737` | 42 of 42 |
| Scratch copy of the repository with the candidate snapshot, before the owner approved it | `494de4f` plus the candidate | 45 of 45 (the dry-run, determinism and proof-of-concept fixes were proved here first) |
| The real repository with the approved replacement snapshot | `689aac0` | **45 of 45** (`g6-8-evidence/migrated-689aac0-verify-summary.txt`) |
| The real repository, final commit | the commit named in section 2 | reported in the hand-over message (it cannot be named inside the commit it tests) |

Counts at the migrated tree: 319 of 319 release scenarios (none "not applicable"); 41 of 41 proof-of-concept cases; original suites: gate2 42, gate3 68, gate4 251, gate5 30, gate6 99, evidence 117 rejections + 20 acceptances; regression against the frozen v0.8 baseline: source 27, text 35, structure 35, styles 35, pixels 39, behaviour 13 comparisons, 0 problems.

### 5.2 Parity with the baseline (`g6-8-evidence/parity.md`)

Identical: candidate artifact digest `69f9f18f…`, delivered tree `9061a227…` (23 files, 1,977,874 bytes), composite SBOM digest `a1dbdd12…` (151 components), the 319 and 41 counts, the regression comparisons, and all 42 baseline check ids (same tier, scope and needs). Differences, all expected and listed in `parity.md`: three added checks (`check:extraction`, `check:selftest-je-markup`, `check:selftest-release-control`); the framework's generic `check:selftest*` ids now run the framework's generic suites while the original content runs under `check:selftest-je-markup` with its original counts; the engine and registry digests (the verifying code changed; the candidate did not).

### 5.3 Snapshot integrity

* Consumer side: `snapshot.mjs verify --repo .` passes (249 files, 2,297,963 bytes, tree `a7ac4a6f4cb6…`, no file added, missing, altered or made executable); `check:extraction` runs it inside every full and fast verification.
* Private side: `snapshot.mjs verify --repo . --against <framework checkout>` passes: the record equals framework commit `23fafcd` file by file, down to the git object ids.
* The exporter ran with `--expect-tree a7ac4a6f4cb6050bcd7fc6b81d62cc3565a5c482`; the diff against the first snapshot is exactly `checks/determinism.mjs`, `lib/release-dryrun.mjs` and the record. The framework head `a0265ca` exports the same tree.
* `lib/authenticity.mjs` is byte-identical in the project and in the snapshot (SHA-256 `0b57bc98…7eef`); the reviewer table stays empty.

### 5.4 Adversarial snapshot tests

`g6-8-evidence/adversarial-snapshot.mjs --framework <private checkout>`: **29 caught, 0 failed** (`g6-8-evidence/adversarial-snapshot-output.txt`).

## 6. Independent review

An independent reviewer (a separate agent given the code and the constraints, not my conclusions) found **no blocker**. It confirmed, by command, that the renderer, the delivered files, the lockfile (all 129 packages), the frozen release-control folder, its self-test and `lib/authenticity.mjs` are unchanged against `2bb1737`; that the 42 baseline check ids keep their tier, scope and needs; that the seven original suites differ from their originals in paths and imports only (no case, expectation or threshold changed, case counts equal); that no threshold, allowlist or baseline file was relaxed; that the proof-of-concept wrapper cannot pass vacuously and confines its patch to the temporary copy; and that the framework change does not weaken what the 319 scenarios prove about the gate. It made one major and eight minor findings, dispositioned here:

| Finding | Disposition |
|---|---|
| M1 records said Stage B completed while the report was a stub | Fixed: this report and the evidence now exist; the wording of `APR-JE-050` and the matrix corrected. |
| m1 nothing pins "all 319 apply" (a not-applicable scenario counts as ok) | Not changed (the check lives in the approved snapshot file). Checked now: 0 not applicable. Residual risk 8.1. |
| m2 `check:selftest-je-markup` cannot detect an emptied suite | Fixed: a suite that reports nothing at all fails. Case counts are in `parity.md`; they are not asserted in code (8.2). |
| m3 the wrapper did not prove it runs the frozen bytes | Fixed: the SHA-256 of the self-test it runs is compared with the project's. |
| m4 the "no network / no deploy" scan of the dry run no longer covers project code | Not changed (snapshot file). The reviewer grepped the retained project code: nothing found. Residual risk 8.3. |
| m5 the fixtures-filter change in `release-dryrun.mjs` was undocumented | Documented in section 3. |
| m6 cases that read "the real workflow" now read the frozen copy | Documented in `g6-8-evidence/README.md`; `check:ci` judges the real workflow. |
| m7 three project files diverged from the engine's and are unused; `rc` untested | The files are kept (preserved as required); the `rc` limitation is documented (section 4 and `README.md`). |
| m8 CI duration | The blocking job takes about 24 to 26 minutes of its 40-minute limit (section 7). |

## 7. GitHub Actions

The workflow is the snapshot caller rendered from the framework's template: seven jobs, the same names, runners and timeouts as before the migration (one blocking job; six informational jobs that cannot fail the run). Every job was opened and read, not only its conclusion.

**Run 93 (`689aac0`, the first run on the approved replacement snapshot): failed, one check.** The blocking job reported 44 of 45: `check:selftest-release-control` stopped after 0.2 s with `ERR_MODULE_NOT_FOUND`. In CI the snapshot caller installs the tools beside the snapshot (`engineering/node_modules`), not in the project folder, and the reconstructed layout had linked only the project's. Reproduced locally by removing the project's tools, fixed in `eec682f`. The six informational jobs passed. Nothing else failed, including `check:regression`.

**Run 94 (`eec682f`): all seven jobs passed.**

| Job | Result | What the log shows |
|---|---|---|
| verify (Ubuntu 24.04, Node 24, Chromium), **blocking** | success, 24 min of 40 | 45 of 45 checks; candidate digest `69f9f18f…`, SBOM digest `a1dbdd12…` (151 components); `check:regression` passed with the runner's Chromium 156 against the pinned 141 (printed, thresholds unchanged) |
| cross-browser: Firefox (informational) | success, 9.8 min | 15 passed, 0 failed, 0 not applicable of 15 browser-driven checks; the checks that cannot run in Firefox (runtime budgets, the self-tests) are printed as N/A with their reasons |
| cross-browser: WebKit (informational) | success, 8.8 min | 15 passed, 0 failed, 0 not applicable of 15 |
| fast checks on macos-latest (informational) | success | 25 of 25, the same SBOM and candidate digests as Linux |
| lighthouse (informational) | success, 105 s | 0 errors, 0 warnings; accessibility 1 on all five pages, performance 0.99 to 1, best practices 1, SEO 0.60 to 0.63 (threshold 0.6) |
| external links (informational) | success | 4 destinations, 4 verified, 0 blocked, 0 unavailable, 0 inconclusive |
| supply chain report (informational) | success | 128 packages with verified registry signatures, 34 with verified attestations; `npm audit`: 0 vulnerabilities; no install scripts, no deprecated package; SBOM 127 components with hashes and licences |

**Final commit:** the change after run 94 is the suite runner's emptiness check, the wrapper's hash check, documentation and evidence. Its local full verification and its CI run are reported in the hand-over message with their numbers (a report cannot name the run of the commit that contains it).

## 8. Unresolved risks and limitations

1. **A not-applicable dry-run scenario would still pass** (the count is printed, not asserted). For this project it is 0 of 319 today; a future change that removes a capability would shrink it silently. Pin it in the next framework revision.
2. **Suite case counts are not asserted in code**; only emptiness is.
3. **The dry run's scan for network and deployment code reads the engine, not the project's retained code.** Nothing is there today.
4. **The proof of concept is proved in a reconstructed legacy layout, not the split layout** (section 4). If it is ever to be used, its frozen view code needs a layout-aware revision, which was out of scope.
5. **The snapshot proves integrity, not authenticity** (specification 16, section 10.9): someone who can edit the repository can edit the files and the record together. The private-side `--against` check, the pinned protected hash and the adversarial tests cover accidental drift and unreviewed edits, not a determined forger.
6. **Pixel regression:** passed in every full run in this stage (three local runs and every CI run that reached it). One earlier local failure (a 44-pixel difference) happened while the machine was also running other heavy jobs; the same check passed when re-run alone. Thresholds are unchanged (`git diff 2bb1737` of the threshold, allowlist and baseline files is empty). CI prints that its Chromium (156) differs from the pinned one (141) and still passes. No recurring failure was found, so no threshold was touched.
7. **The framework branch history** carries intermediate candidate commits (section 2).
8. **Everything outside Stage B stays as it was:** the production-release blockers RB-01 to RB-16, the empty reviewer table, the unimplemented authenticity verifier. This is an engineering migration, not release readiness.

## 9. Not done, by instruction

No merge of the framework into `main`, no Framework Release or tag, no deployment, no published website, no MONOLITH, no Stage C work, no new architecture. Stage C needs the owner's authorisation.
