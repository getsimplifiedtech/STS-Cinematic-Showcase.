# Hosting adapters (G6-4, `APR-JE-044`)

Three adapters (Cloudflare Pages, Vercel, a plain static server) that turn the **delivered folder** into a **staged bundle** and check it. They implement the interface designed in Gate 5 Phase 3 ([`../../hosting/HOSTING-ADAPTER-INTERFACE.md`](../../hosting/HOSTING-ADAPTER-INTERFACE.md)) and the Vercel specification ([`../../hosting/VERCEL-ADAPTER-SPECIFICATION.md`](../../hosting/VERCEL-ADAPTER-SPECIFICATION.md)).

**They are pure functions of files.** No adapter reads a credential, names an account, project or team, opens a network connection or deploys anything. A bundle is a folder on disk; putting it on a host is a separate act that needs a release approval and, for a client, the release gate (and the authenticity hard stop, `lib/authenticity.mjs`, which is untouched). No preview deployment is authorised (D-P3-5): **nothing here has been observed on a live host.**

## Use

```
node engineering/tools/host-bundle.mjs --adapter cloudflare-pages --out /tmp/bundle --candidate --url-style clean
node engineering/tools/host-bundle.mjs --adapter vercel --out /tmp/bundle --site <delivered folder> --url-style clean --base-url https://www.example.com
node engineering/tools/host-bundle.mjs --check /tmp/bundle --for-release --delivered <delivered folder>
node engineering/tools/host-bundle.mjs --verify-served <folder of fetched files> --bundle /tmp/bundle      # after a deployment: the served bytes against the staged bytes (C-07)
```

`npm run host:bundle -- ...` is the same tool. The tests are in [`../../checks/hosting-adapters.mjs`](../../checks/hosting-adapters.mjs) and run inside `check:hosting` (so `npm run verify` and CI). `node engineering/checks/hosting-adapters.mjs --update-golden` rewrites the golden files for review.

## What a bundle is

| Adapter | Layout (the provider serves `site/`) | The adapter's own files |
|---|---|---|
| `cloudflare-pages` | `site/` = the delivered files byte for byte + `site/_headers` | `_headers` (read by Pages, not served: CF-04) |
| `vercel` | `vercel.json`, `site/` = the delivered files | `vercel.json` (outside the delivered site) |
| `static` | `site/`, `nginx.conf`, `htaccess` | the two existing renderings |

Every bundle also holds `SETTINGS.txt` (the dashboard settings a person applies, the provider facts relied on, what is **not observed live**, the open release blockers) and `bundle.manifest.json` (schema `sts/hosting-bundle@1`: every file with role, SHA-256 and size, the tree hash of the site files, the options used, the unverified-live list). The manifest is the "staged-bundle manifest" of D-P3-3; the deployed-bytes comparison (`verifyServed`, `--verify-served`) is written but nothing fetches anything. Wiring the manifest into the release package and gate is **not** part of G6-4 (decision for the owner).

## What each adapter enforces

