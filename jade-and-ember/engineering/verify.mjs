// npm run verify: the Gate 1 and Gate 2 engineering checks, in order, with one summary. Exit code 0 only when every selected check passes.
//   node engineering/verify.mjs               everything: static checks, browser checks, regression against v0.8, and the self-tests
//   node engineering/verify.mjs --fast        no browser (seconds): baseline, schema, determinism, delivery, authority, contracts,
//                                             tokens, secrets, deps, ci, media, privacy, security, assets and budgets (static parts)
//   options: --no-selftest  --strict-env  --framework <dir>  --browser chromium|firefox|webkit
// Planned checks that are NOT implemented yet are listed at the end, so a green run is never read as more than it covers.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkBaseline } from './checks/baseline.mjs';
import { checkSchema } from './checks/schema.mjs';
import { checkDeterminism } from './checks/determinism.mjs';
import { checkAuthority } from './checks/authority.mjs';
import { checkDelivery } from './checks/delivery.mjs';
import { checkContracts } from './checks/contracts.mjs';
import { checkMedia } from './checks/media.mjs';
import { checkBudgets } from './checks/budgets.mjs';
import { checkKeyboard } from './checks/keyboard.mjs';
import { checkReflow } from './checks/reflow.mjs';
import { checkForcedColors } from './checks/forced-colors.mjs';
import { checkA11yTree } from './checks/a11y-tree.mjs';
import { checkOrder } from './checks/order.mjs';
import { checkSelftestGate2 } from './checks/selftest-gate2.mjs';
import { checkSecurity } from './checks/security.mjs';
import { checkPrivacy } from './checks/privacy.mjs';
import { checkDeps } from './checks/deps.mjs';
import { checkSecrets } from './checks/secrets.mjs';
import { checkTokens } from './checks/tokens.mjs';
import { checkAssets } from './checks/assets.mjs';
import { checkPortability } from './checks/portability.mjs';
import { checkCi } from './checks/ci.mjs';
import { checkSelftestGate3 } from './checks/selftest-gate3.mjs';
import { checkRegression } from './checks/regression.mjs';
import { checkSelftest } from './checks/selftest.mjs';
import { engDir } from './lib/git.mjs';

const has = (f) => process.argv.includes(f);
const arg = (n) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null; };
const fast = has('--fast');

const browserName = arg('--browser') || 'chromium';
const checks = [
  ['check:baseline', 'v0.8 baseline branch, trees, checksums, preview package', () => checkBaseline()],
  ['check:schema', 'configuration schemas and the build refusing bad configuration', () => checkSchema()],
  ['check:determinism', 'two builds, committed pages, environment independence', () => checkDeterminism()],
  ['check:delivery', 'the delivered site is self-contained and free of development tooling', () => checkDelivery()],
  ['check:authority', 'design authority and framework reference', () => checkAuthority({ framework: arg('--framework') || process.env.STS_FRAMEWORK_DIR })],
  ['check:contracts', 'component and page-renderer contracts (interface, markup, escaping, purity)', () => checkContracts()],
  ['check:media', fast ? 'media formats, dimensions, alt text, loading, provenance (static part)' : 'media formats, dimensions, alt text, loading, provenance, flashing, reduced motion and Pause', () => checkMedia({ browser: !fast, browserName })],
  ['check:tokens', 'design tokens: frozen v0.8 values, defined and used, contrast pairs (structure only)', () => checkTokens()],
  ['check:secrets', 'no credentials in the working tree or the history', () => checkSecrets()],
  ['check:deps', 'dependency pinning, lockfile integrity, licences, npm audit', () => checkDeps()],
  ['check:ci', 'the GitHub Actions workflow is read-only and keeps its promises', () => checkCi()],
  ['check:privacy', fast ? 'no storage, cookies, third parties or fingerprinting (static part)' : 'no storage, cookies, third parties or fingerprinting (static and in the browser)', () => checkPrivacy({ browser: !fast, browserName })],
  ['check:security', fast ? 'security headers and Content Security Policy (static part)' : 'security headers and CSP: generated, enforced in the browser, probed, and identical to v0.8 under the headers', () => checkSecurity({ browser: !fast, browserName })],
  ['check:assets', fast ? 'asset manifest and hashed copy (static part)' : 'asset manifest, content-hashed copy equal to v0.8 in the browser', () => checkAssets({ browser: !fast, browserName })],
  ['check:budgets', fast ? 'page-weight budgets and growth against v0.8 (static part)' : 'page-weight budgets, growth against v0.8, Core Web Vitals under throttling', () => checkBudgets({ browser: !fast, browserName })],
  ...(fast ? [] : [
    ['check:keyboard', 'Tab order, focus visibility, skip link, phone menu, target sizes (real key presses)', () => checkKeyboard({ browserName })],
    ['check:reflow', '320 px reflow, 200 percent zoom, text spacing', () => checkReflow({ browserName })],
    ['check:forced-colors', 'text and controls in forced-colours emulation', () => checkForcedColors({ browserName })],
    ['check:a11y-tree', 'landmarks, headings, names, ARIA references in the accessibility tree', () => checkA11yTree({ browserName })],
    ['check:order', 'DOM order against visual reading order', () => checkOrder({ browserName })],
    ['check:portability', 'the folder works from an extracted ZIP over file://, at a domain root, in a subdirectory, with pretty URLs, without Range', () => checkPortability({ browserName })],
    ['check:regression', 'candidate against the frozen v0.8 baseline (source, text, structure, styles, pixels, behaviour)', () => checkRegression({ browserName, strictEnv: has('--strict-env') })],
    ...(has('--no-selftest') ? [] : [
      ['check:selftest', 'Gate 1 checks fail when they should (mutation tests)', () => checkSelftest()],
      ['check:selftest-gate2', 'Gate 2 checks fail when they should (targeted negative tests)', () => checkSelftestGate2()],
      ['check:selftest-gate3', 'Gate 3 checks fail when they should (targeted negative tests)', () => checkSelftestGate3()],
    ]),
  ]),
];

const NOT_YET = ['HTML validation and link checks', 'release manifest, version file and approvals gate', 'SEO files (production, from client configuration)', 'Firefox and WebKit runs (not installed here)', 'portability of the tooling on Windows and macOS (a CI job reports it, informational)', 'a human screen-reader pass and real-device testing (release requirements, never automated here)'];

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
console.log(`\n  Not covered yet (planned for later gates, or manual): ${NOT_YET.join('; ')}.`);
const failed = results.filter((r) => !r.passed).length;
mkdirSync(join(engDir, '.reports'), { recursive: true });
writeFileSync(join(engDir, '.reports', 'verify.json'), JSON.stringify({ mode: fast ? 'fast' : 'full', passed: failed === 0, results }, null, 2));
console.log(failed ? `\nverify FAILED (${failed} of ${results.length} checks)` : `\nverify passed (${results.length} of ${results.length} checks)`);
process.exit(failed ? 1 : 0);
