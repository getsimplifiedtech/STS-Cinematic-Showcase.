# Gate 5 plan: final engineering validation and framework-extraction readiness

**Status: APPROVED by the owner (`APR-JE-027`). Phases 0, 1 and 2 are CLOSED (`APR-JE-030`, `APR-JE-031`; Phase 2 implementation commit `a3a01ea`, run 26). Phase 3 (hosting compatibility assessment, documentation only) is authorised (`APR-JE-031`) and delivered for owner review in `engineering/hosting/`; Phases 4 to 9 are not authorised.** Authorised as planning and assessment only (`APR-JE-026`). No file of the framework repository has been copied or changed; no merge, deployment, design or media change.

**Owner's words (2026-10-10):** "Gate 5 is the final engineering validation and STS framework-extraction readiness gate. Gate 4 and reconciliation are approved and closed. Do not reopen prior gates unless a genuine defect is discovered. This authorization is for Gate 5 planning and assessment only. Do not begin implementation until the plan is reviewed."

Facts used here were read from this repository, from the framework repository (`getsimplifiedtech/sts-web-design-framework`, branch `feature/sts-core-ai-search-readiness`, read only through the GitHub API) and from the CI runs. Where a statement rests on general knowledge of a provider's product, it says so; the sandbox has **no outbound network** (Firefox/WebKit downloads, `cdn.playwright.dev` and the demo's external link all fail from here), so provider documentation could not be fetched.

---

## 1. Summary and recommendation

| Question | Answer |
|---|---|
| Can Gate 5 be completed without a production deployment? | **Yes, for its engineering scope.** Nothing in the eight scope areas needs a production deployment. Three things do need a *live* host and are therefore **not** closable without a deployment: the real behaviour of Cloudflare Pages and Vercel (redirects, headers, content types, crawler access), the live fetch of `robots.txt`/`sitemap.xml`/`llms.txt`, and external-link reachability from a real network at release time. They can be done on a **non-production preview** if the owner approves one separately, or be left as named post-deployment checks. |
| What does Gate 5 closure mean? | **Engineering closure:** the automatable validation passes on all three engines in CI; the human procedures, evidence templates and tooling exist and have been dry-run; every release requirement is listed with its owner; the framework extraction plan is reviewed. It does **not** mean the human evidence exists. Real-device, screen-reader, rights, search-review and release approvals are release requirements and remain open until people provide them. |
| What stays blocked at closure? | All production-release blockers: the release gate stays closed (12 unmet requirements on a clean tree today). |
| What cannot be done by automation, ever? | Physical-device behaviour, screen-reader output, real Safari/iOS behaviour (including H.264 MP4 playback, which no automated browser here can decode), legal rights over generated media, and the human sign-offs. The plan never counts emulation as device evidence. |

**Recommendation:** approve the plan in the phases of section 3, with the decisions of section 10. Run it as engineering closure first (phases 0 to 9, with CI cycles; see runtimes in section 6), collect human evidence in parallel under the protocols, and keep the framework extraction as plan-only until you approve a separate extraction gate.

---

## 2. What exists and what is missing (the starting point)

Verified in Gates 1 to 4 (all on Chromium 141 locally and 156 on CI): 32 checks, 159 Gate 4 negative tests, 0 differences against the frozen v0.8 baseline, search artifacts for indexable client builds, a release gate that blocks, F-G4-01 accepted. Still **not** covered (the list `npm run verify` prints):

