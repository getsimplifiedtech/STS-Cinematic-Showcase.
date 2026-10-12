# G6-3 scope reconciliation and authenticity allocation (`APR-JE-040`)

Written before any G6-3 implementation, as the owner required. It reconciles what G6-3 is authorised to do with the migration matrix (`framework-migration-matrix.json`, `GATE-6-IMPLEMENTATION-ORDER.md`), says which items are **not** part of G6-3 and why, and records one **blocking architectural gap** (section 5) with the decision it needs. The authorised scope (allowed and denied paths) is recorded in the matrix and checked by `npm run gate6:scope -- G6-3`.

## 1. What the owner authorised and forbade

Authorised (`APR-JE-040`): G6-3 according to the approved Gate 6 plan: external-link verification, media-rights controls, dependency and security release requirements, composite SBOM verification and the other requirements the plan allocates to it; preserve every unresolved production release blocker; reconcile scope first; adversarial negative tests and independent reproducible verification; stop for review afterwards.

Forbidden: master-framework changes, merge, deployment, media generation, visual redesign, production approvals; inventing reviewer identities or human verification evidence; starting G6-4; weakening any release control. The credit-link correction (D-P5-3) and the Noto Serif SC notice correction (D-P5-6) change delivered files and are **not** authorised by `APR-JE-040`.

## 2. Reconciliation with the matrix

