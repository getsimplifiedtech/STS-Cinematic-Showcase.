# G6-3A local proof of concept: report

Work package G6-3A, authorised by `APR-JE-043`. **Synthetic, local, disposable.** Nothing was connected to GitHub, no release-control repository was created, no installation or permission was changed, no production credential exists, nothing was deployed, the master framework repository was not touched, and G6-4 was not started. `lib/authenticity.mjs` in the client repository is untouched and is still a hard stop; the reviewer table is still empty.

> **Since G6-8 (`APR-JE-049`, `APR-JE-050`): how the 41 cases are run.** The proof of concept and its self-test (`checks/selftest-release-control.mjs`) are frozen and unchanged. They were written for the layout in which the whole engineering sits inside the project folder, which is no longer the layout (the engine is the verified snapshot at the repository root). `npm run check:selftest-release-control` therefore runs the unchanged self-test inside a throw-away copy laid out the old way (`checks/je-release-control-layout.mjs`: the snapshot laid over this folder, the pre-migration workflow, and, in that copy only, the verifier judging against the tooling it is given). **This validates the original behaviour under its original layout. It is not direct execution of the proof of concept in the new split layout**, which would need changes to its frozen code and was not part of the migration. The proof of concept enables no release path and every production-release restriction stays in force. `npm run rc` and `npm run rc:demo` run the frozen command line in the current layout, where the engine-digest comparison cannot hold: they fail closed and are not exercised; only the 41 cases are.

## 1. What exists

`engineering/release-control/` is the working core of the release-control repository (RC) described in [`G6-3A-DESIGN.md`](G6-3A-DESIGN.md), runnable on a throwaway folder:

| Part | Does |
|---|---|
| `lib/intake.mjs`, `lib/view.mjs` | Copies a prepared package into RC's storage, refuses links, devices, stray files, huge archives and unlisted data files, and runs the **existing** package verifier on **that copy** with RC's own pinned tooling. Only the authenticity decision is left to RC |
| `lib/classify.mjs` | Decides **identical / text-only / material** by a strict tokenizer; anything it does not understand is material |
| `lib/engine.mjs` | stage, record-approval, approve, auto-release, revoke, revoke-approval, freeze, preauthorise, adopt-tooling, review, audit, status |
| `lib/ledger.mjs` | Per-client hash-chained audit ledger with runner receipts, a signed head and a second copy of it, a genesis entry and a per-client lock |
| `lib/auth.mjs` | Three disposable roles: owner, scheduler, coding agent (**no capability at all**) |
| `lib/adapter.mjs` | The only deployment adapter: a copy into `deploy/<client>/current` inside the throwaway folder, needing that client's own deploy token |
| `cli.mjs`, `demo.mjs` | The owner-facing commands and a narrated run ([`g6-3a-evidence/poc-transcript.txt`](g6-3a-evidence/poc-transcript.txt)) |

