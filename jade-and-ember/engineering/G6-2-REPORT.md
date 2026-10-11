# G6-2 completion report: release trust and approval model

Status: **implemented, verified locally, awaiting owner review.** Nothing was merged, deployed or published. The master framework repository was not modified. G6-3 was not started. No approval, evidence record, deployment authorisation or reviewer exists or was created; the reviewer table ships empty. The demonstration stays `noindex` and is not approved for deployment or client production.

Authorised by APR-JE-039 (`docs/JADE_AND_EMBER_APPROVALS.md`). The full design, including the attestation evaluation and the decisions that need you, is `G6-2-DESIGN.md`. The supporting runs are in `g6-2-evidence/`.

## 1. Architecture and artifact-binding model

**The candidate artifact digest** (`lib/candidate.mjs`) is one SHA-256 over canonical JSON of what a release *is*: the delivered files, the configuration, the search artifacts, the release and security policies, the evidence specification, the media-rights inventory, the external-destination registry, the framework pin, the toolchain versions, and the two files the ZIP carries besides the site (`serve.py` and the START-HERE template). It deliberately contains nothing about approvals, evidence, CI records, the reviewer table, the verification report, the Markdown ledger, documents, or git (commit, branch, date). Recording a decision therefore cannot change the identity of the thing decided on. That is how the self-invalidating HEAD-commit problem (RG-01) is solved: the old flow had the approval name the commit, and committing the approval moved the commit.

Three independently auditable record families, each with its own folder, schema and audit command (`npm run release:audit`):

| Family | Where | What it records |
|---|---|---|
| Approval records | `engineering/release/approvals/` | release approval, rights verification, search review: `approved`, `rejected`, `revoked`, `superseded`; each bound to a candidate digest, channel and version; made by a reviewer named in `release/reviewers.json` |
| Verification evidence | `.reports/verify.json` written by `npm run verify`; CI summaries and human test records in `engineering/release/evidence/` | a sealed, complete record of every check, bound to the candidate and to the digest of the verifying code; human and CI records bound to the same candidate |
| Deployment authorisation | `engineering/release/deployments/` | a separate decision, reported and never acted on; no tool here deploys |

The gate (`lib/release.mjs`) reads closed fields only; prose in a rationale changes nothing. The package verifier (`lib/release-package.mjs`) recomputes the candidate digest from the ZIP's own bytes and re-judges the embedded records with the same code, so the approved artifact must be the delivered artifact.

## 2. Controls and what changed

| # | Control | How it is met |
|---|---|---|
| 1 | Approvals bound to an immutable candidate digest | the digest above; records name it; committing records does not move it |
| 2 | Structured records, explicit statuses, authorised reviewers, rejection and revocation | `lib/records.mjs`: four statuses; `reviewers.json` with per-type `mayApprove`/`mayReject`/`mayRevoke` and validity windows; a revocation is final and ends only an approval; a rejection stands until superseded by someone who could have rejected; endings that name another candidate or a missing record block |
| 3 | Keyword matching cannot make a rejected or revoked approval valid | the Markdown rows are no longer read at all (`check:release` reports any that remain); prose has no meaning |
| 4 | Complete, verifiable test results tied to the candidate | `lib/verification.mjs`: the record lists all 40 checks, carries the registry digest and the engine digest (covering `src/lib`, `tests`, `tools`, `build.mjs`, `serve.py`, `package.json`, the CI workflow), is bound to the candidate, is a closed schema, and is sealed |
| 5 | Forged or incomplete records cannot satisfy a release | missing, extra, duplicate, failing, stale, partial, edited or other-candidate records are each refused; the CI evidence record must summarise a run of this verifier (engine and registry digests, all checks) of this repository |
| 6 | Artifact integrity; approved equals delivered | the package verifier recomputes the digest from the ZIP, regenerates START-HERE, checks `serve.py`, reads the container strictly, and compares the rules it was judged by with the checkout |
| 7 | Positive production-domain authorisation | a release approval must name the host the delivered pages are for; preview, staging, example, local and IP hosts are refused whatever is approved |
| 8 | Demonstration and client-production separation | the channel comes from the configuration; only a registered fictional demonstration may use the demonstration channel; a demonstration package carries a marker in its manifest and START-HERE and is checked page by page for noindex and no production host; a client package may carry neither |
| 9 | Extended dry run | 253 scenarios, see sections 3 and 4 |

Files: new `lib/candidate.mjs`, `records.mjs`, `verification.mjs`, `strict-json.mjs`, `hosts.mjs`, `search-digest.mjs`, `release-fixtures.mjs`, `release-cases.mjs`, `tools/release-audit.mjs`, `tools/release-record.mjs`, `release/reviewers.json`, `release/demonstrations.json`, `release/approvals/` and `deployments/` READMEs, `G6-2-DESIGN.md`; rewritten `lib/release.mjs`, `release-dryrun.mjs`, `release-dryrun-scenarios.mjs`, `checks/release.mjs`; patched `verify.mjs`, `lib/evidence.mjs`, `release-package.mjs`, `zip.mjs`, `approvals.mjs`, the policy, the evidence specification, the manifest schema (v2) and the documents. No page, style, font, media or client-facing content changed (`src/lib/seo.mjs` is untouched), and the delivered-files tree hash is unchanged.

