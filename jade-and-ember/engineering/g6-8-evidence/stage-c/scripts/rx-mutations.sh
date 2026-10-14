#!/usr/bin/env bash
# Stage C risk experiment, kept so a reviewer can repeat it. It was run in a throw-away clone in the session scratchpad: set SP to your own
# working folder (Node 24 tools on PATH; rx = a clone of e17560d with engineering/node_modules installed; v2 = the fresh clone of V2;
# base2bb = a clone of 2bb1737). Nothing here touches the real checkout. Output of the original runs: ../risk-experiments-raw.txt, ../pixel-flake-results.txt.
# Stage C, risk 4: each run disables ONE guard of the frozen release-control code (a `throw new RcError(` becomes `void new RcError(`) in a throw-away clone and runs the compatibility harness.
set -u
SP=${SP:?set SP to the working folder}
export PATH=$SP/n24/node_modules/.bin:$PATH
cd $SP/rx/jade-and-ember
OUT=$SP/rx-mutations.txt; : > $OUT
for spec in engine.mjs:89 engine.mjs:100 engine.mjs:122 engine.mjs:140 engine.mjs:172 engine.mjs:199 engine.mjs:207 engine.mjs:220 engine.mjs:244 engine.mjs:269 engine.mjs:291 engine.mjs:312 intake.mjs:25 intake.mjs:47 intake.mjs:71 ledger.mjs:31 ledger.mjs:83 state.mjs:42 state.mjs:73; do
  f=${spec%%:*}; n=${spec##*:}; p=engineering/release-control/lib/$f
  before=$(sed -n "${n}p" $p | cut -c1-110)
  sed -i "${n}s/throw new RcError(/void new RcError(/" $p
  if [ "$(git -C $SP/rx diff --stat | wc -l)" = 0 ]; then echo "$spec: NOT MUTATED" | tee -a $OUT; continue; fi
  node engineering/checks/je-release-control-layout.mjs > $SP/mut.log 2>&1; rc=$?
  first=$(grep -m1 "^  - " $SP/mut.log | cut -c1-140)
  echo "$spec | exit $rc | $([ $rc != 0 ] && echo CAUGHT || echo SURVIVED) | $before | $first" | tee -a $OUT
  git -C $SP/rx checkout -q -- .
done
echo done | tee -a $OUT
