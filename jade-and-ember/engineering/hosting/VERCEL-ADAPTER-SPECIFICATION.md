# Vercel adapter specification (Gate 5 Phase 3, `APR-JE-031`)

**Specification only. No adapter is implemented, no `vercel.json` exists in the repository, nothing is deployed.** This document says what a Vercel adapter must produce and prove when Gate 6 builds it, in the shape of [HOSTING-ADAPTER-INTERFACE.md](HOSTING-ADAPTER-INTERFACE.md). Jade & Ember itself stays independent of Vercel; the adapter is tooling around the site, never inside it.

Vercel facts come from summaries of the official pages (2026-10-11): *Static Configuration with vercel.json*, *Deployment Protection*, *Cache-Control headers*, *Response headers*, *Encryption and TLS*, *Builds*. A person must re-read them and file a dated note before implementation. Key names marked "confirm" were not established.

## 1. Facts the adapter is built on

| Fact | Source / class |
|---|---|
| `cleanUrls` defaults to `false`; `true` removes `.html` and 308-redirects the extension form to the extension-less path; rewrite and redirect sources must then omit the extension | D |
| `trailingSlash` defaults to undefined: `/about` and `/about/` both serve the page, no redirect; `false` redirects the slashed form (308); `true` the reverse | D |
| `headers` is a list of `{ source, headers: [{ key, value }] }`; `source` matches the pathname without the query string; `/(.*)` is the documented global pattern | D |
| `outputDirectory` overrides the dashboard setting; framework "Other" is `"framework": null`; the build command is left blank for a plain static site | D (exact "no install" keys: confirm) |
| `redirects` default to 308 (`permanent: true`), 307 when `false`; `statusCode` can set another | D |
| Default static `Cache-Control` is `public, max-age=0, must-revalidate`; static files are also cached at the edge (up to 31 days) | D (pages not fully consistent) |
| HSTS: `max-age=63072000` by default, per hostname, no `includeSubDomains` or `preload`; changeable by custom headers | D (override reliability: **L**) |
| New projects: Standard Protection, which protects previews and leaves production domains public; generated preview URLs get `X-Robots-Tag: noindex`; a custom domain on a non-production branch does not | D (default's name differs between two sources) |
| `vercel.json` must sit at the project root | community report, **unverified** |

## 2. What the adapter must produce

A **staged bundle**, built outside the repository's delivered folder and never inside it:

```
bundle/
  vercel.json        written by the adapter (the only vendor file)
  site/              the delivered site, byte-identical to the release manifest's asset list
    index.html  menu.html  our-story.html  visit-us.html  order-online.html
    styles.css  site.js  hero.js  menu.js
    fonts/*.woff2  media/*      (+ sitemap.xml robots.txt llms.txt for an indexable client build)
```

Project settings the deployer applies (the adapter prints them; it cannot apply them): Framework Preset **Other**; Root Directory = the bundle root; Output Directory = `site`; build command and install command blank; no environment variables; Deployment Protection chosen deliberately (section 6).

### 2.1 `vercel.json` (illustrative; the real file is generated)

```json
{
  "framework": null,
  "outputDirectory": "site",
  "cleanUrls": true,
  "trailingSlash": false,
  "headers": [
    { "source": "/(.*)", "headers": [
      { "key": "Content-Security-Policy", "value": "<computed from the built pages>" },
      { "key": "X-Content-Type-Options", "value": "nosniff" },
      { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
      { "key": "X-Frame-Options", "value": "DENY" },
      { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
      { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
      { "key": "Cross-Origin-Resource-Policy", "value": "same-origin" },
      { "key": "Strict-Transport-Security", "value": "max-age=31536000; includeSubDomains" }
    ] },
    { "source": "/", "headers": [ { "key": "Cache-Control", "value": "no-cache" } ] },
    { "source": "/menu", "headers": [ { "key": "Cache-Control", "value": "no-cache" } ] }
  ]
}
```

(`/menu` stands for each page in the page list; fonts, media, CSS and JS rules follow the same pattern.) Confirm before implementation: the exact keys for "no build, no install"; whether `source` is matched against the path after `cleanUrls` rewriting; whether several matching entries combine or override a repeated key; any limit on the number or size of entries.

### 2.2 Rules the generated file must obey

1. **`cleanUrls: true` and `trailingSlash: false` are always written explicitly**, from `seo.urlStyle: clean` (`seo.host: "vercel"`). Leaving `trailingSlash` unset makes `/menu/` serve the page, which breaks every relative link on it and duplicates content (HR-03). With `seo.urlStyle: extension` the adapter writes `cleanUrls: false` and the same `trailingSlash` rule.
2. **Header values come from `security.json` only** (single source, as for `_headers`, nginx and Apache). The CSP is the one computed from the built pages for the staged `site/`. A test proves the same header names and values as the `_headers` rendering.
3. **Security headers in one entry** (`/(.*)`) and `Cache-Control` only in narrower entries, mirroring the Cloudflare discipline, so nothing can be sent twice even if entries combine.
4. **Cache-rule sources are generated from the page list and the asset directories**, never from a `.html` pattern when `cleanUrls` is on (HR-02).
5. **No `routes`, `rewrites`, `redirects` or functions**, unless a later decision requires a redirect (for example an old address). The site needs none. Domain-level redirects (`www` to apex) belong to the domain settings.
6. **Demonstration channel:** adds `X-Robots-Tag: noindex, nofollow` to the `/(.*)` entry (the Phase 4 header), never for an indexable client build.
7. **Subpath:** not supported for an indexable build; for a non-indexable build the adapter either refuses or writes sources under an explicitly declared stored-under prefix (see the interface's `mount` model, matrix M-62).
8. The file is valid against Vercel's published schema (confirm the schema location) and contains no secret, token, team or project identifier.

## 3. Changes the existing tooling needs (all **G6**)

| Existing item | Required change |
|---|---|
| `check:hosting` forbids `vercel.json` and any text containing "vercel" in the folder, the sources and `engineering/` | Split into "the **site** folder must contain no vendor file" (unchanged) and "the **bundle** may contain exactly the selected adapter's files"; `checkNoVendor` must allow the adapter's own source and docs |
| `seo.host` accepts `vercel`; `urlStyle` and the host setting "must agree" only by convention | The adapter derives `cleanUrls` from `urlStyle`; a mismatch fails the bundle check |
| `lib/server.mjs` profiles `vercel-clean`, `vercel-default` | Add `trailingSlash` (`undefined`, `false`, `true`), apply the generated header rules and cache rules, set `.xml` and other types, model the preview protection state as a flag; keep the profiles marked "simulation of documented behaviour" |
| `release:prepare` writes `host/_headers`, `host/nginx.conf`, `host/htaccess` | Write the adapter's bundle for the selected host; keep the release package separate (it contains `serve.py` and `START-HERE.txt`, which must never be deployed) |
| `HOSTING.md` | Add the Vercel project settings and the staged-bundle description |

## 4. Tests the adapter must ship with (negative tests first)

| Test | Proves |
|---|---|
| bundle with `vercel.json` inside `site/` | rejected: the vendor file must be outside the delivered site |
| `cleanUrls` false with `urlStyle: clean` | rejected: every canonical would be a 404 |
| `trailingSlash` missing | rejected |
| a header value that differs from `security.json`, a CSP that does not match the staged pages, a security header in a second entry | rejected |
| a cache source ending in `.html` while `cleanUrls` is true | rejected |
| more entries or longer values than Vercel's documented limits | rejected (once the limits are confirmed) |
| a demonstration bundle without the noindex header, an indexable client bundle with it | rejected |
| identical header sets across `_headers`, nginx, Apache and `vercel.json` | accepted |
| the untouched bundle of the demonstration and of a synthetic client | accepted; the simulation with `vercel-clean` reproduces the documented redirects, 200s and header set |

## 5. What stays unverifiable without a live preview (the live checklist, Vercel part)

`source` matching on clean URLs; combination of entries; `/menu/` and `/index` behaviour; HSTS override; `Cache-Control` behaviour after a redeploy; Deployment Protection state and how a reviewer opens a protected preview; `noindex` on generated URLs versus a custom domain on a preview branch; content types for `.xml`, `.txt`, `.webm`, `.mp4`, `.woff2`; Range support on the two video files; compression; byte identity of the served pages; platform-injected analytics. See [LIVE-DEPLOYMENT-VERIFICATION-CHECKLIST.md](LIVE-DEPLOYMENT-VERIFICATION-CHECKLIST.md).

## 6. Preview protection, in plain terms

A Vercel preview is protected by default, so the reviewers would have to sign in or be sent a share link; making the fictional demo publicly reachable on Vercel would be a conscious setting change that needs its own approval, with `noindex` kept. A **production** Vercel domain is public; the release gate already refuses a client-production build whose base URL is a `vercel.app` address.
