# G6-5 evidence: the parity proof

G6-5 (`APR-JE-046`) is a refactor, so its proof is that nothing the owner approved moved. This folder holds the reference taken **before** the refactor, the same run taken **after**, and the list of every line that differs, each with its reason.

| File | What it is |
|---|---|
| `parity-reference-fast-187f672.txt`, `parity-reference-full-187f672.txt` | `npm run verify:fast` and `npm run verify` on commit `187f672` (G6-4, closed), taken in a separate checkout, then normalised (timings, ports, temporary paths, the engine digest and seal of the verification record, repository-size counts removed). 786 lines in the full one, 413 `caught:` lines, delivered tree hash `9061a2270196…`, candidate `69f9f18f…`, dry run 319 of 319, 41 release-control cases. |
| `parity-after-fast-f485758.txt`, `parity-after-full-f485758.txt` | The same two runs on commit `f485758` (G6-5, a clean committed tree), normalised the same way. |
| `parity-expected-differences-fast.json`, `-full.json` | Every differing line between reference and after, with the reason. `parity.mjs compare` fails on any difference that is not listed **and** on any listed difference that did not occur. |

Reproduce: `node engineering/tools/parity.mjs compare engineering/g6-5-evidence/parity-reference-full-187f672.txt <your full verify log> --allow engineering/g6-5-evidence/parity-expected-differences-full.json` (the fast pair is the same with the fast files). Both end with `PARITY holds`.

## What the differences are (full run: 61 lines, fast run: 48)

| Reason | Lines |
|---|---|
| New core check `check:project` (manifest, no-subtraction cases, purity ratchet) | its section and summary line |
| New core check `check:selftest-generic` (28 cases on a second project) | its section and summary line |
| `check:selftest-gate5` reads the check list from the registry: two catalogue cases renamed, four registry cases added, one case split in two (25 to 30 cases) | 11 lines |
| The record and the run count two more checks (42 of 42 full, 24 of 24 fast; was 40 and 22) | 4 lines |
| Log frame (npm banner, blank lines, exit-code line) | full run only |

Nothing else differs: the tree hash, the candidate digest, every other check's notes, the 319 dry-run scenarios, the 41 release-control cases and the composite SBOM digest (`a1dbdd12…`) are identical.

## Self-test case reconciliation (`caught:` lines, full run)

| Suite | Reference | After | Why |
|---|---|---|---|
| `check:selftest` (gate 2), gate 3, gate 4, gate 6 | 42, 67, 230, 64 | 42, 67, 230, 64 | unchanged |
| `check:selftest-gate5` | 10 caught, 15 held (25) | 14 caught, 16 held (30) | four registry cases and one split case added; two renamed, none removed or weakened |
| `check:selftest-generic` | none | 7 caught, 21 held (28) | new: the engineering on a second project |
| Total caught | 413 | 424 | +4 and +7 |

## What this proof does not cover

* It compares the Chromium run. Firefox and WebKit run only in GitHub Actions; their results are in the report.
* The fixture project (`engineering/fixtures/generic`) is not run through `npm run verify`: see the report, section 5.
