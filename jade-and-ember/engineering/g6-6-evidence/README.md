# G6-6 evidence

G6-6 (`APR-JE-047`) extracted the reusable engineering into the framework repository (`getsimplifiedtech/sts-web-design-framework`, development branch `feature/sts-engineering-framework`, cut from `main` at `f05f41f`, new files only). Its proof that nothing Jade & Ember relies on moved is the **reference consumer**: this project, at the extraction commit `dfb7fc4`, run against the framework's engineering instead of its own copy, and compared with the reports it produced when it carried the engineering itself (`g6-5-evidence/parity-after-*-f485758.txt`).

| File | What it is |
|---|---|
| `parity-consumer-full-dd9fc63.txt`, `parity-consumer-fast-dd9fc63.txt` | `verify.mjs` and `verify.mjs --fast` of the reference consumer against framework commit `dd9fc63`, normalised (timings, ports, temporary paths, engine digest and seal removed; everything else kept). The full run **passed 42 of 42**. |
| `parity-expected-differences-full.json`, `-fast.json` | Every line that differs from the reference, with its reason. `parity.mjs compare` fails on a difference that is not listed and on a listed one that did not occur. |
| `original-suites-against-core.txt` | The project's own original self-test suites (unchanged, kept in the consumer as `je-*.mjs` because they name its markup) run against the framework core, with every case line, and the case-level reconciliation against the reference. |

Reproduce (framework checkout at the commit named in the report, Node 24, Chromium):

```
engineering/tools/reference-consumer.sh <this repository> <work dir>
cd <work dir>/consumer/jade-and-ember
STS_PROJECT_DIR=$PWD node ../engineering/verify.mjs          > full.log
STS_PROJECT_DIR=$PWD node ../engineering/verify.mjs --fast   > fast.log
node ../engineering/tools/parity.mjs compare <this repo>/jade-and-ember/engineering/g6-5-evidence/parity-after-full-f485758.txt full.log --allow <this folder>/parity-expected-differences-full.json
```

(`parity.mjs` needs `STS_PROJECT_DIR` set to any project, for example the consumer folder.) Both comparisons end `PARITY holds`.

## What is equal

The delivered tree hash `9061a227…` (23 delivered files), the candidate artifact digest `69f9f18f…`, the composite SBOM digest `a1dbdd12…`, **319 of 319 release dry-run scenarios**, the gate 3 and the evidence-validator cases line for line, and every other check's notes. Nothing in the project's site, renderer, approved visuals or production behaviour was involved: the consumer does not touch them.

## What differs, and why (full run: 100 lines; fast run: 64)

| Reason | Lines (full) |
|---|---|
| The project's migration-matrix check (`check:framework-matrix`) is dropped from the consumer's manifest: it assesses the monolithic repository whose files have now left the project's folder | 6 |
| `check:project` reviews the framework's own layout (framework `purity-allow.json`, 29 values in 9 entries, all test material), not the project's old layout | 2 |
| New core check `check:extraction` (a review fix: the extraction verifier and the pinned hard-stop hash run inside the verification) | 4 |
| `check:authority` scans more text files (the project's re-export modules carry the core source as a comment; the project keeps its original self-test copy): mentions 33 to 35, all in allowed historical documents | 2 |
| The frozen release-control proof of concept's 41 cases are not run (not extracted, OI-9; its self-test builds packages through the project-local release tool and was not ported to the framework's sandbox) | 1 |
| Cases of the project's original suites that name its markup, stylesheet, baseline or engine records are not in the framework's generic suites; the original suites run them against the core (`original-suites-against-core.txt`) | 9 |
| Cases of the framework's generic gate-2 and gate-4 suites that name the generic fixture's markup are reported **not applicable** on the project's markup (the project's original case for the same defect passes) | 19 (13 in gate 2, 6 in gate 4) |
| `check:selftest-generic` was rewritten for the framework layout (52 cases instead of 28) | 48 |
| Case counts of the suites that follow from the lines above | 6 |
| Log frame | 3 |

## Case-level reconciliation

520 `caught:`/`held:`/`regression:` lines in the reference full report; **511 are reproduced** by the consumer's own run or by the project's original suites run against the core; the 9 that are not are the G6-5 generic-fixture cases that were rewritten (listed at the end of `original-suites-against-core.txt`). Original suites against the core: base self-test, gates 2, 3, 4, 5 and the evidence validator **pass**; the original gate 6 passes except one case that names the old path of the release policy (`release/policy.json`); in the framework layout the release policy is a standard (`standards/release/policy.json`) and the project's copy an overlay. The framework's own gate 6 holds that case under the new name.

## What this proof does not cover

* The frozen release-control proof of concept (see above).
* Firefox and WebKit: they run only in GitHub Actions, on the generic fixture (see the report).
* The consumer is assembled by a script; a real V2 consumption (G6-7) would change the project's renderer import, its matrix and its checks list. The consumer keeps the project's one coupling to the core (the renderer imports `engineering/lib/config-schema.mjs`) through an absolute re-export.
