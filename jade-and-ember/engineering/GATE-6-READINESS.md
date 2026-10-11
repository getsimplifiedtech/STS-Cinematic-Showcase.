# Gate 6 readiness summary (Phase 9, `APR-JE-037`)

> **Update (`APR-JE-038`, 2026-10-11):** Gate 5 is closed and **G6-1 is authorised** within the scope recorded in the matrix (restrictions: no deployment, no merge into main, no extraction, no release-model redesign, no redesign or media change, no weakening of the CSP or release requirements, no automatic dependency merging, no paid services). The owner chose to authorise G6-1 ahead of G6-0 (the matrix lists G6-0 as a dependency; this page already noted G6-1 is independent of it). G6-2 onward remain unauthorised, and G6-2 may not start before the owner has reviewed the G6-1 completion report. The text below is the snapshot delivered for review.

**Status: a summary for the owner's review. It authorises nothing.** Gate 6 is **not authorised to start**. G6-1 is approved in principle (D-P8-6) and **will not start until you have reviewed [`GATE-5-CLOSURE-REPORT.md`](GATE-5-CLOSURE-REPORT.md) and said so**. The work packages, order and dependencies are in [`GATE-6-IMPLEMENTATION-ORDER.md`](GATE-6-IMPLEMENTATION-ORDER.md) and the generated [`FRAMEWORK-MIGRATION-MATRIX.md`](FRAMEWORK-MIGRATION-MATRIX.md); this page says whether Gate 6 can begin, what it begins with, and what it still needs from people.

## 1. Entry criteria

| # | Criterion | State | Evidence or owner action |
|---|---|---|---|
| E1 | Gate 5 closed by the owner | **Pending** | Your decision on the closure report |
| E2 | Phase 9 closure report reviewed | **Pending** | Required before G6-1 (your instruction) |
| E3 | Phase 8 decisions D-P8-1 to D-P8-10 recorded | **Met** | `APR-JE-037`; matrix section 7 |
| E4 | The eight Gate 6 priorities recorded | **Met** | `APR-JE-036`; matrix section 4 |
| E5 | Migration matrix and requirement register complete | **Met** | `check:framework-matrix` in every `verify` |
| E6 | Verification baseline green | **Met** | 39 checks in `npm run verify`; the CI run for the closure commit is recorded in `CI.md` |
| E7 | Master framework repository unchanged | **Met** | Gate 5 closure report, verification 4 |
| E8 | Independent reviewer and the evidence bundle defined | **Not met** | Reviewer named (ChatGPT, D-P8-10); the bundle is open item OI-7, the first task of G6-0 |
| E9 | GitHub-side settings confirmed | **Not met** | OI-3; needed before G6-7 only |
| E10 | MONOLITH House & Design details | **Not met** | OI-4; needed before G6-8 only |
| E11 | Visual packages under a sole creative authority; offerings versus tiers | **Not met** | OI-1, OI-2; needed in G6-0 |

Nothing unmet blocks G6-1: it is independent of the release model, the framework repository and MONOLITH.

## 2. What is ready to build on

- A blocking verification suite of 39 checks (22 without a browser), green on GitHub-hosted Ubuntu in Chromium and informational Firefox and WebKit jobs.
- A release gate with 16 client-production and 6 demonstration requirements, a **112-scenario blocking dry run** that runs the real release tool against a synthetic build in a throwaway copy, 12 measured probes of what it lets through, and a package verifier.
- A machine-checked migration matrix: 34 components, 9 work packages in dependency order, a register of 40 findings and decisions, 14 release blockers, 10 decisions with checked consequences, 6 operating principles, 7 open items.
- The 15 frozen master specifications, read and reconciled; the proposed search-readiness standard reconciled in the Phase 9 addendum.
- A reproducible closure verifier (`npm run gate5:closure`).

## 3. What Gate 6 begins with: G6-1 (approved in principle; not started)

**Scope (from the Phase 6 assessment; all approved in principle by D-P6-1, D-P6-2, D-P6-3, D-P6-6 and D-P8-6):**
1. Verify **Node 24** against the full suite and the three engines, and make `engines` truthful. The HTML validator pinned today requires Node `^22.22.0 || >=24.8.0`, so the Node 24 pin must be 24.8.0 or later; CI pins 22.22.0 today.
2. Move the two pinned Actions to **Node 24-compatible versions**. Phase 6 measured `actions/checkout` v7.0.1 (`3d3c42e5aac5ba805825da76410c181273ba90b1`) and `actions/setup-node` v7.1.0 (`949feb2413d6458794dcd2491c4babbbce0c15c1`) from the repositories with `git ls-remote`; those pins are re-verified at the start because time has passed.
3. Replace `@lhci/cli` (17 advisories, 11 high, all inside that tool, none reachable) with a **tested direct Lighthouse runner** (`lighthouse@13.5.0` measured at 0 advisories, 114 packages, by resolving metadata only), reproducing the present thresholds: performance 0.8 (warn), accessibility 0.95 (error), best practices 0.9 (warn), SEO 0.6 (warn), three runs, median.
4. Record the authoritative licence evidence for `parse-cache-control` (a data change).

