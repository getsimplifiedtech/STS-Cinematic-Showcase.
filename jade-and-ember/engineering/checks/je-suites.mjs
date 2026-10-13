// check:selftest-je-markup (G6-8 Stage B): the project's own original self-test suites, kept unchanged in this folder as je-*.mjs because they name Jade & Ember's markup,
// stylesheet, baseline and engine records. Since G6-8 the engine is the framework snapshot at the repository root; these suites run against it, exactly as they ran against
// the project's own copy. Each suite keeps its own report lines; a problem of any suite fails this check.
import { checkSelftest } from './je-selftest.mjs';
import { checkSelftestGate2 } from './je-selftest-gate2.mjs';
import { checkSelftestGate3 } from './je-selftest-gate3.mjs';
import { checkSelftestGate4 } from './je-selftest-gate4.mjs';
import { checkSelftestGate5 } from './je-selftest-gate5.mjs';
import { checkSelftestGate6 } from './je-selftest-gate6.mjs';
import { checkSelftestEvidence } from './je-selftest-evidence.mjs';
import { isMain } from '../lib/git.mjs';

export const SUITES = [
  ['check:selftest', checkSelftest], ['check:selftest-gate2', checkSelftestGate2], ['check:selftest-gate3', checkSelftestGate3], ['check:selftest-gate4', checkSelftestGate4],
  ['check:selftest-gate5', checkSelftestGate5], ['check:selftest-gate6', checkSelftestGate6], ['check:selftest-evidence', checkSelftestEvidence],
];

export async function checkJeSuites() {
  const problems = [], notes = [];
  for (const [id, run] of SUITES) {
    const t0 = Date.now();
    let r;
    try { r = await run(); } catch (e) { r = { problems: [`crashed: ${e.message}`], notes: [] }; }
    notes.push(...(r.notes || []).map((n) => `[${id}] ${n}`));
    problems.push(...(r.problems || []).map((p) => `[${id}] ${p}`));
    notes.push(`[${id}] ${r.problems?.length ? 'FAILED' : 'passed'} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  return { problems, notes };
}

if (isMain(import.meta.url)) {
  const { problems, notes } = await checkJeSuites();
  notes.forEach((n) => console.log('  ' + n));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:selftest-je-markup`);
  process.exit(problems.length ? 1 : 0);
}
