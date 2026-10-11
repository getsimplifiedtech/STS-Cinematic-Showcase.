# Approval records (G6-2)

One JSON file per decision, schema `jade-and-ember/approval-record@1` (see `../../G6-2-DESIGN.md` section 4). Types: `release-approval`, `rights-verification`, `search-review`. Statuses: `approved`, `rejected`, `revoked`, `superseded`.

* **This folder holds no record today.** No person has approved, rejected or revoked anything, and the reviewer table (`../reviewers.json`) names no reviewer. A record is written by the authorised person, never by the engineering tools: `npm run release:record -- template <type>` prints a template with the candidate digest and the build's facts filled in and **no decision**.
* Records are append-only facts. To change an outcome add a record (a `revoked` or `superseded` record names the one it ends in `ends`); do not edit an old one.
* Audit: `npm run release:audit -- approvals` shows, for every file, whether it is in force and why.
