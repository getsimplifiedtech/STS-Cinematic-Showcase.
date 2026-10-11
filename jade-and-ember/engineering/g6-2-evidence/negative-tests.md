# G6-2 evidence: revocation, rejection and forged-evidence negative tests

Each row is a scenario of `npm run check:release-dryrun` (real release tool in a throwaway copy, invented personas). `expected` is what was written down before the run; `observed` is what the tool did. All rows passed in the final run.

| Group | Scenario | Expected | Observed |
|---|---|---|---|
| approvals | no release approval | BLOCKED by releaseApproval, productionHostAuthorised | BLOCKED by releaseApproval, productionHostAuthorised |
| approvals | a release approval bound to another candidate artifact | BLOCKED by releaseApproval, productionHostAuthorised | BLOCKED by releaseApproval, productionHostAuthorised |
| approvals | a release approval for another version | BLOCKED by releaseApproval, productionHostAuthorised | BLOCKED by releaseApproval, productionHostAuthorised |
| approvals | a release approval for the demonstration channel | BLOCKED by releaseApproval, productionHostAuthorised | BLOCKED by releaseApproval, productionHostAuthorised |
| approvals | a release approval record with a field missing (decidedBy) | BLOCKED by releaseApproval, productionHostAuthorised, recordsValid | BLOCKED by recordsValid, releaseApproval, productionHostAuthorised |
| approvals | a release approval whose status is "rejected" | BLOCKED by releaseApproval, productionHostAuthorised | BLOCKED by releaseApproval, productionHostAuthorised |
| approvals | an approval and a later rejection by an authorised reviewer (both in force) | BLOCKED by releaseApproval, productionHostAuthorised | BLOCKED by releaseApproval, productionHostAuthorised |
| approvals | an approval revoked by an authorised reviewer | BLOCKED by releaseApproval, productionHostAuthorised | BLOCKED by releaseApproval, productionHostAuthorised |
| approvals | an approval superseded by an authorised reviewer, with no replacement | BLOCKED by releaseApproval, productionHostAuthorised | BLOCKED by releaseApproval, productionHostAuthorised |
| approvals | a status written as prose ("approved (REVOKED)") | BLOCKED by releaseApproval, productionHostAuthorised, recordsValid | BLOCKED by recordsValid, releaseApproval, productionHostAuthorised |
| approvals | a status the model does not know ("pending") | BLOCKED by releaseApproval, productionHostAuthorised, recordsValid | BLOCKED by recordsValid, releaseApproval, productionHostAuthorised |
| approvals | an unauthorised revocation (a rights reviewer): the approval stays, but the record blocks until resolved | BLOCKED by recordsValid | BLOCKED by recordsValid |
| approvals | an unauthorised rejection (a reviewer not in the table) | BLOCKED by recordsValid | BLOCKED by recordsValid |
| approvals | a revocation that ends a record that does not exist | BLOCKED by recordsValid | BLOCKED by recordsValid |
| approvals | a revocation that names an approval recorded for another candidate | BLOCKED by recordsValid | BLOCKED by recordsValid |
| approvals | a revocation dated before the approval it ends | BLOCKED by recordsValid | BLOCKED by recordsValid |
| approvals | a revocation of a revocation | BLOCKED by releaseApproval, productionHostAuthorised, recordsValid | BLOCKED by recordsValid, releaseApproval, productionHostAuthorised |
| approvals | a revocation with no "ends" field | BLOCKED by recordsValid | BLOCKED by recordsValid |
| approvals | a release approval by a reviewer who is not in the reviewer table | BLOCKED by releaseApproval, productionHostAuthorised | BLOCKED by releaseApproval, productionHostAuthorised |
| approvals | a release approval by a reviewer who may not approve it (the rights persona) | BLOCKED by releaseApproval, productionHostAuthorised | BLOCKED by releaseApproval, productionHostAuthorised |
| approvals | a release approval signed with the wrong name for a valid reviewer id | BLOCKED by releaseApproval, productionHostAuthorised | BLOCKED by releaseApproval, productionHostAuthorised |
| approvals | a release approval decided before the reviewer was authorised | BLOCKED by releaseApproval, productionHostAuthorised | BLOCKED by releaseApproval, productionHostAuthorised |
| approvals | an empty reviewer table (nobody is authorised) | BLOCKED by releaseApproval, productionHostAuthorised, rightsVerification, search | BLOCKED by releaseApproval, productionHostAuthorised, rightsVerification, searchReadiness |
| approvals | a reviewer table with a duplicate reviewer id | BLOCKED by recordsValid | BLOCKED by recordsValid |
| approvals | a reviewer table established by a governance record that does not exist | BLOCKED by recordsValid | BLOCKED by recordsValid |
| approvals | an approval dated in the future | BLOCKED by releaseApproval, productionHostAuthorised, recordsValid | BLOCKED by recordsValid, releaseApproval, productionHostAuthorised |
| approvals | a record file that is not valid JSON | BLOCKED by recordsValid | BLOCKED by recordsValid |
| approvals | a record of an unknown type | BLOCKED by recordsValid | BLOCKED by recordsValid |
| approvals | a required governance approval (APR-JE-017) missing from the ledger | BLOCKED by requiredApprovalsPresent | BLOCKED by requiredApprovalsPresent |
| domain | a release approval that carries no production host | BLOCKED by releaseApproval, productionHostAuthorised, recordsValid | BLOCKED by recordsValid, releaseApproval, productionHostAuthorised |
| domain | a release approval for another production host | BLOCKED by productionHostAuthorised | BLOCKED by productionHostAuthorised |
| domain | a release approval for a host that is a preview address (pages.dev) while the build is for the real host | BLOCKED by productionHostAuthorised | BLOCKED by productionHostAuthorised |
| domain | a staging domain (pages.dev) as the production host | BLOCKED by productionDomain, productionHostAuthorised | BLOCKED by productionHostAuthorised, productionDomain |
| domain | a reserved example domain (.test) | BLOCKED by productionDomain, productionHostAuthorised | BLOCKED by productionHostAuthorised, productionDomain |
| domain | a staging label in the host name (staging.) | BLOCKED by productionDomain, productionHostAuthorised | BLOCKED by productionHostAuthorised, productionDomain |
| domain | the domain changed after sign-off (committed, nothing re-recorded) | BLOCKED by releaseApproval, productionHostAuthorised, rightsVerification, search | BLOCKED by verifyPassed, releaseApproval, productionHostAuthorised, rightsVerification, evidence:real-device,  |
| domain | a staging word inside a sub-domain label (jade-staging.) | BLOCKED by productionDomain, productionHostAuthorised | BLOCKED by productionHostAuthorised, productionDomain |
| domain | a numbered staging label (stage2.) | BLOCKED by productionDomain, productionHostAuthorised | BLOCKED by productionHostAuthorised, productionDomain |
| domain | another hosting provider's preview domain (azurestaticapps.net) | BLOCKED by productionDomain, productionHostAuthorised | BLOCKED by productionHostAuthorised, productionDomain |
| domain | a local address (https://localhost): the build refuses, or the gate does | the tool stops and nothing is allowed | tool error, exit 1: file:///tmp/je-dryrun-5sjXyn/jade-and-ember/engineering/lib/site.mjs:17 |
| domain | an IP address (https://192.0.2.10): the build refuses, or the gate does | BLOCKED by productionDomain, productionHostAuthorised | BLOCKED by productionHostAuthorised, productionDomain |
| approvals | no rights verification | BLOCKED by rightsVerification | BLOCKED by rightsVerification |
| approvals | a rights verification that was rejected ("NOT verified") | BLOCKED by rightsVerification | BLOCKED by rightsVerification |
| approvals | a rights verification revoked by an authorised reviewer | BLOCKED by rightsVerification | BLOCKED by rightsVerification |
| approvals | a rights verification that names no source | BLOCKED by rightsVerification, recordsValid | BLOCKED by recordsValid, rightsVerification |
| approvals | a rights verification with no date | BLOCKED by rightsVerification, recordsValid | BLOCKED by recordsValid, rightsVerification |
| approvals | a rights verification bound to another candidate | BLOCKED by rightsVerification | BLOCKED by rightsVerification |
| approvals | no search review | BLOCKED by searchReadiness | BLOCKED by searchReadiness |
| approvals | a search review that was rejected ("NOT reviewed") | BLOCKED by searchReadiness | BLOCKED by searchReadiness |
| approvals | a search review revoked by an authorised reviewer | BLOCKED by searchReadiness | BLOCKED by searchReadiness |
| approvals | a search review for other search artifacts (digest altered) | BLOCKED by searchReadiness | BLOCKED by searchReadiness |
| approvals | a search review that does not list the crawler policy | BLOCKED by searchReadiness, recordsValid | BLOCKED by recordsValid, searchReadiness |
| approvals | a search review that does not list the structured data | BLOCKED by searchReadiness, recordsValid | BLOCKED by recordsValid, searchReadiness |
| approvals | a search review for another candidate | BLOCKED by searchReadiness | BLOCKED by searchReadiness |
| verification | no verification record | BLOCKED by verifyPassed | BLOCKED by verifyPassed |
| verification | a hand-written report in the old format ({ mode, passed, commit, dirty, assetsTree }) | BLOCKED by verifyPassed | BLOCKED by verifyPassed |
| verification | a record edited by hand (the seal no longer matches) | BLOCKED by verifyPassed | BLOCKED by verifyPassed |
| verification | a record with a check removed and the seal recomputed | BLOCKED by verifyPassed | BLOCKED by verifyPassed |
| verification | a record with a check the verifier does not define, seal recomputed | BLOCKED by verifyPassed | BLOCKED by verifyPassed |
| verification | a record that lists a check twice, seal recomputed | BLOCKED by verifyPassed | BLOCKED by verifyPassed |
| verification | a record with a failing check, seal recomputed | BLOCKED by verifyPassed | BLOCKED by verifyPassed |
| verification | a record that says passed although a check failed | BLOCKED by verifyPassed | BLOCKED by verifyPassed |
| verification | a fast (partial) verification | BLOCKED by verifyPassed | BLOCKED by verifyPassed |
| verification | a failed verification | BLOCKED by verifyPassed | BLOCKED by verifyPassed |
| verification | a verification of another candidate artifact | BLOCKED by verifyPassed | BLOCKED by verifyPassed |
| verification | a verification made by other verification code (engine digest differs) | BLOCKED by verifyPassed | BLOCKED by verifyPassed |
| verification | a verification whose registry digest is not the verifier's | BLOCKED by verifyPassed | BLOCKED by verifyPassed |
| verification | a verification run on a dirty tree | BLOCKED by verifyPassed | BLOCKED by verifyPassed |
| verification | a corrupt verification record (not JSON) | the tool stops and nothing is allowed | tool error, exit 2: SyntaxError: Expected property name or '}' in JSON at position 1 (line 1 column 2) |
| verification | the verifying code changed after the verification (a check edited and committed): the local record and the CI summary both belong to the old code | BLOCKED by verifyPassed, evidence:ci-run | BLOCKED by verifyPassed, evidence:ci-run |
| candidate | a stale recorded asset manifest (assets.manifest.json from another build) | BLOCKED by assetManifestCurrent | BLOCKED by assetManifestCurrent |
| candidate | a delivered file edited after sign-off, committed, nothing re-recorded | BLOCKED by verifyPassed, releaseApproval, productionHostAuthorised, rightsVerifi | BLOCKED by verifyPassed, releaseApproval, productionHostAuthorised, rightsVerification, evidence:real-device,  |
| candidate | a configuration value changed after sign-off, committed, nothing re-recorded | BLOCKED by verifyPassed, releaseApproval, productionHostAuthorised, rightsVerifi | BLOCKED by verifyPassed, releaseApproval, productionHostAuthorised, rightsVerification, evidence:real-device,  |
| candidate | the release policy changed after sign-off, committed, nothing re-recorded | BLOCKED by verifyPassed, releaseApproval, productionHostAuthorised, rightsVerifi | BLOCKED by verifyPassed, releaseApproval, productionHostAuthorised, rightsVerification, evidence:real-device,  |
| candidate | the lockfile changed after sign-off, committed, nothing re-recorded | BLOCKED by verifyPassed, releaseApproval, productionHostAuthorised, rightsVerifi | BLOCKED by verifyPassed, releaseApproval, productionHostAuthorised, rightsVerification, evidence:real-device,  |
| candidate | an edit to a delivered file after testing, NOT committed (dirty tree) | BLOCKED by cleanTree, verifyPassed, releaseApproval, productionHostAuthorised, r | BLOCKED by cleanTree, verifyPassed, releaseApproval, productionHostAuthorised, rightsVerification, evidence:re |
| records | a REJECTION filed in deployments/ (the wrong family): it would never be read, so the folder refuses it | BLOCKED by recordsValid | BLOCKED by recordsValid |
| records | a REJECTION filed in evidence/ (not an evidence record): refused, and evidence is not accepted beside it | BLOCKED by evidence:real-device, evidence:screen-reader, evidence:browser-matrix | BLOCKED by evidence:real-device, evidence:screen-reader, evidence:browser-matrix, evidence:ci-run |
| records | a REJECTION saved as REL-JE-902.JSON (upper-case extension) | BLOCKED by recordsValid | BLOCKED by recordsValid |
| records | a REJECTION saved as REL-JE-902.json.bak | BLOCKED by recordsValid | BLOCKED by recordsValid |
| records | a REJECTION in a sub-folder (approvals/old/REL-JE-902.json) | BLOCKED by recordsValid | BLOCKED by recordsValid |
| records | a record that is a symlink to a file outside the repository | BLOCKED by recordsValid | BLOCKED by recordsValid |
| records | a REJECTION that exists in the working tree but git has been told to ignore (never committed) | BLOCKED by recordsValid | BLOCKED by recordsValid |
| records | a record file that repeats a key ("status":"rejected" ... "status":"approved") | BLOCKED by recordsValid | BLOCKED by recordsValid |
| records | a rejection filed under another record's file name (REL-JE-903.json holds REL-JE-902) | BLOCKED by recordsValid | BLOCKED by recordsValid |
| records | a veto lifted by a reviewer who may revoke but could never have rejected (supersession is not a back door) | BLOCKED by releaseApproval, productionHostAuthorised, recordsValid | BLOCKED by recordsValid, releaseApproval, productionHostAuthorised |
| records | a decision time that does not exist (2026-02-30) | BLOCKED by releaseApproval, productionHostAuthorised, recordsValid | BLOCKED by recordsValid, releaseApproval, productionHostAuthorised |
| records | a decision time of 24:00:00 | BLOCKED by releaseApproval, productionHostAuthorised, recordsValid | BLOCKED by recordsValid, releaseApproval, productionHostAuthorised |
| records | a decision time with fractional seconds (ordering by text would be wrong) | BLOCKED by releaseApproval, productionHostAuthorised, recordsValid | BLOCKED by recordsValid, releaseApproval, productionHostAuthorised |
| records | an approval timed an hour from now (later today is still the future) | BLOCKED by releaseApproval, productionHostAuthorised, recordsValid | BLOCKED by recordsValid, releaseApproval, productionHostAuthorised |
| records | an array where a string belongs (candidate: ["…"]) | BLOCKED by releaseApproval, productionHostAuthorised, recordsValid | BLOCKED by recordsValid, releaseApproval, productionHostAuthorised |
| evidence | a failed test of the same target recorded beside the passing one | BLOCKED by evidence:browser-matrix | BLOCKED by evidence:browser-matrix |
| evidence | a CI run of another repository | BLOCKED by evidence:ci-run | BLOCKED by evidence:ci-run |
| evidence | an evidence file that is not JSON at all, beside valid records | BLOCKED by evidence:real-device, evidence:screen-reader, evidence:browser-matrix | BLOCKED by evidence:real-device, evidence:screen-reader, evidence:browser-matrix, evidence:ci-run |
| evidence | an evidence backup file (desktop-chrome.json.bak) | BLOCKED by evidence:real-device, evidence:screen-reader, evidence:browser-matrix | BLOCKED by evidence:real-device, evidence:screen-reader, evidence:browser-matrix, evidence:ci-run |
| candidate | serve.py (run by the recipient, shipped in the ZIP) edited after sign-off, committed, nothing re-recorded | BLOCKED by verifyPassed, releaseApproval, productionHostAuthorised, rightsVerifi | BLOCKED by verifyPassed, releaseApproval, productionHostAuthorised, rightsVerification, evidence:real-device,  |
| candidate | shared source code the checks rely on (src/lib/seo.mjs) edited after verification | BLOCKED by verifyPassed, evidence:ci-run | BLOCKED by verifyPassed, evidence:ci-run |
| candidate | the CI workflow edited after verification | BLOCKED by verifyPassed, evidence:ci-run | BLOCKED by verifyPassed, evidence:ci-run |
| evidence | no iphone-safari record | BLOCKED by evidence:real-device | BLOCKED by evidence:real-device |
| evidence | no android-chrome record | BLOCKED by evidence:real-device | BLOCKED by evidence:real-device |
| evidence | no sr-nvda-firefox record | BLOCKED by evidence:screen-reader | BLOCKED by evidence:screen-reader |
| evidence | no sr-voiceover-macos-safari record | BLOCKED by evidence:screen-reader | BLOCKED by evidence:screen-reader |
| evidence | no sr-talkback-android-chrome record | BLOCKED by evidence:screen-reader | BLOCKED by evidence:screen-reader |
| evidence | no desktop-chrome record | BLOCKED by evidence:browser-matrix | BLOCKED by evidence:browser-matrix |
| evidence | no desktop-firefox record | BLOCKED by evidence:browser-matrix | BLOCKED by evidence:browser-matrix |
| evidence | no desktop-safari record | BLOCKED by evidence:browser-matrix | BLOCKED by evidence:browser-matrix |
| evidence | no ci-run record | BLOCKED by evidence:ci-run | BLOCKED by evidence:ci-run |
| evidence | emulation offered as a physical device (E1 claimed as E3) | BLOCKED by evidence:real-device | BLOCKED by evidence:real-device |
| evidence | a desktop record offered as a physical device (E2 claimed as E3) | BLOCKED by evidence:real-device | BLOCKED by evidence:real-device |
| evidence | a physical-device record for another candidate artifact | BLOCKED by evidence:real-device | BLOCKED by evidence:real-device |
| evidence | a physical-device record for different delivered files (assets tree differs) | BLOCKED by evidence:real-device | BLOCKED by evidence:real-device |
| evidence | a record with no candidate digest | BLOCKED by evidence:browser-matrix | BLOCKED by evidence:browser-matrix |
| evidence | a record for a commit that does not exist | BLOCKED by evidence:real-device | BLOCKED by evidence:real-device |
| evidence | an unfilled template | BLOCKED by evidence:browser-matrix | BLOCKED by evidence:browser-matrix |
| evidence | an incomplete record (a result left empty) | BLOCKED by evidence:screen-reader | BLOCKED by evidence:screen-reader |
| evidence | a record signed by no one | BLOCKED by evidence:screen-reader | BLOCKED by evidence:screen-reader |
| evidence | a tester that is a tool (Playwright Bot) | BLOCKED by evidence:browser-matrix | BLOCKED by evidence:browser-matrix |
| evidence | a record dated in the future | BLOCKED by evidence:browser-matrix | BLOCKED by evidence:browser-matrix |
| evidence | a real-device record whose test failed | BLOCKED by evidence:real-device | BLOCKED by evidence:real-device |
| evidence | an attachment that is not on disk | BLOCKED by evidence:real-device | BLOCKED by evidence:real-device |
| evidence | an attachment whose bytes changed after it was hashed | BLOCKED by evidence:real-device | BLOCKED by evidence:real-device |
| evidence | one attachment reused by two records | BLOCKED by evidence:real-device | BLOCKED by evidence:real-device |
| evidence | a record file that is not valid JSON | BLOCKED by evidence:real-device, evidence:screen-reader, evidence:browser-matrix | BLOCKED by evidence:real-device, evidence:screen-reader, evidence:browser-matrix, evidence:ci-run |
| ci-evidence | a CI record for another candidate artifact | BLOCKED by evidence:ci-run | BLOCKED by evidence:ci-run |
| ci-evidence | a CI record whose summary names another candidate than its build | BLOCKED by evidence:ci-run | BLOCKED by evidence:ci-run |
| ci-evidence | a CI record made by other verification code | BLOCKED by evidence:ci-run | BLOCKED by evidence:ci-run |
| ci-evidence | a CI record that reports fewer checks than the verifier defines | BLOCKED by evidence:ci-run | BLOCKED by evidence:ci-run |
| ci-evidence | a CI record reporting a failing check | BLOCKED by evidence:ci-run | BLOCKED by evidence:ci-run |
| ci-evidence | a CI record from a run on a person's machine | BLOCKED by evidence:ci-run | BLOCKED by evidence:ci-run |
| ci-evidence | a CI record whose run id is not the URL's run | BLOCKED by evidence:ci-run | BLOCKED by evidence:ci-run |
| ci-evidence | a CI record with no verification summary at all | BLOCKED by evidence:ci-run | BLOCKED by evidence:ci-run |
| ci-evidence | a CI record whose run did not succeed | BLOCKED by evidence:ci-run | BLOCKED by evidence:ci-run |
| ci-evidence | a CI record with no GitHub run URL | BLOCKED by evidence:ci-run | BLOCKED by evidence:ci-run |
| ci-evidence | a CI record on an earlier commit (the parent) with the same candidate: bound to the artifact, so it still counts | ALLOWED (this must not block) | ALLOWED |
| package | prepare on the fully green synthetic build writes a package that verifies | as stated | ok files, ok checksums, ok manifest, ok package-binding, ok gate-recorded, ok package-name, ok zip-contents, o |
| package | preparing the same commit twice gives byte-identical files (reproducible) | as stated | 39 files compared |
| package | one byte of the ZIP flipped | as stated | failing: checksums, package-binding, zip — hash mismatch: jade-and-ember-1.0.0-site.zip |
| package | the manifest edited (version changed) | as stated | failing: checksums, package-name, package-extras, candidate-digest, approvals-recorded — hash mismatch: releas |
| package | a line deleted from SHA256SUMS.txt | as stated | failing: checksums — SHA256SUMS.txt lists release-manifest.json; expected jade-and-ember-1.0.0-site.zip, relea |
| package | SHA256SUMS.txt lists an extra file | as stated | failing: checksums — SHA256SUMS.txt lists extra.bin, jade-and-ember-1.0.0-site.zip, release-manifest.json; exp |
| package | host/_headers weakened (the CSP removed) — not covered by SHA256SUMS | as stated | failing: security — host/_headers differs from what the delivered pages require |
| package | host/nginx.conf edited | as stated | failing: security — host/nginx.conf differs from what the delivered pages require |
| package | a host file missing | as stated | failing: files — missing host/htaccess |
| package | the records folder missing (reviewer table) | as stated | failing: files — missing records/reviewers.json |
| package | the ZIP replaced by another valid ZIP, checksums updated, manifest not | as stated | failing: package-binding, zip-contents, package-extras, asset-tree — manifest says 1904871 bytes, the ZIP has  |
| package | the manifest says the gate BLOCKED this build | as stated | failing: gate-recorded — the manifest records a BLOCKED gate |
| package | the manifest records a dirty source tree | as stated | failing: gate-recorded — built from a dirty tree |
| package | a script added to the ZIP; manifest package hash, asset tree and checksums updated: the ZIP is no longer the approved artifact | as stated | failing: candidate-digest, evidence-recorded — the artifact in the ZIP is not the candidate artifact the manif |
| package | a script added to the ZIP; manifest package hash and checksums updated (asset tree not) | as stated | failing: asset-tree, candidate-digest — the delivered files hash to a different tree than the manifest records |
| package | a file that does not belong in a delivered site (config/client.json) added | as stated | failing: zip-contents — files that do not belong in a delivered site: config/client.json |
| package | a ZIP entry that escapes the folder (../evil) | as stated | failing: zip — unsafe path in ZIP (or a name outside the plain set): "../evil" |
| package | the manifest names another candidate digest than the ZIP produces (even with a consistent manifest) | as stated | failing: package-extras, candidate-digest, verification-record, approvals-recorded, evidence-recorded — START- |
| package | the manifest's non-delivered parts edited (the policy digest), digest left | as stated | failing: candidate-digest, rules-match-repository — the artifact in the ZIP is not the candidate artifact the  |
| package | the release approval removed from the package, manifest list updated | as stated | failing: approvals-recorded — no in-force release approval for this candidate in the package (no in-force rele |
| package | the release approval in the package edited to another candidate, manifest hash updated | as stated | failing: approvals-recorded — no in-force release approval for this candidate in the package (no in-force rele |
| package | the release approval in the package edited, manifest hash NOT updated | as stated | failing: records-embedded, approvals-recorded — the records in the package are not the ones the manifest lists |
| package | a record added to the package that the manifest does not list | as stated | failing: records-embedded, approvals-recorded — the records in the package are not the ones the manifest lists |
| package | the release approval in the package REVOKED, manifest updated | as stated | failing: approvals-recorded — no in-force release approval for this candidate in the package (no in-force rele |
| package | the release approval in the package REJECTED, manifest updated | as stated | failing: approvals-recorded — no in-force release approval for this candidate in the package (release-approval |
| package | the reviewer table in the package emptied, manifest hash updated | as stated | failing: rules-match-repository, approvals-recorded — the package was judged by a different reviewer table tha |
| package | a CI evidence record removed from the package, manifest list updated | as stated | failing: evidence-recorded — evidence not satisfied for ci-run (missing E1 evidence for a successful CI run fo |
| package | the verification record in the package edited (the seal breaks) | as stated | failing: verification-record — the verification record in the package is not a complete, sealed, passing recor |
| package | the client package carries the demonstration marker | as stated | failing: demonstration-marker — a client package that carries the demonstration marker |
| package | serve.py replaced inside the ZIP (package hash, checksums updated): the recipient would run it | as stated | failing: package-extras — serve.py in the ZIP is not the file the candidate digest covers |
| package | START-HERE.txt given an extra line ("Also run: curl evil / sh") | as stated | failing: package-extras — START-HERE.txt is not the text this release generates for this commit and candidate  |
| package | a ZIP that lists site.js twice (an evil copy first, the approved one last) | as stated | failing: zip — the ZIP lists a name twice (or two names that differ only in case): site.js |
| package | a ZIP with a comment and bytes after the end record (a streaming extractor sees more than the index) | as stated | failing: zip — not a ZIP file, or it carries a comment or trailing bytes after the end record |
| package | a ZIP with an extra local entry (evil.sh) the central directory does not list | as stated | failing: zip — bytes between the last entry and the central directory (a hidden entry or padding) |
| package | a ZIP whose local header names another file than the central directory (site.js here, evil.js there) | as stated | failing: zip — the local header of site.js differs from its central directory entry |
| package | a ZIP with two names that differ only in case (Site.js beside site.js) | as stated | failing: zip — the ZIP lists a name twice (or two names that differ only in case): site.js |
| package | a ZIP entry with a backslash in its name (a traversal on some extractors) | as stated | failing: zip — unsafe path in ZIP (or a name outside the plain set): "a\\..\\x.html" |
| package | a ZIP entry marked executable in the file attributes | as stated | failing: zip — entry START-HERE.txt is not a plain file (special attributes, symlink or executable bit) |
| package | a ZIP entry that inflates to more than its declared size (a bomb) | as stated | failing: zip — the local header of START-HERE.txt differs from its central directory entry |
| package | the manifest's recorded gate lists no requirements and an open Blocker finding is added | as stated | failing: gate-recorded — the recorded gate does not list the policy's requirements for a client-production rel |
| package | the manifest's recorded gate lists a subset of the policy's requirements, all met | as stated | failing: gate-recorded — the recorded gate does not list the policy's requirements for a client-production rel |
| package | the verification record cut to one check, resealed, the manifest summary updated | as stated | failing: verification-record — the verification record in the package is not a complete, sealed, passing recor |
| package | the manifest names another production host than the pages (the approval then names the manifest's host) | as stated | failing: production-host — the pages are for www.jade-and-ember-fixture.com, the manifest says www.another-res |
| package | the package was judged by another reviewer table than this checkout's (a reviewer added, hash updated) | as stated | failing: rules-match-repository — the package was judged by a different reviewer table than this checkout hold |
| package | the evidence in the package: a CI record for a run of another repository, manifest list updated | as stated | failing: evidence-recorded — evidence not satisfied for ci-run (missing E1 evidence for a successful CI run fo |
| package | the ZIP changed, the manifest's parts AND digest recomputed to match, the embedded records left bound to the old artifact | as stated | failing: package-extras, verification-record, approvals-recorded, evidence-recorded — START-HERE.txt is not th |
| package | the ZIP changed and the manifest's delivered-file part rewritten to match, the digest left: the recomputed digest differs | as stated | rejected by candidate-digest, evidence-recorded: the recomputed digest differs from the one every embedded rec |
| package | PROBE (RG-14, open): a changed artifact with every record re-bound to it by whoever can write the repository | recorded | PASSED: cannot be refused without a signature or an external attestation |
| channel | client-style content labelled as a demonstration (demo flag on, noindex on) is refused: its configuration is not a registered demonstration | BLOCKED by demonstrationRegistered; nothing prepared | BLOCKED by demonstrationRegistered, demonstrationNoProductionDomain; prepare exit 1; release folder: false |
| channel | ...and it declares a production-looking domain, which a demonstration may not | as stated | a demonstration declares the production-looking host www.jade-and-ember-fixture.com |
| channel | the registered fictional demonstration passes the demonstration gate | as stated | DEMO-JE-001: this configuration is the registered fictional demonstration |
| channel | ...and cannot be released as client-production (the channel comes from the configuration) | as stated | REFUSED: this build is a demonstration build (configuration: demo true, noindex true); it cannot be released a |
| channel | prepare on the registered demonstration writes a package that verifies, with the marker | as stated | ok files, ok checksums, ok manifest, ok package-binding, ok gate-recorded, ok package-name, ok zip-contents, o |
| channel | a demonstration package whose manifest drops the marker | as stated | failing: demonstration-marker |
| channel | a demonstration package registered under an identity that is not in the registry | as stated | failing: demonstration-marker |
| channel | a demonstration package whose START-HERE.txt does not carry the statement | as stated | failing: package-extras, channel-text |
| channel | a demonstration package that declares a production-looking domain | as stated | failing: demonstration-marker |
| channel | a demonstration page whose noindex robots tag was removed (client content passed off as the demonstration) | as stated | failing: asset-tree, security, candidate-digest, demonstration-pages |
| channel | a demonstration page that names a production host in a canonical link | as stated | failing: asset-tree, candidate-digest, demonstration-pages |
| deployment | the workflow is triggered only by push, pull_request and workflow_dispatch | holds | push, pull_request, workflow_dispatch |
| deployment | workflow permissions are read-only (contents: read) at the top and on every job | holds | {"contents":"read"} |
| deployment | no job uses an environment, a deployment, a secret or a token | holds | no environment:, no secrets., no GITHUB_TOKEN, no id-token |
| deployment | the only actions are actions/checkout and actions/setup-node, each pinned to a commit | holds | actions/checkout, actions/setup-node |
| deployment | no step runs a deploy, publish, push or upload command | holds | scanned every run: block and every uses: line |
| deployment | no engineering tool or library starts a deploy, upload or network client program | holds | 100 files scanned |
| deployment | no engineering code sends a POST, PUT, PATCH or DELETE request | holds | none found |
| deployment | code that can open a network connection is only the external-link verifier, the local server and the search probes | holds | lib/external.mjs, lib/search.mjs, lib/server.mjs |
| deployment | deploymentApproved is only produced by the gate and printed or recorded, never acted on | holds | checks/release.mjs, lib/release.mjs, tools/release.mjs |
| deployment | the policy states that no channel deploys and nothing acts on a deployment approval | holds | allows: demonstration: preview-package/host-files; client-production: site-package/host-files |
