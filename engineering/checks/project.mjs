// check:project (G6-5, APR-JE-046). The reusable engineering is separate from the project it verifies, and a project manifest can add to the engineering but never subtract.
//   1. the manifest is valid and every file, folder and module it names exists
//   2. a manifest cannot remove, reorder, skip or relax a check: negative cases, each of which must be refused (OP-2: the same base engineering for every offering)
//   3. purity review (R-07): the files the migration matrix classes as reusable (universal, universal-redesign, adapter-hosting) are scanned for the things that make
//      code about ONE project (its name, record ids, baseline label, restaurant vocabulary, file names, selectors). A finding is removed or is listed in
//      engineering/purity-allow.json with a reason; the list is a ratchet: it can shrink, never grow, and an entry that no longer matches anything fails.
// The scanner itself (lib/purity.mjs) and this file name the forbidden words by design and are not scanned. The project's own source folders are the project's.
// Run: node engineering/checks/project.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { coreDir, loadProject, manifestSchema, project } from '../lib/project.mjs';
import { validateSchema } from '../lib/schema.mjs';
import { loadEntries } from '../lib/registry.mjs';
import { FORBIDDEN, relPosix, scan } from '../lib/purity.mjs';
import { isMain } from '../lib/git.mjs';

const REUSABLE = new Set(['universal', 'universal-redesign', 'adapter-hosting']);
const NOT_SCANNED = new Set(['lib/purity.mjs', 'checks/project.mjs']);   // relative to the engineering folder: the scanner and this check name the forbidden words on purpose
const clone = (x) => JSON.parse(JSON.stringify(x));

// ---- 0. no design value in the manifest (specification 16, 2.2) ----------------------------------------------------------------------------------------------
// The manifest declares facts. A colour, a font, a length or a duration in it would be a design decision the creative authority owns. Selectors, probes and the preload pattern are
// the markup contract and are not scanned; the schema already refuses keys it does not know, this catches a value hidden in text.
const DESIGN_VALUE = [
  [/(^|[^\w&])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/i, 'a colour'],
  [/\b\d+(?:\.\d+)?\s?(?:px|rem|em|ms|vh|vw)\b/i, 'a length or a duration'],
  [/\b(?:font-family|font-size|font-weight|cubic-bezier|ease-in|ease-out|linear-gradient|border-radius|letter-spacing|line-height)\b/i, 'a style property'],
];
const NOT_DESIGN = new Set(['markup.selectors', 'markup.probes', 'markup.heroPreloadPattern', 'delivery.build.command']);
export function designValueProblems(manifest) {
  const out = [];
  const walk = (v, path) => {
    if (NOT_DESIGN.has(path)) return;
    if (typeof v === 'string') { for (const [re, what] of DESIGN_VALUE) if (re.test(v)) out.push(`${path} contains ${what} ("${v.slice(0, 50)}"): the manifest declares facts, and design values belong to the creative authority`); }
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k);
  };
  walk(manifest, '');
  return out;
}

