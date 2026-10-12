// check:selftest-generic (G6-5, APR-JE-046). The reusable engineering run against a SECOND, invented project: the generic fixture (engineering/fixtures/generic,
// "Quillfeather Letterpress", a two-page letterpress studio with no builder, no baseline, no industry adapter and no hero). It proves the seams G6-5 introduced:
// the project is read from its manifest, ids and test names derive from it, the registry reports a need the project does not meet as "not applicable", a project adds a
// check of its own through the manifest, and the base checks that depend on nothing project-specific pass on it and catch a defect planted in it.
// It does NOT claim the whole of `npm run verify` passes on the fixture: the checks that read project RECORDS (budgets, tokens, release records, the baseline) need
// the fixture to carry records of its own, which is the remaining part of the split (see G6-5-REPORT.md). Each case runs in a child process because the engineering
// binds to the project when it is imported.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { coreDir, loadProject, project } from '../lib/project.mjs';
import { loadEntries, unmetNeeds } from '../lib/registry.mjs';
import { isMain } from '../lib/git.mjs';
import { manifestProblems, subtractionProblems } from './project.mjs';

export const FIXTURE = join(coreDir, 'fixtures', 'generic');
const fx = loadProject(FIXTURE);
const BASE = `${pathToFileURL(coreDir).href}/`;

// Runs `body` (module code that ends with out([...problems])) with the engineering bound to `dir`; returns the problems it reported.
function inProject(dir, body, { unset = false } = {}) {
  const env = { ...process.env };
  if (unset) delete env.STS_PROJECT_DIR; else env.STS_PROJECT_DIR = dir;
  const code = `const out = (a) => console.log('@@' + JSON.stringify(a)); const L = (p) => import(${JSON.stringify(BASE)} + p);\n${body}`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { env, cwd: dir || coreDir, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 120000 });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('@@'));
  if (!line) return [`the child process reported nothing (exit ${r.status}): ${(r.stderr || r.stdout || '').trim().split('\n').slice(-3).join(' | ').slice(0, 300)}`];
  return JSON.parse(line.slice(2));
}

// a throw-away copy of the fixture that the cases may damage; it is a git repository of its own because the credential scan lists files through git
function copyOfFixture() {
  const d = mkdtempSync(join(tmpdir(), 'sts-generic-'));
  cpSync(FIXTURE, d, { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: d });
  return d;
}
const withCopy = (fn) => { const d = copyOfFixture(); try { return fn(d); } finally { rmSync(d, { recursive: true, force: true }); } };
const editFile = (d, rel, f) => { const p = join(d, rel); writeFileSync(p, f(readFileSync(p, 'utf8'))); };
const editManifest = (d, f) => editFile(d, 'sts.engineering.json', (t) => { const m = JSON.parse(t); f(m); return JSON.stringify(m, null, 1); });
const filesUnder = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? filesUnder(p) : [p]; });
const baseIds = () => loadEntries({ coreRoot: coreDir, manifest: fx.manifest }).map((e) => e.id);

const EXTRA_MODULE = (body) => `export const checkExtra = () => (${body});\n`;
const EXTRA_ENTRY = { id: 'check:fixture-extra', module: 'engineering/checks/extra.mjs', export: 'checkExtra', after: 'check:html', tier: 'fast', scope: 'static', reason: 'a check the fixture adds for itself; no browser', describe: 'the fixture\'s own check' };
const addExtra = (d, body) => {
  mkdirSync(join(d, 'engineering', 'checks'), { recursive: true });
  writeFileSync(join(d, 'engineering', 'checks', 'extra.mjs'), EXTRA_MODULE(body));
  editManifest(d, (m) => { m.checks.project.push(EXTRA_ENTRY); });
};
const runExtra = (d) => inProject(d, `
const { loadEntries } = await L('lib/registry.mjs'); const { runEntry } = await L('checks/runners.mjs'); const { coreDir, project } = await L('lib/project.mjs');
const list = loadEntries({ coreRoot: coreDir, manifest: project.manifest });
const e = list.find((x) => x.id === 'check:fixture-extra'); const html = list.findIndex((x) => x.id === 'check:html');
const p = [];
if (!e) p.push('the fixture check is not in the registry'); else {
  if (list.indexOf(e) !== html + 1) p.push('the fixture check is not placed after the check it names');
  const r = await runEntry(e, { fast: true });
  p.push(...r.problems.map((x) => 'the fixture check reported: ' + x), ...(r.notes.includes('ran') ? [] : ['the fixture check did not run']));
}
out(p);`);

