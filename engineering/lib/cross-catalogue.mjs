// Classification of every check in `npm run verify` for the cross-browser runner (Gate 5, Phase 1). The runner prints a matrix that lists ALL checks for
// the engine it ran in, so nothing is skipped silently: a check is either run in the engine, or marked not applicable with the reason. Since G6-5 the classification
// is the `scope` and `reason` of each registry entry (checks.json, the industry adapter, the project manifest): a check cannot exist without one, because the
// registry refuses an entry that has none, and check:selftest-gate5 proves that.
//   engine         browser-driven: runs in Chromium (the main job), Firefox and WebKit, with the same assertions
//   static         no browser involved (files, git, records): identical in every engine, run once in the Chromium job
//   chromium-only  cannot be run in the other engines; the reason is stated and the gap is reported, not hidden

import { baselineLabel, coreDir, project } from './project.mjs';
import { loadEntries, scopeTable } from './registry.mjs';

export const SCOPE = scopeTable(loadEntries({ coreRoot: coreDir, manifest: project.manifest, label: baselineLabel }));
export const engineChecks = () => Object.entries(SCOPE).filter(([, [s]]) => s === 'engine').map(([id]) => id);

// Renders the matrix for one engine. `results` maps a check id to { state: 'pass'|'fail'|'n/a', detail } for the checks that were run or found not applicable.
export function renderMatrix(engine, results) {
  const rows = [];
  for (const [id, [scope, reason]] of Object.entries(SCOPE)) {
    const r = results[id];
    if (scope === 'engine') rows.push(`  ${(r ? r.state === 'pass' ? 'PASS' : r.state === 'fail' ? 'FAIL' : 'N/A ' : 'MISSING').padEnd(8)}${id.padEnd(22)}${r ? r.detail || '' : 'the runner did not report this check: that is a defect in the runner'}`);
    else rows.push(`  ${'N/A'.padEnd(8)}${id.padEnd(22)}${scope === 'static' ? 'engine-independent, run in the Chromium job: ' : engine === 'chromium' ? 'runs in the main Chromium job, not in this runner: ' : 'NOT RUN in ' + engine + ': '}${reason}`);
  }
  return rows;
}
