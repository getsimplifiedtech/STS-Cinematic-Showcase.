# Gate 5 closure report (Phase 9, `APR-JE-037`)

> **Update (`APR-JE-038`, 2026-10-11):** the owner approved this report and formally closed Gate 5 as an engineering assessment (not a production approval). G6-1 was authorised with the scope recorded in `framework-migration-matrix.json`; G6-0 and G6-2 to G6-8 are not. CI run 43 for the records commit `92a265a` was cancelled by the next push and is not claimed; run 44 for the descendant `7b2fd75` succeeded. The text below is the snapshot delivered for review and is not rewritten.

**Status: delivered for owner review. Gate 5 is closed by the owner, not by this report.** This report states what Gate 5 delivered, whether the record supports closing it, and what remains open. It approves nothing. It is an **engineering closure** document: it does not say that any website is ready for release, deployment or production, and it does not claim any device test, screen-reader pass, licence, legal review or live-hosting result.

Companion: [`GATE-6-READINESS.md`](GATE-6-READINESS.md). Reproduce every verification statement in section 3 with one command: `npm run gate5:closure` (read only, offline).

## 1. Recommendation

Close Gate 5 as an **engineering closure**: the assessment and verification phases the plan set out are delivered, each has an approved closure record and a successful CI run, the migration matrix and the requirement register are complete and machine-checked, and nothing has been deployed, merged or approved. The plan (`GATE-5-PLAN.md`, section 10, decision 13) recommended exactly this definition; the human evidence (devices, screen readers, rights, legal and live-hosting checks) is **owed, not delivered**, and stays a production release blocker (section 6).

## 2. What Gate 5 delivered, phase by phase

| Phase | Authorised by | Closed by | Verified commit (CI run) | Records commit (run) | Delivered |
|---|---|---|---|---|---|
| 0 Plan and scope | `APR-JE-026`, `027` | `APR-JE-030` | `51c7377` (12) | n/a | The Gate 5 plan: scope, test sequence, 14 owner decisions |
| 1 Cross-browser | `APR-JE-027`, `028`, `029` | `APR-JE-030` | `630beec` (24) | `5a1a8dc` (25) | Informational Firefox 157.0 and WebKit 27.2 jobs; a matrix in which no check can be silently skipped; the approved WebKit text-spacing correction (`check:supports`, F-G5-04); the investigation report |
| 2 Human-evidence tooling | `APR-JE-030` | `APR-JE-031` | `a3a01ea` (26) | `9e9d6f1` (27) | Evidence classes E1 to E3, validator, scaffolds, generated tester procedures; 122 validator cases; the release gate's four evidence requirements |
| 3 Hosting assessment | `APR-JE-031` | `APR-JE-032` | `ecd44ad` (28) | `8344dc7` (29) | 54-row compatibility matrix, Cloudflare requirements, Vercel specification (not implemented), adapter interface, 18 risks, 17-item live checklist; decisions D-P3-1 to D-P3-6 |
| 4 Search and AI readiness | `APR-JE-032` | `APR-JE-033` | `aa38058` (31) | `1ac6f02` (32) | Audit against the proposed search standard; `X-Robots-Tag` for the demonstration; the crawler review record (16 agents; not yet re-read by a person); the `og:image` guard; 34 new Gate 4 cases; decisions D-P4-1 to D-P4-5 |
| 5 External links, media rights | `APR-JE-033` | `APR-JE-034` | `a749a9f` (33) | `f89a7a0` (34) | External-destination registry and classified verifier (4 of 4 verified on a networked runner); the media rights inventory (12 assets: 8 unverified, 4 licence text shipped, none verified); finding F-G5-05; 58 new cases; decisions D-P5-1 to D-P5-7 |
| 6 Dependencies and security | `APR-JE-034` | `APR-JE-035` | `2ae78d6` (35) | `c20cc8b` (36) | 17 development advisories re-measured (all inside one tool, none reachable) with a clean replacement path; licence review; Actions and Node compatibility; SBOM and provenance (349 of 349 signed, 28 attested); the informational supply-chain job; the maintenance policy proposal; decisions D-P6-1 to D-P6-8 |
| 7 Release dry run | `APR-JE-035` | `APR-JE-036` | `6133586` (38) | `10ce2b2` (39) | The real release tool against a synthetic client build: 112 of 112 expected results; the package verifier; findings RG-01 to RG-14; the blocking `check:release-dryrun` |
| 8 Framework extraction | `APR-JE-036` | `APR-JE-037` | `980344e` (40) | `9fa5aa4` (41) | The 254-file classification into 34 components; the 15-specification reconciliation; nine Gate 6 work packages; `check:framework-matrix`; decisions D-P8-1 to D-P8-10 |
| 9 Formal closure | `APR-JE-037` | (the owner, after reviewing this report) | `3327d96` (42: all six jobs) | | This report, the readiness summary, the closure ledger and `npm run gate5:closure` |

