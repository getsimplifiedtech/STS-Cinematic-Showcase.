// npm run verify: the Gate 1 to Gate 4 engineering checks, in order, with one summary. Exit code 0 only when every selected check passes.
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
import { checkHtml } from './checks/html.mjs';
import { checkLinks } from './checks/links.mjs';
import { checkSeo } from './checks/seo.mjs';
import { checkRelease } from './checks/release.mjs';
import { checkReleaseDryRun } from './checks/release-dryrun.mjs';
import { checkFrameworkMatrix } from './checks/framework-matrix.mjs';
import { checkHosting } from './checks/hosting.mjs';
import { checkSelftestGate4 } from './checks/selftest-gate4.mjs';
import { checkPhone } from './checks/phone.mjs';
import { checkD11 } from './checks/d11.mjs';
import { checkSupports } from './checks/supports.mjs';
import { checkEvidence } from './checks/evidence.mjs';
import { checkSelftestEvidence } from './checks/selftest-evidence.mjs';
import { checkSelftestGate5 } from './checks/selftest-gate5.mjs';
import { checkSelftestGate6 } from './checks/selftest-gate6.mjs';
import { checkSelftestGate3 } from './checks/selftest-gate3.mjs';
import { checkRegression } from './checks/regression.mjs';
import { checkSelftest } from './checks/selftest.mjs';
import { engDir, projectDir } from './lib/git.mjs';
import { gitState } from './lib/release.mjs';
import { computeCandidate } from './lib/candidate.mjs';
import { buildCompositeSbom, sbomDigest, serialiseSbom } from './lib/supply.mjs';
import { buildVerificationRecord, engineDigest, expectedCheckIds, registryDigest } from './lib/verification.mjs';
import { assembleCandidate } from './lib/site.mjs';
import { rmSync } from 'node:fs';

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
  ['check:html', 'valid HTML5 and accessibility rules for the demonstration and an indexable client build', () => checkHtml()],
  ['check:links', 'every internal link, fragment, image, font and video source resolves (exact case); sitemap and canonicals agree', () => checkLinks()],
  ['check:seo', fast ? 'canonical, sitemap, robots and JSON-LD generated from client configuration (static part)' : 'canonical, sitemap, robots and JSON-LD generated from client configuration; demonstration stays noindex; hostile input; served in the browser', () => checkSeo({ browser: !fast, browserName })],
  ['check:release', 'version file, release manifest and the release gate (a client-production build needs recorded approvals and evidence)', () => checkRelease()],
  ['check:framework-matrix', 'Phase 8: the framework extraction and migration matrix classifies every file of the repository, every reference resolves, the generated Markdown is current (an assessment; nothing is extracted)', () => checkFrameworkMatrix()],
  ['check:evidence', 'human-testing paperwork: procedures equal the specification, templates are unfilled and rejected, complete records accepted, no page disables zoom', () => checkEvidence()],
  ['check:hosting', 'static-folder delivery for Cloudflare Pages: no application or vendor files, _headers within limits, no Vercel dependency', () => checkHosting()],
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
    ['check:d11', 'D-11: the engine honours the style-attribute hashes (photographs keep their crop under the headers) and blocks an unlisted inline style', () => checkD11({ browserName })],
    ['check:supports', 'The approved WebKit text-spacing correction (@supports hanging-punctuation) applies exactly where the engine supports it, as recorded, and the rule is in the stylesheet', () => checkSupports({ browserName })],
    ['check:phone', 'phone numbers readable, pressable and inside the viewport at 9 supported mobile widths (F-G4-01)', () => checkPhone({ browserName })],
    ['check:portability', 'the folder works from an extracted ZIP over file://, at a domain root, in a subdirectory, with pretty URLs, without Range', () => checkPortability({ browserName })],
    ['check:release-dryrun', 'release readiness dry run: the real release tool against a synthetic client build in a throwaway copy (success path, ~100 single blockers, package integrity and tampering, no deployment path); measures the gaps', () => checkReleaseDryRun()],
    ['check:regression', 'candidate against the frozen v0.8 baseline (source, text, structure, styles, pixels, behaviour)', () => checkRegression({ browserName, strictEnv: has('--strict-env') })],
    ...(has('--no-selftest') ? [] : [
      ['check:selftest', 'Gate 1 checks fail when they should (mutation tests)', () => checkSelftest()],
      ['check:selftest-gate2', 'Gate 2 checks fail when they should (targeted negative tests)', () => checkSelftestGate2()],
      ['check:selftest-gate3', 'Gate 3 checks fail when they should (targeted negative tests)', () => checkSelftestGate3()],
      ['check:selftest-gate5', 'the cross-browser harness cannot skip a check silently, reports engine adaptations, and D-11 detection works', () => checkSelftestGate5()],
      ['check:selftest-gate6', 'Gate 6 (G6-1): the direct Lighthouse runner, its floor and aggregation, the Node 24 baseline, the engines ranges, the retired Lighthouse CI and the pinned Actions fail when they should; the runner is driven against the real site', () => checkSelftestGate6()],
      ['check:selftest-evidence', 'the evidence validator rejects incomplete, fabricated, mismatched and wrongly classified human-testing evidence (negative tests)', () => checkSelftestEvidence()],
      ['check:selftest-gate4', 'Gate 4 checks fail when they should (HTML, links, SEO and llms.txt, crawler policy, release gate, hosting, phone numbers)', () => checkSelftestGate4()],
    ]),
  ]),
];