| Item (source) | Findings / blockers | Disposition in G6-3 |
|---|---|---|
| External-link requirement bound to the destination list (D-P5-1, APR-JE-034) | RG-02, RB-10 | **Implemented.** Gate requirement `externalLinks` for client production (informational for the demonstration): the destination list is derived from the built site and hashed; a verification record from a networked run (`github-actions` or `person`, never `sandbox`) must cover exactly that list, be at most 30 days old, and show every clickable destination `verified` over https; a new human record type `external-links-review` is bound to the candidate and the list. Safety rules: https only, no reserved/preview/staging host, no http hop. `release:external-digest` prints the digest. |
| Media rights bound to the asset inventory (D-P5-4) | RG-03, RB-02 (gate side) | **Implemented.** A rights verification now carries the digest of the delivered media and fonts and a closed `basis` (authorised use by licence, permission or ownership: ownership is not required); a new requirement `mediaRightsInventory` refuses a client build while any image or video is not `verified` by an in-force rights record, any term it points at is not reviewed, or F-G2-01 or F-G5-05 is not closed. Revoking or rejecting the record un-verifies everything it covered (negation-proof by construction). |
| Provider-terms evidence (D-P5-5), rights evidence itself | RB-02 (people) | **Not implemented, cannot be.** A person captures dated, authoritative terms. G6-3 invents none; the inventory stays `unverified`. |
| Credit-link `www` correction (D-P5-3), Noto notice correction (D-P5-6) | F-G5-05 | **Not made** (they change delivered files; not authorised). F-G5-05 stays open and, through `mediaRightsInventory`, keeps blocking a client release. |
| Dependency and security release requirements (D-P6-5, D-P6-7) | RG-10, RB-11 | **Implemented.** Exception register with `expires` and `plan`, evaluated at release time (not a development-time clock bomb); a supply-chain verification record bound to the lockfile (advisories, registry signatures); the dependency policy (pins, lockfile integrity, licences with SPDX expressions, engines) and the supported Actions and Node (the G6-1 rules) as release requirements. |
| Composite SBOM (D-P6-5) | RG-11, RB-11 | **Implemented.** `lib/supply.mjs` builds a deterministic CycloneDX 1.5 composite (delivered files with SHA-256, fonts with licence and notice, media with rights status, the tooling tree in development scope, the environment); `release:sbom` prints it; `prepare` writes it into the package; the gate and the package verifier recompute and compare it. |
| Crawler evaluation (D-P4-1; D-P4-4 stays a person's review) | RB-04 | **Evaluated, not decided** (section 4). |
| Approved social-preview image support (D-P4-3) | none | **Gate side only** (section 4): a client build may carry a social image only if the asset is delivered, inventoried and rights-verified. The generator side belongs to the reusable framework (G6-5/G6-6); it needs `src/`, which G6-3 may not change. |
| Security patch automation (D-P6-4), download hash pinning (D-P6-8), hosting (D-P3) | RB-11 rest, RB-12 | **Not G6-3** (G6-7, G6-7 and G6-4). |
| Authenticity (RG-14, RB-13 provenance, RB-15) | RG-14 | **Not implementable in G6-3; fail-closed requirement added; blocking gap documented** (section 5). |

## 3. Controls added (summary; the report has the evidence)

New client-production requirements: `externalLinks`, `externalLinksReview`, `mediaRightsInventory`, `socialImageRights`, `dependencyPolicy`, `dependencySecurity`, `sbomVerified`, `supportedRuntimes`, `authenticity`. Every one blocks the real client-production gate today, and each has a single-defect blocking scenario in `check:release` and `check:release-dryrun` plus must-stay-valid cases. The demonstration keeps its own requirements; the new ones are informational there.

## 4. Crawler and social-image decisions

* **D-P4-1 crawler evaluation.** The owner asked to evaluate DuckAssistBot and Meta-ExternalFetcher after verifying the **official** documentation. The documents are provider pages that must be read and dated by a person (D-P4-4). Where this sandbox can reach them, the report lists what was read, clearly marked as an engineering reading and not the human review; where it cannot, it says so. No policy is assigned to either crawler on the strength of a search summary.
* **D-P4-3 social image.** `socialImageRights` is a pure guard. It never adds an image.

## 5. Authenticity: which controls belong to a later work package, and the blocking gap

**What the owner decided (`APR-JE-040`).** Client-production releases must eventually require authenticated authorisation and independently verifiable build provenance. A JSON record, a commit SHA, a digest or a manually supplied CI URL is not proof of authenticity. No client-production release path may be enabled until the requirement is implemented and independently verified. Preferred architecture: GitHub artifact attestations, protected environments and owner approval; detached owner signatures if those cannot satisfy the trust boundaries.

**Evaluation (the sandbox cannot reach docs.github.com; the facts below come from search summaries of GitHub's documentation on 2026-10-11 and must be re-read at the source by a person before any design is final).**

| Control | What it would prove here | Requirement / limit |
|---|---|---|
| **Artifact attestation** from a dedicated release workflow (`actions/attest`, `id-token: write`, `attestations: write`, `contents: read`) | The package digest was produced by a named workflow in this repository at a commit (build provenance, signed through Sigstore); verifiable with `gh attestation verify` against the repository and signer workflow | Private or internal repositories need **GitHub Enterprise Cloud**; this repository's visibility and plan are unknown to me. The development workflow must never hold these permissions (`check:ci` forbids them today), so this is a separate, owner-approved workflow and a deliberate CI-policy change |
| **Protected environment** with required reviewers (and "prevent self-review") | A named GitHub account approved the release job before it ran; the approval is recorded by GitHub, not by a file in the repository | Required reviewers on private repositories need a paid plan (Enterprise per the sources I could read). **Observed: the only collaborator is `carlito3k` (admin), and every Claude session pushes through that same account (workflow runs and commits show it as the actor).** A GitHub account therefore does not distinguish the owner as a person from a Claude session using the owner's credential; "prevent self-review" cannot help while there is a single account |
| **Owner approval record** | The owner decided | A file in the repository proves nothing about who wrote it (RG-14); bound to an attested workflow run or a signature it becomes meaningful |
| **Detached owner signature** (Ed25519 or `ssh-keygen -Y`) over the manifest and the record set, key held by the owner outside this environment | The holder of the key vouched for exactly this set, whatever created the files | Needs the owner's key custody and a published public key; costs nothing; offline verification; does not prove build provenance |

**Recommended architecture (for the owner's decision).** Layer the controls, because they prove different things: (1) provenance: an attestation (or, if the plan does not allow it, a signature over the build log is not equivalent, so state the gap) from a release workflow that only builds, verifies and attests, with no deploy rights; (2) authorisation: a protected environment whose required reviewer is a **separate GitHub identity controlled only by the owner** (not the account Claude pushes through), with "prevent self-review"; (3) a detached owner signature over the manifest and record set as the independent, offline-verifiable fallback and as the cross-check if the plan or identities cannot satisfy (1) and (2). The gate then verifies, offline where possible, that the package digest has a valid attestation from the pinned workflow identity and a valid owner signature, and refuses everything else.

**Where it belongs in the plan, and the gap.** The current Gate 6 plan allocates none of this to a work package: G6-2 only *evaluated* it (RG-14 stayed open), G6-3 is requirement completion, and G6-7 (centralised GitHub automation: reusable workflows, the deliberate CI-policy change) is the nearest fit but comes after hosting adapters (G6-4), de-coupling (G6-5) and extraction (G6-6), with independent validation in G6-8. Nothing in the plan therefore *enforces* authenticity before a client-production release: **this is a blocking architectural gap (RG-14, RB-15, OI-4).**

**What G6-3 does about it (without deciding it).** It adds a hard stop. `authenticity` is a client-production requirement implemented by `lib/authenticity.mjs`, whose verifier is **not implemented and always reports so**; it is code, not a policy flag or a file anyone can edit into a pass. The gate judges it for every client-production build **whatever the policy file lists** (the independent review showed that a policy edit could otherwise drop it; the policy check also refuses a policy without it), the package verifier judges it unconditionally, and `prepare` deletes any package the verifier refuses, so no client-production package can be written. The dry run proves a fully green build is blocked by it alone. A client-production release path therefore cannot exist until a work package replaces that verifier with a real one. It also keeps the reviewer table empty.

**Decision requested from the owner.**
1. Which work package implements authenticated authorisation and provenance (suggested: a new package ahead of G6-4, or pulled forward from G6-7 as "authenticated release", before any client release is considered), and in what order relative to G6-4 to G6-8.
2. Whether the GitHub plan and repository visibility allow attestations and required reviewers, and whether the owner will create a separate owner-only GitHub identity (or accept detached signatures as the primary control).
3. The GitHub identities to enter in the reviewer table. Until then it stays empty.

## 6. Identities observed (read-only)

GitHub account `carlito3k` (id 233489690), role `admin`, the only collaborator on `getsimplifiedtech/STS-Cinematic-Showcase.`; the actor and triggering actor of every workflow run in this session. Nothing was changed on GitHub. No reviewer is entered in `release/reviewers.json` because the owner has not named one and one account cannot separate the owner from a Claude session.
