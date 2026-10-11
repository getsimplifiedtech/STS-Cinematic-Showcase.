# G6-1 completion report: runtime and tooling hygiene (`APR-JE-038`)

**Status: delivered for owner review. G6-2 has NOT been started and will not be until you have reviewed this report and said so.** This report approves nothing. No production deployment, merge into `main`, extraction into the master framework, release-model change, website or media change, CSP or release-requirement change, automatic dependency merge, or paid service was made or used.

| | |
|---|---|
| Repository | `getsimplifiedtech/STS-Cinematic-Showcase.` |
| Branch | `feature/jade-and-ember-v0.9` (the frozen `baseline/jade-and-ember-v0.8` and `main` were not touched) |
| Base commit | `92a265a` |
| Implementation commits | `4e37317` (first), `5dda905` (fixes from the first full verification and CI run 46) |
| Commit verified by the evidence below | **`5dda905`**: local `npm run verify` 40 of 40; GitHub Actions run 47, all seven jobs successful |
| Records commit | the commit that adds this report and `g6-1-evidence/` (documentation only; its CI run is recorded in `CI.md`) |
| Master framework repository | read only; not modified (HEAD `f2a03dc` clean; remote tips unchanged) |

## 1. The authorised repository, branch and files (identified before editing)

Recorded in `framework-migration-matrix.json` (work package G6-1, field `scope`) before any implementation edit, in commit `7b2fd75`, and checked by `npm run gate6:scope -- G6-1` (a read-only comparison of every file changed since `92a265a` with the allowed and denied lists). Result at `5dda905`: **every changed file is inside the scope; no denied file changed.** Denied, among others: all five pages, `styles.css`, scripts, fonts, `media/`, `config/`, the renderer, the CSP/security policy, `engineering/release/`, the release library and tool, evidence and findings records, `baselines/`.

**Scope amendments (three files, each recorded in the matrix with its reason, none touches a denied path):** `lib/node-range.mjs` and `lib/regression.mjs` (the engines-range evaluator and the one-line Node check of the regression harness, scope item 4), `README.md` of the project (it still told readers to run Lighthouse CI, scope item 7), and `checks/selftest-gate3.mjs` (its four tests of `check:ci` searched for the retired Action SHAs; found by the first full verification, section 8). I added them myself because the original list was derived by me from your seven items and did not name them; please say if you prefer a different handling.

The site is unchanged: the delivered tree hash recorded by `verify` is `9061a2270196faa55a20e2af81402d380ee5caf24967d53a398a295e681bc491` (the `9061a227…` of the readiness summary), and `git diff 92a265a HEAD` touches no page, style, script, font, media or configuration file.

## 2. Node version and GitHub Actions

| | Before | After |
|---|---|---|
| Node in CI and locally | 22.22.0 / npm 10.9.4 | **24.21.0 / npm 11.19.0** (Node 24 "Krypton", long-term support) |
| `engines.node` | `>=20` (checked only for presence) | **`>=24.8.0 <25`**, equal to `environment.json`, accepted by the pin, and satisfied by the pin against the `engines` range of **every** locked package (`check:deps`, with a strict range evaluator that refuses ranges it does not understand) |
| `npm ci` | `--ignore-scripts` | `--ignore-scripts --engine-strict` (a package that does not support the pinned Node fails the install) |
| `actions/checkout` | v4.2.2 `11bd71901bbe5b1630ceea73d27597364c9af683`, Node 20 runtime | **v7.0.1 `3d3c42e5aac5ba805825da76410c181273ba90b1`**, `runs.using: node24` |
| `actions/setup-node` | v4.4.0 `49933ea5288caeca8642d1e84afbd3f7d6820020`, Node 20 runtime | **v7.0.0 `820762786026740c76f36085b0efc47a31fe5020`**, `runs.using: node24` |

Evidence: `g6-1-evidence/node-24.21.0.txt`, `g6-1-evidence/actions-pins.txt`. The lower bound 24.8.0 is the oldest Node 24 that `html-validate` supports (`^22.22.0 || >=24.8.0`); the upper bound keeps an untested major out.

**What was verified and what was not.** The Actions were re-verified today at their sources (tag to SHA with `git ls-remote`; each commit is an ancestor of the default branch; `action.yml` at the commit declares `node24` and has the inputs the workflow uses). The Node binary's SHA-256 matches its entry in `SHASUMS256.txt` from nodejs.org; **the GPG signature of that file was not verified** in the sandbox (an earlier line of `environment.json` said "signed"; corrected). `setup-node` v7.1.0 (`949feb24…`) exists; I pinned v7.0.0, three months old, instead of a release days old (a change from the Phase 6 candidate, recorded in `dependencies.json`). `check:ci` now enforces these SHAs from `dependencies.json`, a single Node patch in every job equal to `environment.json`, and a blocking-job name that states the right Node major.

