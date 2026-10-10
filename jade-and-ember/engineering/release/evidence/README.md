# Release evidence

JSON records of work the automated checks cannot do, read by the release gate (`npm run release:gate`). **None exists yet**, so no client-production build can pass the gate. Never create a record for work that has not been done; a record is a statement by a named person or tool about a specific commit.

```json
{ "type": "real-device", "commit": "<40-hex release commit>", "date": "2026-10-10", "by": "<name or role>", "summary": "what was tested, on which devices and software versions, and the outcome", "conclusion": "success" }
```
Types (see `../policy.json`): `real-device`, `screen-reader`, `browser-matrix`, `ci-run` (needs `url` and `conclusion: "success"` for exactly the release commit). A record with a different commit, a missing field or a conclusion other than `success` does not count.
