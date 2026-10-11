# Gate 5 Phase 8: framework-extraction assessment and migration plan (`APR-JE-036`)

**Status: delivered for owner review. An assessment only.** No framework code was extracted, copied or implemented. The master framework repository was **read** (a local clone and GitHub read access) and **not modified**. Nothing was deployed, merged or approved; no dependency, page, style, font or media file changed. The Gate 6 priorities of `APR-JE-036` are recorded, not implemented.

How to read this report: **F-nn** are verified facts, each with the way it was verified. **R-nn** are architectural recommendations: reasoned proposals that nothing has proven. Statements about GitHub or hosting providers taken from search-tool summaries are labelled **(summary)**: a person must re-read the pages before anything depends on them (the D-P3-6 rule).

Companion documents: [`FRAMEWORK-MIGRATION-MATRIX.md`](FRAMEWORK-MIGRATION-MATRIX.md) (the complete matrix, generated from `framework-migration-matrix.json` and enforced by `check:framework-matrix`), [`FRAMEWORK-RECONCILIATION-GATE5.md`](FRAMEWORK-RECONCILIATION-GATE5.md) (specification by specification), [`GATE-6-IMPLEMENTATION-ORDER.md`](GATE-6-IMPLEMENTATION-ORDER.md).

## 1. Result in brief

| Question | Answer |
|---|---|
| Reusable across all STS client websites | **Ten components need parameterisation only** and **twelve more need a redesign first** (the release gate, human evidence, security, supply chain, search, media rights, configuration, baseline, CI and others). Together **7,090 of 9,625 lines (73.7 percent)** of the JavaScript in `engineering/`, `src/` and `build.mjs` |
| Restaurant-specific | **104 lines in 6 files**, plus the Restaurant JSON-LD inside `seo.mjs`, the copy and menu schemas and the component contracts (FM-09) |
| Hosting-specific | **188 lines in 2 files** (`host-files`, `check:hosting`), plus the three header renderers inside `security.mjs` and the host profiles in `server.mjs` (FM-22) |
| Controls to redesign before reuse | **Eleven** (section 4). The most important: the release-approval and CI binding (RG-01), the approval format (RG-04 to RG-07), the trust placed in the verification report (RG-08), the baseline concept, the CI policy, the self-tests |
| Master-framework specifications | **All 15 can be retained unchanged** (byte-identical on `main` and at the pin); 9 inform the engineering directly. Two **extensions** are proposed (never edits) and two **rulings** are needed from the owner (builder scope; the visual packages beside the Anthropic Frontend Design authority) |
| Approved Gate 5 requirements not implemented | **16 approved and not implemented, 2 that need a person, 4 accepted with a condition**, 2 prohibitions in effect, 2 in effect or implemented; plus findings RG-01 to RG-14 and the 8 required Gate 6 priorities (section 6) |
| Frontend Design integration | A boundary, not a merge: the creative authority decides appearance; the engineering framework only vetoes or requires, pins the authority by hash, and never sets an aesthetic value (section 7) |
| One static output, two hosts | One delivered folder plus one adapter-generated bundle per host; **proven only against simulations**; live behaviour needs a separately authorised preview (section 8) |
| Centralised GitHub automation | Reusable workflows in the framework repository, called by a short workflow in each client repository; **nothing is installed on a client's hosting** (section 9) |
| Independent validation before MONOLITH House & Design | A four-level ladder plus a readiness checklist (section 10). **Nothing about MONOLITH exists in either repository**, so it is treated as unknown |

## 2. Verified facts

### 2.1 Jade & Ember engineering

