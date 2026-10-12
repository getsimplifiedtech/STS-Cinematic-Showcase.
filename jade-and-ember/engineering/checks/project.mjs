// check:project (G6-5, APR-JE-046). The reusable engineering is separate from the project it verifies, and a project manifest can add to the engineering but never subtract.
//   1. the manifest is valid and every file, folder and module it names exists
//   2. a manifest cannot remove, reorder, skip or relax a check: negative cases, each of which must be refused (OP-2: the same base engineering for every offering)
//   3. purity review (R-07): the files the migration matrix classes as reusable (universal, universal-redesign, adapter-hosting) are scanned for the things that make
//      code about ONE project (its name, record ids, baseline label, restaurant vocabulary, file names, selectors). A finding is removed or is listed in
//      engineering/purity-allow.json with a reason; the list is a ratchet: it can shrink, never grow, and an entry that no longer matches anything fails.
// The scanner itself (lib/purity.mjs) and this file name the forbidden words by design and are not scanned. The project's own source folders are the project's.
// Run: node engineering/checks/project.mjs
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { coreDir, loadProject, manifestSchema, project } from '../lib/project.mjs';
import { validateSchema } from '../lib/schema.mjs';
import { loadEntries } from '../lib/registry.mjs';
import { FORBIDDEN, relPosix, scan } from '../lib/purity.mjs';
import { isMain } from '../lib/git.mjs';

const REUSABLE = new Set(['universal', 'universal-redesign', 'adapter-hosting']);
const NOT_SCANNED = new Set(['lib/purity.mjs', 'checks/project.mjs']);   // relative to the engineering folder: the scanner and this check name the forbidden words on purpose
const clone = (x) => JSON.parse(JSON.stringify(x));

// ---- 1. the manifest and the things it names -----------------------------------------------------------------------------------------------------------------
export function manifestProblems(p = project) {
  const out = [];
  const m = p.manifest;
  for (const e of validateSchema(m, manifestSchema(), 'sts.engineering.json')) out.push(e);
  const need = (base, rel, what) => { if (rel && !existsSync(join(base, ...rel.split('/')))) out.push(`${what} names ${rel}, which does not exist`); };
  const root = p.root, eng = p.engDir, repo = p.repoRoot;
  need(repo, m.governance.approvalsLog, 'governance.approvalsLog');
  for (const [k, v] of Object.entries(m.governance.documents || {})) need(repo, v, `governance.documents.${k}`);
  need(join(repo, '.github', 'workflows'), m.ci.workflow, 'ci.workflow');
  for (const f of m.delivery.sharedFiles) need(root, f, 'delivery.sharedFiles');
  for (const f of m.delivery.assetFolders) need(root, f, 'delivery.assetFolders');
  need(root, m.delivery.configDir, 'delivery.configDir');
  need(root, m.delivery.pages.registry, 'delivery.pages.registry');
  need(root, m.delivery.stylesheet, 'delivery.stylesheet');
  for (const f of m.delivery.sourceRoots || []) need(root, f, 'delivery.sourceRoots');
  for (const [k, v] of Object.entries(m.generators)) need(root, v, `generators.${k}`);
  need(root, m.fixtures.clientBuild, 'fixtures.clientBuild');
  if (m.baseline) { need(eng, m.baseline.record, 'baseline.record'); need(root, m.baseline.regression, 'baseline.regression'); }
  need(eng, m.creativeAuthority.record, 'creativeAuthority.record');
  for (const f of [...m.engine.projectFolders, ...m.engine.projectFiles]) need(root, f, 'engine.projectFolders/projectFiles');
  for (const c of m.checks.project) need(root, c.module, `checks.project ${c.id}`);
  if (m.industry && !existsSync(join(coreDir, 'adapters', 'industry', m.industry, 'adapter.json'))) out.push(`industry "${m.industry}" has no adapter in the engineering (adapters/industry/${m.industry}/adapter.json)`);
  try { loadEntries({ coreRoot: coreDir, manifest: m, label: p.baseline?.label }); } catch (e) { out.push(e.message); }
  return out;
}

