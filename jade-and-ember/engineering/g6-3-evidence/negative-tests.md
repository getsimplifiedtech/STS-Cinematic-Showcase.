# G6-3 negative tests (synthetic dry run, final run)

Group, scenario, expected, observed. Every row passed.

| Group | Scenario | Expected | Observed |
|---|---|---|---|
| external-links | RG-02: no external-links verification record | BLOCKED by externalLinks, externalLinksReview | BLOCKED by externalLinks, externalLinksReview |
| external-links | RG-02: the external-link registry and verification file deleted after sign-off (the tool used to crash on a missing registry) | BLOCKED by verifyPassed, releaseApproval, productionHostAuthorised, rightsVerification, se | BLOCKED by verifyPassed, releaseApproval, productionHostAuthorised, rightsVerification, evidence:real-device, evidence:s |
| external-links | a verification for another destination list | BLOCKED by externalLinks, externalLinksReview | BLOCKED by externalLinks, externalLinksReview |
| external-links | a verification from a sandbox run | BLOCKED by externalLinks | BLOCKED by externalLinks |
| external-links | a verification older than its limit | BLOCKED by externalLinks | BLOCKED by externalLinks |
| external-links | a clickable link the destination refused (blocked) | BLOCKED by externalLinks | BLOCKED by externalLinks |
| external-links | a clickable link that is gone (unavailable) | BLOCKED by externalLinks | BLOCKED by externalLinks |
| external-links | a verified link through an http hop | BLOCKED by externalLinks | BLOCKED by externalLinks |
| external-links | a clickable destination on a reserved host (the ordering link) | BLOCKED by externalLinks (may also: externalLinksReview) | BLOCKED by externalLinks, externalLinksReview |
| external-links | RG-02: no external-links review | BLOCKED by externalLinksReview | BLOCKED by externalLinksReview |
| external-links | an external-links review of another destination list | BLOCKED by externalLinksReview | BLOCKED by externalLinksReview |
| external-links | an external-links review that relies on another verification record | BLOCKED by externalLinksReview | BLOCKED by externalLinksReview |
| external-links | an external-links review that says the destinations were not opened | BLOCKED by externalLinksReview, recordsValid | BLOCKED by recordsValid, externalLinksReview |
| external-links | an external-links review that was rejected | BLOCKED by externalLinksReview | BLOCKED by externalLinksReview |
| external-links | an external-links review revoked by an authorised reviewer | BLOCKED by externalLinksReview | BLOCKED by externalLinksReview |
| external-links | history: a rejected review for an older build is only history | ALLOWED (this must not block) | ALLOWED |
| rights | RG-03: a rights verification that covers other media (inventory digest differs) | BLOCKED by rightsVerification, mediaRightsInventory (may also: socialImageRights) | BLOCKED by rightsVerification, mediaRightsInventory, socialImageRights |
| rights | RG-03: a rights verification with no inventory digest | BLOCKED by rightsVerification, recordsValid, mediaRightsInventory (may also: socialImageRi | BLOCKED by recordsValid, rightsVerification, mediaRightsInventory, socialImageRights |
| rights | RG-03: a rights verification with a basis the model does not know | BLOCKED by rightsVerification, recordsValid, mediaRightsInventory (may also: socialImageRi | BLOCKED by recordsValid, rightsVerification, mediaRightsInventory, socialImageRights |
| rights | RG-03: an image the inventory still lists as unverified | BLOCKED by mediaRightsInventory (may also: socialImageRights) | BLOCKED by mediaRightsInventory, socialImageRights |
| rights | RG-03: an inventory entry that names a rights record that does not exist | BLOCKED by mediaRightsInventory (may also: socialImageRights) | BLOCKED by mediaRightsInventory, socialImageRights |
| rights | RG-03: the rights verification revoked after the inventory was written (the inventory still says verified) | BLOCKED by rightsVerification, mediaRightsInventory (may also: socialImageRights) | BLOCKED by rightsVerification, mediaRightsInventory, socialImageRights |
| rights | RG-03: provider terms nobody has reviewed | BLOCKED by mediaRightsInventory (may also: socialImageRights) | BLOCKED by mediaRightsInventory |
| rights | RG-03: the Noto Serif SC notice finding (F-G5-05) open | BLOCKED by mediaRightsInventory (may also: socialImageRights) | BLOCKED by mediaRightsInventory |
| rights | RG-03: the font notice differs from the font file again (the real mismatch restored) | BLOCKED by mediaRightsInventory (may also: socialImageRights) | BLOCKED by mediaRightsInventory |
| rights | a font file replaced after the inventory was written (hash differs) | BLOCKED by mediaRightsInventory (may also: socialImageRights) | BLOCKED by mediaRightsInventory |
| social | D-P4-3: a social image that is a delivered, inventoried, rights-verified file | ALLOWED (this must not block) | ALLOWED |
| social | D-P4-3: a social image hosted on another site | BLOCKED by socialImageRights (may also: externalLinks, externalLinksReview) | BLOCKED by socialImageRights |
| social | D-P4-3: a social image that is not a delivered file | BLOCKED by socialImageRights | BLOCKED by socialImageRights |
| social | D-P4-3: a social image whose rights record is revoked | BLOCKED by socialImageRights, rightsVerification, mediaRightsInventory | BLOCKED by rightsVerification, mediaRightsInventory, socialImageRights |
| supply | RG-10: no supply-chain verification | BLOCKED by dependencySecurity, sbomVerified | BLOCKED by dependencySecurity, sbomVerified |
| supply | RG-10: a verification for another lockfile | BLOCKED by dependencySecurity, sbomVerified | BLOCKED by dependencySecurity, sbomVerified |
| supply | RG-10: a verification from a sandbox run | BLOCKED by dependencySecurity | BLOCKED by dependencySecurity |
| supply | RG-10: an old verification | BLOCKED by dependencySecurity | BLOCKED by dependencySecurity |
| supply | RG-10: a high advisory | BLOCKED by dependencySecurity | BLOCKED by dependencySecurity |
| supply | RG-10: a moderate advisory with no exception | BLOCKED by dependencySecurity | BLOCKED by dependencySecurity |
| supply | RG-10: a moderate advisory whose exception expired | BLOCKED by dependencySecurity | BLOCKED by dependencySecurity |
| supply | RG-10: a moderate advisory with a current, planned exception must NOT block | ALLOWED (this must not block) | ALLOWED |
| supply | RG-10: registry signatures that failed | BLOCKED by dependencySecurity | BLOCKED by dependencySecurity |
| supply | RG-10: registry signatures that cover fewer packages than the lockfile | BLOCKED by dependencySecurity | BLOCKED by dependencySecurity |
| supply | RG-11: an SBOM digest different from the one the build regenerates | BLOCKED by sbomVerified | BLOCKED by sbomVerified |
| supply | RG-11: a delivered file changed after the supply-chain record, the record not repeated | BLOCKED by sbomVerified, verifyPassed, releaseApproval, productionHostAuthorised, rightsVe | BLOCKED by verifyPassed, releaseApproval, productionHostAuthorised, rightsVerification, evidence:real-device, evidence:s |
| supply | RG-11: the lockfile changed after the supply-chain record, the record not repeated | BLOCKED by dependencySecurity, sbomVerified, verifyPassed, releaseApproval, productionHost | BLOCKED by verifyPassed, releaseApproval, productionHostAuthorised, rightsVerification, evidence:real-device, evidence:s |
| supply | RG-11: a development dependency with a loose version range | BLOCKED by dependencyPolicy (may also: dependencySecurity, sbomVerified) | BLOCKED by dependencyPolicy |
| supply | RG-11: a licence taken off the allow-list | BLOCKED by dependencyPolicy | BLOCKED by dependencyPolicy |
| supply | RG-11: the workflow back on an unsupported Node | BLOCKED by supportedRuntimes, verifyPassed, evidence:ci-run | BLOCKED by verifyPassed, evidence:ci-run, supportedRuntimes |
| supply | RG-11: an Action no longer pinned to a commit | BLOCKED by supportedRuntimes, verifyPassed, evidence:ci-run | BLOCKED by verifyPassed, evidence:ci-run, supportedRuntimes |
| authenticity | RG-14: the policy edited to stop listing authenticity (verification re-sealed by the harness): the gate still judges it | BLOCKED by authenticity | BLOCKED by authenticity |
| authenticity | RG-14: everything else green; the real authenticity verifier (not implemented) is the only thing left | BLOCKED by authenticity | BLOCKED by authenticity |
| package | RG-14: the green package, verified with the real authenticity verifier, fails on authenticity alone (nothing else is wrong with it) | as stated | failing: authenticity |
| package | the SBOM edited (one byte), checksums not updated | as stated | failing: checksums, sbom, supply-chain — hash mismatch: sbom.cdx.json |
| package | the SBOM with a delivered file's hash changed, manifest and checksums made consistent | as stated | failing: sbom, supply-chain — the composite SBOM: fonts/LICENSES.txt: the SBOM records another hash |
| package | the SBOM of another lockfile, manifest and checksums made consistent | as stated | failing: sbom, supply-chain — the composite SBOM: it describes another lockfile than the candidate |
| package | the external-links history in the package edited (a clickable link blocked), manifest updated | as stated | failing: checksums, external-links — SHA256SUMS.txt lists jade-and-ember-1.0.0-site.zip, release-manifest.json; expected |
| package | the external-links history in the package replaced by an empty one, manifest updated | as stated | failing: checksums, external-links — SHA256SUMS.txt lists jade-and-ember-1.0.0-site.zip, release-manifest.json; expected |
| package | the external-links history in the package edited, manifest NOT updated | as stated | failing: records-embedded, external-links — the records in the package are not the ones the manifest lists (added, remov |
| package | the supply-chain history in the package emptied, manifest updated | as stated | failing: checksums, supply-chain — SHA256SUMS.txt lists jade-and-ember-1.0.0-site.zip, release-manifest.json; expected j |
| package | the supply-chain history in the package shows a high advisory, manifest updated | as stated | failing: checksums, supply-chain — SHA256SUMS.txt lists jade-and-ember-1.0.0-site.zip, release-manifest.json; expected j |
| package | the dependency register in the package edited (an exception added), no longer the one the candidate covers | as stated | failing: records-embedded — the records in the package are not the ones the manifest lists (added, removed or edited) |
| package | the rights inventory in the package edited (an image marked unverified), no longer the one the candidate covers | as stated | failing: records-embedded, rights-inventory, social-images — the records in the package are not the ones the manifest li |
| package | the rights record in the package revoked, manifest updated: the inventory still says verified | as stated | failing: checksums, approvals-recorded, rights-inventory, social-images — SHA256SUMS.txt lists jade-and-ember-1.0.0-site |
| package | the rights record in the package edited to cover other media (inventory digest), manifest updated | as stated | failing: checksums, approvals-recorded, rights-inventory, social-images — SHA256SUMS.txt lists jade-and-ember-1.0.0-site |
| package | the external-links review in the package edited to review another destination list, manifest updated | as stated | failing: checksums, external-links — SHA256SUMS.txt lists jade-and-ember-1.0.0-site.zip, release-manifest.json; expected |
| package | the supply-chain history in the package covering fewer packages than the lockfile, manifest updated | as stated | failing: checksums, supply-chain — SHA256SUMS.txt lists jade-and-ember-1.0.0-site.zip, release-manifest.json; expected j |
| package | a social image on another host added to a page inside the ZIP | as stated | failing: checksums, asset-tree, candidate-digest, sbom, external-links, social-images — SHA256SUMS.txt lists jade-and-em |
| package | a good package still verifies 45 days after it was released (freshness is judged at release time, not when it is checked) | as stated | verified with the clock moved 45 days on |
