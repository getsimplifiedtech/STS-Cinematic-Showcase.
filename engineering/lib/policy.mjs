// Base standards and the overlay rule (specification 16, section 5). A standard is a rule set that names no project: engineering/standards/<name>.json. A project may carry a file of
// the same name in its engineering folder, an OVERLAY. The overlay is accepted only if it can add what the standard delegates and tighten what the standard lets it tighten;
// anything the standard does not declare is frozen. The accepted overlay is what the checks use; a refused one makes the check fail with the offending path named.
//
// A standard declares its overlay rules in a "$overlay" block:
//   delegated      { "path": { "type": "array|object|string|number|boolean", "floor": "nonEmpty|array|coversPages" } }  paths the project supplies (a floor is the least it must supply)
//   additive       ["path"]    arrays (deny-lists) the project may add entries to; every entry of the standard must remain
//   keyed          { "path": "field" }  an additive array of objects whose entries are matched by one field (the rest of an entry is the project's own account of it)
//   stricterUp     ["path"]    numbers the project may only raise
//   stricterDown   ["path"]    numbers the project may only lower
//   documentation  ["path"]    text that explains and is never read by a check; may differ ("*" matches one path segment). Every key starting with $comment is documentation.
// Paths are dotted. Arrays are leaves.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { coreDir, project } from './project.mjs';

export class PolicyError extends Error {}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const kind = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const matchPath = (pattern, path) => { const p = pattern.split('.'), q = path.split('.'); return p.length === q.length && p.every((s, i) => s === '*' || s === q[i]); };
const under = (patterns, path) => patterns.some((pt) => { const p = pt.split('.'), q = path.split('.'); return q.length >= p.length && p.every((s, i) => s === '*' || s === q[i]); });
const isComment = (path) => String(path.split('.').at(-1)).startsWith('$comment');
const hit = (patterns, path) => patterns.some((pt) => matchPath(pt, path));

// Returns the list of problems with an overlay against a standard (empty when it is acceptable). `pages` (delivered page files) is needed only by the coversPages floor.
export function overlayProblems(base, overlay, { pages = null } = {}) {
  const rules = base.$overlay || {};
  const keyed = rules.keyed || {};
  const delegated = rules.delegated || {}, additive = rules.additive || [], up = rules.stricterUp || [], down = rules.stricterDown || [], docs = rules.documentation || [];
  const problems = [];
  const bad = (path, m) => problems.push(`${path || '(root)'}: ${m}`);
  const floor = (path, v, spec) => {
    if (kind(v) !== spec.type) return bad(path, `a ${spec.type} is required, found ${kind(v)}`);
    if (spec.floor === 'nonEmpty' && (Array.isArray(v) ? !v.length : isObj(v) ? !Object.keys(v).length : v === '' || v === null)) bad(path, 'must not be empty');
    if (spec.floor === 'coversPages' && Array.isArray(v) && pages) { const miss = pages.filter((p) => !v.includes(p)); if (miss.length) bad(path, `must cover every delivered page (missing ${miss.slice(0, 3).join(', ')})`); }
  };
  const walk = (b, o, path) => {
    if (path && (isComment(path) || under(docs, path))) return;
    const d = Object.entries(delegated).find(([p]) => matchPath(p, path));
    if (d) return floor(path, o, d[1]);
    if (kind(b) !== kind(o)) return bad(path, `the type changes from ${kind(b)} to ${kind(o)}`);
    if (isObj(b)) {
      for (const k of Object.keys(b)) { if (k === '$overlay') continue; const p = path ? `${path}.${k}` : k; if (!(k in o)) { if (!isComment(p) && !under(docs, p) && !Object.keys(delegated).some((dp) => matchPath(dp, p))) bad(p, 'removes a key of the standard'); } else walk(b[k], o[k], p); }
      for (const k of Object.keys(o)) { if (k === '$overlay') continue; const p = path ? `${path}.${k}` : k; if (!(k in b) && !isComment(p) && !under(docs, p) && !Object.keys(delegated).some((dp) => matchPath(dp, p))) bad(p, 'adds a key the standard does not declare as delegated'); }
    } else if (Array.isArray(b)) {
      if (keyed[path]) { const k = keyed[path]; for (const item of b) if (!o.some((x) => isObj(x) && x[k] === item[k])) bad(path, `removes the entry with ${k} ${JSON.stringify(item[k])} of the standard`); } else if (hit(additive, path)) { for (const item of b) if (!o.some((x) => same(x, item))) bad(path, `removes the entry ${JSON.stringify(item).slice(0, 60)} of the standard`); } else if (!same(b, o)) bad(path, 'differs from the standard, which freezes it');
    } else if (!same(b, o)) {
      if (hit(up, path) && typeof b === 'number' && typeof o === 'number') { if (o < b) bad(path, `${o} is below the standard's ${b} (it may only be raised)`); } else if (hit(down, path) && typeof b === 'number' && typeof o === 'number') { if (o > b) bad(path, `${o} is above the standard's ${b} (it may only be lowered)`); } else bad(path, `${JSON.stringify(o)} differs from the standard's ${JSON.stringify(b)}, which freezes it`);
    }
  };
  walk(base, overlay, '');
  // a delegated path the project did not supply still has to meet its floor (the standard's own value stands in)
  for (const [p, spec] of Object.entries(delegated)) {
    if (p.includes('*')) continue;
    const get = (o) => p.split('.').reduce((x, k) => (x === undefined || x === null ? undefined : x[k]), o);
    if (get(overlay) === undefined) { const v = get(base); if (v === undefined) bad(p, 'the project must supply it'); else floor(p, v, spec); }
  }
  return problems;
}

