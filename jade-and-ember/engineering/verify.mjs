// npm run verify: the Gate 1 to Gate 4 engineering checks, in order, with one summary. Exit code 0 only when every selected check passes.
//   node engineering/verify.mjs               everything: static checks, browser checks, regression against v0.8, and the self-tests
//   node engineering/verify.mjs --fast        no browser (seconds): baseline, schema, determinism, delivery, authority, contracts,
//                                             tokens, secrets, deps, ci, media, privacy, security, assets and budgets (static parts)
//   options: --no-selftest  --strict-env  --framework <dir>  --browser chromium|firefox|webkit
// Planned checks that are NOT implemented yet are listed at the end, so a green run is never read as more than it covers.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { engDir, projectDir } from './lib/git.mjs';
import { baselineLabel, coreDir, project } from './lib/project.mjs';
import { describeIn, loadEntries } from './lib/registry.mjs';
import { runEntry } from './checks/runners.mjs';
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
// What runs, in what order, is read from the registry (checks.json, the industry adapter, the project manifest): see lib/registry.mjs.
const ctx = { fast, browserName, strictEnv: has('--strict-env'), framework: arg('--framework') || process.env.STS_FRAMEWORK_DIR };
const entries = loadEntries({ coreRoot: coreDir, manifest: project.manifest, label: baselineLabel }).filter((e) => (fast ? e.tier === 'fast' : !(e.selftest && has('--no-selftest'))));
const checks = entries.map((e) => [e.id, describeIn(e, fast), () => runEntry(e, ctx)]);

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