// ---- 1. the manifest and the things it names -----------------------------------------------------------------------------------------------------------------
export function manifestProblems(p = project) {
  const out = [];
  const m = p.manifest;
  for (const e of validateSchema(m, manifestSchema(), 'sts.engineering.json')) out.push(e);
  const need = (base, rel, what) => { if (rel && !existsSync(join(base, ...rel.split('/')))) out.push(`${what} names ${rel}, which does not exist`); };
  const root = p.root, eng = p.engDir, repo = p.repoRoot;
  // paths.repositoryRoot is the project's own claim about where its repository begins; every repository-wide scan (workflows, credentials, history) starts there. It must be the
  // git repository the project is in, or a manifest could point the scans at a decoy folder and leave the real workflows and files unjudged (G6-7 review).
  try {
    const top = realpathSync(execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim());
    if (existsSync(repo) && realpathSync(repo) !== top) out.push(`paths.repositoryRoot resolves to ${realpathSync(repo)}, but the project is in the git repository ${top}; the repository-wide checks would not look at the repository`);
  } catch { out.push('paths.repositoryRoot cannot be confirmed: the project is not inside a git repository'); }
  need(repo, m.governance.approvalsLog, 'governance.approvalsLog');
  for (const [k, v] of Object.entries(m.governance.documents || {})) need(repo, v, `governance.documents.${k}`);
  need(join(repo, '.github', 'workflows'), m.ci.workflow, 'ci.workflow');
  need(join(repo, '.github', 'workflows'), m.ci.scheduled, 'ci.scheduled');
  const fw = m.ci.framework;
  if (fw) {
    need(join(repo, '.github', 'workflows'), fw.reusable, 'ci.framework.reusable');
    need(repo, `${fw.action}/action.yml`, 'ci.framework.action');
    need(repo, fw.scripts, 'ci.framework.scripts');
    for (const [k, v] of Object.entries(fw.templates)) need(repo, v, `ci.framework.templates.${k}`);
  }
  for (const f of m.delivery.sharedFiles) need(root, f, 'delivery.sharedFiles');
  for (const f of m.delivery.assetFolders) need(root, f, 'delivery.assetFolders');
  need(root, m.delivery.configDir, 'delivery.configDir');
  need(root, m.delivery.pages.registry, 'delivery.pages.registry');
  need(root, m.delivery.stylesheet, 'delivery.stylesheet');
  for (const f of m.delivery.sourceRoots || []) {
    need(root, f, 'delivery.sourceRoots');
    const full = join(root, ...f.split('/'));
    if (existsSync(full) && !statSync(full).isDirectory() && !/\.[cm]?[jt]s$/.test(f)) out.push(`delivery.sourceRoots names ${f}, which is neither a folder nor a script (the vendor-free scan reads source code)`);
  }
  out.push(...designValueProblems(m));
  for (const [k, v] of Object.entries(m.generators)) need(root, v, `generators.${k}`);
  need(root, m.fixtures.clientBuild, 'fixtures.clientBuild');
  need(root, m.fixtures.headTag, 'fixtures.headTag');
  if (m.baseline) { need(eng, m.baseline.record, 'baseline.record'); need(root, m.baseline.regression, 'baseline.regression'); }
  need(eng, m.creativeAuthority.record, 'creativeAuthority.record');
  for (const f of [...m.engine.projectFolders, ...m.engine.projectFiles]) need(root, f, 'engine.projectFolders/projectFiles');
  for (const c of m.checks.project) need(root, c.module, `checks.project ${c.id}`);
  if (m.industry && !existsSync(join(coreDir, 'adapters', 'industry', m.industry, 'adapter.json'))) out.push(`industry "${m.industry}" has no adapter in the engineering (adapters/industry/${m.industry}/adapter.json)`);
  // what the manifest makes the engineering execute or compare must be covered by the verification record's engine digest, and by the vendor-free scan of the sources
  const inEng = (rel) => resolve(root, rel).startsWith(`${resolve(eng)}${sep}`);
  const covered = (rel) => inEng(rel) || m.engine.projectFiles.includes(rel) || m.engine.projectFolders.some((f) => rel === f || rel.startsWith(`${f}/`));
  if (!m.engine.projectFiles.includes('sts.engineering.json')) out.push('engine.projectFiles must list sts.engineering.json: the manifest is part of what the verification record vouches for');
  const executed = [...Object.values(m.generators).filter(Boolean), m.fixtures.clientBuild, m.fixtures.headTag, m.baseline && m.baseline.regression, ...m.checks.project.map((c) => c.module)].filter(Boolean);
  for (const rel of executed) if (!covered(rel)) out.push(`${rel} is run by the engineering but is covered by neither engine.projectFolders/projectFiles nor the engineering folder (its changes would not change the engine digest)`);
  const b = m.delivery.build;
  if (b) {
    if (!b.command.includes('{out}')) out.push('delivery.build.command must contain {out} (the folder the build writes to)');
    // the script is whatever the command runs after the interpreter, in any language: a path-like argument that is not a flag and not the output placeholder
    const script = b.command.slice(1).find((t) => !t.startsWith('-') && t !== '{out}' && /[./]/.test(t));
    if (script && !existsSync(join(root, ...script.split('/')))) out.push(`the build script ${script} does not exist`);
    else if (script && !covered(script)) out.push(`the build script ${script} is covered by neither engine.projectFolders/projectFiles nor the engineering folder`);
    if (!(m.delivery.sourceRoots || []).length) out.push('delivery.sourceRoots must list the sources of a project that has a builder (the vendor-free scan reads them)');
  }
  if (m.baseline && !m.baseline.regression) out.push('a project with a baseline must name its regression recipe (baseline.regression); without it the behaviour layer would compare nothing');
  try { loadEntries({ coreRoot: coreDir, manifest: m, label: p.baseline?.label }); } catch (e) { out.push(e.message); }
  return out;
}

