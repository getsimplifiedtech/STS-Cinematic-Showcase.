// The authorised scope of a Gate 6 work package (G6-1 onward): the repository, the branch and the exact files a package may change, recorded in
// framework-migration-matrix.json before any editing, and a read-only verifier that compares them with what git says changed since the package's base
// commit. A file outside the scope, or inside the denied list, is a violation. It authorises nothing: the owner's written authorisation does.
import { execFileSync } from 'node:child_process';
import { repoRoot } from './git.mjs';
import { loadMatrix } from './framework-matrix.mjs';

const git = (args) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 1 << 26 }).trim();
export const matches = (pattern, file) => (pattern.endsWith('/') ? file.startsWith(pattern) : file === pattern);

export function scopeOf(id, matrix = loadMatrix()) {
  const wp = matrix.workPackages.find((w) => w.id === id);
  if (!wp) throw new Error(`no work package ${id}`);
  if (!wp.scope) throw new Error(`${id} has no recorded scope (it is not authorised to start)`);
  return { wp, scope: wp.scope };
}

// every path that differs between the base commit and the working tree (committed, staged, modified, new and deleted)
export function changedFiles(base) {
  const lines = (s) => s.split('\n').filter(Boolean);
  return [...new Set([...lines(git(['diff', '--name-only', base, 'HEAD'])), ...lines(git(['diff', '--name-only', 'HEAD'])), ...lines(git(['ls-files', '-o', '--exclude-standard']))])].sort();
}

export function verifyScope(id, { files = null, matrix = loadMatrix() } = {}) {
  const { scope } = scopeOf(id, matrix);
  const changed = files || changedFiles(scope.baseCommit);
  const denied = changed.filter((f) => scope.deny.some((d) => matches(d, f)));
  const outside = changed.filter((f) => !denied.includes(f) && !scope.allow.some((a) => matches(a, f)));
  const head = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const problems = [];
  if (head !== scope.branch) problems.push(`on branch ${head}, the authorised branch is ${scope.branch}`);
  for (const f of denied) problems.push(`${f}: explicitly denied for ${id}`);
  for (const f of outside) problems.push(`${f}: outside the authorised scope of ${id}`);
  return { scope, changed, problems, ok: !problems.length };
}
