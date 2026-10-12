# G6-5: de-coupling refactor in Jade & Ember, report

Work package G6-5, authorised by `APR-JE-046`. **Implemented and verified locally; awaiting owner review.** Nothing was deployed, previewed or published. No file moved to another repository, **the master framework repository was neither read for modification nor changed** (the matrix records G6-5 as `frameworkRepoChange: false`, so no extraction or branch operation was needed; any such operation would have stopped for your approval). The release-authentication hard stop (`lib/authenticity.mjs`), the empty reviewer table, the frozen release-control proof of concept, the delivered website, the renderer and every approval, evidence and release record are byte-identical to `187f672`. G6-6 has not been started.

Commits on `feature/jade-and-ember-v0.9` since the G6-4 closure commit `187f672`: `7d477b8` (governance), `abddb6b`, `1441211`, `b41d4b5`, `119101e`, `2b764c9`, `e254f20`, `93a7484`, `f485758` (steps 1 to 8), then this report. The full local verification below is of `f485758`. GitHub Actions results for the final head are in the hand-off message, not in this file.

## 1. What exists

| Part | Does |
|---|---|
| `sts.engineering.json` (project root) and `schemas/sts-engineering.schema.json` | Every fact the reusable engineering needs about one project, as a value: where its records are, how its governance and release records are numbered, the delivered folder's shared files and page registry, its builder, its markup selectors, its generators, its industry, its baseline, its CI workflow. The schema rejects unknown keys. It has **no key that removes, skips or weakens a base check**; `offering` is information only (Essential, Premium and Cinematic share one base engineering, `OP-2`). It names no aesthetic value; the creative authority is pinned by reference. |
| `lib/project.mjs` | Loads and validates the manifest (from `STS_PROJECT_DIR`, else the project containing the code, else the nearest manifest above the working folder) and derives record ids, schema ids and test host names from it. |
| `checks.json`, `lib/registry.mjs`, `checks/runners.mjs` | The check list, its order, scopes, tiers and needs are **data**. The verifier, the cross-browser runner, the cross-browser catalogue and the verification record's expected check list all read the same registry. A check imports when it runs. |
| Project-check extension point | `checks.project` in the manifest adds a check after one it names; the industry adapter adds its own the same way. The merged order is byte-identical to the old fixed list. |
| `adapters/industry/` (restaurant), `lib/industry.mjs`, `lib/structured-data.mjs` | **D-P4-2**: the one approved requirement assigned to G6-5. The base validates a LocalBusiness JSON-LD block; the industry adapter supplies the schema.org types and the fields only that industry has (a restaurant's cuisine, price range and menu link). Jade & Ember keeps `Restaurant`. |
| `engineering/project-owned/` | The three things only this project can supply: its client-build recipe, its dry-run scenarios and its regression states, reached through the manifest. |
| `check:project` (new, fast) | Validates the manifest and every path it names; proves 18 attempts to remove, skip, relax or stop vouching for a base check are refused; runs the purity review (below). |
| Purity review (`lib/purity.mjs`, `purity-allow.json`) | Scans the 112 files the matrix classes as reusable for the project's name, record ids, baseline label, restaurant vocabulary, file names and selectors. Findings fell from 365 (51 files) to **58 in 16 allowlist entries, each with a reason** (the project's own source folder and the scanner are not part of that count); the list is a ratchet that can shrink and never grow. |
| `fixtures/generic/` and `check:selftest-generic` (new, fast) | A second, invented project (Quillfeather Letterpress: two pages, no builder, no baseline, no industry, no hero) run through the unchanged engineering. 28 cases, section 3. |

## 2. Your seven priorities

1. **Reusable engineering separated from Jade & Ember data.** Done for everything the checks reached by name or path (section 5 lists what still lives in the engineering folder). 365 project-specific values reduced to 58.
2. **Release-authentication architecture and hard stop preserved.** `lib/authenticity.mjs`, the release gate's requirements, the release records, the reviewer table and the frozen release-control proof of concept are unchanged (`git diff 187f672..HEAD` is empty for them). The dry run still passes 319 of 319 scenarios and the 41 release-control cases.
3. **Project-specific assumptions removed from reusable components.** Section 1 and the ratchet. What remains is test material that names the demonstration project (dry-run and release-case catalogues, hosting-adapter tamper cases), the frozen proof of concept, and one message text, each listed with its reason.
4. **Cloudflare Pages and Vercel portability preserved.** The three hosting adapters and their goldens are unchanged in behaviour; the fixture page was renamed `menu` to `products` so the adapters' test material is not a restaurant's (14 golden files regenerated, hashes follow). `check:hosting` and `check:portability` pass.
5. **Previously approved release-package requirements assigned to G6-5.** Only D-P4-2 was assigned, and it is done. Wiring the host bundle and the real-404 requirement into the release gate was **not** assigned to G6-5 and remains your decision (G6-4 report, decision 3).
6. **Same Base Engineering Framework for every offering.** Structural: `offering` selects nothing, and `check:project` proves changing it leaves the check list identical.
7. **Anthropic Frontend Design stays the sole creative authority.** Nothing visual changed; the manifest carries no aesthetic value.

## 3. Verification

