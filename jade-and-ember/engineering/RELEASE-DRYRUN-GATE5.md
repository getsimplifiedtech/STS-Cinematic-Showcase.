# Gate 5 Phase 7: release readiness dry run (`APR-JE-035`)

> **G6-2 update (2026-10-11, `APR-JE-039`).** The model this dry run measured (Markdown rows, `HEAD` binding, a hand-writable report) was replaced in G6-2; findings RG-01 and RG-04 to RG-09 and RG-13 are now blocked by scenarios of the rebuilt dry run (`G6-2-REPORT.md` gives the before-and-after result for each). RG-02, RG-03, RG-10 to RG-12 belong to G6-3 and G6-4, and RG-14 stays open pending the owner's decision on signing or attestation. The text below is the Phase 7 measurement as delivered.

**Status: delivered for owner review.** Nothing was deployed, published, merged or approved. No release policy, gate rule, workflow, dependency, page, style, font or media file changed. The framework repository was not touched. The tooling added is a test harness and a read-only package verifier; the release tool itself (`engineering/tools/release.mjs`), its gate (`lib/release.mjs`), the release policy, the workflow, the lockfile and every delivered file are unchanged since Phase 4 / `c20cc8b` (`git diff` is empty); `package.json` gained two script lines (`check:release-dryrun`, `release:verify-package`).

## 1. Result in brief

| | |
|---|---|
| Verified commit | `6133586` (Phase 7 code). **Actions run 38: all six jobs passed** (Chromium `verify` 38 of 38 checks, step 13 min 45 s; Firefox 9 min 10 s; WebKit 8 min 35 s; macOS fast 14 s; external links 4 s; supply chain report 5 s). Local full `npm run verify` on a clean tree at the same commit: **38 of 38**. Run 37 (`0931347`) failed once, correctly: `check:selftest-gate5` refused the new check because it was not yet classified for the cross-browser matrix; fixed in `6133586` |
| Release dry run (synthetic build, real tool) | **112 of 112 scenarios behaved as expected**: success path 1, approvals 15, verification report 7, working tree 3, configuration 23, evidence 26, environment 7, ledger 1, package 16, deployment safety 10, separation 3 |
| Real demonstration, real tool | `release:gate` **ALLOWED** (demonstration channel, 6 of 6 requirements, clean tree, full verification for the commit); `release:prepare` wrote `jade-and-ember-v0.9-preview.zip` (1,905,449 bytes), `release-manifest.json`, `SHA256SUMS.txt`, `host/`; `release:verify-package` **passed 11 of 11**; a second `prepare` was **byte-identical**; the folder was deleted afterwards |
| The same repository as a client-production release today | **BLOCKED by 11 requirements** (section 4.3). The configuration is not changed to test this |
| Fail-open findings | **14**, RG-01 to RG-14 (section 6). The most serious: the approval and the CI record cannot be bound to a commit from inside the repository (RG-01), approvals are matched by keywords and cannot say "rejected" (RG-04 to RG-07), and external links, media-rights binding, security remediation and the hosting requirements are not release requirements yet (RG-02, RG-03, RG-10 to RG-12) |
| Deployment | **No path exists**: no workflow permission, trigger, action, secret, tool or library can deploy, publish, push or write to a remote system (10 checks, section 5) |
| Real records | The real approvals log, the real evidence folder (0 records), the working tree and the (absent) `release/` folder were proven unchanged by the dry run |

## 2. What was run, and what is synthetic

**Real, against the fictional demonstration** (`6133586`, clean tree): `npm run verify` (38 checks), `release:gate`, `release:gate --channel client-production` (refused), `release:search-digest`, `release:manifest`, `release:prepare`, `release:verify-package`, `sha256sum -c`, a second `prepare`.

**Synthetic, in a throwaway copy** (`engineering/lib/release-dryrun.mjs`): a temporary folder holding a copy of the project and its own git repository. A client configuration is made from the demonstration's with the same edits the project's own client fixture uses, version 1.0.0, a stand-in production domain, then every dry-run record is written **inside that folder only**. The **real** `engineering/tools/release.mjs` (and its approvals parser, evidence validator, git calls and build) is then run there as a subprocess. The folder is deleted when the check ends. Nothing in it is ever copied back.

What the synthetic world contains, and how it is kept apart from real records:

