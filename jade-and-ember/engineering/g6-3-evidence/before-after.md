# G6-3 evidence: before and after (synthetic dry run)

Generated from three runs of the same synthetic release dry run: the G6-1 base (`0d71064`, `dry-run-g61-base.json`), the G6-2 tree (`485e513`, `dry-run-g62.json`) and the G6-3 tree (`dry-run-g63.json`). Every record is an invented persona or fixture written by the harness inside a throwaway copy; none is an approval, evidence or a decision of a person, and the real ledger, records, reviewer table and tree were unchanged by the runs.

## The four findings G6-3 closes, measured by the same probe

| Finding | What was tried | G6-1 base | G6-2 tree | G6-3 tree |
|---|---|---|---|---|
| RG-02 | no external-link verification of any kind (history emptied, registry deleted) | ALLOWED | BLOCKED only because the candidate computation crashed on the missing file (not a requirement) | **BLOCKED by verifyPassed, releaseApproval, productionHostAuthorised, rightsVerification, evidence:real-device, evidence:screen-reader, evidence:browser-matrix, evidence:ci-run, searchReadiness, externalLinks, externalLinksReview, mediaRightsInventory, socialImageRights** |
| RG-03 | a rights verification while no image or video is verified in the inventory | ALLOWED | ALLOWED | **BLOCKED by mediaRightsInventory, socialImageRights** |
| RG-10 | a dependency advisory that no one has accepted | ALLOWED | ALLOWED | **BLOCKED by dependencySecurity** |
| RG-11 | no SBOM digest, no supported-runtime check (stale digest, unpinned Action) | ALLOWED | ALLOWED | **BLOCKED by verifyPassed, evidence:ci-run, sbomVerified, supportedRuntimes** |

RG-14 (authenticity) is not resolved. G6-3 holds it shut: `lib/authenticity.mjs` is a hard stop that is judged for every client-production build, so the scenarios below show a build that is green in every other respect blocked by `authenticity` alone.

## Scenario counts of the G6-3 run

| Group | Scenarios |
|---|---|
| success path | 1 |
| approvals | 42 |
| domain | 12 |
| verification | 16 |
| candidate | 9 |
| tree | 1 |
| stays-valid | 11 |
| records | 15 |
| evidence | 29 |
| configuration | 18 |
| ci-evidence | 11 |
| external-links | 16 |
| rights | 10 |
| social | 4 |
| supply | 17 |
| authenticity | 2 |
| environment | 14 |
| ledger | 2 |
| package | 65 |
| channel | 11 |
| deployment | 10 |
| separation | 3 |

Total 319; all behaved as written down in advance. Probes still open: RG-08, RG-12 (RG-08 is the authenticity residual; RG-12 belongs to G6-4).

