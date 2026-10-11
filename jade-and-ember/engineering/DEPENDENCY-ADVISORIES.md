# Development-dependency advisories: evaluation (Gate 4, scope item 7)

> **G6-1 update (2026-10-11, `APR-JE-038`).** This evaluation is historical. G6-1 removed `@lhci/cli` and installed `lighthouse` 13.5.0 directly: `npm audit` now reports **0 vulnerabilities** in the whole installed tree (128 packages, down from 349) and `dependencies.json` accepts none. See `G6-1-REPORT.md`. The text below records what was true on 2026-10-10.

Evaluated 2026-10-10 against `package-lock.json` (npm audit, registry data of that day). **No change to the dependency set has been made.** Every option below was tried in a scratch copy outside the repository, and the options that change the lockfile need the owner's approval.

## Summary

| | |
|---|---|
| Advisories reported | 17 packages: **11 high**, 4 moderate, 2 low, 0 critical |
| Where | One development-only tree: `@lhci/cli@0.15.1` (Lighthouse CI), a direct devDependency used only by `npm run test:lighthouse` |
| Delivered to visitors | **Nothing.** The delivered site has no dependencies of any kind (`check:deps`, `check:delivery`) |
| Used by `npm run verify`, `verify:fast` or the GitHub Actions workflow | **No.** Neither runs Lighthouse CI. `npm ci --ignore-scripts` does install the package files in CI (no install scripts run) |
| Fix available from upstream | **No usable one.** `@lhci/cli@0.15.1` is the latest release. `npm audit` offers `@lhci/cli@0.1.0`, a 2018 downgrade, which is not a fix |
| Current handling | Listed as accepted advisories in `engineering/dependencies.json`; `check:deps` reports them on every run, and fails on a critical advisory anywhere, any advisory in a production dependency, and any high advisory in a package not on the accepted list |

Only four of the 17 entries are real advisories. The others are npm propagating "depends on a vulnerable range" up the chain.

## The advisories and the actual exposure

| Package (installed) | Advisory | Severity | What it needs in order to matter | Exposure in this project |
|---|---|---|---|---|
| `extract-zip` 2.0.1 | GHSA-jmr9-qjv8-65gv and GHSA-7pqw-9j4j-h8q3: symlink entries in a zip archive write files outside the target folder | high (CVSS 8.1) | Unzipping an archive from an untrusted source | Called only by `@puppeteer/browsers` when it downloads a browser (`fileUtil.js`, dynamic import). Nothing here downloads a browser: Chromium comes from the environment (`CHROMIUM_PATH`, `/opt/pw-browsers`). No untrusted archive is processed. **Not reachable in normal use** |
| `basic-ftp` 5.3.1 | GHSA-c475-qrg2-pj4r: quadratic-time CPU use in the Unix directory-listing parser of `Client.list()` | high (denial of service only) | Connecting to an FTP server that returns a hostile listing | Reached through `proxy-agent` → `pac-proxy-agent` → `get-uri`, which fetch a proxy auto-config file by URL (including `ftp:`). Nothing in the project configures a PAC proxy, and nothing contacts an FTP server. Worst case is a hung local process. **Not reachable** |
| `tmp` 0.1.0 | GHSA-ph9p-34f9-6g65: path traversal through an unsanitised prefix or postfix (high); GHSA-52f5-9888-hmc6: write through a symlinked `dir` (low) | high / low | An attacker controlling the prefix, postfix or directory arguments passed to `tmp` | Used by `external-editor` (inside `inquirer`) to open an editor for interactive prompts. `lhci autorun` is non-interactive and passes fixed arguments. **Not reachable** |
| `uuid` 8.3.2 | GHSA-w5hq-g745-h8pq: missing buffer bounds check in v3, v5 and v6 when a caller supplies an output buffer | moderate | Calling those generators with an attacker-chosen buffer or offset | `@lhci/cli` generates random run identifiers (v4). **Not reachable** |
| `sprintf-js` 1.0.3 (via `argparse` → `js-yaml`) | GHSA-hp3w-g68c-fv3c: denial of service through unbounded precision specifiers | moderate | A format string chosen by an attacker | `js-yaml` 3.x loads the project's own `lighthouserc.json`. **Not reachable** |
| `@lhci/cli`, `@lhci/utils`, `lighthouse`, `puppeteer-core`, `@puppeteer/browsers`, `get-uri`, `pac-proxy-agent`, `proxy-agent`, `inquirer`, `external-editor`, `argparse`, `js-yaml` | none of their own | high, moderate or low | Inherit one of the advisories above | Same exposure as the advisory they inherit |

