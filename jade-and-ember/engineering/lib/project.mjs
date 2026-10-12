// The project this engineering verifies (G6-5, APR-JE-046). One manifest per project, sts.engineering.json at the project root, holds every fact the reusable
// engineering needs about that project as a VALUE: where its records live, how its governance records are numbered, which files the delivered folder shares,
// how its page list and its baseline are found, which project-specific checks it adds. The reusable code reads this module and nowhere hard-codes a project name,
// a path outside the manifest, or a record prefix (check:project enforces that for the components the matrix classes as reusable).
//
// Which project: STS_PROJECT_DIR if set; else the project that contains this code (the layout of today's repository); else the nearest folder above the working
// folder that holds an sts.engineering.json. With the generic fixture, STS_PROJECT_DIR=engineering/fixtures/generic runs the same code against another project.
//
// The manifest can declare facts and ADD checks. It has no key that removes, skips or weakens a check of the base engineering, and the schema rejects unknown keys:
// the same Base Engineering Framework serves every website offering (OP-2). It names no aesthetic value: the creative authority is pinned by reference only.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSchema } from './schema.mjs';
import { parseStrictJson } from './strict-json.mjs';

export const MANIFEST_FILE = 'sts.engineering.json';
// the folder that holds lib/ (the reusable code's own place); its resources (schemas, adapters, provider facts) belong to the engineering, not to a project
export const coreDir = join(dirname(fileURLToPath(import.meta.url)), '..');

export function findProjectRoot(env = process.env, cwd = process.cwd()) {
  if (env.STS_PROJECT_DIR) return resolve(env.STS_PROJECT_DIR);
  const legacy = join(coreDir, '..');
  if (existsSync(join(legacy, MANIFEST_FILE))) return legacy;
  for (let d = resolve(cwd); ; d = dirname(d)) {
    if (existsSync(join(d, MANIFEST_FILE))) return d;
    if (dirname(d) === d) break;
  }
  throw new Error(`no ${MANIFEST_FILE} found: set STS_PROJECT_DIR, or run from inside a project that has one`);
}

export const manifestSchema = () => JSON.parse(readFileSync(join(coreDir, 'schemas', 'sts-engineering.schema.json'), 'utf8'));

// Reads and validates a manifest; returns the project object. Throws one Error that lists every problem.
export function loadProject(root = findProjectRoot()) {
  const file = join(root, MANIFEST_FILE);
  if (!existsSync(file)) throw new Error(`${file}: the project has no ${MANIFEST_FILE}`);
  let manifest;
  try { manifest = parseStrictJson(readFileSync(file, 'utf8')); } catch (e) { throw new Error(`${file}: ${e.message}`); }
  const errors = validateSchema(manifest, manifestSchema(), MANIFEST_FILE);
  if (errors.length) throw new Error(`${file} is not a valid project manifest:\n  ${errors.join('\n  ')}`);
  const engDir = resolve(root, manifest.paths.engineering);
  const repoRoot = resolve(root, manifest.paths.repositoryRoot);
  return Object.freeze({
    root: resolve(root), manifestPath: file, manifest,
    id: manifest.project.id, name: manifest.project.name, offering: manifest.offering ?? null,
    engDir, repoRoot,
    governance: Object.freeze({ ...manifest.governance, approvalsPath: join(repoRoot, manifest.governance.approvalsLog) }),
    ci: manifest.ci,
    delivery: manifest.delivery,
    baseline: manifest.baseline ?? null,
    creativeAuthority: manifest.creativeAuthority,
    projectChecks: manifest.checks.project,
  });
}

export const project = loadProject();

// Identifiers the project's records carry. The schema id of every record the engineering writes is namespaced by the project id (jade-and-ember/candidate@1), and the
// release records are numbered with the project's suffix (REL-JE-001). For Jade & Ember the values are the ones the records have always had.
export const schemaId = (name) => `${project.id}/${name}`;
export const recordPrefix = (kind) => `${kind}-${project.governance.recordIdSuffix}`;
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const approvalIdRe = () => new RegExp(`^${esc(project.governance.approvalIdPrefix)}-\\d+$`);
export const demonstrationIdRe = () => new RegExp(`^${esc(project.governance.demonstrationIdPrefix)}-\\d{3,}$`);