Gate 5 never touched the approved visual design: the delivered folder is 23 files (1,977,874 bytes, tree hash `9061a227…`), and `check:regression` compares it with the frozen v0.8 baseline in every full run; the only visual difference is the owner-approved WebKit correction (`APR-JE-029`). No dependency was upgraded, no media was generated, no branch was merged and nothing was deployed.

CI history (`CI.md`): 41 runs of the workflow. Eight were not fully successful, all explained in `CI.md`: runs 1 to 3 (start-up failures of Gates 3 and 4), runs 11, 22 and 30 (cancelled by the workflow's concurrency rule when a later commit was pushed), run 23 (informational jobs failing before the correction), and run 37 (an expected failure: the cross-browser harness refused an unclassified new check, fixed in the next commit). Every closure above rests on a fully successful run, which the verifier checks against `CI.md`.

## 3. The six verifications

Run at the commit that contains this report: `npm run gate5:closure`. Results at the time of writing (all ok):

| # | Verification (the owner's wording) | Result | How it is checked |
|---|---|---|---|
| 1 | All assessment phases have approved closure records | **Yes.** Phases 0 to 8 each have an authorising and a closing record in `docs/JADE_AND_EMBER_APPROVALS.md` (`APR-JE-026` to `037`), a delivering commit that exists and is an ancestor of HEAD, and a successful run recorded in `CI.md` for that commit. Phase 9 has an authorising record and, correctly, no closing record | the approvals log, `git`, `CI.md`, the plan status line |
| 2 | The migration matrix and requirement register are complete | **Yes.** 259 files in 34 components (every file classified exactly once, no stale path); 40 register entries (RG-01 to RG-14 and D-P3 to D-P6); 10 Phase 8 decisions; all 36 bold owner decisions in the approvals log appear in the register; the generated Markdown is current | `check:framework-matrix` (in every full and fast `verify`) |
| 3 | All unresolved findings and production release blockers remain visible | **Yes.** RG-01 to RG-14: 14 of 14 open, none marked fixed; `findings.json`: 7 open (F-G2-01, F-G3-01, F-G4-01, F-G5-01, F-G5-05 Minor; F-G5-02, F-G5-03 Info; none Blocker or Major); 18 hosting risks listed; 14 production release blockers each with who resolves it; the repository evaluated as a client-production release is blocked by 11 of 16 requirements on a clean, verified tree (13 while this branch is uncommitted, because `cleanTree` and `verifyPassed` join) | the matrix, `findings.json`, the hosting risk register, the real release gate |
| 4 | The master framework repository is still unchanged | **Yes.** `authority.json` records `modifiedByThisProject: false`; the pin `d2803c0` and `main` `f05f41f`, recorded in `authority.json` since Gate 1, still equal the branch tips read from the GitHub API on 2026-10-11 (the other four of its six branch tips are recorded now so that any later change is visible; the two newest commits on the search-standard branch, 2026-10-10, are by the owner's account); its only two pull requests date from 2026-09-23 and were not opened by Gate 5; the local read-only clone has a clean working tree at its original HEAD `f2a03dc`; no framework file exists in this repository | `authority.json`, the recorded API reads, `git status` in the clone |
| 5 | No deployment, merge or release approval has been implied | **Yes.** 0 approval records of type release, deployment, rights verification or search review; 0 evidence records; `VERSION.json` is `0.9.0-dev` on the demonstration channel; 0 merge commits since `origin/main`, HEAD not on `origin/main`; no pull request exists in this repository; no `release/` or `host/` folder; the workflow is read-only with no environment, secret, token, privileged or scheduled trigger and the dry run scanned the tools for deploy commands and write requests | the approvals log, evidence folder, `git`, the workflow, `check:release-dryrun` |
| 6 | The Gate 6 work packages are consistent with the approved decisions | **Yes**, after two corrections made in this phase (section 5). Each of D-P8-1 to D-P8-10 names the work packages it affects and the terms they must contain, and the verifier fails if a package does not say what its decision requires; the eight Gate 6 priorities each belong to a package that lists them; G6-1 has not started (workflow, lockfile and devDependencies identical to the Phase 6 code commit; D-P6-1, 2, 3 and 6 still recorded as not implemented) | the matrix `decisions`, `workPackages` and `priorities` |

## 4. The owner's decisions of Phase 8, as recorded

Recorded in `APR-JE-037`. **How I read the instruction:** "Record owner decisions D-P8-1 through D-P8-10, with these clarifications" as *the recommendations of the Phase 8 report are approved, as modified by the clarifications*. Where a recommendation was "the owner names or decides", the clarification supplies the answer. **Please correct this reading if it is wrong.**

| ID | Recorded decision | From |
|---|---|---|
| D-P8-1 | The master framework repository owns the reusable engineering (option A). Modifying it still needs your explicit approval; it is unmodified | clarification 1 |
| D-P8-2 | Consumers use pinned Git revisions (no npm package) | clarification 2 |
| D-P8-3 | The structured-approval and engineering-identifier extensions are approved **for design only** (no edit to the frozen specifications, no implementation) | clarification 3 |
| D-P8-4 | (a) Deterministic static HTML/CSS/JS generation is permitted; Lovable is optional, not exclusive. (b) Anthropic Frontend Design is the sole creative authority; STS engineering enforces technical standards and does not dictate aesthetics | clarifications 4, 5 |
| D-P8-5 | The nine work packages are accepted as proposed | acceptance |
| D-P8-6 | G6-1 approved in principle; **not started** until you have reviewed this report | your instruction |
| D-P8-7 | The validation ladder stands. MONOLITH House & Design is POC #2: a fictional five-page luxury residential architecture/design-build website targeted for Vercel, beginning after framework integration | clarification 7 |
| D-P8-8 | GitHub Actions is the foundation of centralised maintenance and security; nothing is installed on client hosts. Your confirmation of the GitHub-side settings is **not yet recorded** (OI-3) | clarification 8 |
| D-P8-9 | The same base engineering across Essential, Premium and Cinematic. The Phase 8 recommendation to key check strictness by tier is **superseded** (OI-2) | clarification 6 |
| D-P8-10 | Claude implements; ChatGPT reviews evidence and architecture; you authorise releases; automated verification stays independently reproducible | clarification 9 |

## 5. Things found while verifying, and what was done about them

1. **A reconciliation gap, corrected.** The Phase 8 reconciliation covered the 15 frozen specifications on `main` and said other branches were not enumerated. They have now been enumerated (six branches, read only). One holds a **proposed search-readiness standard** (`feature/sts-core-ai-search-readiness`, tip `08af1a0`). It is the document that names the three offerings (Essential, Premium, Cinematic) and says all receive the same CORE checks, which is your clarification 6. This project audited itself against it in Phase 4, but Phase 8 did not reconcile it. The addendum is in `FRAMEWORK-RECONCILIATION-GATE5.md` section 5. Two framework housekeeping points result (OI-5): two documents are numbered 11, and the standard's delivery clause names Cloudflare Pages although MONOLITH targets Vercel.
2. **A consistency correction.** My Phase 8 recommendation to adopt specification 13's tiers "as the key for check strictness" conflicts with a single base engineering across the offerings. It is withdrawn: tiers may key only declared additions and budgets. The work-package text now carries this (G6-0).
3. **Two work packages now say more.** G6-4 must deliver the Vercel adapter (with re-verified provider documentation) before MONOLITH starts; G6-8 states that POC #2 is fictional and so uses the demonstration channel, not client production.
4. **The fourteen measured gate findings are unchanged.** Nothing in Phase 9 closes or hides RG-01 to RG-14.

## 6. What stays open (nothing is hidden)

| Kind | Items | Where listed |
|---|---|---|
| Release-gate findings | RG-01 to RG-14, all open (approval/CI binding cannot be satisfied in the repository; keyword-matched approvals; unauthenticated verification report; stale asset manifest; missing external-link, media-rights, security, SBOM, hosting requirements; self-declared demonstration label; forgeable package) | matrix section 5; `RELEASE-DRYRUN-GATE5.md` |
| Production release blockers | RB-01 to RB-14: a release approval; rights verification against dated authoritative terms; a person's search review; a person re-reading the crawler documentation; iPhone and Android testing (0 records); NVDA, VoiceOver and TalkBack passes (0 records); manual desktop browser passes (0 records); a stable version, production domain and real client content; release model v2; external-link, security and dependency requirements; hosting requirements and a live check; CI-evidence provenance; a pinned Framework Release | matrix section 6 |
| Approved, not implemented | D-P3-1 to D-P3-4, D-P4-1 to D-P4-3, D-P4-5, D-P5-1, D-P5-3, D-P5-4, D-P5-6, D-P6-2, D-P6-4, D-P6-5, D-P6-6 (16); conditional or deferred: D-P6-1, D-P6-3, D-P6-7, D-P6-8; needing a person: D-P3-6, D-P5-5; the eight Gate 6 priorities | matrix sections 4 and 5 |
| Prohibitions in force | no preview or production deployment (D-P3-5); no public demonstration deployment while media-use rights are unverified (D-P5-7); no Gate 6 start; no framework-repository change; no dependency update | `APR-JE-037` |
| Findings in the project register | F-G2-01, F-G3-01, F-G4-01, F-G5-01, F-G5-05 (Minor); F-G5-02, F-G5-03 (Info) | `findings.json` |
| Hosting | 18 risks HR-01 to HR-18; 15 matrix rows needing implementation, 42 needing live verification | `hosting/` |
| Open items for you | OI-1 visual packages under a sole creative authority; OI-2 offerings versus tiers; OI-3 GitHub settings confirmation; OI-4 MONOLITH details; OI-5 framework housekeeping; OI-6 any Vercel preview authorisation; OI-7 the reviewer evidence bundle | matrix section 9 |

## 7. What Gate 5 does not establish

- It does not show that any real device, browser, screen reader or user can use the site: all browser results are automated engines (Chromium 141 locally, Chromium 156, Firefox 157.0 and WebKit 27.2 on GitHub runners). WebKit here is Playwright's build, not Safari.
- It does not establish any media right, licence, font notice correction or provider-terms compliance.
- It does not establish how Cloudflare Pages or Vercel behave live; the hosting facts are search summaries and simulations.
- It does not establish that the release gate can be passed, or that it cannot be forged (RG-01 to RG-14).
- The synthetic evidence of the dry run exists only inside a deleted temporary folder and is not evidence of anything.
- It does not prove the framework can be reused: no second project has run on it.
- Verification environments differ (Chromium 141 locally, 156 on CI); the reports record both, and CI is the authority.

## 8. Reproducing and reviewing (OP-5)

For a reviewer who is not the implementer (D-P8-10), each claim above is reproducible from the repository and its CI:
- `npm run gate5:closure`: the six verifications.
- `npm run verify` (full) or the `verify` CI job: 39 checks; `npm run verify:fast`: 22.
- `npm run check:framework-matrix`, `npm run check:release-dryrun`, `npm run release:gate`, `npm run release:verify-package`.
- CI: each run is listed in `CI.md` with its URL fragment; the GitHub API gives the job list for each.
- The framework repository facts: `git ls-tree` and `git show` on the pinned commit; the GitHub read API for the branch tips (recorded in `gate5-closure.json`).
The reviewer evidence bundle for ChatGPT's review (what is handed over, and how independence is evidenced) is open item OI-7 and is the first task of G6-0.

## 9. What I ask the owner to decide

1. Close Gate 5 as an engineering closure (section 1), or state another definition.
2. Confirm or correct my reading of the Phase 8 decisions (section 4).
3. Provide the answers to OI-1 to OI-7 when convenient (none blocks G6-1).
4. State when G6-1 may start (D-P8-6 requires your review of this report first).
