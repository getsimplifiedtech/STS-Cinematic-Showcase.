#!/bin/bash
# Installs what a mode needs (G6-7): the engineering's own lockfile only, no install scripts, an engine range that must match; then the browsers and ffmpeg the mode uses.
set -euo pipefail
cd "${STS_CORE_DIR:?}"
npm ci --ignore-scripts --engine-strict
case "${MODE:?}" in
  verify) npx playwright install --with-deps chromium ;;
  lighthouse) npx playwright install --with-deps chromium ;;
  firefox) npx playwright install --with-deps firefox ;;
  webkit) npx playwright install --with-deps webkit ;;
esac
case "$MODE" in
  verify|firefox|webkit)
    sudo apt-get update
    sudo apt-get install -y --no-install-recommends ffmpeg
    ;;
esac