## 3. Dependency inventory, before and after

(`g6-1-evidence/dependency-inventory.json` lists every package.)

| | Before (`92a265a`) | After |
|---|---|---|
| Direct development dependencies | `@axe-core/playwright` 4.13.0, **`@lhci/cli` 0.15.1**, `ajv` 8.20.0, `html-validate` 11.16.2, `pixelmatch` 8.0.0, `playwright` 1.64.0, `pngjs` 7.0.0, `yaml` 2.9.1 | the same, with `@lhci/cli` removed and **`lighthouse` 13.5.0** (exact) added |
| Locked packages | 349 | **128** (250 removed, 29 added, 44 changed version, 55 unchanged; the changes are all inside the Lighthouse tree) |
| Runtime dependencies | 0 | 0 |
| Packages without a recorded licence | 1 (`parse-cache-control`) | **0** |
| Licences | MIT 264, ISC 36, Apache-2.0 28, BSD-3-Clause 9, BSD-2-Clause 7, 0BSD 2, MPL-2.0 2, unrecorded 1 | MIT 83, Apache-2.0 24, ISC 10, BSD-3-Clause 6, MPL-2.0 2, BSD-2-Clause 1, 0BSD 1, `(MIT OR CC0-1.0)` 1; all on the allow-list |
| Packages with install scripts / deprecated | none / none reported | none / none (CI run 47) |
| `npm audit` | **17** (11 high, 4 moderate, 2 low), all inside `@lhci/cli` | **0** (local, and CI run 47) |
| Accepted advisories in `dependencies.json` | 11 packages | none; `@lhci/cli` is listed as a **retired package** that `check:deps` refuses to see again without a reviewed change |
| SBOM (CI) | 349 components | CycloneDX 1.5: 127 components, all with hashes and licences; SPDX 2.3: 128 packages |

**Lockfile determinism.** The lockfile was regenerated from the `92a265a` lockfile (so every package that did not need to change kept its resolved version) with `npm uninstall @lhci/cli` and `npm install lighthouse@13.5.0 --save-exact` (`--package-lock-only --ignore-scripts`) on Node 24.21.0 / npm 11.19.0, **twice in separate folders; both files have the same SHA-256 `bd8e68f2e78d969579a159e52a2ce7fe383c3f341aeb427ea0346ab464fd669c`**. `npm ci --ignore-scripts --engine-strict` then installed 128 packages with no engine warning, and `npm ls` shows only the eight direct dependencies. The same install succeeded in every CI job.

## 4. The Lighthouse replacement

`@lhci/cli` (a tree that made up most of the 349 packages and that `verify` never ran) is replaced by the `lighthouse` package used directly:

- `engineering/lib/lighthouse.mjs`: serves the project folder with the engineering static server, starts a **fresh Chromium for every run** (the browser picks its own debugging port and writes it to a file, so the runner contains no network client code), calls Lighthouse through its Node API, and **fails closed**: a run that errors, lands on another URL, lacks a category score, or a page with fewer runs than configured is an error, never a skipped assertion.
- `engineering/lighthouse.json`: the five pages, three runs, performance 0.8 (warn), accessibility 0.95 (error), best practices 0.9 (warn), SEO 0.6 (warn), `is-crawlable` not asserted (the demonstration is deliberately `noindex`), with a recorded **floor** the thresholds may be raised above but never lowered below (`check:selftest-gate6` enforces it).
- `engineering/tools/lighthouse.mjs` (`npm run test:lighthouse`); `lighthouserc.json` deleted.
- CI: a new **informational** `lighthouse` job runs it on the GitHub-hosted runner (it never blocks; a release gate that needs Lighthouse would be a G6-2 decision).

**Same thresholds, and one correction you should know about.** Your Phase 6 and Gate 6 documents (and my earlier statements) said Lighthouse CI asserted the **median** of three runs. It did not: for a `minScore` assertion Lighthouse CI's default aggregation is **optimistic** (the best run passes the page). In the baseline measurement I ran for this report, one run of the home page scored **0.79** for performance, below the 0.8 threshold, and the old tool still passed it. The direct runner uses the **median** by default, which is never kinder than the optimistic method for any set of runs (tested), so nothing is weakened, but it is a different rule from the one that was running; `aggregation` can be set to `optimistic` (the old behaviour) or `pessimistic` in the file, never below optimistic. The documents are corrected with notes (`DEPENDENCIES-SECURITY-GATE5.md`, `DEPENDENCY-ADVISORIES.md`, `GATE-6-IMPLEMENTATION-ORDER.md`, `GATE-6-READINESS.md`).

