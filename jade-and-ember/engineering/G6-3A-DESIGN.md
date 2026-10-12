# G6-3A: Release authentication and provenance (revised for the STS multi-client operating model)

**Revision 2, 2026-10-12, after the owner's operating-model clarification (`APR-JE-042`). Design only: nothing here is implemented, and no GitHub setting, credential, workflow or release control was changed.** Revision 1 (commit `7321d95`) designed a single-project release around an owner-held signing key; it is superseded as the default and kept in section 10 as an optional upgrade. The hard authenticity stop (`lib/authenticity.mjs`) is untouched and the reviewer table is still empty. **It stops here for the owner's review.**

Evidence: [`g6-3a-evidence/`](g6-3a-evidence/README.md). `[Qnn]` is a quotation matched verbatim against an official source (`official-sources.json`); `[Onn]` is a read-only observation (`platform-observations.json`). Anything not established is marked **unverified**. This repository is public, so no private repository name, client name or credential appears here or in the evidence.

## 1. The answer in one page

1. **The operating model changes the design.** STS owns the organisation and keeps one private repository per client; clients buy a service and have no repository, pipeline or hosting access; coding agents implement and test but never approve production; the owner will not run an extra machine, a second GitHub account or a manual signing step by default.
2. **With one GitHub identity, no control inside the client repository can prove the owner decided.** Environments, reviewers, rulesets, branch protection, approval records and attestations live where a coding session acting as the same account can reach them or edit the rules that govern them. A coding session using `carlito3k` can already initiate runs and alter the workflow, the gate, the policy, the records and the reviewer table [O1 to O6]. GitHub's permission map shows that approving a deployment needs `deployments: write`, dispatching needs `actions: write`, changing environments, rulesets, branch protection or Actions settings needs `administration: write`, and workflow files need `workflows: write` (evidence `permissionMap`). Whether the sessions' credential holds those is **unverified**, and it already writes workflow files [O5]. An owner can review what an installed app was granted and narrow its repository access [Q38]; whether its permissions can be narrowed is not stated in the source read. A repository owner, a self-declared record and an account name prove none of the owner's personal decisions.
3. **What can work with one identity is a reachability boundary, not an identity boundary.** A GitHub App user token reaches only repositories that both the installation and the user can access [Q55]. If the thing that authorises a release lives in a **private release-control repository (RC) that the coding integration is never given**, a coding session could not read, dispatch, edit or approve in it, whatever account it acts as. **This holds only for that credential type, and the platform's actual credential and its scope enforcement are unverified** (the session can list every repository of both accounts [O8], and attaching a repository was not tried [O10, O11]). Validation V1 decides it. The owner operates RC from the GitHub web interface with the existing account: no second account, no extra machine, no signing.
4. **Recommended mechanism (the simplest secure workflow):** coding agents work in client repositories; **production authority moves to RC**, which holds the trusted gate, the approval ledger and the per-client hosting credentials. Releasing is two owner actions in the GitHub Actions page: **stage** (RC builds the head of the agreed release branch with trusted tools, previews the staged bytes and records the digest) and **release** (the owner types the digest back; RC checks it and deploys exactly those bytes). Human judgements (rights, search review, external links, domain) are recorded the same way. Client repositories keep the hard stop, but that is an interlock only; RC is the boundary.
5. **It is only as strong as six preconditions** (4.1) and a validation that has not been run (section 6). Several are procedural, and the tool set of this very session contains connectors that undermine two of them (mail and browser/desktop tools [O9]). **The mechanism is not validated, so the stop stays.**
6. **The owner approves behaviour, not code.** What the owner sees is the staged site; hostile code could behave differently on the live domain or later. The gate, the content policy and the preview narrow this; they do not remove it (section 11).
7. **Cost:** the core uses features for which the sources show no plan restriction, but the plan is unverified, ledger integrity is stronger with rulesets that private repositories need a paid plan for, private-repository minutes and artifact storage are limited, and the current CI is heavy (section 7).
8. **Decisions needed:** section 9.

## 2. The owner's requirements and where each is met

