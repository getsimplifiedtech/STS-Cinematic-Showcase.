# G6-3A: Release authentication and provenance (revised for the STS multi-client operating model)

**Revision 2, 2026-10-12, after the owner's operating-model clarification (`APR-JE-042`). Design only: nothing here is implemented, and no GitHub setting, credential, workflow or release control was changed.** Revision 1 (commit `7321d95`) designed a single-project release around an owner-held signing key; it is superseded as the default and kept in section 10 as an optional upgrade. The hard authenticity stop (`lib/authenticity.mjs`) is untouched and the reviewer table is still empty. **It stops here for the owner's review.**

Evidence: [`g6-3a-evidence/`](g6-3a-evidence/README.md). `[Qnn]` is a quotation matched verbatim against an official source (`official-sources.json`); `[Onn]` is a read-only observation (`platform-observations.json`). Anything not established is marked **unverified**. This repository is public, so no private repository name, client name or credential appears here or in the evidence.

## 1. The answer in one page

1. **The operating model changes the design.** STS owns the organisation and keeps one private repository per client; clients buy a service and have no repository, pipeline or hosting access; coding agents implement and test but never approve production; the owner will not run an extra machine, a second GitHub account or a manual signing step by default.
2. **With one GitHub identity, no control inside the client repository can prove the owner decided.** Environments, reviewers, rulesets, branch protection, approval records and attestations all live where a coding session acting as the same account can reach them or edit the rules that govern them. A coding session using `carlito3k` can already initiate runs, alter the workflow, the gate, the policy, the records and the reviewer table [O1 to O6]. The credential's permissions are set by the app, and the owner can change which repositories it reaches but not which permissions it holds [Q38]; the GitHub permission map shows that approving a deployment needs `deployments: write`, dispatching needs `actions: write`, changing environments, rulesets, branch protection or Actions settings needs `administration: write`, and workflow files need `workflows: write` (evidence `permissionMap`). Whether this credential holds those is **unverified**, and it already writes workflow files [O5]. A repository owner, a self-declared record and an account name prove none of the owner's personal decisions.
3. **What does work with one identity is a reachability boundary, not an identity boundary.** A GitHub App user token can reach only repositories that both the installation and the user can access [Q55]. If the thing that authorises a release lives in a **private release-control repository that the coding integration is never given**, a coding session cannot read, dispatch, edit or approve in it, whatever account it acts as. The owner operates it from the GitHub web interface with the existing account (passkey or 2FA recommended): no second account, no extra machine, no signing.
4. **Recommended mechanism (the simplest secure workflow):** coding agents work in client repositories; **all production authority moves to one private release-control repository (RC)** that holds the trusted gate, the approval ledger and the per-client hosting credentials. Releasing is two owner actions in the GitHub Actions page: **stage** (RC builds the exact commit with trusted tools, verifies, and records the digest) and **release** (the owner types the digest back; RC deploys exactly those bytes). Human judgements (rights, search review, external links, domain) are recorded the same way. Client repositories keep the hard stop permanently: they can never produce a client-production package.
5. **It is only as strong as four preconditions** (section 4.1) and a validation that has not been run (section 6): RC must be unreachable to the coding integration, agents must never run with the owner's own `gh` login, tokens, browser or desktop, nobody else may write to RC, and no route from a client repository or session to a host may exist. **The mechanism is not validated, so the stop stays.**
6. **Cost: no purchase is required** for the core on the capabilities the sources show for private repositories, but private-repository Actions minutes are limited per plan and the current CI is heavy (about 38 runner minutes per push [O12]); the plan is unverified (section 7).
7. **Decisions needed:** section 9.

## 2. The owner's requirements and where each is met

| Requirement (owner, `APR-JE-042`) | Met by |
|---|---|
| One private repository per client; independent configuration, credentials, deployment and access boundaries | Client repository holds code and content only: no hosting secret, no deploy route, no collaborator but STS. Each client has its own read-only deploy key and its own hosting token held in RC, and its own ledger file (4.5) |
| Shared engineering standards and reusable workflows; centralised maintenance and security checks | Thin caller workflows in client repositories call reusable workflows from a shared private repository, which private repositories of the same organisation may use [Q58]; RC runs scheduled maintenance and security scans across clients with the read-only keys (4.3) |
| STS owner retains administrative authority and the final production decision | The owner is the only account with access to RC; only RC can release |
| Coding agents implement and test but never approve production | No coding credential reaches RC (4.1, validated by V1); client-repository records are drafts, never authority (4.4) |
| No extra machine, second account or manual signing by default | The owner uses the GitHub web interface with the existing account (4.2). Signing is kept only as an optional upgrade (section 10) |
| Client departure and handover follow the service agreement | Per-client credentials and a client-free ledger make removal local; runbook in section 8 (terms are for the agreement, not this design) |
| Keep the authenticity hard stop until a practical mechanism is designed **and validated** | Section 5 |