**Old tool against new runner** (same machine, same five pages, three runs each; `g6-1-evidence/lighthouse-comparison.json`):

| | Lighthouse CI 0.15.1 (Lighthouse 12.6.1) | Direct runner (Lighthouse 13.5.0), local Chromium 141 | Direct runner, CI run 47, Chromium 156 |
|---|---|---|---|
| Accessibility, best practices | 1.00 on all pages | 1.00 on all pages | 1.00 on all pages |
| SEO | 0.63 (home, menu, our story), 0.60 (visit us, order online) | identical | identical |
| Performance | 0.79 / 1 / 1 (home), 0.99–1 (others) | 0.99–1.00 | 0.98 (home), 0.99–1.00 |
| Result | pass, 0 warnings | **pass, 0 errors, 0 warnings** | **pass, 0 errors, 0 warnings** |

The largest difference between the two tools' medians is 0.01 (performance on three pages). The two holding pages score exactly 0.60 for SEO against a threshold of 0.60: no margin, as before (warn level).

**Tested** (`check:selftest-gate6`, 58 cases, part of every full `verify`): the configuration and its floor (lowering any threshold, demoting accessibility from error, removing a category, fewer runs, a weaker aggregation, an unknown aggregation, a path-escaping page name each fail); aggregation (median never kinder than optimistic, tested on random sets; a missing or NaN score gives no aggregate); assertion (a score under an `error` threshold fails the command, under a `warn` threshold only warns, null scores, failed runs, missing runs and missing pages fail); the Node range evaluator (including refusal of a range it cannot parse, which a first version wrongly waved through when an earlier comparator had already decided: a bug the test found); dependency rules (engines mismatch, a locked package needing Node 25, an unparseable range, `@lhci/cli` returning in `package.json` or the lockfile, a loose `lighthouse` range); the workflow (Node 22 or another 24 patch, a floating version, the old Action SHAs, an unrecorded SHA, a tag, a missing `--engine-strict`, a mismatched job name, the Lighthouse job losing its informational name); and **the real runner in Chromium against the real site** (it passes the real thresholds; impossible thresholds fail; a page that does not exist fails). Run 46 also showed the runner failing closed by itself: with Chromium unable to start on the runner, all 15 runs failed and the job went red instead of passing.

## 5. Remaining advisories and security risks

