# G6-3A evidence (`APR-JE-041`)

Evidence for [`../G6-3A-DESIGN.md`](../G6-3A-DESIGN.md). It records what was read and observed; it creates no approval, no reviewer identity and no credential.

| File | What it is |
|---|---|
| `official-sources.json` | The 33 official sources read (GitHub documentation source files, the `actions/attest` README, the GitHub CLI source, the REST OpenAPI description) with byte size and SHA-256, and the 65 quotations used in the design (`Q01` to `Q66`, `Q40` unused) and a derived permission map (which GitHub App permission gates each release-relevant API operation), each matched verbatim against its source when the file was built |
| `platform-observations.json` | Read-only observations of this repository through the GitHub connector and git (`O1` to `O12`), and the list of things that could not be determined from the sandbox |

## How the sources were read, and the limits

* `docs.github.com` could not be resolved from the sandbox. The documentation is built from the public `github/docs` repository, whose source files were read from `raw.githubusercontent.com` (branch `main`, 2026-10-12). The commit of the branch at that moment is not recorded by this route; the SHA-256 of every file read is.
* The source files are Liquid-templated. For GitHub.com Free, Pro and Team the `fpt` variant applies; `ghec` is Enterprise Cloud. Quotations keep the template tags exactly as written.
* This is an engineering reading of official sources, **not a human review of the rendered pages** and not legal or procurement advice. A person should re-read the cited pages before the mechanism is finally approved.
* Not determinable: the organisation's plan; any ruleset, environment, CODEOWNERS file or Actions policy; the permissions of the GitHub App the sessions use; whether this session's token could call settings or approval endpoints (the sandbox proxy refuses `api.github.com`; nothing that changes state was attempted); a live `gh attestation verify` or an `ssh-keygen` signature test (`ssh-keygen` is not installed; `gh` is installed but unauthenticated).

## Reproducing the quotation check

Fetch the files listed in `official-sources.json` from `https://raw.githubusercontent.com/<repository>/<branch>/<path>`, compare each SHA-256 (a later `main` may differ; then compare the quoted sentences, which are given in full), and search each `text` as a fixed string. No key, token or account was used to read any of them.
