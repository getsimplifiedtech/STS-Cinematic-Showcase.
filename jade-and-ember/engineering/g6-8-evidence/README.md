# G6-8 Stage B evidence

What is kept here, and how it was made. The report is [`../G6-8-REPORT.md`](../G6-8-REPORT.md).

| File | What it is |
|---|---|
| `adversarial-snapshot.mjs` | The adversarial snapshot tests (29 cases: a changed, added, removed, renamed, symlinked, executable or case-folded snapshot file, a forged or partial record, the protected hard stop edited, a foreign local action, the caller in a repository that is not on the snapshot list, and, against the private framework checkout, a record that differs from its source commit). Run: `node engineering/g6-8-evidence/adversarial-snapshot.mjs --framework <private framework checkout>`. Without `--framework` the cases that need the private repository are skipped, and it says so. |
| `adversarial-snapshot-output.txt` | Its output against the replacement snapshot: 29 caught, 0 failed. |
| `baseline-2bb1737-verify-summary.txt` | The summary of a clean full `npm run verify` on Node 24.21.0 at the pre-migration commit `2bb1737` (42 of 42 checks). |
| `migrated-689aac0-verify-summary.txt` | The summary of a full `npm run verify` on Node 24.21.0 at the migrated tree with the replacement snapshot (45 of 45 checks). |
| `parity.md` | The comparison of the two, with every expected difference. |
| `legacy-direct-workflow.yml` | The workflow of before the migration, byte for byte (`git show 2bb1737:.github/workflows/jade-and-ember-verify.yml`). The original self-test suites and the release-control harness read it where they judged "the real workflow", because the real workflow is now the snapshot caller. `check:ci` judges the real one. |

The logs are summaries, not the whole output (about 1,400 lines each); the full local logs are not kept in the repository. The CI runs are recorded in the report with their numbers.
