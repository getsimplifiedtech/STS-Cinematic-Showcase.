<!-- Generated from jade-and-ember/engineering/release/evidence-spec.json by `npm run evidence:docs`. Do not edit by hand: change the specification and regenerate. -->

# Automated verification run (GitHub Actions): test procedure

**Evidence class E1: Browser emulation.** Automated and emulated: Playwright engines, device descriptors, viewport and forced-colours emulation, a CI run. This record may be claimed as: "behaves as expected in this engine under emulation". It must never be claimed as: anything about a physical device, a screen reader or a person's experience.

**Release-gate type:** `ci-run`. **Estimated tester time:** about 0 minutes (an estimate, not a measurement). **Scaffold command:** `npm run evidence:new -- ci-run`.

A recorded GitHub Actions run of the verify workflow for the release commit. Automated and emulated: it can never satisfy a human requirement.

## What this is

The recorded result of the automated GitHub Actions verification of the candidate artifact. It is **E1**: automated and emulated. It supports the release gate's `ci-run` requirement and **cannot** stand in for any human test.

## How to record it

1. Wait for the verify workflow run that verified the candidate artifact to finish and open its run page and its **Verify** job log.
2. `npm run evidence:new -- ci-run`, then fill `date`, `by` (who recorded it), `url` (the run page, `https://github.com/<owner>/<repo>/actions/runs/<number>`), `summary` (what ran and the outcome), `conclusion: "success"`, copy the line `verification record: ...` printed at the end of the Verify job into `verification` (candidate, engineDigest, registryDigest, checks.total and checks.passed, seal, runner "github-actions", runId) and set `status` to `"completed"`.
3. The run must have verified exactly the candidate artifact (`build.candidate`), with all of the checks the current verifier defines, made by the current verification code. `build.commit` records the commit it ran on and must be the release commit or an earlier commit of it.

## What the release gate checks

- the record is for the release commit, the class is E1, the URL is a GitHub Actions run, the conclusion is `success`;
- an unfilled template, another commit, another class or a failed run is rejected.