| Fact | Verified by |
|---|---|
| **F-01** The repository holds 254 tracked or unignored files; **every one belongs to exactly one of 34 components** | `check:framework-matrix` (passes) |
| **F-02** JavaScript under `engineering/`, `src/` and `build.mjs`: **9,625 lines in 103 files** (`lib/` 33, `checks/` 39, `tools/` 10, runner 2, `src/` 18, `build.mjs`), plus 4 schemas (1,430 lines) and 24 policy or record JSON files | `wc -l`; the matrix |
| **F-03** By class: universal-redesign 4,060 lines (42.2%), universal 3,030 (31.5%), development tooling 1,535 (15.9%), project 547 (5.7%), hosting 188 (2.0%), records 161 (1.7%), restaurant 104 (1.1%) | the matrix classification, lines counted per file |
| **F-04** Project-specific literals in the engineering **code** (`lib`, `checks`, `tools`, the runner), measured before the Phase 8 files were added: the project name in 26 files (65 lines); `APR-JE` ids in 17 files; `v0.8` in 18; the word baseline in 25; `docs/JADE_AND_EMBER_*` paths in 9; restaurant words in 26 files (143 lines); Cloudflare in 13; site selectors in 15 | `grep -E` |
| **F-05** 39 engineering files read the project configuration, the page registry or `assembleCandidate` | `grep` |
| **F-06** Engineering code imports **project source** in 7 places (`src/lib/seo.mjs`, `crawlers.mjs`, `config.mjs`) | `grep "from '../../src"` |
| **F-07** `package.json` declares `engines.node >= 20`, but the pinned HTML validator needs Node `^22.22.0 \|\| >=24.8.0` and CI pins 22.22.0 | Phase 6 assessment |
| **F-08** 39 checks in `verify` (38 before the matrix check), 251 + 122 + 25 + Gate 1 to 3 self-test cases, 112 dry-run scenarios, 12 measured probes | `npm run verify`, Actions run 38 |
| **F-09** The gate has 16 client-production and 6 demonstration requirements; findings RG-01 to RG-14 record where it lets something through | Phase 7 report |
| **F-10** `check:ci` rejects the master framework's own template workflow with **12 problems** (unpinned `actions/*@v4`, the floating runner `ubuntu-latest`, no timeout, no `persist-credentials: false`, no full fetch, no exact Node pin, `npm ci` without `--ignore-scripts`, an unlisted `upload-artifact`, no `npm run verify`, and **a false positive**: the word `claude` in the framework's own branch name trips the AI-service rule) | `checkCiFile()` run on the template workflow at the pin |
| **F-11** `check:ci` forbids the triggers `schedule`, `workflow_run`, `repository_dispatch`, `release`, `issue_comment` and `pull_request_target`, forbids `main` in push branches, and allows two actions only. A job-level reusable-workflow call (`uses: owner/repo/.github/workflows/x.yml@sha`) is not rejected as such, but fails the two rules that assume a job with steps (a timeout, and a step running `npm run verify`) | `checkCiFile()` on invented workflows |

### 2.2 The master framework repository, as read

