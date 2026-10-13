// Helpers shared by the checks: repository paths, git, the frozen baseline export, and a few small utilities. No dependencies.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, mkdtempSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { project } from './project.mjs';

// Where the project is: read from its manifest (lib/project.mjs), not from the position of this file. projectDir is the project root, engDir the folder of its
// records and policies, repoRoot the repository root.
export const projectDir = project.root;
export const engDir = project.engDir;
export const repoRoot = project.repoRoot;
// True when the module is being run directly (node file.mjs) rather than imported. Works on every platform.
export const isMain = (metaUrl) => Boolean(process.argv[1]) && pathToFileURL(resolve(process.argv[1])).href === metaUrl;
export const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
export const baselineRecord = () => {
  if (!project.baseline) throw new Error(`${project.name} declares no baseline (sts.engineering.json: baseline)`);
  return readJson(join(engDir, project.baseline.record));
};
export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
export const tempDir = (label) => mkdtempSync(join(tmpdir(), `je-${label}-`));

export const git = (args, opts = {}) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
export const gitBuffer = (args) => execFileSync('git', args, { cwd: repoRoot, maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] });

// All files under a directory, as sorted POSIX-style relative paths.
export function listFiles(root, skip = () => false) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (skip(relative(root, p).split('\\').join('/'))) continue;
      if (statSync(p).isDirectory()) walk(p); else out.push(relative(root, p).split('\\').join('/'));
    }
  };
  if (existsSync(root) && statSync(root).isDirectory()) walk(root);
  return out;
}

// Resolves the baseline ref to a commit. Order: local branch, then origin's remote-tracking branch.
export function resolveBaseline(rec = baselineRecord()) {
  for (const ref of [`refs/heads/${rec.branch}`, `refs/remotes/origin/${rec.branch}`]) {
    try { return { ref, commit: git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]) }; } catch { /* try the next */ }
  }
  return { ref: null, commit: null };
}

// Exports the baseline's project folder (the git tree at the recorded commit, not the branch tip) into a fresh temp folder and returns its path.
// Reads blobs with `git cat-file`, so it never touches the working tree, the index or the baseline branch, and needs no tar.
export function exportBaseline(label = 'baseline') {
  const rec = baselineRecord();
  const dest = tempDir(label);
  const paths = git(['ls-tree', '-r', '-z', '--name-only', rec.commit, rec.projectPath]).split('\0').filter(Boolean);
  for (const p of paths) {
    const target = join(dest, p);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, gitBuffer(['cat-file', 'blob', `${rec.commit}:${p}`]));
  }
  return join(dest, rec.projectPath);
}