// ---- 2. a manifest cannot subtract ------------------------------------------------------------------------------------------------------------------------------
// Each case edits a copy of the project's manifest; the manifest must then be refused (by the schema or by the registry), or must leave the base checks exactly as they were.
const extraCheck = (o = {}) => ({ id: 'check:extra-g65', module: 'engineering/checks/project.mjs', export: 'checkProject', tier: 'fast', scope: 'static', reason: 'a synthetic project check for the negative case; no browser', describe: 'synthetic', ...o });
export const SUBTRACT_CASES = [
  { n: 'a key that disables a check', edit: (m) => { m.checks.skip = ['check:delivery']; } },
  { n: 'a key that disables a base check inside checks.project', edit: (m) => { m.checks.disable = ['check:html']; } },
  { n: 'a "waive" key on a project check', edit: (m) => { m.checks.project.push(extraCheck({ waive: ['check:links'] })); } },
  { n: 'a project check that re-declares a base check (to replace it)', edit: (m) => { m.checks.project.push(extraCheck({ id: 'check:delivery' })); } },
  { n: 'a project check placed after a check that does not exist', edit: (m) => { m.checks.project.push(extraCheck({ after: 'check:no-such-check' })); } },
  { n: 'a project check with a tier that is neither fast nor full', edit: (m) => { m.checks.project.push(extraCheck({ tier: 'never' })); } },
  { n: 'a project check that is not classified for the cross-browser matrix', edit: (m) => { m.checks.project.push(extraCheck({ scope: 'maybe' })); } },
  { n: 'a project check outside the engines with no reason', edit: (m) => { m.checks.project.push(extraCheck({ scope: 'chromium-only', reason: 'n/a' })); } },
  { n: 'a project check with an unknown need', edit: (m) => { m.checks.project.push(extraCheck({ needs: ['everything'] })); } },
  { n: 'an unknown top-level key (a strictness override)', edit: (m) => { m.strictness = 'relaxed'; } },
  { n: 'an unknown key in the engine section (a skipped file)', edit: (m) => { m.engine.skip = ['lib/authenticity.mjs']; } },
  { n: 'a creative value in the manifest (the creative authority is pinned by reference only)', edit: (m) => { m.creativeAuthority.palette = ['#000000']; } },
];

export function subtractionProblems(p = project) {
  const out = [];
  const baseIds = loadEntries({ coreRoot: coreDir, manifest: { ...clone(p.manifest), checks: { project: [] }, industry: null } }).map((e) => e.id);
  for (const c of SUBTRACT_CASES) {
    const m = clone(p.manifest);
    c.edit(m);
    const refused = validateSchema(m, manifestSchema(), 'sts.engineering.json').length > 0 || (() => { try { loadEntries({ coreRoot: coreDir, manifest: m }); return false; } catch { return true; } })();
    if (!refused) out.push(`${c.n}: the manifest was accepted`);
  }
  // the offering is information: it must not change which checks run
  const ids = (offering) => loadEntries({ coreRoot: coreDir, manifest: { ...clone(p.manifest), offering } }).map((e) => e.id).join(',');
  const enums = manifestSchema().properties.offering;
  for (const o of [null, ...((enums && (enums.enum || (enums.anyOf || []).flatMap((x) => x.enum || []))) || []).filter(Boolean)]) {
    if (ids(o) !== ids(null)) out.push(`offering ${o} changes the list of checks (the base engineering is the same for every offering)`);
  }
  // every base check is still in the merged list, in its place
  const merged = loadEntries({ coreRoot: coreDir, manifest: p.manifest }).map((e) => e.id);
  const kept = merged.filter((id) => baseIds.includes(id));
  if (kept.join() !== baseIds.join()) out.push('the merged check list reorders or drops a base check');
  return out;
}

// ---- 3. purity review ----------------------------------------------------------------------------------------------------------------------------------------------
const walk = (repo, path, into) => {
  const rel = path.replace(/\/+$/, '');
  const f = join(repo, rel);
  if (!existsSync(f)) return;
  if (statSync(f).isDirectory()) { for (const n of readdirSync(f).sort()) walk(repo, `${rel}/${n}`, into); } else if (rel.endsWith('.mjs')) into.add(rel);
};

