# Continuous integration of the generic fixture

One workflow, `.github/workflows/engineering-fixture.yml` in the framework repository, runs the engineering checks on this fixture project and reports. Since G6-7 it does so by calling the reusable workflow `.github/workflows/engineering-verify.yml`, whose jobs each run one mode of the framework's **composite action** (`.github/actions/engineering`); a client repository runs the same action from its own **caller** workflow, naming the framework by a **full commit SHA** (specification 16, section 10.8). A second job, the caller-layout simulation, builds a client repository's layout on the runner and runs the action's scripts against it. **It is read-only: it deploys nothing, merges nothing, publishes nothing, has no secrets and makes no call to any paid or AI service.** `check:ci` (part of `npm run verify`) fails if the workflow stops being so.

## Jobs
The seven jobs of the reusable workflow are defined once, in `engineering/ci/jobs.json`; the reusable workflow, the client caller template and the scheduled template are each compared with it by `check:ci`. In the Actions UI they appear as `engineering / <job>`.

| Job | Blocks? | Does |
|---|---|---|
| `verify` | yes | checkout (`fetch-depth: 0`), Node 24.21.0, `npm ci --ignore-scripts --engine-strict`, Chromium and ffmpeg, the whole verification (all checks and self-tests; the action's `verify` mode) |
| `caller-layout simulation` | yes | simulates a client repository (the fixture as the client's project, the caller rendered from the template, the framework placed as a downloaded action) and runs the action's guard, materialise and run scripts on it, then the refusals: a branch or tag in place of a SHA, an unknown mode, a damaged caller |
| `portability-smoke` | no (informational) | the fast checks (no browser) on macOS |
| `cross-browser-firefox`, `cross-browser-webkit` | no (informational) | the browser-driven checks in Firefox and WebKit |
| `external-links` | no (informational) | HEAD/GET of every external destination the fixture declares (it declares none) |
| `lighthouse` | no (informational) | the Lighthouse run on every page |
| `supply-chain-report` | no (informational) | registry signatures, advisories, SBOM, outdated packages |

## Runner requirements
* `ubuntu-24.04` (the tested runner image); macOS only for the informational portability job.
* Node 24.21.0, the tested baseline recorded in `engineering/standards/environment.json`; the fixture's `package.json` `engines.node` accepts it.
* Chromium installed with `npx playwright install --with-deps chromium`; Firefox and WebKit only in their informational jobs.
* `ffmpeg` for the flash check on video; the fixture carries no video, the step is kept so a project with video is judged the same way.
* The checkout must use `fetch-depth: 0` because the credential scan reads the history, and `persist-credentials: false`.
* Outbound network for `npm ci` and `npm audit` (CI sets `STS_REQUIRE_AUDIT=1`, so an unreachable registry is a failure, not a skip).
* Permissions: the workflow is read-only, `contents: read` at the top level and nowhere widened.

## Rules the policy enforces
Actions are pinned to full commit SHAs listed in `engineering/standards/dependencies.json` and run on the Node 24 runtime; every job uses the one tested Node version; push is limited to the named development branches (`feature/sts-engineering-framework`, `feature/sts-framework-automation`, `feature/sts-framework-consumption`); no job may run `git push`, publish, deploy or use a cloud or AI tool; every `npm run` a direct job uses must be a script of the fixture's `package.json`; the composite action, its scripts, the reusable workflow and the three templates are judged by `check:ci` too (nothing but the framework's own pinned actions, the fixed script set, the modes of `ci/jobs.json`, no secret, `contents: read`); and a client's caller may not carry a step, a condition, an environment, an extra input or a different mode, may not make the blocking job non-blocking, and may name the framework only by a full commit SHA.
