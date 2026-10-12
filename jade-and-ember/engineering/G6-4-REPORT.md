# G6-4: hosting adapters, report

Work package G6-4, authorised by `APR-JE-044`. **Implemented and verified locally; awaiting owner review. Nothing was deployed, previewed or published; no hosting account, credential or live host was touched; the release gate, the release-control proof of concept, the delivered site, the master framework repository and every media file are unchanged. `lib/authenticity.mjs` is untouched and is still a hard stop. G6-5 was not started.**

## 1. What exists

[`engineering/adapters/hosting/`](adapters/hosting/README.md): three adapters, **Cloudflare Pages**, **Vercel** and a wrapper for plain **nginx/Apache**, each a pure function of files. An adapter turns the delivered folder, unchanged, into a staged **bundle** (the site byte for byte, exactly that adapter's host files, `SETTINGS.txt` and a manifest) and checks any bundle. They hold no credential, name no account, project or team, open no network connection and cannot deploy. `npm run host:bundle -- --adapter … --out …` stages one; `--check` and `--verify-served` check one.

| Part | Does |
|---|---|
| `cloudflare-pages.mjs`, `vercel.mjs`, `static.mjs` | render and check `_headers`, `vercel.json` (keys limited to `framework`, `outputDirectory`, `cleanUrls`, `trailingSlash`, `headers`), `nginx.conf`/`htaccess` |
| `index.mjs`, `common.mjs` | registry, `renderBundle`, `checkBundle` (outside rules, then the bundle is written again and compared byte for byte), site hygiene, credential scan, the deployed-bytes comparison |
| `profiles.mjs` + `lib/server.mjs` | simulation profiles that apply a bundle's rules to requests (redirects, clean URLs, unknown paths, headers, Range), each listing what it does not model |
| `hosting/provider-facts.json` | 47 provider facts with source, digest and live status (all `unchecked`) |
| `checks/hosting-adapters.mjs` | the tests, run inside `check:hosting` (so `npm run verify` and CI) |

## 2. Your eight scope items

| # | Item | Result |
|---|---|---|
| 1 | Portable adapters for Cloudflare Pages and Vercel | Done. The same delivered folder stages under both; `check:portability` now also walks the real site, with real clicks on desktop and phone, under each adapter's simulation profile |
| 2 | Preserve the static deliverable and portability | Done. The delivered folder is never modified (an output folder that is, contains or sits in it is refused); the site stays vendor free (`check:hosting` unchanged in that respect) |
| 3 | Correct 404 handling | **Enforced as a requirement; the page itself is not created** (see decision 1). A missing `404.html` is the live blocker `real-404` in every bundle report and fails `--for-release`. Cloudflare Pages without it would answer every unknown path, including `/robots.txt` on the demonstration, with the home page and 200 (documented, CF-10/CF-11). A `404.html` that is empty, a copy of the home page or a meta refresh is refused |
| 4 | HSTS default corrections | Done everywhere, including the release package's own host files: `Strict-Transport-Security: max-age=31536000`, **no `includeSubDomains`, never `preload`** (D-P3-4, D-P4-5). `includeSubDomains` is a per-client opt-in that needs a reference listed in `security.json` (the list is empty) |
| 5 | Verify SEO files, headers, redirects, clean URLs, CSP | Done at bundle and simulation level: search files present for an indexable build and absent for the demonstration, not empty, and consistent with the declared URL style (sitemap and canonical links); every security header equals `security.json` in all four renderings; the CSP is recomputed from the staged pages; `.html` → clean-URL redirects, `trailingSlash: false` on Vercel, request-path cache rules (also fixing HR-02 in the release package). **Not verified live** |
| 6 | Provider documentation; mark unverified live behaviour | Cloudflare facts are verbatim quotations from `cloudflare/cloudflare-docs` (digests recorded; each fact's statement must be supported by its quote, enforced by the check). **Vercel's documentation site could not be reached from the sandbox**: its facts are statements of Vercel's open-source routing code or paraphrases by a search tool, labelled as such. Every bundle lists what it assumed and could not observe (`SETTINGS.txt`, manifest) |
| 7 | Automated tests and adversarial negative cases | Section 3 |
| 8 | Independent of production credentials and deployment authority | Done and tested: a credential scan over every bundle file, a fixed manifest field list, no identifier fields, and a lint in the dry run that no engineering code deploys |

## 3. Verification results

* **Full `npm run verify`: 40 of 40 checks pass** locally (`STS_REQUIRE_AUDIT=1`) on commit `965f119`, the composite SBOM digest `a1dbdd12…` is unchanged from G6-3. **Correction of an earlier statement:** this report first said that GitHub Actions succeeded on `965f119` "(all jobs, including Firefox and WebKit)". That was wrong and had not been checked job by job. On `965f119` (run 74) and on the head `a8bc3e0` (run 76) the gating job `verify (Ubuntu 24.04, Node 24, Chromium)` and the lighthouse, external-links, supply-chain and Firefox jobs passed, but **`cross-browser: WebKit` failed (`check:portability`, 940 problems) and `fast checks on macos-latest` failed (`check:hosting`, 8 problems)**. Both are informational jobs, so the run's overall conclusion was `success`; that label does not make the failures acceptable, and G6-4 closure was deferred until they were fixed. Section 3a records the causes and the fixes. CI for the earlier head `c138cbf` (the G6-3A report commit) succeeded. Work-in-progress pushes during this package (`b6189e2`, `8a1316d`) failed CI before the matrix regeneration and the sort fix described below. A file cannot record the CI result of the commit that contains it: the result for the final head is read from GitHub Actions and given in the owner report.
* **Adapter tests** (`check:hosting`, about 5 s): 3 adapters × 2 channels (demonstration, indexable client) × with and without a 404 page on an invented fixture site, every bundle passing the outside check and the regenerate-and-compare check, 12 request walks, 20 golden files byte-identical; the real Jade & Ember demonstration and an indexable client build of it staged under both Cloudflare Pages and Vercel (the only open blocker is the missing 404 page); **198 adversarial negative cases** each refused for the right reason; the two header checkers run on their own against damaged text; the deployed-bytes comparison against rewritten, missing, extra and soft-404 responses.
* **Mutation testing: 96 single-line breakages of the adapter guards, 93 caught** ([`g6-4-evidence/adapter-mutations.md`](g6-4-evidence/adapter-mutations.md)). Three survive for stated reasons (one equivalent mutant, two redundant defences in depth).
* **Independent attack review** by a separate model session (not a person): 18 findings, three of them high (the output folder could delete the delivered folder; the served-bytes comparison ignored the `.html` form; `SETTINGS.txt`, the manifest's descriptive fields and credential-shaped text were unchecked). All fixed or documented: [`g6-4-evidence/review-findings.md`](g6-4-evidence/review-findings.md). Not human verification.
* **Found by the existing dry run, not by the review:** page cache rules written in registry order by the release tool and file order by the package verifier made every release package fail verification; fixed (sorted) and guarded by a test.
* **Governance:** `check:framework-matrix`, the G6-4 scope check and the Gate 5 closure verifier pass; G6-3A is recorded as closed as a proof of concept only (`APR-JE-044`).

### 3a. Cross-platform CI failures and their correction

Two independent defects, both in the simulation profiles' contact with the machine they ran on. Neither touched a security control, the delivered site or the generated host files, and neither was a defect of an adapter's output.

| Job | Check | Cause | Fix |
|---|---|---|---|
| `fast checks on macos-latest` | `check:hosting`, 8 problems, all "`/Menu` answered 200" | A profile decided whether a file existed with a plain `stat`. macOS (APFS) and Windows (NTFS) fold case, so `/Menu` was answered from `menu.html`; Linux, Cloudflare Pages and Vercel do not | `exactFile` (`adapters/hosting/common.mjs`): every path segment must appear in the folder listing exactly as requested. Used by all three profiles. Listed as an unverified assumption (request paths are case-sensitive), because no provider page read says so |
| `cross-browser: WebKit` | `check:portability`, 940 problems | The profile server sent the HTTPS-only parts of the policy (`upgrade-insecure-requests` in the CSP, `Strict-Transport-Security`) over plain `http://127.0.0.1`. Chromium exempts loopback from the upgrade, WebKit does not: every stylesheet, script, font, image and click was requested as `https://127.0.0.1:…` from a server with no TLS ("unexpected TLS packet"), and the page then failed to render, navigate or go back | `serveSite(..., { plainHttp: true })` for the browser walk only: the profile's headers minus exactly those two parts (`withoutHttpsOnly`). The hashed CSP, every other security header and the cache rules stay in force. The full headers, HTTPS-only parts included, are still asserted by `check:hosting` on every profile |

The two failures do **not** share a root cause. What they share is that a simulation was exercised in an environment that behaves differently from the target host in a way the Linux/Chromium run could not show.

* Reproduction. The WebKit mechanism was reproduced in Chromium by reaching the profile server through a non-loopback host name (`--host-resolver-rules`): before the fix 7 requests were upgraded to https and reset, after it none. The macOS defect could not be reproduced on the case-sensitive Linux disk here (no case-folding filesystem is available in the sandbox); `check:hosting` now proves it with a case-folding stand-in for the disk. WebKit itself is not installed in this sandbox, so the WebKit fix is confirmed by CI only.
* New assertions (none weakened, none removed): the stand-in folds case (or the test proves nothing); `exactFile` and all three profiles refuse differently-cased paths on it; the plain-http server differs from the full one by exactly the two HTTPS-only parts on pages, assets and unknown paths for both adapters; `check:portability` must serve the profiles with `plainHttp: true`. Each was checked by breaking the fix (stat-based lookup, upgrade directive kept, `plainHttp` dropped): all three breakages are caught ([`g6-4-evidence/adapter-mutations.md`](g6-4-evidence/adapter-mutations.md), "CI correction").

## 4. Unresolved hosting limitations

1. **Nothing is observed live.** No preview is authorised (D-P3-5). Every behaviour the documentation does not settle is an assumption in the profiles and is listed per adapter, notably: the redirect status (308), what `/menu/`, `/index`, `/404` do, whether a `404.html` response has status 404 on either host, whether `_headers` values replace or join the platform's defaults, whether Vercel's `vercel.json` HSTS replaces its platform default, how Vercel combines several matching header entries, whether `vercel.json` works at the bundle root with a Root Directory, content types for `.xml/.txt/.webm/.mp4/.woff2`, compression and caching, Deployment Protection defaults.
2. **A person has not re-read the provider pages** (D-P3-6); `provider-facts.json` says so. The Vercel facts are second-hand.
3. **Cloudflare Pages is documented to answer Range requests with 200, not 206** (CF-12). Safari cannot play or seek video that way. It matters for the hero video and is a live and real-device question that cannot be settled here.
4. **The real-404 requirement and the bundle manifest are not part of the release gate or the release package.** The adapters enforce them when run; a release can still be prepared without running them. The dry run still reports the RG-12 probe as a measured gap, as it should.
5. **The 404 page does not exist.** Without it, Cloudflare Pages behaves as a single-page application and Vercel shows its own platform 404 page.
6. **Platform defaults the bundle does not remove:** Cloudflare Pages adds `Access-Control-Allow-Origin: *` to asset responses (the policy sends `Cross-Origin-Resource-Policy: same-origin`); `*.vercel.app` hosts get `includeSubDomains; preload` from Vercel whatever `vercel.json` says, so the never-preload rule cannot hold there.
7. **Targets and limits:** the adapter targets Cloudflare Pages, which Cloudflare documents a migration away from (HR-16); the file-count limit is the free plan's 20,000; the existing nginx and Apache renderings scope cache rules differently from `_headers` and `vercel.json`; the content meaning of `robots.txt`/`sitemap.xml` stays with `check:seo`.
8. **Simulation profiles prove consistency with the documented behaviour, not the behaviour.** They are written from the same sources as the tests.
9. **The Jade & Ember configuration declares no `seo.urlStyle`** (its default is `extension`); Cloudflare Pages needs `clean`. For a client this is a configuration choice the adapter checks; the demonstration is never deployed.
10. **HSTS opt-in is only as good as the record it names:** the tool checks that the reference is listed in `security.json`, not what the record says.
11. **Not done, by design:** no 404 page, no preview, no hosting account, no Workers-static-assets adapter, no wiring of bundles into the release package, no person's confirmation of any provider fact.

## 5. Genuine owner decisions

1. **The 404 page.** Live release is blocked on it (D-P3-1). Options: approve visual proposal VP-3 (a designed 404 page) or authorise a plain, unstyled 404 page; either is a visual change I have not made. On Vercel alone the platform's own 404 page would apply without it, which the site's design does not control.
2. **Which host carries the hero video.** Cloudflare Pages documents 200 responses to Range requests; Vercel's behaviour is not established. Decide whether a live Safari/iPhone check on a separately authorised preview must precede choosing the host, or whether the video's fallback to its poster is acceptable on Pages.
3. **Wire the requirements into the release path?** Making the staged bundle (with its manifest), the real-404 requirement and the HSTS default release-gate requirements would close RG-12 at the gate. It changes the release package format and the candidate digest, so it is a G6-2/G6-3 style change, not an adapter change. Do it as a separate package, with G6-5, or not at all?
4. **Who re-reads the provider pages (D-P3-6), and when.** Needed before the adapters are relied on; the Vercel pages need a person with network access.
5. **Deployment method per client** (Git integration, the STS default, or Direct Upload): Cloudflare documents that a Direct Upload project cannot be switched to Git integration later (CF-20). Also whether Cloudflare Pages or Workers static assets is the target (HR-16).
6. **Detach Cloudflare's default `Access-Control-Allow-Origin: *`?** It is harmless for a public static site but contradicts `Cross-Origin-Resource-Policy: same-origin`; detaching is one line per adapter.

Standing instruction from `APR-JE-044`: the eleven G6-3A design decisions (R1 to R11) are **not** implemented; their necessity is to be evaluated against established STS requirements before any activation (open item OI-9, not part of G6-4).

## 6. Stopped for owner review

G6-5 has not been started. Nothing was merged, deployed or published.
