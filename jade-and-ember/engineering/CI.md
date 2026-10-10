# Continuous integration (v0.9)

One workflow, `.github/workflows/jade-and-ember-verify.yml`, approved for the v0.9 development branch (decision D-4, `APR-JE-019`; scope `APR-JE-022`). It runs the engineering checks and reports. **It is read-only: it deploys nothing, merges nothing, publishes nothing, has no secrets and makes no call to any paid or AI service.** `check:ci` (part of `npm run verify`) fails if the workflow stops being so.

## What it does
| Job | Runs on | Does | Blocks? |
|---|---|---|---|
| `verify` | `ubuntu-24.04` | checkout (full history), Node 22.22.0, `npm ci --ignore-scripts`, `npx playwright install --with-deps chromium`, ffmpeg, `npm run verify`, then (always) the latency probe, which never fails the build | yes |
| `portability-smoke` | `macos-latest` | `npm ci --ignore-scripts`, `npm run verify:fast` (no browser) | no (`continue-on-error`): it exists to show tooling portability problems. **Windows is not run**: the repository name ends with a dot and Windows cannot create that folder, so the checkout step fails before any project code runs |

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

## Remote results (actual GitHub Actions runs)
| Run | Commit | Result | Notes |
|---|---|---|---|
| 1 (`38028793711`) | `3c3c79a` (Gate 3) | **failure** | `verify`: 24 of 25 checks passed in about 14 minutes; `check:budgets` failed on interaction latency (see below). Windows: checkout failed (repository name ends with a dot). macOS fast checks: passed |
| 2 (`38029955167`) | `d205d26` | **failure** | Same: `verify` 24 of 25, the same budget failure; Windows checkout failure; macOS passed |
| 3 (`38057656794`) | `8a3c9af` (Gate 4) | **failure** | `verify`: **30 of 31 checks passed** in 12 min 24 s (all six Gate 4 checks, the regression against v0.8 with 0 differences and every self-test); only `check:budgets` failed: interaction 567 to 746 ms with presentation 27 ms. macOS fast checks (20 checks, including the new ones): **passed**. The Windows job no longer exists |
| 4 (`38059526037`) | `b24ec81` | **success** | Confirmed from the GitHub API, not assumed: `verify (Ubuntu 24.04)` succeeded (all 31 checks; verify step 11 min 54 s), and `fast checks on macos-latest (informational)` succeeded. First run of the corrected budget. The runner's Chromium is 156, not the pinned 141 of the local reference runs |
| 5 (`38060755909`) | `df9292b` | **success** | Confirmed from the API: both jobs succeeded (verify step 13 min 32 s) |
| 6 (`38070770322`) | `6f718a8` (Gate 4 reconciliation) | **success** | Confirmed from the API: `verify` (all 32 checks; verify step 13 min 00 s), the latency probe step (4 min 41 s) and the macOS job succeeded |
| 7 (`38072684943`) | `db6439e` | **success** | Confirmed from the API: `verify` (all 32 checks; verify step 13 min 51 s; probe step 6 min 27 s) and the macOS job succeeded |
| 8 (`38074449819`) | `2a52156` | **success** | Confirmed from the API: `verify` (all 32 checks; verify step 13 min 32 s; probe step 8 min 56 s) and the macOS job succeeded. `check:budgets` in the same job again: end-to-end 784 ms, input delay 753 ms, handler 2 ms, slowest event `pointerover` |
What the remote runs showed (Chromium 156.0.8078.4, a different build from the pinned 141): the regression harness reports **0 differences** in source, text, structure, styles, pixels and behaviour, and the Gate 2 and Gate 3 self-tests pass; this is independent evidence that the comparison holds across browser builds. The one failure was **interaction latency 584 to 784 ms against a 200 ms limit** (32 ms on the development machine). The metric included the time to the next frame, which depends on the machine's software rendering under the 4x CPU throttle. The first correction (Gate 4, commit `8a3c9af`) gated input delay plus handler time and reported only the presentation delay. **Run 3 showed that was the wrong diagnosis:** the presentation delay was only 27 ms, the delay was before or inside the handler, yet the main thread was idle (blocking time 5 ms, so no long task existed). A delay of that size with an idle main thread cannot come from this site's code; it is the headless input pipeline of the runner. The budget now gates the **handler time** (the page's own code, `processingStart` to `processingEnd`; 6 ms measured locally) and the blocking-time limit, and reports input delay and presentation delay without gating them. A negative test (`budgets: a slow click handler`, a 700 ms click handler) proves the gate still catches slow page code. This is a change to the measurement, made after seeing a remote failure; it is stated here so nobody reads it as a quiet relaxation. Run 4 (below) is the first run of the corrected budget.
Other notes: GitHub warns that `actions/checkout` and `actions/setup-node` v4 target Node 20 and are being forced to Node 24; this is a warning, not a failure, and the pinned SHAs are kept until the upgrade to the Node 24 releases is reviewed.

## Interaction latency investigation (Gate 4 review decision 1)
**The question.** Run 3 measured 567 to 746 ms for opening the phone menu on the GitHub runner, 6 to 30 ms on the development machine, with the main thread idle (blocking time 5 ms). The budget therefore gates the page's own handler time (`budgets.json`, `interactionMs`, limit 200 ms) and **retains and reports end-to-end latency** (`endToEndMs`, the Event Timing duration: input delay + handler + presentation) as a number that is not gated. The 200 ms INP "good" reference is printed next to it and a note says when it is exceeded.

**The tool.** `engineering/tools/latency-probe.mjs` (investigation only, exit code always 0) opens the phone menu on two pages for each combination of conditions (plain, CPU x4, network emulation, both = the budget profile) and dispatch methods (Playwright click, raw mouse click, touch tap), and records input delay, handler time, time to the next frame, the Event Timing duration, the longest gap of a 4 ms timer chain on the main thread during the interaction, and long tasks. Reading it: a small handler and a small main-thread gap with a large input delay mean the delay is outside the page.

**Local result (development machine, Chromium 141.0.7390.37, 3 repetitions x 2 pages per cell).** Input delay at most 35 ms (median 2 to 28 ms), handler 0.1 to 3.8 ms, event duration 0 to 80 ms in every condition, including the budget profile. The delay seen on the runner does **not** reproduce here, in any condition or dispatch method, so it cannot be explained from this machine.

**What runs 6 and 7 showed.** The long delay exists inside `check:budgets` and does not exist in the probe's plain click, with the same conditions on the same runner. The budget check differs by pressing Escape 150 ms after the click and by Playwright moving the mouse first (the Event Timing list begins with `pointerover`, `pointerenter`, `mouseover`). With an idle main thread the delay is not the page's code. Run 7 answered the open question of *which event*: it is **`pointerover`**, the hover event Playwright's mouse move produces before `pointerdown`. The page has no listener for `pointerover`, `mouseover` or `pointerenter` (checked in `site.js`, `hero.js`, `menu.js`), so no page code runs for it: the 771 ms is the wait before the browser dispatches a synthetic hover event, not anything the website does. It is the same figure on three runs (751, 771 ms and run 3's 567 to 746 ms), so it is deterministic, not runner noise, and it is absent from a probe that issues the identical events on the same runner with the same throttling. What differs is only the budget check's set-up, which the next experiment isolates. The budget check now prints the slowest event and the probe replays the budget sequence and prints each event's delay, handler time and duration. The result is in the run 7 rows below.