// ---- 2. a manifest cannot subtract ------------------------------------------------------------------------------------------------------------------------------
// Each case edits a copy of the project's manifest; the manifest must then be refused (by the schema or by the registry), or must leave the base checks exactly as they were.
const extraCheck = (o = {}) => ({ after: 'check:html', id: 'check:extra-g65', module: 'engineering/checks/project.mjs', export: 'checkProject', tier: 'fast', scope: 'static', reason: 'a synthetic project check for the negative case; no browser', describe: 'synthetic', ...o });
export const SUBTRACT_CASES = [
  { n: 'a key that disables a check', edit: (m) => { m.checks.skip = ['check:delivery']; } },
  { n: 'a key that disables a base check inside checks.project', edit: (m) => { m.checks.disable = ['check:html']; } },
  { n: 'a "waive" key on a project check', edit: (m) => { m.checks.project.push(extraCheck({ waive: ['check:links'] })); } },
  { n: 'a project check that re-declares a base check (to replace it)', edit: (m) => { m.checks.project.push(extraCheck({ id: 'check:delivery' })); } },
  { n: 'a project check placed after a check that does not exist', edit: (m) => { m.checks.project.push(extraCheck({ after: 'check:no-such-check' })); } },
  { n: 'a project check with a tier that is neither fast nor full', edit: (m) => { m.checks.project.push(extraCheck({ tier: 'never' })); } },
  { n: 'a project check that names no check to follow (it would run before the base checks)', edit: (m) => { const c = extraCheck(); delete c.after; m.checks.project.push(c); } },
  { n: 'a project check that is not classified for the cross-browser matrix', edit: (m) => { m.checks.project.push(extraCheck({ scope: 'maybe' })); } },
  { n: 'a project check outside the engines with no reason', edit: (m) => { m.checks.project.push(extraCheck({ scope: 'chromium-only', reason: 'n/a' })); } },
  { n: 'a project check with an unknown need', edit: (m) => { m.checks.project.push(extraCheck({ needs: ['everything'] })); } },
  { n: 'an unknown top-level key (a strictness override)', edit: (m) => { m.strictness = 'relaxed'; } },
  { n: 'an unknown key in the engine section (a skipped file)', edit: (m) => { m.engine.skip = ['lib/authenticity.mjs']; } },
  { n: 'a creative value in the manifest (the creative authority is pinned by reference only)', edit: (m) => { m.creativeAuthority.palette = ['#000000']; } },
];

// Attempts to shrink what is vouched for rather than what runs: each must make the manifest review fail (these apply to a project that has a builder and a baseline, as the default does).
export const SHRINK_CASES = [
  { n: 'engine.projectFiles emptied (the manifest drops out of the engine digest)', applies: () => true, edit: (m) => { m.engine.projectFiles = []; } },
  { n: 'engine.projectFolders emptied (the generators drop out of the engine digest)', applies: (m) => Object.values(m.generators).some((g) => g && !g.startsWith('engineering/')), edit: (m) => { m.engine.projectFolders = []; } },
  { n: 'delivery.sourceRoots emptied for a project with a builder', applies: (m) => Boolean(m.delivery.build), edit: (m) => { m.delivery.sourceRoots = []; } },
  { n: 'a build command that never says where to write ({out} removed)', applies: (m) => Boolean(m.delivery.build), edit: (m) => { m.delivery.build.command = m.delivery.build.command.filter((t) => t !== '{out}'); } },
  { n: 'a baseline without a regression recipe', applies: (m) => Boolean(m.baseline), edit: (m) => { delete m.baseline.regression; } },
];

export function shrinkProblems(p = project) {
  const out = [];
  for (const c of SHRINK_CASES) {
    if (!c.applies(p.manifest)) continue;
    const m = clone(p.manifest);
    c.edit(m);
    if (!manifestProblems({ ...p, manifest: m }).length) out.push(`${c.n}: the manifest review accepted it`);
  }
  return out;
}

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

