# Proposed security and dependency-maintenance policy (Gate 5 Phase 6, `APR-JE-034`)

**A proposal for the owner's decision. Nothing here is enabled, configured or enforced yet**, and no setting of the repository or of GitHub was changed. It builds on what is already enforced (section 1) and says what is new (section 2), what the framework should take over (section 3) and what the owner has to switch on in GitHub (section 4). Evidence and findings: [`DEPENDENCIES-SECURITY-GATE5.md`](DEPENDENCIES-SECURITY-GATE5.md).

## 1. Already enforced (keep)

| Rule | Enforced by |
|---|---|
| The delivered site has no dependencies of any kind | `check:deps`, `check:delivery`, `check:hosting` |
| Every development dependency pinned to an exact version; lockfile v3; every package from `registry.npmjs.org` over https with sha512; no git, file or http source | `check:deps` |
| `npm ci --ignore-scripts` everywhere; no install script exists in the lockfile (0 of 349) | `check:ci`, the lockfile |
| Licences from an allow-list; an unrecorded licence is reported, never assumed | `check:deps` (SPDX `OR`/`AND` supported) |
| Advisories reported on every run; none in production, none critical, none high outside the recorded list | `check:deps` |
| No credential in the tree or in any commit; the workflow may not read the `secrets` context | `check:secrets`, `check:ci` |
| Workflow read-only (`contents: read`), no environments, no deploy/merge/publish, every action pinned to a full commit SHA from an allowed list, `persist-credentials: false`, timeouts | `check:ci` |
| CSP and security headers generated from one policy and proven in Chromium, Firefox and WebKit | `check:security`, `check:d11` |
| Nothing merges, deploys or upgrades without a recorded owner approval | `docs/JADE_AND_EMBER_APPROVALS.md`, the release gate |

## 2. Proposed additions

### 2.1 Scope classes

| Class | Examples | Rule |
|---|---|---|
| **Deliverable** | the HTML, CSS, JS, fonts, media | no third-party code; every file hashed in the release manifest |
| **Verification tooling** | `devDependencies`, the lockfile | exact pins; the policy below |
| **CI** | actions, runner image, Node, browsers, `ffmpeg` | actions pinned by SHA; Node pinned to an exact patch; browser and `ffmpeg` versions recorded per run |
| **Hosting** | provider settings, headers, domain | the hosting requirements (`hosting/`) |

### 2.2 Severity response (a proposal; the numbers are for the owner to set)

| Finding | In the deliverable | In a package the verification runs (`verificationPackages`) | Elsewhere in the tooling tree |
|---|---|---|---|
| Critical | block; fix or remove within **2 days** | block; fix or remove within **7 days** | fix or remove within **14 days** |
| High | block; within **7 days** | within **14 days** | record with an exposure analysis within **14 days**; review monthly; **none may remain at a client-production release** |
| Moderate | within **30 days** | within **30 days** | record; review quarterly |
| Low | next routine update | next routine update | record |

"Fix" means upgrade, override with a proven-compatible release, replace or remove. A fix that needs a major version of a tool needs the owner's approval first. Where no patched release exists, the entry stays in the register with its exposure analysis and a removal plan.

### 2.3 Exception register (`dependencies.json`)

- Record **every** accepted advisory, all severities (today only the 11 high ones are listed; 4 moderate and 2 low are not).
- Each entry gets `reviewed`, `expires` (proposed 90 days) and `plan` (upgrade, replace, remove, wait). After `expires`, `check:deps` fails until a person re-reviews: a deliberate forcing function, not a clock bomb, because the owner chooses the date.
- A licence exception records the evidence (file hash, text read, who confirmed). `parse-cache-control` is the model case.

### 2.4 Update automation (approval-controlled)

| Setting | Proposal |
|---|---|
| Tool | Dependabot (built into GitHub; no new dependency); Renovate only if more control is wanted later |
| Ecosystems | `npm` (the `jade-and-ember` directory) and `github-actions` (the workflow directory) |
| Cadence | weekly for version updates, grouped by ecosystem; **security updates immediate and separate** |
| Open PR limit | small (for example 3 per ecosystem) so review stays human-sized |
| Versioning | keep exact pins (the strategy that increases the pinned version rather than adding ranges) |
| Merge | **never automatic.** Every PR waits for the owner |
| Branches | PRs target the development branch; they never touch the frozen v0.8 baseline |
| Each PR must pass | the whole `npm run verify` (all five blocking and informational jobs), `check:deps` with a **licence and advisory delta** in the PR text, `npm audit signatures`, and a diff that touches only `package.json`, `package-lock.json` and the workflow's SHA lines |
| Review checklist | the changelog read; licence unchanged or on the allow-list; new transitive packages listed; no install script added; for an action, the runtime (`runs.using`) and its required inputs checked and the SHA verified against the tag |
| Emergency path | for a critical advisory the owner may approve a same-day patch; it still runs the full verification and is recorded in an approval row |

A sketch (not created) of the file this would need, to be confirmed against Dependabot's current documentation when the owner approves (decision D-P3-6 applies to provider facts):

