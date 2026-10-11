// node engineering/tools/release-verify-package.mjs [folder]    (default: release/, the folder `npm run release:prepare` writes)
// Verifies a prepared release package the way a recipient would: SHA256SUMS.txt, the manifest against its schema, the manifest against the ZIP,
// the delivered files against the manifest's asset tree, search digest and CSP, the host files against the pages, and the gate verdict the
// manifest records. It reads only; it deploys nothing. A pass proves the package is internally consistent, not who made it (there is no signature).
import { resolve } from 'node:path';
import { projectDir } from '../lib/git.mjs';
import { verifyPackage } from '../lib/release-package.mjs';

const dir = resolve(process.argv[2] || `${projectDir}/release`);
const r = verifyPackage(dir);
console.log(`package: ${dir}`);
for (const c of r.checks) console.log(`  ${c.ok ? 'ok  ' : 'FAIL'}  ${c.id}: ${c.detail}`);
console.log(`package verification: ${r.ok ? 'PASSED' : 'FAILED'} (nothing was deployed or changed)`);
process.exit(r.ok ? 0 : 1);