## 3. Enforcing owner approval when an agent may use the same GitHub identity

| # | Mechanism | Why it does or does not separate owner from agent | Verdict |
|---|---|---|---|
| E1 | Environment required reviewers in the client repository, with or without "prevent self-review" | Private repositories need an Enterprise plan for reviewers [Q03, Q46]. With the same account, self-review prevention blocks the owner as well as the agent [Q20, Q22]; without it a token holding `deployments: write` approves through the API [Q24]. Admins bypass by default [Q21] | **Fails** |
| E2 | Pull-request approval or CODEOWNERS | The designated approver and the author are the same account; the requirement is bypassed or deadlocks [Q28 context]. (GitHub's rule on authors approving their own pull request was not read: unverified.) | **Fails** |
| E3 | Rulesets or branch protection in the client repository | Private repositories need Pro, Team or Enterprise Cloud [Q62]; an admin can edit or delete a ruleset [Q30], and `administration: write` is the gating permission (permission map) | **Hygiene, not a boundary** |
| E4 | Reduce the coding credential's permissions | The permission set belongs to the app; the owner can change repository access, not permissions [Q38]; the token is the intersection of the app and the user [Q54]; workflow-file pushes already succeed [O5] | **Not available to the owner; measure only (V2)** |
| E5 | **Reachability: the approval capability lives in a repository the coding integration cannot reach** | A user token reaches only repositories in both the installation and the user's access [Q55]; no permission matters for a repository the token cannot see. Works with one identity and costs nothing | **Core mechanism, unverified until V1** |
| E6 | Web-session-only actions and sudo mode | Re-authentication protects interactive sessions (for example ruleset changes in the web interface [Q65]); API tokens are not prompted. It hardens the owner's session; it does not stop a token | **Supports E5, not a substitute** |
| E7 | Out-of-band channels the sessions can read (an emailed link or code, a shared file, a chat) | The tool set can read mail and files [O9] | **Fails** |
| E8 | The owner's signed-in browser or desktop operated by an agent | Computer-use and browser-extension skills act in the person's own sessions [O9]; they would click RC's buttons | **Defeats E5 unless excluded by procedure (precondition P1)** |
| E9 | Detached owner signature with a key held outside GitHub | Strongest; needs key custody and a manual signing step | **Optional upgrade (section 10)** |
| E10 | A second GitHub identity | Excluded by the owner; would not remove the need for E5 | **Not used** |

**Conclusion:** use E5, close E8 by procedure, add E6 hardening, keep E9 for clients or periods that need cryptographic proof. **What this proves, exactly:** that a release decision came through a channel that coding credentials cannot reach, provided the preconditions hold. It does **not** prove which human pressed the button; it removes the coding agent's ability to press it.

## 4. Architecture: the release-control repository (RC)

### 4.1 Zones and preconditions

| Zone | Contains | Who can change it |
|---|---|---|
| **Client repository** (one per client, private) | Source, content, build configuration, thin caller workflows, **no hosting credential, no deploy workflow** | Coding agents (implementation); owner |
| **Shared workflows and standards** (a private repository) | Reusable CI workflows and engineering standards | Owner decides what is adopted (4.3 `sync-tools`) |
| **RC** (one private repository, **outside the coding integration**) | The trusted release tooling snapshot, the release workflows, the approval ledger, per-client credentials | **Only the owner** |

Preconditions (the design fails if any is false):

* **P1.** Coding agents run only through the scoped integration. They are never given the owner's own `gh` login, personal access token, SSH key, signed-in browser or desktop session, and no computer-use or browser-extension tool is attached to the owner's GitHub session while a release is made [E8].
* **P2.** RC is not installed for the coding integration, is in no session's repository scope, and no coding agent is a collaborator. The owner can review and narrow the integration's repository access [Q38].
* **P3.** Nobody but the owner has write access to RC (write access reads every repository secret [Q25]). The owner's account uses a passkey or 2FA (status unverified).
* **P4.** No route from a client repository or a session to a host exists: no deploy key with write access [Q59], no host Git integration tied to a client repository, no webhook, and no website-publishing or store connector pointed at a client's production site [O9].
* **P5.** Client repositories contain no hosting credential and no repository secret that could deploy.

### 4.2 The owner's experience

Everything is a form in the GitHub web interface under the existing account: **Actions, choose a workflow in RC, Run workflow, fill the fields.** No extra machine, account or signing key.

### 4.3 Workflows in RC (all `workflow_dispatch`, GitHub-hosted runners, actions pinned to full commit SHAs [Q27])

| Workflow | Owner input | What it does |
|---|---|---|
| `record-approval` | client, type (rights, search review, external links, domain, other), subject digest, decision, note | Appends a ledger entry for a human judgement. The subject digest is the one the stage run recomputes, so a record about different content does not apply |
| `stage-release` | client, commit SHA | **Job 1 (untrusted)**: checks out that exact commit with the client's read-only deploy key [Q59], installs from the lockfile without install scripts, builds, uploads the output as data; **holds no other secret**. **Job 2 (trusted)**: never executes client code; recomputes the candidate digest and every gate input with RC's tooling; reads approvals only from the ledger; produces the review report and the staged package; appends a `staged` entry (client, commit, candidate and package digest, tooling SHA, run id, expiry 7 days) |
| `release` | client, package digest, confirmation text `RELEASE <client> <first 12 of digest>` | Refuses unless the ledger has a `staged` entry for that digest that is unexpired, not revoked and not superseded; downloads the staged package from the recorded RC run; recomputes its digest and requires equality with the ledger and the typed value; deploys exactly those bytes with the client's own token; appends `released` |
| `revoke` | client, digest or record id, reason | Appends a revocation; later `release` and the gate refuse |
| `maintain` (scheduled) | none | Reads each client repository with its read-only key and runs dependency, licence, SBOM and security checks; writes reports; changes nothing in clients and approves nothing |
| `sync-tools` | shared-tools commit SHA | Copies the reviewed tooling at that commit into RC. The owner reviews the comparison in the GitHub web interface before choosing the SHA |

### 4.4 The ledger and why client records stop being authority

`ledger/<client>.jsonl` in RC, append-only by convention, written only by RC workflows. Each line carries: type, client, subject and decision, run id and attempt, timestamps, the triggering account, tooling SHA. **Client-repository records (`engineering/release/records`, the reviewer table) become drafts and notes; the RC gate never accepts them as authority.** The ledger's weight comes from where it is written (a repository no coding credential reaches), not from the account name in it.

### 4.5 Per-client isolation

Per client: its own private repository; its own read-only deploy key [Q59]; its own hosting token scoped to that site only; its own ledger file; its own inputs in the workflows. A single RC means a compromise of RC reaches every client's token, so tokens are narrow and the preferred tightening (plan permitting) is per-client environments for secrets [Q60, Q61] and, if a contract needs it, one RC per client (section 7).

### 4.6 The simplest secure workflow (per release)

1. **Agent:** implements and tests in the client repository; the lighter per-push CI runs. The agent reports the commit SHA and links the preview.
2. **Owner:** looks at the result.
3. **Owner, if human judgements are needed:** `record-approval` for each (rights, search review, external links, domain).
4. **Owner:** `stage-release` with client and commit SHA. RC builds, verifies, stages, prints the digest and the report.
5. **Owner:** reads the report and the staged package, then **`release`** with the digest and the confirmation text.
6. **Later, if needed:** `revoke`.

Two to four forms per release, none of them reachable by a coding credential.

### 4.7 How the six required properties are met

| # | Property | Control | Negative tests to build (V3) |
|---|---|---|---|
| 1 | Separate implementation from owner authorisation | Implementation is in client repositories; authorisation is in RC, unreachable to coding credentials (E5, P1 to P3) | Every coding-integration action against RC is refused (V1) |
| 2 | Bind approval to the exact artifact digest | `stage` records the digest; `release` needs the typed digest, the ledger entry and the re-hashed staged bytes to agree | Artifact replaced after staging; digest from another client or run; one-byte change; confirmation text wrong |
| 3 | Authenticate the build and provenance | RC builds the typed commit on a GitHub-hosted runner with RC's own tooling and records the run; client code is isolated from secrets; a Sigstore attestation can be added from RC if the plan allows (private repositories need Enterprise Cloud [Q01]) | Build job tries to read RC secrets or the ledger; client build script alters the output after the digest is taken; wrong commit |
| 4 | Reject forged, revoked, stale or mismatched | The ledger is the only source; stage entries expire in 7 days; revocations and supersession are checked; approval subjects are recomputed | Forged client-repo records and a patched client gate (ignored); expired stage; revoked; superseded by a newer stage; approval for different content; replay of another client's ledger line |
| 5 | Untrusted workflows and ordinary write access cannot manufacture approval | Client write access does not reach RC [Q55]; no RC secret is available to pull-request, fork or client workflows; the privileged job never runs client code | A malicious client workflow and a malicious pull request cannot read or write RC |
| 6 | Preserve the hard stop until proven | Section 5 | The stub keeps refusing in every client repository |

## 5. The hard stop

* **In client repositories it stays permanently.** `lib/authenticity.mjs` keeps reporting "not implemented" and the gate and package verifier keep judging it for every client-production build. A client repository can therefore never produce a client-production package, even if an agent edits its own gate. This is an interlock; the real boundary is RC.
* **RC does not exist, no production-capable workflow exists, and no hosting credential has been placed anywhere.** Nothing in this revision creates any of them.
* **Production is enabled only when all of these have happened, in order:** (1) the owner approves this design (section 9); (2) an implementation is separately authorised; (3) validation V1 to V8 passes on disposable test repositories; (4) an independent reviewer who is not one of the implementing sessions attacks the result; (5) the owner records in the approvals ledger the decision to enable the first client; (6) the first release is made to a throwaway target. Until then the stop and the empty reviewer table stand.

## 6. Validation plan (not run; needs the owner's authorisation because it changes state on disposable test repositories)

| # | Test | Passes when |
|---|---|---|
| V1 | From a session with the intended integration: attach, read, dispatch, push and approve against a test RC (`add_repo`, the connector, git) and list the integration's reachable repositories | Every attempt is denied or the repository is not listed [O10, Q55] |
| V2 | In a disposable test client repository: which of workflow-file edit, workflow dispatch, secret write, environment or ruleset change, deployment approval and merge the coding credential can perform | Recorded exactly; no result is needed to be negative because RC does not depend on it |
| V3 | The negative tests in 4.7 against a test RC and test client | All refused for the right reason |
| V4 | Secret isolation: a hostile client build script tries to read secrets, the runner environment and the ledger | Nothing of RC is readable |
| V5 | Fork and pull-request triggers in the test client | No access to RC |
| V6 | A dry run with a synthetic client and a throwaway deployment target | The success path and every refusal behave as designed |
| V7 | Adversarial review by someone other than the implementing sessions (a person, or a system the sessions cannot influence) | Findings fixed and re-checked |
| V8 | Owner walkthrough of 4.6 including `revoke` and a handover rehearsal (section 8) | Owner confirms it is usable |

## 7. GitHub capabilities, plan and cost (the organisation plan is **unverified**)

| Capability | Needed for | Sources show |
|---|---|---|
| Private repositories, workflow dispatch, repository secrets, deploy keys, sharing reusable workflows between private repositories of one organisation | **The core design** | No plan restriction was found in the sources read for these [Q58, Q59]; the plan itself is unverified |
| Environments and environment secrets in private repositories | Per-client secret isolation | Pro, Team or Enterprise [Q60]; not on Free [Q61] |
| Required reviewers (a second click) in private repositories | Optional | Enterprise only [Q03, Q46] |
| Rulesets and branch protection in private repositories | Hygiene | Pro, Team or Enterprise Cloud [Q62] |
| Artifact attestations in private repositories | Optional provenance | Enterprise Cloud [Q01] |

**Cost.** No purchase is required for the core. Private-repository Actions use the plan's included minutes (2,000 per month on Free, 3,000 on Team [Q63, Q64]); macOS and Windows minutes cost more [Q66]. The current CI took about 38 Linux runner minutes plus a short macOS job for one push [O12], so one organisation-wide quota would be consumed by a few dozen pushes. **Recommendation:** thin per-push CI in client repositories (fast checks) and the heavy browser matrix at `stage-release` time. Not changed now. The price of any plan upgrade is on GitHub's pricing page and is not quoted.

**Settings the owner would apply later, only with authorisation (none applied):** create RC private with no other collaborator; exclude RC from the coding integration's repository selection [Q38]; passkey or 2FA on the owner account; read-only deploy key and a one-site hosting token per client in RC; shared-workflow access on the shared repository [Q58]; default `GITHUB_TOKEN` read-only; remove any client-repository route to hosting.

## 8. Client departure and handover (mechanics only; the service agreement decides ownership, licences, formats and retention)

1. **Freeze:** remove the client from RC's allowed list so no release can be staged.
2. **Revoke:** the client's hosting token and read-only deploy key in RC; rotate anything shared.
3. **Export per agreement:** either a repository transfer, after removing STS-owned secrets, deploy keys and webhooks because they stay associated after a transfer [Q56], noting that a private repository moved to a Free account loses features such as protected branches [Q57]; or a clean export (source snapshot, built site, documentation, licence and rights records).
4. **Replace shared references:** workflow references point at STS's private shared repository [Q58] and stop working after a transfer, so the handover includes standalone build instructions or a vendored snapshot, as the agreement provides.
5. **Archive** the client's ledger entries and records for the retention period the agreement sets; **remove** the client from maintenance scans.
6. **Hosting and domain:** transfer or release the hosting project and DNS according to who owns them under the agreement.

Because every credential is per client and no client repository holds a hosting secret, departure of one client exposes no other.

## 9. Decisions requested

| # | Decision | Recommendation |
|---|---|---|
| R1 | Adopt the RC model as the default mechanism, with owner-key signing as an optional upgrade | **Adopt** |
| R2 | Confirm preconditions P1 to P5, above all that coding agents are never run with the owner's own `gh` login, token, SSH key, browser or desktop, and that RC is never added to the coding integration | **Confirm, and say who checks it** |
| R3 | Tell us the organisation plan and the owner account's passkey/2FA status (not readable from here) | **Provide** |
| R4 | Authorise validation V1 to V8 on disposable test repositories | **Authorise separately, before any implementation** |
| R5 | Two-phase release (stage, then release) with a 7-day stage expiry and typed confirmation | **Adopt** |
| R6 | Per-client credentials: narrow tokens in RC now; per-client environments if the plan allows; one RC per client only if a contract requires | **Adopt the first two** |
| R7 | Tooling adoption through `sync-tools` after the owner reviews the comparison | **Adopt** |
| R8 | Thin per-push CI in client repositories to protect the minutes quota | **Adopt (later change)** |
| R9 | Supply the service-agreement clauses that govern ownership, licences and handover so section 8 can be finalised | **Provide** |
| R10 | Sequencing: implement RC after approval and validation, before G6-4; G6-4's hosting adapters become RC deploy adapters; G6-7's central automation includes RC | **Adopt** |

## 10. Optional upgrades and the superseded mechanism

* **Owner-key signed release statement** (revision 1, commit `7321d95`): a detached signature by a key held outside GitHub proves a person's decision cryptographically and survives a failure of RC's reachability boundary. It needs key custody and a manual step, which the owner excluded by default. Keep it available for clients that require it or if V1 fails.
* **Required reviewers on a production environment** (Enterprise): a second click in RC [Q03, Q46].
* **Sigstore attestation from RC** (Enterprise Cloud for private repositories) [Q01].
* **A second person** if STS adds staff: then ordinary reviewer controls become meaningful.

## 11. Residual risks

1. **Preconditions are procedural.** If an agent ever uses the owner's own login, token, browser or desktop, or RC is added to the integration, the boundary is gone [P1, P2, E8].
2. **Unvalidated:** whether a coding session can attach, read or approve in a repository outside its installation is unverified [O10, V1]; the strength of the platform's repository scope is unverified [O11].
3. **A compromised owner account or device** controls RC. A passkey or 2FA, a device kept free of coding agents and the ledger history reduce this; they do not remove it.
4. **One RC concentrates risk:** all clients' narrow tokens live there (4.5).
5. **Untrusted client code runs in RC's build job.** It is isolated from secrets by job separation; the isolation must be proven (V4), and a runner escape is outside this design.
6. **The owner may approve what they did not read.** The report and the staged package are the owner's review material; the design cannot make the owner read them.
7. **Tooling drift:** `sync-tools` is only as good as the owner's review of the comparison.
8. **GitHub as the trust anchor:** RC, its ledger and its runs depend on GitHub's account security and audit.
9. **Cost and quota** may force a plan decision (section 7).
10. **Handover terms** are not decided here (section 8).
11. **The documentation was read as source files**, not rendered pages, and the plan and settings are unverified (evidence README).

## 12. Scope compliance and what changed from revision 1

Changed in this correction: the approvals ledger (`APR-JE-042`), the matrix (decisions, blocker `RB-16`, G6-3A summary), this document and `g6-3a-evidence/`. **Unchanged:** every delivered file, the release gate and policy, `lib/authenticity.mjs`, the reviewer table (empty), the workflow, the package scripts, the lockfile, the master framework repository. No GitHub setting, key, secret, credential, account, repository, workflow or subscription was created or changed; nothing was merged or deployed; G6-4 was not started. Read-only calls made for this revision: the session's repository list and the documentation sources.

Revision 1's owner-held-key mechanism, the three owner-side contexts and the signed statement are no longer the default; the evidence from revision 1 (platform observations O1 to O7, quotations Q01 to Q53) is retained and extended.

## 13. Adversarial read of this revision

(Filled in after the independent review.)