| Synthetic item | Where | How it is marked |
|---|---|---|
| Release-approval, rights-verification and search-review rows (`REL-JE-901`, `RIGHTS-JE-901`, `SRCH-JE-901`) | the sandbox's copy of the approvals log | every Decision starts `SYNTHETIC DRY-RUN FIXTURE (not an approval, not evidence)` |
| Nine evidence records (iPhone, Android, NVDA, VoiceOver, TalkBack, desktop Chrome, Firefox and Safari, CI run) | the sandbox's evidence folder | tester `Dry-run Persona`, role `synthetic dry-run persona (not a person)`, every result note starts `SYNTHETIC.`, the CI URL is a non-existent repository, the package field says no package was tested |
| A verification report | the sandbox's `.reports/verify.json` | one result entry saying no check ran |
| A crawler review marked person-confirmed | the sandbox's copy of the record | carries a `dryRunNote` saying the harness set it |

The validator's own rule that a tester must look like a person (not a tool, bot or fixture) is deliberately **not** bypassed: the persona name passes it, and the first line of every record says what it is. These records are not evidence of anything. No person, device, screen reader, licence, run or review stands behind them, and **none of the unavailable physical testing, licensing reviews or live hosting checks was performed or claimed**.

Separation is checked, not assumed: `check:release-dryrun` hashes the real approvals log and evidence folder and records the working-tree status before and after; it fails if anything changed or if any synthetic marker (`Dry-run Persona`, `SYNTHETIC DRY-RUN FIXTURE`, `JE-901`) appears in a real record.

## 3. The release dry run: pass/fail

All 112 scenarios behaved as written down in advance. Each scenario damages the fully green synthetic build in **exactly one way** and states which requirement must fail; a scenario fails if the requirement does not block, if an unrelated requirement blocks, or if the message does not say what is wrong.

| Group | Scenarios | What they cover |
|---|---|---|
| Success path | 1 | The fully approved synthetic build passes the real gate (16 of 16 client-production requirements) |
| Approvals | 15 | No release approval; wrong commit, shortened commit, wrong version, wrong channel; a row with a missing cell; no rights verification, no source named, no date; a required gate approval (APR-JE-017) removed; no search review, wrong digest, no reviewer, no crawler policy named, no structured data named |
| Verification report | 7 | None; fast (partial); failed; another commit; different bytes; run on a dirty tree; corrupt (the tool stops: exit 2 with a stack trace, fail-closed but unfriendly) |
| Working tree | 3 | An untracked file; an uncommitted edit to a delivered file after testing; a committed edit after sign-off with nothing re-recorded (invalidates the verification, the release approval, three evidence types and the CI record at once) |
| Configuration | 23 | Open Blocker, Major, unknown severity; pre-release version; version files disagree; client labelled as demonstration; flag left on (the build refuses); indexing off (the build refuses, or the gate does); structured data off; staging domain, `.test` domain, `staging.` label, `localhost`, IP address; no hosting target; no crawler policy; no AI-search decision; crawler identities not re-read by a person; crawler review older than 180 days; crawler record deleted; a configuration that does not build; demonstration copy put back (the build refuses) |
| Evidence | 26 | Each of the nine records removed alone; emulation offered as a device (E1 as E3); E2 offered as E3; different bytes; unknown commit; unfilled template; incomplete result; unsigned; tester is a tool; future date; a failed test; attachment missing, changed after hashing, or reused by two records; unreadable record; CI record for another commit, not successful, or with no GitHub URL |
| Environment | 7 | `--channel demonstration` on a client build is refused by `gate`, `prepare` and `manifest`; an unknown command exits 2; a deployment approval is only reported and unblocks nothing; `prepare` on a blocked build writes nothing |
| Ledger | 1 | The documented in-repository flow cannot reach a green gate (finding RG-01) |
| Package | 16 | Prepare verifies and is reproducible; one ZIP byte flipped; manifest edited; a checksum line deleted or added; host files edited or missing; ZIP replaced; manifest records a blocked gate or a dirty tree; a script added; an out-of-place file added; a path escaping the folder; plus the forgery probe (RG-14) |
| Deployment safety | 10 | Section 5 |
| Separation | 3 | Section 2 |

