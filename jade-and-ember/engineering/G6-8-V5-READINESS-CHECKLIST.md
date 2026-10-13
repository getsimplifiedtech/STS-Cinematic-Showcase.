# G6-8 V5: readiness checklist for a new project (prepared, NOT signed)

Prepared under `APR-JE-051` (Stage C). The owner signs this checklist; until then MONOLITH House & Design does not start (Gate 6 order, section 5, point 7). The checklist is the one the Gate 5 plan defined (V5: industry adapter or none, tier, hosting target, media-rights plan, creative-authority pin, manifest, pinned Framework Release, release model v2 in force, people-evidence plan). **Nothing in it is a decision of the engineering.** MONOLITH is described in no repository (finding F-18 of the Gate 5 extraction plan): its industry, pages, tier, hosting, media rights and builder are unknown, and this checklist does not guess them.

| # | Item | What the engineering provides today | Status | Who must act | Needed before |
|---|---|---|---|---|---|
| 1 | **Industry adapter (or none)** | one adapter, `restaurant`; the manifest takes `industry: null` and the whole pipeline ran on a non-restaurant fixture and on the cinematic template with no adapter (V1, V3) | open: MONOLITH's industry is unknown | owner names the industry; if none exists, an adapter is a new work package | MONOLITH start |
| 2 | **Offering tier** (specification 13) | the three offerings share one base engineering; the offering selects nothing in the checks (selftest-generic cases) | open: MONOLITH's tier is unknown | owner | MONOLITH start |
| 3 | **Hosting target** | adapters for Cloudflare Pages, Vercel and a static server, each staging the fixture and the reference consumer; portability checks pass | open: the target is unknown; real hosting is unverified live (RB-12) | owner chooses; a live check needs an authorised preview, which is not authorised | MONOLITH start (choice); first release (live check) |
| 4 | **Media-rights plan** | inventory, terms review, provenance file, delivered-media digest bound into the release gate (G6-3) | open: MONOLITH's assets and their rights are unknown. For Jade & Ember 8 assets are still unverified (RB-02) | owner and the people who can verify rights | MONOLITH start (plan); release (verification) |
| 5 | **Creative-authority pin** | Anthropic Frontend Design is the sole creative authority, pinned by path, checksum and licence name in `authority.json` and checked (`check:authority`); the template evaluation left it untouched | ready (a per-project record to copy) | none | |
| 6 | **Project manifest** | schema and loader; a manifest cannot remove, skip or weaken a check. V3 shows what a new project must supply besides the manifest: a `serve.py`, a build that emits pages to `{out}`, a `verify` script, project-owned client-build and head-tag recipes, pinned tool versions and `engines.node`, a `PROVENANCE.md` in the media folder, flat asset folders, a declared navigation toggle | partly ready: no written adoption guide exists; the requirements are scattered across checks (V3 core findings C1 to C6) | the engineering writes the guide once the owner authorises it; MONOLITH's builder supplies the files | MONOLITH start |
| 7 | **Pinned Framework Release** | none exists (`authority.json` release is null, RB-14). A consumer today pins an exact development commit through a verified snapshot (public repository) or by commit SHA (private repository); the framework branch is unmerged and untagged | **open: needs an owner decision.** Either authorise a Framework Release (a merge and a tag, which this work package was told not to do), or record that MONOLITH's development may pin an exact development commit and that a client-production build still needs a release (RB-14) | owner | MONOLITH start (decision); any client-production build (release) |
| 8 | **Release model v2 in force** | implemented (G6-2, G6-3, G6-4); 319 dry-run scenarios, one blocking scenario per audit finding, all pass; the gate blocks a client-production release today because people, client and authenticity requirements are unmet | ready as engineering; it is not an authorisation | none | |
| 9 | **People-evidence plan** (devices, screen readers, browsers) | 12 evidence targets with generated procedures and validated templates; 0 records exist (RB-05, RB-06, RB-07) | open: the plan names people the engineering cannot supply | owner | first release (plan before MONOLITH start) |

## Signature

| | |
|---|---|
| Items the owner must decide or supply before MONOLITH starts | 1, 2, 3 (choice), 4 (plan), 7 (decision), 9 (plan); and 6 if the guide is wanted |
| Items ready | 5, 8 |
| Signed by the owner | **not signed** |
| Date | |
