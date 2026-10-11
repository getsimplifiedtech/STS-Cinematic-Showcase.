# G6-2 evidence: before and after (synthetic dry run)

Generated from `dry-run-before.json` (the release tool and gate at the G6-1 base `0d71064`, probes run in a throwaway copy) and `dry-run-after.json` (the G6-2 tree). Every record in these runs is an invented persona or fixture written by the harness inside a throwaway copy; none is an approval, evidence or a decision of a person, and the real ledger, records, reviewer table and tree were unchanged by the runs.

## Findings measured before, by probe (G6-1 base)

| Finding | What was tried | Before (G6-1 base) |
|---|---|---|
| RG-02 | no external-link verification of any kind (registry and record deleted) | ALLOWED |
| RG-03 | a rights-verification row while the media inventory lists no asset as verified | ALLOWED |
| RG-04 | a release approval row that says the release was REJECTED (it still carries channel, version and commit) | ALLOWED |
| RG-05 | a rights-verification row that says "NOT verified by" | ALLOWED |
| RG-06 | a release-approval row whose Type column says "release-approval (REVOKED)" | ALLOWED |
| RG-07 | a search-review row that says "NOT reviewed by" | ALLOWED |
| RG-08 | a verification report with no check results at all (hand-written) | ALLOWED |
| RG-09 | the recorded asset manifest left from another build (assets.manifest.json stale) | ALLOWED; prepare exit 0; package verification FAILS (asset-tree) |
| RG-10 | a dependency advisory that no one has accepted (the gate relies on a full verification report existing) | ALLOWED |
| RG-11 | no SBOM, no provenance check, no pinned-action or Node-runtime check | ALLOWED |
| RG-12 | no real-404 requirement and no HSTS default among the release requirements | ALLOWED |
| RG-13 | client-style content labelled as a demonstration (demo flag on, noindex on) | ALLOWED; prepare exit 0; package verification passes |

RG-01 was measured differently: the documented flow (approve the release, then commit the approval) could not be completed at the base, because the approval row had to name the HEAD commit, and committing the row moved HEAD. The gate was BLOCKED by `releaseApproval` and `evidence:ci-run` on that flow.

## After (G6-2 tree)

Blocking scenarios (the tool refuses) and must-stay-valid scenarios (the tool allows) per finding; every one behaved as written down in advance.

| Finding | Blocking scenarios | Must-stay-valid scenarios |
|---|---|---|
| RG-01 | 12 | 4 |
| RG-04 | 13 | 2 |
| RG-05 | 2 | 1 |
| RG-06 | 5 | 1 |
| RG-07 | 2 | 1 |
| RG-08 | 17 | 0 |
| RG-09 | 1 | 0 |
| RG-13 | 14 | 0 |

## Probes still open after G6-2 (measured, not failures)

| Finding | Observed | Note |
|---|---|---|
| RG-02 | BLOCKED by  | The gate is blocked here only because the candidate computation cannot read the deleted file and the tool exits with an error. That is a crash, not a requirement: RG-02 stays open for G6-3 (D-P5-1). |
| RG-03 | ALLOWED | inventory: 12 assets (8 unverified, 4 licence-text-shipped); the record names sources and a date but no asset |
| RG-08 | ALLOWED | a record that is complete, bound to this candidate and made against this verification code is accepted; one that is incomplete, hand-edited, stale or for another build is refused (scenarios above) |
| RG-10 | ALLOWED | the accepted-advisory list is not a release requirement |
| RG-11 | ALLOWED | no such requirement exists in release/policy.json |
| RG-12 | ALLOWED | the built site has a 404.html: false; the generated _headers contains includeSubDomains: true; 0 requirement(s) mention them |

RG-14 (authenticity: a complete, consistent forgery by someone who can write the whole package and the repository) is measured by a probe that changes the artifact, re-binds every record to it and prepares a package with the real tool: the package verifier PASSES it. Only a signature or an external attestation can refuse that; it is the owner decision in G6-2-DESIGN.md section 12 and RG-14 is open.