**On the runner.** The workflow runs the probe as the last step of the `verify` job (`if: always()`, so a budget failure comes with evidence, and it can never fail the build). Its output is in the job log under "Interaction latency probe". Results are recorded below once a run has produced them; **until then the cause is unproven**.

| Run | Commit | Probe on the runner |
|---|---|---|
| 7 (`38072684943`) | `db6439e` | Chromium 156.0.8078.4. **`check:budgets` in the same job: end-to-end 792 ms, input delay 771 ms, handler 2 ms, presentation 29 ms, slowest event `pointerover`.** Probe, same runner, budget profile (CPU x4 + network), the budget check's own sequence (click, 150 ms, Escape): `pointerover` delay 1 ms, `pointerdown` 2 ms, `click` 5 ms, every event 16 to 24 ms in duration, worst input delay 5.2 ms; with plain click, raw mouse click, touch tap: worst 25 ms. The same events at 1 to 5 ms. |
| 6 (`38070770322`) | `6f718a8` | Chromium 156.0.8078.4. Probe (menu click, CPU x4 + network): input delay median 4 to 10 ms, worst 26 ms; handler 0.2 to 1.7 ms; event duration 16 to 24 ms (40 ms worst); heartbeat gap 36 to 46 ms; no condition or dispatch method reproduced a long delay. **In the same job, `check:budgets` reported end-to-end 784 ms (input delay 751 ms, handler 2 ms, presentation 29 ms).** |

