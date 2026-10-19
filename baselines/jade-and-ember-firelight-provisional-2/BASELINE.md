# Jade & Ember Firelight: PROVISIONAL reference (provisional-2)

**Status: PROVISIONAL. This is not a frozen baseline.** It is the pinned reference the baseline-bound checks compare the Firelight redesign against while Firelight is still in development. It replaces provisional-1 (`e264589`) as the active reference after the owner accepted the final photography (Shots A, B and C) and authorised the reference reconciliation on 2026-10-19 (APR-JE-056). The frozen v0.8 baseline (`engineering/baseline.json`, `baselines/jade-and-ember-v0.8/`, branch `baseline/jade-and-ember-v0.8`) is untouched and still frozen. The provisional-1 records (`baselines/jade-and-ember-firelight-provisional-1/` and branch `reference/jade-and-ember-firelight-provisional-1`) are kept unchanged as history: a reference record is never edited in place, so this is a new record, not a move.

| Item | Value |
|---|---|
| Reference commit | `1f66df2ebffa824322e65e8894b18d9cf322bd64` (`1f66df2`) on `feature/jade-and-ember-firelight` |
| Reference branch | `reference/jade-and-ember-firelight-provisional-2` (points at the commit above; delete it and revert the record to undo) |
| Git tree of the repository | `161d58b26f6eef8d1f5f9c981ea2ddd22f85cd76` |
| Git tree of `jade-and-ember/` | `bcb76c6e1b04eec32be93291d947db1f462584a1` |
| Machine-readable record | `jade-and-ember/engineering/baseline-firelight-provisional.json` (named by `baseline.record` in `sts.engineering.json`) |
| Source files | 354, checksums in `SHA256SUMS.source-tree.txt` |
| Preview package | `jade-and-ember-provisional-2-preview.zip`, 2,534,088 bytes, SHA-256 `4fbd821d66604f7006a97051cd3c084a78a5e861a022454a3ee355ddd69af7a5`; 45 files (the 43 delivered files plus `START-HERE.txt` and `serve.py`) listed in `SHA256SUMS.preview-contents.txt` |

What changed from provisional-1: the Visit Us opening photograph (Shot A, five people), the wok-counter photograph (Shot B, two people), their captions and alt text, the media provenance and rights records. Shot C (`visit-materials-c.webp`) is unchanged and was accepted as it is. The 43 delivered files in this reference are byte-identical to the approved delivered website at `1f66df2` (checked against `assets.manifest.json`: 43 of 43 hashes equal, none missing, none extra).

What it does: `check:delivery`, `check:regression`, `check:security`, `check:assets`, `check:budgets` and the self-tests compare the candidate with this commit. Any later change to a delivered file shows as a difference until the reference is deliberately moved again in a reviewed commit (a ratchet, not a freeze).

What it is not: it is not owner-signed off as the design baseline, it is not tagged, merged or deployed, and it does not replace the v0.8 record. Freezing Firelight (a `baseline/...` branch, a signed record, the approvals-log entry) is a separate owner decision.

Prepared by `engineering/project-owned/prepare-baseline.mjs --commit 1f66df2 --id firelight --label provisional-2` from the commit itself; the preview package is a fresh build of that commit plus START-HERE.txt and serve.py.
