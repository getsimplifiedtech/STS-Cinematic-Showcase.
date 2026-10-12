// check:selftest-gate5. Tests of the cross-browser harness itself (Gate 5, Phase 1): that no check can be left out of the matrix silently, that engine
// adaptations are reported, and that check:d11 notices an engine that ignores the style-attribute hashes. Runs in the Chromium job.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { adaptContextOptions, takeAdaptations } from '../lib/browser.mjs';
import { SCOPE, engineChecks, renderMatrix } from '../lib/cross-catalogue.mjs';
import { baselineLabel, coreDir, project, workflowPath } from '../lib/project.mjs';
import { entryProblems, loadEntries } from '../lib/registry.mjs';
import { checkD11 } from './d11.mjs';
import { checkCiFile } from './ci.mjs';
import { loadPolicy } from '../lib/security.mjs';
import { reconcile, setEngine } from '../lib/findings.mjs';
import { engineNoise } from '../lib/engine-noise.mjs';
import { checkSupports } from './supports.mjs';
import { approvedStyleDifference } from '../lib/approved-styles.mjs';
import { assembleCandidate } from '../lib/site.mjs';
import { readFileSync as rf, writeFileSync, rmSync } from 'node:fs';
import { projectDir, readJson } from '../lib/git.mjs';
import { engDir, isMain, repoRoot } from '../lib/git.mjs';