// The release manifest schema is a framework template: the project id replaces {project} in its identifiers (schemaId in lib/project.mjs).
export const releaseManifestSchema = () => JSON.parse(readFileSync(join(coreDir, 'release', 'release-manifest.schema.json'), 'utf8').replaceAll('{project}', project.id));

const strip = (v) => (Array.isArray(v) ? v.map(strip) : isObj(v) ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== '$overlay').map(([k, x]) => [k, strip(x)])) : v);

export const standardFile = (name, core = coreDir) => join(core, 'standards', `${name}.json`);
// The file whose bytes stand for a policy in a fingerprint: the project's overlay when it has one (in the engineering folder eng), otherwise the framework standard itself. Where the
// engineering folder is the project's own (eng), a sandbox copy of it can be judged too.
export const policyFile = (name, eng = project.engDir, core = coreDir) => { const o = join(eng, `${name}.json`); return existsSync(o) ? o : standardFile(name, core); };
// The accepted policy of a given engineering folder (eng), see policy().
export const policyIn = (name, eng = project.engDir, opts = {}) => policy(name, { ...opts, overlayPath: join(eng, `${name}.json`) });   // opts.core: the engineering's code folder, when it is not the running one

// The accepted standard for the running project: the overlay when the project has one, otherwise the standard itself. Throws PolicyError (a clear failure, never a crash).
export function policy(name, { overlayPath = null, pages = null, core = coreDir } = {}) {
  const sf = standardFile(name, core);
  if (!existsSync(sf)) throw new PolicyError(`the engineering has no standard "${name}" (standards/${name}.json)`);
  const base = JSON.parse(readFileSync(sf, 'utf8'));
  const of = overlayPath || join(project.engDir, `${name}.json`);
  if (!existsSync(of)) {
    const missing = overlayProblems(base, base, { pages });
    // a standard with a delegated path that has no usable default needs the project to supply it
    if (missing.length) throw new PolicyError(`${project.name} supplies no ${name}.json overlay and the standard ${name} needs it: ${missing.slice(0, 3).join('; ')}`);
    return strip(base);
  }
  const overlay = JSON.parse(readFileSync(of, 'utf8'));
  const problems = overlayProblems(base, overlay, { pages });
  if (problems.length) throw new PolicyError(`${project.name}'s ${name}.json is not an acceptable overlay of the standard ${name}: ${problems.slice(0, 4).join('; ')}${problems.length > 4 ? ` (and ${problems.length - 4} more)` : ''}`);
  // a delegated path the overlay leaves out takes the standard's own value
  const out = strip(overlay);
  for (const p of Object.keys(base.$overlay?.delegated || {})) {
    if (p.includes('*')) continue;
    const ks = p.split('.');
    let x = out, y = base;
    for (let i = 0; i < ks.length - 1; i++) { y = y?.[ks[i]]; if (x[ks[i]] === undefined) x[ks[i]] = {}; x = x[ks[i]]; }
    if (x[ks.at(-1)] === undefined && y?.[ks.at(-1)] !== undefined) x[ks.at(-1)] = strip(y[ks.at(-1)]);
  }
  return out;
}
