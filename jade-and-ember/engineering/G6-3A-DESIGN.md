# G6-3A: Release authentication and provenance (research, architecture and decision checkpoint)

**Authorised by the owner's instruction recorded as `APR-JE-041` (2026-10-12) for Steps 1 to 3 only. This document implements nothing.** No key, credential, secret, account, subscription, workflow, gate rule or policy was created or changed. The hard authenticity stop (`lib/authenticity.mjs`) is untouched and the reviewer table is still empty. **It stops here for the owner's review and decision (section 5) before any credential-dependent change.**

Evidence: [`g6-3a-evidence/`](g6-3a-evidence/README.md). Citations are `[Qnn]` (a quotation matched verbatim against the official source recorded with its SHA-256 in `official-sources.json`) and `[Onn]` (a read-only observation of this repository, `platform-observations.json`). Anything that could not be established is marked **unverified**. The design was attacked by an independent adversarial read (an AI reviewer, so not an independent authority); its findings and what changed are in section 7.

## 1. The answer in one page

1. **The account `carlito3k` cannot, by itself, tell the owner from a Claude session.** The sessions act through that account; it is the only collaborator and has admin rights [O1, O2]; every workflow run is attributed to it, including runs of commits written by sessions [O4]; sessions have pushed changes to the workflow file and they ran [O5]; the connector exposes tools that trigger workflows, write files, push, open and merge pull requests [O6]; no branch has a branch protection rule [O3]. A session using that credential can **initiate** runs (a push does; the dispatch tool exists but was not exercised) and **alter** the workflow, the gate, the policy, the records and the reviewer table. Whether it could also change repository settings or approve a deployment is **unverified** (not tested; nothing was changed), but GitHub's documentation says an admin can [Q19, Q21, Q30] and any required reviewer's token can approve through the API [Q24], so the design assumes it could.
2. **Every GitHub-resident control therefore proves "the account did it", not "the owner decided".** Environments, required reviewers, rulesets, branch protection and JSON records all sit inside the domain the sessions already hold. With one account they cannot be the root of owner authorisation. "Prevent self-review" cannot help: it would block the owner's own approval whenever the account initiated the run, and without it a session can approve.
3. **What GitHub can do is prove origin.** An artifact attestation from a dedicated release workflow proves that a named workflow, at a named commit, in this repository, produced these exact bytes [Q47, Q11, Q05], and can be verified offline [Q53]. It does **not** prove that the workflow was what the owner intended, because the same credential can change the workflow. For this **public** repository attestations are available on every current plan [Q02]; for **private** repositories they need GitHub Enterprise Cloud [Q01].
4. **Recommended mechanism (layered).** (a) **Authorisation root: a detached signature by a key the owner holds outside GitHub and outside every agent environment**, over a *release authorisation statement* generated on the owner's side that binds the exact artifact and candidate digests, the source commit, the record set, the destination and an expiry. (b) **Provenance:** an attestation from a build-only workflow, verified against a workflow and commit **the owner enrolled by a signed statement and recorded outside the repository**. (c) **GitHub settings and immutable releases as defence in depth and audit, never as authorisation.** (d) **Authoritative verification on the owner's side with independent tools**, enforced by the owner-run deploy step; deployment credentials stay with the owner and no route from the repository to a host may exist.
5. **Cost for this repository: no GitHub purchase and no new account** (Actions minutes are free for public repositories on standard runners [Q35]; the other features are listed as available for public repositories [Q02, Q03, Q04]; the organisation's plan is unverified). Owner-side costs: a key (a hardware key is optional), a second machine or disposable virtual machine for rebuilding, and a human reviewer. Private client repositories would need a paid plan for attestations, or an owner-reproduction mode (section 3.9).
6. **Decisions needed from you:** section 5.6 (nine, with a recommendation each).

## 2. Step 1: what was verified, and how

### 2.1 Method and limits

`docs.github.com` cannot be resolved from the sandbox. The **source markdown of GitHub's official documentation** (repository `github/docs`), the `actions/attest` README, the GitHub CLI source and the REST OpenAPI description were read from `raw.githubusercontent.com`; 26 sources are listed with SHA-256 in `official-sources.json`, and all 52 quotations used here were matched verbatim. The files are Liquid-templated: the text for GitHub.com Free, Pro and Team is the `fpt` variant. This is an engineering reading of the official sources, **not a human review of the rendered pages**; the branch commit at retrieval time is not recorded by this route. Repository facts come from read-only connector calls. Not determinable from here: the organisation's plan, any ruleset, environment, CODEOWNERS file or Actions policy, the permissions of the GitHub App the sessions use, and whether this session's token could call settings or approval endpoints [O7].

### 2.2 Findings by question

| Question | Finding | Evidence |
|---|---|---|
| **Account plan and repository visibility** | The repository is **public**, owned by the organisation `getsimplifiedtech`. The plan cannot be read from here. The features this design needs (attestations, environments with required reviewers, rulesets, free Actions minutes) are listed as available for public repositories; for private repositories attestations need Enterprise Cloud, and required reviewers are not available on Free, Pro or Team (deployment protection rules for private repositories are listed under Enterprise). | O1; Q01, Q02, Q03, Q04, Q35, Q46 |
| **Branch and ruleset protection** | No branch, including `main`, has a branch protection rule [O3]; whether a ruleset exists is **unverified**. Rulesets can restrict creation, update and deletion of branches and tags and can require signed commits, with a bypass list that can include repository administrators; an admin can create, edit and delete them. With one account and admin rights they guard against accidents, not against the account's own credential. | O3; Q29, Q30, Q31, Q43, Q44, Q45 |
| **Environment approval** | Up to six required reviewers must approve before a job runs or reads environment secrets; "prevent self-review" stops the initiator approving; "allow administrators to bypass" is **on by default** and can be turned off. Anyone who can edit workflows can create an environment; only admins configure it. Approval can be made through the REST API by any required reviewer's token. | Q42, Q19, Q20, Q21, Q22, Q23, Q24, Q26 |
| **Artifact attestation availability and strength** | Public repository: available on all current plans, signed through the Sigstore Public Good instance, recorded in a public transparency log; SLSA v1.0 Build Level 2 alone (Level 3 is reached with a reusable workflow). Private: Enterprise Cloud, GitHub's own Sigstore, no transparency log. An attestation links the artifact to a workflow, repository, environment, commit and trigger. Verification can pin the repository, the signer workflow and its digest, the source ref and digest, and refuse self-hosted runners, with a pinned bundle and trusted root for offline use, which cannot see key revocations since the root was fetched. It proves origin, not safety, and is worth only what the verifier enforces. | Q01, Q02, Q05, Q06, Q07, Q08, Q09, Q10, Q11, Q47, Q14, Q15, Q16, Q17, Q18, Q41, Q49, Q50, Q51, Q52, Q53 |
| **Actions permissions and trust boundaries** | Any user with write access can read every repository secret through a workflow; environment secrets are protected only by the environment's rules; the `actor` claim names the account, not the person; the runner type is a claim a verifier can require. Actions should be pinned to full commit SHAs. CODEOWNERS can gate workflow changes but needs a second approving person to mean anything. The attest action needs `id-token`, `attestations` and (in the current README) `artifact-metadata` write permissions. | Q25, Q26, Q27, Q28, Q36, Q37, Q48 |
| **Could a Claude session using `carlito3k` initiate, alter or approve the same release?** | **Initiate: yes** (a push under the account triggers runs, observed; the connector's trigger tool exists, not exercised). **Alter: yes** for code, workflow, gate, policy, records and reviewer table (observed); repository settings **unverified, assumed yes**. **Approve:** any approval whose evidence is "the account `carlito3k` did X" (environment approval, pull-request approval, a record, an attestation run) can be produced with the same credential; the only thing a session cannot produce is a signature by a key it never holds. | O1 to O7; Q19, Q21, Q24, Q30 |

### 2.3 Comparison against the six required properties

`yes` = meets it on its own; `part` = contributes but cannot be the root; `no` = does not.

| Property | Artifact attestation | Protected environment + reviewers | Rulesets / branch protection | JSON approval record | Immutable release | **Detached owner signature (key outside GitHub)** |
|---|---|---|---|---|---|---|
| 1 Separates implementation from owner authorisation | no (a workflow is code) | no (same account) | no | no | no | **yes** |
| 2 Binds approval to the exact artifact digest | part (binds bytes to a build, not to an approval) | no | no | part (if it names the digest) | yes (assets locked) | **yes (the statement names it)** |
| 3 Authenticates the build and provenance | **part**: proves origin only when the owner has enrolled which workflow to trust | no | no | no | part (release attestation) | no (it signs a claim, not a build) |
| 4 Rejects forged, revoked, stale, mismatched | part (mismatch, forged) | no | no | no | part | **yes** with expiry, serial, ledger |
| 5 Workflows or write access cannot manufacture owner approval | no | no (admin can reconfigure; reviewer API) | no (admin can edit) | no | no | **yes** (no key in any workflow or session) |
| 6 Keeps the production stop until proven | no | no | no | no | no | part (the missing signature is the stop) |

Conclusion: **no single GitHub control satisfies property 5 under a single admin account**; the detached signature satisfies it but does not authenticate the build. They prove different things, so they are layered, not substituted, and **property 3 depends on a pin the owner holds** (3.4).

## 3. Step 2: architecture

### 3.1 Principles

* **P1. The root of owner authority is a private key that exists only in the owner's custody.** Not a GitHub secret, not in a repository, not in any session, not in a workflow.
* **P2. GitHub proves provenance and keeps an audit trail; it never grants owner authority.**
* **P3. The authority that matters verifies on the owner's side.** Repository code can be edited by the account the sessions use, so the in-repository verifier is an interlock and an early warning, not the authority.
* **P4. Fail closed, no downgrade path.** Missing, malformed, unverifiable, stale, rolled back or not-yet-proven means refuse.
* **P5. Nothing is trusted because it is present or because it is internally consistent.** A record, commit SHA, digest, CI URL or a statement that names its own pins proves nothing until bound to a verified owner signature and to pins the owner holds outside the repository (`APR-JE-040`).

### 3.2 Roles and the three owner-side contexts

| Role / context | Holds | Cannot |
|---|---|---|
| **Owner (person)** | The signing key (preferably hardware, touch and PIN); the ledger; `allowed_signers`; the pins (fingerprint, enrolled workflow commit, tool digests, trusted-root date); the deployment credentials | Delegate the key to a session |
| **Coding agent (Claude sessions)** | Repository write through the owner's account; drafts and evidence | Sign; read the key; approve by any means that counts; hold deployment credentials |
| **Build workflow (`release-build`)** | `contents: read`; `id-token: write` and `attestations: write` in the attest job only; no secrets; no inputs, no repository variables, no cache; no deploy rights | Authorise; deploy; run on a self-hosted runner |
| **Rebuild context (owner side)** | A **disposable virtual machine with no key, no agent socket and no PIN prompt**, used to fetch the package and rebuild the candidate from the commit (this runs repository build scripts and `npm ci`, so it is treated as hostile) | Reach the key or the signing context |
| **Signing context (owner side)** | A device that runs only OpenSSH and the owner-side statement tool on **files copied in as data**; no repository code is executed there | Run repository scripts |
| **Deploy context (owner side)** | The deployment credentials and the owner-run deploy script that **is the enforcement point** (3.5 step 4) | Be reachable from GitHub or a session |
| **In-repository gate** | The existing gate and package verifier plus a real authenticity verifier replacing the stub | Be the authority |

### 3.3 The release authorisation statement

The statement is **generated on the owner's side** by a small owner-side tool from digests the owner's rebuild computed, not taken from a draft the agent prepared. An agent-prepared draft may be shown for comparison only: the tool recomputes every field and displays the difference.

* **Form:** a JSON document restricted to strings and integers, keys sorted, no duplicate keys, no insignificant whitespace, schema `jade-and-ember/release-authorisation@1`. The verifier parses it with the existing duplicate-key-refusing strict parser, re-serialises it, and **refuses the statement unless the re-serialised bytes equal the signed bytes**, so two readers cannot see different values. The tool also prints a plain-text rendering from the same parse for the owner to read before signing.
* **Fields:** `channel` (`client-production`); `serial` (monotonic, from the ledger); `supersedes`; `ledgerHead` (the hash-chain head, 3.8); `candidate` (version, **candidate digest**, artifact name, SHA-256, size); `source` (repository name **and numeric id**, commit SHA, ref, `previousAuthorisedCommit`); `build` (mode `attested` or `owner-reproduction`, workflow path, **workflow commit SHA**, runner type `github-hosted`); `evidence` (engine digest, verification-record digest, SBOM digest, **records digest**: every approval, rights, search, external-links and deployment record in force by id and file hash, reviewer-and-key-table digest, release-policy digest); `trustCriticalDelta` (changed trust-critical paths since `previousAuthorisedCommit`, computed by the owner-side tool from the two trees, with new digests); `destination` (the positive production-domain authorisation record id and domain); `validity` (`issuedAt`, `notBefore`, `notAfter`, **at most 14 days, enforced by the verifier**).
* **What the signature means:** the owner has seen the plain-text rendering, previewed **the exact package bytes** (opening the package from the rebuild context's output copied as data), and accepts that these bytes, built from that commit, may be released to that destination until `notAfter`. The records digest binds **which** records were in force; the owner's tool lists each record's id and plain text so the owner signs them knowingly, and a record that is a judgement (rights, search review, external links, domain) is therefore re-confirmed by the owner's act of signing.
* **Signature format:** OpenSSH `ssh-keygen -Y sign`, Ed25519 or hardware `ed25519-sk`, with **one namespace per statement type**: `sts-release-authorisation@v1`, `sts-release-revocation@v1`, `sts-release-workflow@v1` (3.4), `sts-release-recovery@v1` (key enrolment, rotation, revocation). The namespace stops cross-use; the channel and destination fields stop reuse for another channel or site. Verification is `ssh-keygen -Y verify` against an `allowed_signers` file held only on the owner's side; the in-repository gate uses Node's built-in Ed25519 `crypto` (confirmed available without dependencies; parsing the SSH signature envelope and the hardware-key variant are **untested here** because `ssh-keygen` is not installed in the sandbox and must be proven against real `ssh-keygen` output at implementation). Whether `allowed_signers` can require the hardware key's PIN (`verify-required`) is **unverified** here.

### 3.4 Provenance

A dedicated `release-build.yml`, separate from the development workflow (which stays read-only; `check:ci` forbids these permissions there today, so this is a **deliberate, owner-approved CI-policy change**):

* trigger `workflow_dispatch` only, **with no inputs**, GitHub-hosted runner only, actions pinned to full commit SHAs [Q27]; it uses **no repository variables and no cache**, so a dispatch of the pinned commit cannot be steered by attacker-chosen inputs or poisoned state (whether the certificate records such inputs is unconfirmed; the design removes them regardless);
* a **build job** with `contents: read` only runs the existing `release:prepare` path (gate and package verifier) and uploads the package, SBOM and verification record; an **attest job** with `id-token: write`, `attestations: write` (and `artifact-metadata: write` if required [Q48]) attests the package and the SBOM; no secrets, no deploy.

**The pin that makes property 3 real.** An attestation says "this workflow at this commit built these bytes"; if the agent can change the workflow, the statement can name the changed one and still be consistent. Therefore **the workflow path and commit are enrolled by a statement of type `release-workflow` that the owner signs once, after reading that file, and records outside the repository.** The owner-side verifier takes the workflow pin from the owner's record, never from the release statement, and a later change to `release-build.yml` is a new enrolment that the owner reviews as a code change. The mandatory owner **rebuild** (3.5 step 2) is the other half: the attestation proves origin; the rebuild proves that the origin's output is reproducible from the signed commit.

Verification command (owner side, offline-capable): `gh attestation verify <package> -R getsimplifiedtech/STS-Cinematic-Showcase. --signer-workflow <path> --signer-digest <enrolled workflow commit> --source-digest <commit> --source-ref <ref> --deny-self-hosted-runners --bundle <file> --custom-trusted-root <file> --format json` [Q49, Q15, Q18, Q16, Q50, Q17, Q52, Q51]; `--signer-digest` is documented only as "the digest associated with the signer workflow" [Q18] and is understood to be the workflow's commit (unverified wording). The JSON output is checked for the repository's **numeric id** (not only its name, so a deleted and re-created repository of the same name fails; the output field to read is to be confirmed at implementation). The trusted root is fetched when material is imported and its age is limited [Q14].

This is SLSA v1.0 Build Level 2 [Q05]. Level 2 links the artifact to its build instructions; it does not say the instructions are what the owner meant, which is what the enrolment adds. The reusable-workflow route to Level 3 [Q41] would not add independence while one account controls every repository, so it is **not claimed**.

### 3.5 End-to-end procedure

1. **Agent (repository):** implement and verify as today; run `release-build` on a commit; the package, SBOM, verification record and attestation bundle are produced. *No key involved.*
2. **Owner, rebuild context:** fetch the package and bundle, **rebuild the candidate from the commit** and compare digests with the CI output.
3. **Owner, signing context:** run the owner-side statement tool on the copied-in data; it checks the enrolled pins, recomputes every statement field, shows the plain-text rendering, the records, the `trustCriticalDelta` and the package preview; the owner signs with the key (hardware touch).
4. **Owner, deploy context (G6-4 onward, not now):** the owner-run deploy script **copies the package once, verifies that copy, and deploys only from the verified copy** (no check-then-use gap). It verifies: (a) the signature over the exact statement bytes against `allowed_signers`, namespace and re-serialisation equality; (b) channel and destination; (c) the validity window (including the 14-day maximum) and that `serial` is the highest seen for the channel; (d) the ledger and revocations (3.8); (e) the package SHA-256 equals the statement's artifact; (f) the attestation, with the pins in 3.4; any failure refuses. The signed set (package, statement, signature, bundle) is then published as an **immutable release** as an audit record [Q32, Q33].
5. **Revocation or expiry:** the owner signs a revocation; the ledger advances; any later verification fails.

### 3.6 How each required property is met

| # | Required property | Control | Rejection tests to build (negative) |
|---|---|---|---|
| 1 | Separate implementation from owner authorisation | The key never exists in any agent environment; the statement is generated and signed on the owner's side; the agent produces drafts and evidence only; deployment credentials are the owner's | Unsigned statement; statement signed by a key not in the owner's `allowed_signers`; a key added to the in-repository key table only; a statement generated from an agent-supplied draft without recomputation |
| 2 | Bind approval to the exact artifact digest | Statement carries artifact and candidate digests, commit, evidence, records, destination | One-byte change in the package; different candidate, record set, commit, destination; non-canonical or duplicate-key statement bytes |
| 3 | Authenticate the build and provenance | Attestation from the **owner-enrolled** workflow and commit, repository id, ref, runner type; rebuild comparison | Attestation for another file, workflow path or commit, repository (including same name, different id), ref or a self-hosted runner; tampered bundle; stale trusted root; workflow changed without a new enrolment; a dispatch with inputs |
| 4 | Reject forged, revoked, stale or mismatched | Signature, per-type namespaces, `notAfter` and the 14-day cap, serial and highest-seen state, hash-chained ledger and `ledgerHead`, digest recomputation | Forged signature; wrong namespace; expired; not yet valid; window over 14 days; revoked serial, candidate, key; superseded serial and rollback to an older authorised candidate; replay on another candidate, channel, domain; missing, stale or rolled-back ledger; missing field; unknown schema |
| 5 | Untrusted workflows and ordinary write access cannot manufacture owner approval | No key or approval secret exists in GitHub; attestation never counts as authorisation; the owner-side verifier and its pins are outside the repository | A change to the gate, policy, key table, verifier or workflow that makes the in-repository check pass is still refused by the owner-side check; an environment approval alone is refused |
| 6 | Preserve the hard stop until proven | 3.7 | The stub keeps refusing until the recorded sequence has happened |

### 3.7 The hard stop

* **Today:** `lib/authenticity.mjs` reports "not implemented"; the gate and package verifier judge it for every client-production build whatever the policy lists; `prepare` deletes a package the verifier refuses. This design does not touch it.
* **What the stop is, and is not.** The in-repository stop is an **interlock against accidents and honest mistakes**: a session with write access could edit it, so it is not security. The **unforgeable stop is the missing owner signature plus deployment credentials and routes that only the owner controls** (3.8): without them nothing can be deployed whatever the repository says.
* **It lifts only when all of these have happened, in order:** (1) the owner approves the mechanism (section 5); (2) an implementation work package is separately authorised; (3) the negative tests above pass in the release dry run with **ephemeral throwaway keys created inside the test process, never a real key**; (4) a **human or otherwise independent reviewer** (an AI session that works with the sessions is not independent) reproduces the build and attacks the verifier; (5) the owner enrols the real key and the workflow pin; (6) the owner records in the approvals ledger the decision to lift the stop. Until then the stub stays and the reviewer table stays empty.

### 3.8 Keys, ledger, credentials and deployment routes

* **Key custody.** The signing key is generated on the owner's device, preferably a FIDO2 hardware key (`ed25519-sk`, touch and PIN) so it cannot be exported; otherwise a passphrase-protected Ed25519 key on a device no session reaches (no shell, no computer-use, no `ssh-agent` a session can talk to). Private material is never pasted into a conversation, committed, placed in a GitHub secret, or given to a workflow; **a session that is shown a private key means compromise: revoke and re-enrol**. The tooling refuses to read a private key path.
* **First enrolment.** The fingerprint comes only from `ssh-keygen -l` on the owner's device and is recorded by the owner outside the repository; `allowed_signers` exists only on the owner's side. The repository holds public keys for convenience (`engineering/release/owner-keys.json`, to be created at implementation) but is never the source of trust.
* **Backup and recovery.** A backup key is enrolled as a **recovery-only signer**: `allowed_signers` restricts it to the `sts-release-recovery@v1` namespace, so it can rotate or revoke keys but cannot authorise a release. On compromise of a key, every statement it signed that has not already been deployed is treated as invalid and must be re-signed by the new key; already deployed releases stay in the history.
* **Ledger.** The owner-held ledger (on the owner's device, backed up by the owner; **not** the repository's approvals ledger) is append-only and hash-chained: each entry (authorisation, revocation, enrolment) includes the previous entry's hash. Every new statement carries `ledgerHead`. The deploy-context verifier keeps its own record of the highest `serial` and latest head it has accepted per channel and refuses a lower serial or an older head, so withholding a revocation or presenting an old authorised candidate fails; an absent ledger fails.
* **Deployment credentials and routes.** Hosting and deployment credentials stay in the owner's provider account or device, **never as GitHub repository, organisation or environment secrets** (write access reads repository secrets [Q25]; an admin can reconfigure environments [Q19]). Before any deployment is attempted, the owner **inventories and removes every route from the repository or the sessions to a host**: Pages, host Git integrations tied to the repository, deploy keys, webhooks, bot accounts, and any connector or credential the sessions hold that can publish to a host (this session lists website-publishing and store connectors, for example). If such a route exists, a push could deploy with no signature, and the signature would not matter.

### 3.9 Two provenance modes

* **Mode A, attested (this repository, public):** as 3.4.
* **Mode B, owner-reproduction (private client repositories without Enterprise Cloud [Q01]):** no attestation; the owner rebuilds the candidate from the signed commit with the pinned toolchain in the rebuild context and the statement records `build.mode = owner-reproduction` with the reproduced digest. Weaker against a compromised owner device, stronger against a compromised GitHub account; free.

## 4. What is independent of the repository, and what is not

The **authority** (owner signature, ledger, pins, deploy-time check) and the **provenance check** (`gh attestation verify`, OpenSSH) use tools independent of this repository. The **owner-side statement tool and deploy script are repository-derived code**: they must be small, reviewed once by a human, versioned like the workflow, and their SHA-256 recorded by the owner outside the repository; an update is a new review. The **content digests** (candidate, records, SBOM, engine) are defined by repository code and are recomputed by that code at the signed commit, in CI and in the owner's rebuild. Independence therefore covers *who authorised* and *where the bytes came from*; it does not cover *whether the repository's rules for judging content are right*, which rests on tests, reviews and the owner's own inspection of the package preview.

## 5. Step 3: decision checkpoint

### 5.1 Recommended mechanism

Section 1 point 4: a **signed, owner-generated release authorisation statement as the authorisation root; a build-only attested workflow whose workflow and commit the owner has enrolled for provenance; GitHub settings as defence in depth; authoritative verification on the owner's side enforced at the owner-run deploy step**, with the hard stop kept until the sequence in 3.7 is complete.

### 5.2 Prerequisites (owner actions; none was done or can be done by a session)

1. Choose the key custody (D2) and generate the key on that device.
2. Review in GitHub (Settings, Applications) the permissions and repository access of the GitHub App the sessions use [Q38]; decide whether it should keep administration and workflow-write permissions. De-authorising the app deactivates its tokens [Q39].
3. Confirm the organisation plan and who the organisation owners are (not readable from here; an organisation owner has powers beyond repository admin).
4. Inventory and remove every route from the repository or the sessions to a host (3.8) and decide where deployment credentials will live (D3).
5. Prepare the rebuild virtual machine and the signing device (3.2).

### 5.3 GitHub settings (the owner applies; none was applied)

| Setting | Recommended value | What it gives | What it does not give | Cost |
|---|---|---|---|---|
| Ruleset on `main` and `release/*` tags | Block force pushes and deletions; restrict tag creation and updates; **empty bypass list** [Q43, Q44, Q45] | Protection against accidents; an audit signal | Protection against the account's own credential (an admin can edit or delete it [Q30]) | Listed as available for public repositories [Q04] |
| Workflow permissions | Default `GITHUB_TOKEN` read-only; "Allow GitHub Actions to create and approve pull requests" off | Smaller blast radius for any workflow | Anything against a workflow author with write access [Q25] | None stated |
| Action pinning | Pin to full commit SHA (done in G6-1); enable the policy requiring it where offered [Q27] | Blocks a moved tag | | None stated |
| Environment `release-build` (optional) | Restricted refs; no secrets; **not counted as authorisation** | An audit record; the attestation records the environment [Q11] | Owner approval (one account) [Q20, Q21, Q24] | Listed as available for public repositories [Q03] |
| Immutable releases | Enable for publishing the signed set; future releases only [Q34]; note that a published tag name cannot be reused [Q32], so name tags with the serial | Tag and assets locked; release attestation [Q33] | Authorisation | Plan availability **unverified** |
| CODEOWNERS and required reviews | **Do not enable while there is one account** | Nothing useful: the author cannot approve their own change, so it would block everything or be bypassed | | |
| GitHub App permissions | Owner reviews and minimises [Q38] | Smaller session capability | | None stated |

### 5.4 Cost implications

* **GitHub:** the recommended design for this public repository needs no purchase and no new account. "Available" in the sources [Q02, Q03, Q04] and "free" [Q35, Actions minutes only] are different statements; the organisation's plan is unverified, so confirm in the billing page before relying on it.
* **Owner side:** a hardware security key is an optional purchase (price not quoted, not authorised); a second machine or disposable virtual machine for the rebuild; a human independent reviewer for 3.7(4).
* **Private client repositories:** attestations need Enterprise Cloud [Q01] and required reviewers on private repositories need an Enterprise plan [Q03, Q46]; the price is on GitHub's pricing page and is **not quoted**. Mode B avoids the cost.
* **Engineering effort** of the implementation is medium.

### 5.5 Residual risks (what this design does not remove)

1. **Compromise of the owner's signing device, key or PIN.** Mitigated by a hardware key with touch, a separate signing context, short validity, the ledger and revocation; not removed.
2. **The owner signs what a session built.** The owner reads a rendering produced by owner-side tooling, previews the package bytes and compares an independent rebuild, but the content is what the repository's rules and tests judged.
3. **A compromised `carlito3k` account or an organisation owner's account** can alter anything in the repository, recreate the repository, change settings and disrupt or withhold releases, but cannot sign for the owner, change what a signed statement covers, or deploy without the owner's credentials. A denial of service by burning a tag name (immutable releases [Q32]) is possible.
4. **Withholding or rollback** of the ledger is bounded by the owner's own chain and highest-seen state; the owner's device is then the single point of record.
5. **Trust in GitHub and Sigstore:** an attestation is only as good as GitHub's OIDC and Sigstore infrastructure; offline verification cannot see revocations since the trusted root was fetched [Q14]; attestations prove origin, not safety [Q10].
6. **First-enrolment trust** rests on the owner comparing a fingerprint on their own device.
7. **SLSA Build Level 3 is not claimed** (3.4).
8. **Unproven interoperability and unverified facts:** the SSH signature envelope, the hardware-key variant and `verify-required` were not tested against `ssh-keygen` here; the meaning of `--signer-digest`, the certificate fields that carry the repository id and whether dispatch inputs are recorded are unconfirmed; the plan and settings questions in 2.1 are unverified; the documentation was read as source files; a person should re-read the cited pages before final approval.
9. **Owner device shared with a coding agent** (shell, computer-use, a reachable `ssh-agent`) defeats the key custody; the signing and rebuild contexts must be agent-free.
10. **Other publish-capable connectors or credentials** available to sessions are deploy routes (3.8).
11. **Process risk:** nothing here has been built or attacked in code; the first implementation must pass the negative tests in 3.6 and an independent review before the stop lifts.
12. **Single owner:** loss of the key and the recovery key blocks releases; recovery is by re-enrolment through the ledger, never by an agent.

### 5.6 Decisions requested

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | Adopt the layered mechanism as the target | Layered (3.1 to 3.5); GitHub-only controls (not sufficient, 2.3); an owner-only second GitHub identity (needs your authorisation, not done) | **Layered** |
| D2 | Key custody | (a) FIDO2 hardware key `ed25519-sk`; (b) passphrase-protected software Ed25519 key on an agent-free device; both plus a recovery-only backup key | **(a) if you already own or choose to buy one; otherwise (b)** |
| D3 | Deployment credentials and routes | Owner-only, no repository-to-host route; or GitHub secrets | **Owner-only, never GitHub secrets**; inventory routes first (applies to G6-4) |
| D4 | Allow a dedicated `release-build` workflow (deliberate CI-policy change, `check:ci` amended) | Yes at implementation; no | **Yes, build-only, no inputs**, enrolled by your signature |
| D5 | Provenance for private client repositories | Mode B (owner reproduction); or buy Enterprise Cloud later | **Mode B**; revisit only if you decide to buy |
| D6 | Authority of verification | Owner-side check at the deploy step is the authority; the in-repository gate an interlock | **Yes**; you record outside the repository: the fingerprint, the enrolled workflow commit, the SHA-256 of the owner-side tool and deploy script, and the trusted-root date |
| D7 | GitHub settings in 5.3 | Apply which, when | **Apply the first three rows and the app review soon; the environment is optional; skip CODEOWNERS** |
| D8 | Reviewer table | Identify approvers by **key fingerprint**; `carlito3k` stays the account of record (ownership, billing, recovery) but not an approval identity | **Yes** (schema change at implementation) |
| D9 | Sequencing | Authorise the implementation as the next step of G6-3A before G6-4; or defer | **Authorise it, with the hard stop kept until 3.7 is complete** |

### 5.7 After your decision (proposal only)

Implementation would add: the statement, revocation, workflow-enrolment and recovery schemas and the owner-side tools (statement generation, review and verification); a real authenticity verifier behind the existing interface; `owner-keys.json`; `release-build.yml`; the owner-side deploy script; and the negative-test suite in the dry run using ephemeral keys. Nothing is started.

## 6. Scope compliance

Changed: the approvals ledger (`APR-JE-041`), the matrix (G6-3 closed, G6-3A inserted, decisions, open items, blocker allocation), the closure verifier, the plan and order documents, `CI.md`, this document and `g6-3a-evidence/`. **Unchanged:** every delivered file, the release gate and policy, `lib/authenticity.mjs`, the reviewer table (empty), the workflow, the package scripts, the lockfile, the master framework repository. No key, credential, secret, account or subscription was created. Nothing was merged or deployed; G6-4 was not started.

## 7. Adversarial read of this design

A separate AI reviewer attacked the first version. Every finding was checked against the text; those accepted changed this document:

* **Accepted, material:** the workflow pin came from the agent-prepared statement, so property 3 was overclaimed (now an owner-enrolled pin, 3.4, and property 3 is `part`); the owner's machine ran attacker-controlled build scripts and signed an agent-prepared statement (now three contexts and an owner-generated statement, 3.2, 3.3); "independent verifier" was overclaimed (section 4); no enforcement point or route inventory (3.5 step 4, 3.8); serial, rollback, ledger, rotation, backup-key, per-type namespace and first-enrolment rules were missing (3.3, 3.8); canonical JSON was not a real canonical form (byte-equality rule, 3.3); deploy-time check-then-use gap (3.5); repository recreation under the same name (numeric id, 3.4); records bound by digest only (3.3); dispatch inputs, variables and cache (3.4).
* **Accepted, citations and wording:** `-R`, `--source-ref`, `--bundle`, `--custom-trusted-root`, the six-reviewer limit, the three ruleset restrictions, the workflow link in the attestation, the Enterprise listing and the offline sentence now have their own quotations (Q42 to Q53); "initiate: observed" and "no branch is protected" were over-worded and are corrected; cost wording separates "available" from "free" and names owner-side costs; "needs" Level 3 reusable workflows is now "reached with"; an AI reviewer is not independent (3.7); additional residual risks added (5.5).
* **Not accepted as stated:** the claim that the certificate does not record dispatch inputs, variables or cache is unconfirmed, so it is handled by design (removed) rather than asserted.