Run it: `npm run rc:demo` (narrated), `npm run rc -- <command>` (see the header of `cli.mjs`), `npm run check:selftest-release-control` (the tests). Existing QA and security checks are **reused, not copied**: the package verifier (checksums, manifest, candidate digest recomputed from the ZIP's own bytes, headers, SBOM, external links, rights, supply chain, verification record, channel text) runs unchanged, and the self-test is also run by `check:release-dryrun`, so by `npm run verify` and CI.

## 2. Your eight instructions, one by one

| # | Instruction | Result |
|---|---|---|
| 1 | Prepare the release-control workflow from the G6-3A design | Done as local code with the same stage / release phases, ledger, roles, preauthorisations, per-client isolation and tooling pin |
| 2 | Build and validate in an isolated environment with synthetic data and disposable credentials | Done: a synthetic client site built by the real release tool, throwaway folders, tokens generated per run |
| 3 | Artifact verification, release authorisation, audit records, rejection safeguards | Done; every refusal has a stable code and is itself recorded (`ledger/_denied.jsonl`) |
| 4 | Coding-agent credentials cannot touch release authorisation or deployment controls | In the PoC the agent role holds **no capability** (every operation refused, recorded). **The real boundary is reachability, which a local PoC cannot exercise** (section 6, item 1) |
| 5 | Automatic digest matching; the owner never types a hash | Done: digests are read from the stage and compared by the engine at approval (package tree, ZIP, delivered files, preview, deployed result) |
| 6 | Simple owner interaction: review the staged site, approve a material release | Section 4 |
| 7 | Validate revoked approvals, mismatched artifacts, unauthorised releases, cross-client isolation | Section 3 |
| 8 | Reuse existing automated QA and security checks | Done (above); RC re-runs the existing verifier on its own copy at stage **and again at release** |

## 3. Verification results

* **Self-test: 41 cases, all pass** (`check:selftest-release-control`, about 45 s). They cover: credentials and roles (the agent refused everywhere, scoped, expired and revoked credentials, malformed client names); the owner path; routine versus material, preauthorisation kind, limit, expiry and revocation, and drift against the owner's last approval; artifact tampering (a changed byte in the stored ZIP, a changed record, a swapped package, a changed preview); hostile packages (symlinks, path traversal, a huge declared size, stray and unlisted data files, a wrong `serve.py`); the tooling pin and a race during verification; ledger forgery, edit, removal, truncation, reorder, replay across clients, wrong runner key, deleted ledger, older ledger put back, locks; revocation, expiry and freeze; cross-client isolation; the untouched hard stop plus a lint that nothing outside `release-control/` imports it and that it uses no network, subprocess or service credential; the real command line; and classifier evasions (self-closing script, spaced end tag, quote-parity attributes, CDATA, processing instructions, noscript, UTF-16 and invalid UTF-8 pages).
* **Mutation testing: 49 single-line breakages of the guards, 46 caught by the tests.** Three survive for stated reasons (a duplicated pin that is caught when both copies are removed; an equivalent mutant; an unreachable defence in depth): [`g6-3a-evidence/poc-mutations.md`](g6-3a-evidence/poc-mutations.md). The first round found nine survivors; six were real gaps and now have test cases, one was dead code and was removed.
* **Independent attack review.** A separate reviewing session that was given the code attacked the first version and found classifier evasions, ledger and lock weaknesses, a baseline that routine edits could drift away from, an unsafe approval shortcut, and several smaller issues. All were fixed or are documented below. This is a model review, **not** human verification and is not recorded as one.
* **Repository gates and CI:** a full local `npm run verify` on commit `8910953` passed **40 of 40 checks** (the PoC self-test runs inside `check:release-dryrun`); the composite SBOM digest `a1dbdd1255ca2c2d6b733658e044b5e546071c7afce17b77032994a226830e43` is unchanged from G6-3; the framework-matrix, G6-3A scope and Gate 5 closure verifiers pass; GitHub Actions `Jade & Ember verify` succeeded on `8910953`. (A run on the earlier push `c68fb88` was cancelled by the newer push, not failed.)

## 4. The owner's approval experience

Five things, none involving a hash:

1. **Nothing to do for routine work.** A rebuild that changes no delivered file, or an edit of words only (within 4,000 characters since your last approval), is released by the scheduler *if you preauthorised that kind* (`preauth-grant --kinds identical,text-only --days 30 --max 10`). Otherwise it waits.
2. **A material change waits for you.** `rc review --client c --stage ID` says what changed in plain words and which of your four decisions (search files, rights, external links, domain) are still open; a generated review page links the exact staged copy of the site (not a link from anyone else), the checks that ran, and the changed files.
3. **You record or approve:** `rc approve --client c --stage ID`, after `record-approval` for each open decision, or in one command `approve --note "what I checked" --subjects search,externalLinks`. You must name exactly the open subjects, so a note alone never approves something you were not shown.
4. **The engine does the matching** and prints one line: `RELEASED … deployed digest … matched the staged files`.
5. **Controls:** `revoke`, `revoke-approval`, `freeze`, `preauth-revoke`, `audit` (a readable timeline that says whether the ledger verifies), `status`.

In the real design these become the GitHub web-interface forms of section 4.2 of the design (Actions, choose a workflow in RC, Run workflow). The PoC does not test that interface.

## 5. Design decisions worth knowing

* **Approvals bind to content.** A judgement covers any later stage whose subject digest is identical until it expires (search 90 days, external links 30, rights and domain 365); a revoked judgement stops counting at once.
* **The baseline is your last approval, not the last release.** Automatic releases never become the baseline, so routine edits add up against what you approved; if what is live was revoked, only the owner can release.
* **A scheduler cannot push aside a material stage waiting for you.**
* **Tooling is pinned by digest and adopted only by the owner, for all clients at once**, after seeing which files differ. A half-done adoption leaves the old pin, so it fails closed.
* **Project data is separate from tooling in RC's view.** The repository mixes them (`assets.manifest.json` and five other records live beside the verifier), so RC verifies against its own tooling plus six declared data files that travel with the package. Splitting them properly is a G6-5 task.

## 6. Remaining security limitations (stated plainly)

1. **The central boundary is not exercised.** The real protection is that coding sessions *cannot reach* the RC repository. Separate read-only tests showed the session can list the organisation's repositories, `add_repo` was stopped by a session control (the backend's own answer was never observed) and `create_session` was stopped by the installation's repository selection. Whether the platform's credential really cannot reach a repository outside the installation is **unverified** until validation V1 runs on a disposable test RC.
2. **The verification record is self-reported.** A package carries a sealed record made by the client's own CI; RC checks it was made by RC's tooling, but a production RC must re-run the QA suite itself on a checked-out commit. Until then a hostile client pipeline could submit a record for checks it did not run.
3. **Tooling is the weakest link.** Whoever can change the adopted tooling can change what "verified" means. The pin and the owner-only, listed-files adoption narrow this; they do not remove it.
4. **Gate inputs that are repository data** (findings, exceptions, crawler review) are writable by coding agents. Any change is tracked, shown and makes the release material, but RC cannot judge it.
5. **The owner approves behaviour, not code.** Review shows the site and what changed; it is not a source review.
6. **The classifier is a conservative tokenizer, not a browser.** It has not been differentially tested against a real HTML5 parser; do that before enabling routine releases. Behaviour of the existing external-link scanner and package verifier is taken as given.
7. **Ledger rewriting** needs the runner key and write access to all three copies; in the real design that is "someone who can edit RC", the owner alone. A local ledger cannot prove who pressed a button, only that the runner wrote the line.
8. **Revoke does not undeploy.** It records the revocation and blocks further automatic releases; taking a live site down is a hosting action (G6-4).
9. **Untested paths:** the deployment rollback if the final rename fails; concurrency beyond one lock per client; staged copies are never pruned.
10. **No human verification of anything.** No person was asked to verify, no reviewer identity exists, and no approval in this repository covers more than `APR-JE-041` to `043`.
11. **Documentation to correct (docs only):** the evidence note on observation O8 reads the session's visibility of all repositories as weaker isolation than the later tests show.

