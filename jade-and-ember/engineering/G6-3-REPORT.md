# G6-3 completion report: requirement completion

Status: **implemented, verified locally, awaiting owner review.** Nothing was merged, deployed or published. The master framework repository was not modified. G6-4 was not started. No approval, evidence record, deployment authorisation, reviewer identity or media right was created or asserted: the reviewer table is still empty, `supply-chain-verification.json` holds no record, and every asset in the real rights inventory is still `unverified`. **This report does not say that client-production release authorisation is complete: it is not, and in particular no client-production release path exists** (section 4).

Authorised by APR-JE-040 (`docs/JADE_AND_EMBER_APPROVALS.md`), which also closed G6-2 as an engineering milestone and recorded the owner's decisions on reviewers, authenticity and `DEMO-JE-001`. Scope reconciliation (written before any implementation): `G6-3-SCOPE.md`. Evidence: `g6-3-evidence/`.

## 1. Scope reconciliation with the migration matrix

| Item | Disposition |
|---|---|
| External-link requirement (D-P5-1, RG-02, RB-10) | **Implemented** |
| Media rights bound to the inventory (D-P5-4, RG-03, RB-02 gate side) | **Implemented**; provider-terms evidence (D-P5-5) stays a person's task |
| Dependency and security requirements, composite SBOM (D-P6-5, D-P6-7, RG-10, RG-11, RB-11) | **Implemented** (update automation D-P6-4 is G6-7; download hash pinning D-P6-8 is deferred) |
| Crawler evaluation (D-P4-1) | **Evaluated, no policy assigned**: the provider pages were not reachable from the sandbox; `CRAWLER-EVALUATION-G63.md` |
| Approved social-image support (D-P4-3) | **Gate side only**: a guard that never adds an image; the generator side needs `src/` (denied) and belongs to the framework (G6-5/G6-6) |
| Credit-link correction (D-P5-3), Noto notice correction (D-P5-6) | **Not made**: they change delivered files and `APR-JE-040` does not authorise them; F-G5-05 stays open and keeps blocking a client release |
| Authenticity (RG-14, RB-15) | **Not implementable here; hard stop added; blocking architectural gap documented** (section 4) |

## 2. What was built