Conditions under which the exposure would change: running Lighthouse CI on input that is not this project's own static pages, adding a proxy auto-config file, letting Lighthouse download a browser archive from somewhere other than the official source, or running the tool on a machine that holds credentials the build does not need. None of these happens today. The workflow holds no secrets and is read-only.

**Judgement:** a low practical risk, but the advisories are real and cannot be fixed by upgrading, so they stay visible and the owner decides how to remove them.

## Remediation options (all tested in a scratch copy; none applied)

| Option | What it does | Result measured in scratch | Cost and risk | Needs approval |
|---|---|---|---|---|
| **A. Accept and monitor** (current) | Keep the accepted-advisory entry; `check:deps` reports it each run and fails on anything new | 11 high remain, reported every run | None. The tree is never shipped and is outside the gates | No (already in place) |
| **B. Overrides for the fixable packages** | `"overrides": { "basic-ftp": "6.2.3", "tmp": "0.2.7", "uuid": "11.1.1" }` in `package.json` | High 11 → **6**, moderate 4 → 3, low 2 → **0**; 17 → 9 advisories. `lhci --version` still starts. `extract-zip` has **no patched release** (latest 2.0.1 is inside the affected range), so its chain (`@puppeteer/browsers`, `puppeteer-core`, `lighthouse`, `@lhci/utils`, `@lhci/cli`) stays high | Forces newer majors into packages that did not ask for them (`uuid` 8 → 11). **A full Lighthouse run under the overrides was not performed**, so compatibility is unproven. Adds an override to maintain | Yes (changes the dependency set and lockfile) |
| **C. Remove `@lhci/cli`** | Drop the devDependency and `test:lighthouse` | **0 vulnerabilities**; the tree shrinks from 349 locked packages to 19 (re-resolved in scratch) | Loses the Lighthouse performance, accessibility, best-practice and SEO scores. `check:budgets` (Core Web Vitals under throttling, page weight), the Playwright accessibility checks and `check:seo` cover most of the same ground, but not Lighthouse's score model. Changes `QA.md` and the Gate 1 to 3 documents that mention it | Yes |
| **D. Isolate it** | Move Lighthouse CI to its own folder (for example `tools/lighthouse/`) with its own `package.json` and lockfile, not installed by `npm ci` in the main project or in CI | Main tree audit becomes 0 vulnerabilities; the advisories move to an opt-in tool that is installed only when someone runs it | A second lockfile to keep current; a documented two-step command. Same advisories if run | Yes |
| **E. Wait for upstream** | Re-run `npm audit` at each release gate; adopt `@lhci/cli` once it depends on a fixed `extract-zip` or on a newer `puppeteer-core` | No change today | Open-ended | No |

**Recommendation:** keep Option A for this gate and take **D** (or **C**, if the owner does not use Lighthouse scores) before any client-production release, so that the release tree has no high advisory at all. Option B is not recommended on its own: it leaves six high entries and risks an untested incompatibility.

## Release effect

`engineering/release/policy.json` does not treat an accepted development-only advisory as a release blocker, because nothing in it is delivered. The release manifest records the lockfile hash and the number of accepted advisory packages (`dependencies.acceptedAdvisoryPackages`, 11 today), so a reviewer sees them next to the commit. Any advisory in a **production** dependency would fail `check:deps` outright; there are none, because the site has no production dependencies.

## Re-checking

```
npm audit --json            # current registry data
npm run check:deps          # compares the result with engineering/dependencies.json
```

Registry data changes daily: the counts above are the state on the evaluation date.