// the reusable files of a repository, as POSIX paths relative to its root
export function reusableFiles(repo, matrix, ownFolder, engFolder, sourceRoots) {
  const files = new Set();
  for (const c of matrix.components) if (REUSABLE.has(c.class)) for (const p of c.paths) walk(repo, p, files);
  const skip = (f) => NOT_SCANNED.has(f.slice(engFolder.length + 1)) || sourceRoots.some((r) => f === `${ownFolder}/${r}` || f.startsWith(`${ownFolder}/${r}/`));
  return [...files].filter((f) => !skip(f)).sort();
}

// findings against the allowlist: { problems, counted } (a pure function, so the self-tests can feed it)
export function judge(found, allow) {
  const problems = [], by = new Map();
  for (const f of found) { const k = `${f.file}\u0000${f.rule}`; (by.get(k) || by.set(k, []).get(k)).push(f); }
  const listed = new Map(allow.map((a) => [`${a.file}\u0000${a.rule}`, a]));
  for (const [k, list] of by) {
    const a = listed.get(k);
    if (!a) problems.push(`${list[0].file}:${list[0].line}: ${list.length} ${list[0].rule} finding(s) with no allowlist entry, first: ${list[0].text}`);
    else if (list.length > a.max) problems.push(`${a.file}: ${list.length} ${a.rule} findings, ${a.max} allowed (the allowlist can shrink, never grow); lines ${list.map((x) => x.line).join(', ')}`);
    else if (list.length < a.max) problems.push(`${a.file}: ${list.length} ${a.rule} finding(s) but ${a.max} allowed: lower max to ${list.length} in purity-allow.json (the ratchet only tightens)`);
  }
  for (const a of allow) {
    if (!by.has(`${a.file}\u0000${a.rule}`)) problems.push(`purity-allow.json: ${a.file} [${a.rule}] matches nothing any more: remove the entry`);
    if (!a.reason || String(a.reason).length < 30) problems.push(`purity-allow.json: ${a.file} [${a.rule}] needs a reason a reviewer can accept`);
  }
  return { problems, counted: found.length };
}

// the scanner itself: each of these must be found (or, for the comment, not found)
export const SCANNER_CASES = [
  ['project-name', 'const n = "jade-and-ember";', true],
  ['project-name', '// jade and ember is only named in a comment', false],
  ['record-id', "const a = 'APR-JE-017';", true],
  ['baseline-label', "const v = 'v0.8';", true],
  ['industry-word', "const k = 'restaurant';", true],
  ['site-file', "put('styles.css', '');", true],
  ['project-layout', "import x from '../../src/lib/seo.mjs';", true],
  ['site-selector', "document.querySelector('.nav-toggle');", true],
  ['project-name', 'const t = `${a}` + "ember";', true],
  ['industry-word', 'const re = /dishes/; // a regular expression is code, not a comment', true],
];
export function scannerProblems() {
  const out = [];
  for (const [rule, src, hit] of SCANNER_CASES) {
    const found = scan('case.mjs', src).some((f) => f.rule === rule);
    if (found !== hit) out.push(`the purity scanner ${hit ? 'missed' : 'flagged'} a ${rule} case: ${src}`);
  }
  if (new Set(FORBIDDEN.map((f) => f.id)).size !== FORBIDDEN.length) out.push('the purity scanner lists a rule twice');
  return out;
}