* **External links.** The destination list is derived from the files the release *delivers* (build input and the site's own origin are not destinations) and hashed (`release:external-digest`). The client-production requirements are: a verification record from a networked run (`github-actions` or `person`, never `sandbox`) that covers exactly that list, at most 30 days old, every clickable link verified over https with no http hop and no reserved, preview or staging host; and a person's `external-links-review` record (new type, prefix `EXTL`) bound to the candidate, the list digest and the verification record id. A printed mention can be accepted by name, a clickable link never. A URL inside any tag is a link in every form (unquoted, split, `srcset`, `formaction`, meta refresh, protocol-relative, entity-encoded, CSS `url()`). The old crash on a missing registry is gone.
* **Media rights.** A rights verification now carries `subject.inventory` (the digest of the delivered media and fonts, `release:rights-digest`) and `subject.basis` (`licence`, `permission` or `ownership`: authorised use is enough). `mediaRightsInventory` requires every image and video verified by an *in-force* record, fonts with their licence text and an agreeing notice, every term reviewed, F-G2-01 and F-G5-05 closed; an inventory kind must match the file (directory, extension, WOFF2 magic). A rejected or revoked record un-verifies everything it covered in every ordering tested. `socialImageRights` refuses an off-site or unverified image in a social card, icon, `<img>`, `srcset` or JSON-LD.
* **Dependency and supply chain.** `dependencySecurity`: a supply-chain verification for this lockfile (`supply:record` runs `npm audit` and `npm audit signatures`), at most 30 days old, no high or critical advisory, every other advisory excepted in `dependencies.json` with a plan and an unexpired review of at most 90 days (judged at release time, so an old exception never breaks an ordinary run), registry signatures for every locked package. `dependencyPolicy` (pins, lockfile integrity, SPDX licence expressions with parentheses, engines) and `supportedRuntimes` (every workflow file; the Node 24 Actions pinned to commit SHAs) are release requirements.
* **Composite SBOM.** `lib/supply.mjs` builds one deterministic CycloneDX 1.5 document: every delivered file with SHA-256, fonts with licence and notice, media with rights status, the 128-package tooling tree in development scope, the environment. No timestamp, no random serial; `release:sbom` prints it, `prepare` writes `sbom.cdx.json` and lists it in `SHA256SUMS.txt`, the gate and the package verifier regenerate and compare it, and `npm run verify` prints its digest so a local run and the CI log can be compared.
* **Package verifier.** It re-judges the new requirements from the package itself (the verification histories, dependency register and rights inventory travel in `records/`; the first two are listed by hash in the manifest, the others are covered by the candidate), judges freshness at release time, and `prepare` now deletes any package the verifier refuses.
* **Authenticity.** `lib/authenticity.mjs` is a hard stop in code: it reports "not implemented" for every build. The gate judges it for every client-production build whatever the policy file lists, the package verifier judges it unconditionally, and the policy check refuses a policy without it.

New files: `lib/external-gate.mjs`, `supply.mjs`, `social.mjs`, `authenticity.mjs`, `tools/supply-chain.mjs`, `supply-chain-verification.json` (empty), `G6-3-SCOPE.md`, `CRAWLER-EVALUATION-G63.md`. Changed: the gate, records, candidate (a `dependencyPolicy` part), package verifier, manifest schema, policy, fixtures, cases, dry run, self-tests, the external collector, `release` and `external-links` tools, `package.json` scripts, documentation. No page, style, font, media file, configuration or client-facing content changed, `src/` is untouched, and the delivered-files tree hash is unchanged.

## 3. Before and after: RG-02, RG-03, RG-10, RG-11

Measured by the same probe against the G6-1 base (`0d71064`), the G6-2 tree (`485e513`) and this tree (`g6-3-evidence/before-after.md`). All records are invented, inside a throwaway copy.

| Finding | G6-1 base | G6-2 tree | G6-3 tree |
|---|---|---|---|
| **RG-02** no external-link requirement | ALLOWED | blocked only because the candidate computation crashed on a missing file | BLOCKED by `externalLinks`; 20 scenarios |
| **RG-03** rights not bound to the inventory | ALLOWED | ALLOWED | BLOCKED by `mediaRightsInventory`; 14 scenarios |
| **RG-10** advisories not a release requirement | ALLOWED | ALLOWED | BLOCKED by `dependencySecurity`; 13 + 1 scenarios |
| **RG-11** no SBOM, provenance or runtime requirement | ALLOWED | ALLOWED | BLOCKED by `sbomVerified` and `supportedRuntimes`; 10 scenarios |

Dry run: 319 of 319 scenarios behaved as written down in advance (RG-01 to RG-14 groups, external-links 16, rights 10, social 4, supply 17, authenticity 2, package 65). Open probes: RG-08 (authenticity residual) and RG-12 (G6-4).

## 4. Authenticity: allocation and the blocking architectural gap

*Decision D-G62-2 and the evaluation are in `G6-3-SCOPE.md` section 5; the facts about GitHub plans come from search summaries because docs.github.com is not reachable from the sandbox, and a person must re-read them at the source.*

* **Which controls belong to a subsequent work package.** All of them: GitHub artifact attestation from a dedicated release workflow (`id-token: write`, `attestations: write`; private repositories need GitHub Enterprise Cloud per the summaries), a protected environment with required reviewers and self-review prevention (a paid plan for private repositories), owner approval bound to those, and the detached owner signature as the fallback. They need a deliberate CI-policy change and the owner's GitHub settings, which no current work package covers (G6-7 is the nearest fit but comes after hosting, de-coupling and extraction).
* **Blocking architectural gap (RG-14, RB-15, OI-4).** The Gate 6 plan allocates authenticated release authorisation and build provenance to **no** work package, so nothing in the plan enforces it before a client-production release. What G6-3 added is the *enforceable point*: the hard stop above. It stops a release; it does not implement the control.
* **Identity finding.** The only collaborator on the repository is `carlito3k` (admin), and every Claude session pushes through that same account, so a GitHub account does not distinguish the owner as a person from a session. The reviewer table therefore stays empty, and "prevent self-review" would not help with a single account.
* **Decisions requested:** (1) which work package implements authenticated release authorisation and provenance, and where it sits relative to G6-4 to G6-8 (suggestion: a new package before any client release is considered); (2) the GitHub plan, the repository's visibility, and whether the owner will create a separate owner-only identity or accept detached signatures as the primary control; (3) the GitHub identities to enter in the reviewer table.

## 5. Independent adversarial review

An independent reviewer (read-only, scratch copies, about 56 source mutations) attacked the implementation. Findings and dispositions:

| # | Finding | Disposition |
|---|---|---|
| F1 HIGH | the authenticity hard stop applied only if the policy listed it; a policy edit plus a re-sealed record let the gate and `prepare` pass | **Fixed**: judged for every client-production build; `prepare` deletes a package the verifier refuses; new scenario |
| F2 MED | `supply:record` dropped advisories without a GHSA id and trusted one environment variable | **Fixed**: refuses, requires the Actions variables, says the label is self-reported |
| F3 MED | an image relabelled as a font skipped verification | **Fixed**: kind follows directory, extension and WOFF2 magic |
| F4 MED | unquoted, split, `srcset` and other forms of a link were classed as mentions or missed | **Fixed**: any URL in a tag is a link; CSS `url()`; protocol-relative; entity-encoded |
| F5 MED | the site's own origin was an external destination | **Fixed**: the site itself is not a destination |
| F6 MED | the social guard missed carriers and crashed on a bad escape | **Fixed**: real tag parser, more carriers, no crash; the remaining uncovered carriers are stated in the file |
| F7 | a good package failed verification 30 days later | **Fixed**: freshness judged at release time |
| F8 | SPDX expressions ignored parentheses | **Fixed** (parser) |
| F9 | record validation gaps, a pooled review accepted mentions | **Fixed** (duplicate urls, hops, counts, severities, acceptance only from the review that relies on the chosen record, newest record decides) |
| F10 | `external-links verify --write` guessed the runner | **Fixed** |
| F11 | only one workflow file was judged | **Fixed** (all judged; an extra file is a finding) |
| F12 | the demonstration registration was not tied to the ledger | **Fixed** |
| F13 | documentation names, missing-file behaviour, wording scan | **Fixed/stated**: names corrected; wording scan widened; a missing inventory or dependency register still stops the tool with an error (fail closed) rather than a reason |
| Mutations that survived (unlisted media file, package-level social, rights, review and supply checks, review plus rejection, weak safety-rule cases) | **Tests added**; each is now killed |

Accepted residuals: a verification history is evidence of a run, not proof of who made it, and a runner called `github-actions` in a file is not authenticated (RG-14); the SBOM is reproducible, not independent evidence unless a second party regenerates it (the CI log is that second party, see section 6); `decidedAt`, `reviewedBy` and similar fields are self-asserted; the package verifier still takes the findings list, the lockfile package count and the channel from the manifest.

## 6. Full verification and CI

* **Local, Node 24.21.0, Chromium 141, `STS_REQUIRE_AUDIT=1`, clean tree at `e1fa7cf`: `npm run verify` passed 40 of 40 checks in 22 min 1 s.** Verification record: candidate `c12ba050ac2cc12266aa32f0902db6a3bdb0fbe43c3dcd30e986bac66be54208`, engine `43ad82b956ca2259…`, seal `1c41b8bf56f45afd0a37e6ad5e2334bb26b283cb820d84a0193bdbb8517747bc`. The delivered-files tree hash is unchanged (`9061a227…`).
* **Release checks:** `check:release`: a fully approved client build passes; 170 of 170 single defects each block it, for the right requirement and, where it matters, with the right reason; 16 of 16 must-not-block cases do not; 8 of 8 demonstration defects block. `check:selftest-gate6`: 99 tests (reproducible SBOM, exception rules, newest-record-decides, tag forms, social carriers, licence expressions, the supply tool refusing an unrecordable advisory, the authenticity hard stop). **Dry run: 319 of 319 scenarios as expected.**
* **GitHub Actions (confirmed from the API).** Run 61, commit `e1fa7cf`: **all seven jobs successful**. Earlier G6-3 runs: 57 and 59 success at run level; 58 and 60 cancelled by the next push (not claimed as successes; run 60 has the same code as run 61). Run 56 (`485e513`, the G6-2 documentation head) passed all seven jobs, which confirms CI for the G6-2 documentation commits as the owner asked (the intermediate `0aebcb0`, run 55, was cancelled by the next push). `CI.md` has the table.
* **Independent reproduction.** `npm run verify` prints the composite SBOM digest. The GitHub runner's log and the local run print the same value, `a1dbdd1255ca2c2d6b733658e044b5e546071c7afce17b77032994a226830e43` (151 components), and the same candidate and engine digests: the artifact and its SBOM regenerate identically on a second machine. (An SBOM is independent evidence only when a second party regenerates it; the CI log is that second party here, and it says nothing about who built what.)
* Scope: `npm run gate6:scope -- G6-3` reports every change inside the authorised scope; `npm run gate5:closure` still SUPPORTS closure; `check:framework-matrix` is current (306 files).

## 7. Commit

Code and gate: `fa4d57c` (identical code in `e1fa7cf`, which adds this draft and the evidence). Branch `feature/jade-and-ember-v0.9`; the final documentation commit is the head of that branch. Not merged, not deployed; no pull request opened.

## 8. Remaining release blockers and open decisions

RB-02 (people: dated provider terms, 8 assets unverified), RB-01, RB-03 to RB-08 (people and client), RB-12 (hosting, G6-4), RB-14 (framework pin) and the new **RB-15 (authenticated authorisation and build provenance: no work package)** are untouched. RB-10 and the engineering side of RB-11 and RB-02 are addressed by G6-3 as stated above; RB-11's update automation (G6-7) is not. RG-08's authenticity residual, RG-12 (G6-4) and RG-14 remain open.

Human items that still prevent any client release: no reviewer is named or verified; no release approval, rights verification, search review or external-links review exists; no real-device, screen-reader, browser-matrix or CI evidence exists; no supply-chain or external-link verification has been recorded from a networked run for a release candidate; the crawler documentation has not been re-read by a person; the version is not stable and no real production domain is set.

**Decisions that need you:** the three in section 4, plus (4) who re-reads the crawler pages and authorises the one-line additions for DuckAssistBot and Meta-ExternalFetcher (`CRAWLER-EVALUATION-G63.md`), and (5) whether the credit-link and Noto notice corrections are to be authorised as their own change.

Stopped for owner review. G6-4 has not been started.