**Acceptance:** full `verify` and the three engines green on Node 24 with the new pins; `npm audit` reports 0 advisories in the installed tree; the Lighthouse thresholds reproduce the current results; the workflow policy check updated deliberately and passing; the delivered folder byte-identical (tree hash `9061a227…`); the dry run and the matrix check green; **no change to a page, style, font, media file, release rule or the framework repository**.

**Needs from you at the start:** the word to begin; whether the Node 24 pin should be the newest 24.x patch at the time (my recommendation) or a specific one; confirmation that a new direct development dependency (`lighthouse`, replacing `@lhci/cli`) is acceptable under D-P6-1 (it is a dependency change, so I treat the start authorisation as covering exactly this and nothing else).

**Rollback:** each change is one commit; reverting restores the Phase 6 pins; the frozen baseline branch is never touched.

**Not part of G6-1:** the release model, the requirements, the hosting adapters, the refactor, the framework repository, MONOLITH, dependency-update automation, the SBOM requirement.

## 4. The sequence, with what each step needs

| Package | Needs before it starts | Reviewer checkpoint |
|---|---|---|
| G6-0 decisions and specification | Answers to OI-1, OI-2, OI-5, OI-7; your approval before any framework-repository change | specification and reviewer bundle approved |
| G6-1 hygiene | Your review of the closure report and the word to begin | acceptance list above |
| G6-2 release model v2 | G6-0, G6-1; the owner approves the **design (2a)**, including the attestation and signing evaluation, before 2b | design approved; then dry run extended and green |
| G6-3 requirement completion | G6-2; separate authorisation for the two edits to delivered files (credit link, Noto notice); a person for provider-terms evidence (D-P5-5) | one blocking scenario per requirement |
| G6-4 hosting | G6-2, G6-3; a person re-reads provider documentation (D-P3-6); the **Vercel adapter before MONOLITH**; any preview needs its own authorisation (D-P3-5, OI-6) | golden outputs per adapter |
| G6-5 de-coupling refactor | G6-0, G6-2, G6-3, G6-4 | parity proof |
| G6-6 extraction | G6-5; your explicit approval to modify the framework repository (not given) | framework CI green on the generic fixture |
| G6-7 centralised automation | G6-6; the GitHub settings confirmed (OI-3) | scratch repository with only the caller workflow |
| G6-8 consumption and validation | G6-6, G6-7; MONOLITH details (OI-4) | readiness checklist signed; then POC #2 begins |

## 5. How review works in Gate 6 (D-P8-10, OP-5)

- **Claude implements.** Every package ends with an evidence bundle: the exact commands, the commit, the GitHub Actions run and job identifiers, the relevant hashes, and the dry-run and matrix reports.
- **ChatGPT reviews evidence and architecture.** The review is independent only if the reviewer can re-run the commands or read the CI runs without relying on my summary; the bundle's format and how independence is recorded are open item OI-7 and are defined in G6-0 before any review is asked for.
- **The owner authorises** each checkpoint above and every release; no automated check approves anything.
- **Reproducibility rule:** a claim without a command or a CI job that reproduces it is not evidence. The closure verifier is the model: read only, offline, one command.

## 6. People tasks that run in parallel (nothing in engineering can supply them)

Real devices (an iPhone and an Android phone), screen readers (NVDA, VoiceOver, TalkBack), manual desktop passes (Chrome, Firefox, Safari); a person re-reading the crawler documentation and the provider documentation; rights verification against dated authoritative terms; the GitHub settings; the MONOLITH profile; naming the testers. These are production release blockers RB-01 to RB-08 and OI-3, OI-4 in the matrix; none is needed to start G6-1.

## 7. Risks to starting Gate 6

| # | Risk | Mitigation |
|---|---|---|
| 1 | The release model changes while code moves | Order: G6-2 before G6-5 |
| 2 | Parity breaks during the refactor | Parity proof before and after each step; no behaviour change in a move |
| 3 | A sole creative authority leaves the visual packages in the specifications undefined | OI-1 answered in G6-0; the engineering does not depend on it |
| 4 | Offerings and tiers conflict | OI-2 answered in G6-0; the base engineering stays single |
| 5 | Provider and GitHub facts are summaries | Re-read by a person; trial in a scratch repository before relying on them |
| 6 | Verification by the implementer alone | The reviewer bundle and the reproducibility rule |

## 8. Stop conditions during Gate 6

I will stop and report rather than continue if: a check regresses and the cause is not understood; the delivered tree hash changes without an approved change; CI is red on a blocking job; the framework repository, a baseline branch or an approval record would need to change without authorisation; a request exceeds the current authorisation; or a verification can be satisfied only by weakening a check.