**Isolation experiment (this commit).** The probe now ends with a run that adds the budget check's three set-up details to the probe one at a time (the response-body hook with gzip, the older `tests/serve.mjs` server, the check's own observer script) and then all three, and reports the `pointerover` delay for each ("isolation |" rows in the job log). Locally every variant is 1 to 2 ms. The runner's result is recorded below.

| Run | Commit | Isolation result on the runner |
|---|---|---|
| 8 (`38074449819`) | `2a52156` | Chromium 156.0.8078.4, budget profile, click then Escape, `pointerover` delay (median / worst), milliseconds: baseline probe **0.4 / 0.7**; + response-body hook **0.7 / 0.7**; + `tests/serve.mjs` server **0.7 / 0.9**; + the budget check's observer script **0.8 / 1.4**; all three together **0.9 / 1.4** (worst delay of any event 4.5 to 5.4). In the same job `check:budgets` reported 753 ms for `pointerover`. |

**Result of the isolation.** None of the three set-up details the probe could add reproduces the delay, and neither do all three together. The delay is therefore **not** caused by the page, by the Escape key, by the response-body hook, by the test server, or by the budget check's observer script. It remains in the budget check when it runs inside `npm run verify` and is absent from a fresh process that issues the same events minutes later on the same runner. Candidates still open: (a) state of the long-running `verify` process or contention from something an earlier check left running while `check:budgets` runs; (b) a difference in how the budget check itself is driven that the probe does not copy (it loads all five pages, sets the pinned locale and time zone, and reads every response body); (c) the runner at that moment. One idea was tested and rejected locally: that the slow `pointerover` is a hover event the browser raises during page load (before the click): with the budget's own observer no event is recorded before the click (the first `pointerover` is at the click). **Cause still unproven.**

**Next experiment, not run (needs your go).** Let the probe call the budget check's own measurement function (`measureRuntime`) in a fresh process, after `verify` has finished, on the same runner. If that fast, the delay depends on being inside the `verify` process (contention or process state: candidate a). If it is slow, it is something in the measurement's own set-up (candidate b) and the next step is to bisect that function. About one more CI cycle (25 minutes).

**What this means for the budget.** The handler-time limit (200 ms; measured 2 ms on the runner) is unaffected. The end-to-end figure stays retained and reported, not gated, as decided; it is 784 ms in the CI job and 40 to 56 ms locally. No threshold has been changed on the strength of this investigation.

Controlled follow-ups, none run yet: the same probe on the same runner image with the pinned Chromium 141 instead of the runner's 156 (to separate browser version from machine); with `--headless=new` against the headless shell; with a quiet runner (`concurrency` limits) to rule out noisy neighbours; and, if the delay is in the input path, whether it appears in real-device traces at all (it is a lab artefact until a real device shows it).

## Status and limits
- The workflow is validated by `check:ci` (structure and safety), by running its steps locally from a clean clone, and by the remote runs above.
- The macOS job passed (informational). Windows cannot run this repository (name ends with a dot); the engineering scripts avoid symbolic links, shell-specific code and absolute paths, but were run only on Linux and macOS.
- Firefox and WebKit are not run (not installed in the development environment, and the checks are Chromium-based).
