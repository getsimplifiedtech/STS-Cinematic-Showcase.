# Parity: pre-migration baseline against the migrated tree

Both runs: `npm run verify` (full tier), Node 24.21.0, Chromium 141.0.7390.37 (the pinned build), in a clean checkout.

* **Baseline:** commit `2bb1737` (G6-7 closure, the last commit before Stage B), run twice: the first time two checks failed (`check:secrets`, `check:framework-matrix`) because of an untracked local `node_modules` link used for the run, which was then excluded from git; the second run, kept here, passed 42 of 42.
* **Migrated:** commit `689aac0`, which holds the owner-approved replacement snapshot (framework commit `23fafcd0365e`, tree `a7ac4a6f4cb6`). 45 of 45. The commits after it (`eec682f` and the report commit) change only `checks/je-release-control-layout.mjs`, `checks/je-suites.mjs`, the documents and the evidence; the final tree was verified again (see the report).

## Identical

| Item | Baseline | Migrated |
|---|---|---|
| Candidate artifact digest | `69f9f18fd5e119786e512125741fa2bd0c398857d7609c74784051937028f640` | the same |
| Delivered tree | 23 files, 1,977,874 bytes, tree `9061a2270196…` | the same |
| Composite SBOM digest | `a1dbdd1255ca2c2d6b733658e044b5e546071c7afce17b77032994a226830e43`, 151 components | the same |
| Release dry run | 319 of 319 scenarios as expected | 319 of 319 (no scenario reported "not applicable") |
| Release-control proof of concept | 41 cases held, 0 failed | 41 cases held, 0 failed (run in the reconstructed layout, see the report) |
| `check:regression` against the frozen v0.8 baseline | source 27, text 35, structure 35, styles 35, pixels 39, behaviour 13 comparisons, 0 problems | the same counts, 0 problems |
| Original Jade & Ember self-tests | `check:selftest` passed; gate2 42, gate3 68, gate4 251, gate5 30, gate6 99 tests; evidence 117 rejections + 20 acceptances (137 cases) | the same counts, run by `check:selftest-je-markup` (each suite in its own process) |
| Every one of the 42 baseline check ids | passed | passed (same tier, scope and needs; the registry was compared id by id) |

## Expected differences

| Difference | Why |
|---|---|
| 45 checks, not 42 | `check:extraction` (verifies the snapshot against its record), `check:selftest-je-markup` (the original Jade & Ember suites, which the framework's own `check:selftest*` ids no longer run) and `check:selftest-release-control` (the proof of concept, which before ran inside `check:release-dryrun` and is now a project check of its own) were added. Approved in APR-JE-049. |
| `check:selftest-gate2` 34 tests (was 42), `check:selftest-gate4` 248 (was 251), `check:selftest-gate5` 25 (was 30); `check:selftest-gate3` (68), `check:selftest-gate6` (99) and `check:selftest-evidence` (137) are unchanged in count | These ids now run the framework's generic suites. The original Jade & Ember content with its original counts runs under `check:selftest-je-markup` (rows above). Nothing was retired. |
| `check:selftest-generic` 73 tests (was 28) | The framework's generic self-test grew in G6-6 to G6-8 (the accepted Stage A evidence names 73). |
| Engine digest and registry digest differ | The verifying code is the snapshot now. The candidate artifact, which the engine digest does not enter, is unchanged. |
| Release-control cases run in a reconstructed layout | Owner-accepted (APR-JE-050, D-G68-5); validates the original behaviour in its original layout, not direct execution in the split layout. |
| Pixel-regression Chromium in CI is 156, local is 141 | The runner image; the check prints the difference and passes with the same thresholds (unchanged). |
