// What the framework repository alone is excused, and which repository a tree belongs to (G6-7, G6-8 Stage A; specification 16, sections 10.8 and 10.9). The exceptions live in
// the framework's own ci/exceptions.json, which is NOT part of a consumer's public snapshot: without the file a consumer has no exception at all, which is the safe default.
// An exception applies only when the repository identity equals the one the file names. A project's manifest cannot add one.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { coreDir, project } from './project.mjs';

// The repository this tree belongs to, as owner/name: GITHUB_REPOSITORY in Actions, else the origin remote (anchored to github.com); null when it cannot be told (a scratch copy).
export function repositoryIdentity(root = project.repoRoot, env = process.env) {
  if (env.GITHUB_REPOSITORY) return env.GITHUB_REPOSITORY;
  try { const url = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); const m = /^(?:https:\/\/(?:[^@/]+@)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(url); return m ? m[1] : null; } catch { return null; }
}
export const exceptionsFile = (file = join(coreDir, 'ci', 'exceptions.json')) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { otherWorkflows: [], secretsAllowances: [] });
const scoped = (identity, e, key) => (identity && e.scope?.repository === identity ? e[key] || [] : []);
// Workflows the framework repository carries on purpose that are not part of the engineering's CI.
export const exceptionsFor = (identity, file) => scoped(identity, exceptionsFile(file), 'otherWorkflows');
// Credential-shaped test values in vendored third-party tests, each bound to the file's SHA-256 and the number of findings (same entries as secrets-allow.json).
export const secretsAllowancesFor = (identity, file) => scoped(identity, exceptionsFile(file), 'secretsAllowances');
// Whether the direct style of workflow (the jobs written out in the file) is accepted for this repository: only those the framework's file lists. A repository whose identity cannot be
// told (a scratch copy) is judged, not refused.
export function directStyleAllowed(identity, file) {
  return !identity || (exceptionsFile(file).directStyleRepositories || []).includes(identity);
}