// [name, () => problems[], expected regex | null (must find nothing)]
const cases = [
  ['identity: the fixture is another project (id, name and every record prefix differ)', () => ['id', 'name'].filter((k) => fx[k] === project[k]).map((k) => `same ${k}`).concat(['approvalIdPrefix', 'demonstrationIdPrefix', 'recordIdSuffix'].filter((k) => fx.governance[k] === project.governance[k]).map((k) => `same ${k}`)), null],
  ['isolation: the fixture tree names nothing of the default project (name, id, record prefixes, baseline label)', () => {
    const needles = [project.id, project.name, project.governance.approvalIdPrefix, project.governance.demonstrationIdPrefix, `-${project.governance.recordIdSuffix}-`, ...project.name.split(/\W+/).filter((w) => w.length > 3)];
    if (project.baseline) needles.push(project.baseline.label);
    const out = [];
    for (const f of filesUnder(FIXTURE)) { const t = readFileSync(f, 'utf8').toLowerCase(); for (const n of needles) if (t.includes(n.toLowerCase())) out.push(`${f.slice(FIXTURE.length + 1)} mentions "${n}"`); }
    return out;
  }, null],
  ['manifest: the fixture manifest is valid and every file it names exists', () => manifestProblems(fx), null],
  ['manifest: every attempt to remove, skip or relax a base check is refused for the fixture too', () => subtractionProblems(fx), null],
  ['registry: the fixture has every base check and none of the default project\'s own three', () => { const ids = baseIds(); return ['check:framework-matrix', 'check:d11', 'check:supports'].filter((i) => ids.includes(i)).map((i) => `${i} is the default project's own check`).concat(['check:html', 'check:secrets', 'check:delivery', 'check:project'].filter((i) => !ids.includes(i)).map((i) => `${i} is missing`)); }, null],
  ['registry: what the fixture does not declare (baseline, builder, industry) is exactly what makes checks not applicable', () => {
    const n = (m) => loadEntries({ coreRoot: coreDir, manifest: m }).filter((e) => unmetNeeds(e, m).length).map((e) => e.id).sort().join();
    return n(fx.manifest) === n(project.manifest) ? ['the fixture and the default project have the same not-applicable checks'] : (n(fx.manifest).includes('check:baseline') && n(fx.manifest).includes('check:determinism') && !n(project.manifest) ? [] : [`unexpected not-applicable list: ${n(fx.manifest)}`]);
  }, null],
  ['runner: a check whose need the fixture does not meet reports "not applicable" and neither passes nor fails', () => inProject(FIXTURE, `
const { loadEntries } = await L('lib/registry.mjs'); const { runEntry } = await L('checks/runners.mjs'); const { coreDir, project } = await L('lib/project.mjs');
const p = [];
for (const id of ['check:baseline', 'check:determinism']) {
  const e = loadEntries({ coreRoot: coreDir, manifest: project.manifest }).find((x) => x.id === id);
  const r = await runEntry(e, { fast: true });
  if (r.problems.length || !/not applicable to Quillfeather Letterpress/.test(r.notes.join())) p.push(id + ': ' + JSON.stringify(r));
}
out(p);`), null],
  ['derivation: record ids, schema ids and test host names come from the fixture manifest', () => inProject(FIXTURE, `
const m = await L('lib/project.mjs'); const p = [];
const want = { approval: 'APR-QF-003', rec: 'REL-QF-902', schema: 'quillfeather-letterpress/candidate', host: 'quillfeatherletterpress.example.test', prod: 'www.quillfeather-letterpress-fixture.com', folder: '' };
const got = { approval: m.ids.approval(3), rec: m.ids.rec('REL', 902), schema: m.schemaId('candidate'), host: m.fixtureNames.exampleHost, prod: m.fixtureNames.productionHost, folder: m.projectFolder };
for (const k of Object.keys(want)) if (want[k] !== got[k]) p.push(k + ': ' + got[k] + ' (wanted ' + want[k] + ')');
out(p);`), null],
  ['site: the page list is read from the fixture\'s own page registry', () => inProject(FIXTURE, `
const { pagesOf } = await L('lib/site.mjs'); const { projectDir } = await L('lib/git.mjs');
const got = pagesOf(projectDir).join();
out(got === 'index.html,services.html' ? [] : ['pages: ' + got]);`), null],
  ['markup: a selector the fixture declares is returned; one it does not declare fails loudly, naming the project and the key', () => inProject(FIXTURE, `
const { selector } = await L('lib/project.mjs'); const p = [];
if (selector('brandLink') !== 'a.brand') p.push('brandLink not returned');
try { selector('navToggle'); p.push('an undeclared selector was returned'); } catch (e) { if (!/Quillfeather Letterpress declares no "navToggle"/.test(e.message)) p.push('unclear message: ' + e.message); }
out(p);`), null],
  ['industry: a project with no industry adapter gets a clear refusal, never another industry\'s schema', () => inProject(FIXTURE, `
const { requireIndustry } = await L('lib/industry.mjs'); const p = [];
try { requireIndustry(); p.push('an industry adapter was loaded for a project that declares none'); } catch (e) { if (!/Quillfeather Letterpress/.test(e.message)) p.push('the refusal does not name the project: ' + e.message); }
out(p);`), null],
  ['builder and baseline: a project without them is told so, with no fallback to another project\'s', () => inProject(FIXTURE, `
const m = await L('lib/project.mjs'); const g = await L('lib/git.mjs'); const f = await L('lib/fixtures.mjs'); const p = [];
if (m.buildCommand('/x', '/y') !== null) p.push('a build command exists'); if (f.hasClientBuild) p.push('a client build exists');
try { g.baselineRecord(); p.push('a baseline record was returned'); } catch (e) { if (!/declares no baseline/.test(e.message)) p.push(e.message); }
out(p);`), null],
  ['noise: with no hero preload declared, no console message is ever classed as the known engine warning', () => inProject(FIXTURE, `
const { engineNoise } = await L('lib/engine-noise.mjs');
out(engineNoise('firefox', 'Preload of http://x/media/hero-a.webp was ignored due to unknown "as" or "type" values, or non-matching "media" attribute') === null ? [] : ['classed as noise']);`), null],
  ['engine digest: the fixture manifest is part of what the verification record covers', () => inProject(FIXTURE, `
const { engineFiles } = await L('lib/verification.mjs');
const f = engineFiles(); out(f.some((x) => /sts\\.engineering\\.json$/.test(x.label || x.name || x.path || String(x))) ? [] : ['the manifest is not covered']);`), null],
  ['default: with no project set the engineering is still bound to the default project', () => inProject(null, `
const m = await L('lib/project.mjs'); out(m.project.id === ${JSON.stringify(project.id)} ? [] : ['bound to ' + m.project.id]);`, { unset: true }), null],
  ['check:html: the fixture\'s pages are valid HTML and the check passes', () => inProject(FIXTURE, `
const { checkHtml } = await L('checks/html.mjs'); const { repoRoot } = await L('lib/git.mjs'); const r = await checkHtml({ root: repoRoot }); out(r.problems);`), null],
  ['check:secrets: the fixture tree holds no credential and the check passes', () => withCopy((d) => inProject(d, `
const { checkSecrets } = await L('checks/secrets.mjs'); out(checkSecrets({ history: false }).problems);`)), null],
  ['check:html: an image without alt text and an unclosed element planted in a fixture page are caught', () => withCopy((d) => { editFile(d, 'services.html', (t) => t.replace('<h1>Services</h1>', '<h1>Services<img src="x.png"><div>')); return inProject(d, `
const { checkHtml } = await L('checks/html.mjs'); const { repoRoot } = await L('lib/git.mjs'); const r = await checkHtml({ root: repoRoot }); out(r.problems);`); }), /alt|close|element|img/i],
  ['check:secrets: a credential-shaped string planted in a fixture page is caught', () => withCopy((d) => { editFile(d, 'index.html', (t) => t.replace('</main>', `<p>${'AKIA'}${'IOSFODNN7EXAMPLE'}</p></main>`)); return inProject(d, `
const { checkSecrets } = await L('checks/secrets.mjs'); out(checkSecrets({ history: false }).problems);`); }), /aws-access-key/],
  ['manifest: an unknown key in the fixture manifest is refused by the loader', () => withCopy((d) => { editManifest(d, (m) => { m.skipChecks = ['check:html']; }); return inProject(d, `
await L('lib/project.mjs').then(() => out([])).catch((e) => out([e.message]));`); }), /not a valid project manifest/],
  ['manifest: a file the fixture manifest names but the fixture lacks is reported', () => withCopy((d) => { rmSync(join(d, 'config', 'site.json')); return inProject(d, `
const { project } = await L('lib/project.mjs'); const { manifestProblems } = await L('checks/project.mjs'); out(manifestProblems(project));`); }), /config\/site\.json.*does not exist/],
  ['manifest: a missing approvals log is reported', () => withCopy((d) => { rmSync(join(d, 'APPROVALS.md')); return inProject(d, `
const { project } = await L('lib/project.mjs'); const { manifestProblems } = await L('checks/project.mjs'); out(manifestProblems(project));`); }), /approvalsLog.*does not exist/],
  ['extension point: a check the fixture adds through its own manifest is placed where it asks and is run from the fixture', () => withCopy((d) => { addExtra(d, "({ problems: [], notes: ['ran'] })"); return runExtra(d); }), null],
  ['extension point: a failing check the fixture adds is reported as a failure', () => withCopy((d) => { addExtra(d, "({ problems: ['planted'], notes: ['ran'] })"); return runExtra(d); }), /fixture check reported: planted/],
  ['extension point: a fixture check placed after a check that does not exist is refused when the registry is built', () => withCopy((d) => { addExtra(d, "({ problems: [], notes: [] })"); editManifest(d, (m) => { m.checks.project[0].after = 'check:nothing'; }); return inProject(d, `
const { loadEntries } = await L('lib/registry.mjs'); const { coreDir, project } = await L('lib/project.mjs');
try { loadEntries({ coreRoot: coreDir, manifest: project.manifest }); out([]); } catch (e) { out([e.message]); }`); }), /which is not in the registry/],
];

export const CASES = cases.length;

export async function checkSelftestGeneric() {
  const problems = [], notes = [];
  const t0 = Date.now();
  for (const [name, run, expect] of cases) {
    let r;
    try { r = await run(); } catch (e) { r = [`check crashed: ${e.message}`]; }
    if (expect === null) { if (r.length) problems.push(`${name}: ${r[0].slice(0, 220)}`); else notes.push(`held: ${name}`); }
    else if (!r.length) problems.push(`${name}: nothing was reported; the defect went undetected`);
    else if (!expect.test(r.join('\n'))) problems.push(`${name}: reported something else (${r[0].slice(0, 160)}), expected ${expect}`);
    else notes.push(`caught: ${name}`);
  }
  notes.push(`${cases.length} generic-fixture tests run in ${((Date.now() - t0) / 1000).toFixed(0)} s (project: ${fx.name}, a second project that shares no value with ${project.name})`);
  return { problems, notes };
}

if (isMain(import.meta.url)) {
  const { problems, notes } = await checkSelftestGeneric();
  notes.forEach((x) => console.log('  ' + x));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:selftest-generic`);
  process.exit(problems.length ? 1 : 0);
}
