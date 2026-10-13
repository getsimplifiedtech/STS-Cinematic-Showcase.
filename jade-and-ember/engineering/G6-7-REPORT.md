# G6-7 report: centralised GitHub automation

**Status:** implemented and verified on the framework branch; **awaiting owner review. Nothing is merged, tagged, deployed or published, and G6-8 has not begun.** Authorised by `APR-JE-048` (2026-10-13). G6-6 is recorded in the same entry as closed for engineering purposes only; every production-release blocker stays active.

| | |
|---|---|
| Framework repository | `getsimplifiedtech/sts-web-design-framework` (private) |
| Branch | `feature/sts-framework-automation`, created from `3286f8bcf836eb18486c9f61a41919bf53be79c6` (identity confirmed first: the accepted G6-6 head, "G6-6: reviewer evidence bundle") |
| Commits | `e925c8f` (implementation), `67cf1b2` (ledger), `eee5708` (independent-review round) |
| Final head | `eee5708022ca3cd3675177d887a5c0cb49e68276`: 36 files changed from `3286f8b` (18 added, 18 modified), 2,053 insertions and 311 deletions; `architecture/16` is the only specification touched (new section 10.8); the other 15 are byte-identical |
| Jade & Ember | governance records only (this report, the ledger, the matrix, the closure verifier, the Gate 6 order). **No Jade & Ember code, workflow, lockfile, release-control proof of concept or visibility was changed; Jade & Ember does not consume the framework; G6-8 was not begun.** |
| Production hard stop | `engineering/lib/authenticity.mjs` byte-identical (`0b57bc98…`, also pinned in `checks/extraction.mjs`, which is unchanged); the reviewer table stays empty |

## 1. What was built (framework branch)

| Piece | Where | What it does |
|---|---|---|
| Composite action (A1) | `.github/actions/engineering/action.yml` + `engineering/tools/ci/{guard,materialise,install,run,supply-chain-report}.sh` | The only way a repository runs the engineering. Inputs: `mode`, `project-dir` (no default). Seven modes (`verify`, `fast`, `firefox`, `webkit`, `external-links`, `lighthouse`, `supply-chain-report`), single source `engineering/ci/jobs.json`. Five steps: guard (exact 40-hex SHA, framework repository only, plain project path, no symlink out, no committed `.sts-framework`), materialise (the engineering of the exact revision copied to `.sts-framework/engineering`, excluded from git), pinned `setup-node`, `npm ci --ignore-scripts --engine-strict`, run. No secret, token, PAT, deploy key or new account. |
| Reusable workflow | `.github/workflows/engineering-verify.yml` | The seven jobs, for the framework's own use; one input (`project-dir`); `contents: read`. |
| Framework workflow | `.github/workflows/engineering-fixture.yml` | Now calls the reusable workflow and adds a blocking **caller-layout simulation** job. |
| Client caller template | `engineering/ci/templates/caller.yml`, rendered by `engineering/tools/ci/render.mjs` | A client commits the same seven jobs, each a checkout and a use of the action **by the framework's full commit SHA**; the renderer judges what it writes. |
| Scheduled template (inert) | `engineering/ci/templates/scheduled.yml` | Only `external-links` and `supply-chain-report`, one weekly cron entry; no live-site mode exists. Defined, not activated; not under `.github/workflows`. |
| Dependabot template | `engineering/ci/templates/dependabot.yml` | npm and github-actions only, weekly, label `owner-review`; nothing merges itself; the framework revision is never bumped by it. |
| Policy | `engineering/lib/ci-policy.mjs`, `engineering/checks/ci.mjs` | `check:ci` judges callers, the action, its scripts, the reusable workflow, the scheduled caller and the three templates against `jobs.json`; the release gate now runs `check:ci` itself. |
| Exceptions | `engineering/ci/exceptions.json`, `engineering/checks/secrets.mjs`, `fixtures/generic/engineering/secrets-allow.json` | See section 4. |
| Record | `engineering/docs/THIRD-PARTY.md`, `architecture/16` section 10.8, `docs/CI.md`, `docs/REVIEW-BUNDLE.md` | Licensing and size of the vendored OpenMontage; rules, limits and unverified assumptions. |

The engine digest now also covers `.github/actions` and the shell scripts. The extracted files that changed each have a ledger entry (`step-g6-7`), `lib/release.mjs` flagged as security-relevant. The 38 checks of the framework's full run are unchanged in number and order (J&E's 42 and 319 scenarios are not touched: no check was added to or removed from the registry).

## 2. Verification

