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
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isMain, projectDir } from '../lib/git.mjs';

export const SUITES = [
  ['check:selftest', checkSelftest], ['check:selftest-gate2', checkSelftestGate2], ['check:selftest-gate3', checkSelftestGate3], ['check:selftest-gate4', checkSelftestGate4],
  ['check:selftest-gate5', checkSelftestGate5], ['check:selftest-gate6', checkSelftestGate6], ['check:selftest-evidence', checkSelftestEvidence],
];

// A one-line re-export in this folder is not a program: run as a script it exits 0 and prints nothing (it is not "main"), which would make an `npm run check:...` pass silently.
// Every package.json script that runs a file of this folder must run a real file; the ones that run a framework check name ../engineering/.
export function scriptProblems(pkg = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf8')), root = projectDir) {
  const out = [];
  for (const [name, cmd] of Object.entries(pkg.scripts || {})) {
    const m = /\bnode (engineering\/[^\s"]+)/.exec(cmd);
    if (m && existsSync(join(root, m[1])) && readFileSync(join(root, m[1]), 'utf8').startsWith('// Re-export of the framework snapshot')) out.push(`package.json script ${name} runs ${m[1]}, a re-export that does nothing when run as a script: use ../${m[1]}`);
  }
  return out;
}

export async function checkJeSuites() {
  const problems = [...scriptProblems()], notes = [];
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