* **One policy.** Security headers, the CSP (computed from these pages), the cache classes and the demonstration's `X-Robots-Tag: noindex, nofollow` come from `engineering/security.json` only; every rendering carries the same values (tested across `_headers`, `nginx.conf`, `htaccess` and `vercel.json`).
* **HSTS.** `Strict-Transport-Security: max-age=31536000`, **no `includeSubDomains`, never `preload`** (D-P3-4, D-P4-5). `includeSubDomains` is a per-client opt-in: the owner's reference for THAT client must be listed in `security.json` `hstsOptions.authorisations` (a reviewed change in the client's repository; the list is empty here) and named on the command line (`--hsts-include-subdomains --hsts-authorisation REF`). The tool checks that the reference is listed; it cannot check that the record it names says what it should.
* **Clean URLs.** `cloudflare-pages` requires `seo.urlStyle: clean` (the platform redirects `.html` to the extension-less path, CF-08). `vercel` writes `cleanUrls` from the style and **always writes `trailingSlash: false`** (HR-03). `static` requires `extension`.
* **Request-path cache rules.** Every page gets a cache rule for its public path (`/menu`), not only `/*.html`, which never matches a clean URL (HR-02). Also fixed in the release package's own `host/_headers` (`lib/security.mjs`).
* **A real 404 (D-P3-1).** A bundle is accepted for staging without a `404.html` but reports the **live blocker** `real-404` (Cloudflare Pages would answer every unknown path, including `/robots.txt` on the demonstration, with the home page and 200: CF-10, CF-11); `--for-release` / `checkBundle(..., { forRelease: true })` turns it into a failure. **No 404 page is created here**: the page is a visual change (VP-3) the owner has not approved.
* **Search files.** An indexable client build must publish `robots.txt`, `sitemap.xml` and `llms.txt`; the demonstration must publish none.
* **Domain root.** An indexable build whose base URL has a path is refused (D-P3-2).
* **Nothing else rides along.** Host, application and secret files (`_redirects`, `_worker.js`, `functions/`, `wrangler.*`, `vercel.json` in the site, `.env`, hidden files, `serve.py`, `START-HERE.txt`, project folders such as `config/` and `src/`, symlinks, non-static types, nested or upper-case HTML, scripts and styles inside `fonts/` and `media/`, a folder that collides with a page) are refused; the bundle's file list must equal the manifest and the adapter's declared files; the bundle is written again from its own site files and compared byte for byte, **`SETTINGS.txt` and the descriptive parts of the manifest included** (a claim of live verification cannot be added by editing them); nothing in the bundle may look like a credential.
* **The delivered folder is never touched.** The output folder is refused if it is the delivered folder, inside it, contains it, contains the working folder, or is a non-empty folder that is not an earlier bundle.
* **Soft 404s and URL style.** A `404.html` that has no text, is a copy of `index.html` or redirects by meta refresh is refused; the declared URL style must be the one the site's own sitemap and canonical links use; an indexable base URL must be an https domain root.

## Simulation profiles

`profiles.mjs` applies a bundle's generated rules to requests (`lib/server.mjs` option `profile`): redirects, clean URLs, the not-found behaviour, header rules, Range. They are **a simulation of documented behaviour, not a test of the live service**; each profile lists what it models and what it does not (compression, edge caching, TLS, the exact redirect status, headers on the 404 response, the platform's default HSTS ...). `check:portability` walks the real site, with real clicks, under the Cloudflare Pages and Vercel profiles.

Two properties of the simulation exist because CI found them on other machines than the one the profiles were written on: (1) **file lookup is case-sensitive** (`exactFile` in `common.mjs`: every path segment must appear in the folder listing exactly as requested), because a plain `stat` on macOS or Windows folds case and answered `/Menu` from `menu.html`; (2) **`plainHttp`** (`serveSite` option, used only by the browser walk in `check:portability`) leaves out the two HTTPS-only parts of the policy, `upgrade-insecure-requests` and `Strict-Transport-Security`, because the walk is plain `http://127.0.0.1` and WebKit upgrades every request from such a page to https. `check:hosting` still asserts the full header set of every profile, those two parts included.

Two documented behaviours worth knowing: Cloudflare Pages is documented to answer Range requests **with 200, not 206** (CF-12), which matters for the hero video on Safari; and Pages treats a site with no top-level `404.html` as a single-page application (CF-10).

## Provider facts

[`../../hosting/provider-facts.json`](../../hosting/provider-facts.json): 41 facts, each with a source and a live status (`unchecked`). Cloudflare facts are verbatim quotations from the documentation source (`cloudflare/cloudflare-docs`, retrieved 2026-10-12, source digests recorded). Vercel's documentation pages could not be fetched from the sandbox: Vercel facts are statements of its open-source routing code (`@vercel/routing-utils`, verbatim) or **paraphrases of the official pages by a search tool**, labelled as such. D-P3-6 asks for a person to re-read the pages: that has **not** been done and the file says so.

## Limits (see the G6-4 report for the full list)

* The existing `nginx.conf` and `htaccess` renderings scope their cache rules differently from `_headers` and `vercel.json` (by location pattern and by extension); only the security headers are compared across renderings.
* Content semantics of `robots.txt`, `sitemap.xml` and `llms.txt` (for example a `Disallow: /`) are the business of `check:seo`; the adapters check that they exist, are not empty and agree with the declared URL style.
* The Pages file-count limit is kept at the free plan's 20,000 (CF-17b); a paid-plan site above it is refused until an option is added.


Not observed live: everything in `UNVERIFIED_LIVE` (`index.mjs`) and each manifest. Not done: wiring the bundle into the release manifest and gate (RG-12 stays open at the gate), the Workers-static-assets target (HR-16), a person's re-reading of the provider pages, any preview.