- **Advisories: 0** in the installed tree (`npm audit`, local and CI). The registry signatures of all 128 packages verified, with 34 verified provenance attestations (CI run 47; `npm audit signatures` cannot run in the sandbox, whose proxy blocks the Sigstore host, so this evidence is CI-only).
- **Lighthouse's dependency tree contains `@sentry/node` and OpenTelemetry packages.** Lighthouse initialises error reporting only in its own command-line program, never through the Node API this runner uses, and only when asked; `check:selftest-gate6` asserts the runner source neither enables it nor imports the CLI. I did not capture network traffic to prove silence.
- **Chromium runs with `--no-sandbox`** in the Lighthouse runner (as Lighthouse CI's configuration did, and as Playwright does by default). On the Ubuntu 24.04 runner AppArmor blocks the user namespaces the sandbox needs (run 46: `SIGABRT`). The browser opens only this project's pages from `127.0.0.1` in a throw-away profile; the reason is recorded in `lighthouse.json`.
- **`parse-cache-control` licence evidence (D-P6-6)** is resolved by removal of the package, **not** by obtaining the authoritative evidence you approved; if you still want the Phase 6 finding closed on its own evidence, say so.
- The `<25` upper bound means Node 25 and 26 are refused (`--engine-strict`) until a reviewed change; Phase 6 noted Node 26 becomes long-term support in late October 2026.
- Not checked: the GPG signature of the Node checksum file; Windows (the repository name ends with a dot; unchanged); anything about real devices, screen readers, rights, search review or hosting (production release blockers RB-01 to RB-14 and findings RG-01 to RG-14 are untouched and open).
- Unchanged and still open: no release, deployment or rights approval exists; the demonstration is `noindex`; v0.8/v0.9 are not approved for deployment or client production.

## 6. Test results and CI

| Evidence | Result |
|---|---|
| `npm run verify` (full), Node 24.21.0, commit `5dda905`, 18 min 26 s | **40 of 40 checks pass** (39 earlier checks plus `check:selftest-gate6`), including the 112-scenario release dry run, the regression against the frozen v0.8 baseline (0 problems in 184 comparisons; the one approved source difference, IMM-1, is noted as before), all browser checks in Chromium 141, and every self-test |
| `npm run verify -- --fast` | 22 of 22 |
| `npm run gate6:scope -- G6-1`, `npm run gate5:closure` | scope clean; closure record supported |
| **GitHub Actions run 47** (`38172892500`, commit `5dda905`) | **all seven jobs successful**: `verify (Ubuntu 24.04, Node 24, Chromium)` (verify step 15 min 9 s, exit 0, all 40 checks), `cross-browser: Firefox` and `WebKit` (informational, success), macOS fast checks (success), external links, supply chain report (0 advisories, 128 verified signatures), **`lighthouse` (informational, 0 errors, 0 warnings)** |
| Run 46 (`38171056341`, commit `4e37317`) | **failure**, reported as it was: `verify` 37 of 40 (see section 8) and the Lighthouse job failed closed |
| Run 44 and earlier | unchanged records in `CI.md` (run 43 was cancelled by the next push and is not claimed) |

Playwright (1.64.0), the HTML validator, axe and the other verification tools were not changed, so the cross-browser jobs exercise the same tools on Node 24.21.0: the Firefox and WebKit jobs pass as before.

## 7. What changed (summary)

`.github/workflows/jade-and-ember-verify.yml` (Node, Actions, `--engine-strict`, the informational Lighthouse job); `package.json`, `package-lock.json`; `engineering/`: `lighthouse.json`, `lib/lighthouse.mjs`, `tools/lighthouse.mjs`, `lib/node-range.mjs`, `lib/wp-scope.mjs`, `tools/wp-scope.mjs`, `checks/selftest-gate6.mjs`, `checks/ci.mjs`, `checks/deps.mjs`, `checks/selftest-gate3.mjs`, `lib/regression.mjs`, `lib/cross-catalogue.mjs`, `verify.mjs`, `environment.json`, `dependencies.json`, the migration matrix, the closure ledger and verifier, and the documents (`CI.md`, `README.md` of the project and of `engineering/`, `ENG-SECURITY.md`, the dependency and Gate 6 documents with correction notes, this report and `g6-1-evidence/`); `lighthouserc.json` deleted. The governance record is `APR-JE-038` in `docs/JADE_AND_EMBER_APPROVALS.md`.

## 8. What went wrong on the way (so you can weigh the evidence)

The first full verification (commit `4e37317`, locally and in CI run 46) failed:
1. `check:selftest-gate3`, four cases: they mutate the workflow text by searching for the retired Action SHAs and the exact line `npm ci --ignore-scripts`; fixtures updated to the new pins and install line. Each test still injects the same defect and expects the same message.
2. `check:release-dryrun`: its deployment-safety scan allows network-capable code only in three files, and my first runner polled Chromium's port with `fetch`. I removed the network code from the runner (file-based port discovery) rather than widen the allow-list; the scan is unchanged. The new self-test builds the scanned patterns in pieces so it does not trip the scan either.
3. `check:selftest-gate6` and the `lighthouse` job in CI only: Chromium aborted at start on the runner without `--no-sandbox` (not reproducible in the root development container, where it was already on). Fixed in `lighthouse.json`, confirmed by run 47.

## 9. Decisions and blockers for you

1. **Accept the median aggregation** (never kinder than the optimistic rule that actually ran), or keep `optimistic` for exact parity?
2. **The `lighthouse` CI job is informational.** Should Lighthouse (at least accessibility 0.95) become a blocking requirement, and where (the `verify` job, or a release-gate requirement in G6-2)?
3. **Scope amendments** (section 1) and the `parse-cache-control` handling (section 5): confirm or direct otherwise.
4. **`setup-node` v7.0.0 rather than the Phase 6 candidate v7.1.0**, and the Node `<25` upper bound: confirm, or ask for a different policy (for example allow the next LTS after a verification run).
5. **Authorisation for G6-2** (release model v2) is not given or assumed; G6-0 (decisions and specification), which the matrix lists as a dependency of G6-1, was not run before it, because you authorised G6-1 directly; it remains unauthorised.

**Stopped for owner review before G6-2.**
