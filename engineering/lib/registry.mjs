// The check registry (G6-5, APR-JE-046). What `npm run verify` runs, in what order, in which engines and what each check needs from a project is DATA, not code:
//   checks.json                                   the base engineering's checks, in report order
//   adapters/industry/<industry>/adapter.json     the checks an industry adds (for example the restaurant configuration schemas and component contracts)
//   sts.engineering.json  checks.project          the checks one project adds (the project-check extension point)
// An entry from the adapter or the project names the check it follows (`after`), so the merged list is exactly the order the report has always had. This module is
// pure and synchronous (no check is imported here): the verification record's expected check list, the cross-browser matrix and the runner all read the same list.
// A manifest can ADD checks. It cannot remove, reorder or relax one: the base list is not an input of the manifest.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseStrictJson } from './strict-json.mjs';

export const SCOPES = ['static', 'engine', 'chromium-only'];
export const TIERS = ['fast', 'full'];
const NEEDS = new Set(['baseline', 'builder', 'industry', 'generator:seo', 'generator:crawlers', 'generator:config']);

const read = (p) => parseStrictJson(readFileSync(p, 'utf8'));
const fill = (t, label) => (typeof t === 'string' ? t.replace(/\{baseline\}/g, label) : t);

// Which capabilities a project has, for the `needs` of an entry.
export const capabilitiesOf = (manifest) => new Set([
  manifest.baseline && 'baseline', manifest.delivery.build && 'builder', 'industry',
  ...['seo', 'crawlers', 'config'].filter((g) => manifest.generators[g]).map((g) => `generator:${g}`),
].filter(Boolean));

export function entryProblems(e, where = 'entry') {
  const p = [], bad = (m) => p.push(`${where} ${e && e.id}: ${m}`);
  if (!e || typeof e !== 'object') return [`${where}: not an object`];
  if (!/^check:[a-z0-9-]+$/.test(e.id || '')) bad('id must look like check:name');
  if (!TIERS.includes(e.tier)) bad(`tier must be one of ${TIERS.join(', ')}`);
  if (!SCOPES.includes(e.scope)) bad(`scope must be one of ${SCOPES.join(', ')} (every check is classified for the cross-browser matrix)`);
  if (e.scope !== 'engine' && String(e.reason || '').length < 25) bad('a check that does not run in every engine states a real reason');
  const d = e.describe;
  if (!(typeof d === 'string' && d.length > 0) && !(d && typeof d === 'object' && typeof d.fast === 'string' && typeof d.full === 'string')) bad('describe must be a text or { fast, full }');
  for (const n of e.needs || []) if (!NEEDS.has(n)) bad(`unknown need "${n}"`);
  // only the framework can make a check waivable (specification 16, 5.3): an industry adapter or a project entry may not
  if (e.waivable !== undefined && typeof e.waivable !== 'boolean') bad('waivable must be true or false');
  if (e.waivable === true && where !== 'core') bad('only a framework check can be waivable; findings never excuse a check an adapter or a project adds');
  if (e.neverWaivable !== undefined && (!Array.isArray(e.neverWaivable) || !e.neverWaivable.length || e.neverWaivable.some((x) => typeof x !== 'string' || !x))) bad('neverWaivable must be a non-empty list of key patterns');
  if (e.neverWaivable !== undefined && e.waivable !== true) bad('neverWaivable only narrows a waivable check');
  return p;
}

// The ordered entries for one project. Throws one Error listing every problem.
export function loadEntries({ coreRoot, manifest, label = 'baseline' }) {
  const problems = [];
  const core = read(join(coreRoot, 'checks.json')).checks.map((e) => ({ ...e, owner: 'core' }));
  const extra = [];
  {
    const id = manifest.industry ?? 'local-business';
    const f = join(coreRoot, 'adapters', 'industry', id, 'adapter.json');
    if (!existsSync(f)) problems.push(`industry adapter "${id}" has no ${f}`);
    else for (const e of read(f).checks || []) extra.push({ ...e, owner: 'industry', base: coreRoot });
  }
  for (const e of manifest.checks.project) extra.push({ ...e, owner: 'project', base: null });
  const list = [...core];
  const lastAfter = new Map();   // anchor -> the check last placed after it, so two checks with one anchor keep the order they were declared in
  for (const e of extra) {
    if (typeof e.after !== 'string') { problems.push(`${e.owner} check ${e.id}: it must name the check it follows (after); a check cannot be placed before the base checks`); continue; }
    const at = list.findIndex((x) => x.id === (lastAfter.get(e.after) || e.after));
    if (list.findIndex((x) => x.id === e.after) < 0) { problems.push(`${e.owner} check ${e.id}: it follows ${e.after}, which is not in the registry at that point`); continue; }
    list.splice(at + 1, 0, e);
    lastAfter.set(e.after, e.id);
  }
  const ids = list.map((e) => e.id);
  for (const id of new Set(ids.filter((x, i) => ids.indexOf(x) !== i))) problems.push(`check ${id} is listed twice`);
  for (const e of list) problems.push(...entryProblems(e, e.owner));
  if (problems.length) throw new Error(`the check registry is not valid:\n  ${problems.join('\n  ')}`);
  return list.map((e) => ({ ...e, reason: fill(e.reason, label), describe: typeof e.describe === 'string' ? fill(e.describe, label) : { fast: fill(e.describe.fast, label), full: fill(e.describe.full, label) }, needs: e.needs || [] }));
}

// Every check id a full run must contain, sorted (the verification record lists them all).
export const registryIds = (opts) => [...new Set(loadEntries(opts).map((e) => e.id))].sort();

// The text a check is announced with in the given mode.
export const describeIn = (e, fast) => (typeof e.describe === 'string' ? e.describe : fast ? e.describe.fast : e.describe.full);

// The scope table the cross-browser matrix prints: id -> [scope, reason]
export const scopeTable = (entries) => Object.fromEntries(entries.map((e) => [e.id, [e.scope, e.reason || '']]));

// Which needs a project does not meet; an unmet need makes the check not applicable (reported, never silent).
export const unmetNeeds = (e, manifest) => { const have = capabilitiesOf(manifest); return (e.needs || []).filter((n) => !have.has(n)); };
