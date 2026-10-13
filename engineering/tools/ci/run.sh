#!/bin/bash
# Runs the engineering in one mode (G6-7). The project is the folder the caller named; the engineering is the one materialise.sh found. The mode decides the
# command, and no mode skips a check; the environment is the runner's, plus the values the action passes.
set -euo pipefail
core="${STS_CORE_DIR:?}"
export STS_PROJECT_DIR="${GITHUB_WORKSPACE:?}/${PROJECT_DIR:?}"
cd "$STS_PROJECT_DIR"
# the project's own claim about where its repository begins must be this workspace; every repository-wide scan starts there
node -e '
const fs = require("node:fs"), path = require("node:path");
const m = JSON.parse(fs.readFileSync(path.join(process.env.STS_PROJECT_DIR, "sts.engineering.json"), "utf8"));
const root = fs.realpathSync(path.resolve(process.env.STS_PROJECT_DIR, m.paths.repositoryRoot));
if (root !== fs.realpathSync(process.env.GITHUB_WORKSPACE)) { console.error("::error::sts-engineering: paths.repositoryRoot resolves to " + root + ", which is not the workspace"); process.exit(1); }'
# a repository that carries the framework as a snapshot (not the framework itself) verifies every file of the copy against its integrity record before anything runs
if [ -f "${GITHUB_WORKSPACE}/sts-framework-snapshot.json" ] && [ "${GITHUB_REPOSITORY:-}" != "getsimplifiedtech/sts-web-design-framework" ]; then
  node "$core/tools/snapshot.mjs" verify --repo "$GITHUB_WORKSPACE"
fi
case "${MODE:?}" in
  verify)
    export STS_REQUIRE_AUDIT=1
    node "$core/verify.mjs"
    ;;
  fast) node "$core/verify.mjs" --fast ;;
  firefox) node "$core/cross-browser.mjs" --engine firefox ;;
  webkit) node "$core/cross-browser.mjs" --engine webkit ;;
  external-links)
    node "$core/tools/external-links.mjs" inventory
    node "$core/tools/external-links.mjs" verify
    node "$core/tools/external-links.mjs" verify --json --runner github-actions --note "GitHub-hosted ubuntu-24.04 runner with open outbound network; TLS is verified against the runner's own certificate store" --run "$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"
    ;;
  lighthouse) node "$core/tools/lighthouse.mjs" ;;
  supply-chain-report)
    cd "$core"
    bash "$core/tools/ci/supply-chain-report.sh"
    ;;
  *) echo "::error::sts-engineering: unknown mode '$MODE'"; exit 1 ;;
esac