1. Firefox and WebKit (not installed here; `engineering/lib/browser.mjs` already accepts `--browser firefox|webkit`, but the checks were written and calibrated on Chromium).
2. Real devices and screen readers (protocol and evidence templates do not exist yet; the `real-device`, `screen-reader` and `browser-matrix` release evidence types are defined and empty).
3. External link reachability (`check:links --online` exists; it cannot run in this sandbox).
4. Portability of the tooling on Windows (GitHub cannot check out a repository whose name ends with a dot).
5. Live verification of Cloudflare Pages and Vercel behaviour (simulated only).
6. Rights over the generated media (unverified; no licence is asserted anywhere).
7. The agent list in the crawler policy (written from the providers' documentation as known, not re-fetched).

---

## 3. Phases, test sequence and acceptance criteria

Order matters: later phases need the outputs of earlier ones. Each phase ends with a short report and a stop for review unless you say otherwise.

### Phase 0: records and baseline snapshot (no code)
Record the authorisation (`APR-JE-026`, done with this plan), snapshot the current state (commit, 32/32, run 11), freeze the list of known findings. **Accept when:** the snapshot is in `QA.md` and `findings.json` is unchanged.

### Phase 1: cross-browser enablement (WP G5-A)
Add Firefox and WebKit jobs to CI (the only place they can run; downloads fail from this sandbox). Make each check engine-aware: run on every engine, skip a step only when an engine genuinely lacks the feature, and say so in the report.

| Focus | Chromium | Firefox | WebKit | How |
|---|---|---|---|---|
| **Visual regression against v0.8** | exists (0 differences) | same harness, baseline and candidate rendered **in the same engine in the same run**; tolerances calibrated per engine from the first runs | same | `check:regression --browser <engine>`. Because both sides use the same engine, font anti-aliasing differences between engines do not matter; only candidate-vs-v0.8 differences do. Expected: 0. |
| **CSP and D-11** | proven (10 loads, 0 violations, six probes blocked) | **the key unknown**: does the engine honour `'unsafe-hashes'` in `style-src-attr` for the six inline custom properties? | same unknown (Safari honours `style-src-attr` and `unsafe-hashes` from 15.4 as far as I know; not verified here) | `check:security --browser`. If an engine ignores the hashes, the photographs show at the default crop instead of the approved focal points. By decision D-11 the CSP is retained and photo cropping is **not** refactored without approval: the result is recorded as a finding and put to you, not fixed. |
| **Navigation and keyboard** | exists | Tab order, focus visibility, skip link, phone menu | same; to my knowledge Safari skips links in the Tab order unless a setting is on, so the expectation is **set per engine** (established on the first run) and the difference documented | `check:keyboard`, `check:order`, `check:portability` per engine |
| **Cinematic media and reduced motion** | exists (WebM VP9 plays; the MP4 H.264 fallback is **untestable** in the Playwright Chromium build) | WebM VP9 expected; H.264 usually absent from automation builds | WebKit builds vary on codecs | `check:media` browser part: video requests under reduced-motion, Save-Data, 2g, phone/tablet/desktop; Pause control; poster and push fallback. **The MP4 path stays unverified by automation on every engine; only a real Safari/iOS device can show it.** |
| **Responsive rendering** | exists | 320 to 2560 px widths, landscape, 200 percent zoom, text spacing, forced colours | same, where the engine supports the emulation | `check:reflow`, `check:phone`, `check:forced-colors`. `forcedColors` emulation support differs by engine and is established on the first run. |
| Accessibility tree | `ariaSnapshot` | `ariaSnapshot` exists in Playwright for all engines; text differs | same | `check:a11y-tree`; assertions are on roles and names, not on engine text |
| Chromium-only by nature | `check:budgets` runtime (uses CDP throttling) | not run | not run | stays Chromium-only; documented |

**Browser-specific differences** are collected in one table (`BROWSER-MATRIX.md`, new) as: engine, check, observation, cause, effect on visitors, proposed correction. **Corrections:** automation never edits the design. A difference that needs a visible change becomes a *known finding* with a proposal and waits for your approval; a defect in the build or tooling is fixed under the existing gates' rules.
**Accept when:** all selected checks pass or are reconciled as documented findings on Chromium, Firefox and WebKit in CI (informational for the first runs, required afterwards if you approve); the matrix table is complete; no unexplained difference remains.

### Phase 2: real-device and accessibility procedures (WP G5-B)
Documents and tooling only; execution is human. See section 4.
**Accept when:** the protocol, the per-page checklists, the evidence template and a scaffolding command exist; a dry run of the *paperwork* (not a device) shows the release gate accepts a well-formed record and rejects a malformed or mismatched one.

### Phase 3: hosting compatibility assessment (WP G5-C, document only)
Section 5. **Accept when:** the assessment table is complete with each row marked *verified by simulation / needs a live host / needs an adapter*, and the Vercel adapter requirements are written. No adapter, no deployment.

### Phase 4: SEO and AI search readiness, complete standard (WP G5-D)
Re-audit against `architecture/11-core-search-ai-discovery-readiness-v1.md` as it stands when Gate 5 starts (the branch is a proposal and may change), item by item, and add what is missing:
- re-verify the crawler agent list against the providers' current documentation (a human step with a dated evidence file; the sandbox cannot do it);
- decide `og:image` (needs authorised media; today none, so none is generated);
- evaluate WebSite/Organization/breadcrumb JSON-LD where accurate (today Restaurant on Home only);
- add the demo's defence in depth: an `X-Robots-Tag: noindex` response header in the generated host files for the demonstration (today `noindex` is a meta tag only, which is lost if a host rewrites HTML);
- re-test production-domain safeguards, crawler-policy configuration, canonicals, metadata, `llms.txt` and the fictional demo staying `noindex` with none of the files.
**Accept when:** every standard item is *automated*, *human-reviewed with a record*, or *explicitly out of scope with a reason*; the demo is unchanged and still `noindex`.

### Phase 5: external links and media rights (WP G5-E)
Section 7. **Accept when:** the external destination list is complete and each is verified from a networked runner or marked unverified; the rights inventory is complete and **no sentence anywhere claims a right that was not established**.

### Phase 6: dependencies and security (WP G5-F)
Section 8. **Accept when:** each review item has a recorded outcome and every dependency change (if any) is approved first.

### Phase 7: release readiness (WP G5-G)
Section 9. **Accept when:** the manifest is audited, a full dry-run of the release pipeline on a *synthetic client configuration* (temporary folder, never the demo, nothing deployed) produces and validates package, manifest and checksums, the gate still refuses every unmet requirement, and the list of remaining manual approvals is current.

### Phase 8: framework extraction assessment (WP G5-H, document only)
Section 11, in parallel with phases 1 to 7 (it needs no CI). **Accept when:** inventory, classification, dependency/assumption list, required changes and the migration plan are reviewed by you.

### Phase 9: closure report
One report: results, the browser matrix, findings, blockers, evidence still owed by people, and the recommendation. Gate 5 is not closed by me; you close it.

**Test sequence in CI:** (1) the existing Chromium `verify` job (unchanged, about 13 minutes); (2) Firefox job and (3) WebKit job in parallel (informational first); (4) an external-links job with network (about one to two minutes); (5) macOS fast job as today. A change to the engineering never merges without all of them green.

---

## 4. Real-device and accessibility validation

**Evidence classes (the rule that prevents false claims).** Every record states its class, and each class permits only its own claim:

| Class | What it is | May be claimed as |
|---|---|---|
| E1 | Automated, emulated (Playwright engines, device descriptors, viewport emulation, forced-colours emulation) | "behaves as expected in this engine under emulation" |
| E2 | Real engine, desktop, by a person (Safari on a Mac, Firefox, Chrome) | "verified in this browser by hand" |
| E3 | **Physical device**, by a person, with model, OS and browser versions | "verified on this device" |

Emulation is **never** recorded as E3. The release gate's `real-device` evidence type accepts only E3 records.

**Procedures (each a numbered script a tester follows and signs; defects feed the findings register with severity and page):**

| Target | Minimum | What is exercised | Notes |
|---|---|---|---|
| iPhone Safari | one iPhone (model, iOS version recorded) | all five pages portrait and landscape; phone menu open/close and focus; hero (poster and push vs clip: phones get the poster by design); Pause; tap targets and the phone links (`tel:`); pinch zoom and Dynamic Type/text size; Low Power Mode, Reduce Motion, Low Data Mode; address-bar resize; back/forward | settles the MP4 H.264 fallback question only where the clip is shown (widths of 960 px and above: iPad or desktop Safari); scroll smoothness is a judgement the tester records |
| Android Chrome | one Android phone (model, Android and Chrome versions) | same; font scale; Data Saver; TalkBack on | |
| Tablet / wide | one tablet, any OS | the 960 px-and-above hero clip path, rotation | |
| Keyboard-only | desktop Chrome, Firefox, Safari | Tab through every page, skip link, menu, Escape, visible focus, no trap; compared with the automated walk | E2 |
| Screen readers | NVDA with Firefox and Chrome (Windows), VoiceOver with Safari (macOS), VoiceOver (iOS), TalkBack (Android) | landmarks, headings, link/button names, images' alt text, the hero's Pause, the phone menu, the Visit page address/hours, form-less ordering link-out | each combination recorded separately (E2/E3) |
| Zoom and viewport | desktop 200 and 400 percent, text-only zoom; mobile pinch zoom | no horizontal scroll at 320 CSS px, nothing clipped; the page does not block user zoom (viewport meta); a new **automated** static check is added so the viewport tag can never disable zoom | automated part E1, human part E2/E3 |

**Tooling to build (Phase 2):** `docs/…DEVICE_TEST_PROTOCOL.md` and per-target checklists; `npm run evidence:new -- <type>` scaffolds a JSON record in `engineering/release/evidence/` with every outcome field **empty** (it never fills a result); the gate already validates records and rejects unreadable, mismatched or non-success ones.

**Who and when:** people with the devices. Estimated tester time (an estimate, not a measurement): iPhone 60 to 90 minutes, Android 60 to 90, each screen-reader combination 45 to 60, keyboard-only 30, zoom 30; about six to ten hours in total across several people. A cloud device farm would give emulated-looking but real devices at a cost; **it is paid and is not in this plan unless you approve it.**

---

## 5. Hosting compatibility assessment

Marked: **S** = verified by local simulation (Gate 4), **L** = needs a live host, **A** = needs an adapter (not built). Statements about Vercel are from general knowledge and must be checked against its current documentation before any adapter is written; Cloudflare Pages behaviour on `.html` redirects and Vercel's `cleanUrls` default are the owner-confirmed facts already recorded.

| Area | Cloudflare Pages | Vercel | Status |
|---|---|---|---|
| URL routing and redirects | `.html` URLs redirect to extension-less ones; `/index.html` to `/` | extension-less only with `cleanUrls: true` (off by default); otherwise `.html` is served as named | S for both; **L** for exact redirect forms (trailing slash, `/index`, query strings, case) |
| Canonical URLs | `seo.urlStyle: "clean"` enforced by the build for `cloudflare-pages` | `clean` requires `cleanUrls: true`, `extension` requires it off; `urlStyle` and the host setting must agree | S; **A** for Vercel (the adapter must write the setting that matches `urlStyle`) |
| Security headers and CSP | `_headers` (generated; within the 100-rule and 2000-character limits) | `vercel.json` `headers` entries (a new rendering from the same `security.json`) | Cloudflare **S** (generated and proven in a local server); Vercel **A**; both **L** (do the real edge and CDN deliver them unchanged) |
| Root and subpath hosting | a Pages project serves at a domain root; a subpath needs a reverse proxy; `robots.txt`/`sitemap.xml`/`llms.txt` are only read at the domain root | same | S for the folder under a prefix (Gate 3); the base URL with a path draws a warning; **L** |
| Static asset delivery | content types for `.webp .webm .mp4 .woff2 .txt .xml`, Range requests for video, cache rules (HTML/CSS/JS revalidate; media and fonts a week) | same questions | **L** (the simulation sets types and Range itself) |
| Search artifact accessibility | served from the root; not behind an auth or preview protection | preview deployments are protected by default (general knowledge) and carry `noindex`-style behaviour; production must serve the files openly | **L**; plus the demo header `X-Robots-Tag: noindex` (Phase 4) |
| Preview vs production | `*.pages.dev` previews | `*.vercel.app` previews | the release gate already refuses these hosts for client-production |

**Vercel adapter requirements (to be written into the framework spec, not implemented):** a host profile `vercel` with `cleanUrls` derived from `urlStyle`; a header rendering from `security.json` into the `vercel.json` `headers` array (path patterns, not `_headers` splats); `trailingSlash` set explicitly; output directory and "no build" settings; an adapter output kept **outside** the delivered folder and copied only at deploy time; `check:hosting` made adapter-aware (accept exactly the selected adapter's file; keep forbidding any other vendor file; keep the rule that the site itself needs no vendor); a simulation profile (exists: `vercel-clean`, `vercel-default`); a live preview checklist (redirect forms, header delivery, content types, noindex on previews). Jade & Ember itself stays Cloudflare-specific for deployment and independent of Vercel.

**Live verification** needs a deployed non-production preview: a separate approval, `noindex` preserved, the fictional demo only.

---

## 6. Estimated verification runtime

Based on measured Chromium times (Gate 4: full `verify` 16.5 minutes locally, 13 minutes on CI). The cross-browser figures are **estimates** to be replaced by the first runs.

| Item | Where | Estimate |
|---|---|---|
| Existing Chromium `verify` | CI | about 13 min (unchanged) |
| Browser install for Firefox/WebKit | CI | 1 to 2 min each |
| Firefox: keyboard, reflow, forced-colours, a11y-tree, order, phone, portability, privacy, security, seo (browser), media, assets, regression | CI | Chromium needed about 8 min for these; allow 10 to 16 min on Firefox, in parallel with WebKit |
| WebKit: the same set | CI | 10 to 18 min |
| External-links job | CI, with network | 1 to 2 min (the demo has one external destination, repeated five times) |
| Wall-clock for a full push | CI | about 20 min (jobs run in parallel) |
| First-run calibration of the engine jobs | CI | expect three to six cycles of about 20 minutes: about two hours of waiting |
| Human procedures | people | about 6 to 10 hours in total (section 4) |
| Release dry-run on a synthetic client | local/CI | under 5 min |

---

## 7. External links and media rights

**External destinations.** The demonstration has exactly one: `https://getsimplifiedtech.com/` (the credit link, five occurrences). A client build adds the ordering URL, map URL and social links from its configuration. **Method:** a networked CI job runs `check:links --online`: HEAD then GET fallback, redirects followed and recorded, TLS verified, timeouts and one retry; a 403/429 from a bot-blocking site is classified *unverified*, never *passed*. The result is a dated record. **Owner decision:** whether "external links verified" becomes a new release requirement (a change to the release policy; not assumed).

**Media rights review (inventory only; nothing asserted).**

| Asset | Source (from `media/PROVENANCE.md`) | What must be established before any client use |
|---|---|---|
| six WebP images | Z-Image-Turbo through the Hugging Face Space `mcp-tools/Z-Image-Turbo`, free tier, via the connected account | the Space's and model's terms for commercial use and output ownership; whether the account tier matters; any attribution or AI-disclosure duty |
| hero loop (WebM, MP4) | Higgsfield, Kling 3.0 Omni, one paid generation, 5 credits, job id recorded | the platform's and model's terms, plan-level commercial rights, ownership of outputs |
| four font files (three families) | Young Serif, Karla (two weights), Noto Serif SC (a subset): SIL Open Font License 1.1, texts in `fonts/LICENSES.txt` | OFL is shipped with the fonts; also check each family's reserved font names against the subset and the file names |

**Procedure:** the owner (not the tooling) captures dated copies or URLs and hashes of the terms into an evidence folder; a person then records a `rights-verification` row naming who verified, the sources reviewed and the date. Until then the policy stands (`docs/JADE_AND_EMBER_MEDIA_RIGHTS_POLICY.md`): rights unverified, none asserted, replace the media for any real client. The structured data may never carry a `license` key and no page may say the media is licensed, owned, free or cleared (`check:seo` fails on it). I cannot establish legal rights and will not guess them.

---

## 8. Dependencies and security

| Review | Facts today | Plan |
|---|---|---|
| Development advisories | 11 high in the dev-only `@lhci/cli` tree; none reachable; options A to E evaluated (`DEPENDENCY-ADVISORIES.md`) | present the options again with the owner's priorities; apply nothing without approval |
| Licences | 349 locked packages: MIT 264, ISC 36, Apache-2.0 28, BSD 16, 0BSD 2, **MPL-2.0 2** (`axe-core`, `@axe-core/playwright`, dev-only), **1 unrecorded** (`parse-cache-control`, dev-only) | none is shipped to visitors. MPL-2.0 obligations arise only when MPL-covered source is distributed or modified: confirm neither happens; verify the unrecorded licence from the package source and record it; generate a dated third-party-notices list for the shipped fonts (OFL) and state that no npm package is delivered |
| GitHub Actions warnings | `actions/checkout` v4.2.2 and `actions/setup-node` v4.4.0 target Node 20 and are forced to Node 24 | review the newer releases and their pinned SHAs (the API is reachable from here), change only with approval; the `check:ci` rules (pinned SHAs, read-only, no secrets) stay |
| Secrets and supply chain | no secrets in tree or history (`check:secrets`); `npm ci --ignore-scripts`; exact pins; sha512 lockfile; actions pinned; no `pull_request_target` | add: `npm audit signatures` as a report, an SBOM (CycloneDX) as release evidence, a documented policy for Dependabot-style update PRs (they would create PRs; nothing merges) |
| Outstanding security findings | none open at Major; D-11 retained; F-G3-01 accepted | confirm none new after the cross-browser CSP results |

"Avoid unnecessary dependency changes": this phase proposes **no** dependency change by default; each addition (SBOM tool) is justified separately.

---

## 9. Release readiness

| Verify | Method |
|---|---|
| Manifest completeness | audit the manifest against a checklist of the fields the gate and a reviewer need (version, commit, tree, baseline, framework reference, configuration hashes, asset integrity, security header digest, QA report binding, approvals, evidence, findings, dependencies, search digest, gate result); add what is missing |
| Approvals and evidence | one table of every required item: release approval, rights verification, search review, deployment approval, real-device, screen-reader, browser-matrix, ci-run: who, what, status, where recorded |
| Automated blocking | already proven by 40 single-defect cases and the policy tests; re-run after Phase 1 changes; add a case for a malformed evidence class (E1/E2 offered as E3) |
| Source integrity | commit and tree bound to the verification report; baseline branch hash; framework commit; clean-tree requirement |
| Production safeguards | demo flag and `noindex`; reserved/staging host refusal; `seo.host` and crawler policy decided; stable version rule |
| Dry run | build a synthetic client configuration in a temporary folder, run the real gate with synthetic approvals, `prepare` the package, validate manifest and checksums, delete the folder. The demo is never used for this and nothing is published |
| Manual approvals remaining | release approval, rights verification, search review, deployment approval, the three human evidence types (E3 devices, screen readers, browser matrix E2), a stable version, the advisory decision |

The gate stays closed until every real requirement is met. Gate 5 closure does not change that.

---

## 10. Blockers and owner decisions

**Blockers that stay (none removed by Gate 5):** no release approval, no rights verification, no search review; no real-device, screen-reader or browser-matrix evidence; version 0.9.0-dev; crawler agent names unverified; hosts simulated only; external links unchecked; advisories accepted.

**Decisions I need, with my recommendation:**

| # | Decision | Recommendation |
|---|---|---|
| 1 | Approve CI changes: Firefox and WebKit jobs, an external-links job (informational first, then required) | yes |
| 2 | Browser-specific visible differences: record as known findings with proposals; no visual change without your approval | yes (the standing rule) |
| 3 | Testers and devices: who, which iPhone/Android/tablet, which screen-reader combinations, by when | you name them; I prepare the scripts |
| 4 | Paid cloud device farm | no |
| 5 | Add "external links verified" and "browser matrix" as formal release requirements | yes for both |
| 6 | A non-production **preview** deployment (Cloudflare first) for live hosting verification | decide later, separately; not needed for Gate 5 closure |
| 7 | `og:image`: authorise a licensed image, or leave none | leave none until media rights are verified |
| 8 | Who re-verifies the crawler agent list, and from which sources | a person, with a dated evidence file |
| 9 | Who gathers the generator/platform terms for the rights review, and whether legal review is wanted | you; I will not assert rights |
| 10 | Dependency advisory option (A to E) | D or C before any client release |
| 11 | Move the pinned actions off Node 20 | yes, after reviewing the new SHAs |
| 12 | `X-Robots-Tag: noindex` in the demo's host files | yes |
| 13 | Gate 5 closure definition: engineering closure only (recommended) or also the human evidence | engineering closure |
| 14 | Framework extraction: layout, naming, how projects consume the framework, and whether an in-repository de-coupling refactor of Jade & Ember (no behaviour change, parity-tested) is a Gate 5 or a Gate 6 package | Gate 6, after you approve section 11 |

---

## 11. STS framework extraction: inventory and migration plan

**Size today (in `jade-and-ember/engineering/` and `src/`):** 32 check files (about 4,000 lines, including the self-tests), 21 library modules (about 1,500 lines), 5 tools, 4 JSON schemas (1,400 lines), the release policy and manifest schema, 14 JSON policy and record files, 6 documents (7 with this plan), plus `src/` (332 lines) and the legacy `tests/` suites.

**What the target repository has today** (read only): `architecture/` specifications 01 to 15 (including the proposed `11-core-search-ai-discovery-readiness` and `09-qa-model`), `skills/`, `reviews/`, one template `templates/sts-cinematic-template-v02/` (with its own `build.mjs`, `config.json`, `tests/`, `lighthouserc.json`) and `.github/workflows/template-quality.yml`. It has **no engineering framework code yet**; Jade & Ember's engineering is a superset of the template's quality checks.

### 11.1 Classification

| Class | Components |
|---|---|
| **Universal STS Base Engineering Framework** | harness core (`lib/git`, `schema`, `findings` register, `browser`, `runtime`, `pixels`, `zip`, `hashed`, `html`, `flash`, `media`); `verify.mjs` runner and report; checks: `schema`, `determinism`, `delivery`, `contracts`, `media`, `tokens`, `secrets`, `deps`, `ci`, `privacy`, `security` (policy engine), `assets`, `html`, `links`, `seo` (canonical, sitemap, robots, `llms.txt`, crawler policy, URL style, metadata, facts), `release` (policy, manifest, approvals/evidence, search digest), `portability`, `keyboard`, `reflow`, `forced-colors`, `a11y-tree`, `order`, `budgets`, `regression` (baseline-immutability mechanism); JSON schemas for config; `security.json`, `release/policy.json`, `htmlvalidate.json` as defaults |
| **Industry-specific adapter (restaurant)** | `jsonLdFor`/`validateRestaurant`/`hoursSpecs` (Restaurant schema), the menu page contract, `client.schema.json` business block, `BUSINESS` fixtures, the demo-to-client text `FIXES` in `client-fixture.mjs`; `check:phone` is generic in principle ("key contact links") but its selectors and expectations are restaurant-shaped |
| **Hosting-specific adapter** | header renderings (`_headers`, nginx, Apache) in `lib/security.mjs`; host profiles in `lib/server.mjs`; `check:hosting` limits (Cloudflare Pages numbers) and its vendor-file rule; `tools/host-files.mjs`; the `seo.host`/`seo.urlStyle` profile table; future Vercel adapter |
| **Jade & Ember demonstration code** | `config/*.json`, `src/pages/*`, most of `src/components/*`, `styles.css`, scripts, fonts, media; `tokens.json` snapshot; `baseline.json`, `immutability-allowlist.json`, `assets.manifest.json`; `budgets.json` measured values; `findings.json` entries; `lib/scenarios.mjs` (behaviour scenarios keyed to this site); the mutations in `selftest.mjs`; `VERSION.json`; the `APR-JE-*` approvals document and IDs; `authority.json`; media provenance and rights policy |
| **Development-only test tooling** | `selftest*.mjs` (meta-tests), `latency-probe.mjs`, `lib/client-fixture.mjs`, legacy `tests/*.mjs` (axe, contrast, extracted-folder), Lighthouse CI config, `tools/video-qa*.py`, `serve.py` |

### 11.2 Dependencies and assumptions to remove

- **Runtime/tool dependencies:** Node 20 or newer; Playwright 1.64.0 (exact) with Chromium (Firefox/WebKit planned); `ajv`, `yaml`, `html-validate`, `@axe-core/playwright` (MPL-2.0, dev-only), `@lhci/cli` (dev-only, advisories); `git` (history and baseline export); `ffmpeg` (flash proxy); Python 3 (`serve.py`, video QA).
- **Hard-coded to this project:** the project folder name and repository layout (`<repo>/jade-and-ember/engineering`, `docs/JADE_AND_EMBER_*.md`); `APR-JE` approval ids and document path; the page list and `SHARED` file list (`styles.css`, three scripts); selectors (`.nav-toggle`, `.phone`, `.hero-video`, `.skip`/`.jump`), Pause control wording, footer stamp text "Concept v0.8" (decision D-1), brand tokens; the baseline commit and branch; the framework reference commit; Chromium build `141` and the environment pinning; Cloudflare Pages numbers.
- **Process assumptions:** a frozen baseline exists; approvals live in a Markdown table; owner-approved findings in a JSON register; one project per repository.

### 11.3 Changes needed to make it reusable (no code written now)

1. A **project manifest** (`sts.engineering.json`): project root, page registry source, shared files, baseline reference, docs and approvals paths and id prefix, selector map, hosting profile, industry adapter name.
2. Split into **core**, **adapters/industry/***, **adapters/hosting/***, **fixtures/** and **tooling/**, with a stable interface for adapters (check registry, fixture builder, header renderer, host profile).
3. Replace project literals by manifest values; keep defaults in the core.
4. Make the self-tests use a **generic fixture site** (not Jade & Ember) so the core proves itself; keep Jade as the reference consumer with its own golden outputs.
5. Parameterise `check:regression` scenarios and `check:keyboard`/`check:phone` selectors.
6. Version the framework and record its commit in each project's release manifest (already supported through `authority.json`'s framework reference).
7. Document the adapter contract and the check catalogue (the ledger's requirement IDs map to checks).

### 11.4 Migration plan (target `getsimplifiedtech/sts-web-design-framework`; **nothing copied or changed now**)

| Step | Where | What | Gate |
|---|---|---|---|
| M0 | decisions | location (a new `engineering/` top-level vs `core/engineering`), naming, numbering (a new `architecture/16-…` specification), how projects consume it (pinned git commit, not a published package), relation to `09-qa-model`, `11-core-search-…` and the cinematic template | owner |
| M1 | framework repo (docs only) | specification of the engineering framework and adapter contract, mapped to the ledger | approval |
| M2 | **this repository** | the de-coupling refactor (project manifest, core/adapter split, generic fixtures) with **parity proof**: 32/32 and byte-identical demo output and identical reports before and after | approval; separate gate |
| M3 | framework repo (a branch, never `main`) | add the de-coupled core and adapters as files; CI of the framework runs the generic fixtures | approval |
| M4 | this repository | Jade & Ember consumes the framework at a pinned commit; its manifest records it | approval |
| M5 | proof of reuse | a second, different project (another industry) runs the core with its own adapter | approval; needs a project |

Risks: regression during M2 (mitigated by parity proof); the framework standard is still a proposal; the template and the engineering overlap and need one owner; effort is large (about 8,000 lines of engineering plus its documentation).

---

## 12. Tools and dependencies Gate 5 would need

- Playwright's Firefox and WebKit builds (CI only; no change to the lockfile because Playwright is already pinned; the browsers are downloaded at run time).
- A networked CI job for external links (no new dependency; Node's `fetch`).
- Optional SBOM generator (CycloneDX, a dev-only tool) if you approve it.
- No new runtime dependency, no change to the delivered site, no new media.

## 13. Out of scope for Gate 5

Redesign or any change to the frozen v0.8 baseline; new media or paid generation; a Vercel adapter; any deployment (preview or production); any merge; any change to the framework repository; physical devices owned by me (I have none): all device and screen-reader evidence comes from people.
