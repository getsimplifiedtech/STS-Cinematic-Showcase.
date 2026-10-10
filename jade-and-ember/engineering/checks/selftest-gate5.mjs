// check:selftest-gate5. Tests of the cross-browser harness itself (Gate 5, Phase 1): that no check can be left out of the matrix silently, that engine
// adaptations are reported, and that check:d11 notices an engine that ignores the style-attribute hashes. Runs in the Chromium job.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { adaptContextOptions, takeAdaptations } from '../lib/browser.mjs';
import { SCOPE, engineChecks, renderMatrix } from '../lib/cross-catalogue.mjs';
import { checkD11 } from './d11.mjs';
import { checkCiFile } from './ci.mjs';
import { loadPolicy } from '../lib/security.mjs';
import { reconcile, setEngine } from '../lib/findings.mjs';
import { engineNoise } from '../lib/engine-noise.mjs';
import { engDir, isMain, repoRoot } from '../lib/git.mjs';

const verifyIds = () => [...readFileSync(join(engDir, 'verify.mjs'), 'utf8').matchAll(/\['(check:[a-z0-9-]+)'/g)].map((m) => m[1]);
const runnerIds = () => [...readFileSync(join(engDir, 'cross-browser.mjs'), 'utf8').matchAll(/^\s+'(check:[a-z0-9-]+)': \(\) =>/gm)].map((m) => m[1]);
const clone = (o) => JSON.parse(JSON.stringify(o));
const wf = readFileSync(join(repoRoot, '.github', 'workflows', 'jade-and-ember-verify.yml'), 'utf8');

// [name, async () => problems[], expected regex | null (must find nothing)]
const cases = [
  ['catalogue: every check of verify.mjs is classified', () => [...new Set(verifyIds())].filter((id) => !SCOPE[id]).map((id) => `${id} is in verify.mjs but not classified in cross-catalogue.mjs`), null],
  ['catalogue: nothing classified that verify.mjs does not run', () => Object.keys(SCOPE).filter((id) => !verifyIds().includes(id)).map((id) => `${id} is classified but verify.mjs does not run it`), null],
  ['catalogue: every browser-driven check has a runner in cross-browser.mjs', () => engineChecks().filter((id) => !runnerIds().includes(id)).map((id) => `${id} is browser-driven but the cross-browser runner does not run it`), null],
  ['catalogue: the runner runs nothing that is not browser-driven', () => runnerIds().filter((id) => !engineChecks().includes(id)).map((id) => `${id} is run by the runner but not classified as browser-driven`), null],
  ['catalogue: every not-applicable classification states its reason', () => Object.entries(SCOPE).filter(([, [s, r]]) => s !== 'engine' && String(r).length < 25).map(([id]) => `${id} has no real reason`), null],
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
