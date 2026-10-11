# Gate 5 Phase 6: dependencies and security assessment (`APR-JE-034`)

**Status: delivered for owner review. Assessment only.** No dependency was upgraded, added or removed; no tool was installed into the project; the lockfile, `package.json`, the delivered website, the security policy and the CSP are unchanged. Options were measured by resolving metadata in scratch folders outside the repository (`npm install --package-lock-only`, which downloads no package code and runs nothing). The only repository changes are documents, approval records, one correction of two counts in `ENG-SECURITY.md`, and one informational CI job that only reports (`supply chain report`).

Evidence comes from four places, named wherever used: the repository at `2ae78d6`; **a networked GitHub-hosted runner** (Actions run 35, job `supply chain report`, 2026-10-11) for the checks the development sandbox cannot make; registry metadata read with `npm view` and `npm audit` on 2026-10-11; and, for the GitHub Actions, the actions' own repositories (tags and `action.yml`, read anonymously with `git`) plus the GitHub changelog (read through a search tool that summarises the page). Companion document: [`SECURITY-DEPENDENCY-POLICY-PROPOSAL.md`](SECURITY-DEPENDENCY-POLICY-PROPOSAL.md).

## 1. Result in brief

| Area | Finding | Action needed |
|---|---|---|
| Advisories | **17 (11 high, 4 moderate, 2 low), unchanged since Gate 4**, all inside the one development tree of `@lhci/cli@0.15.1`. That package is still the latest release and was last published on 2025-06-25. The tree is not part of `npm run verify`, is not delivered, and none of the advisories is reachable in this project. **A clean replacement now exists:** `lighthouse@13.5.0` used directly has **0 advisories (114 packages)** because its `puppeteer-core 25` no longer pulls in `extract-zip` | Choose a remediation (section 2). Recommended: replace `@lhci/cli` by `lighthouse` directly, behind a small runner that keeps today's thresholds |
| Licences | 349 locked packages, **all development-only**: MIT 264, ISC 36, Apache-2.0 28, BSD-3-Clause 9, BSD-2-Clause 7, MPL-2.0 2, 0BSD 2, **1 unrecorded**. No copyleft obligation arises (nothing is distributed). `parse-cache-control` ships a BSD-style licence text (Walmart and contributors, 2012 to 2014); its metadata uses the obsolete `licenses` field, so no tool sees a licence. It disappears with the recommended remediation | Record the evidence; ask a person to confirm the SPDX identifier (section 3) |
| GitHub Actions | `actions/checkout@v4.2.2` and `actions/setup-node@v4.4.0` declare the **Node 20** runtime; GitHub is forcing them to Node 24 (the warning is in every run). **Current releases: `checkout v7.0.1`, `setup-node v7.1.0`, both Node 24.** GitHub's changelog moved the removal of Node 20 to 2026-09-23 | Upgrade the two pinned SHAs (section 4). Not done |
| Node for the project | CI and this sandbox run Node **22.22.0**. `html-validate@11.16.2` accepts only `^22.22.0 \|\| >=24.8.0`, so CI sits exactly on the minimum and `engines: ">=20"` is wrong. Node 22 ends 2027-04-30 | Move the baseline to Node 24 LTS and correct `engines` (section 4) |
| SBOM and provenance | `npm sbom` (built in) produced CycloneDX 1.5 (349 components, 349 with hashes, 348 with licences) and SPDX 2.3 (350). **`npm audit signatures` on the runner: 349 of 349 packages have verified registry signatures; 28 have verified provenance attestations.** An npm SBOM describes only the build tooling: the delivered site has no npm component, so a release SBOM must list the delivered files, fonts and media | Adopt a composite release SBOM (section 5) |
| Update automation | None configured (`.github/` holds only the workflow) | Dependabot-style PRs, never auto-merged, with the approval rules of the policy proposal (section 6) |
| Secrets, headers, CSP, supply chain | All controls re-run and passing; **no install script in any of the 349 packages**, every package from `registry.npmjs.org` with sha512, workflow read-only with no secrets, actions pinned to full SHAs. Gaps: browser binaries and `ffmpeg` are downloaded at run time outside the lockfile; GitHub-side settings cannot be seen from here; HSTS `includeSubDomains` is still in the policy (owner decision D-P4-5, Gate 6) | Section 7 |
| Release blockers | None of the dependency findings blocks the demonstration. For **client-production** they add: no advisory left in the installed tree (proposed), a release SBOM, and the Actions/Node upgrade | Section 9 |