**Approval-record binding** is exact for the release approval (channel, version and the full 40-hex commit; a shortened commit, another version or another channel is rejected) and for the search review (the digest of the generated search files). Human evidence binds to the delivered bytes (the assets tree hash) and to the commit or an ancestor of it; the CI record binds to the exact commit.

**Artifact integrity and manifest consistency** (`lib/release-package.mjs`, `npm run release:verify-package`): the package is unpacked and every claim in the manifest is recomputed from the ZIP's own bytes: the two hashes in `SHA256SUMS.txt`; the manifest against its schema under two validators; the ZIP's size and SHA-256 against the manifest; the file list (nothing outside pages, shared assets, fonts, media, search files, `START-HERE.txt`, `serve.py`); the asset tree hash, file count and byte total; the search digest; the Content Security Policy and all three host files against what the delivered pages require; and the gate verdict, clean tree and full verification the manifest records. A package whose manifest records a blocked gate, a dirty tree, or an asset tree other than the ZIP's is rejected.

## 4. Confirmed release-gate behaviour

### 4.1 Fail-closed (verified with the real tool)
- The **channel comes from the configuration** (`flags.demo` and `seo.noindex`), never from a label. A client build cannot be released as a demonstration; a mismatched `--channel` is refused by `gate`, `prepare` and `manifest`.
- A **blocked build writes nothing** (`prepare` exits 1, "NOT PREPARED", no folder). A broken input (corrupt report, deleted crawler record, a configuration that does not build) stops the tool with a non-zero exit, never an `ALLOWED`.
- **Device, screen-reader, browser-matrix and CI evidence cannot pass silently**: nothing, a template, emulation, a desktop record offered as a device, a bot, an unsigned record, a failed test, a missing or altered attachment, bytes that changed after testing, or another commit each block. In the real repository there are **0 evidence records**, so all four are unmet.
- **Search approval and crawler review cannot pass silently**: the review row must name who reviewed, the facts, the structured data and the crawler policy, and carry the digest of the current search files; the crawler record must be marked as re-read by a person and be no more than 180 days old. Today `confirmedByPerson` is `false`.
- A **change after sign-off invalidates everything bound to the old build** (verification report, release approval, three evidence types, CI record).
- The build itself refuses several unsafe configurations before the gate sees them: demo flag on with indexing on, structured data with indexing off, `localhost`, leftover demonstration wording in an indexable build.
- The package verifier rejects every tampering that leaves the package inconsistent.

### 4.2 Environment restrictions
Reserved, example, local, IP and staging-style addresses are refused as a production domain (the `pages.dev`, `.test`, `staging.`, `localhost` and IP scenarios); a `release-approval` for the demonstration channel does not count for client-production. The demonstration must stay noindex, and the generated host files carry `X-Robots-Tag: noindex, nofollow` for it.

### 4.3 The real repository as a client-production release today
Evaluated read-only on the real state (`6133586`, configuration unchanged): **11 of 16 requirements unmet**.

| Requirement | Today | Why |
|---|---|---|
| `stableVersion` | FAIL | version is `0.9.0-dev` |
| `releaseApproval` | FAIL | no release-approval record exists (none may be written) |
| `rightsVerification` | FAIL | no rights-verification record; media rights unverified |
| `evidence:real-device` | FAIL | 0 records (no iPhone or Android test was done) |
| `evidence:screen-reader` | FAIL | 0 records (no NVDA, VoiceOver or TalkBack pass was done) |
| `evidence:browser-matrix` | FAIL | 0 records (no manual desktop Chrome, Firefox, Safari pass) |
| `evidence:ci-run` | FAIL | 0 records (and see RG-01: it cannot be satisfied in the repository) |
| `noDemoText` | FAIL | `flags.demo` is on |
| `productionSeoComplete` | FAIL | indexing, canonical URLs, structured data not configured |
| `productionDomain` | FAIL | `seo.baseUrl` is not set |
| `searchReadiness` | FAIL | no `seo.host`, no crawler decisions, no search files, no search review, crawler identities not re-read by a person |
| `cleanTree`, `verifyPassed`, `noBlockingFindings`, `requiredApprovalsPresent`, `versionConsistent` | ok | |

## 5. The workflow cannot authorise a deployment