* **Full `npm run verify`: 42 of 42 checks pass** locally (`STS_REQUIRE_AUDIT=1`, Chromium) on the clean committed tree `f485758`. The fast run passes 24 of 24.
* **Parity** ([`g6-5-evidence/`](g6-5-evidence/README.md)): the delivered tree hash is `9061a227…`, the candidate digest `69f9f18f…` and the composite SBOM digest `a1dbdd12…`, all as before. Against the reference taken on `187f672`, every other line of both reports is identical except 61 (full) and 48 (fast), each pinned with its reason; `parity.mjs compare` fails on an unlisted difference and on a listed one that did not occur. The differences are the two new checks, the registry cases in `check:selftest-gate5`, and the check count.
* **Self-test cases reconciled:** `caught:` lines 413 before, 424 after (+4 registry cases in gate 5, +7 in the new generic suite). Gates 2, 3, 4 and 6 are unchanged line for line.
* **`check:selftest-generic` (28 cases):** identity and isolation of the fixture (its tree names nothing of Jade & Ember); manifest validity and the no-subtraction cases for the fixture too; a need the project does not meet reports "not applicable"; ids, schema ids and host names derive from the fixture; its page list; undeclared selectors, industry, builder and baseline fail loudly, naming the project; the default project is still the default when none is set; `check:html` and `check:secrets` pass on the fixture and catch a planted defect in it; a check the fixture adds through its own manifest runs from the fixture, is placed where it asks, and fails the run when it fails; a missing page registry, a missing approvals log and an unknown manifest key are caught.
* **Independent review** by a separate model session (not a person) of `187f672..93a7484`: it found the delivered site, renderer, authenticity stop, release-control and records untouched, no real person's name and no invented reviewer, the old check order preserved, the comment stripper exact on 172 files, and reproduced eight defects. Disposition, all in `f485758`:

| Finding | Disposition |
|---|---|
| A check not applicable to a project was printed and sealed as a pass | Fixed: printed `N/A`, listed in the sealed record (only when there is one, so Jade & Ember's record is unchanged), and a release record that carries one is refused |
| A manifest could shrink what the record vouches for (empty `engine.projectFiles`, `projectFolders`, `sourceRoots`) | Fixed: `check:project` requires the manifest in the digest, every executed module covered, `sourceRoots` for a builder, `{out}` in the build command, a regression recipe with a baseline (5 new refusal cases) |
| `standard()` fell back to Jade & Ember's evidence spec, Lighthouse config, release policy and schema for another project | Fixed: only the HTML rules (they name no project) fall back; the rest has no fallback and fails loudly |
| Two checks sharing an anchor came out reversed; a check could be placed before the base checks | Fixed; default order verified unchanged |
| Several negative cases passed for the wrong reason or on a loose pattern | Fixed: tightened or split |
| Skipped parts of `check:media` and `check:html` were silent | Fixed: stated in the notes |
| `authority.mjs` hard-coded the engineering folder; the build command rewrote any argument naming a file; a dead `structuredData` block in the adapter | Fixed |
| Purity review gaps: JSON files are not scanned; counting is per line per rule; an entry is keyed on file and rule, not value; a regular expression after `)` can hide a finding | **Not fixed, stated** (section 5) |
| The `APR-JE-046` ledger row records a message the reviewer could not verify | Not a defect: the row records your G6-4 closure message |

## 4. Remaining production-release blockers and live-host requirements (unchanged)

G6-5 clears none of them. Matrix section 6 remains the register (RB-01 to RB-16). In short: no human reviewer is enrolled and the authenticity stop is deliberate (the gate cannot pass); real-device and screen-reader evidence is not recorded; media rights are not verified by a person; the 404 page does not exist (RB-12 and D-P3-1); nothing has been observed on a live host and no preview is authorised (D-P3-5); the provider pages have not been re-read by a person (D-P3-6); Cloudflare Pages answers Range requests with 200, which matters for the hero video on Safari; RB-14 (the framework extraction itself) is G6-6. Firefox and WebKit run only in GitHub Actions.

## 5. What G6-5 does not do, and what it leaves open

1. **The fixture does not run `npm run verify` end to end.** The engineering folder still mixes code, rules that name no project, and the project's records (budgets, tokens, findings, the release records, the evidence specification, the Lighthouse configuration, the release policy and its schema, which carry the project's pages and id). A project must carry its own copy of those; the checks that read them fail loudly for a project that does not, and are not run on the fixture. Splitting them into "the engineering's" and "the project's" files is the remaining part of the core/adapter split and is a precondition for G6-6's "fixture in three engines".
2. **The generators (`src/lib/seo.mjs`, `crawlers.mjs`, `config.mjs`) are still the project's.** The renderer's sources are denied to G6-5; they move with the framework in G6-6.
3. **One industry adapter exists (restaurant).** The seam is proved by the fixture declaring none and by the structured-data validator asking the adapter for everything industry-specific, but no second industry adapter has been written.
4. **The purity review reads `.mjs` files only**, counts per line per rule and keys its allowlist on file and rule. JSON that carries project values is not covered. The matrix decides what is scanned, so reclassifying a file would stop its scan (the matrix is itself checked and approved).
5. **A manifest that omits a capability** (a baseline, a builder, an industry adapter) makes checks not applicable. That is visible (`N/A`, the sealed record, the release refusal), but it is the project's declaration, reviewed in the commit that changes the manifest; a project without an industry adapter simply has no industry checks.
6. **Decisions still yours:** the 404 page; which host carries the hero video; whether to wire the staged bundle and the real-404 requirement into the release gate; who re-reads the provider pages; deployment method per client; the Cloudflare default CORS header; and the necessity of the eleven G6-3A decisions (OI-9, not part of G6-5).

## 6. Stopped for owner review

G6-6 (extraction into the framework repository, which needs your explicit approval to modify that repository) has not been started. The master framework repository is unchanged. Nothing was merged, deployed or published.