## 2. Development-only advisories: reassessment and remediation

### 2.1 State today (`npm audit`, 2026-10-11, and the runner's own log)

Identical to Gate 4: 17 entries, 11 high, 4 moderate, 2 low, 0 critical; `npm audit` reports **0 vulnerabilities in production dependencies** (there are none). Every entry hangs off `@lhci/cli@0.15.1`, the only direct dependency involved. `npm audit` offers `@lhci/cli@0.1.0`, a 2018 downgrade, which is not a fix. `@lhci/cli` has had no release since 2025-06-25.

Only six of the 17 are advisories with text of their own; the others are npm propagating a vulnerable range up the chain:

| Package (installed) | Advisory | Severity | Patched release today | Reachable here? |
|---|---|---|---|---|
| `extract-zip` 2.0.1 | symlink path traversal and arbitrary file write from archive entries (GHSA-jmr9-qjv8-65gv, GHSA-7pqw-9j4j-h8q3) | high | **none** (2.0.1 is the latest, published 2023) | no: used only by `@puppeteer/browsers` to unpack a downloaded browser; nothing here downloads one |
| `basic-ftp` 5.3.1 | quadratic CPU use in a directory-listing parser (GHSA-c475-qrg2-pj4r) | high (denial of service) | **6.2.3** | no: reached only through a PAC proxy file over FTP |
| `tmp` 0.1.0 | path traversal and symlink write (GHSA-ph9p-34f9-6g65, GHSA-52f5-9888-hmc6) | high / low | **0.2.7** | no: used by an interactive prompt that `lhci autorun` does not use |
| `uuid` 8.3.2 | missing bounds check when the caller supplies a buffer (GHSA-w5hq-g745-h8pq) | moderate | **14.0.3** (11.1.1 fixes it) | no: random run ids only |
| `sprintf-js` 1.0.3 | unbounded precision denial of service (GHSA-hp3w-g68c-fv3c) | moderate | 1.1.3 (the tree pins 1.0.x) | no: parses the project's own `lighthouserc.json` |

The exposure analysis of Gate 4 (`DEPENDENCY-ADVISORIES.md`) still holds: the workflow holds no secrets and is read-only, `npm run test:lighthouse` is run by hand and **never in CI**, and `npm run verify` does not execute any of this code (it is installed, not run). It would change only if Lighthouse CI processed input that is not this project's own static pages.

### 2.2 What changed since Gate 4: a clean path now exists

Measured on 2026-10-11 by resolving each candidate in a scratch folder (metadata only; nothing installed, nothing executed):

| Option | Advisories after | Packages | Notes |
|---|---|---|---|
| **A. Accept and monitor** (today) | 17 (11 high) | 349 | Visible on every run; no change |
| **B1. Overrides** for `basic-ftp`, `tmp`, `uuid` (the Gate 4 set) | 9 (6 high, 3 moderate) | 327 | `extract-zip` has no patched release, so six high remain. Not recommended |
| **B2. Overrides including `lighthouse@13.5.0`, `puppeteer-core@25.13.0`, `@puppeteer/browsers@3.2.4`** | **5 moderate, 0 high** | 328 | `@lhci/cli@0.15.1` pins `lighthouse@12.6.1` exactly, so a major jump of its engine is **unproven**: it may break its assertion code. A full run would be needed |
| **C. Remove `@lhci/cli`** | **0** | about 19 | Loses Lighthouse scores; `check:budgets`, the axe checks and `check:seo` cover much but not the score model |
| **D. Isolate** Lighthouse CI in its own folder and lockfile | 0 in the main tree | 349 in the isolated tool | Keeps the same advisories, outside the main install |
| **F. Replace `@lhci/cli` with `lighthouse@13.5.0` used directly** | **0** | **114** for Lighthouse itself | `lighthouse@13.5.0` needs Node >=22.19 (fine). `@puppeteer/browsers` 3.x no longer depends on `extract-zip` (it uses `modern-tar`). `parse-cache-control` disappears, and every remaining package records a licence. Needs a small runner (new code) that serves the pages, runs three times, takes the median and applies the thresholds in `lighthouserc.json` (performance 0.8 warn, accessibility 0.95 error, best practices 0.9 warn, SEO 0.6 warn) |

