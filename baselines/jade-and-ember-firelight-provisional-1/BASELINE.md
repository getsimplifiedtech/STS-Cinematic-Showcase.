# Jade & Ember Firelight: PROVISIONAL reference (provisional-1)

**Status: PROVISIONAL. This is not a frozen baseline.** It is the pinned reference the baseline-bound checks compare the Firelight redesign against while Firelight is still in development (owner authorization of 2026-10-17, "Contrast Acceptance and Framework Reconciliation": a narrowly scoped reconciliation, not the final baseline freeze or a merge). The frozen v0.8 baseline (`engineering/baseline.json`, `baselines/jade-and-ember-v0.8/`, branch `baseline/jade-and-ember-v0.8`) is untouched and still frozen.

| Item | Value |
|---|---|
| Reference commit | `e264589215c8a251644aaee432a95ec42a0d83c4` on `feature/jade-and-ember-firelight` |
| Reference branch | `reference/jade-and-ember-firelight-provisional-1` (points at the commit above; delete it to undo) |
| Machine-readable record | `jade-and-ember/engineering/baseline-firelight-provisional.json` (named by `baseline.record` in `sts.engineering.json`) |
| Source files | 352, checksums in `SHA256SUMS.source-tree.txt` |
| Preview package | `jade-and-ember-provisional-1-preview.zip`, 2,527,708 bytes, SHA-256 in `SHA256SUMS.preview-package.txt`; 45 files listed in `SHA256SUMS.preview-contents.txt` |

What it does: `check:delivery`, `check:regression`, `check:security`, `check:assets`, `check:budgets` and the self-tests compare the candidate with this commit instead of v0.8. Any later change to a delivered file now shows as a difference until the reference is deliberately moved to a new commit in a reviewed commit (a ratchet, not a freeze).

What it is not: it is not owner-signed off as the design baseline, it is not tagged, merged or deployed, and it does not replace the v0.8 record. Freezing Firelight (a `baseline/...` branch, a signed record, the approvals-log entry) is a separate owner decision. See `docs/JADE_AND_EMBER_FIRELIGHT_GATE_STATUS.md` for the check-by-check reconciliation.

Prepared by `engineering/project-owned/prepare-baseline.mjs` from the commit itself; the preview package is a fresh build of that commit plus START-HERE.txt and serve.py.