## 3. Before and after: RG-01 and RG-04 to RG-08 (plus RG-09 and RG-13)

Measured by the same dry run against the G6-1 base (`0d71064`) and this tree (`g6-2-evidence/before-after.md`). All records in these runs are invented personas written inside a throwaway copy.

| Finding | Before (G6-1 base) | After (G6-2) |
|---|---|---|
| **RG-01** approvals name HEAD, which committing them moves | the documented flow could not be completed: BLOCKED by `releaseApproval` and `evidence:ci-run` | records are committed and the gate stays ALLOWED (the digest does not move); 12 blocking scenarios (any change to a delivered file, configuration value, policy, lockfile, `serve.py`, search file) and 4 must-stay-valid scenarios (a document, a ledger row, a second reviewer, prose) |
| **RG-04** a row saying REJECTED still counts | ALLOWED | a rejection blocks; the word in prose does not; a rejection hidden by file placement, case, backup, sub-folder, symlink, git-ignore or a repeated key is refused (13 + 2) |
| **RG-05** "NOT verified" counts as verified | ALLOWED | a structured rights verification is required; prose is inert (2 + 1) |
| **RG-06** "(REVOKED)" counts | ALLOWED | a revocation by an authorised reviewer ends the approval; an unauthorised one blocks until resolved; a revocation of a revocation, of another candidate or of nothing blocks; a new approval after a revocation is a new record (5 + 1) |
| **RG-07** "NOT reviewed" counts | ALLOWED | a structured search review bound to the search digest is required (2 + 1) |
| **RG-08** a hand-written verification report passes | ALLOWED | the old format is refused; incomplete, edited, extra-field, partial, stale-engine, failing or other-candidate records are refused; CI evidence must summarise a run of the same verifier; 17 blocking scenarios. **Residual (open):** a complete, correctly sealed record written without running the checks is accepted: only a signature or attestation can tell it from a real run |
| RG-09 stale asset manifest | passed the gate (the package check caught it later) | `assetManifestCurrent` blocks it |
| RG-13 client content labelled a demonstration | ALLOWED and packaged | refused unless registered; a client package with the marker, or a demonstration with a production host or a missing noindex tag, is refused (14 scenarios) |

## 4. Revocation and forged-evidence negative tests

`g6-2-evidence/negative-tests.md` lists all 253 scenarios with expected and observed results; all behaved as written down in advance. Highlights:

* **Revocation and rejection:** revoked, superseded, rejected, unauthorised and misdated endings; endings of another candidate, of nothing, of an ending; a veto lifted by someone who could not have cast it; invalid timestamps (2026-02-30, 24:00:00, fractions, one hour ahead); array values.
* **Forged or incomplete verification:** a hand-written old-format report; a record edited by hand; with a check removed, added, duplicated, failing or marked passed; a fast run; a record for another candidate or another engine digest; an extra field resealed; a record cut to one check, resealed and summarised in the manifest.
* **Forged evidence:** CI evidence for another candidate, another engine, fewer checks, a failing check, a local runner, a wrong run id, no summary, a run of another repository; a failed human test beside a passing one; a garbage or foreign file in the evidence folder.
* **Package:** a one-byte flip; a replaced ZIP; changed `serve.py` and `START-HERE.txt`; a ZIP with a repeated name, a case collision, a backslash name, trailing bytes, a hidden local entry, a mismatched local header, an executable bit, a bomb; the manifest's gate list emptied or reduced; a changed host; a different reviewer table than the checkout's; a changed ZIP with the manifest's parts and digest recomputed but the embedded records left (refused by the records).

## 5. Independent adversarial review

An independent reviewer attacked the first implementation and found 12 issues (two container, one package-extras and one record-placement gap rated high). All were fixed, each with a scenario or test; the table is `G6-2-DESIGN.md` section 15, which also lists the accepted residuals.

## 6. Full verification and CI

{{VERIFY}}

## 7. Commit

{{COMMIT}}

## 8. Remaining release blockers and open decisions

Release blockers RB-01 to RB-14 are untouched except as stated: **RG-01, 04, 05, 06, 07, 09 and 13 are closed by G6-2; RG-08 is closed except for the authenticity residual; RG-14 (authenticity) is open pending your decision.** Still open and owned by later work packages: RG-02 (external-link verification, G6-3; in the dry-run probe the gate is blocked only because the candidate computation crashes when the registry is deleted, which is not a requirement), RG-03 (rights record not bound to inventory entries, G6-3), RG-10 (advisories as a requirement, G6-3), RG-11 (SBOM/provenance, G6-3), RG-12 (real 404 and HSTS default, G6-4).

Human items that still prevent any client release: no reviewer is named; no release approval, rights verification or search review exists; no real-device, screen-reader, browser-matrix or CI evidence record exists; the version is not stable and no real production domain is set; the business facts are fictional.

**Decisions that need you** (design section 13): (1) who the authorised reviewers are; (2) authenticity: none (as delivered), a detached owner signature (recommended), signed tags, or GitHub artifact attestation in a separate release workflow, and whether a signed set is then required; (3) confirm that the current Jade & Ember configuration is the registered fictional demonstration (`DEMO-JE-001`); (4) the old Markdown rows are confirmed retired (none existed); (5) CI evidence stays a record, not a fetch.

Stopped for owner review. G6-3 has not been started.
