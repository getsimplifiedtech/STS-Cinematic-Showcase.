#!/bin/bash
# Materialises the engineering for a run (G6-7). Used from another repository, the engineering folder of the action's own repository (downloaded by the runner at the
# exact SHA the caller named) is copied to <workspace>/.sts-framework/engineering, where the engine finds it inside the repository root, and the folder is excluded from
# git so that no scan treats it as the project's. Used from the framework repository itself, the engineering is the one in the working tree. Either way the path is
# handed to the later steps in STS_CORE_DIR.
set -euo pipefail
src_root="$(cd "${GITHUB_ACTION_PATH:?}/../../.." && pwd)"
case "${GITHUB_ACTION_PATH}/" in
  "${GITHUB_WORKSPACE:?}"/*) local_use=1 ;;
  *) local_use=0 ;;
esac
if [ "$local_use" = 0 ]; then
  dest="${GITHUB_WORKSPACE:?}/.sts-framework"
  rm -rf "$dest"
  mkdir -p "$dest"
  cp -R "$src_root/engineering" "$dest/engineering"
  rm -rf "$dest/engineering/node_modules" "$dest/engineering/.selftest" "$dest/engineering/.reports"
  printf '%s\n' "${ACTION_REF:?}" > "$dest/REVISION"
  exclude="$GITHUB_WORKSPACE/.git/info/exclude"
  mkdir -p "$(dirname "$exclude")"
  grep -qxF '.sts-framework/' "$exclude" 2>/dev/null || printf '.sts-framework/\n' >> "$exclude"
  core="$dest/engineering"
else
  core="${GITHUB_WORKSPACE:?}/engineering"
fi
[ -f "$core/verify.mjs" ] || { echo "::error::sts-engineering: no engineering at $core"; exit 1; }
printf 'STS_CORE_DIR=%s\n' "$core" >> "${GITHUB_ENV:?}"
echo "engineering: $core"
