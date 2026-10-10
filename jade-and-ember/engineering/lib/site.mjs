// Assembling the site folders the harness compares, and the byte-level immutability rules (including the allowlist).
import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { listFiles, projectDir, readJson, repoRoot, sha256, tempDir, engDir } from './git.mjs';

export const SHARED = ['styles.css', 'site.js', 'hero.js', 'menu.js'];
export const pagesOf = (root) => readJson(join(root, 'config', 'site.json')).pages.map((p) => p.file);

// A complete, runnable site folder for the working tree: freshly built pages (never the committed ones, so stale output cannot hide a
// change), the shared assets, fonts, media and a copy of config/. This is exactly what a visitor would receive.
export function assembleCandidate(root = projectDir, label = 'candidate') {
  const dest = tempDir(label);
  for (const f of [...SHARED, 'fonts', 'media', 'config']) cpSync(join(root, f), join(dest, f), { recursive: true });
  const r = spawnSync(process.execPath, [join(root, 'build.mjs'), '--out', dest], { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`the candidate build failed:\n${r.stdout}${r.stderr}`);
  return dest;
}

export function validateAllowlist(list, approvalsText) {
  const errors = [];
  (list.entries || []).forEach((e, i) => {
    const w = `immutability-allowlist.json entry ${i} (${e.id || 'no id'})`;
    for (const k of ['id', 'file', 'reason', 'workPackage']) if (!e[k]) errors.push(`${w}: "${k}" is required`);
    if (typeof e.visual !== 'boolean') errors.push(`${w}: "visual" must be true or false`);
    if (e.visual === true && !(e.approval && new RegExp(`\\|\\s*${e.approval}\\s*\\|`).test(approvalsText))) errors.push(`${w}: a visual change needs an owner approval recorded in docs/JADE_AND_EMBER_APPROVALS.md`);
    if (!Array.isArray(e.normalize) || !e.normalize.length) errors.push(`${w}: "normalize" needs at least one { find, replace } rule`);
  });
  return errors;
}

export function loadAllowlist() {
  const list = readJson(join(engDir, 'immutability-allowlist.json'));
  const approvals = readFileSync(join(repoRoot, 'docs', 'JADE_AND_EMBER_APPROVALS.md'), 'utf8');
  return { entries: list.entries || [], errors: validateAllowlist(list, approvals) };
}

// Compares the shipped files of two site folders byte for byte. Returns { problems, allowed, compared }.
//   pages, shared scripts and styles: bytes, unless an allowlist entry normalises the candidate into the baseline
//   media/ and fonts/: the same files with the same SHA-256
//   config/: the same four files (the demonstration configuration is frozen with the design)
export function compareSources(baselineRoot, candidateRoot, allow) {
  const problems = [], allowed = [];
  let compared = 0;
  const textual = [...pagesOf(baselineRoot), ...SHARED];
  const pathsOf = (root, dir) => (existsSync(join(root, dir)) ? listFiles(join(root, dir)).map((f) => `${dir}/${f}`) : []);
  const binary = [...pathsOf(baselineRoot, 'media'), ...pathsOf(baselineRoot, 'fonts'), ...pathsOf(baselineRoot, 'config')];
  const extra = [...pathsOf(candidateRoot, 'media'), ...pathsOf(candidateRoot, 'fonts'), ...pathsOf(candidateRoot, 'config')].filter((f) => !binary.includes(f));
  extra.forEach((f) => problems.push(`${f} exists in the candidate but not in the baseline`));
  const candidatePages = pagesOf(candidateRoot);
  if (JSON.stringify(candidatePages) !== JSON.stringify(pagesOf(baselineRoot))) problems.push(`page registry differs: baseline ${pagesOf(baselineRoot)}, candidate ${candidatePages}`);

  for (const f of [...textual, ...binary]) {
    compared++;
    const bp = join(baselineRoot, f), cp = join(candidateRoot, f);
    if (!existsSync(cp)) { problems.push(`${f} is missing from the candidate`); continue; }
    const b = readFileSync(bp), c = readFileSync(cp);
    if (b.equals(c)) continue;
    const entry = allow.entries.find((e) => e.file === f || (e.file.endsWith('/*') && f.startsWith(e.file.slice(0, -1))));
    if (entry && textual.includes(f)) {
      let text = c.toString('utf8');
      for (const r of entry.normalize) text = text.replace(new RegExp(r.find, 'g'), r.replace);
      if (text === b.toString('utf8')) { allowed.push(`${f} differs only as allowed by ${entry.id} (${entry.workPackage})`); continue; }
      problems.push(`${f} differs from the baseline beyond what allowlist entry ${entry.id} permits`);
    } else problems.push(`${f} differs from the baseline (${sha256(b).slice(0, 10)}... vs ${sha256(c).slice(0, 10)}...) and no allowlist entry covers it`);
  }
  return { problems, allowed, compared };
}
