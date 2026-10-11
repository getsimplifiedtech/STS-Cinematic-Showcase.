// check:framework-matrix (Gate 5 Phase 8, APR-JE-036). The extraction and migration matrix is complete and current:
//   every file of the repository belongs to exactly one component; no path is stale; every component, work package, requirement and blocker reference
//   resolves; the work packages have no dependency cycle; findings RG-01 to RG-14 and every owner decision D-P3 to D-P6 in the approvals log are in the
//   register; the eight Gate 6 priorities are each assigned; and FRAMEWORK-MIGRATION-MATRIX.md equals what the data generates.
// The matrix is an assessment. This check reads the repository and writes nothing; it does not read, copy or change the framework repository.
import { readFileSync } from 'node:fs';
import { isMain } from '../lib/git.mjs';
import { approvalsText, loadMatrix, MATRIX_MD, render, repoFiles, validate } from '../lib/framework-matrix.mjs';

export function checkFrameworkMatrix() {
  const notes = [];
  const m = loadMatrix(), files = repoFiles();
  const { problems, classification } = validate(m, files, approvalsText());
  let current = null;
  try { current = readFileSync(MATRIX_MD, 'utf8'); } catch { problems.push('FRAMEWORK-MIGRATION-MATRIX.md is missing (run node engineering/tools/framework-matrix.mjs --write)'); }
  if (!problems.length && current !== render(m, classification)) problems.push('FRAMEWORK-MIGRATION-MATRIX.md is out of date: run node engineering/tools/framework-matrix.mjs --write');
  const byClass = {}; for (const c of m.components) byClass[c.class] = (byClass[c.class] || 0) + 1;
  notes.push(`${files.length} files in ${m.components.length} components (${Object.entries(byClass).map(([k, v]) => `${v} ${k}`).join(', ')}); ${m.workPackages.length} work packages in dependency order; ${m.requirements.length} registered requirements and findings; ${m.releaseBlockers.length} release blockers; the generated matrix is current`);
  return { problems, notes };
}

if (isMain(import.meta.url)) {
  const { problems, notes } = checkFrameworkMatrix();
  notes.forEach((n) => console.log('  ' + n));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:framework-matrix`);
  process.exit(problems.length ? 1 : 0);
}