## 7. Exactly what activation would require

None of this was done; each step needs your separate authorisation.

1. **Decide R1 to R11** of the design (adopt the RC model; confirm preconditions P1 to P6; supply the organisation plan and whether the owner account has a passkey or 2FA; sequencing; service-agreement clauses for handover).
2. **Run the P4 inventory** (R11): every route from a repository or session to a host, and every app and organisation-level secret that reaches the repositories.
3. **Create the RC repository** (private, owner-only, **not** in the coding integration's installation, which must list "only selected repositories"). Confirm nobody but the owner can write to it, and that the owner's GitHub account has a passkey or 2FA that no session can satisfy.
4. **Port this core into RC workflows** (`workflow_dispatch`, GitHub-hosted runners, actions pinned to full commit SHAs), replacing the HMAC runner with the Actions run, the disposable tokens with the owner's own web login, and the local adapter with a real hosting adapter (which is G6-4 work) holding **per-client** deploy tokens.
5. **Make RC re-run the QA suite itself** on a checked-out commit (limitation 2) and separate tooling from project data (G6-5).
6. **Run validations V1 to V8** of the design on disposable test repositories, above all **V1** (can the coding integration attach, read, dispatch, push or approve against a test RC?) and V4 (a hostile client build tries to read RC's secrets and ledger).
7. **Independent human review** of the result (V7), and an owner walkthrough (V8).
8. **Differential test of the classifier** against a real HTML5 parser; then, and only then, grant a first preauthorisation for `identical`.
9. **Enable the first client by recording the decision in the RC ledger**, with the first release going to a throwaway target. Until then the authenticity hard stop and the empty reviewer table stand.

## 8. Stopped for owner review

Nothing beyond G6-3A was started. This report, the code, the transcript and the mutation table are the deliverable; the decisions above are yours.
