// Assembling the site folders the harness compares, and the byte-level immutability rules (including the allowlist).
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { listFiles, projectDir, readJson, sha256, tempDir, engDir } from './git.mjs';
import { approvalsText as readApprovals } from './approvals.mjs';
import { buildCommand, project } from './project.mjs';
import { record } from './project-records.mjs';

const D = project.delivery;
const atPath = (root, rel) => join(root, ...rel.split('/'));

// The shared scripts and styles, the asset folders and the page registry are the project's own (sts.engineering.json, delivery).
export const SHARED = [...D.sharedFiles];
// The page files in registry order. A folder without the registry (a hashed copy, an extracted package) falls back to its *.html files, sorted.
export const pagesOf = (root) => (existsSync(atPath(root, D.pages.registry)) ? readJson(atPath(root, D.pages.registry))[D.pages.list].map((p) => p[D.pages.key]) : readdirSync(root).filter((f) => f.endsWith('.html')).sort());

// The page files a visitor can receive: the registry's pages plus the host's not-found page, 404.html, when the folder has one (it is delivered and hashed like any page, but is no
// page of the registry and takes no part in navigation).
export const deliveredPagesOf = (root) => { const p = pagesOf(root); return !p.includes('404.html') && existsSync(join(root, '404.html')) ? [...p, '404.html'] : p; };

// A complete, runnable site folder for the working tree: freshly built pages (never the committed ones, so stale output cannot hide a
// change), the shared assets, the asset folders and a copy of the configuration folder. This is exactly what a visitor would receive. A project with no builder
// (delivery.build is null) is delivered as it stands: its page files are copied.
export function assembleCandidate(root = projectDir, label = 'candidate') {
  const dest = tempDir(label);
  for (const f of [...SHARED, ...D.assetFolders, D.configDir]) if (D.build || existsSync(join(root, f))) cpSync(join(root, f), join(dest, f), { recursive: true });
  if (!D.build) { for (const f of pagesOf(root)) cpSync(join(root, f), join(dest, f)); return dest; }
  const [cmd, args] = buildCommand(root, dest);
  const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`the candidate build failed:\n${r.stdout}${r.stderr}`);
  return dest;
}

export function validateAllowlist(list, approvalsText) {
  const errors = [];
  (list.entries || []).forEach((e, i) => {
    const w = `immutability-allowlist.json entry ${i} (${e.id || 'no id'})`;
    for (const k of ['id', 'file', 'reason', 'workPackage']) if (!e[k]) errors.push(`${w}: "${k}" is required`);
    if (typeof e.visual !== 'boolean') errors.push(`${w}: "visual" must be true or false`);
    if (e.visual === true && !(e.approval && new RegExp(`\\|\\s*${e.approval}\\s*\\|`).test(approvalsText))) errors.push(`${w}: a visual change needs an owner approval recorded in ${project.governance.approvalsLog}`);
    if (!Array.isArray(e.normalize) || !e.normalize.length) errors.push(`${w}: "normalize" needs at least one { find, replace } rule`);
  });
  return errors;
}

export function loadAllowlist() {
  const list = record('immutability-allowlist.json');
  return { entries: list.entries || [], errors: validateAllowlist(list, readApprovals()) };
}

// Compares the shipped files of two site folders byte for byte. Returns { problems, allowed, compared }.
//   pages, shared scripts and styles: bytes, unless an allowlist entry normalises the candidate into the baseline
//   media/ and fonts/: the same files with the same SHA-256
//   the configuration folder: the same files (the demonstration configuration is frozen with the design)
export function compareSources(baselineRoot, candidateRoot, allow) {
  const problems = [], allowed = [];
  let compared = 0;
  const textual = [...pagesOf(baselineRoot), ...SHARED];
  const pathsOf = (root, dir) => (existsSync(join(root, dir)) ? listFiles(join(root, dir)).map((f) => `${dir}/${f}`) : []);
  const folders = [...D.assetFolders, D.configDir];
  const binary = folders.flatMap((d) => pathsOf(baselineRoot, d));
  const extra = folders.flatMap((d) => pathsOf(candidateRoot, d)).filter((f) => !binary.includes(f));
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
