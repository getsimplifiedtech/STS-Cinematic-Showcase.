# Jade & Ember: approval and authorisation records

**Purpose:** a repository record of what the owner has actually approved or authorised, so approvals are traceable and cannot be inferred. Format adapted for an HTML-first project from the framework's Approval Records specification (`architecture/15-approval-determination-records-v1.md` in `getsimplifiedtech/sts-web-design-framework`): the framework binds approvals to a profile content hash; this project binds each record to the git commit it concerns.
**Recorded:** 2026-10-10. **Branch:** `feature/jade-and-ember-brief`. **Project state at recording:** v0.8, commit `32afde7`.

## How to read this record
- **Approver:** the project owner (the person directing this development session). No name or contact is recorded here.
- **Source:** the owner's written messages in the development session. The session transcript is not stored in this repository, so these entries are reconstructed summaries of messages, not signed or hash-bound artifacts. Entries paraphrase; quoted words are the owner's.
- **Date anchor:** the date of the commit the decision concerns (all dates 2026-10-09 or 2026-10-10). Exact times were not captured.
- **Type:** *approval* (a state or plan was approved), *acceptance* (a result was accepted), *authorisation* (an instruction to do bounded work), *policy* (a standing rule), *instruction* (a direction that is not an approval).
- **Only decisions actually given are recorded.** Section C lists what has **not** been approved.

## A. Records