Checked by `check:release-dryrun` (section "deployment"), in addition to `check:ci`:
1. Triggers are `push`, `pull_request` and `workflow_dispatch` only (no `pull_request_target`, `workflow_run`, `schedule`, `release`).
2. Permissions are `contents: read` at the top and on every job.
3. No `environment:`, no `secrets.`, no `GITHUB_TOKEN`, no `id-token`, no `deployments`.
4. The only actions are `actions/checkout` and `actions/setup-node`, each pinned to a full commit.
5. No `run:` block or `uses:` line contains a deploy, publish, push, tag, upload or release command.
6. No engineering tool or library starts a deploy, upload or network-client program (78 files scanned).
7. No engineering code sends a POST, PUT, PATCH or DELETE request.
8. Code that can open a network connection is only the external-link verifier (GET/HEAD), the local test server and the local search probes.
9. `deploymentApproved` is produced by the gate and only printed or recorded; a deployment approval for the exact commit is reported and unblocks nothing (dry run: with every requirement met the gate says `allowed`, with one missing it stays blocked).
10. `release/policy.json` states that no tool deploys, and no channel's `allows` list names a deploy, publish or upload.

## 6. Fail-open and fail-closed findings (measured, not asserted)

"Open" means the gate **allowed** something it arguably should refuse. Each is measured by `check:release-dryrun` (probes never fail the check; they record behaviour). None of them is exploitable today because no client-production build exists, no deployment path exists, and the demonstration channel cannot be deployed (D-P5-7).

| ID | What the gate does | Why it matters | Gate 6 change |
|---|---|---|---|
| **RG-01** | **The release approval and the CI record cannot be bound to a commit from inside the repository.** The gate needs both to name the exact HEAD commit, yet both are files in the repository (the approvals log, the evidence folder). Recording them makes a new commit, so they name the previous one. Measured: with the approval, all evidence and a report for the new HEAD committed, the gate still blocks on `releaseApproval` and `evidence:ci-run`. The only way the dry run could reach green was to keep the ledger and the CI record out of git's tracked files | Fail-closed beyond use: **no client-production release can ever pass as the process is documented** | Change the binding (decision D-P7-1) |
| RG-02 | No external-link verification of any kind is required (registry and record deleted: still `ALLOWED`) | D-P5-1 is approved, not implemented | Implement `externalLinks` |
| RG-03 | A rights-verification row passes while the media inventory lists 12 assets (8 unverified, 4 licence text shipped, 0 verified); the row names no asset and no digest | D-P5-4 is approved, not implemented | Bind the row to the inventory digest |
| RG-04 | A release-approval row saying the owner **REJECTED** the release (it still carries channel, version and commit) counts as approval | Approvals are matched by keywords; there is no way to say rejected, revoked or superseded | Structured approval records with a status (D-P7-2) |
| RG-05 | A rights row saying "**NOT** verified by ..." counts | same | same |
| RG-06 | A release-approval whose Type column says `release-approval (REVOKED)` counts | same | same |
| RG-07 | A search-review row saying "**NOT** reviewed by ..." counts | same | same |
| RG-08 | A verification report with no check results at all (hand-written) satisfies `verifyPassed` | The gate trusts a local, unsigned, gitignored file; the dry run itself had to write one | Completeness and provenance rules (D-P7-3) |
| RG-09 | A stale `assets.manifest.json` (from another build) does not block; `prepare` succeeds; the manifest records `manifestMatches: false`; **only the package verifier catches it** | The gate has no requirement on it | Make the match a gate requirement |
| RG-10 | An empty accepted-advisory list (an advisory nobody accepted) does not block; the gate never looks at dependencies. The only link is the full verification report, which a hand-written report can fake | Security remediation is not a release requirement (D-P6-1, D-P6-7 are targets only) | Security requirement set |
| RG-11 | No SBOM, provenance, pinned-action or Node-runtime requirement exists | D-P6-2, D-P6-3, D-P6-5 approved, not implemented | Implement |
| RG-12 | No real-404 requirement and no HSTS default: the built site has no `404.html`; the generated `_headers` contains `includeSubDomains`; **0** release requirements mention a 404, HSTS or hosting | D-P3-1, D-P3-4 | Hosting requirements |
| RG-13 | Client-style content labelled a demonstration (demo flag on, noindex on) is `ALLOWED`, prepared and verifies. The demonstration channel has 6 requirements and none asks whether the content is fictional | By design the demonstration is light, and it must stay noindex and say it is fictional; but the label is self-declared | Decision D-P7-6 |
| RG-14 | A **complete forgery** (a delivered file changed, and the manifest, package hash and checksums rewritten to match) **verifies**. The checksums sit beside the files they protect and nothing is signed or anchored elsewhere | The verifier proves consistency, not authorship | Signing or attestation in a separate release workflow (D-P7-5) |