### 2.3 Recommendation

1. **Now:** keep **A** (nothing changes, nothing is hidden). It is safe for the demonstration.
2. **Before any client-production release:** take **F** if the owner wants to keep Lighthouse scores; take **C** if not. Both end with **zero advisories in the installed tree**, which is the cleanest statement to make about a client deliverable. **B2** is the fallback only if a quick change is needed and a full Lighthouse run confirms it works; **B1** and **D** are not recommended.
3. **Test plan for F** (when authorised): run old and new Lighthouse on the five pages and compare the four category scores; keep the same thresholds; run `check:deps`, `check:ci` and the full `verify`; update `QA.md`, the Gate 2/3 mentions and the accepted-advisory entry; confirm the SBOM and `npm audit` are clean; record the dependency change in an approval row.
4. **Monitoring until then:** the `supply chain report` job prints the advisory list on every push; `check:deps` fails on any critical, any production, and any high advisory outside the accepted list.

**Gaps in the current record:** `dependencies.json` lists only the 11 high packages; the 4 moderate and 2 low are visible in `npm audit` but not recorded. The proposed policy records every severity.

## 3. Licence review

### 3.1 Inventory (the lockfile, 349 packages; checked again on 2026-10-11)

| Licence | Packages | Where | Obligation that could arise |
|---|---|---|---|
| MIT | 264 | tooling | notice if redistributed; nothing is |
| ISC | 36 | tooling | same |
| Apache-2.0 | 28 | tooling (Playwright, Lighthouse parts) | notice and NOTICE file if redistributed; nothing is |
| BSD-3-Clause / BSD-2-Clause | 9 / 7 | tooling | notice if redistributed |
| 0BSD | 2 | tooling | none |
| **MPL-2.0** | 2 (`axe-core`, `@axe-core/playwright`) | tooling | file-level copyleft: applies to MPL-covered **modified files that are distributed**. Neither happens: they are run unmodified on a developer machine or a CI runner and are never delivered. Confirmed: the release package contains only site files |
| **none recorded** | 1 (`parse-cache-control`) | transitive of `lighthouse` | see 3.2 |

No package is delivered to visitors, and the release package contains no `node_modules`: `check:deps` and `check:delivery` enforce it. `check:deps` evaluates SPDX expressions (`OR`, `AND`), so a licence such as `(MIT OR CC0-1.0)` is handled.

### 3.2 `parse-cache-control@1.0.1`

| Fact (read from the installed package and the registry on 2026-10-11) | Value |
|---|---|
| Lockfile licence field | none: that is why `check:deps` reports an exception |
| `package.json` | uses the obsolete `licenses` array: `[{ "type": "BSD", "url": "http://github.com/hapijs/wreck/raw/master/LICENSE" }]`, which is not an SPDX identifier and has no `license` field |
| Shipped `LICENSE` file | a BSD-style licence: "Copyright (c) 2012-2014, Walmart and other contributors. All rights reserved." with a source-and-binary redistribution clause set, a "names of any contributors may not be used to endorse or promote" clause and the usual disclaimer (SHA-256 of the file `111f42b37daecc6c387d037ef25955bd269e7f9a46a736d5257a23560534763f`) |
| Origin | the text is the hapi/wreck licence; repository `github.com/roryf/parse-cache-control`; one maintainer; last published 2015; dependency of `lighthouse@12.6.1` |
| Reachability | development tool of Lighthouse CI; never delivered |

**Finding:** the package carries a licence text and it is a permissive BSD-style licence, so redistribution of the tooling would be possible with the notice. The SPDX identifier is **likely `BSD-3-Clause` but is not an exact match** with the standard SPDX wording of the third clause, and a person has not confirmed it. This document does not assert it. **Recommendation:** record the exception as "licence text present, BSD-style (Walmart and contributors); SPDX identifier unconfirmed; development-only", with the file hash above, and let it end with the remediation in 2.3 (`lighthouse@13.5.0` does not depend on it; every package in that tree records a licence).