const NOT_YET = ['external link reachability (the online link check cannot run in the sandbox)', 'Firefox and WebKit runs inside this sandbox (their jobs run on GitHub Actions: `node engineering/cross-browser.mjs --engine firefox|webkit`)', 'portability of the tooling on Windows and macOS (a CI job reports it, informational)', 'a human screen-reader pass and real-device testing (release requirements, never automated here)'];

// What this run vouches for is fixed BEFORE any check runs and measured again after: a change to the artifact or to the verifying code while the checks are
// running would make the record untrue, so it is detected and fails the run.
const measure = () => { const site = assembleCandidate(projectDir, 'verify-candidate'); try { return { candidate: computeCandidate({ siteDir: site }), engine: engineDigest() }; } finally { rmSync(site, { recursive: true, force: true }); } };
const startedAt = new Date().toISOString();
const before = measure();
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
// The verification record (lib/verification.mjs): bound to the candidate artifact digest and the verifying code, complete for the checks this file defines, sealed.
const after = measure(), st = gitState();
const moved = before.candidate.digest !== after.candidate.digest || before.engine !== after.engine;
if (moved) console.log('\n  - the candidate artifact or the verifying code changed while the checks were running: this run does not vouch for either');
const record = buildVerificationRecord({ mode: fast ? 'fast' : 'full', results: moved ? [...results, { id: 'run:stable-inputs', passed: false, seconds: 0 }] : results, candidate: after.candidate, engine: after.engine, registry: registryDigest(expectedCheckIds()), commit: st.commit, dirty: st.dirty, startedAt, finishedAt: new Date().toISOString() });
writeFileSync(join(engDir, '.reports', 'verify.json'), JSON.stringify(record, null, 2));
// the composite SBOM is deterministic: this line must read the same on any machine for the same commit (compare a local run with the CI log)
try { const site = assembleCandidate(projectDir, 'verify-sbom'); try { const sb = buildCompositeSbom({ siteDir: site }); console.log(`\n  composite SBOM digest (reproducible; compare local and CI): ${sbomDigest(serialiseSbom(sb))}, ${sb.components.length} components`); } finally { rmSync(site, { recursive: true, force: true }); } } catch (e) { console.log(`\n  composite SBOM could not be built: ${e.message}`); }
console.log(`\n  verification record: ${record.mode} run, candidate ${record.candidate}, engine ${record.engineDigest.slice(0, 16)}…, ${record.checks.length} checks, seal ${record.seal}`);
console.log(failed || moved ? `\nverify FAILED (${failed + (moved ? 1 : 0)} of ${results.length} checks)` : `\nverify passed (${results.length} of ${results.length} checks)`);
process.exit(failed || moved ? 1 : 0);
