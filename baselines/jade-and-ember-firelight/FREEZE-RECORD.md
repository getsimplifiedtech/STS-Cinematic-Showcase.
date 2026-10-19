# Jade & Ember Firelight — Owner-approved showcase POC freeze

**Owner authorization:** 2026-10-19, explicit instruction: “freeze it”.  
**Status:** FROZEN SHOWCASE POC — NOT PRODUCTION RELEASE.  
**Immutable source branch:** `baseline/jade-and-ember-firelight`.  
**Frozen commit:** `40fb45e96664bf19a774b6bc02a8ef64b2fc806b`.  
**Design and photo source:** `1f66df2ebffa824322e65e8894b18d9cf322bd64`.  
**Reconciliation:** `provisional-2` pinned to `1f66df2`; historical `provisional-1` and frozen v0.8 retained unchanged.

## Frozen decisions

All five Firelight pages and current experience are approved. Shot A (opening restaurant and guests), Shot B (chef and guest at wok counter), Shot C (jade/brass/concrete detail), the hero macro, approved atmospheric fades and desktop/phone layout are preserved. Shot D is deferred. No more design, photography, effects, layout work or credit spending is authorized under this freeze.

## Final verification evidence, as reported by executing Claude session

Full suite on the committed `40fb45e` tree: **45 pass, 0 fail**, Node 24.21.0, Playwright 1.64.0, Chromium 141. One justified self-test N/A case was noted separately; five formerly baseline-bound failures (security, assets, regression, selftest and selftest-je-markup) now pass. No budget/test weakening or exemptions added. Delivery: 2,662,676 B of 2,777,089 B limit; Shot B: 52,970 B of 68,000 B. Provisional-2: 354/354 source checksums, 45/45 preview package hashes and 43/43 delivered asset manifest hashes verified in the executing session. The author of this freeze record did not independently rerun those checks.

## Outstanding issues — not waived, not authorized for client/production use

- Generated-media usage rights and licenses are **unverified**; no client/commercial deployment permission is granted.
- Real-device Safari (iOS and macOS), Android Chrome, frame rate, scroll smoothness, battery and external link reachability are unverified.
- Firefox and WebKit have not been verified through a completed Actions run for this commit.
- Noto Serif SC warning F-G5-05 and expected E-SWGL-01 software-GL notices remain documented.
- Separate `jade-ember-the-breath-lab` Vercel project is red; its failure was not diagnosed here.

## Change control

The branch `baseline/jade-and-ember-firelight` is the exact frozen commit and must **not** be advanced, rebased, force-pushed, deleted or merged into another design without explicit owner authorization. The source freeze is intentionally pinned *before* this documentation-only record to keep the fully validated tree exact. This file is the administrative freeze record; it must not be mistaken for an additional pass of engineering QA, a cryptographic signature, or a rights clearance. No merge to production, no re-pointing of Vercel production, and no changes to MONOLITH, v0.8 or provisional references.