| Requirement (owner, `APR-JE-042`) | Met by |
|---|---|
| One private repository per client; independent configuration, credentials, deployment and access boundaries | Client repository holds code and content only: no hosting secret, no deploy route, no collaborator but STS. Each client has its own read-only deploy key and its own hosting token in RC (where the host allows a per-site token), its own ledger file and its own workflow inputs (4.5) |
| Shared engineering standards and reusable workflows; centralised maintenance and security checks | Thin caller workflows in client repositories call reusable workflows from a shared private repository, which private repositories of the same organisation may use [Q58]; RC runs scheduled per-client maintenance and security scans with read-only keys (4.3) |
| STS owner retains administrative authority and the final production decision | The owner is the only account with access to RC; only RC can release |
| Coding agents implement and test but never approve production | No coding credential reaches RC if V1 passes (4.1); client-repository records are drafts, never authority (4.4) |
| No extra machine, second account or manual signing by default | The owner uses the GitHub web interface with the existing account (4.2). Signing stays an optional upgrade (section 10) |
| Client departure and handover follow the service agreement | Per-client credentials and ledger make removal local; runbook in section 8 (terms are for the agreement) |
| Keep the authenticity hard stop until a practical mechanism is designed **and validated** | Section 5 |

## 3. Enforcing owner approval when an agent may use the same GitHub identity

