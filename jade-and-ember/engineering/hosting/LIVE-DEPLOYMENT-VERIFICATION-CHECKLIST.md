# Live-deployment verification checklist (Gate 5 Phase 3, `APR-JE-031`)

What to do, and what to record, **when a non-production preview deployment is separately approved**. Nothing in this phase deploys anything; this is the procedure for later, written so that a person (or Claude with the owner's explicit approval for that deployment) can run it and file the result. Evidence rows refer to the risks in [UNRESOLVED-HOSTING-RISKS.md](UNRESOLVED-HOSTING-RISKS.md) and the matrix rows in [HOSTING-COMPATIBILITY-MATRIX.md](HOSTING-COMPATIBILITY-MATRIX.md).

**No preview deployment is authorised (D-P3-5, `APR-JE-032`).** This checklist is a procedure for later; nothing in it may be run against a real host until a separate approval says so.

**Update after G6-4 (`APR-JE-044`): no item has been performed.** What changed for whoever runs it later: (1) the staged bundle of precondition P-2 now exists (`npm run host:bundle`, [`../adapters/hosting/README.md`](../adapters/hosting/README.md)); its `bundle.manifest.json` and `SETTINGS.txt` list the behaviours the adapter assumed and could not observe, and C-07 can be run with `node engineering/tools/host-bundle.mjs --verify-served <folder of the files fetched> --bundle <bundle>`; (2) C-09 matters more on Cloudflare Pages: its documentation says Range requests are answered with 200 (CF-12), so the hero video's seeking and Safari playback must be checked on the real host; (3) C-04 now has a known expected answer without a `404.html`: the home page with 200 on Cloudflare Pages (CF-10, CF-11); (4) V-03 and V-04 test the assumption that every matching `vercel.json` header entry applies and a repeated key is set again (VC-05, open-source code only); (5) the HSTS rows (C-08, V-07) should read max-age=31536000 without includeSubDomains.

## 0. Preconditions (all must hold; none is true today)

| # | Precondition |
|---|---|
| P-1 | A recorded owner approval names the provider, the channel (the **fictional demonstration** only, unless the owner says otherwise), the exact commit, the preview address and who may delete it. This is not a release or production approval |
| P-2 | The deployment is built from a staged bundle whose files match `SHA256SUMS`/the release manifest (the bundle step is Gate 6; until then, the person records exactly what was uploaded and its checksums) |
| P-3 | `noindex, nofollow` is in the pages; for Cloudflare, the preview address is non-production (it carries `X-Robots-Tag: noindex`); for Vercel, protection state is recorded |
| P-4 | No analytics, injection or HTML-transform feature is switched on (C-07 verifies it) |
| P-5 | No credential or token is put in the repository, a command line kept in a record, or a screenshot |
| P-6 | The record is filed in a dated evidence note under `engineering/hosting/live-evidence/` (to be created then) with: provider, plan, date, commit, tester, address, the command output |

How to fetch: `curl -sS -D - -o /dev/null -H 'Accept-Encoding: gzip, br' <url>` for headers, `curl -sS -o body <url>` then `sha256sum` for bytes, `curl -sS -r 0-99 -D - -o /dev/null <url>` for Range. Use the real browsers for the browser rows.

## 1. Routing and redirects (both providers)

| ID | Step | Expect | Record | Rows |
|---|---|---|---|---|
| C-01 | Request each of the five pages at its clean URL (`/`, `/menu`, `/our-story`, `/visit-us`, `/order-online`) | 200, `text/html; charset=utf-8`, no redirect | status, type, hops | M-02 |
| C-02 | Request the `.html` forms and `/index.html`, with and without `?x=1` | one redirect to the clean URL, query kept; record the status code (expected 308) | status, `Location` | M-02, M-36 |
| C-03 | Request `/index`, `/Menu`, `/menu/`, `/menu//`, `/menu.html/` | record each answer; `/menu/` must not serve a page whose relative links break | status, body first line | M-03, M-33 to M-35, HR-03 |
| C-04 | Request `/nope`, `/robots.txt`, `/sitemap.xml`, `/llms.txt` on the **demonstration** | record status and whether the body is the home page or a 404 | status, first bytes, `Content-Type` | M-04, M-32, M-56, HR-01 |
| C-05 | Follow every internal link of every page from its clean URL (the browser or a script) | every link ends on a 200; count redirect hops (25 expected on a clean-URL host) | hop count per link | M-57 |

## 2. Headers (both providers)

| ID | Step | Expect | Record | Rows |
|---|---|---|---|---|
| C-06 | For each of the five pages and for `/styles.css`, `/site.js`, one image, one font, both videos: read all response headers | the seven security headers and the CSP **exactly once each** with the generated values; `Strict-Transport-Security` as decided (D-P3-4); on the demonstration `X-Robots-Tag: noindex` when Phase 4 has added it | full headers per URL class | M-06, M-09 |
| C-06a | Same on a redirect response and on a 404 | record whether headers are present (Cloudflare: redirects carry none) | full headers | M-08, M-37 |
| C-06b | `Cache-Control` for each URL class: Home, a clean page URL, a `.html` URL, CSS, JS, fonts, media, the three search files | as intended by `security.json` or the documented host default; record any difference (HR-02) | header values | M-07, M-13, M-25 |

## 3. Integrity and delivery

| ID | Step | Expect | Record | Rows |
|---|---|---|---|---|
| C-07 | Download every delivered file and compare `sha256` with the release manifest / bundle checksums | every file byte-identical, including the HTML pages (no minification, injected beacon, rewritten address or added script). Also search the HTML for `cdn-cgi`, `cloudflareinsights`, `_vercel`, `/_next` | per-file hash match | M-10, HR-08 |
| C-08 | Read the served `Strict-Transport-Security` | equals the decided value; on Vercel, ours replaces the default | header | M-26, HR-09 |
| C-09 | `curl -r 0-99` on `hero-loop.mp4` and `hero-loop.webm`; also an open-ended range (`-r 500-`) and a suffix range | `206`, correct `Content-Range`, `Accept-Ranges: bytes`, types `video/mp4` and `video/webm` | headers | M-14, M-39, HR-12 |
| C-10 | Request text assets with `Accept-Encoding: gzip, br`; request the video with it | text assets compressed (`Content-Encoding`), video not recompressed; `Vary` sensible | headers, transferred sizes | M-38, HR-13 |
| C-11 | Types for `.webp`, `.woff2`, `.txt`, `.md`, `.xml` (client fixture), `.json` if present | `image/webp`, `font/woff2`, `text/plain`, `text/markdown` or plain, `application/xml`; nothing `application/octet-stream` | types | M-14, M-53 |
| C-11a | Revalidation: request a CSS file twice, second time with `If-None-Match` | `304` on match | statuses | M-30 |

## 4. Browser behaviour on the live address

| ID | Step | Expect | Record | Rows |
|---|---|---|---|---|
| C-12 | Open each page in Chromium, Firefox and WebKit (Playwright builds) with the console open | no CSP violation, no console error or warning beyond the two known findings (F-G5-01 for local files only, F-G5-02 Firefox preload note), fonts and images loaded, hero video plays or falls back | console log, screenshot | M-09, M-14 |
| C-13 | Real Safari and iOS Safari: load Home and play the hero | works; this is also Phase 2 E3 evidence and must be filed in that format against the release commit | evidence record | HR-12 |
| C-14 | Reduced motion and Save-Data: the poster and push take over | as in the local checks | screenshot | existing checks |

## 5. Search assets (a synthetic or real **client** build only; the demonstration publishes none)

Only on a separately approved client preview or a synthetic client bundle.

| ID | Step | Expect | Record | Rows |
|---|---|---|---|---|
| S-01 | `/robots.txt`, `/sitemap.xml`, `/llms.txt` at the root | 200 without redirect; `text/plain`, `application/xml`, `text/plain` or Markdown; not behind protection; no `Set-Cookie` | headers | M-52 to M-55 |
| S-02 | Every URL in the sitemap and in `llms.txt` | 200 with no redirect, equal to the page's canonical | statuses | M-57 |
| S-03 | `robots.txt` names exactly one https sitemap and carries the configured crawler policy | as built | body | M-51 |
| S-04 | Change a sitemap date and redeploy | the new file is served within the documented cache time; no stale copy | before/after | M-54 |
| S-05 | Search Console / Bing Webmaster validation of the sitemap and `robots.txt` | accepted (a human step, outside this repository) | screenshot | |

## 6. Cloudflare Pages only

| ID | Step | Expect | Rows |
|---|---|---|---|
| CF-1 | The deployment log reports the `_headers` file as parsed with the expected number of rules (7 for this site: `/*`, `/`, `/*.html`, `/*.css`, `/*.js`, `/media/*`, `/fonts/*`; the exact count is whatever `host:files` generated) and no warnings | rule count, no warnings | M-05 (general knowledge about the log; unverified) |
| CF-2 | Zone and project settings: Web Analytics automatic setup, Email Address Obfuscation, Auto Minify (if present), Rocket Loader, Zaraz, Early Hints all **off** or recorded | recorded | M-10, HR-08 |
| CF-3 | Preview address returns `X-Robots-Tag: noindex`; the production `*.pages.dev` address does not | recorded | M-11, HR-10 |
| CF-4 | `_headers` host-pattern rule (`https://:project.pages.dev/*`) adds `X-Robots-Tag: noindex` on the production `pages.dev` address (Phase 4) | present | M-11 |
| CF-5 | Custom domain only after approval: HSTS zone setting versus the header; apex and `www` redirect; certificate | recorded | HR-09, HR-15 |
| CF-6 | Access on previews, if used, protects only previews | recorded | M-17 |

## 7. Vercel only

| ID | Step | Expect | Rows |
|---|---|---|---|
| V-01 | Project settings match the specification: Other, Root Directory, Output Directory `site`, build and install blank, no environment variables | recorded screenshot or CLI output without secrets | M-23, M-24 |
| V-02 | `vercel.json` accepted and effective: `cleanUrls` and `trailingSlash` behaviours match the spec (C-01 to C-03 repeated) | `/menu.html` redirects, `/menu/` redirects to `/menu` | M-20, M-21 |
| V-03 | Header `source` entries match clean URLs: the page-specific `Cache-Control` appears on `/menu` | present | M-22, HR-02 |
| V-04 | No repeated header when several entries match | each once | M-22 |
| V-05 | Deployment Protection state recorded; how a reviewer opens the preview recorded (login or share link) | recorded | M-27, HR-10 |
| V-06 | Generated preview URL carries `X-Robots-Tag: noindex`; a custom domain on the same branch does or does not (record) | recorded | M-27 |
| V-07 | HSTS value delivered (ours versus platform default) | recorded | M-26 |
| V-08 | After a redeploy with a changed CSS file, the old copy is not served from the edge | new bytes | M-25 |
| V-09 | `vercel.json` is not served as a public file | 404 on `/vercel.json` | M-24 |

## 8. After the run

1. File the record (P-6) with the commit, the provider's plan, every command output and every difference from expectation.
2. For each difference, update the provider fact (interface section 2, `ProviderFact.live`) and the matrix row; open a finding if it affects delivery.
3. Delete the preview as the approval specified; record the deletion.
4. Report to the owner: what matched, what differed, what is still owed, with no claim of production readiness.
