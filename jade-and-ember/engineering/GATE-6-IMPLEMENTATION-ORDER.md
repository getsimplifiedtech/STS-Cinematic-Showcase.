# Gate 6 implementation order, dependencies and release blockers (Gate 5 Phase 8, `APR-JE-036`)

> **G6-4 closure and G6-5 authorisation (2026-10-12, `APR-JE-046`).** G6-4 is closed by the owner as an engineering milestone (commit `187f672`, Actions run 77 with all seven jobs passing, local verification 40 of 40); every production-release blocker and every live-host verification requirement stays open (RB-12 needs the separately authorised preview). **G6-5 (de-coupling refactor in Jade & Ember) is authorised** according to the work package below, within the scope recorded in `framework-migration-matrix.json` (it is recorded as changing no framework repository; any operation that would modify the master framework repository stops for the owner's approval). The one approved requirement assigned to G6-5 is D-P4-2 (industry-specific structured-data schemas). G6-0 (the specification) was not run first, as for G6-2; the project manifest schema written in G6-5 is the implementation reference that G6-0 will specify. G6-6 onward remain unauthorised.

> **G6-5 closure and G6-6 authorisation (2026-10-12, `APR-JE-047`).** G6-5 is closed by the owner as an engineering milestone (commit `dfb7fc4`, Actions run 84 with all seven jobs passing, full verification 42 of 42). **G6-6 (extraction into the framework repository) is authorised** on the development-only branch `feature/sts-engineering-framework` of `getsimplifiedtech/sts-web-design-framework`, created at the approved base `f05f41f` (new files only; the 15 frozen specifications, the README and every existing branch untouched; no merge, tag, deployment or publication). It includes the specification (`architecture/16-engineering-framework-v1.md`) with independent review before code, the extraction with source hashes and proven initial byte parity, the separation of standards from project records, and a generic fixture that runs the full verification pipeline independently. OI-1 and OI-2 stay deferred. `main` had advanced to `924d025` when the base was verified (recorded, not adopted). The skill branch `feature/anthropic-frontend-design-standard` (`d2803c0`) is recorded for later reconciliation. G6-7 and G6-8 remain unauthorised.

> **G6-5 implemented (2026-10-12, awaiting owner review).** Report: [`G6-5-REPORT.md`](G6-5-REPORT.md); parity evidence: [`g6-5-evidence/`](g6-5-evidence/README.md). Full local verification 42 of 42, delivered tree hash `9061a227…` unchanged; the master framework repository was not touched; G6-6 is not authorised and has not been started.

> **G6-3A update (2026-10-12, `APR-JE-041`).** G6-3 is closed by the owner as an engineering milestone. The owner resolved the blocking gap recorded in `G6-3-SCOPE.md` by inserting **G6-3A (release authentication and provenance)** between G6-3 and G6-4; it is authorised for research, architecture and a decision checkpoint only (`G6-3A-DESIGN.md`), and nothing credential-dependent may be implemented before the owner approves the mechanism. G6-4 now depends on G6-3A. G6-4 onward remain unauthorised.

> **G6-3 update (2026-10-11, `APR-JE-040`).** G6-2 is closed by the owner as an engineering milestone (client-production release authorisation is not complete). G6-3 is authorised; its scope is reconciled with this document in `G6-3-SCOPE.md`, which also records a blocking architectural gap: **no work package in this plan implements authenticated release authorisation and build provenance (RG-14, RB-15)**. G6-4 onward remain unauthorised.

> **G6-2 update (2026-10-11, `APR-JE-039`).** G6-1 is closed by the owner. G6-2 (release model v2) is authorised according to this document, with nine required controls (record `APR-JE-039`) and the instruction to stop and present alternatives for any part of the trust model that cannot be resolved safely from the approved architecture. G6-0 was not run first; G6-3 onward remain unauthorised.

> **G6-1 update (2026-10-11, `APR-JE-038`).** G6-1 is authorised and delivered for review (`G6-1-REPORT.md`). Corrections to the G6-1 paragraph below: the Actions pinned are `actions/checkout` v7.0.1 (`3d3c42e5…`) and `actions/setup-node` **v7.0.0** (`82076278…`, not v7.1.0), and the Lighthouse thresholds are asserted on the **median** of three runs, whereas Lighthouse CI actually used the optimistic aggregation (not the median, as the Phase 6 documents said); the median is never kinder than the optimistic method. G6-2 and later remain unauthorised.

**A proposal. Nothing here is authorised or implemented.** The owner's required Gate 6 priorities (`APR-JE-036`) are recorded as requirements; the owner said not to implement them yet. The work packages, their order and their dependencies are **recommendations**; the dependency graph and the register behind this document are machine-checked (`check:framework-matrix`: no cycles, every reference resolves, every finding RG-01 to RG-14 and every decision D-P3 to D-P6 is assigned). The generated tables are in [`FRAMEWORK-MIGRATION-MATRIX.md`](FRAMEWORK-MIGRATION-MATRIX.md) sections 3 to 6; this document gives the reasoning.

## 1. The owner's eight priorities and where they land

| Priority (APR-JE-036) | Work package |
|---|---|
| P-1 Release model bound to an immutable candidate artifact digest, approvals and CI evidence recorded separately | G6-2 |
| P-2 Structured approval records with explicit statuses, reviewer authorisation and revocation | G6-2 |
| P-3 Complete, authentic verification evidence associated with the candidate artifact | G6-2 |
| P-4 Positive production-domain authorisation | G6-2 |
| P-5 The previously approved external-link, media-rights, dependency/security and hosting requirements | G6-3 (and G6-1, G6-4) |
| P-6 Evaluate package attestation or signing before finalising the release architecture | G6-2 (design step 2a, before implementation) |
| P-7 A restricted demonstration channel that cannot masquerade as client production | G6-2 |
| P-8 Retain the blocking release dry run | G6-2 (and every later package) |

## 2. Order and dependencies

```
G6-0 decisions + specification (documents; framework repo only with approval)
  └─ G6-1 runtime and tooling hygiene (Node 24, Actions, direct Lighthouse, licence evidence)
        └─ G6-2 release model v2   (2a design + attestation evaluation -> owner approval -> 2b implementation)
              ├─ G6-3 requirement completion (external links, rights binding, security/SBOM, crawler, images)
              │     └─ G6-3A release authentication and provenance (APR-JE-041; design and decision checkpoint first)
              │           └─ G6-4 hosting adapters and requirements (also needs G6-2)
              └──────────────┐
                 G6-5 de-coupling refactor in Jade & Ember (needs G6-0, G6-2, G6-3, G6-4)
                    └─ G6-6 extraction into the framework repository (branch; owner approval)
                          ├─ G6-7 centralised GitHub automation
                          └─ G6-8 consumption and independent validation (needs G6-6 and G6-7)
```

Dependency order produced by the checker: G6-0, G6-1, G6-2, G6-3, G6-3A, G6-4, G6-5, G6-6, G6-7, G6-8.

**Why the refactor comes after the release model (R-08).** Release gate, evidence and dry-run code (FM-18, FM-19, FM-20) is the code that changes most, and it is also the code with the strongest safety net (112 blocking scenarios). Changing it first, in place, keeps that net intact; moving it and then changing it would mean proving parity twice. The alternative (refactor first) is safer for the *mechanical* checks and is the owner's call (D-P8-5).

**What can run in parallel (R-09).** G6-1 is independent of the release design once G6-0 settles the Node baseline. Inside G6-3, the external-link and the dependency/security requirements are independent of each other. G6-4's provider-documentation re-verification (D-P3-6) is a person's task that can start as soon as the owner names that person.

## 3. Work packages

Size is relative (S, M, L); no calendar estimate is made.

### G6-0 Decisions and specification (S; documents only)
- **Inputs:** the owner's answers to D-P8-1 to D-P8-10.
- **Outputs:** `architecture/16-engineering-framework-v1.md` and the project manifest schema (`sts.engineering.json`); the engineering's place in a Framework Release (spec 14); proposals for the spec 15 extension and the engineering namespace (to go through the framework's review process); the builder-scope and visual-package rulings written down.
- **Framework repository:** changed only with the owner's explicit approval, on a branch.
- **Verification:** independent review; every statement traces to a check or a requirement id; the manifest schema validates a hand-written Jade & Ember manifest.
- **Clears:** part of RB-14.