// the ratchet itself: a finding with no entry, one more finding than allowed, one fewer, an entry that matches nothing, an entry without a reason: each must fail
export function ratchetProblems() {
  const out = [], f = (file, rule, line = 1) => ({ file, rule, line, text: 'x' });
  const ok = 'a reason long enough for a reviewer to accept it';
  const cases = [
    ['a finding with no entry', [f('a.mjs', 'site-file')], [], true],
    ['one more finding than the entry allows', [f('a.mjs', 'site-file', 1), f('a.mjs', 'site-file', 2)], [{ file: 'a.mjs', rule: 'site-file', max: 1, reason: ok }], true],
    ['fewer findings than the entry allows (the ratchet must tighten)', [f('a.mjs', 'site-file')], [{ file: 'a.mjs', rule: 'site-file', max: 2, reason: ok }], true],
    ['an entry that matches nothing', [], [{ file: 'a.mjs', rule: 'site-file', max: 1, reason: ok }], true],
    ['an entry without a real reason', [f('a.mjs', 'site-file')], [{ file: 'a.mjs', rule: 'site-file', max: 1, reason: 'later' }], true],
    ['findings exactly as listed', [f('a.mjs', 'site-file')], [{ file: 'a.mjs', rule: 'site-file', max: 1, reason: ok }], false],
  ];
  for (const [n, found, allow, fails] of cases) if ((judge(found, allow).problems.length > 0) !== fails) out.push(`purity ratchet: ${n} was ${fails ? 'accepted' : 'refused'}`);
  return { problems: out, cases: cases.length };
}

export function checkProject({ manifest = project, withPurity = true } = {}) {
  const problems = [], notes = [];
  const mp = manifestProblems(manifest);
  problems.push(...mp);
  if (!mp.length) notes.push(`${manifest.name}: the manifest is valid and every file, folder and module it names exists (${manifest.manifest.checks.project.length} project check(s) added to the base engineering)`);
  const sp = subtractionProblems(manifest);
  problems.push(...sp);
  if (!sp.length) notes.push(`${SUBTRACT_CASES.length} attempts to remove, skip or relax a base check through the manifest were refused; the offering changes nothing; the base checks keep their order`);
  const cp = scannerProblems();
  problems.push(...cp);
  if (!cp.length) notes.push(`the purity scanner finds ${SCANNER_CASES.filter((c) => c[2]).length} planted project-specific values and ignores a comment`);
  const rp = ratchetProblems();
  problems.push(...rp.problems);
  if (!rp.problems.length) notes.push(`the purity ratchet refuses ${rp.cases - 1} wrong allowlists and accepts the exact one`);
  if (!withPurity) return { problems, notes };

  // the reusable code lives with the engineering, so the review is of the engineering's own repository, whichever project is being verified
  const homeRoot = join(coreDir, '..');
  if (!existsSync(join(homeRoot, 'sts.engineering.json'))) { notes.push('purity review skipped: the reusable code is not inside a project of this repository'); return { problems, notes }; }
  const home = loadProject(homeRoot);
  const matrixFile = join(coreDir, 'framework-migration-matrix.json');
  const allowFile = join(coreDir, 'purity-allow.json');
  if (!existsSync(matrixFile) || !existsSync(allowFile)) { problems.push('purity review: framework-migration-matrix.json and purity-allow.json must both exist beside the engineering'); return { problems, notes }; }
  const matrix = JSON.parse(readFileSync(matrixFile, 'utf8'));
  const allow = JSON.parse(readFileSync(allowFile, 'utf8')).allow;
  const ownFolder = relPosix(home.repoRoot, home.root);
  const engFolder = relPosix(home.repoRoot, home.engDir);
  const files = reusableFiles(home.repoRoot, matrix, ownFolder, engFolder, home.delivery.sourceRoots || []);
  const found = [];
  for (const f of files) found.push(...scan(f.startsWith(`${engFolder}/`) ? f.slice(engFolder.length + 1) : f, readFileSync(join(home.repoRoot, f), 'utf8')));
  const j = judge(found, allow);
  problems.push(...j.problems);
  const total = allow.reduce((s, a) => s + a.max, 0);
  if (!j.problems.length) notes.push(`purity review: ${files.length} reusable files scanned; ${j.counted} remaining project-specific values, all listed in purity-allow.json with a reason (${allow.length} entries, ratchet ${total})`);
  return { problems, notes };
}

if (isMain(import.meta.url)) {
  const r = checkProject();
  for (const n of r.notes) console.log(`  ${n}`);
  for (const p of r.problems) console.log(`  FAIL ${p}`);
  console.log(r.problems.length ? `FAIL  check:project (${r.problems.length} problem(s))` : 'PASS  check:project');
  process.exit(r.problems.length ? 1 : 0);
}