Smaller observations, not separate findings:
- **`noDemoText` can never fail on its own** through the real tool (`buildOk` is always true there; demo-flag-on with indexing on is refused by the build, and demo-on with noindex-on is the demonstration channel). It is defence in depth only, and does not scan the output for demonstration wording; the build's own validation does that work.
- **Production-domain denylist is incomplete**: of 27 sample hosts, these preview, staging or default domains are **not** recognised as reserved: `netlify.com`, `azurestaticapps.net`, `cloudfront.net`, `s3-website-*.amazonaws.com`, `appspot.com`, `repl.co`, `wixsite.com`, `webflow.io`, `framer.website`, `lovable.app`, `up.railway.app`, `pythonanywhere.com` (list in the check's report). A heuristic cannot be complete; the safe design is a positive confirmation (D-P7-4).
- **Error handling**: a corrupt verification report or a deleted crawler record stops the tool with a stack trace and exit 2. Fail-closed, but not a clear message.
- **The package's `host/` files are not covered by `SHA256SUMS.txt`** (only the manifest and the ZIP are); the verifier compensates by regenerating them from the delivered pages.
- **The verifier covers the release package, not what a provider serves.** Comparing deployed bytes with the bundle (D-P3-3, live checklist C-07) is still a Gate 6 item and needs a separately authorised preview.

## 7. Hosting limitations, the 404 requirement and the HSTS deviation

Reviewed against the Phase 3 documents; the dry run adds measurements, not new provider facts (provider documentation is still not re-verified: D-P3-6).

| Item | Status |
|---|---|
| Proper 404 (D-P3-1, HR-01) | **Open requirement.** Measured: the built site has no `404.html`; on Cloudflare Pages an unknown path would answer the home page with 200. No release requirement and no bundle check exists (RG-12). A 404 page is a design-approved change (VP-3 not approved) |
| HSTS `includeSubDomains` (D-P3-4, D-P4-5, HR-09) | **Known deviation, still present.** Measured: the generated `_headers` contains `includeSubDomains`. No client is deployed, so nothing is exposed. The per-client opt-in is a Gate 6 change in the hosting-adapter integration |
| Base URL with a path for an indexable build (D-P3-2) | Documented; refused only as a warning today (Gate 6) |
| Staged-bundle manifest and deployed-bytes comparison (D-P3-3) | Not implemented; C-07 is a procedure |
| Hosting matrix (54 rows) | 15 rows still need Gate 6 implementation, 42 need live-host verification, 9 are closed by tests or documentation. All 18 risks HR-01 to HR-18 are open |
| Live deployment checklist (17 items) | A procedure only; no preview is authorised (D-P3-5). **Nothing about a live host was verified** |

## 8. Release requirements still missing or unmet

**Unmet by people (cannot be supplied by engineering):** a release approval for the exact build; rights verification against dated authoritative terms (D-P5-5, D-P5-7); a person's search review; a person re-reading the crawler documentation; iPhone and Android testing; NVDA, VoiceOver and TalkBack passes; manual desktop Chrome, Firefox and Safari passes; a stable `x.y.z` version; the production domain; a decision on the accepted advisories; live-host verification; provider-documentation re-verification.

**Missing from the gate (engineering, Gate 6):**

| # | Requirement | From | Gap |
|---|---|---|---|
| 1 | Approval/evidence binding that can be satisfied | this phase | RG-01 |
| 2 | Structured approval records with a status | this phase | RG-04 to RG-07 |
| 3 | Verification report completeness and provenance | this phase | RG-08 |
| 4 | `externalLinks` | D-P5-1 | RG-02 |
| 5 | Rights approval bound to the inventory digest | D-P5-4 | RG-03 |
| 6 | Asset manifest match as a requirement | this phase | RG-09 |
| 7 | Advisory, SBOM, provenance, Actions and Node requirements | D-P6-1/2/3/5/7 | RG-10, RG-11 |
| 8 | Real 404, HSTS default, base-URL path refusal, staged-bundle manifest | D-P3-1/2/3/4 | RG-12 |
| 9 | Positive production-domain confirmation | this phase | domain list |
| 10 | Package authenticity | this phase | RG-14 |
| 11 | Clearer messages for broken inputs; `noDemoText` that scans output | this phase | observations |

## 9. What belongs in Gate 6, and what does not

| Gate 6 (hosting and release hardening) | Later or never |
|---|---|
| Items 1 to 11 above | Framework extraction (Phase 8 assessment; the mechanism-versus-fact split is in `SECURITY-DEPENDENCY-POLICY-PROPOSAL.md` section 3) |
| Hosting adapters (Cloudflare, Vercel, static), the 404 and HSTS changes, the staged-bundle manifest | Real-device and screen-reader testing (people) |
| The composite SBOM and security requirements (D-P6-5) | Provider terms and licensing (people) |
| The Actions and Node migration (D-P6-2, D-P6-3) | A preview deployment (needs its own authorisation, D-P3-5) |
| Dependency-update automation (D-P6-4) and the direct-Lighthouse replacement (D-P6-1) | The `www` credit-link and Noto notice corrections (D-P5-3, D-P5-6: pages and fonts, approved, own authorisation) |

## 10. Decisions needed (owner)

| # | Decision | Recommendation |
|---|---|---|
| D-P7-1 | **How a release approval and a CI record bind to a build** (RG-01). A: bind to the content (assets tree, configuration digest, policy digest) instead of the commit. B: release from a tag, with the ledger in a separate record. C: bind to a *candidate commit* and accept a HEAD whose difference from it touches only the approvals log and the evidence folder | **C** (smallest change, keeps the exact-commit meaning, verifiable with one `git diff`); A for human evidence stays as is |
| D-P7-2 | Replace keyword-matched approval rows with a structured record that has a status (`approved`, `rejected`, `revoked`, `superseded`) | Yes |
| D-P7-3 | Verification report rule for client-production: every check the current `verify` defines must be present, plus a CI-run record that names the report's hash. Signing is not proposed | Yes |
| D-P7-4 | Production domain: the release approval carries `domain: <host>` equal to `seo.baseUrl`'s host (positive confirmation), alongside the denylist | Yes |
| D-P7-5 | Package authenticity: signing or attestation, only in a separate, owner-approved release workflow (as the policy proposal already requires) | Defer to the Gate 6 design; decide there |
| D-P7-6 | The demonstration channel stays light by design; accept RG-13 as documented, or add a rule that its content must carry the demonstration marker | Accept and document |
| D-P7-7 | Scope of Gate 6: items 1 to 11 of section 8, in this order: binding and approval model (1, 2, 3), then the gate requirements already approved (4, 5, 6, 7, 8), then adapters | Approve the order |
| D-P7-8 | Keep `check:release-dryrun` in the blocking `verify` job (about 1 minute) and in the full local run, outside `verify:fast` | Yes |
| D-P7-9 | Authorise Phase 8 (framework extraction assessment, document only) | Yes, when you have reviewed this phase |

## 11. Limits of this dry run

- The synthetic build is derived from the demonstration's configuration; it proves the machinery, not any real client's content, domain, facts or business data.
- The verification report in the sandbox is hand-written (that is finding RG-08), so the dry run proves what the gate does with a report, not that a full verification passes for the synthetic build. The real full verification passed on the real demonstration (38 of 38).
- The dry run runs on Linux and macOS-compatible code; it uses a symbolic link for `node_modules` and was run on Linux only.
- Probes record behaviour at this commit. They are documentation by measurement: if a Gate 6 change closes one, the probe's output changes and this report is out of date.
- Nothing here says anything about live hosting, real devices, screen readers, licences, or search engines.

## 12. Reproduce

```
npm run check:release-dryrun                 # the whole dry run, about one minute, writes only to a temporary folder
node engineering/checks/release-dryrun.mjs --report out.json   # every scenario and probe as JSON
npm run release:gate && npm run release:prepare && npm run release:verify-package
```
Files: `lib/release-dryrun.mjs` (sandbox), `lib/release-dryrun-scenarios.mjs` (scenarios and probes), `lib/release-package.mjs` (package verifier), `checks/release-dryrun.mjs`, `tools/release-verify-package.mjs`.