| # | Mechanism | Why it does or does not separate owner from agent | Verdict |
|---|---|---|---|
| E1 | Environment required reviewers in the client repository, with or without "prevent self-review" | Reviewers are not available in private repositories on Free, Pro or Team [Q03]; deployment protection rules for private repositories are listed under Enterprise [Q46]. With one account, self-review prevention blocks the owner as well as the agent [Q20, Q22]; without it a token with `deployments: write` approves through the API [Q24]. Admins bypass by default [Q21] | **Fails** |
| E2 | Pull-request approval or CODEOWNERS | With one account the approver and the author coincide, so the requirement either deadlocks or is bypassed. (GitHub's rule on authors approving their own pull requests was not read: **unverified**.) | **Fails (unverified detail)** |
| E3 | Rulesets or branch protection in the client repository | Private repositories need Pro, Team or Enterprise Cloud [Q62]; an admin can edit or delete a ruleset [Q30], and `administration: write` gates it (permission map) | **Hygiene, not a boundary** |
| E4 | Narrow the coding credential's permissions | The owner can review permissions and change repository access [Q38]; whether permissions of the app the sessions use can be narrowed is not stated; the token is the intersection of app and user [Q54]; workflow-file pushes already succeed [O5] | **Not established; measure (V2)** |
| E5 | **Reachability: the approval capability lives in a repository the coding integration cannot reach** | For GitHub App user tokens, a repository outside the installation is unreachable whatever the permissions [Q55]. Free and works with one identity. **Unverified for the platform's credential and its repository scope** [O8, O10, O11] | **Core mechanism, decided by V1** |
| E6 | Web-session-only actions and sudo mode | Re-authentication protects interactive sessions (for example ruleset changes in the web interface [Q65]); API tokens are not prompted | **Supports E5, not a substitute** |
| E7 | Out-of-band channels the sessions can read (an emailed link or code, a shared file, a chat) | The tool set can read mail and files [O9] | **Fails** |
| E8 | The owner's signed-in browser or desktop operated by an agent, or the owner's mailbox read by a session | Computer-use and browser skills act in the person's own sessions, and mail connectors can read GitHub's verification and reset emails [O9] | **Defeats E5 unless excluded (P1, P3)** |
| E9 | Detached owner signature with a key held outside GitHub | Strongest; needs key custody and a manual step | **Optional upgrade; recommended for tooling changes (4.8)** |
| E10 | A second GitHub identity | Excluded by the owner; would not remove the need for E5 | **Not used** |

**Conclusion:** use E5, close E8 procedurally, add E6 hardening, keep E9 available. **What this proves, exactly:** that a release decision came through a channel that coding credentials cannot reach, provided the preconditions hold and V1 passes. It does **not** prove which human pressed the button; it removes the coding agent's ability to press it.

## 4. Architecture: the release-control repository (RC)

### 4.1 Zones and preconditions

| Zone | Contains | Who can change it |
|---|---|---|
| **Client repository** (one per client, private) | Source, content, build configuration, thin caller workflows; **no hosting credential, no deploy workflow** | Coding agents; owner |
| **Shared tooling and workflows** (a private repository) | Reusable CI workflows and the engineering tools | Coding agents can write it; **RC adopts a version only through the controlled path in 4.8** |
| **RC** (one private repository, **outside the coding integration**) | The adopted tooling snapshot, the release workflows, the ledger, per-client credentials | **Only the owner** |

Preconditions (the design fails if any is false):

* **P1. Agents never act as the owner outside the scoped integration.** No coding session is given the owner's own `gh` login, personal access token, SSH key, signed-in browser or desktop, and no computer-use or browser tool is attached to the owner's GitHub session at any time. **No mail, file-storage or chat connector that can read the GitHub account's email (device verification, password reset, security notices) is attached to a coding session** [E8, O9].
* **P2. RC is unreachable to the coding integration.** It is not installed for it (the installation must list "only selected repositories", never "all repositories", which would add a new RC automatically), is in no session's repository scope, and no coding agent is a collaborator. The owner reviews the integration's access [Q38].
* **P3. The owner's account is hard to take over.** A passkey or 2FA that no session can satisfy is **required**, not recommended (status unverified); the account's recovery routes are not readable by any session; nobody but the owner has write access to RC (write access reads every repository secret [Q25]).
* **P4. No route from a client repository or session to a host.** No deploy key with write access [Q59] (a token with `administration: write` can add one: permission map), no host Git integration tied to a client repository, no webhook, and no website-publishing or store connector with access to a client's production site [O9]. **Not established today; an inventory is the first action.**
* **P5. Client repositories hold no hosting credential and no repository secret that could deploy.**
* **P6. No other path reads RC.** No other organisation app or OAuth app (code assistants, dependency bots and the like) is granted RC; **no organisation-level secret, variable or runner group that RC depends on is made available to client repositories** (client workflows that agents write can read what they are given); fork settings keep RC from being forked; organisation owners are the owner only.

### 4.2 The owner's experience

Everything is a form in the GitHub web interface under the existing account: **Actions, choose a workflow in RC, Run workflow, fill the fields.** No extra machine, account or signing key.

### 4.3 Workflows in RC (all `workflow_dispatch`, GitHub-hosted runners, actions pinned to full commit SHAs [Q27])

| Workflow | Owner input | What it does |
|---|---|---|
| `record-approval` | client (allow-list), type, subject digest, decision, note | Appends a ledger entry for a human judgement. The subject digest is the one the stage run recomputes, so an approval about different content does not apply |
| `stage-release` | client (allow-list) and the name of the agreed release branch | RC itself reads the **head of that branch with the read-only key and records the commit SHA**; the owner does not paste an agent-supplied SHA. **Build job (untrusted)** and **verify job (trusted)** as in 4.3.1. The report and a **preview rendered from the staged package** (not an agent link) are produced; a `staged` entry records client, commit, package digest, tooling SHA, run id, expiry 7 days |
| `release` | client, package digest, confirmation text `RELEASE <client> <first 12 of digest>` | Re-reads the ledger immediately before deploying; verifies the `staged` entry against the **Actions run itself** (workflow path, ref, conclusion, artifact digest), not the text line; refuses if expired, revoked, superseded, **already released**, or if the tooling SHA differs from the one recorded at stage; downloads the staged package from that run; recomputes its digest and requires equality with the ledger and the typed value; deploys exactly those bytes with the client's own token; marks the stage consumed |
| `revoke` | client, digest or record id, reason | Appends a revocation. A new `release` refuses; a `release` already in flight re-checks before its deploy step |
| `rollback` | client, an earlier released digest | Stages again the earlier commit through `stage-release`; there is no shortcut around the two phases |
| `maintain` (scheduled) | none | One job **per client**, `permissions: contents: read`, that client's read-only key only, no ledger write; runs dependency, licence, SBOM and security checks; outputs to artifacts only; changes nothing in clients and approves nothing |
| `sync-tools` | tooling commit SHA | The controlled adoption path in 4.8 |

#### 4.3.1 Hardening of the stage workflow (requirements for the implementation)

* **Build job (hostile code):** `permissions: {}`; does not check out RC; `persist-credentials: false`; no cache and no restore of any cache in **any** RC workflow (a cache could carry content into a trusted job); no submodules and no LFS; `core.hooksPath` pointed at nothing; install from the lockfile without install scripts; receives only that client's read-only key; its only output is one archive uploaded as data.
* **Verify job (trusted):** never executes client code and never expands untrusted text in a shell. Inputs are validated (commit SHA against `^[0-9a-f]{40}$`, client name against an allow-list, branch name against a fixed pattern). The archive is extracted with a hardened extractor that refuses symlinks, absolute or `..` paths, unexpected file types, too many entries and oversize files, and the package digest is computed **after** extraction by this job. Report text derived from client content is escaped data and never contains a command the owner might paste.
* **Secrets:** each job references only the secrets it needs, by static name; no dynamic secret lookup; the deploy step is the only place a hosting token appears.
* **Ledger writes:** only a dedicated append step, running trusted code with validated fields, holds `contents: write`; every RC workflow uses a per-client `concurrency` group so two runs cannot interleave.

### 4.4 The ledger and why client records stop being authority

`ledger/<client>.jsonl` in RC. Each line carries type, client, subject and decision, run id and attempt, timestamps, the triggering account, the tooling SHA and the hash of the previous line (a hash chain, so a deleted or altered line is detectable). Because branch protection and rulesets are not available on private repositories on lower plans [Q62], the file is **not** the authority on its own: `release` and the gate verify each line they rely on against the Actions run that produced it. **Client-repository records (`engineering/release/records`, the reviewer table) are drafts and notes; RC never accepts them as authority.** The ledger's weight comes from where it is written, not from the account name in it.

### 4.5 Per-client isolation, and its limit

Per client: its own private repository; its own read-only deploy key [Q59]; its own hosting token, scoped to that site **where the host offers per-site tokens (unverified for each host; many offer only account-wide tokens, which widens the blast radius)**; its own ledger file; allow-listed inputs. All of these live in one RC. Repository secrets are visible to any RC job that references them and there are no environments on Free [Q60, Q61]; **a compromise of RC therefore reaches every client's token.** The tightenings are per-client environments where the plan allows [Q60] and, if a contract requires it, one RC per client.

### 4.6 The simplest secure workflow (per release)

1. **Agent:** implements and tests in the client repository on the agreed release branch; the light per-push CI runs.
2. **Owner, if human judgements are needed:** `record-approval` for each (rights, search review, external links, domain).
3. **Owner:** `stage-release`. RC reads the branch head itself, builds, verifies, stages and shows a preview of the staged package and the report.
4. **Owner:** looks at the **staged** preview and report (not an agent link), then `release` with the digest and the confirmation text.
5. **Later, if needed:** `revoke` or `rollback`.

Two to four forms per release, none reachable by a coding credential if V1 passes.

### 4.7 How the six required properties are met

| # | Property | Control | Negative tests to build (V3) |
|---|---|---|---|
| 1 | Separate implementation from owner authorisation | Implementation is in client repositories; authorisation is in RC (E5, P1 to P6) | Every coding-integration action against RC is refused (V1) |
| 2 | Bind approval to the exact artifact digest | `release` needs the typed digest, a run-verified `staged` entry and the re-hashed staged bytes to agree; a stage is consumed once | Artifact replaced after staging; digest from another client or run; one-byte change; wrong confirmation text; second release of the same stage |
| 3 | Authenticate the build and provenance | RC builds the branch head it read itself, on a GitHub-hosted runner with its own tooling, and records the run; client code is isolated from secrets; a Sigstore attestation can be added from RC where the plan allows (private repositories: Enterprise Cloud [Q01]) | Build job tries to read RC secrets, the ledger or caches; archive with symlinks, `..` paths, oversize or unexpected files; build output that differs between the preview and the staged bytes |
| 4 | Reject forged, revoked, stale or mismatched | Run-verified ledger lines; 7-day expiry; revocation, supersession and consumption; approval subjects recomputed; tooling SHA must match | Forged client-repo records and a patched client gate (ignored); forged or deleted ledger line; expired, revoked, superseded or consumed stage; approval for different content; replay of another client's line; revoke arriving during a release |
| 5 | Untrusted workflows and ordinary write access cannot manufacture approval | Client write access does not reach RC (E5); no RC secret is available to pull-request, fork or client workflows; the privileged jobs never run client code | A malicious client workflow and pull request cannot read or write RC |
| 6 | Preserve the hard stop until proven | Section 5 | The stub keeps refusing in every client repository; no RC workflow can deploy until enabled |

### 4.8 Tooling adoption (the weakest link, stated plainly)

The tooling that RC runs comes from a repository coding agents can write. A poisoned gate would let RC print forged reports and write forged approvals. Controls: RC adopts a **specific commit** only through `sync-tools`; the sync **rejects dependency, lockfile and binary changes**; `release` refuses a stage made with a different tooling SHA than the current one; a **delay** separates adoption from the next stage; and **every adoption needs an independent review that is not a coding session (a person or a system the sessions cannot influence), recorded in RC**. Because an owner reading a comparison that a session summarised is not independent, **this is the one place where the signing upgrade (E9) is recommended**: a signature by the owner over the tooling commit, checked by `sync-tools`, with the exception to "no signing by default" decided by the owner (R7). Authoring the small trusted gate directly in RC, rather than syncing, is the alternative.

## 5. The hard stop

* **In client repositories the stub stays.** `lib/authenticity.mjs` keeps reporting "not implemented" and the gate keeps judging it for every client-production build. This is an **interlock against accidents**: a session can edit its own repository, so it is not a security boundary, and the real boundary is RC. RC's gate is independent of the client's `lib/authenticity.mjs`: RC runs its own adopted tooling and never trusts the client's gate result.
* **RC does not exist and no production-capable workflow exists.** This revision creates no repository, workflow or credential. Whether a hosting credential or deploy route exists elsewhere (P4, including website-publishing connectors in sessions [O9]) is **unverified**.
* **Production is enabled only when all of these have happened, in order:** (1) the owner approves this design (section 9); (2) an implementation is separately authorised; (3) validation V1 to V8 passes on disposable test repositories; (4) an independent reviewer who is not one of the implementing sessions attacks the result; (5) the owner records the decision to enable the first client **in the RC ledger** (a mirrored note in the approvals ledger of this repository is a note, not the authority); (6) the first release goes to a throwaway target. Until then the stop and the empty reviewer table stand.

## 6. Validation plan (not run; needs the owner's authorisation because it changes state on disposable test repositories)

| # | Test | Passes when |
|---|---|---|
| V1 | From a session with the intended integration: attach, read, dispatch, push and approve against a test RC (`add_repo`, the connector, git); list the integration's reachable repositories; check that new repositories are not auto-added | Every attempt is denied or the repository is not listed [O10, Q55] |
| V2 | In a disposable test client repository: which of workflow-file edit, dispatch, secret write, environment or ruleset change, deployment approval and merge the coding credential can perform | Recorded exactly; RC does not depend on it |
| V3 | The negative tests in 4.7 against a test RC and test client | All refused for the right reason |
| V4 | A hostile client build tries to read secrets, caches, the runner environment, the ledger and the runtime token | Nothing of RC is readable or writable |
| V5 | Fork, pull-request and client-workflow triggers | No access to RC |
| V6 | A dry run with a synthetic client and a throwaway deployment target | The success path and every refusal behave as designed |
| V7 | Adversarial review by someone other than the implementing sessions | Findings fixed and re-checked |
| V8 | Owner walkthrough of 4.6 including `revoke`, `rollback` and a handover rehearsal | Owner confirms it is usable |

## 7. GitHub capabilities, plan and cost (the organisation plan is **unverified**)

| Capability | Needed for | Sources show |
|---|---|---|
| Private repositories, workflow dispatch, repository secrets, deploy keys, sharing reusable workflows between private repositories of one organisation | **The core design** | No plan restriction was found in the sources read for these [Q58, Q59]; the plan itself is unverified |
| Environments and environment secrets in private repositories | Per-client secret isolation | Pro, Team or Enterprise [Q60]; not on Free [Q61] |
| Required reviewers in private repositories | Optional second click | Not on Free, Pro or Team [Q03]; listed under Enterprise [Q46] |
| Rulesets and branch protection in private repositories | Ledger integrity, hygiene | Pro, Team or Enterprise Cloud [Q62] |
| Artifact attestations in private repositories | Optional provenance | Enterprise Cloud [Q01] |

**Cost.** The core needs no stated purchase, but: ledger integrity is stronger with rulesets (a paid plan for private repositories [Q62]); staged packages are stored as Actions artifacts and the Free artifact storage is 500 MB [Q63] (a package of tens of megabytes would use it quickly; package size not measured here); private-repository minutes are limited (2,000 per month on Free, 3,000 on Team [Q63, Q64]) and macOS and Windows minutes cost more [Q66]; the current CI took about 38 Linux runner minutes plus a short macOS job for one push [O12], so **the minute figures cannot be judged until the plan is known**. **Recommendation:** thin per-push CI in client repositories and the heavy browser matrix at `stage-release` time (a later change). The price of any upgrade is on GitHub's pricing page and is not quoted.

**Settings the owner would apply later, only with authorisation (none applied):** create RC private with no other collaborator and no other app; set the coding integration to "only selected repositories" without RC [Q38]; a required passkey or 2FA on the owner account and recovery routes no session can read; a read-only deploy key and, where the host allows, a one-site hosting token per client in RC; shared-workflow access on the shared repository [Q58]; default `GITHUB_TOKEN` read-only; remove any client-repository route to hosting; remove mail, file-storage and browser/desktop tools from coding sessions that could touch the owner's GitHub identity.

## 8. Client departure and handover (mechanics only; the service agreement decides ownership, licences, formats and retention)

1. **Freeze:** remove the client from RC's allow-list so no release can be staged.
2. **Revoke:** the client's hosting token and read-only deploy key in RC; rotate anything shared.
3. **Export per agreement:** either a repository transfer, after removing STS-owned secrets, deploy keys and webhooks because they stay associated after a transfer [Q56], noting that a private repository moved to a Free account loses features such as protected branches [Q57]; or a clean export (source snapshot, built site, documentation, licence and rights records).
4. **Replace shared references:** workflow references point at STS's private shared repository [Q58] and stop working after a transfer, so the handover includes standalone build instructions or a vendored snapshot, as the agreement provides.
5. **Archive** the client's ledger entries and records for the retention period the agreement sets; **remove** the client from maintenance scans.
6. **Hosting and domain:** transfer or release the hosting project and DNS according to who owns them under the agreement.

Because credentials are per client and no client repository holds a hosting secret, departure of one client exposes no other (subject to the per-site token limit in 4.5).

## 9. Decisions requested

| # | Decision | Recommendation |
|---|---|---|
| R1 | Adopt the RC model as the default mechanism, with owner-key signing as an optional upgrade | **Adopt** |
| R2 | Confirm preconditions P1 to P6, above all: coding agents never use the owner's own login, token, SSH key, browser or desktop; **mail, file-storage and browser/desktop tools are not attached to coding sessions that can touch the owner's GitHub identity**; RC is never added to the integration; and say who checks | **Confirm, and decide the connectors question now** |
| R3 | Tell us the organisation plan and whether the owner account has a passkey or 2FA (not readable from here) | **Provide** |
| R4 | Authorise validation V1 to V8 on disposable test repositories | **Authorise separately, before any implementation** |
| R5 | Two-phase release (stage then release) from a branch RC reads itself, a 7-day expiry and typed confirmation | **Adopt** |
| R6 | Per-client credentials: narrow tokens in RC now; per-client environments if the plan allows; one RC per client only if a contract requires | **Adopt the first two** |
| R7 | Tooling adoption: independent review that is not a coding session for every adoption, with owner-signed tooling commits as the one exception to "no signing by default" (or authoring the gate in RC) | **Decide; signing for tooling only is recommended** |
| R8 | Thin per-push CI in client repositories to protect minutes and storage | **Adopt (later change)** |
| R9 | Supply the service-agreement clauses that govern ownership, licences and handover so section 8 can be finalised | **Provide** |
| R10 | Sequencing: implement RC after approval and validation, before G6-4; G6-4's hosting adapters become RC deploy adapters; G6-7's central automation includes RC | **Adopt** |
| R11 | Run the P4 inventory of every route from repositories or sessions to a host, and of every app and organisation-level secret reaching the repositories | **Do before any implementation** |

## 10. Optional upgrades and the superseded mechanism

* **Owner-key signed release statement** (revision 1, commit `7321d95`): a detached signature by a key held outside GitHub proves a person's decision cryptographically and survives a failure of RC's reachability boundary. It needs key custody and a manual step, which the owner excluded by default. Keep it for clients that require it, for tooling adoption (4.8), or if V1 fails.
* **Required reviewers on a production environment** (Enterprise): a second click in RC [Q03, Q46].
* **Sigstore attestation from RC** (Enterprise Cloud for private repositories) [Q01].
* **A second person** if STS adds staff: then ordinary reviewer controls become meaningful.

## 11. Residual risks

1. **Preconditions are procedural.** If an agent ever uses the owner's own login, token, browser, desktop or mailbox, or RC is added to the integration or readable by another app or secret, the boundary is gone. This session's own tool set includes mail, file-storage, browser and desktop tools [O9].
2. **Unvalidated:** whether a coding session can attach, read or approve in a repository outside its installation is unverified [O10, V1]; the strength of the platform's repository scope is unverified [O11]; the credential type behind the sessions is not known.
3. **The owner approves behaviour, not code.** Hostile client code could behave differently from the staged preview, for example on the live domain or later. The gate, the content policy and previewing the staged bytes narrow this.
4. **A compromised owner account or device** controls RC.
5. **One RC concentrates risk** (4.5): every client's token is there, and per-site tokens depend on the host.
6. **Untrusted client code runs in RC's build job.** Job separation, no caches and static secrets reduce it (4.3.1); the isolation must be proven (V4); a runner escape is outside this design.
7. **Tooling poisoning** through the agent-writable shared repository is the most serious path (4.8).
8. **The owner may approve what they did not read.**
9. **GitHub as the trust anchor:** RC, its ledger and its runs depend on GitHub's account security and audit.
10. **Cost and quota** may force a plan decision (section 7).
11. **Handover terms** are not decided here (section 8).
12. **The documentation was read as source files**, not rendered pages, and the plan and settings are unverified (evidence README).

## 12. Scope compliance and what changed from revision 1

Changed in this correction: the approvals ledger (`APR-JE-042`), the matrix (decisions, blocker `RB-16`, G6-3A summary), this document and `g6-3a-evidence/`. **Unchanged:** every delivered file, the release gate and policy, `lib/authenticity.mjs`, the reviewer table (empty), the workflow, the package scripts, the lockfile, the master framework repository. No GitHub setting, key, secret, credential, account, repository, workflow or subscription was created or changed; nothing was merged or deployed; G6-4 was not started. Read-only calls made for this revision: the session's repository list and the documentation sources.

Revision 1's owner-held-key mechanism and signed statement are no longer the default; its evidence (platform observations O1 to O7, quotations Q01 to Q53) is retained and extended.

## 13. Adversarial reads

Two separate AI reviewers (not independent authorities) attacked the two revisions; every finding was checked against the text.

* **Revision 1 (accepted, changed that design):** owner-enrolled workflow pin, owner-generated statement, disposable rebuild context, ledger and rollback rules, deployment-route inventory, corrected citations and cost wording.
* **Revision 2 (accepted, changed this document):** the owner could be shown attacker-chosen commits and previews (now RC reads the branch head itself and previews the staged bytes; 4.3, 4.6); untrusted code in RC's build job and untrusted input into the verify job (hardening list, 4.3.1); the ledger was not append-only and was the sole authority (hash chain, run verification, single append step, concurrency and re-check; 4.3, 4.4); `sync-tools` as the real compromise path (4.8, R7); the reachability claim was over-claimed for credentials other than GitHub App user tokens (sections 1, 3, 11); preconditions omitted mail and file connectors, auto-added repositories, other apps, organisation secrets and a hard passkey requirement (P1 to P6); `maintain` blast radius (per-client jobs); hard-stop wording and the enable decision living in the agent-writable ledger (section 5); weak or truncated citations (Q38, Q58, Q60 and others fixed; E2 marked unverified); cost over-claims (storage, rulesets, per-site tokens); isolation inside one RC (4.5); two-phase gaps (consumption, rollback, concurrent revoke).
* **Not changed:** none of the findings was rejected; where a finding asked for something the owner excluded (signing), the design keeps it as a decision (R7) rather than imposing it.