// what the verifier runs and what the cross-browser runner runs are both read from the check registry; the runner source must not carry a list of its own
const entriesNow = () => loadEntries({ coreRoot: coreDir, manifest: project.manifest, label: baselineLabel });
const verifyIds = () => entriesNow().map((e) => e.id);
const crossSource = () => readFileSync(join(engDir, 'cross-browser.mjs'), 'utf8');
const runnerIds = () => [...crossSource().matchAll(/^\s+'(check:[a-z0-9-]+)': \(\) =>/gm).map((m) => m[1]), ...(/loadEntries\(/.test(crossSource()) ? entriesNow().filter((e) => e.scope === 'engine').map((e) => e.id) : [])];
const clone = (o) => JSON.parse(JSON.stringify(o));
const wf = readFileSync(workflowPath(), 'utf8');

// [name, async () => problems[], expected regex | null (must find nothing)]
const cases = [
  ['catalogue: every check the verifier runs is classified', () => [...new Set(verifyIds())].filter((id) => !SCOPE[id]).map((id) => `${id} is in the registry but not classified in the catalogue`), null],
  ['catalogue: nothing classified that the verifier does not run', () => Object.keys(SCOPE).filter((id) => !verifyIds().includes(id)).map((id) => `${id} is classified but the verifier does not run it`), null],
  ['catalogue: every browser-driven check has a runner in cross-browser.mjs', () => engineChecks().filter((id) => !runnerIds().includes(id)).map((id) => `${id} is browser-driven but the cross-browser runner does not run it`), null],
  ['catalogue: the runner runs nothing that is not browser-driven', () => runnerIds().filter((id) => !engineChecks().includes(id)).map((id) => `${id} is run by the runner but not classified as browser-driven`), null],
  ['catalogue: every not-applicable classification states its reason', () => Object.entries(SCOPE).filter(([, [s, r]]) => s !== 'engine' && String(r).length < 25).map(([id]) => `${id} has no real reason`), null],
  ['registry: an entry with no scope is refused', () => entryProblems({ id: 'check:x', tier: 'fast', describe: 'x' }), /scope must be one of/],
  ['registry: a check that does not run in every engine must say why', () => entryProblems({ id: 'check:x', tier: 'fast', scope: 'static', describe: 'x', reason: 'no' }), /states a real reason/],
  ['registry: a project cannot list a check twice', () => { try { loadEntries({ coreRoot: coreDir, manifest: { ...project.manifest, checks: { project: [{ id: 'check:keyboard', module: 'a.mjs', export: 'a', tier: 'full', after: 'check:html', scope: 'engine', describe: 'x' }] } } }); return []; } catch (e) { return [e.message]; } }, /check:keyboard is listed twice/],
  ['registry: a project cannot follow a check that does not exist', () => { try { loadEntries({ coreRoot: coreDir, manifest: { ...project.manifest, checks: { project: [{ id: 'check:extra', module: 'a.mjs', export: 'a', tier: 'full', after: 'check:nothing', scope: 'engine', describe: 'x' }] } } }); return []; } catch (e) { return [e.message]; } }, /check:nothing, which is not in the registry/],
  ['registry: a project check is added after the check it names and the base list is unchanged', () => { const base = loadEntries({ coreRoot: coreDir, manifest: { ...project.manifest, checks: { project: [] }, industry: null } }).map((e) => e.id); const e = loadEntries({ coreRoot: coreDir, manifest: { ...project.manifest, checks: { project: [{ id: 'check:extra', module: 'a.mjs', export: 'a', tier: 'full', after: 'check:order', scope: 'static', reason: 'an invented project check for this test; no browser', describe: 'x' }] }, industry: null } }).map((x) => x.id); return e.filter((i) => i !== 'check:extra').join() === base.join() && e[e.indexOf('check:order') + 1] === 'check:extra' ? [] : ['the merged list is not the base list plus the new check after check:order']; }, null],
  ['catalogue: a missing classification would be caught', () => { const bad = { ...SCOPE }; delete bad['check:keyboard']; return Object.keys(SCOPE).filter((id) => !bad[id]); }, /check:keyboard/],
  ['matrix: lists every check exactly once', () => { const rows = renderMatrix('firefox', Object.fromEntries(engineChecks().map((id) => [id, { state: 'pass', detail: '1 s' }]))); const p = []; for (const id of Object.keys(SCOPE)) if (rows.filter((r) => r.includes(id.padEnd(22))).length !== 1) p.push(`${id} appears ${rows.filter((r) => r.includes(id.padEnd(22))).length} times`); if (rows.some((r) => r.includes('MISSING'))) p.push('a MISSING row with complete results'); return p; }, null],
  ['matrix: a check the runner forgot is shown as MISSING, never as a pass', () => { const res = Object.fromEntries(engineChecks().map((id) => [id, { state: 'pass', detail: '1 s' }])); delete res['check:phone']; return renderMatrix('webkit', res).filter((r) => /MISSING/.test(r) && /check:phone/.test(r)); }, /MISSING/],
  ['matrix: a not-applicable engine check is shown with its reason', () => renderMatrix('firefox', { ...Object.fromEntries(engineChecks().map((id) => [id, { state: 'pass', detail: 'x' }])), 'check:forced-colors': { state: 'n/a', detail: 'no emulation' } }).filter((r) => /N\/A\s+check:forced-colors.*no emulation/.test(r)), /no emulation/],
  ['adaptation: Firefox cannot honour isMobile, so it is dropped and REPORTED', () => { takeAdaptations(); const o = adaptContextOptions('firefox', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const n = takeAdaptations(); return [...(o.isMobile !== undefined ? ['isMobile was not dropped'] : []), ...(o.hasTouch !== true ? ['hasTouch was lost'] : []), ...(n.length === 1 && /isMobile/.test(n[0]) ? [] : [`the drop was not reported: ${JSON.stringify(n)}`])]; }, null],
  ['adaptation: Chromium and WebKit options are left exactly as given', () => { takeAdaptations(); const a = { isMobile: true, hasTouch: true }; const p = []; for (const e of ['chromium', 'webkit']) if (JSON.stringify(adaptContextOptions(e, a)) !== JSON.stringify(a)) p.push(`${e} options were changed`); if (takeAdaptations().length) p.push('an adaptation was reported for an engine that needs none'); return p; }, null],
  ['adaptation: an option that is false or absent is not reported', () => { takeAdaptations(); adaptContextOptions('firefox', { isMobile: false }); adaptContextOptions('firefox', { viewport: { width: 1, height: 1 } }); return takeAdaptations(); }, null],
  ['d11: an engine that ignores the style-attribute hashes is caught', async () => { const p = clone(loadPolicy()); p.csp['style-src-attr'] = ["'unsafe-hashes'"]; return (await checkD11({ policy: p })).problems; }, /does NOT honour|style violation/],
  ['findings: a finding recorded for one engine is not stale in another, and is NEW if it appears there', () => { const k = [{ id: 'F-T', key: 'k', engines: ['webkit'] }]; setEngine('firefox'); const a = reconcile('x', [], k.filter((f) => !f.engines || f.engines.includes('firefox'))); const mine = (e) => { setEngine(e); return reconcile('x', [{ key: 'k', detail: 'seen' }], k.filter((f) => !f.engines || f.engines.includes(e))); }; const wk = mine('webkit'), ff = mine('firefox'); setEngine('chromium'); return [...a.problems.map((x) => 'stale: ' + x), ...wk.problems.map((x) => 'webkit: ' + x), ...ff.problems.filter((x) => /^k: seen/.test(x)).map(() => 'NEW-IN-OTHER-ENGINE')]; }, /NEW-IN-OTHER-ENGINE/],
  ['noise: the Firefox hero-preload warning is recognised in Firefox only', () => { const m = 'Preload of http://127.0.0.1:1/media/hero-wok-m.webp was ignored due to unknown \u201cas\u201d or \u201ctype\u201d values, or non-matching \u201cmedia\u201d attribute'; return ['chromium', 'webkit'].filter((e) => engineNoise(e, m)).map((e) => `${e} filtered the message`).concat(engineNoise('firefox', m) ? [] : ['firefox did not recognise it']); }, null],
  ['noise: any other console message is never filtered', () => ['firefox', 'chromium', 'webkit'].filter((e) => engineNoise(e, 'Preload of http://x/media/other.webp was ignored') || engineNoise(e, 'Refused to apply inline style')).map((e) => `${e} filtered an unrelated message`), null],
  ['supports: an engine whose answer differs from the record is caught', async () => { const f = clone(readJson(join(engDir, 'engine-features.json')).features); f[0].expected.chromium = true; return (await checkSupports({ features: f })).problems; }, /STOPS applying|APPLIES in/],
  ['supports: a stylesheet without the approved rule is caught', async () => { const dir = assembleCandidate(projectDir, 'supports-selftest'); try { const p = join(dir, 'styles.css'); writeFileSync(p, rf(p, 'utf8').replace(/@supports \(hanging-punctuation:first\)\{[^}]*\{[^}]*\}\}/, '')); return (await checkSupports({ root: dir })).problems; } finally { rmSync(dir, { recursive: true, force: true }); } }, /missing from the delivered styles\.css/],
  ['supports: every engine of the matrix has a recorded expectation', () => { const f = readJson(join(engDir, 'engine-features.json')).features; return f.flatMap((x) => ['chromium', 'firefox', 'webkit'].filter((e) => typeof x.expected[e] !== 'boolean').map((e) => `${x.id}: no expectation for ${e}`)); }, null],
  ['supports: the untouched site passes (must find nothing)', async () => (await checkSupports({})).problems, null],
  ['approved styles: accepted in the named engine only, with exact values and unchanged geometry', () => {
    const ok = { entries: [{ id: 'T', engines: ['webkit'], match: { tag: 'th', inHoursTable: true }, properties: ['white-space', 'min-width'], exact: { 'white-space': ['nowrap', 'normal'] } }] };
    const b = { '[tag]': 'th', '[inHoursTable]': 'true', 'white-space': 'nowrap', 'min-width': 'auto', '[geometry]': '1,2,3,4', color: 'red' }, c = { ...b, 'white-space': 'normal', 'min-width': 'max-content' };
    const p = [];
    if (!approvedStyleDifference(ok, 'webkit', b, c)) p.push('the approved difference was refused in webkit');
    for (const e of ['chromium', 'firefox']) if (approvedStyleDifference(ok, e, b, c)) p.push(`accepted in ${e}`);
    if (approvedStyleDifference(ok, 'webkit', b, { ...c, '[geometry]': '1,2,9,4' })) p.push('accepted although the geometry changed');
    if (approvedStyleDifference(ok, 'webkit', b, { ...c, color: 'blue' })) p.push('accepted although another property changed');
    if (approvedStyleDifference(ok, 'webkit', b, { ...c, 'white-space': 'pre' })) p.push('accepted although the value is not the approved one');
    if (approvedStyleDifference(ok, 'webkit', { ...b, '[inHoursTable]': 'false' }, { ...c, '[inHoursTable]': 'false' })) p.push('accepted for an element outside the hours table');
    return p; }, null],
  ['ci: a cross-browser job that may fail but is not named informational is refused', () => checkCiFile(wf.replace('cross-browser: Firefox (informational)', 'cross-browser: Firefox'), { docs: false }).problems, /continue-on-error is only allowed/],
  ['ci: a cross-browser job that installs no browser is refused', () => checkCiFile(wf.replace('npx playwright install --with-deps firefox', 'echo no-browser'), { docs: false }).problems, /does not install firefox/],
  ['ci: the Chromium verify job is unchanged and still blocking', () => checkCiFile(wf.replace('        run: npm run verify\n', '        run: echo skipped\n'), { docs: false }).problems, /must run npm run verify/],
  ['ci: the untouched workflow passes (must find nothing)', () => checkCiFile(wf, { docs: false }).problems, null],
];

export async function checkSelftestGate5() {
  const problems = [], notes = [];
  const t0 = Date.now();
  for (const [name, run, expect] of cases) {
    let r;
    try { r = await run(); } catch (e) { r = [`check crashed: ${e.message}`]; }
    if (expect === null) { if (r.length) problems.push(`${name}: ${r[0].slice(0, 200)}`); else notes.push(`held: ${name}`); }
    else if (!r.length) problems.push(`${name}: nothing was reported; the defect went undetected`);
    else if (!expect.test(r.join('\n'))) problems.push(`${name}: reported something else (${r[0].slice(0, 160)}), expected ${expect}`);
    else notes.push(`caught: ${name}`);
  }
  notes.push(`${cases.length} harness tests run in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  return { problems, notes };
}

if (isMain(import.meta.url)) {
  const { problems, notes } = await checkSelftestGate5();
  notes.forEach((x) => console.log('  ' + x));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:selftest-gate5`);
  process.exit(problems.length ? 1 : 0);
}