### 3.3 Other licence matters

- **Fonts** (shipped): SIL OFL 1.1, text in `fonts/LICENSES.txt`; the Noto Serif SC notice differs from the font file (F-G5-05, correction approved by D-P5-6, not yet made).
- **Generated media** (shipped): no right established (`MEDIA-RIGHTS-GATE5.md`).
- **Third-party notices:** nothing from npm is shipped, so no npm notices are due. A dated notices list for the shipped fonts is a Gate 6 packaging task (the release package already includes `fonts/LICENSES.txt`).

## 4. GitHub Actions and Node runtime

### 4.1 Pinned actions

| Action | Pinned today | Runtime | Latest | Runtime | Notes |
|---|---|---|---|---|---|
| `actions/checkout` | `v4.2.2` `11bd71901bbe5b1630ceea73d27597364c9af683` | node20 | **`v7.0.1`** `3d3c42e5aac5ba805825da76410c181273ba90b1` (2026-07-17); conservative: `v6.1.0` `d23441a48e516b6c34aea4fa41551a30e30af803` | node24 | v5: node24, needs runner ≥ 2.327.1. v6: credentials persisted in a separate file under `$RUNNER_TEMP` (we set `persist-credentials: false`). v7: refuses fork-PR checkouts under `pull_request_target`/`workflow_run` (we use neither); ESM. Requires Node ≥ 24 only for its own runtime, which the runner provides |
| `actions/setup-node` | `v4.4.0` `49933ea5288caeca8642d1e84afbd3f7d6820020` | node20 | **`v7.1.0`** `949feb2413d6458794dcd2491c4babbbce0c15c1` (2026-10-07); conservative: `v6.5.0` `249970729cb0ef3589644e2896645e5dc5ba9c38` | node24 | v5: node24 and automatic npm caching when `packageManager` is set (we set `cache: npm` explicitly and have no `packageManager`). v6: `always-auth` input removed (unused). v7: ESM; the dummy `NODE_AUTH_TOKEN` fallback is removed (unused: no `registry-url`) |

Both tag SHAs above were read from the actions' repositories on 2026-10-11 (`git ls-remote` and a shallow clone of each tag, `action.yml` `runs.using`). Nothing in the workflow depends on a removed input. The upgrade is a change of two SHAs (and their version comments) in the six jobs; `check:ci` needs no rule change because it allows the two action names and demands full SHAs. A run on the branch proves it.

**Why it matters now.** GitHub's changelog (2025-09-19, updated twice) says runners use Node 24 for actions by default from 2026-06-16 and moved the removal of Node 20 to **2026-09-23**; it may already have taken effect. Today the Node-20 actions still run, **forced onto Node 24** (the warning in every log), which is a compatibility shim rather than something we control. Older action code on a newer runtime is a risk that grows with time. The macOS job also runs on `macos-latest` (floating, informational by design); the blocking job is pinned to `ubuntu-24.04`.

### 4.2 Node for the project

| Fact | Value |
|---|---|
| Node in CI and the sandbox | 22.22.0 (pinned in the workflow) |
| `engines.node` in `package.json` | `>=20` (only checked for presence by `check:deps`) |
| `html-validate@11.16.2` | `^22.22.0 \|\| >= 24.8.0`: Node 20 and 23 unsupported; **22.22.0 is its minimum** |
| `lighthouse@13.5.0` (recommended) | `>=22.19` |
| `playwright@1.64.0` | `>=20` |
| Node lifecycle (nodejs.org, via search) | Node 22: Maintenance LTS, end of life 2027-04-30. Node 24: Active LTS. Node 26: Current since May 2026, LTS planned for late October 2026 |

