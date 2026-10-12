# Release control: a local proof of concept (G6-3A, `APR-JE-043`)

**Synthetic. Nothing here is connected to GitHub, a host or a credential, and nothing here enables a client-production release.** It is the working core of the release-control repository described in [`../G6-3A-DESIGN.md`](../G6-3A-DESIGN.md), built to be tested in isolation: a throwaway folder, synthetic client sites, disposable tokens, and a "deployment" that copies into that folder. `lib/authenticity.mjs` in every client repository is untouched and still a hard stop.

## What it does

| Step | Command (`npm run rc -- <command> …`) | Who | What happens |
|---|---|---|---|
| set up | `init-demo --rc <dir> --clients a,b --hosts a=www.a.com` | demo | Creates the throwaway folder and three disposable tokens (owner, scheduler, coding agent). The agent has **no capability at all** |
| stage | `stage --client a --package <release folder>` | owner, scheduler | Copies the package into RC's storage and verifies **that copy** with the existing package verifier (`lib/release-package.mjs`) against RC's own pinned tooling; only RC's authenticity decision is left open. Classifies the change, writes a review page, records `staged` |
| record | `record-approval --client a --stage ID --type rights\|search\|externalLinks\|domain --note "…"` | owner | A human judgement. The subject digest is read from the stage; nobody types a hash |
| approve | `approve --client a --stage ID [--note "…" --subjects search,externalLinks --basis licence]` | owner | Repeats every check on the stored bytes, matches the digest itself, deploys exactly the delivered files, records `approved`, `release-started` (before the deployment) and `released`. With `--note`, the subjects you NAME (they must be exactly the ones still open for this stage) are recorded first, so one command can do it but cannot approve something you did not read about |
| routine | `run-scheduled --client a --package <folder>` | scheduler | Stages; releases by itself **only** a routine change (`identical`, `text-only`) covered by a preauthorisation, otherwise leaves it for the owner |
| control | `preauth-grant`, `preauth-revoke`, `revoke`, `revoke-approval`, `freeze`, `unfreeze`, `adopt-tooling`, `audit`, `status`, `review` | owner (read-only ones: scheduler) | |

`npm run rc:demo` runs a narrated session through the real command line (the transcript is in `../g6-3a-evidence/poc-transcript.txt`). `npm run check:selftest-release-control` runs the adversarial tests (also run by `check:release-dryrun`, so by `npm run verify` and CI).

## Routine versus material

The comparison is always with the last release **the owner approved** (not the last release): automatic releases never become the baseline, so small routine edits cannot add up unseen (the 4,000-character limit is cumulative since the owner's last approval). If what is live was revoked, or nothing the owner approved is live, only the owner can release.

* **identical**: the delivered files are the files the owner last approved.
* **text-only**: only `.html` pages changed, and each page is identical once its text is blanked: every tag, attribute, link, script, style, comment and the place and number of text nodes are the same; at most 4,000 characters changed; no page with raw-text oddities.
* **material**: anything else, including any new, removed or non-HTML file, any change to the search files, the rights inventory, the external destinations, the host, or the project data the gate relies on (findings, dependency register, rights inventory, crawler review), and every first release.

Preauthorisation covers the kinds the owner names, for a limited time and a limited number of releases. A material change is never released automatically.

## What is modelled, and what is the real boundary

The real boundary of the design is **reachability**: the release-control repository is one the coding integration is never given (G6-3A-DESIGN.md E5). This proof of concept cannot test that. It tests everything *behind* it:

| Real design | Here |
|---|---|
| the owner uses the GitHub web interface to run a workflow in the release-control repository | the owner's disposable token on the command line |
| a ledger line counts only if an RC workflow run wrote it | each line carries an HMAC receipt of the RC "runner" key, plus a hash chain and a signed head |
| the coding agent's GitHub credential cannot see the repository | the agent's token holds no capability |
| per-client read-only deploy key and hosting token in RC secrets | a per-client token the local-directory adapter requires |
| hosting adapter (G6-4) | a copy into `deploy/<client>/current` inside the folder |

## Known limits of the proof of concept (do not read it as more than it is)

1. **The reachability boundary is not exercised** (validated separately on a disposable repository; `add_repo` stopped by a session control, the backend's own answer unobserved).
2. **The verification record is self-reported.** The package carries a sealed full-verification record made by the client's own CI; RC checks it was made by RC's tooling, but a production RC must re-run the QA suite itself on the checked-out commit.
3. **Tooling and project data are mixed** in this repository's `engineering/` folder, so RC builds a throwaway "verification view": its own adopted tooling plus six declared data files that travel with the package (`package/data/`). Separating them properly is a G6-5 task.
4. **Gate inputs that are repository data** (findings, dependency exceptions, crawler review) are agent-writable; RC treats any change to them as material and shows them, but cannot judge them.
5. **Someone who can write the ledger, its head file and the runner key can rewrite history.** In the real design that is someone who can edit the release-control repository: the owner alone.
6. **The owner approves behaviour, not code.**
7. No preview rendering beyond the static staged site; no real hosting adapter; no concurrency beyond a per-client lock (with stale-lock breaking; the emergency controls break a lock held for more than 30 s).
8. **The classifier is a conservative tokenizer, not a browser.** It accepts one strict, boring HTML grammar and treats everything else as material, but it has not been compared with a real HTML5 parser on every input; the real RC should use one (and a differential fuzz test) before routine releases are enabled.
9. **The existing external-link scanner and package verifier are reused as they are.** Differences between them and a browser belong to those components (G6-3 and earlier), not to this proof of concept.
10. **Revoking a release records the revocation; it does not take the site down.** The status shows `live` and `liveRevoked`; withdrawing a live site is a hosting action (G6-4), and until then the owner would deploy the previous approved release.
11. **Staged copies are never pruned**, and a stage that expires is only refused, not deleted.
12. **Approvals are bound to content, not to a date.** A recorded judgement covers any later stage whose subject digest is the same, until it expires (search 90 days, external links 30 days, rights and domain 365 days).
13. **The ledger is verified, not protected.** A tampered or truncated ledger is detected and refuses every operation (a hash chain, runner receipts, a signed head and a second copy of it), but anyone holding the runner key and write access to all three copies could rewrite history.
