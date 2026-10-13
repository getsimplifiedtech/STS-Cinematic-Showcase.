#!/bin/bash
# Guard of the composite action (G6-7): fail closed before anything is copied or run. Reads its inputs from the environment, never from the command line.
#   MODE               one of the modes of ci/jobs.json (a caller cannot ask for anything else)
#   PROJECT_DIR        the project folder, relative to the workspace, plain characters, no ".." and no empty segment
#   ACTION_REPOSITORY  the repository the action was downloaded from
#   ACTION_REF         the ref it is used at: a client must name a full 40-hex commit SHA, never a branch or a tag
# The action is "local" when it sits inside the workspace (used as ./.github/actions/engineering from the framework's own checkout) and "remote" when the runner
# downloaded it from another repository. Which it is follows from where it is, not from a context value a caller could influence.
set -euo pipefail
FRAMEWORK_REPOSITORY="getsimplifiedtech/sts-web-design-framework"
# the repositories that may run this action from a verified snapshot of the framework that they carry (the one public consumer, which cannot download the private action);
# the same list is in lib/ci-policy.mjs (SNAPSHOT_REPOSITORIES) and check:ci compares the two
SNAPSHOT_REPOSITORIES=("getsimplifiedtech/STS-Cinematic-Showcase.")
fail() { echo "::error::sts-engineering: $1"; exit 1; }

case "${MODE:-}" in
  verify|fast|firefox|webkit|external-links|lighthouse|supply-chain-report) ;;
  *) fail "unknown mode '${MODE:-}'" ;;
esac
[[ "${PROJECT_DIR:-}" =~ ^[A-Za-z0-9._][A-Za-z0-9._/-]*$ ]] || fail "project-dir must be a relative path of plain characters"
case "/${PROJECT_DIR}/" in
  */../*|*//*) fail "project-dir must not contain '..' or an empty segment" ;;
esac
[ -f "${GITHUB_WORKSPACE:?}/${PROJECT_DIR}/sts.engineering.json" ] || fail "no sts.engineering.json in '${PROJECT_DIR}'"
# the project folder must really be inside the workspace (a symbolic link could lead anywhere)
workspace_real="$(cd "${GITHUB_WORKSPACE}" && pwd -P)"
project_real="$(cd "${GITHUB_WORKSPACE}/${PROJECT_DIR}" && pwd -P)"
case "${project_real}/" in
  "${workspace_real}"/*) ;;
  *) fail "project-dir '${PROJECT_DIR}' resolves outside the workspace" ;;
esac

case "${GITHUB_ACTION_PATH:?}/" in
  "${GITHUB_WORKSPACE}"/*) local_use=1 ;;
  *) local_use=0 ;;
esac
if [ "$local_use" = 0 ]; then
  [ "${ACTION_REPOSITORY:-}" = "$FRAMEWORK_REPOSITORY" ] || fail "the engineering is used from '${ACTION_REPOSITORY:-}', not from $FRAMEWORK_REPOSITORY"
  [[ "${ACTION_REF:-}" =~ ^[0-9a-f]{40}$ ]] || fail "the framework must be referenced by a full 40-character commit SHA (got '${ACTION_REF:-}')"
  tracked="$(git -C "$GITHUB_WORKSPACE" ls-files -- .sts-framework)" || fail "cannot list the tracked files of the workspace (is it a git checkout this user may read?)"
  if [ -n "$tracked" ]; then
    fail "'.sts-framework' is committed in this repository; the framework is materialised there at run time and is never committed"
  fi
  echo "framework revision ${ACTION_REF}"
elif [ "${GITHUB_REPOSITORY:-}" = "$FRAMEWORK_REPOSITORY" ]; then
  echo "framework: this repository (local use)"
else
  on_list=0
  for r in "${SNAPSHOT_REPOSITORIES[@]}"; do [ "${GITHUB_REPOSITORY:-}" = "$r" ] && on_list=1; done
  [ "$on_list" = 1 ] || fail "a local use of the action is allowed only inside $FRAMEWORK_REPOSITORY or a repository that carries a verified snapshot of it (${SNAPSHOT_REPOSITORIES[*]})"
  here="$(cd "${GITHUB_ACTION_PATH}" 2>/dev/null && pwd -P)" || here=""
  want="$(cd "${GITHUB_WORKSPACE}/.github/actions/engineering" 2>/dev/null && pwd -P)" || want=""
  [ -n "$want" ] && [ "$here" = "$want" ] || fail "a snapshot repository runs the action only from .github/actions/engineering at the root of the workspace (the folder the integrity record describes)"
  [ -f "${GITHUB_WORKSPACE}/sts-framework-snapshot.json" ] || fail "no sts-framework-snapshot.json in the workspace: the local copy of the framework is not described by an integrity record"
  echo "framework: local copy of the snapshot in this repository; the run step verifies its integrity record before it runs any check"
fi
echo "mode ${MODE}, project ${PROJECT_DIR}"
