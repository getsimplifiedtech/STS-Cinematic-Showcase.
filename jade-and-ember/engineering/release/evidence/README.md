# Release evidence

Records of work the automated checks cannot do, read by the release gate (`npm run release:gate`). **None exists yet**: no physical-device, screen-reader or desktop-browser testing by a person has been recorded, so no client-production build can pass the gate. Never create, copy or sign a record for work that has not been done: a record is a statement by a named person about a specific build.

Everything about the procedures, the evidence classes (E1 emulation, E2 a person on a desktop browser, E3 a person on a physical device) and what the gate checks is in [`docs/JADE_AND_EMBER_DEVICE_TEST_PROTOCOL.md`](../../../../docs/JADE_AND_EMBER_DEVICE_TEST_PROTOCOL.md) and [`docs/device-testing/`](../../../../docs/device-testing/README.md). The rules are defined once, in [`../evidence-spec.json`](../evidence-spec.json).

```
npm run evidence:list                         the inventory of targets
npm run evidence:new -- iphone-safari         scaffold an UNFILLED record (status "template"); it never fills a result
npm run evidence:hash -- <file>               the SHA-256 for an attachment
npm run evidence:validate -- <record.json>    judge a record the way the gate will
npm run evidence:docs                         regenerate docs/device-testing/ from the specification
```

Attachments (screenshots, recordings, transcripts) go in `files/` next to the records; each is listed in its record with its SHA-256 and cannot be reused by another record. A record that is a template, incomplete, mislabelled (E1 as E2 or E3, an emulator as a device), for another build, unsigned or unverifiable does not count. The CI run record (`ci-run`, class E1) needs the GitHub Actions run URL for exactly the release commit.
