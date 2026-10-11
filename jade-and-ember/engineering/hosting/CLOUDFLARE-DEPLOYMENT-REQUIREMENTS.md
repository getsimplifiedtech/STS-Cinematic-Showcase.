# Cloudflare Pages deployment requirements (Gate 5 Phase 3, `APR-JE-031`)

Requirements for a future, separately approved Cloudflare Pages deployment of this site. **Nothing is deployed by this document**, and no deployment, preview or credential exists. Classes (**T**, **D**, **L**, **G6**) are defined in `README.md`; row references (`M-xx`, `HR-xx`) point to the matrix and the risk list. Cloudflare facts come from summaries of the official pages (2026-10-11) and must be re-read by a person before Gate 6 relies on them.

## 1. Settings

| Setting | Requirement | Class |
|---|---|---|
| Framework preset | None | T (`HOSTING.md`, static folder) |
| Build command | None. The deployed folder is a **staged, checked bundle** produced by the pipeline, so Cloudflare serves exactly what was checked (a build in Cloudflare's own builder adds a Node version and a second place where the bytes can differ). With the default GitHub-connected deployment (D-P3-3) the bundle is the content of the branch Cloudflare serves, with "framework preset: none" and no build command | **G6** (staging step); D-P3-3 |
| Build output directory | The staged folder that holds `index.html`, the other four pages, `styles.css`, the scripts, `fonts/`, `media/` and `_headers` at its root | **G6** |
| Environment variables | None. Exception to note: a paid plan that wants the 100,000-file limit needs `PAGES_WRANGLER_MAJOR_VERSION=4` (D); this site has 27 files and does not need it | D |
| Functions, `_worker.js`, `_routes.json`, `_redirects`, `wrangler` file | None. `check:hosting` fails if any appears in the folder it inspects | T |
| Deployment method | **GitHub-connected deployment is the STS default (D-P3-3).** The pipeline must verify the exact staged artifact: the bundle is checked in CI, its file list and hashes are in the release manifest, and the bytes Cloudflare serves are compared with it after deployment (checklist C-07). Direct Upload of the same bundle is an optional alternative. This showcase repository's name ends with a dot (HR-07): confirm the integration accepts it before the first connected deployment, or use Direct Upload for the showcase | **L**; **G6** |
| Production branch / preview branches | Not applicable to a direct upload; with Git, previews are non-production and carry `X-Robots-Tag: noindex` (D) | D |

## 2. Files the bundle must contain

| File | Source | Requirement | Class |
|---|---|---|---|
| Five pages, `styles.css`, `site.js`, `hero.js`, `menu.js`, `fonts/*.woff2`, `media/*` | the built site | byte-identical to the release manifest's asset integrity list | T (manifest, `check:assets`); **L** (served bytes) |
| `fonts/LICENSES.txt`, `media/PROVENANCE.md` | the site | public URLs once deployed; acceptable only while their content is approved for publication | **L**; owner note (HR-11) |
| `config/*.json` | present in the candidate that `check:hosting` inspects, **absent** from the release package | must not be in the deployed bundle unless the owner decides so | **G6** (state the bundle's file list) |
| `serve.py`, `START-HERE.txt` | present in the release package (a hand-over package) | must **not** be deployed | **G6** |
| `_headers` | `npm run host:files -- --out <dir>` (or `release:prepare`'s `host/_headers`), generated from the exact built pages | at the bundle root; regenerated after every rebuild because the CSP hashes belong to the exact bytes | T (content); **G6** (placement and a check of the final bundle) (HR-05) |
| `sitemap.xml`, `robots.txt`, `llms.txt` | the client build | present for an indexable client build; absent for the demonstration | T |
| `404.html` | **does not exist** | see section 4; **a proper 404 is required before live release (D-P3-1)** | D-P3-1 (requirement documented; page not created) |

`check:hosting` rejects a folder that contains `_headers` (probe, 2026-10-11: `_headers is not a static web file type`), yet `HOSTING.md` tells the deployer to copy it in. The final bundle is therefore not covered by that check today (HR-05, **G6**).

## 3. Routing and redirects

| Requirement | Detail | Class |
|---|---|---|
| Client builds: `seo.host: "cloudflare-pages"` and `seo.urlStyle: "clean"` | The build refuses `extension` for that host. Canonicals, sitemap, structured data and `llms.txt` carry `/menu`, not `/menu.html`; Home is the base URL | T |
| `.html` addresses redirect to extension-less ones; `/index.html` to `/` | Documented for `/contact.html` and `/about/index.html` (D). Exact status code, `/index.html`, `/index`, query-string and fragment handling | D; **L** |
| One redirect hop per internal link | The pages link to `menu.html` etc., so every click on a clean-URL host costs one redirect (25 links). Acceptable; the final URL equals the canonical | T |
| Trailing slash | `/menu/` is unsupported by the site. Record what Pages does | **L** (HR-03) |
| Unknown paths | Single-page-application fallback when no `404.html` exists (D) | D; **L**; D-P3-1 (HR-01) |
| No `_redirects` | The site needs none. Domain-level redirects (`www` to apex, HTTP to HTTPS) belong to DNS and zone settings | T; **L** (HR-15) |

## 4. Unknown paths and the missing `404.html`

Cloudflare documents that a project without a top-level `404.html` is treated as a single-page application and answers any path that matches no asset with `index.html`. For this site that means:

1. a mistyped URL on the live site answers 200 with the home page (a "soft 404" for search engines);
2. on the **fictional demonstration** (which publishes no `robots.txt`, `sitemap.xml` or `llms.txt`), those three paths answer 200 with the home page, so a crawler reading `/robots.txt` receives HTML;
3. the local simulation answers 404 for all of these (probe), so no test sees it.

**Owner decision D-P3-1 (`APR-JE-032`): proper 404 handling is required before live release.** The requirement is documented; no 404 page is created or redesigned now (visual proposal VP-3 "404 page" in `APR-JE-019` stays unapproved, so the page needs its own design decision). Until it exists, the behaviour above stands and the live-release requirement is open. The demonstration's `noindex` is defended by the meta tag and, since Phase 4, by an `X-Robots-Tag` header in the generated host files (it applies to every response the rule covers, including a fallback response, but a live check must confirm that). Checklist item C-04 records the real behaviour.

## 5. Security headers, CSP and caching

| Requirement | Detail | Class |
|---|---|---|
| Security headers once, in the `/*` rule only | `check:hosting` (T). On the wire each header must appear exactly once per response (rules join with a comma if duplicated, D) | T; **L** |
| CSP equals the computed policy | `check:hosting`, `check:security` (T); delivered unchanged on pages and assets | T; **L** |
| Cache rules | `/` and `/*.html` `no-cache`; `/*.css`, `/*.js` `no-cache`; `/media/*`, `/fonts/*` `public, max-age=604800`. Pages' default for static assets is `public, max-age=0, must-revalidate` (D). Rules match the request path, so `/*.html` does not match `/menu` | D; **L**; **G6** (HR-02) |
| Nothing marked `immutable` for unhashed names | T (`check:hosting`) | T |
| HSTS | `max-age=31536000; includeSubDomains` is in the file. For a client domain, whether `includeSubDomains` is wanted, and how it interacts with any HSTS setting on the Cloudflare zone, needs an owner decision | **L**; D-P3-4 (HR-09) |
| Redirects carry no headers | Redirects run before headers (D) | D; **L** |

## 6. Provider features that must be off or verified

Any feature that changes the served HTML changes the bytes the CSP hashes were computed from, and a feature that adds a script or a call conflicts with `script-src 'self'` and `connect-src 'none'` and with the privacy check ("no third-party request").

| Feature | Why it matters | Required state | Class |
|---|---|---|---|
| Web Analytics automatic setup (beacon from `static.cloudflareinsights.com`) | needs `script-src` and `connect-src` changes (D) | off | **L** |
| Email Address Obfuscation | rewrites visible addresses, injects a decode script (D); interaction with this CSP undocumented | off, or verified on the live page | **L** |
| Auto Minify, Rocket Loader, Early Hints, Zaraz, any HTML-rewriting transform | change bytes or add scripts | off | **L** (general knowledge for the list; unverified) |
| Access on previews | protects previews only, not `*.pages.dev` production or a custom domain (D) | a decision if the preview must be private | **L** |
| `_headers` host pattern `https://:project.pages.dev/*` | can add `X-Robots-Tag: noindex` to the production `pages.dev` address (D) | to be used for the demonstration | **G6/Phase 4** |

## 7. Indexing rules for what may be put on Cloudflare

- The **fictional demonstration** may only ever be deployed as a non-production preview, separately approved, `noindex` preserved. Its `pages.dev` production address is not noindexed by Cloudflare (D), so the header (Phase 4) is required before any production-address use.
- A **client-production** build is refused by the release gate if `seo.baseUrl` is a `pages.dev`, `vercel.app`, `workers.dev` or other preview or staging host (T, `check:release`).
- Deployment itself needs a recorded release approval (`APPROVALS`, section B); no tool here deploys.

## 8. Acceptance for "Cloudflare Pages ready" (to be met at Gate 6 and then live)

1. A staged-bundle step exists, with a check of the **final** bundle (file list, `_headers` accepted, limits, no vendor file other than the adapter's) (**G6**).
2. The simulation applies the generated `_headers` rules, models the unknown-path behaviour and serves `.xml` correctly (**G6**).
3. The live checklist sections 1 to 4 (C-01 to C-14) and CF-1 to CF-6 have been run on an approved preview and the results are filed (**L**).
4. A proper 404 exists (D-P3-1), HSTS `includeSubDomains` is a per-client opt-in (D-P3-4) and the deployment pipeline verifies the exact staged artifact (D-P3-3); see `GATE-6-HOSTING-REQUIREMENTS.md`.
