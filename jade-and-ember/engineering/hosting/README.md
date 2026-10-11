# Gate 5 Phase 3: hosting compatibility assessment

**Status: delivered for owner review. Assessment and documentation only (`APR-JE-031`).** Nothing was deployed, no Vercel adapter exists, no preview or production site was created, no credit was spent, the STS framework repository was not touched, and the approved design and media are unchanged. The only files added or changed are documents and the approval records.

| Document | What it answers |
|---|---|
| [HOSTING-COMPATIBILITY-MATRIX.md](HOSTING-COMPATIBILITY-MATRIX.md) | Every hosting requirement, for Cloudflare Pages and Vercel, in the six areas the owner listed, each classified |
| [CLOUDFLARE-DEPLOYMENT-REQUIREMENTS.md](CLOUDFLARE-DEPLOYMENT-REQUIREMENTS.md) | What a Cloudflare Pages deployment of this site needs, setting by setting |
| [VERCEL-ADAPTER-SPECIFICATION.md](VERCEL-ADAPTER-SPECIFICATION.md) | What a Vercel adapter must produce and prove (specification only, **not implemented**) |
| [HOSTING-ADAPTER-INTERFACE.md](HOSTING-ADAPTER-INTERFACE.md) | The reusable interface every host adapter must satisfy, for Gate 6 framework integration |
| [UNRESOLVED-HOSTING-RISKS.md](UNRESOLVED-HOSTING-RISKS.md) | The risks that remain, ranked, with what would close each |
| [LIVE-DEPLOYMENT-VERIFICATION-CHECKLIST.md](LIVE-DEPLOYMENT-VERIFICATION-CHECKLIST.md) | The steps, expected results and evidence to record when a preview deployment is separately approved |

The existing description of the hosting implementation stays in [`../HOSTING.md`](../HOSTING.md); this folder assesses it.

## How every requirement is classified

| Tag | Meaning | What backs it |
|---|---|---|
| **T** | Verified by existing tests | a named check passed in the GitHub Actions run that closed Phase 2 (run 27, commit `9e9d6f1`, all four jobs) or in a probe of the existing simulation made for this assessment |
| **D** | Verified by official provider documentation | the provider's own documentation page, with the evidence limits stated below |
| **L** | Requires live-host verification | no test or document here can show it; it needs a separately approved preview deployment and the checklist |
| **G6** | Requires implementation during Gate 6 | a change to the tooling or a new component, not allowed in this phase |

A row can carry several tags (for example **T + D**). The tag in **bold** is the one that is still open. A row with **L** or **G6** open is not done.

## Evidence basis, stated plainly

- **Existing tests.** The state of the repository at `9e9d6f1`: `npm run verify` 37 of 37 in Chromium, 15 of 15 browser-driven checks in Firefox and in WebKit, macOS fast checks, all in Actions run 27. The tests drive **local simulations** (`engineering/lib/server.mjs`) and read generated files. They never contact a host.
- **Probe of the simulation (2026-10-11).** For this assessment the four simulated host profiles were asked for thirteen URLs each (`/`, `/menu`, `/menu/`, `/menu.html`, `/index.html`, `/index`, `/Menu`, `/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/nope`, and the query forms). The answers are quoted in the matrix as "probe". Nothing was written to the repository.
- **Provider documentation.** The sandbox cannot resolve provider hostnames (`getaddrinfo ENOTFOUND developers.cloudflare.com`), so no documentation page could be fetched and read in full. What is cited was obtained on **2026-10-11 through a web-search tool that returns summaries of the providers' official pages** (Cloudflare Developers documentation and Vercel documentation, URLs given in each document). This is real evidence, but it is a summary of a page, not the page. Where a summary said it could not confirm something, the matrix says so and the row is **L**. Where two Vercel sources disagreed (the name of the default Deployment Protection setting), the disagreement is recorded. **A person should re-read each cited page and file a dated evidence note before Gate 6 relies on it** (the same discipline Phase 4 asks for the crawler list).
- **General knowledge.** A few statements come from general knowledge of the products and are labelled "general knowledge, unverified". They are always **L**.

## Headline findings

1. **The site itself is host-neutral and ready:** a plain static folder of 27 files (1,996,256 bytes; the largest file is the 913,066-byte hero MP4), no function, redirect, build or vendor file. Every static property is proven by tests (**T**).
2. **What has never been proven is how a real host behaves.** The simulations model URL forms and security headers only. They do not model cache headers (the function that would, `cacheHeader`, is not called by any check), `_headers` rule matching, Cloudflare's single-page-application fallback, trailing-slash handling, content types for `.xml`, compression, revalidation or provider-injected features (probe: `sitemap.xml` is served as `application/octet-stream`; an unknown URL answers 404 where Cloudflare Pages documents a fallback to `index.html`).
3. **Cloudflare Pages: one documented behaviour needs an owner decision.** With no top-level `404.html`, Pages treats the project as a single-page application and answers unknown paths with `index.html` (**D**). On this site that means a mistyped URL, and `/robots.txt`, `/sitemap.xml` and `/llms.txt` on the fictional demonstration (which publishes none of them) would answer **200 with the home page**. See risk HR-01 and decision D-P3-1.
4. **Vercel: a Vercel deployment is not "folder in, site out".** `cleanUrls` is off by default and `trailingSlash` is undefined by default, so `/menu/` serves the page without redirecting (**D**) and every relative link on it would then resolve under `/menu/`. An adapter must set both explicitly, write `vercel.json` **outside** the delivered folder, and the tooling that checks the folder (`check:hosting`) must become adapter-aware (**G6**).
5. **The delivered folder is not yet a checked artefact.** `check:hosting` inspects an assembled candidate, not the folder that would be uploaded. `HOSTING.md` tells the deployer to copy `_headers` into the output folder, and `check:hosting` rejects a folder that contains `_headers` (probe). The release package is a hand-over package (it contains `serve.py` and `START-HERE.txt`), not a deployment folder. A staged deployment bundle with its own check is needed (**G6**).
6. **Anything that rewrites the HTML breaks the policy.** The CSP allows the inline script and six inline style attributes by SHA-256 hash of the built bytes. A host feature that minifies, injects a script or rewrites addresses changes those bytes. The first live check must compare the served bytes with the built bytes (**L**).

## Decisions requested from the owner (none is taken here)

| # | Decision | Recommendation |
|---|---|---|
| D-P3-1 | Cloudflare Pages unknown-path behaviour: accept the single-page-application fallback for now, or authorise a `404.html` page as a **separate, design-approved** change (it is a new page; this phase does not add one) | decide at Gate 6 or Phase 4; record the live result first (checklist C-04) |
| D-P3-2 | Subpath hosting: support it only for non-indexable builds, or not at all; indexable client builds at a domain or subdomain root | root only for production |
| D-P3-3 | Deployment method for Cloudflare Pages and Vercel: upload of a checked staged bundle, rather than the provider reading this repository (its name ends with a dot) | staged bundle |
| D-P3-4 | HSTS: keep `includeSubDomains` in the header for a client domain, or drop it until the client confirms every subdomain serves HTTPS | drop for clients by default, keep as a setting |
| D-P3-5 | Whether a first non-production preview of the fictional demonstration is wanted, and on which provider, as a separate approval (decision 6 in `GATE-5-PLAN.md`) | Cloudflare first, demo only, `noindex` preserved |
| D-P3-6 | Which person re-reads the cited provider pages and files the dated evidence | a person, before Gate 6 |