**Recommendation:** make **Node 24 LTS the baseline** after one verification run (Playwright, html-validate, axe, the browsers' pinned builds), set `engines` to what is true (`^22.22.0 || >=24.8.0` at first, then `>=24.8.0` once 22 is dropped), and add an informational matrix entry for the next LTS. Pin the exact patch version in the workflow as today.

### 4.3 Binaries outside the lockfile

CI downloads **Chromium, Firefox and WebKit** through `npx playwright install` (the builds are pinned by the Playwright version, 1.64.0, but not by hash) and installs `ffmpeg` with `apt-get` (the Ubuntu 24.04 package, unpinned). The lockfile cannot cover them. They are the largest supply-chain surface not under a hash. Mitigation proposed: record the browser versions and the `ffmpeg` package version in the release evidence on every run (the cross-browser matrix already prints the engine versions); revisit a container image with fixed digests if the owner wants hash-level pinning.

## 5. SBOM and dependency provenance

### 5.1 What `npm` can produce, measured on the runner (run 35)

| Item | Result |
|---|---|
| Tool | `npm sbom` ships with npm 10.9.4 (no installation); formats CycloneDX and SPDX |
| CycloneDX 1.5 | 349 components, 349 with SHA-512 hashes, 348 with licences, package URLs on all |
| SPDX 2.3 | 350 packages (the project plus 349) |
| Reproducibility | each run writes a new serial number and timestamp, so the file is **not** byte-reproducible: the evidence is its hash recorded with the commit, not a golden file |
| Registry signatures | `npm audit signatures`: **349 of 349 packages have verified registry signatures** |
| Provenance attestations | **28 of 349 packages have verified provenance attestations**; the rest publish none (normal today) |
| Install scripts | none in any of the 349 packages (`hasInstallScript` is never set); `npm ci --ignore-scripts` is belt and braces |
| Sandbox | `npm audit signatures` failed in the development sandbox (the signature root could not be fetched, HTTP 403): the runner is the evidence |

### 5.2 What an SBOM of this project should say

The delivered website has **no npm component at all**. An SBOM generated from the lockfile describes the **verification toolchain**, not the deliverable. A useful release SBOM is therefore a composite (CycloneDX 1.5):
1. **Deliverable components:** every delivered file with its SHA-256 (already in the release manifest's asset integrity list); the four fonts with their licence (OFL 1.1) and notice; the media with their rights status from `media-rights-inventory.json` (`unverified` is stated, not hidden).
2. **Build and verification tooling:** the `npm sbom` output, marked as development scope and excluded from the deliverable.
3. **Environment:** commit, lockfile hash, Node and npm versions, Playwright and browser versions, the `ffmpeg` package version.
4. **Evidence:** the SBOM's own SHA-256 recorded in the release manifest and in the approval row.

**Provenance beyond npm:** GitHub build-provenance attestations (`actions/attest-build-provenance`) need `id-token: write` and `attestations: write`, which the read-only policy forbids; they belong in a separate release workflow that needs the owner's approval, and only when a deployable artifact exists (Gate 6). Not proposed for development runs.

## 6. Dependency-update automation and approval-controlled patching

Assessment (nothing configured; configuring Dependabot needs a file in `.github/` and, for security updates, repository settings the owner controls):

| Mechanism | Fit | Notes |
|---|---|---|
| Dependabot **alerts** and **security updates** | good | repository settings; PRs only; security PRs are separate from routine ones |
| Dependabot **version updates** for `npm` (devDependencies) and for `github-actions` | good | PRs only; the Actions updater can update SHA-pinned actions when the version is in a trailing comment (as in our workflow); to be confirmed against current documentation at implementation (D-P3-6 applies to provider facts) |
| Renovate | good, more configurable | a hosted app or self-run job; heavier; not needed for one lockfile |
| Auto-merge | **no** | the standing rule: nothing merges without the owner |

The full proposal (cadence, grouping, severity response times, the checks every update PR must pass, the exception register, emergency path) is in [`SECURITY-DEPENDENCY-POLICY-PROPOSAL.md`](SECURITY-DEPENDENCY-POLICY-PROPOSAL.md).

## 7. Recheck: secrets, headers, CSP, supply chain

| Control | Evidence on 2026-10-11 | Result |
|---|---|---|
| Secrets in the tree and history | `check:secrets`: 207 files and the added lines of 59 commits scanned for 11 credential patterns | none found |
| Workflow permissions | `check:ci`: top-level `contents: read`; no `secrets.` context, no environments, no `pull_request_target`, no cloud or AI service, timeouts on all jobs; 6 jobs, 27 steps, 12 action uses, all pinned to full SHAs; `persist-credentials: false` on every checkout | pass |
| Install safety | `npm ci --ignore-scripts`; exact pins for all 8 direct dependencies; lockfile v3, 349 packages all from `registry.npmjs.org` with sha512; no git, file or http source | pass |
| Advisories | `check:deps`: 0 production, 0 critical, the 11 high recorded | pass (accepted) |
| Registry signatures | 349 of 349 verified on the runner | pass |
| Security headers and CSP | `check:security` and `check:d11` in Chromium, Firefox and WebKit: zero violations, hashes honoured, injected script/style/frame/external resource blocked; policy unchanged since Gate 3 | pass |
| Fictional-demo indexing | meta tag plus `X-Robots-Tag` in the generated host files (Phase 4) | pass |
| Third-party requests from the site | `check:privacy`: none; the CSP has `connect-src 'none'` | pass |
| HSTS `includeSubDomains` | still in `security.json`; the owner decided it must not be a default (D-P3-4, D-P4-5), to be changed in the Gate 6 adapter integration | known deviation, no client deployed |
| Browser binaries and `ffmpeg` | downloaded at run time, not hashed | gap (4.3) |
| GitHub-side settings | secret scanning, push protection, branch protection, required reviews, Dependabot alerts, CODEOWNERS: **not visible from this session** | owner to confirm (checklist in the policy proposal) |
| Documentation | `ENG-SECURITY.md` said 7 tools and 341 packages; corrected to 8 and 349 | fixed |

No new vulnerability class was found. The residual risks are the ones listed: the unreachable development advisories, the unhashed browser and `ffmpeg` downloads, and settings only the owner can see.

## 8. What belongs in the reusable STS Base Engineering Framework

See section 3 of the policy proposal for the full table. In one sentence: **the mechanisms** (dependency policy format, the checks, the CI policer, the update and SBOM templates, the severity response rules, the exception register) are reusable; **the facts** (which advisories are accepted, which tools are pinned, the Lighthouse decision, the Node pin, the fonts and media) stay in each project. Nothing was changed in the framework repository.

## 9. Remaining release blockers (dependency and security)

For the **demonstration** nothing in this phase blocks it as a private, noindex preview. For **client-production**, in addition to everything already open (release approval, rights verification, search review, device and screen-reader evidence, the 404 requirement, the external-links requirement, a stable version):
1. No advisory may remain in the installed tree (proposed); today 17 remain, all via `@lhci/cli` (remediation F or C).
2. A composite release SBOM and its hash in the manifest (proposed).
3. The Actions pins and the Node baseline brought off Node 20 (proposed).
4. HSTS `includeSubDomains` off by default (D-P4-5).
5. The `parse-cache-control` licence evidence confirmed by a person (disappears with F).

## 10. Decisions needed before implementation

| # | Decision | Recommendation |
|---|---|---|
| D-P6-1 | Advisory remediation: keep A now; then F (replace `@lhci/cli` by `lighthouse` directly with a small runner) or C (remove) before client-production | A now, then F |
| D-P6-2 | Upgrade the two pinned actions to `checkout v7.0.1` and `setup-node v7.1.0` (or the v6 pair) | yes, with one verification run |
| D-P6-3 | Node 24 LTS as the baseline and a truthful `engines` field | yes, after one verification run |
| D-P6-4 | Adopt the update-automation policy (PRs only, no auto-merge) and have the owner confirm the GitHub-side settings | yes |
| D-P6-5 | Adopt the composite release SBOM and make `npm audit signatures` informational now, required at release | yes |
| D-P6-6 | Record the `parse-cache-control` evidence as described in 3.2 (a data-file change, no dependency change) | yes |
| D-P6-7 | Adopt the response times and the exception expiry of the policy proposal | yes, as a starting point |
| D-P6-8 | Whether the browser and `ffmpeg` downloads should be pinned by hash (a container with fixed digests) | defer; record versions meanwhile |