| Fact | Verified by |
|---|---|
| **F-12** `getsimplifiedtech/sts-web-design-framework`: **`main` is `f05f41f`** (2026-09-23) and holds `README.md`, `architecture/` (15 specifications) and `reviews/` only. The pin in `authority.json` is `d2803c0` on `feature/anthropic-frontend-design-standard`. The local clone is checked out at the older `f2a03dc` (the framework's earlier design-skill branch, an ancestor of the pin) | GitHub read API; `git` in the clone, read only |
| **F-13** The **15 architecture documents are byte-identical** on `main`, at the pin and in the clone (blob hashes compared). The `main` merge message describes them as the frozen set verified `READY_FOR_ARCHITECTURE_FREEZE` | `git ls-tree` against the GitHub tree listing |
| **F-14** The pin adds the official `frontend-design` skill and licence, vendored unmodified (their SHA-256 values agree with `authority.json`: `check:authority --framework` reports no hash problem), retires the earlier STS design skill to a deprecation redirect ("do not combine their aesthetic rules with the new skill or treat them as co-equal authorities"), and keeps engineering constraints outside its scope ("Continue to honor ... accessibility, browser testing, reduced-motion, media licensing, deployment approvals, and other engineering requirements"). `main` has none of this. The same check fails only because the clone does not contain `main`'s commit | `git show`; `check:authority` |
| **F-15** The framework holds **no engineering framework code**: its code is one template (`templates/sts-cinematic-template-v02`, a single-page chapter-based scroll site, fictional "Casa Olivar", `^` version ranges, its own CI workflow) and a Python proof | `git ls-tree` |
| **F-16** **No Framework Release exists** (`authority.json`: `release: null`); spec 14 requires projects to pin an exact release and forbids range resolution | `authority.json`; spec 14 |
| **F-17** At the pin, the framework `README.md` still lists 10 specifications and says "do not begin destructive migration", although 15 exist | `git show d2803c0:README.md` |
| **F-18** "MONOLITH" and "House & Design" appear in neither repository | `git grep`, `grep` |

### 2.3 The delivered output and its hosting evidence

| Fact | Verified by |
|---|---|
| **F-19** The delivered site is 23 files, 1,977,874 bytes, tree hash `9061a227…`, and works from an extracted ZIP, `file://`, a domain root, a subdirectory, pretty URLs and without byte-range support | `check:portability`, `check:assets`; `release:verify-package` |
| **F-20** The hosting assessment lists 54 requirements: 15 still need implementation, 42 still need live verification, 9 are closed; 18 risks are open; the live checklist has 17 items; nothing about a live host has been verified | `hosting/` documents, counted in Phase 7 |
| **F-21** The built site has no `404.html`, and the generated `_headers` still contains `includeSubDomains` | Phase 7 probe RG-12 |

### 2.4 GitHub facts for the central-automation design **(summary)**

Read from search summaries of docs.github.com on 2026-10-11, **not** from the pages (the sandbox cannot fetch them).
- A reusable workflow is called as `owner/repo/.github/workflows/file.yml@ref`; the ref may be a commit SHA (the safest). A private caller may call private or public reusable workflows. A private repository that holds reusable workflows must allow access from other repositories (Settings, Actions, General: not accessible, same owner, same organization).
- The called workflow can only downgrade the `GITHUB_TOKEN` permissions given by the caller; `secrets: inherit` passes all secrets, named secrets are the alternative.
- `dependabot.yml` lives in each repository's `.github` directory (`version: 2`); organization settings can enable Dependabot alerts and security updates centrally, but version-update configuration is still per repository (a secondary source; the primary page was not read).
- Renovate shared presets were **not** verified.

## 3. What is reusable and what is not (questions 1 to 3)

The full matrix is [`FRAMEWORK-MIGRATION-MATRIX.md`](FRAMEWORK-MIGRATION-MATRIX.md). Membership of files and the line counts are facts; the **classes are recommendations**.

| Group | Components | Lines | Reuse |
|---|---|---|---|
| **Parameterisation only** (10) | FM-01 core utilities, FM-03 runner and report, FM-04 browser runtime, FM-05 cross-browser harness, FM-07 build integrity and portability, FM-10 accessibility checks, FM-16 external links, FM-20 dry run and package verifier, FM-24 creative-authority pin, FM-26 budgets | 3,030 | Values move to a project manifest; logic does not change |
| **Reusable after a design change** (12) | FM-02 assembly, FM-06 baseline and regression, FM-08 configuration, FM-11 contact-link check, FM-13 security and CSP, FM-14 dependency, secrets and CI policy, FM-15 search and AI discovery, FM-17 media rights, **FM-18 release gate**, FM-19 human evidence, FM-23 CI workflow, FM-25 tokens | 4,060 | Section 4 |
| **Restaurant-specific** | FM-09 (dish, menu category, hours, owner note, steps, menu page, copy and menu schemas, component contracts) | 104 | Stays with restaurant projects |
| **Hosting-specific** | FM-22 (host files, static-folder hosting check, hosting documents) | 188 | Becomes adapters |
| **Jade & Ember only** | FM-12 (WebKit correction check, engine records, scenarios), FM-28 (the site and its renderer), FM-33 (repository root) | 547 | Stays; FM-12 is the model of a *project check* the core must accept |
| **Development tooling** | FM-21 self-tests and fixtures (1,201 lines), FM-29 legacy tests and diagnostics | 1,535 | Self-tests are rewritten onto a generic fixture; the rest is optional |
| **Records and history** | FM-27 policy data, FM-31 governance documents, FM-32 evidence, FM-34 this assessment | 161 (code) | Stay |
| **Documentation** | FM-30 | n/a | Rewritten into the framework specification |

(The twelve "design change" components are listed by the class in the matrix; FM-24 appears in the first group because its class is `universal` with a `parameterise` level.)

Two judgements deserve emphasis:
- **R-01** *The engineering verifies the delivered folder, not the builder.* No check cares whether `build.mjs`, the template's builder or Lovable produced the folder. That makes the core usable for any STS site and keeps the Jade & Ember renderer (FM-28) out of the extraction. Whether a shared static renderer becomes a framework component is a separate owner decision.
- **R-02** *The search generators move with the engineering.* `seo.mjs` and `crawlers.mjs` look like site source but are imported by seven engineering files (F-06). They are build-time generators any builder can call, so they belong in the framework (the Restaurant JSON-LD excepted).

## 4. Controls that require redesign before reuse (question 3)

| # | Control | Fact | Redesign (recommended) | WP |
|---|---|---|---|---|
| 1 | Release-approval and CI binding | RG-01: both must name the HEAD commit yet live in the repository, so the gate can never pass; the dry run reached green only by keeping them untracked | Bind to an immutable candidate artifact digest that excludes approval and evidence records (spec 15 solves the same circle: its content hash excludes status and approval references); record approvals and CI evidence separately | G6-2 |
| 2 | Approval format | RG-04 to RG-07: Markdown rows matched by keywords; "REJECTED", "NOT verified", "(REVOKED)" still count | Structured records with `status`, `approved_by`, `approved_at`, reviewer authorisation and revocation, shaped like spec 15 and rendered into the Markdown log | G6-2 |
| 3 | Verification evidence | RG-08: a local, unsigned, gitignored file satisfies `verifyPassed`, even with no results | Evidence produced by the CI run, complete (every required check present), bound to the candidate digest | G6-2 |
| 4 | Production domain | 12 of 27 sample provider or staging hosts are not recognised by the denylist | Positive authorisation: the release approval names the domain, equal to `seo.baseUrl` | G6-2 |
| 5 | Baseline and regression | F-04: 25 files use the v0.8 baseline; a new client has none | The baseline becomes an optional, declared, owner-approved reference; mechanism unchanged | G6-5 |
| 6 | CI policy | F-10, F-11: Jade-specific rules, a false positive, no support for scheduled jobs or the caller shape of a reusable workflow | Profile-driven policy; SHA-pinned reusable workflows allowed; scheduled read-only jobs allowed for declared jobs; word-based rules replaced by structural ones | G6-3, G6-7 |
| 7 | Contact-link and keyboard selectors | F-04: 15 files use site selectors | Selector map in the manifest; `phone` generalised to key contact links | G6-5 |
| 8 | Security and hosting split | `security.mjs` also renders host files; HSTS deviation (F-21) | Policy engine in the core, renderers as adapters; `includeSubDomains` opt-in | G6-4 |
| 9 | Search generators and industry data | F-06 | Generators in the framework; Restaurant JSON-LD in the industry adapter; a schema type per industry (D-P4-2) | G6-5 |
| 10 | Self-tests | About 1,090 lines damage Jade & Ember files; `client-fixture` holds restaurant text edits | Run on a generic fixture site; Jade & Ember becomes the reference consumer with golden outputs | G6-5 |
| 11 | Project layout and the runner | F-04, F-05: paths, approval ids and a 38-item hard-coded check list | `sts.engineering.json` (root, page registry, shared files, baseline reference, approvals path and id prefix, selector map, hosting profile, industry adapter, creative-authority pin); a registry-driven runner; a project-check extension point | G6-5 |

## 5. Master-framework specifications that can be retained (question 4)

Detail and quotations: [`FRAMEWORK-RECONCILIATION-GATE5.md`](FRAMEWORK-RECONCILIATION-GATE5.md).
- **Retained and directly relevant (9):** 03 (content-hash domain that excludes approvals; production versus preview modes; Asset Manifest states), 05 (caution, restricted, forbidden), 08 (compile-time QA, lock and provenance), 09 (QA tiers, severities, "no production approval with Blockers or unresolved Majors"), 10 (the migration method; its release-blocking risk, taste leaking into CORE, has an exact engineering twin), 12 (CORE neutrality: vetoes only), 13 (tiers, tighten-only), 14 (release, lock, no range resolution), 15 (structured approval records).
- **Retained, informational (6):** 01, 02, 04, 06, 07, 11.
- **Proposed extensions (proposals, not edits to a frozen set):** spec 15 does not model `rejected`, `revoked`, `superseded` or reviewer authorisation, which Gate 6 priority 2 requires; engineering IDs need a registered namespace (spec 11 reserves `qa.` as non-layer metadata). Both need the owner's approval and the framework's review process.
- **Owner rulings needed:** (a) *builder scope*: the architecture has Lovable render the Resolved Specification, while Jade & Ember and the template use a deterministic static build; (b) *visual packages and the creative authority*: the architecture defines STS visual packages (Editorial, Luxury ...) as aesthetic grammar, while the pin makes the Anthropic Frontend Design skill the creative authority. The engineering is independent of both (R-01), but the owner should state how they relate.

## 6. Approved Gate 5 requirements not yet implemented (question 5)

The register is matrix section 5: 40 entries, enforced complete against the approvals log (every `D-P3` to `D-P6` decision must appear). Of the 26 decisions:

| Status | Entries |
|---|---|
| Approved, not implemented (16) | D-P3-1, D-P3-2, D-P3-3, D-P3-4, D-P4-1, D-P4-2, D-P4-3, D-P4-5, D-P5-1, D-P5-3, D-P5-4, D-P5-6, D-P6-2, D-P6-4, D-P6-5, D-P6-6 |
| Need a person (2) | D-P3-6 (provider documentation), D-P5-5 (provider terms) |
| Accepted with a condition (4) | D-P6-1 (temporary), D-P6-3 (subject to verification), D-P6-7 (provisional, unenforced), D-P6-8 (deferred) |
| Prohibitions in effect (2) | D-P3-5 (no preview deployment), D-P5-7 (no public demonstration while rights are unverified) |
| In effect or implemented (2) | D-P5-2 (informational external-links job), D-P4-4 (crawler review enforced) |

Beyond the decisions: findings **RG-01 to RG-14** (all open) and the **eight required Gate 6 priorities** of `APR-JE-036`. Two approved items change delivered files (D-P5-3 the credit link, D-P5-6 the Noto notice); they need their own authorisation and a baseline-allowlist entry, and the pages stay frozen until then.

## 7. Integration with the Anthropic Frontend Design creative authority (question 6)

**Facts.** The authority is recorded in `authority.json` (skill path, SHA-256 of skill and licence, Apache-2.0) and verified by `check:authority`; `engineeringAuthority` lists what STS governs: architecture, configuration, reusable components, accessibility, security, performance, QA, portability, release controls (F-14). Spec 12 already states the principle for CORE: for aesthetic slots CORE may use only `min`, `max`, `forbid` and `require`, never `set`.

**Recommendation R-03 (the interface).**
1. *Roles do not change.* The creative authority proposes direction, palette, type, layout and motion in its own two-pass process. The engineering framework never authors, selects or rewrites an aesthetic value.
2. *What crosses the boundary is data.* The plan's tokens and the approved media enter the project as configuration and styles. Engineering reads them to **veto or require** (contrast, target size, reduced motion, budgets, media rights) and reports. A failing check yields a *finding with a proposal* for the owner, never an edit (the findings register already says "no visual change without approval").
3. *The authority is pinned, not paraphrased.* The manifest records the skill path and hash, the release manifest repeats them, and changing the pin is an approved change. No engineering document restates the skill's aesthetic rules.
4. *Appearance is protected by approval, not by taste.* The baseline mechanism freezes an **owner-approved** appearance and makes no aesthetic judgement.
5. *Neutral by test.* A framework self-test asserts that no check or default emits an aesthetic value, mirroring CORE neutrality and spec 10's "taste leaking into CORE" risk.

## 8. One portable static output on Cloudflare Pages or Vercel (question 7)

**Facts.** F-19 to F-21. The Phase 3 assessment (provider facts from summaries) found: Cloudflare Pages answers unknown paths with the home page when no `404.html` exists; Vercel defaults `cleanUrls` to false and leaves `trailingSlash` undefined, so an adapter must set both and write `vercel.json` outside the delivered folder; a repository name ending in a dot may trouble Git-connected integrations (HR-07).

**Recommendation R-04.** One delivered folder (vendor-neutral, byte-identical for both hosts) plus one **bundle** per host produced by an adapter (`bundle/site/` and the host's files). The adapter only renders from the single policy (security, cache, URL style); it never decides policy and never touches the folder. The release manifest lists the bundle (file list and hashes); after any approved deployment a read-only check compares the bytes served with the manifest (live checklist C-07). GitHub-connected deployment stays the default (D-P3-3), the provider performing no build (framework preset none, output directory the bundle). The same folder passes `check:portability` under both adapters. Live behaviour (404, trailing slash, headers, cache, injected features) cannot be claimed until a separately authorised preview has run (D-P3-5). **Nothing in this report claims it.**

## 9. Centralised GitHub Actions without installing anything on client hosts (question 8)

**Recommendation R-05** (GitHub facts are the summaries of section 2.4).
- *Where things live.* The framework repository holds the reusable workflows (`on: workflow_call`), the checks and the policies. Each client repository holds a short caller workflow, `sts.engineering.json` and (for updates) a generated `dependabot.yml`. The client's **hosting** (Cloudflare Pages, Vercel, an nginx server) has nothing installed: every check runs on GitHub-hosted runners against the client repository, and contact with the host is read-only HTTP from a runner.
- *Pinning.* The caller names the framework by full commit SHA (spec 14: no range resolution); moving the pin is a reviewed change. A compromise of the framework reaches a client only when its pin moves.
- *Jobs.* `verify` (blocking), cross-browser, supply-chain report (signatures, audit, SBOM), external links, and a scheduled read-only live check after an approved deployment. Permissions stay `contents: read`; the caller sets the ceiling.
- *Dependencies and maintenance.* Dependabot alerts and security updates enabled by organisation settings; a per-repository `dependabot.yml` generated from the template; update pull requests run the full verification and wait for a human; automatic merging is prohibited (D-P6-4). Renovate is an alternative whose shared-preset behaviour is unverified.
- *Access.* The framework repository's Actions access setting must admit the client repositories (organisation scope); the owner confirms this together with branch protection, CODEOWNERS and secret scanning (Phase 6 policy proposal, section 4).
- *Policy change.* The current policy forbids scheduled triggers and rejects the caller shape of a reusable workflow (F-11). Allowing them is a deliberate, tested change.
- *Not claimed.* None of this has run: there is no client repository to run it against.

## 10. Validating the framework independently before MONOLITH House & Design (question 9)

**Fact.** MONOLITH House & Design is not described in either repository (F-18): its industry, pages, tier, hosting, media rights and builder are unknown.

**Recommendation R-06 (a ladder; each level must pass before the next).**
1. **V1, the generic fixture.** A small, invented, non-restaurant site in the framework repository proves the core with mutation tests in the framework's own CI (three engines). No Jade & Ember file is involved.
2. **V2, the reference consumer.** Jade & Ember consumes the framework at a pinned commit and shows parity: all checks, byte-identical delivered output (tree hash `9061a227…`), identical reports, the full dry-run scenario set.
3. **V3, a different structure.** The cinematic template (single page, chapters, two themes) runs the core read-only in a temporary copy. It exercises a one-page registry and a non-restaurant subject; its own CI already fails 12 of Jade's CI rules (F-10), useful evidence that the policy must be profile-driven.
4. **V4, independent review.** Someone other than the author reviews the specification, the adapter contract and the fixture's coverage; the owner accepts.
5. **V5, the readiness checklist** for a new project, completed before MONOLITH starts: industry adapter (or none), tier (spec 13), hosting target, media-rights plan, creative-authority pin, manifest, pinned Framework Release, release model v2 in force, and the people-evidence plan (devices, screen readers, browsers).

## 11. Migration approach

`GATE-5-PLAN.md` section 11.4 (M0 to M5) stands, refined: M0 decisions; M1 the specification; M2 the in-repository de-coupling with parity proof; M3 extraction onto a framework branch; M4 consumption at a pinned commit; M5 a second project. The Gate 6 order, dependencies and release blockers are in [`GATE-6-IMPLEMENTATION-ORDER.md`](GATE-6-IMPLEMENTATION-ORDER.md). Spec 10's method (inventory, classification, purity review, parallel build, parity, proving, pilot, cutover, rollback by source-control selection) is adopted. Its release-blocking risk becomes **R-07: Jade & Ember specifics leaking into the core**; the purity review asks of every moved item, *would this still be correct on a non-restaurant site hosted on Vercel with no v0.8 baseline?*

## 12. Risks

| # | Risk | Likelihood / impact | Mitigation (recommended) |
|---|---|---|---|
| 1 | Regression while de-coupling (about 9,600 lines move) | medium / high | Parity proof before and after every step; no file moves in the same step as a behaviour change |
| 2 | The release model changes while code is being moved | high / medium | Release model v2 first (G6-2), refactor after (G6-5) |
| 3 | The engineering is not part of a Framework Release (none exists, spec 14) | certain / high | G6-0 defines the content; a client pins a commit until a release exists |
| 4 | Visual packages and the Frontend Design authority left unreconciled | medium / medium | Owner ruling (D-P8-4); the engineering is independent of it (R-01) |
| 5 | Two overlapping builders (template, Jade renderer) with different CI rules | medium / medium | One owner decides builder scope; engineering verifies the folder |
| 6 | The generic fixture bakes in Jade assumptions | medium / high | V3 on a different structure; the purity review (R-07) |
| 7 | A mistaken or compromised framework change reaches every client | low / high | Per-client SHA pin, review, CODEOWNERS, no automatic pin updates |
| 8 | GitHub cross-repository access or scheduling differs from the summaries | medium / medium | A person re-reads the pages; trial in a scratch repository (G6-7) |
| 9 | Provider facts are summaries (D-P3-6) | certain / medium | Re-verification before any adapter; live preview only when authorised |
| 10 | Node 24 unverified; `engines` untrue (F-07) | medium / low | G6-1 full verification |
| 11 | Human evidence (devices, screen readers, rights) cannot be automated | certain / high for release | Not a framework problem; the gate keeps refusing without it |
| 12 | The trailing-dot repository name (HR-07) for Git-connected deployment | medium / medium | Client repositories use ordinary names; the showcase uses Direct Upload |
| 13 | The framework must be executable "by qualified humans and AI agents without undocumented knowledge" (spec 01) | medium / high | Documentation is a deliverable (FM-30), reviewed independently |
| 14 | Size: about 9,600 lines of JavaScript, 1,430 schema lines and the documents | certain / medium | Work packages are sized S, M or L; no calendar estimate is made |
| 15 | Windows cannot run the project (repository name ends in a dot; the dry run uses symbolic links) | certain / low | Documented; Linux and macOS only |

## 13. Owner decisions needed before Gate 6

| # | Decision | Recommendation |
|---|---|---|
| D-P8-1 | Where the engineering lives: **A** `engineering/` and `architecture/16-...` in the master framework repository; **B** a separate sibling repository | **A**: spec 14 makes the Framework Release pin QA policy and compiler versions, so the engineering belongs inside what is released. B only if the frozen architecture must stay untouched |
| D-P8-2 | How projects consume it: a pinned commit (later a release tag) through reusable workflows and a checkout at that SHA, **not** an npm package | Pinned commit |
| D-P8-3 | Approve *proposing* two extensions through the framework's review process: spec 15 statuses, revocation and reviewer authorisation; an engineering ID namespace | Yes (proposals only, no edit) |
| D-P8-4 | Rulings: (a) builder scope (engineering verifies any builder's folder; a shared static renderer is a separate, later decision); (b) how the visual packages relate to the Anthropic Frontend Design authority | (a) as stated; (b) the owner decides |
| D-P8-5 | Gate 6 order G6-0 specification, G6-1 hygiene, G6-2 release model, G6-3 requirements, G6-4 hosting, G6-5 refactor, G6-6 extraction, G6-7 automation, G6-8 consumption | Approve; the owner's priority list drives G6-2 and G6-3 |
| D-P8-6 | Authorise G6-1 (Node 24, Actions, direct Lighthouse, licence evidence) when Gate 6 opens; approved in principle by D-P6-1 to D-P6-3 and D-P6-6, not authorised to run | Yes, first |
| D-P8-7 | Approve the validation ladder V1 to V5 with the cinematic template as the second structure; supply MONOLITH's profile (industry, pages, tier, hosting, media rights, builder) | Yes; the owner supplies the profile |
| D-P8-8 | Centralised automation: confirm the GitHub settings (organisation Actions access, branch protection, CODEOWNERS, secret scanning, Dependabot); allow scheduled read-only jobs and reusable-workflow calls in the CI policy; Dependabot first, Renovate only if more control is wanted | Yes |
| D-P8-9 | Adopt the spec 13 tiers (Foundation, Standard, Advanced) as the key for default budgets and check strictness; Jade & Ember (five pages) is Standard | Yes |
| D-P8-10 | Name the independent reviewer(s) for the specification, the adapter contract and the fixture | The owner names them |

## 14. Limits of this assessment

- It is a classification and a plan, not a proof of reuse: no check ran on a second project and the generic fixture does not exist.
- Class boundaries are judgements; file membership and counts are facts (`check:framework-matrix`).
- Provider and GitHub statements are summaries (sections 2.3 and 2.4). Remote branches of the framework other than `main` and the pin were not enumerated.
- The framework clone was read only (`ls-tree`, `show`, `cat-file`, `merge-base`, `grep`; its working tree is unchanged); `main`'s commit was read through the GitHub read API.
- Line counts are those of the current repository, including the Phase 7 and Phase 8 additions.
