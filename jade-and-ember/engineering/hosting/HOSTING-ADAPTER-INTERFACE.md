# Reusable hosting-adapter interface (Gate 5 Phase 3, `APR-JE-031`)

For Gate 6 framework integration. **A design, not code.** No adapter, module or file of the framework repository is created or changed. The interface generalises what already exists for `_headers`, nginx and Apache (one policy, several renderings, a check that all renderings agree) and adds what Phase 3 found missing: a staged bundle, an adapter-aware folder check and simulation profiles that apply the generated rules.

## 1. Principles (each is already true somewhere in the code, or is a Phase 3 finding)

1. **One source of truth.** Security headers and cache policy come from `security.json`; page list and URL style come from the validated configuration. An adapter only renders; it never decides policy.
2. **The site folder never contains host files.** An adapter writes into a staged bundle next to the site (`bundle/<adapter files>` and `bundle/site/`), so the vendor-neutral folder stays checkable and portable (`check:hosting`).
3. **The bundle is the deployable thing, and it is checked.** Today the folder that `check:hosting` inspects is a candidate, and the release package is a hand-over package. A bundle check closes that gap (HR-05).
4. **No network, no credentials, no deployment.** Adapters are pure functions of files. Deployment stays outside the repository's tools.
5. **Provider facts are data with provenance.** Every provider-specific assumption (limits, defaults, behaviours) is a record with source URL, retrieval date, who confirmed it and a live-check status, so a stale fact is visible.
6. **A simulation profile is part of the adapter** and is held to the same rules: it applies the generated rules, and says in its report which behaviours are modelled and which are not.
7. **The site must stay vendor independent.** Only adapter code and adapter output may name a vendor.

## 2. The interface

```ts
interface HostAdapter {
  id: 'cloudflare-pages' | 'vercel' | 'static-nginx' | 'static-apache' | string;
  facts: ProviderFact[];                       // see 3
  capabilities: {
    cleanUrls: 'platform' | 'config' | 'none'; // Cloudflare Pages: platform; Vercel: config (cleanUrls); nginx/Apache: none
    trailingSlash: 'platform' | 'config' | 'none';
    headersMechanism: 'headers-file' | 'config-json' | 'server-config';
    unknownPath: 'not-found' | 'spa-fallback' | 'configurable';   // Cloudflare Pages without 404.html: spa-fallback
    previewNoindex: 'automatic' | 'manual' | 'none';
    previewProtection: 'default-on' | 'optional' | 'none';
    mount: Array<'domain-root' | 'stored-under-prefix' | 'proxy-mount'>;
    limits: { files?: number; fileBytes?: number; rules?: number; lineChars?: number };
  };
  validateSite(site: SiteDescription): Problem[];            // e.g. urlStyle vs host, baseUrl path vs mount
  render(input: RenderInput): Bundle;                        // pure; no network
  checkBundle(bundleDir: string): Problem[];                 // adapter-aware replacement for the folder check
  profile(): SimulationProfile;                              // for lib/server.mjs
  liveChecklist(): ChecklistItem[];                          // machine-readable; feeds the evidence format
}

interface SiteDescription {
  siteDir: string;                  // the delivered folder, unchanged
  pages: { file: string; public: string }[];
  urlStyle: 'clean' | 'extension';
  channel: 'demonstration' | 'client-production';
  baseUrl: string | null;
  mount: { kind: 'domain-root' } | { kind: 'stored-under-prefix'; prefix: string } | { kind: 'proxy-mount'; prefix: string };
  searchFiles: ('robots.txt' | 'sitemap.xml' | 'llms.txt')[];
}

interface RenderInput { site: SiteDescription; policy: SecurityPolicy /* security.json */; csp: string; outDir: string }

interface Bundle {
  root: string;
  siteRoot: string;                                          // where the delivered files sit inside the bundle
  files: { path: string; role: 'site' | 'headers' | 'deploy-config' | 'doc'; sha256: string }[];
  settingsToApply: { name: string; value: string }[];        // dashboard settings the tool cannot apply
}

interface SimulationProfile {
  host: string;
  redirects: (url: URL) => { status: number; location: string } | null;
  unknownPath: 'not-found' | 'spa-fallback';
  trailingSlash: 'undefined' | 'false' | 'true';
  contentTypes: Record<string, string>;
  rules: (bundle: Bundle) => (pathname: string, type: string) => Record<string, string>;  // the generated header and cache rules, applied
  models: string[];                                          // behaviours modelled
  doesNotModel: string[];                                    // behaviours not modelled (printed in the report)
}

interface ProviderFact { id: string; statement: string; source: string; retrieved: string; confirmedBy: string | null; live: 'unchecked' | 'confirmed' | 'differs'; }
interface ChecklistItem { id: string; step: string; command?: string; expect: string; evidence: string }
```

## 3. Invariants a conforming adapter must pass (the shared contract test)

| # | Invariant | Already tested for the existing renderings? |
|---|---|---|
| 1 | Every rendering carries the same header names and values as `security.json` (plus the computed CSP) | yes for `_headers`, nginx, Apache (`check:security`) |
| 2 | Security headers appear once; `Cache-Control` only in narrower rules; nothing `immutable` for unhashed names | yes for `_headers` (`check:hosting`) |
| 3 | The CSP equals the one computed from the pages in `siteRoot` | yes for `_headers` |
| 4 | The bundle holds the site byte-identical to the manifest, plus exactly the adapter's declared files, and no other vendor file | no (HR-05) |
| 5 | `urlStyle` and `cleanUrls`/`trailingSlash` agree; a mismatch fails | partly (`seo.host: cloudflare-pages` must be `clean`) |
| 6 | Cache sources match the **requested** path, not the file name | no (HR-02) |
| 7 | The channel decides `X-Robots-Tag`; the demonstration always has it, an indexable build never | no (Phase 4) |
| 8 | The simulation profile, driven by the generated rules, serves every public URL with the right status and headers, and reports what it does not model | no (HR-04) |
| 9 | The adapter's own source and output are the only places that name the vendor; the site folder is vendor free | partly (`checkNoVendor`) |
| 10 | The live checklist is generated, and every item has an evidence slot in the same format used for device evidence (`engineering/release/evidence`) | no |

## 4. The three adapters Gate 6 should start from

| Adapter | Reuses | Adds |
|---|---|---|
| `cloudflare-pages` | `renderHeadersFile`, `checkHeadersFile`, the Pages limits | staged bundle with `_headers` at the root; unknown-path model; request-path cache rules; `X-Robots-Tag` host-pattern rule for the demo; bundle check |
| `vercel` | the policy and the CSP computation | `vercel.json` rendering, explicit `cleanUrls` and `trailingSlash`, `outputDirectory` bundle layout, bundle check, profile with trailing-slash handling |
| `static-nginx`, `static-apache` | existing renderings | wrap the existing renderers in the same interface and tests |

## 5. What Gate 6 must decide before implementing

1. Whether the staged bundle is a folder, a ZIP or both, and how the release manifest lists it (the manifest already lists asset integrity).
2. The `mount` model for non-root hosting (matrix M-62): "stored under a prefix" is what `--prefix` does today; "proxy mount" needs no prefixed rules at all.
3. Where provider facts live (a JSON file beside `security.json`) and who confirms them.
4. Whether `check:hosting` keeps its Cloudflare-specific limits or reads them from the selected adapter.
5. The Cloudflare target: Pages or Workers static assets (HR-16).
