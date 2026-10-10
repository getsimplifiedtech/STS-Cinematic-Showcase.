// check:regression. The candidate (this working tree, built fresh) against the frozen v0.8 baseline (git commit, exported to a temp folder).
// Options: --browser chromium|firefox|webkit  --strict-env  --only source,text,structure,styles,pixels,behaviour
// Needs a browser: set CHROMIUM_PATH, or have Playwright's Chromium installed. Reports go to engineering/.reports/ (git-ignored).
import { rmSync } from 'node:fs';
import { dirname, dirname as dn, join } from 'node:path';
import { checkBaseline } from './baseline.mjs';
import { runRegression } from '../lib/regression.mjs';
import { assembleCandidate } from '../lib/site.mjs';
import { engDir, exportBaseline, isMain, projectDir } from '../lib/git.mjs';

export async function checkRegression({ browserName = 'chromium', strictEnv = false, only = null, candidateRoot = null, log = console.log } = {}) {
  const base = checkBaseline();
  if (base.problems.length) return { problems: ['the baseline is not intact; run check:baseline', ...base.problems], notes: [] };
  const baselineExport = exportBaseline('baseline');
  const baselineRoot = baselineExport;   // <tmp>/jade-and-ember
  const cleanup = [dirname(baselineExport)];
  let candidate = candidateRoot;
  if (!candidate) { candidate = assembleCandidate(projectDir); cleanup.push(candidate); }
  try {
    const s = await runRegression({ baselineRoot, candidateRoot: candidate, browserName, strictEnv, only, reportDir: join(engDir, '.reports') });
    const problems = [...s.environment.problems], notes = [...s.environment.notes];
    for (const [name, L] of Object.entries(s.layers)) {
      L.problems.forEach((p) => problems.push(`[${name}] ${p}`));
      notes.push(`${name}: ${L.checked} comparison(s), ${L.problems.length} problem(s)${L.notes.filter((n) => !n.startsWith('scenario ok')).length ? `, ${L.notes.filter((n) => !n.startsWith('scenario ok')).length} note(s)` : ''}`);
      L.notes.filter((n) => !n.startsWith('scenario ok')).forEach((n) => notes.push(`  ${name}: ${n}`));
    }
    return { problems, notes, summary: s };
  } finally { cleanup.forEach((d) => rmSync(d, { recursive: true, force: true })); }
}

if (isMain(import.meta.url)) {
  const arg = (n) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null; };
  const t0 = Date.now();
  const { problems, notes } = await checkRegression({ browserName: arg('--browser') || 'chromium', strictEnv: process.argv.includes('--strict-env'), only: arg('--only')?.split(',') || null });
  notes.forEach((n) => console.log('  ' + n));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:regression (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  process.exit(problems.length ? 1 : 0);
}
