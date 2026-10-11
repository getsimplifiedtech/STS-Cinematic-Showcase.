# Gate 5 Phase 5: external links (`APR-JE-033`)

**Status: delivered for owner review.** What the demonstration links to, what a network said about each destination, and the release requirement proposed for external-link verification. Nothing was deployed, no page, style, font or media file changed, and the framework repository was not touched.

## 1. Result in brief

| | |
|---|---|
| External destinations in the delivered demonstration | **5 entries, 4 distinct addresses**: 1 clickable link (the studio credit link, on all five pages) and 4 addresses printed in plain text (the studio address in the site configuration, and three in the font licence texts). XML namespaces (`http://www.w3.org/2000/svg`) are identifiers, not destinations |
| Run on a networked runner | **GitHub Actions run 33 (`a749a9f`), 2026-10-11: 4 of 4 verified, 0 blocked, 0 unavailable, 0 inconclusive, 0 insecure** (record `EXTV-2`) |
| Run in the development sandbox | 2 verified, 2 **inconclusive** (the sandbox's network policy gave no DNS answer for `getsimplifiedtech.com` or `scripts.sil.org`); recorded as inconclusive, never as a failure or a pass (record `EXTV-1`) |
| What "verified" means | the final response was 2xx, every hop was https (an address printed as http may start there if the destination upgrades it), the certificate was valid, redirects were followed by hand and recorded. It does **not** mean the page says what we expect |
| New control | a registry (`engineering/external-destinations.json`) that `check:links` enforces: an unlisted external address, or a listed one that vanished, fails the build |
| Proposed release requirement | section 6; **not enabled** (`release/policy.json` unchanged) |

## 2. Inventory

Source: every text file the demonstration delivers (HTML, CSS, JS, TXT, MD, XML, JSON, SVG) as `assembleCandidate` builds it, scanned by `engineering/lib/external.mjs`. `node engineering/tools/external-links.mjs inventory` prints it.

| ID | Address | Kind | Where | Why it is there |
|---|---|---|---|---|
| EXT-01 | `https://getsimplifiedtech.com/` | clickable link | `index.html`, `menu.html`, `order-online.html`, `our-story.html`, `visit-us.html` | "Website concept by Simplified Tech Solutions" in every footer |
| EXT-02 | `https://getsimplifiedtech.com/` | text | `config/site.json` | the configuration the credit link is built from (present in the candidate folder, not in the release package) |
| EXT-03 | `http://scripts.sil.org/OFL` | text | `fonts/LICENSES.txt` (3 times) | the OFL FAQ address printed inside each font licence |
| EXT-04 | `https://github.com/googlefonts/karla` | text | `fonts/LICENSES.txt` (2 times) | upstream project in the Karla copyright line |
| EXT-05 | `https://github.com/noirblancrouge/YoungSerif` | text | `fonts/LICENSES.txt` | upstream project in the Young Serif copyright line |

There is no external script, stylesheet, font, image, video, iframe, form action or analytics call (the CSP also forbids them: `check:security`, `check:privacy`). The back-link `../` to the showcase is internal. A **client build** adds its own destinations from its configuration (ordering URL, map, social links); none exists for the demonstration, and the client test fixture uses invented `.test` hosts that cannot be requested.

## 3. Verification results

### 3.1 GitHub Actions run 33 (`EXTV-2`): a networked runner

| Destination | Hops | Final | Class | Notes |
|---|---|---|---|---|
| `https://getsimplifiedtech.com/` | 308 then 200 | `https://www.getsimplifiedtech.com/` | **verified** | one redirect to the `www` host: a different host from the address in the pages |
| `http://scripts.sil.org/OFL` (printed as http) | 301 then 307 then 200 | `https://openfontlicense.org/` | **verified** | upgraded to https by the destination; lands on the Open Font License site's front page, not the licence text itself |
| `https://github.com/googlefonts/karla` | 200 | same | **verified** | |
| `https://github.com/noirblancrouge/YoungSerif` | 200 | same | **verified** | |

Method: HEAD (GET when a server refuses HEAD), manual redirect following up to 5 hops with every hop recorded, https required from the second hop on (and from the first for a clickable link), a 15 s timeout, one retry for a timeout or 5xx, a plain-text user agent that names the studio's engineering check. One request per address, one vantage point (a GitHub-hosted runner), one day.

Findings from the networked run:
1. **The credit link takes one redirect to the `www` host.** It works. Pointing the `href` at the final address would save a hop, but it changes the delivered pages (a baseline file) and is not done; proposal D-P5-3 below.
2. **The printed OFL address no longer leads to the licence text.** `scripts.sil.org/OFL` now ends at `openfontlicense.org/`. The licence texts are copied inside `fonts/LICENSES.txt`, so nothing depends on the address; it is a mention, not a link.

### 3.2 Development sandbox (`EXTV-1`)

| Destination | Class | Why |
|---|---|---|
| `https://getsimplifiedtech.com/` | **inconclusive** | no DNS answer (`ENOTFOUND`): the environment's network policy, not evidence about the site |
| `http://scripts.sil.org/OFL` | **inconclusive** | same |
| the two GitHub addresses | verified (200) | but the sandbox's egress proxy re-signs TLS with its own authority, so this run proves nothing about GitHub's certificate |

This is the reason `blocked`, `inconclusive` and `unavailable` are different words: a closed network must not look like a dead link, and a refused request must not look like a pass. The CI runner is the evidence; the sandbox record is kept as history of what the sandbox could and could not see.

### 3.3 Classification used

| Class | Meaning | A pass? |
|---|---|---|
| verified | final 2xx, https throughout (an http start only for a printed mention), valid certificate | **yes** |
| blocked | 401, 403, 429 or 999: the site refuses automated requests; existence unknown | **no** |
| unavailable | 404, 410, other 4xx, 5xx after a retry, or more than 5 redirects | no (fails the online check) |
| inconclusive | DNS failure, refused or filtered connection, timeout | no |
| insecure | an http hop, a downgrade, or a certificate problem | no (fails the online check) |

## 4. What was added

- `engineering/external-destinations.json`: the registry above.
- `engineering/lib/external.mjs` and `engineering/tools/external-links.mjs`: collection, registry check, the verifier and the record format. `inventory` and `verify [--json] [--write ...]`.
- `engineering/external-links-verification.json`: the history (append only): `EXTV-1` sandbox, `EXTV-2` networked runner.
- `check:links` now enforces the registry and the record structure offline, and `--online` uses the new verifier. A record being old is **not** a failure (no clock bomb).
- A CI job `external links (informational)`: reads the repository and the public internet, writes nothing, never fails the run, prints the classified record into the log. A person copies the printed JSON into the history file (as was done for `EXTV-2`). `check:ci` polices it like the others (no secrets, pinned actions, timeout).
- 36 negative and positive cases in `check:selftest-gate4`: new link, new printed address, a link that vanishes, an http link, malformed registry entries, the verifier against scripted networks (200, redirect, HEAD refused, 403, 429, 404, 500, loop, downgrade, expired certificate, no DNS, retry succeeds, http start upgraded, http start not upgraded), and malformed records (verified with a 404, through an http hop, with no hops; blocked with a 200; inconclusive with a status; a date in the future; a sandbox run claiming success).

## 5. Limits

- Reachability is not content: a 200 from the right address says nothing about the page being the right page. A person looks at each client destination once.
- One run on one day from one network. Sites can answer differently by region, rate limit or bot rules; those would appear as `blocked` or `inconclusive` and must be reviewed by a person, not retried until green.
- The online check cannot run in the development sandbox for most hosts; the CI job is the only automated source of networked evidence, and it is informational.
- Links added by a client (ordering, map, social) are outside the demonstration registry and are verified per client; the tooling for that is Gate 6 work (see 6).

## 6. Proposed release-gate requirement `externalLinks` (not enabled)

APR-JE-027 recorded that external links "become release requirements (not excuses to claim verification falsely)". Proposal, for the owner's decision (D-P5-1):

1. **Scope:** required for the `client-production` channel; informational for the `demonstration` channel (it has one destination and no client).
2. **The list:** the gate derives the build's destination list from the built site (`collectExternal` on the delivered files plus the client's configuration for ordering, map and social URLs) and its digest (`registryDigest`). A new command `npm run release:external-digest` prints it, as `release:search-digest` does for search artefacts.
3. **The record:** a verification record in the history file whose `registryDigest` equals that digest (so it covers exactly this list), whose `runner.kind` is `github-actions` or `person` (a `sandbox` run never counts), dated no more than 30 days before the gate runs.
4. **The result:** every clickable destination `verified`. A printed mention may be `verified` or listed with a reason in an `unverified-accepted` list. `blocked`, `inconclusive`, `unavailable` and `insecure` block the gate unless a person accepts a specific destination with a reason.
5. **The human step:** an `external-links-review` approval row (like `search-review`): *Reviewed by NAME on DATE: each destination opened and correct. digest: SHA-256*, bound to the list, so changing any URL invalidates it. Reachability alone is never the approval.
6. **Safety rules for clients:** all clickable destinations https; none on a reserved, preview or staging host (the existing `isReservedHost`); no destination that redirects through an http hop.
7. **Tests:** the single-defect matrix in `check:release` gets the cases: no record, a record for another list, a sandbox record, an old record, a blocked link, an unavailable link, a missing review row, a review row for another digest.

Not implemented now because the policy file is the owner's decision (APR-JE-027 asked for a proposal in this phase). Implementation is small once approved: one gate requirement, one digest command, the cases above.

## 7. Decisions requested

| # | Decision | Recommendation |
|---|---|---|
| D-P5-1 | Make `externalLinks` (section 6) a client-production release requirement | yes |
| D-P5-2 | Keep the external-links CI job informational, or make it required later | informational now; required once the release requirement is enabled |
| D-P5-3 | Point the credit link at `https://www.getsimplifiedtech.com/` (saves one redirect) | do it in the next approved change to the pages, not as a standalone edit of the baseline files |