```yaml
# .github/dependabot.yml  (NOT created)
version: 2
updates:
  - package-ecosystem: npm
    directory: /jade-and-ember
    schedule: { interval: weekly }
    open-pull-requests-limit: 3
    versioning-strategy: increase
    groups: { tooling: { patterns: ["*"] } }
  - package-ecosystem: github-actions
    directory: /
    schedule: { interval: weekly }
    open-pull-requests-limit: 3
```

### 2.5 Software bill of materials and provenance

| Item | Proposal |
|---|---|
| Format | CycloneDX 1.5 (primary); SPDX 2.3 on request. Both come from `npm sbom`, which ships with npm |
| Content | a **composite**: delivered files with SHA-256, fonts with licence and notice, media with rights status, plus the tooling tree as development scope, plus the environment (commit, lockfile hash, Node, npm, Playwright and browser versions, `ffmpeg` package version) |
| When | on demand in CI (the `supply chain report` job prints counts and hashes today); at every release candidate, stored with the release package |
| Evidence | its SHA-256 in the release manifest and the approval row (the file itself carries a random serial and timestamp, so the hash identifies one generated copy) |
| `npm audit signatures` | informational now (349 of 349 signed, 28 attested on 2026-10-11); required for a release candidate |
| Build attestations | only in a separate, owner-approved release workflow with the minimum extra permissions; never in the development workflow |

### 2.6 CI and runner policy

- Actions: pinned by full SHA, from the allowed list; upgrade when a pinned action's runtime is a deprecated Node version; verify the `runs.using` value and required runner version before pinning.
- Node: exact patch pinned in the workflow; baseline the current LTS; `engines` states the truth; the next LTS joins as an informational job before it becomes the baseline.
- Runner image: blocking job on a pinned image (`ubuntu-24.04`); floating images only for informational jobs.
- Binaries: record browser and `ffmpeg` versions in each run's evidence.
- Triggers: `push` to the development branch, `pull_request`, `workflow_dispatch`; **never** `pull_request_target`, `workflow_run` or `schedule` with write permissions (add them to `check:ci`'s forbidden list).

### 2.7 Release requirements these add (for the release policy, when authorised)

1. No advisory of any severity in the tree installed by `npm ci` (or each remaining one has a current exception with expiry and plan, and none is high).
2. The composite SBOM exists, matches the release commit and lockfile hash, and its hash is in the manifest.
3. `npm audit signatures` passed on a networked runner for this lockfile.
4. The pinned actions and the Node baseline are on supported runtimes.
5. Every licence on the allow-list or covered by a current, evidenced exception.

## 3. What belongs in the reusable STS Base Engineering Framework, and what stays in the project

| Belongs in the framework (a mechanism, parameterised) | Stays in Jade & Ember (a fact) |
|---|---|
| The shape of `dependencies.json`: allowed licences, exceptions with evidence and expiry, accepted advisories with plan | The actual accepted advisories (`@lhci/cli` tree), the licence exception for `parse-cache-control` |
| `check:deps` (pins, lockfile rules, licence allow-list with SPDX expressions, audit rules) | The list of `verificationPackages` (Playwright, axe, ajv, pixelmatch, pngjs, yaml) and the 8 pinned tools |
| `check:secrets` (the 11 patterns, history scan, allowlist format) | Its allowlist entries (`secrets-allow.json`) |
| `check:ci` (the workflow policer: permissions, SHA pinning, allowed actions, timeouts, forbidden triggers) | The workflow itself: jobs, the Node pin `22.22.0`, the macOS informational job, the repository-name-ends-with-a-dot note |
| The `supply chain report` job (signatures, audit, SBOM, outdated) as a template | The Lighthouse decision (option F/C/D), `lighthouserc.json` thresholds |
| The update-automation template and the review checklist | The cadence chosen by the owner |
| The severity response table and the exception process | The dates and approvals recorded for this project |
| The composite-SBOM generator (delivered files, fonts, media, tooling, environment) | The font and media records themselves (`fonts/LICENSES.txt`, `media-rights-inventory.json`) |
| The security-header policy format (`security.json`) and the host renderings | This site's CSP hashes and D-11 |
| The release-gate requirements 2.7, evidence format and approval-row patterns | The approval rows and the version `0.9.0-dev` |
| The rule that nothing merges or deploys without a recorded owner approval | The owner's decisions |

Framework work is Gate 6; nothing was copied or changed in the framework repository.

## 4. GitHub-side settings the owner should confirm (not visible from this session)

| Setting | Why |
|---|---|
| Dependabot alerts and security updates enabled | the source of security PRs |
| Secret scanning and push protection enabled | a second net beside `check:secrets` |
| Branch protection on the development and default branches: required status checks (the blocking job), required review, no force push | the approval rule is otherwise only a convention |
| CODEOWNERS covering `.github/workflows/`, `engineering/security.json`, `engineering/dependencies.json`, `package*.json` | changes to the security surface need the owner's review |
| Actions settings: allow only GitHub-authored actions (or the allowed list), default workflow permissions read-only, fork pull-request workflows needing approval | matches `check:ci` |
| Repository visibility and who can write | the repository holds client-adjacent material |