| ID | Date | Type | Decision (owner's words summarised) | Concerns | Limits stated with it |
|---|---|---|---|---|---|
| APR-JE-001 | 2026-10-09 | authorisation | Build the first standalone version following the brief | brief `95940a2`; result `809e3db` | Do not merge, deploy, publish, modify Lovable or spend video-generation credits; run applicable checks; stop for review |
| APR-JE-002 | 2026-10-09 | authorisation | Refinement pass on `809e3db`: brand specificity, source imagery, mobile hierarchy, hero contrast; add `noindex` | result `2382116` (v0.2) | No video generation, merge or deployment; stop for review |
| APR-JE-003 | 2026-10-09 | approval | v0.2 (`2382116`) **approved as the working foundation**; prepare the hero video production plan | `2382116`; plan `841f80d` | Plan only: no generation, merge, deployment or publication |
| APR-JE-004 | 2026-10-09 | approval | Gate A technical plan approved **for one trial only**: synthetic QA dry run and source-frame preview | `41857dd` | Nothing uploaded or generated; no ingredient toss, portrait video, extra attempts or deployment |
| APR-JE-005 | 2026-10-09 | authorisation | Gate A pre-flight accepted; **one** Kling 3.0 Omni (Frames) generation authorised from the approved source frame (re-confirmed after network permissions were updated) | result `74a2478`, `docs/JADE_AND_EMBER_GATE_A_RESULT.md` | Maximum 5 credits, subject to a fresh cost check; no toss, portrait clip or further attempts; no integration, merge or deployment. **Recorded outcome:** one job, 5.0 credits (balance 240.5 to 235.5) |
| APR-JE-006 | 2026-10-09 | acceptance | The Gate A cinematic footage is **approved**; optimise and integrate it | `bd7e5dc` (v0.3) | Keep all fallbacks, accessibility controls, mobile behaviour and performance; no more footage or credits; no merge or deployment |
| APR-JE-007 | 2026-10-09 | acceptance | v0.3 (`bd7e5dc`) **accepted as the integration baseline**; the existing footage and flame speed approved; restrict the clip to viewport widths of 960 px and up | `dfbbceb` (v0.3.1) | Keep the poster and slow-push fallback; no media, credits, merge or deployment |
| APR-JE-008 | 2026-10-09 | authorisation | Composition-refinement pass (visual composition only), keeping the Jade & Ember direction, the hero, the content structure and the quality disciplines | `74e0663` (v0.4, since superseded) | No new video, merge or deployment; stop for review |
| APR-JE-009 | 2026-10-09 | policy | **The STS design standard changed:** Anthropic's Frontend Design skill is the sole creative design authority; STS Premium Web Design is deprecated. Review v0.4 with it, proposals only | framework branch `feature/anthropic-frontend-design-standard`; see `docs/JADE_AND_EMBER_FRAMEWORK_REFERENCE.md` | No website changes in that step; stop for direction approval |
| APR-JE-010 | 2026-10-09 | approval | **Direction B, Jade Lacquer, with Direction A's four-step wok-hei process, approved**, including the proposed typography, full-bleed photography, removal of decorative labels and dish numbering, and copy refinements; the site is an STS portfolio demonstration (diners are the simulated users, restaurant owners the commercial audience) | `0ae79f3` (v0.5) | Preserve the cinematic hero and all functionality, accessibility and performance protections; no new media, credits, merge or deployment; stop for review |
| APR-JE-011 | 2026-10-09 | approval | **v0.5 Jade Lacquer approved as the visual design.** The product must be a five-page website; plan the conversion | `0ae79f3`; plan `d717896` | Documentation only: do not implement; no media, merge or deployment |
| APR-JE-012 | 2026-10-09 | approval | **Five-page architecture `d717896` approved** with these decisions: sentence-case navigation; the proposed file names; menu category jump links; typography-led Visit us and Order online; two implementation gates; the header Order button links to the branded Order page; four clearly fictional story chapters; a menu print stylesheet; "open now" deferred. **Gate 1 only authorised** (shared configuration and components, Home, Menu) | `d717896`; result `b19f0eb` (v0.6) | Preserve the approved design and hero; run QA; provide a preview; no media, credits, merge or deployment; stop for review |
| APR-JE-013 | 2026-10-10 | authorisation | **Gate 2 authorised** as documented in the approved architecture: Our story, Visit us, Order online | result `bf41373` (v0.7) | Preserve shared configuration and components, the hero, Home and Menu; full five-page QA; verify from an extracted folder; no media, credits, merge or deployment; stop for final visual review |
| APR-JE-014 | 2026-10-10 | instruction | Label the build **v0.8** instead of v0.7, because a v0.7 preview ZIP had already been downloaded. A version label only; not an approval of the design or of a release | `32afde7` (v0.8) | None beyond the standing restrictions |
| APR-JE-015 | 2026-10-10 | authorisation | A **read-only** framework compliance audit of v0.8, stated as being "before we approve" v0.8 | audit report (not committed) | No modification of either repository, no redesign, media, merge, deployment or paid credits |
| APR-JE-016 | 2026-10-10 | approval + policy | **Documentation-only corrections M-1, M-2 and M-3 approved** (framework reference, approval records, amended brief and hero plan, retired skill marked historical only). **Policy decision on audit finding F-3:** Anthropic Frontend Design governs creative direction; STS retains authority over architecture, engineering, accessibility, security, QA and delivery; STS visual packages may provide reusable implementation tokens and configurations but must not impose competing aesthetic rules (full text in `docs/JADE_AND_EMBER_FRAMEWORK_REFERENCE.md`, section 4) | the commit that adds this file | Do not modify the framework repository yet; do not implement M-4 or M-5; no design changes, media, merge, deployment or paid credits; commit, report changed files, stop |

## B. Standing restrictions
Given with every instruction above and still in force unless the owner says otherwise: **no merge, no deployment, no publication, no Lovable modification, no paid credits** (the single exception is APR-JE-005, one generation of at most 5 credits, already spent), and the site remains `noindex, nofollow` while the fictional demonstration is under development. Every handoff stops for the owner's review.

## C. Not approved, not given
No record above, and nothing else, approves any of the following. They must not be inferred from the entries above:

- **Approval of v0.8** as a design or as a release. The owner asked for the compliance audit "before we approve" v0.8 (APR-JE-015); no approval of v0.8 has been given.
- **Publication, deployment, merge, or production readiness** of any version.
- **Implementation of audit findings M-4** (sitemap, robots.txt, structured data and related promised features) **or M-5** (browser and real-device coverage), or of any other audit finding beyond M-1, M-2, M-3 and the F-3 policy.
- **Any change to the framework repository**, including adopting the F-3 policy there.
- **Real-device, screen-reader or browser-matrix sign-off.** None has been performed or accepted.
- **Client use** of the generated media or of the sample copy.
- **Further video generation** (portrait clip, ingredient toss, extra attempts).
- Acceptance of the audit as a whole: the owner approved specific corrections, not the audit's other findings.

## D. Adding to this record
Append a new row for each decision the owner actually gives, with its date anchor, the commit it concerns, and its limits. Never edit an earlier row to change what was decided; add a superseding row instead. State "not approved" explicitly when asked about something not covered.
