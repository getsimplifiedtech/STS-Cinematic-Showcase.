# G6-2a: release model v2, design and attestation evaluation (`APR-JE-039`)

**Status: the design that G6-2b implements.** The owner authorised G6-2 "according to `GATE-6-IMPLEMENTATION-ORDER.md`" with nine required controls and one rule: *if the trust model requires a design decision that cannot be resolved safely from the approved architecture, stop and present the alternatives before implementing that part.* This document does both. Everything in sections 2 to 11 follows from the approved order (section 2a of G6-2 there) and the nine controls and is implemented. Section 12 is the one part that cannot be resolved from the approved architecture (who is trusted to sign or attest, and with what), so it is **evaluated, not implemented**, and section 13 lists the decisions that need you. Nothing here is an approval of anything, creates a person, or claims evidence that does not exist.

## 1. What was wrong (the findings this design closes)

| Finding | The defect today |
|---|---|
| RG-01 | An approval or CI record must name the exact `HEAD` commit, yet it is a file in the repository: recording it creates a newer commit, so the gate can never pass in the documented flow (measured by the dry run). |
| RG-04 to RG-07 | The gate matches English keywords in a Markdown table row. A row saying `REJECTED`, `NOT verified`, `NOT reviewed`, or a Type of `release-approval (REVOKED)` still counts. |
| RG-08 | A hand-written `verify.json` with `mode: full, passed: true` and the right commit satisfies `verifyPassed`. |
| RG-09 | A stale recorded asset manifest does not block the gate; only the package verifier notices. |
| RG-13 | The demonstration label is self-declared by two flags; client-style content passes as a "demonstration". |
| RG-14 | A fully re-forged package verifies: nothing is signed or anchored. |

## 2. Principles

