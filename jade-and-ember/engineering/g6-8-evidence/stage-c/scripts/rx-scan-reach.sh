#!/usr/bin/env bash
# Stage C risk 3 (reach of the dry run's network scan): append a fetch(...) line to a hosting adapter and to a generator of the
# engineering folder in the throw-away clone rx (a clone of e17560d with engineering/node_modules installed), run the dry run, revert.
# Set SP to your working folder (Node 24 tools on PATH). Output of the original run: ../risk-experiments-raw.txt (E3c/E3d).
set -u
SP=${SP:?set SP to the working folder}
export PATH=$SP/n24/node_modules/.bin:$PATH
cd $SP/rx/jade-and-ember
for t in adapters/hosting/vercel.mjs generators/seo.mjs; do
  f=../engineering/$t; cp $f $SP/orig.bak
  printf '\nawait fetch("https://example.invalid/x");\n' >> $f
  node ../engineering/checks/release-dryrun.mjs > $SP/e3.log 2>&1
  echo "-- fetch appended to engineering/$t | exit $? | $(grep -m1 'scenarios as expected' $SP/e3.log | cut -c1-120) | $(grep -m1 -E '^(PASS|FAIL)' $SP/e3.log)"
  cp $SP/orig.bak $f
done