| What | Result |
|---|---|
| Framework full verification (fixture, local, Node 22.22: this sandbox has no Node 24; CI is the Node 24.21.0 evidence) | **38 of 38** passed, 2 not applicable (baseline, regression), as at G6-6 |
| `check:selftest-generic` | **63 cases** (52 at G6-6): 11 new cases for the automation, all `held`/`caught` |
| `check:selftest-gate3/5/6` | pass; they now damage `engineering/fixtures/ci/direct-workflow.yml`, the G6-6 direct-style text kept as test material, because the framework's own workflow now calls the reusable one |
| Caller-layout simulation (`tools/ci/simulate-caller.mjs`) | **PASS** locally and in CI: a client repository is built on the runner (the fixture as its project at the same path, the caller/scheduled/Dependabot files rendered from the templates, the framework placed as a downloaded action); guard, materialise, install and run execute against it with the **materialised** engineering; the fast verification of the client layout passes 22 of 22 (1 not applicable); 14 damaged guard environments, a committed `.sts-framework`, 33 damaged callers, a tampered caller and a manifest with a `skipChecks` key are refused |
| Simulated merge with `main` (`e15fc53`, scratch clone, nothing pushed) | `check:ci`, `check:secrets`, `check:project` and the fast verification pass with `import-openmontage.yml` and `vendor/openmontage` present; they fail when the workflow or a test file is edited, when another workflow is added, and when the repository identity is not the framework's |
| Production authentication hard stop | unchanged (hash above; `check:extraction` passes; `check:selftest-gate6` passes) |

## 3. GitHub Actions: every job, individually

Run 9 (`38394636508`, head `67cf1b2`) and **run 10 (`38397278729`, head `eee5708`, the final head)** concluded `success`. Run 10, job by job, from each job's log (not the run's status):

| Job | Conclusion | What its log says |
|---|---|---|
| engineering / verify (Ubuntu 24.04, Node 24, Chromium) (blocking) | success | `verify passed (38 of 38 checks; 2 of them not applicable …)`, record `full run`, SBOM digest `2f804f17…` (the same as local); every check of the list is PASS except the two not-applicable ones |
| caller-layout simulation (blocking) | success | `PASS  caller-layout simulation`, with `npm ci` of the materialised engineering (`--install`) |
| engineering / fast checks on macos-latest (informational) | success | `verify passed (22 of 22 checks; 1 not applicable)` |
| engineering / cross-browser: Firefox (informational) | success | `firefox: 12 passed, 0 failed, 1 not applicable, of 13 browser-driven checks run` |
| engineering / cross-browser: WebKit (informational) | success | `webkit: 12 passed, 0 failed, 1 not applicable, of 13 browser-driven checks run` |
| engineering / lighthouse (informational) | success | `PASS  lighthouse (0 error(s), 0 warning(s))` on every page |
| engineering / external links (informational) | success | the record was printed; the step succeeded (informational: a person reads the record) |
| engineering / supply chain report (informational) | success | SBOM 127 components, all with hashes and licences; install scripts none; deprecated none |

Every step of every job, including the action's inner steps, concluded `success` (a `continue-on-error` job cannot hide a failed step here). The action was run **locally** (`./.github/actions/engineering`); the downloaded (remote) path is exercised only by the simulation (section 6).

## 4. Exceptions (item 5)

1. **Workflow.** `engineering/ci/exceptions.json` (the framework's own file; a project's manifest cannot add to it, the schema has no such key): `import-openmontage.yml`, bound to the repository `getsimplifiedtech/sts-web-design-framework`, the file name, the file's SHA-256 (`6e82a120…aace2`, taken from the blob on `main`) and the properties it was reviewed for (triggers `push` and `workflow_dispatch`, permissions `contents: write`, one job `import`). Any change, another repository, another trigger or permission, or any other workflow beside it fails `check:ci` and the release gate. The file is not modified, executed or moved; it is not in this branch's tree (the simulated merge shows the exception works against the real file).
2. **Credential-shaped values.** Five entries in the fixture's `secrets-allow.json` for the eight offline test placeholders in the vendored OpenMontage tests (`test_kling_submission_transport.py` ×4, `test_seedance_ark_video.py`, `test_fal_elevenlabs_music.py`, `test_fal_elevenlabs_tts.py`, `test_google_tts_scoped_key.py`): each bound to the file's SHA-256, the exact finding count and `allowAbsent` (the files are on `main` only). A changed file, a ninth finding or a copy elsewhere fails; a history finding at those paths is accepted only for a line the reviewed file holds.
3. Neither is a permission for another workflow or value. **Direct-style carve-out (not asked for, recorded for your decision):** to avoid breaking Jade & Ember before G6-8, `exceptions.json` lists `getsimplifiedtech/STS-Cinematic-Showcase.` and the framework repository as the only repositories where the older direct style of workflow is still accepted (with the direct rules tightened, section 5); any other repository, a client's, must commit the caller. It should be removed when G6-8 migrates Jade & Ember.