### G6-1 Runtime and tooling hygiene (S)
- **Content:** verify Node 24 against the full suite; move to verified Node 24-compatible Actions (checkout v7.0.1 `3d3c42e…`, setup-node v7.1.0 `949feb2…`, recorded in the Phase 6 assessment); replace `@lhci/cli` with a tested direct Lighthouse runner (thresholds: performance 0.8 warn, accessibility 0.95 error, best practices 0.9 warn, SEO 0.6 warn, three runs, median); the `parse-cache-control` licence evidence; make `engines` truthful.
- **Verification:** full verify and three engines green on Node 24; `npm audit` reports 0 in the installed tree (measured at 0 advisories for `lighthouse@13.5.0` used directly in Phase 6); policy check updated and passing.
- **Clears:** part of RB-11 (the 17 development advisories).
- **Needs:** authorisation to run (D-P8-6); approved in principle by D-P6-1 to D-P6-3 and D-P6-6.

### G6-2 Release model v2 (L)
**2a Design (documents; owner approval before 2b).**
1. *Candidate artifact digest* (P-1): one SHA-256 over a canonical list of what a release is: the delivered-file tree hash, the configuration digest, the release and security policy digests, the search-artifact digest, the media-rights inventory digest, the external-destination registry digest, the framework pin and the engine versions. **Excluded**: approval records, evidence records and CI records (the spec 15 hash-domain rule), so recording them cannot change the digest. This dissolves RG-01.
2. *Records* (P-1, P-2): approvals, human evidence and CI evidence are three separate record types, each carrying the digest, a status (`approved`, `rejected`, `revoked`, `superseded`), `approved_by`, `approved_at`, a rationale, and reviewer authorisation (a table of who may approve which type). Revocation names who, when and why and invalidates what depends on it. The Markdown log becomes a rendering. Resolves RG-04 to RG-07.
3. *Authentic, complete verification evidence* (P-3): the report states the digest and every check the current runner defines, and must be produced by the CI run (RG-08). The CI record is bound to the digest, not to the commit (RB-13).
4. *Positive domain authorisation* (P-4): the release approval carries the production host and the gate requires it to equal `seo.baseUrl`'s host; the denylist stays as a second net.
5. *Restricted demonstration channel* (P-7): the demonstration has its own marker in the artifact (a visible and machine-readable statement that it is not a client site), may not carry client facts or a production domain, and a package built from client-style content cannot be labelled a demonstration (RG-13). This mirrors spec 03: placeholders "cannot be mistaken for approved production assets".
6. *Attestation and signing evaluation* (P-6), **completed before the architecture is final**: compare (i) no signature (today), (ii) signed git tags checked by the gate, (iii) provider-supported artifact attestations produced by a separate owner-approved release workflow (this needs permissions the development workflow must never have; the GitHub documentation must be re-read), (iv) an owner-held detached signature. Criteria: what each proves (consistency, authorship, build provenance), tools to install (restricted), permissions, cost, and whether a recipient can verify offline. Resolves RG-14 only by the owner's decision.
7. *Dry run* (P-8): one blocking scenario per finding RG-01 to RG-14 is written first (they fail against today's gate by construction, which the 12 existing probes already show), then the implementation makes them pass.

**2b Implementation** in Jade & Ember as the reference consumer; the delivered folder stays byte-identical.
- **Verification:** every RG finding becomes a scenario that blocks; the committed-ledger flow reaches green; a forged report, a rejected or revoked approval, a masquerading demonstration and a foreign domain are refused; `check:release-dryrun` stays in the blocking job.
- **Clears:** RB-09, RB-13.

### G6-3 Requirement completion (M)
- External-link requirement bound to the registry digest (D-P5-1; RG-02), human step `external-links-review`.
- Media rights bound to the inventory digest (D-P5-4; RG-03), negation-proof by construction (P-2); provider-terms evidence stays a person's task (D-P5-5); the Noto notice (D-P5-6) and the credit link (D-P5-3) **need their own authorisation** because they change delivered files, plus allowlist entries.
- Dependency and security requirements (D-P6-5, D-P6-7; RG-10, RG-11): an exception register with expiry, SBOM and signature verification as release requirements, supported Actions and Node as a check.
- Crawler evaluation (D-P4-1) and approved social-preview image support (D-P4-3).
- **Verification:** one blocking scenario per requirement; probes RG-02, RG-03, RG-10, RG-11 close; delivered folder unchanged except the two separately authorised corrections.
- **Clears:** RB-02 (gate side), RB-10, part of RB-11.

### G6-3A Release authentication and provenance (M; inserted by `APR-JE-041`)
- **Content:** authenticated client-production release authorisation and independently verifiable build provenance (RG-14, RB-15). Step 1 research against official GitHub documentation compared with detached owner-controlled signatures; Step 2 architecture; Step 3 decision checkpoint. **Design only until the owner approves the mechanism**; any credential-dependent implementation is a later, separately authorised step.
- **Outputs:** `G6-3A-DESIGN.md` and `g6-3a-evidence/`.
- **Verification:** each platform statement traces to an official source or is marked unverified; each of the six required properties maps to a control and a rejection test; the hard authenticity stop stays until the mechanism is implemented and independently verified.
- **Clears:** RB-15 (after implementation and independent verification, not by the design).

### G6-4 Hosting adapters and requirements (L)
- The adapter interface (already specified in `hosting/HOSTING-ADAPTER-INTERFACE.md`), Cloudflare Pages first, then Vercel and a static adapter; a real 404 (D-P3-1), domain-root base URLs (D-P3-2), the staged-bundle manifest and deployed-bytes comparison (D-P3-3), HSTS opt-in (D-P3-4, D-P4-5; RG-12).
- **Before any adapter:** a person re-reads the provider documentation and files a dated note (D-P3-6).
- **Live verification** needs a separately authorised preview (D-P3-5). Until it is authorised nothing about a live host can be claimed.
- **Verification:** golden outputs per adapter; the same folder passes `check:portability` under both; RG-12 closes.
- **Clears:** RB-12 (apart from the live preview).

### G6-5 De-coupling refactor in Jade & Ember (L)
- Project manifest, core/adapter split, generic fixture, project-check extension point, registry-driven runner.
- **Verification (parity):** all checks, delivered tree hash `9061a227…`, identical reports, all dry-run scenarios; self-test case counts reconciled; **no file moves to another repository in this step**.

### G6-6 Extraction into the framework repository (M)
- The core, adapters and fixtures as files on a framework **branch** (never `main`), with the framework's own CI running the generic fixture in three engines.
- **Needs** the owner's explicit approval to modify the framework repository.
- **Clears:** part of RB-14.

### G6-7 Centralised GitHub automation (M)
- SHA-pinned reusable workflows; a caller template; a generated per-repository `dependabot.yml` (human approval, no automatic merging; D-P6-4); scheduled supply-chain and external-link jobs and a read-only live-site check; the CI policy changed on purpose to allow them (F-11).
- **Verification:** a scratch repository containing only the caller workflow and the manifest runs the checks; the policy check passes on caller and reusable workflows; update pull requests never merge themselves.
- **Needs:** the owner's confirmation of the GitHub settings (D-P8-8). Nothing is installed on a client's hosting.
- **Clears:** the rest of RB-11. D-P6-8 (download hash pinning) is revisited here.

### G6-8 Consumption and independent validation (M)
- Jade & Ember consumes the framework at a pinned commit (M4); validation levels V1 to V4 recorded; the readiness checklist V5 completed before the first new project (MONOLITH House & Design) starts (M5).
- **Verification:** all four levels recorded, no engine check silently skipped, the checklist signed by the owner.
- **Clears:** the rest of RB-14.

## 4. Release blockers for a client-production release

Matrix section 6 is the register. In short:

| Kind | Blockers |
|---|---|
| **People** (engineering cannot supply them) | RB-01 a release approval for the exact build; RB-02 rights verification against dated, authoritative terms (8 assets unverified, 4 with licence text shipped); RB-03 a person's search review; RB-04 a person re-reading the crawler documentation; RB-05 real-device testing (0 records); RB-06 NVDA, VoiceOver and TalkBack passes (0 records); RB-07 manual desktop browser passes (0 records) |
| **Client** | RB-08 a stable version, the real production domain and the real content and facts |
| **Engineering** | RB-09 release model v2 (G6-2); RB-10 external-link requirement (G6-3); RB-11 security and dependency requirements (G6-1, G6-3, G6-7); RB-12 hosting requirements and a live check (G6-4 plus an authorised preview); RB-13 CI-evidence provenance (G6-2); RB-14 a pinned Framework Release (G6-0, G6-6, G6-8) |

Prohibitions that stay in force throughout: no preview or production deployment (D-P3-5) and no public demonstration deployment while media-use rights are unverified (D-P5-7).

## 5. Owner review points between packages (R-10)

1. After **G6-0**: the owner approves the specification and decides D-P8-1 to D-P8-4 before any framework-repository change.
2. After **G6-2a**: the owner approves the release-model design, including the attestation evaluation, **before** 2b starts.
3. After **G6-2b** and **G6-3**: the gate is demonstrably closed against every RG finding; the owner reviews the dry-run results.
4. Before **G6-4**: provider documentation re-verified by a person; the owner decides whether to authorise a preview.
5. After **G6-5**: parity proof reviewed.
6. Before **G6-6**: explicit approval to modify the framework repository, on a branch.
7. After **G6-8**: readiness checklist signed before MONOLITH House & Design begins.

## 6. What Gate 6 does not do

It does not change Jade & Ember's approved visual design, deploy, merge, generate media or assert any right, licence, device test or live-hosting result. It does not make the Anthropic Frontend Design authority part of the engineering; it pins it. It does not remove the people-evidence requirements. The blocking dry run stays.
