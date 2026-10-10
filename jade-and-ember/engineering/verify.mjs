// npm run verify: the Gate 1 engineering checks, in order, with one summary. Exit code 0 only when every selected check passes.
//   node engineering/verify.mjs               everything below
//   node engineering/verify.mjs --fast        no browser: baseline, schema, determinism, delivery, authority (seconds)
//   options: --no-selftest  --strict-env  --framework <dir>  --browser chromium|firefox|webkit
// Planned checks that are NOT implemented yet are listed at the end, so a green run is never read as more than it covers.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkBaseline } from './checks/baseline.mjs';
import { checkSchema } from './checks/schema.mjs';
import { checkDeterminism } from './checks/determinism.mjs';
import { checkAuthority } from './checks/authority.mjs';
import { checkDelivery } from './checks/delivery.mjs';
import { checkRegression } from './checks/regression.mjs';
import { checkSelftest } from './checks/selftest.mjs';
import { engDir } from './lib/git.mjs';

const has = (f) => process.argv.includes(f);
const arg = (n) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null; };
const fast = has('--fast');

const checks = [
  ['check:baseline', 'v0.8 baseline branch, trees, checksums, preview package', () => checkBaseline()],
  ['check:schema', 'configuration schemas and the build refusing bad configuration', () => checkSchema()],
  ['check:determinism', 'two builds, committed pages, environment independence', () => checkDeterminism()],
  ['check:delivery', 'the delivered site is self-contained and free of development tooling', () => checkDelivery()],
  ['check:authority', 'design authority and framework reference', () => checkAuthority({ framework: arg('--framework') || process.env.STS_FRAMEWORK_DIR })],
  ...(fast ? [] : [
    ['check:regression', 'candidate against the frozen v0.8 baseline (source, text, structure, styles, pixels, behaviour)', () => checkRegression({ browserName: arg('--browser') || 'chromium', strictEnv: has('--strict-env') })],
    ...(has('--no-selftest') ? [] : [['check:selftest', 'the checks fail when they should (mutation tests)', () => checkSelftest()]]),
  ]),
];

const NOT_YET = ['keyboard and focus', 'reflow, text spacing and zoom', 'accessibility-tree and forced-colours', 'performance and media budgets', 'privacy, security headers, dependencies, secrets', 'HTML validation and links', 'portability (subpath, pretty URLs, other OS)', 'release manifest and approvals', 'Firefox and WebKit runs'];

const results = [];
for (const [id, what, run] of checks) {
  const t0 = Date.now();
  console.log(`\n== ${id}: ${what}`);
  let r;
  try { r = await run(); } catch (e) { r = { problems: [`check crashed: ${e.stack || e.message}`], notes: [] }; }
  r.notes.forEach((n) => console.log('  ' + n));
  r.problems.forEach((p) => console.log('  - ' + p));
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`${r.problems.length ? 'FAIL' : 'PASS'}  ${id} (${secs} s)`);
  results.push({ id, passed: r.problems.length === 0, seconds: Number(secs), problems: r.problems, notes: r.notes });
}

console.log('\n== summary');
for (const r of results) console.log(`  ${r.passed ? 'PASS' : 'FAIL'}  ${r.id.padEnd(18)} ${String(r.seconds).padStart(6)} s${r.passed ? '' : `   ${r.problems.length} problem(s)`}`);
console.log(`\n  Not covered by Gate 1 (planned for later gates): ${NOT_YET.join('; ')}.`);
const failed = results.filter((r) => !r.passed).length;
mkdirSync(join(engDir, '.reports'), { recursive: true });
writeFileSync(join(engDir, '.reports', 'verify.json'), JSON.stringify({ mode: fast ? 'fast' : 'full', passed: failed === 0, results }, null, 2));
console.log(failed ? `\nverify FAILED (${failed} of ${results.length} checks)` : `\nverify passed (${results.length} of ${results.length} checks)`);
process.exit(failed ? 1 : 0);
