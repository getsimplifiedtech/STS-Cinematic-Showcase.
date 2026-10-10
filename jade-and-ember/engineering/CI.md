# Continuous integration (v0.9)

One workflow, `.github/workflows/jade-and-ember-verify.yml`, approved for the v0.9 development branch (decision D-4, `APR-JE-019`; scope `APR-JE-022`). It runs the engineering checks and reports. **It is read-only: it deploys nothing, merges nothing, publishes nothing, has no secrets and makes no call to any paid or AI service.** `check:ci` (part of `npm run verify`) fails if the workflow stops being so.

## What it does
| Job | Runs on | Does | Blocks? |
|---|---|---|---|
| `verify` | `ubuntu-24.04` | checkout (full history), Node 22.22.0, `npm ci --ignore-scripts`, `npx playwright install --with-deps chromium`, ffmpeg, `npm run verify` | yes |
| `portability-smoke` | `windows-latest`, `macos-latest` | `npm ci --ignore-scripts`, `npm run verify:fast` (no browser) | no (`continue-on-error`): it exists to show tooling portability problems |

Triggers: a push to `feature/jade-and-ember-v0.9`, any pull request, and manual dispatch. A newer run on the same ref cancels the older one.

## Safety properties (enforced by `check:ci`)
- `permissions: contents: read` at the top level, and no job widens it; the checkout does not persist credentials.
- Every `uses:` is pinned to a full commit SHA (version in the comment): `actions/checkout` v4.2.2 and `actions/setup-node` v4.4.0 only.
- No `pull_request_target`, no `workflow_run`, no `secrets` context, no expression inside a `run:` script (no script injection), no `git push`, no `gh` CLI, no publish, deploy, Pages, cloud or container-registry step, no AI or LLM service or key.
- Every job has a timeout; the blocking job has no `continue-on-error`; dependencies are installed with `npm ci` from the lockfile, with `--ignore-scripts`.
- `STS_REQUIRE_AUDIT=1` makes `check:deps` fail if `npm audit` cannot reach the registry, so the audit cannot silently be skipped in CI.

## Runner requirements (to reproduce a CI run)
- Git history for all branches (`fetch-depth: 0`): `check:baseline` reads the frozen v0.8 baseline branch `baseline/jade-and-ember-v0.8` and the regression harness exports it. The workflow never writes to it.
- Node 22.22.0 (the project needs Node 20 or newer); the exact Playwright (1.64.0) and every other tool come from `package-lock.json`.
- Chromium for Playwright. The reference environment recorded in `environment.json` is Chromium 141.0.7390.37; Playwright 1.64.0's own download is Chromium 156. Baseline and candidate are always rendered by the same browser in the same run, so the comparison holds on either; the pinned version is reported as a note (`--strict-env` would fail on a different build, and CI does not use it).
- ffmpeg on the PATH for the flash proxy (without it the check skips that step and says so).
- Network access to the npm registry for `npm ci` and `npm audit`.
- Python 3 is not needed by `npm run verify`.

## Status and limits
- The workflow was validated here by `check:ci` (structure and safety) and by running its steps locally from a clean clone. **It had not run on GitHub when this was written**: the first run happens on the first push of the branch after the workflow is added, and its result is not known here. A CI environment can differ from the development one (browser build, fonts, CPU speed): the budget limits have headroom for that, but a first-run failure there is possible.
- The Windows and macOS job is untested and informational. The engineering scripts avoid symbolic links, shell-specific code and absolute paths, but they have only been run on Linux.
- Firefox and WebKit are not run (not installed in the development environment, and the checks are Chromium-based).