## 5. Independent review (a separate agent, given the code and your boundaries, not my conclusions)

It reported four majors, twelve minors and some nits. Dispositions, all in `eee5708`, each with a new self-test case:

| # | Finding | Disposition |
|---|---|---|
| 1 Major | A manifest could point `paths.repositoryRoot` at a decoy folder; real workflows and files at the git root were then never judged | Fixed: `check:project` requires it to be the git repository the project is in; `run.sh` requires it to be the workspace |
| 2 Major | The direct style still accepted a softened verification (`|| true`, an echo, `&`, step/job `if`, step `continue-on-error`, the blocking job deleted or renamed); the simulation exemption matched any text | Fixed: direct style limited to two repositories (section 4.3); the blocking job must run exactly `npm run verify`; none of those mutations is accepted; at least one blocking job is required; the exemption needs the exact command |
| 3 Major | `ci.framework` (client-writable) could point the judged action at a decoy | Fixed: honoured only in the framework repository and only for fixed names; any other action folder, a copy of the framework's action in a client, and call jobs outside the framework are refused |
| 4 Major | A file named like a commit prefix, or a secret committed at a reviewed path and deleted, escaped the secrets exception | Fixed: the prefix is stripped for history findings only; a history finding at a bound path is accepted only for a line the reviewed file holds |
| 5 | Symlinked project folder; the committed-`.sts-framework` test failed open | Fixed in `guard.sh` |
| 6 | Words like `claude` in a branch or folder name tripped the forbidden-word scan | Fixed (values are masked; the words remain forbidden in the workflow text) |
| 7, 8, 10, 12 | `on` plus `true` key; several schedule entries; a null job crashed the check; `uses` split on `@` | Fixed |
| 9 | Env names of the action unconstrained; a text lint of the scripts is not a proof | Env-name allowlist and exact script set added; the specification now says the lint is a tripwire and the SHA pin plus your review is the control |
| 11 | Self-test cases skipped silently when the action is absent | Now a failure whenever the framework repository's `.github` folder is beside the engineering |
| 13, 14 | Unanchored remote regex; the release gate judged less than `check:ci` | Anchored; the gate calls `check:ci` |
| 15 | `supply-chain-report` reports the engine's lockfile, not the client project | **Open limit**, stated in the specification |
| 16 | `external-links` visits whatever external destinations a project declares, which could be its own production domain | **Open limit**: the scheduled template must be reviewed for that before it is enabled for a client |
| Nits | case-insensitive `main`; `refs/heads/`; concurrency group; hashing raw bytes; header wording | Fixed |

## 6. Residual risks and unverified GitHub access assumptions

* **The real private cross-repository path is unproven (A2):** that a private client repository in the organisation can download this private composite action at an exact SHA, including the folder `../../../engineering` that the scripts reach, depends on the framework repository's Actions access setting, which only you can set and which this package did not touch. The simulation proves the scripts, the guard, the policy and the layout, not GitHub's download.
* `github.action_repository`/`github.action_ref` in composite actions, a commit SHA reachable only through another repository in the same fork network (the guard checks the shape, not the ancestry), `.sts-framework` case folding on macOS, Dependabot not touching a SHA-pinned private action, organisation plan and minutes for seven jobs per client push: all unverified.
* The simulation runs the fast mode; `verify` mode with browsers runs in CI only on the local action. Local verification used Node 22.22; the Node 24.21.0 evidence is the CI.
* **Vendored OpenMontage:** AGPL-3.0, about 92 MB / 2,174 files on `main` (including media); the import workflow can still be started by hand and holds `contents: write` with an unpinned `actions/checkout@v4`. Recorded in `engineering/docs/THIRD-PARTY.md`; not changed. Merging this branch into `main` later is compatible with it (simulated), but that is your decision, not mine.
* **Branch note:** this session's brief names `feature/jade-and-ember-brief` for Jade & Ember; the records continue on `feature/jade-and-ember-v0.9`, as in every earlier package.
* Everything else that blocked production before is unchanged: no reviewer is enrolled, no authenticated release authorisation or build provenance, no real-device or screen-reader evidence, media rights unverified, no live host observed, no Framework Release (RB-01 to RB-16).

## 7. Boundaries kept

No merge into `main`, no tag, deployment or publication; no repository access setting, PAT, deploy key, account, repository, external service or signing process added; no scheduled run enabled (the scheduled template is not under `.github/workflows`); no live-site monitoring; OpenMontage not executed, updated, removed or redistributed and its workflow not modified; Jade & Ember's code, lockfile and visibility untouched; Anthropic Frontend Design remains the sole creative authority and the three offerings share one base. **Stopped for your review.**