// The purity review of the framework's own layout (specification 16, 10.6): the engineering folder is not inside a project, so there is no migration matrix. The reusable
// code is every .mjs file of the engineering except the industry adapters (industry vocabulary is what they are for), the development tools of the framework (its self-tests, which
// plant defects by design: class devtool in the extraction manifest), the fixture projects (which are projects, judged by their own isolation test) and the scanner itself.
export function frameworkReusableFiles(root = coreDir) {
  // The classes come from the extraction manifest (the framework repository) or, in a consumer's snapshot, from the same classes carried in the integrity record (the private ledger is not published).
  const manifest = join(root, 'EXTRACTION-MANIFEST.json'), record = join(root, '..', 'sts-framework-snapshot.json');
  const ledger = existsSync(manifest) ? JSON.parse(readFileSync(manifest, 'utf8')).files.map((f) => ({ class: f.class, destination: f.destination }))
    : existsSync(record) ? JSON.parse(readFileSync(record, 'utf8')).files.map((f) => ({ class: f.class, destination: f.path }))
    : (() => { throw new Error('neither EXTRACTION-MANIFEST.json nor sts-framework-snapshot.json is present beside the engineering'); })();
  const skipClass = new Set(ledger.filter((f) => f.class === 'adapter-industry' || f.class === 'devtool').map((f) => f.destination.replace(/^engineering\//, '')));
  const out = [];
  const visit = (dir) => {
    for (const n of readdirSync(dir).sort()) {
      if (['node_modules', 'fixtures', '.selftest', '.reports', 'docs', '.git'].includes(n)) continue;
      const p = join(dir, n);
      if (statSync(p).isDirectory()) visit(p); else if (n.endsWith('.mjs')) { const rel = relPosix(root, p); if (!skipClass.has(rel) && !NOT_SCANNED.has(rel)) out.push(rel); }
    }
  };
  visit(root);
  return out;
}

function frameworkPurity({ problems, notes }) {
  const allowFile = join(coreDir, 'purity-allow.json');
  if (!existsSync(allowFile)) { problems.push('purity review: purity-allow.json must exist beside the engineering'); return { problems, notes }; }
  const allow = JSON.parse(readFileSync(allowFile, 'utf8')).allow;
  const files = frameworkReusableFiles();
  const found = [];
  for (const f of files) found.push(...scan(f, readFileSync(join(coreDir, f), 'utf8')));
  // the JSON standards: every string value, comments excluded
  const std = join(coreDir, 'standards');
  const jsonFiles = [];
  const jv = (dir) => { for (const n of readdirSync(dir).sort()) { const p = join(dir, n); if (statSync(p).isDirectory()) jv(p); else if (n.endsWith('.json')) jsonFiles.push(p); } };
  if (existsSync(std)) jv(std);
  for (const f of jsonFiles) {
    const strip = (v) => (Array.isArray(v) ? v.map(strip) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([k]) => !k.startsWith('$comment')).map(([k, x]) => [k, strip(x)])) : v);
    found.push(...scan(relPosix(coreDir, f), JSON.stringify(strip(JSON.parse(readFileSync(f, 'utf8'))), null, 1)));
  }
  const j = judge(found, allow);
  problems.push(...j.problems);
  const total = allow.reduce((n, a) => n + a.max, 0);
  if (!j.problems.length) notes.push(`purity review (framework layout): ${files.length} reusable files and ${jsonFiles.length} standards scanned; ${j.counted} remaining project-specific values, all listed in purity-allow.json with a reason (${allow.length} entries, ratchet ${total})`);
  return { problems, notes };
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
  const sp = [...subtractionProblems(manifest), ...shrinkProblems(manifest)];
  problems.push(...sp);
  if (!sp.length) notes.push(`${SUBTRACT_CASES.length + SHRINK_CASES.filter((c) => c.applies(manifest.manifest)).length} attempts to remove, skip, relax or stop vouching for a base check through the manifest were refused; the offering changes nothing; the base checks keep their order`);
  const cp = scannerProblems();
  problems.push(...cp);
  if (!cp.length) notes.push(`the purity scanner finds ${SCANNER_CASES.filter((c) => c[2]).length} planted project-specific values and ignores a comment`);
  const rp = ratchetProblems();
  problems.push(...rp.problems);
  if (!rp.problems.length) notes.push(`the purity ratchet refuses ${rp.cases - 1} wrong allowlists and accepts the exact one`);
  if (!withPurity) return { problems, notes };

  // the reusable code lives with the engineering, so the review is of the engineering's own repository, whichever project is being verified
  const homeRoot = join(coreDir, '..');
  if (!existsSync(join(homeRoot, 'sts.engineering.json'))) return frameworkPurity({ problems, notes });
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
