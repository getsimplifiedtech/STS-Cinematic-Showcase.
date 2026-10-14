#!/usr/bin/env bash
# Stage C risk experiment, kept so a reviewer can repeat it. It was run in a throw-away clone in the session scratchpad: set SP to your own
# working folder (Node 24 tools on PATH; rx = a clone of e17560d with engineering/node_modules installed; v2 = the fresh clone of V2;
# base2bb = a clone of 2bb1737). Nothing here touches the real checkout. Output of the original runs: ../risk-experiments-raw.txt, ../pixel-flake-results.txt.
# Stage C, Stage B risk 6 (pixel regression): the check run alone, then under CPU load. Thresholds are never touched.
set -u
SP=${SP:?set SP to the working folder}
export PATH=$SP/n24/node_modules/.bin:$PATH
cd $SP/v2/jade-and-ember
OUT=$SP/flake-results.txt; : > $OUT
run(){ label=$1; node ../engineering/checks/regression.mjs > $SP/flake-$label.log 2>&1; rc=$?; px=$(grep -m1 "pixels:" $SP/flake-$label.log | sed 's/^ *//'); echo "$label | exit $rc | $px | $(grep -c '^  - ' $SP/flake-$label.log) problem line(s)" | tee -a $OUT; }
for i in 1 2 3 4; do run alone$i; done
N=$(nproc); : > $SP/burners.pid; for k in $(seq 1 $((N*2))); do bash -c 'while :; do :; done' & echo $! >> $SP/burners.pid; done
sleep 2
for i in 1 2 3; do run loaded$i; done
kill $(cat $SP/burners.pid) 2>/dev/null || true
echo done | tee -a $OUT
