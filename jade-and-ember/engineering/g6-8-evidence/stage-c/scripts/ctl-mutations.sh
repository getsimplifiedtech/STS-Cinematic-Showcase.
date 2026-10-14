#!/usr/bin/env bash
# Stage C risk experiment, kept so a reviewer can repeat it. It was run in a throw-away clone in the session scratchpad: set SP to your own
# working folder (Node 24 tools on PATH; rx = a clone of e17560d with engineering/node_modules installed; v2 = the fresh clone of V2;
# base2bb = a clone of 2bb1737). Nothing here touches the real checkout. Output of the original runs: ../risk-experiments-raw.txt, ../pixel-flake-results.txt.
set -u
SP=${SP:?set SP to the working folder}
export PATH=$SP/n24/node_modules/.bin:$PATH
cd $SP/base2bb/jade-and-ember
git -C $SP/base2bb status --short | wc -l
OUT=$SP/ctl-mutations.txt; : > $OUT
for spec in $(grep SURVIVED $SP/rx-mutations.txt | cut -d' ' -f1); do
  f=${spec%%:*}; n=${spec##*:}; p=engineering/release-control/lib/$f
  sed -i "${n}s/throw new RcError(/void new RcError(/" $p
  node engineering/checks/selftest-release-control.mjs > $SP/ctl.log 2>&1; rc=$?
  echo "$spec | original self-test, original layout | exit $rc | $([ $rc != 0 ] && echo CAUGHT || echo SURVIVED)" | tee -a $OUT
  git -C $SP/base2bb checkout -q -- .
done
echo done | tee -a $OUT
