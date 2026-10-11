# Hosting requirements carried into Gate 6 (owner decisions `APR-JE-032`)

The owner closed Phase 3 on 2026-10-11 and decided the six open questions. This page records the decisions as **requirements** and lists everything the Phase 3 assessment found that Gate 6 must carry. **Nothing here is implemented**; no preview deployment is authorised (D-P3-5), no adapter exists, and the framework repository is untouched.

## Owner decisions

| ID | Decision (owner's words, condensed) | What it requires |
|---|---|---|
| D-P3-1 | **Require proper 404 handling before live release.** Document the requirement; do not create or redesign a 404 page now. | A live release is blocked until the deployed site answers an unknown path with a real 404 (status 404, not the home page with 200). Today Cloudflare Pages would answer with `index.html` and 200 when no top-level `404.html` exists (risk HR-01). The page itself is a separate, design-approved change (visual proposal VP-3 is not approved); until then the requirement stays open. The live checklist item C-04 records the actual behaviour. Gate 6 should make "unknown path answers 404" a release requirement and a bundle check (a `404.html` exists in the bundle or the adapter proves the provider returns 404). |
| D-P3-2 | **Indexable production websites must use a domain or subdomain root.** | `seo.baseUrl` of an indexable build has no path; a base URL with a path is refused for client-production (today it only warns). `robots.txt`, `sitemap.xml` and `llms.txt` are read only at a host's root. Subpath hosting remains possible only for non-indexable builds and is not a Gate 6 priority. |
| D-P3-3 | **GitHub-connected deployment remains the STS default. The pipeline must verify the exact staged deployment artifact. Direct Upload is an optional alternative.** | Supersedes the Phase 3 recommendation (a staged bundle uploaded directly). The default is the provider building or publishing from a GitHub repository; the pipeline must then prove that what the provider will serve is the exact, checked, staged artifact: the bundle (site plus the adapter's files) is built and checked in CI, its file list and hashes are recorded in the release manifest, and the deployed bytes are compared with it after deployment (live checklist C-07). Direct Upload of the same bundle is allowed as an alternative. Consequences below. |
| D-P3-4 | **HSTS `includeSubDomains` must be disabled by default for clients unless authorised.** | The default `Strict-Transport-Security` for a client is `max-age=31536000` without `includeSubDomains`; including it needs a recorded authorisation per client. **Today `security.json` still contains `includeSubDomains`, so the generated host files still emit it: this is a known deviation from the decision and a Gate 6 change** (a per-client setting with the safe default). No client is deployed, so nothing is exposed. |
| D-P3-5 | **No preview deployment is authorised.** | The live checklist stays a procedure. Nothing is deployed, previewed or published, and no hosting account is touched. |
| D-P3-6 | **Official provider documentation must be re-verified before the hosting adapters are implemented.** | A person (or an agent that can fetch the pages) re-reads every cited provider page and files a dated evidence note, as for the crawler list (`engineering/search-crawler-verification.json`). The Phase 3 facts rest on summaries of the pages, not the pages. |

## What D-P3-3 changes in the Phase 3 documents

- **Repository name ending with a dot (HR-07).** With GitHub-connected deployment this is now a first-class risk, not an avoidable one. Mitigation to evaluate at Gate 6: client sites live in their own repositories with ordinary names (the dot affects this showcase repository, not a client's); for the showcase itself, the first connected deployment must be preceded by confirming that the provider's GitHub integration accepts the name, or the showcase uses Direct Upload.
- **Where the artifact is built.** A provider that builds from the repository runs its own build step; the artifact is then not the one CI checked. The pipeline must either (a) commit or publish the staged bundle to the branch the provider serves (no provider build, "framework preset: none", output directory = the bundle), or (b) re-verify the provider's output against the bundle hashes after deployment. Option (a) is the closer fit to "verify the exact staged deployment artifact".
- **Cloudflare requirements document.** Its "Deployment method" row and acceptance list are updated to match (see `CLOUDFLARE-DEPLOYMENT-REQUIREMENTS.md`).

## Everything Phase 3 found, kept for Gate 6

| Source | Kept as |
|---|---|
| `HOSTING-COMPATIBILITY-MATRIX.md` (54 rows, M-01 to M-65) | the **G6** and **L** rows are Gate 6 work items and live-verification items |
| `UNRESOLVED-HOSTING-RISKS.md` (HR-01 to HR-18) | the risk register; HR-01 (unknown paths), HR-03 (trailing slash), HR-05 (the deployable artifact is not checked), HR-08 (HTML rewriting breaks the CSP hashes) are the priorities |
| `VERCEL-ADAPTER-SPECIFICATION.md` | the specification for the Vercel adapter, to be re-verified (D-P3-6) before it is built |
| `HOSTING-ADAPTER-INTERFACE.md` | the interface the Cloudflare, Vercel and static adapters share |
| `LIVE-DEPLOYMENT-VERIFICATION-CHECKLIST.md` | the procedure for a future, separately approved preview |
| `CLOUDFLARE-DEPLOYMENT-REQUIREMENTS.md` | the Cloudflare settings and acceptance criteria |

## New Gate 6 requirements that come from the decisions and from Phase 4

1. Unknown path answers 404 (D-P3-1): bundle check and release requirement.
2. Indexable build with a base-URL path is refused (D-P3-2).
3. The release manifest lists the staged bundle (file list and hashes) and the pipeline compares the deployed bytes with it (D-P3-3).
4. HSTS `includeSubDomains` is a per-client opt-in (D-P3-4).
5. Every adapter writes the `X-Robots-Tag: noindex, nofollow` header for the demonstration channel and never for an indexable client build (Phase 4 added it to `_headers`, nginx and Apache; the Vercel rendering must add it).
6. Provider documentation re-verified and filed before any adapter is implemented (D-P3-6).

## Added by the Phase 4 decisions (`APR-JE-033`)

| ID | Decision | Gate 6 requirement |
|---|---|---|
| D-P4-1 | Evaluate DuckAssistBot and Meta-ExternalFetcher | Re-read the providers' official crawler pages first, then decide the class (the evidence record is `engineering/search-crawler-verification.json`); no policy change before that |
| D-P4-2 | Keep Restaurant JSON-LD for Jade & Ember | The master framework supports industry-specific schemas (Restaurant is one; the framework needs a way to select the schema type per industry, with the same rule: only verified facts) |
| D-P4-3 | No social-preview image until media rights are confirmed | The master framework supports approved images (a configured, rights-recorded image producing `og:image`, `twitter:card` and dimensions; Jade & Ember configures none) |
| D-P4-4 | Dated human review of crawler documentation before client release | Already enforced by the release gate (`confirmedByPerson`, under 180 days) |
| D-P4-5 | Remove HSTS `includeSubDomains` as a default | Done in the hosting-adapter integration, as one change for every host (also D-P3-4) |