1. **Bind to what is released, not to where it sits.** One immutable *candidate digest* identifies the artifact. Anything that merely *talks about* the artifact (approvals, evidence, CI records, the verification report) is excluded from the digest, so recording it cannot change it (the hash-domain rule of the master framework's specification 15).
2. **Structured fields, never prose.** A decision is a field with a closed set of values. The gate never searches free text. The `rationale` of a record is read by people and ignored by the gate.
3. **Three independent record families**, each in its own folder with its own validator and its own audit command: *approvals* (what people decided), *evidence* (what was tested and by whom), *deployments* (what may be put where). None can satisfy another's requirement.
4. **Fail closed.** An unreadable record, an unknown status, an unknown reviewer, a missing field or an unparseable date is an error that blocks, never a record that is skipped.
5. **Say what is proved.** The checks prove *consistency and binding*. Without a signature or an external attestation they do not prove *who wrote a record* (section 12). Every report states that.

## 3. The candidate artifact digest (control 1; resolves RG-01)

`candidate = SHA-256( canonical JSON of { schema, channel, version, parts } )`, with the keys sorted and no whitespace. `parts`:

| Part | Source | Why it is part of the artifact |
|---|---|---|
| `delivered` | the tree hash of the delivered files (`buildManifest(site).treeSha256`) | what the visitor receives |
| `configuration` | hash of every `config/*.json` | what the renderer was told |
| `search` | the search-artifact digest (`null` for a demonstration) | what crawlers and AI readers are given |
| `releasePolicy` | SHA-256 of `release/policy.json` | the rules this release is judged by |
| `evidenceSpec` | SHA-256 of `release/evidence-spec.json` | what the human testers were asked to check |
| `securityPolicy` | SHA-256 of `security.json` and of the generated CSP | what the browser enforces |
| `mediaRights` | SHA-256 of `media-rights-inventory.json` | the rights position of every asset |
| `externalDestinations` | SHA-256 of `external-destinations.json` | every off-site link |
| `framework` | the pinned framework commit and the creative-authority hashes (`authority.json`) | the design authority |
| `engines` | `environment.json` (Node baseline, npm, Playwright) and the SHA-256 of the lockfile | the toolchain that verified it |

**Excluded, by rule:** every approval, evidence, deployment and CI record, the reviewer table, the verification report, the Markdown approvals ledger, documents, the git commit, branch, date and cleanliness. A release is therefore *committed, then tested, then approved*: testing and approving add files that are not part of the digest, so the digest, and every record bound to it, stays valid. The `HEAD` commit moves; the digest does not. `commit` stays in records as information ("tested at commit X"), and a record's commit must be a real commit of the repository that is `HEAD` or an ancestor of it.

If anything in the table changes (a pixel, a configuration value, the policy, the lockfile, the Node patch), the digest changes and **every** record for the old digest stops counting. That is deliberate and conservative: it is cheaper to repeat a test than to certify the wrong bytes.

## 4. Records (controls 2, 3; resolves RG-04 to RG-07)

### 4.1 Approval records (`engineering/release/approvals/*.json`)

```json
{
  "schema": "jade-and-ember/approval-record@1",
  "id": "REL-JE-001",
  "type": "release-approval",
  "status": "approved",
  "candidate": "<64 hex>", "channel": "client-production", "version": "1.0.0",
  "subject": { "productionHost": "www.client.example" },
  "decidedBy": { "reviewer": "R-01", "name": "<as in the reviewer table>" },
  "decidedAt": "2026-10-12T09:30:00Z",
  "rationale": "free text for people; never read by the gate",
  "ends": "<id of the record this one revokes or supersedes>"   // only on revoked / superseded
}
```

* `type` is one of `release-approval`, `rights-verification`, `search-review` (G6-3 adds `external-links-review`). The id prefix must match the type (`REL`, `RIGHTS`, `SRCH`).
* `status` is one of `approved`, `rejected`, `revoked`, `superseded`. **No other value exists and nothing is inferred from any other field.**
* `subject` is typed per record type and **bound**: a release approval carries the authorised production host; a search review carries the digest of the search artifacts and the three things reviewed (business facts, structured data, crawler policy); a rights verification carries the sources reviewed and the date.
* `decidedAt` is a UTC date-time, not in the future, and not before the earlier record it ends.
* The file is a *fact about a decision*, not an editable state. To change the outcome, add a new record; do not edit an old one.

### 4.2 The status algebra

For one requirement (a record `type` for the current candidate and channel) the gate:

1. reads every record of that type; **a record that cannot be read or does not validate is itself an error that blocks** (it cannot be told apart from a rejection or revocation that failed to parse);
2. drops records for another candidate, channel or version (history, shown by the audit but not counted);
3. keeps records whose author is **authorised** (section 5) for that action on that date;
4. removes every record ended by an authorised, valid `revoked` or `superseded` record that names it in `ends` (a revocation of a revocation is not allowed: revocation is final; a new approval is a new record);
5. the requirement is met **only if** at least one `approved` record remains and **no `rejected` record remains**. A rejection stays in force until an authorised reviewer supersedes it with a record whose `ends` names it.

Computed per record, and shown by `npm run release:audit`: `in force`, `ended by <id>`, `superseded by <id>`, `not counted: another candidate`, `not counted: unauthorised reviewer`, or `invalid: <reason>`. Text such as "REJECTED" in a rationale has no effect.

### 4.3 Evidence records (`engineering/release/evidence/*.json`, unchanged families, new binding)

The existing human-testing records (real device, screen reader, browser matrix) and the CI-run record keep their completeness, class, tester-is-a-person, attachment and attestation rules (Phase 2). The binding changes from "this commit and this asset tree" to **`build.candidate` equals the candidate digest** (the asset tree check stays, as a second net). A CI-run record is no longer bound to `HEAD`: it carries the candidate digest and the verification summary of section 7.

### 4.4 Deployment authorisation (`engineering/release/deployments/*.json`)

A separate family, same status algebra, `type: deployment-authorisation`, bound to the candidate **and** to the in-force `release-approval` it relies on (`subject.releaseApproval`), and naming the target host. The gate reports it (`deploymentAuthorised`) and nothing acts on it: no tool in this repository deploys. A deployment authorisation does not unblock a build that lacks its release approval (tested).

## 5. Who may decide (control 2)

`engineering/release/reviewers.json`:

```json
{ "schema": "jade-and-ember/reviewers@1", "establishedBy": "APR-JE-0xx",
  "reviewers": [ { "id": "R-01", "name": "...", "role": "owner",
                   "mayApprove": ["release-approval"], "mayReject": [...], "mayRevoke": [...],
                   "validFrom": "2026-10-12", "validTo": null } ] }
```

A record counts only if `decidedBy.reviewer` names an entry whose `name` equals `decidedBy.name`, whose validity window contains `decidedAt`, and whose `mayApprove`, `mayReject` or `mayRevoke` list contains the record type for the action the status represents. A person who may approve a rights verification cannot approve a release; a reviewer whose window ended cannot approve later.

**The table ships empty.** No reviewer is named in this repository: the owner has not named one, and the engineering must not invent a person. With an empty table no client-production release can pass. `establishedBy` must be a governance record that exists in the approvals ledger when the table is non-empty.

**What this does not do (section 12).** The table and the records are files in the repository. Someone who can commit can add a reviewer and a record. The gate proves that the records are well formed, bound to the artifact, in force and made by a *named, authorised* reviewer; it cannot prove that the named person made them. Closing that needs a signature or an external attestation, which is the owner's decision.

## 6. Approving the delivered artifact (control 6)

`release:prepare` copies the in-force approval and evidence records and the reviewer table into the package (`records/`), and the manifest records `candidate.digest`, its parts, and the hash of every embedded record. `release:verify-package` recomputes, **from the ZIP's own bytes**, the delivered tree, the search digest and the CSP; takes the remaining parts from the manifest; recomputes the digest and requires it to equal the one in the manifest; then re-runs the record validation (structure, binding, authorisation, status algebra) on the embedded copies and requires in-force approvals for every type the channel needs. A package whose ZIP is not the approved artifact fails; a package with an approval for a different digest fails; a package with a revoked or rejected record in force fails. The manifest's own claim that "the gate allowed this" is no longer the evidence: the records are.

## 7. Verification evidence (controls 4, 5; resolves RG-08)

`npm run verify` writes a **verification record** (`engineering/.reports/verify.json`, schema `jade-and-ember/verification@1`):

* the candidate digest it verified (so it is bound to the artifact, not to `HEAD`) and the `engineDigest`, the hash of the verifying code itself (every `.mjs` and `.json` under `engineering/` except the record families, reports and documents), so a record made by older code cannot vouch for newer rules;
* `mode`, `passed`, one entry per check with its result and duration, the `registryDigest` (hash of the sorted list of every check id defined in `verify.mjs`), the Node and npm versions, the platform, and where it ran (`local`, or `github-actions` with the run id taken from the runner's environment);
* a `seal`: SHA-256 over all the other fields.

The gate requires: `mode full`; `passed`; the candidate digest equal to this build's; the engine digest equal to the current code's; **every** check the current `verify.mjs` defines present and passing (no `--fast`, no `--no-selftest`); the seal recomputed correctly; a clean tree. A hand-written report fails because it has no check list, no registry digest, no seal and the wrong engine digest. The CI record (4.3) must carry the CI run's summary (candidate, engine digest, registry digest, counts, seal, run id and URL), and the gate cross-checks it with the local record. A reviewer can compare the seal printed at the end of the CI job log with the record.

**Residual (stated, not hidden):** the seal is not a secret. Someone who can edit the repository and understands the format can write a complete, consistent record without running the checks. The measures make that deliberate work instead of a typo, and the CI log gives an independent place to compare against; only a signature or an attestation (section 12) makes it detectable.

## 8. Positive production-domain authorisation (control 7)

The release approval's `subject.productionHost` must equal the host of `seo.baseUrl` in the configuration (which is part of the digest); the host must not be a reserved, example, local, IP or preview/staging address (the existing denylist stays as the second net). No approval names no host; an approval for another host does not count. A change of `baseUrl` changes the digest and so also invalidates the approval.

## 9. Demonstration and client production (control 8; resolves RG-13)

* The channel is still derived from the configuration (a label never decides).
* **A demonstration is accepted only if its configuration is registered** in `release/demonstrations.json` (the configuration hash of an approved fictional demonstration, with the governance record that registered it). Client-style content with `demo` and `noindex` switched on has an unregistered configuration and is refused (`demonstrationRegistered`).
* A demonstration may not carry a production domain (`seo.baseUrl` absent or reserved), may not be indexable, and its package carries a machine-readable marker in the manifest (`demonstration.fictional: true` and the statement) and the visible statement in `START-HERE.txt`; a client package may not carry them. The package verifier checks both directions.
* The delivered files are not touched by any of this: the marker lives in the manifest and the package text, never in a page.
* Registered today: the existing Jade & Ember configuration, recorded by the same governance record that authorised G6-2. That is a registration of a fact (the hash of the configuration the owner has always called the fictional demonstration), not an approval of anything; the owner may reject it in review.

## 10. Independent auditability (the "keep ... independently auditable" rule)

| Family | Folder | Schema / validator | Audit command | Satisfies |
|---|---|---|---|---|
| Approvals | `release/approvals/` | approval-record, `lib/records.mjs` | `npm run release:audit -- approvals` | `releaseApproval`, `rightsVerification`, `searchReadiness` |
| Evidence | `release/evidence/` | evidence@1, `lib/evidence.mjs` | `npm run release:audit -- evidence` | `evidence:*` |
| Deployment | `release/deployments/` | deployment-record, `lib/records.mjs` | `npm run release:audit -- deployments` | `deploymentAuthorised` (reported only) |
| Verification | `.reports/verify.json`, CI summary in an evidence record | verification@1 | `npm run release:audit -- verification` | `verifyPassed` |

`release:audit` is read-only and prints, for every record of a family, whether it is in force and why. The package carries the same families, so a recipient audits them without the repository.

## 11. What stays exactly as it is

The channel rules, the clean-tree rule, the stable-version rule, the open-findings rule, the SEO/search/crawler rules, the 14 findings' text, the dry run's blocking status in CI, the rule that nothing here deploys, and the delivered files (the tree hash `9061a227…` is unchanged). The old Markdown rows (`REL-JE`, `RIGHTS-JE`, `SRCH-JE`, `DEP-JE`) are **no longer read**; a row of those types in the ledger is reported by `check:release` as retired, so no one believes it counts.

## 12. Attestation and signing evaluation (control 6 of the order; P-6) **for the owner's decision**

What is being decided: *how a recipient or an auditor can know who made a record, who built the package, and that nothing was re-forged afterwards.* The approved architecture says to evaluate before finalising and that RG-14 is resolved "only by the owner's decision". The options:

| | (i) Nothing (today, and what 2b delivers) | (ii) Signed git tag on the release commit | (iii) GitHub artifact attestation from a separate release workflow | (iv) Owner-held detached signature over the manifest and record set |
|---|---|---|---|---|
| **What it proves** | Consistency and binding only | The owner's key vouched for the whole repository state at that commit, records and reviewer table included | The package was built by a named workflow of this repository at a commit (build provenance), signed through Sigstore | The owner's key vouched for exactly this manifest, which names the digest and every record |
| **Authorship of a record** | Not proved | Proved for the tagged state (the tag signer) | Not proved (provenance is of the build, not of a human decision) | Proved for the signed set |
| **Tools / dependencies** | none | `git`, plus `gpg` or `ssh-keygen` for verification | A GitHub-run workflow and the `actions/attest` family; the verifier uses `gh attestation verify` or a Sigstore client | Node's built-in `crypto` (Ed25519) or `ssh-keygen -Y`; no package |
| **Permissions the workflow gets** | read only | read only | `id-token: write` and `attestations: write`; **a workflow that holds these is exactly what `check:ci` forbids today** (read-only, two allowed actions): it would be a separate, owner-approved release workflow and a deliberate change of the CI policy | read only |
| **Cost / plan** | none | none | free for public repositories; from search summaries of the GitHub documentation, **private repositories need GitHub Enterprise Cloud** (the sandbox cannot reach docs.github.com, so this was not re-read at the source and the plan of this repository is unknown to me) | none |
| **Verifiable by a recipient offline** | n/a | yes, with the owner's public key | online or with a downloaded trust root | yes, with the owner's public key |
| **Weak point** | anyone with write access can forge a whole consistent record set | key custody; the key list must be obtained out of band | needs plan, workflow and a policy exception; proves the build, not the decisions | key custody; the public key must be published out of band |

**My recommendation, for you to accept or change:** (iv) now, because it is the only option that proves who decided, costs nothing, needs no new tool and no CI permission, and fits the record design (a `signatures` list on the manifest and records, verified against public keys in a table you control); (iii) later, in G6-7 (centralised GitHub automation), as a *build-provenance* layer in a separate release workflow, once the GitHub plan and the documentation have been re-read by a person. (ii) is a cheap additional net (`git tag -s`) if you already sign commits.

**What is deliberately not implemented in 2b:** any signature or attestation. I did not choose the signing scheme, generate a key, create a signer, or add a "required signatures" switch, because each of those is your decision. The record formats leave room (a record may later carry `signatures`), and `RG-14` therefore stays **open**.

## 13. Decisions that need you (nothing below was assumed)

1. **Reviewers.** Who are the authorised reviewers, for which record types, and who may revoke? The table is empty; without it no client release passes. (The owner's own decision; I cannot name people.)
2. **Authenticity (section 12).** Option (i) as delivered, (iv) as recommended, or another; and whether a signed set is then *required* for client production.
3. **Registration of the demonstration** (section 9): confirm that the current Jade & Ember configuration is the registered fictional demonstration (or direct otherwise).
4. **Status of the old ledger rows**: confirmed retired (no real row of those types exists today).
5. **CI evidence stays a record, not a fetch.** The gate stays offline; an auditor can compare the CI run themselves. A tool that queries the GitHub API would be new network code (the dry run allows network code in three files only); say if you want it as a separate, informational tool.

## 14. Test plan (control 9; priority P-8)

Written before the implementation and kept blocking in `check:release-dryrun` (the real release tool, a synthetic client build in a throwaway copy, synthetic reviewers and records that exist only there and say so):

* **One blocking scenario per finding** RG-01, RG-04 to RG-09, RG-13 (RG-14 recorded as a measured, open probe, RG-02/03/10 to 12 remain for G6-3 and G6-4), each failing against the old gate by construction.
* **Records are committed and the gate passes** (the ledger problem solved): the green path commits approvals, evidence and the CI summary and still reaches ALLOWED.
* **Revocation:** a revoked approval; a revocation by an unauthorised person (ignored, approval stays, flagged); a revocation of the wrong candidate; revocation text in the rationale only (no effect); an approval after a revocation (needs a new record); a revocation record that is malformed (blocks).
* **Rejection:** a rejection blocks until superseded by an authorised reviewer; "REJECTED" in prose does not change an approval; a rejection by an unauthorised person is flagged.
* **Forged or incomplete evidence:** a hand-written verification report; a report with a missing, extra or failing check; a stale engine digest; a wrong or recomputed-wrongly seal; a report for another candidate; a fast report; a CI record without a summary, for another candidate, with a mismatched run id, a non-GitHub URL, or whose summary disagrees with the local record; a human evidence record for another candidate; every old evidence defect still blocks.
* **Candidate binding:** a one-byte change to a page, a configuration value, the policy, the search files or the lockfile changes the digest and blocks every old record; committing the records does not change it.
* **Domain:** an approval without a host, for a different host, for a reserved host; a changed `baseUrl`.
* **Channels:** client-style content labelled as a demonstration; a demonstration with a production domain; a demonstration whose registration is missing; a client package with the demonstration marker; a demonstration package without it.
* **Package:** the delivered ZIP not matching the approved digest (even with a consistent manifest); embedded records altered, removed or for another digest; a revoked record embedded.
* **Auditability:** each family is audited on its own; a deployment authorisation does not unblock a release without its approval; a release approval does not imply deployment.
* **Unchanged:** the 112 scenarios of Phase 7 are ported to the new records (their defects are still injected, their expectations still blocking) and the deployment-safety and separation rows stay.
