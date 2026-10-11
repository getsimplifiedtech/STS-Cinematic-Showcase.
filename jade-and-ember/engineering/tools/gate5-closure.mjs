// node engineering/tools/gate5-closure.mjs   (npm run gate5:closure)
// Verifies the six conditions the owner set for Gate 5 closure (Phase 9, APR-JE-037) against the approvals log, git, CI.md, the migration matrix and the
// release gate. Read only; no network; deploys, merges and approves nothing. Exit 0 when the record supports closure, 1 otherwise.
import { verifyClosure } from '../lib/gate5-closure.mjs';

const { rows, ok } = verifyClosure();
for (const r of rows) {
  if (r.section) console.log(`\n${r.section}`);
  else console.log(`  ${r.ok ? 'ok  ' : 'FAIL'}  ${r.id}: ${r.detail}`);
}
console.log(`\ngate 5 closure record: ${ok ? 'SUPPORTS closure (the owner closes Gate 5; this verifies, it does not approve)' : 'DOES NOT SUPPORT closure'}`);
process.exit(ok ? 0 : 1);
