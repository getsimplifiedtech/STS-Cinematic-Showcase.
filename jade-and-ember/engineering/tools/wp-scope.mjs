// node engineering/tools/wp-scope.mjs <work package>   (npm run gate6:scope -- G6-1)
// Prints the authorised repository, branch and files of a Gate 6 work package and verifies that nothing outside them changed since its base commit.
// Read only. Exit 0 when every changed file is inside the scope and none is denied.
import { verifyScope } from '../lib/wp-scope.mjs';

const id = process.argv[2] || 'G6-1';
const r = verifyScope(id);
console.log(`${id}: repository ${r.scope.repository}, branch ${r.scope.branch}, base commit ${r.scope.baseCommit}`);
console.log(`  authorised by ${r.scope.authorisedBy}; ${r.scope.allow.length} allowed paths, ${r.scope.deny.length} denied paths`);
console.log(`  files changed since the base commit: ${r.changed.length}`);
for (const f of r.changed) console.log(`    ${r.problems.some((p) => p.startsWith(`${f}:`)) ? 'OUT ' : 'ok  '} ${f}`);
r.problems.forEach((p) => console.log(`  - ${p}`));
console.log(`${id} scope: ${r.ok ? 'every change is inside the authorised scope' : 'VIOLATIONS'}`);
process.exit(r.ok ? 0 : 1);
