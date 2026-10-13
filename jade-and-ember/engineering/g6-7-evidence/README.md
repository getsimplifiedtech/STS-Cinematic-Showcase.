# G6-7 evidence

G6-7 (`APR-JE-048`) added the GitHub automation to the framework repository (`getsimplifiedtech/sts-web-design-framework`, development branch `feature/sts-framework-automation`, cut from the accepted G6-6 head `3286f8b`; final head `eee5708022ca3cd3675177d887a5c0cb49e68276`). Jade & Ember changed in governance records only. The evidence lives in the framework repository, so that it can be reproduced from the commit:

| What | Where |
|---|---|
| Rules, exceptions, limits and unverified GitHub behaviour | `architecture/16-engineering-framework-v1.md`, section 10.8 and section 12 |
| Reproduction commands (framework checkout at `eee5708`, Node 24, Chromium) | `engineering/docs/REVIEW-BUNDLE.md`, section 5a |
| The two exception families | `engineering/ci/exceptions.json`, `engineering/fixtures/generic/engineering/secrets-allow.json` |
| Licensing and size of the vendored OpenMontage, for later reconciliation | `engineering/docs/THIRD-PARTY.md` |
| GitHub Actions, all jobs concluded `success` | run 9 `38394636508` (head `67cf1b2`) and **run 10 `38397278729` (head `eee5708`)**: eight jobs, each read through its own log; the table is in `G6-7-REPORT.md` section 3 |

```
cd <framework checkout>/engineering        # branch feature/sts-framework-automation at eee5708
export STS_PROJECT_DIR=$PWD/fixtures/generic
node verify.mjs                            # 38 of 38, two not applicable
node checks/selftest-generic.mjs           # 63 cases
node tools/ci/simulate-caller.mjs          # PASS  caller-layout simulation (add --install for npm ci)
```

Local runs used Node 22.22 (no Node 24 in the sandbox); the Node 24.21.0 evidence is the CI.
