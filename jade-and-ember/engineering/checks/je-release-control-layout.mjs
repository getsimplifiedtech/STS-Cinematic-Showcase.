// check:selftest-release-control (G6-8 Stage B). The release-control proof of concept (G6-3A) is frozen code written for the layout in which the whole engineering sits INSIDE the
// project folder: it builds its "tooling" view from the project's engineering folder alone and compares that view's engine digest with the one the verifier recorded. Since G6-8
// the engine is the verified snapshot at the repository root, so the project's own engineering folder holds only its records and project code, and that comparison can never hold.
// The proof of concept stays unchanged, and so do its 41 cases (engineering/checks/selftest-release-control.mjs, byte for byte as before the migration). This wrapper gives them the
// layout they were written for, in a throw-away copy: the snapshot's engineering is laid over the project's own engineering folder (it replaces the one-line
// re-exports that only keep relative imports working; files only the project has stay), the workflow is the one the project had before the migration, and the unchanged self-test runs there as a program.
// What this proves: the proof of concept still works against the engine that is now delivered. What it does not: the proof of concept has not been made to run in the split layout;
// that would change its frozen code, which is not part of the migration.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { coreDir } from '../lib/project.mjs';
import { engDir, isMain, projectDir, repoRoot } from '../lib/git.mjs';
import { project } from '../lib/project.mjs';

const SHIM = '// Re-export of the framework snapshot';
const SKIP = /(^|[\\/])(node_modules|\.reports|\.lighthouseci|shots|__pycache__|\.git)([\\/]|$)/;

function shims(dir, base = dir) {
  const out = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (SKIP.test(p)) continue;
    if (statSync(p).isDirectory()) out.push(...shims(p, base));
    else if (n.endsWith('.mjs') && readFileSync(p, 'utf8').startsWith(SHIM)) out.push(p);
  }
  return out;
}

export async function checkSelftestReleaseControl() {
  const problems = [], notes = [];
  const legacyWorkflow = join(engDir, 'g6-8-evidence', 'legacy-direct-workflow.yml');
  if (!existsSync(legacyWorkflow)) return { problems: ['g6-8-evidence/legacy-direct-workflow.yml is missing: the proof of concept needs the project\'s workflow of before the migration'], notes };
  const tmp = mkdtempSync(join(tmpdir(), 'je-rc-layout-'));
  try {
    const repo = join(tmp, 'repo'), proj = join(repo, 'jade-and-ember'), eng = join(proj, 'engineering');
    cpSync(projectDir, proj, { recursive: true, filter: (s) => !SKIP.test(s) });
    cpSync(coreDir, eng, { recursive: true, force: true, filter: (s) => !SKIP.test(s) });   // the engine over the project's own engineering folder; files only the project has stay
    // The proof of concept hands the verifier only the tooling it adopted (`eng`) and expects that tooling to be what the package is judged against, as the verifier of before the migration
    // did. The engine's verifier judges against the engineering that is running (`core`), which here would be the copy this wrapper made, not the adopted view. In this throw-away copy
    // only, the default of `core` is the tooling the verifier is given.
    const pkg = join(eng, 'lib', 'release-package.mjs'), text = readFileSync(pkg, 'utf8'), from = '{ eng = engDir, core = coreDir, projectRoot = null,';
    if (text.split(from).length !== 2) return { problems: ['lib/release-package.mjs no longer has the signature this wrapper adapts: the wrapper must be reviewed'], notes };
    writeFileSync(pkg, text.replace(from, '{ eng = engDir, core = eng, projectRoot = null,'));
    const left = shims(eng);
    if (left.length) problems.push(`a re-export has no engine file to replace it: ${left.map((x) => x.slice(eng.length + 1)).join(', ')}`);
    // the installed tools: the project's own, or the engine's when the tools are installed beside the snapshot (as the snapshot caller does in CI)
    const modules = existsSync(join(projectDir, 'node_modules')) ? join(projectDir, 'node_modules') : join(coreDir, 'node_modules');
    if (existsSync(modules)) symlinkSync(modules, join(proj, 'node_modules'));
    cpSync(join(repoRoot, 'docs'), join(repo, 'docs'), { recursive: true });
    const wf = join(repo, '.github', 'workflows');
    mkdirSync(wf, { recursive: true });
    cpSync(legacyWorkflow, join(wf, project.ci.workflow));
    const env = { ...process.env, STS_PROJECT_DIR: proj };
    delete env.GITHUB_REPOSITORY; delete env.STS_CORE_DIR;   // a scratch copy has no identity, as before the migration it had the project's own
    const r = spawnSync(process.execPath, [join(eng, 'checks', 'selftest-release-control.mjs')], { cwd: proj, env, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 900000 });
    const lines = (r.stdout || '').split('\n').filter(Boolean);
    for (const l of lines) { if (l.startsWith('  - ')) problems.push(l.slice(4)); else if (l.startsWith('  ')) notes.push(l.trim()); }
    if (r.status !== 0 && !problems.length) problems.push(`the unchanged self-test stopped (exit ${r.status}): ${((r.stderr || '') + (r.stdout || '')).trim().split('\n').slice(-9).join(' | ').slice(0, 900)}`);
    if (r.status === 0 && !lines.some((l) => /^PASS {2}check:selftest-release-control$/.test(l))) problems.push('the unchanged self-test did not report a pass');
    if (!notes.some((n) => /\b41 release-control cases\b/.test(n))) problems.push('the unchanged self-test did not report its 41 cases');
    notes.push('run in a reconstructed pre-migration layout (the snapshot laid over the project\'s engineering folder, the pre-migration workflow); the frozen code and its 41 cases are unchanged');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  return { problems, notes };
}

if (isMain(import.meta.url)) {
  const { problems, notes } = await checkSelftestReleaseControl();
  notes.forEach((n) => console.log('  ' + n));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:selftest-release-control`);
  process.exit(problems.length ? 1 : 0);
}
