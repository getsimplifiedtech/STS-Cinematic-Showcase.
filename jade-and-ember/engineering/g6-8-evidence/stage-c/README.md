# G6-8 Stage C evidence (public side)

Made under `APR-JE-051`. The report is [`../../G6-8-STAGE-C-REPORT.md`](../../G6-8-STAGE-C-REPORT.md); the checklist is [`../../G6-8-V5-READINESS-CHECKLIST.md`](../../G6-8-V5-READINESS-CHECKLIST.md). The V1, V3 and V4 documents name private framework files and live in the private framework repository.

| File | What it is |
|---|---|
| `compare-reports.mjs` | Compares the `.reports` folders of two full verification runs: every non-volatile JSON field and every common image must be equal. `node compare-reports.mjs <baseline .reports> <migrated .reports>` |
| `v2-fresh-clone-e17560d-verify-summary.txt` | Summary of the full run from a fresh clone of `e17560d`, tools installed beside the snapshot as CI does: 45 of 45 |
| `v2-report-comparison.txt` | Its comparison with the clean full run at `2bb1737` |
| `risk-experiments-raw.txt` | Raw output of the experiments behind section 4 of the report (not-applicable scenarios, a shrunk suite, the scan's reach, 19 single-guard removals in the frozen release-control code with the control run against the original self-test in the original layout, the real workflow mutated) |
