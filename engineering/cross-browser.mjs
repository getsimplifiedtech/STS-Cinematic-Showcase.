// node engineering/cross-browser.mjs --engine firefox|webkit|chromium [--only check:keyboard,check:reflow] [--timeout-minutes 12]
// Gate 5, Phase 1. Runs every browser-driven check of `npm run verify` inside ONE engine, with the same assertions as the Chromium job, then prints
//   1. the engine and its capabilities (version, media codecs, CSS features the stylesheet uses),
//   2. every check with its result, its adaptations (engine options Playwright cannot honour) and its problems,
//   3. a matrix of ALL checks for the engine: run, not applicable (with the reason) or missing, so nothing is skipped silently.
// Nothing is weakened: a problem is a problem. Real incompatibilities are recorded as findings in findings.json by a person after review; they are never
// hidden here. The release gate's verification report (.reports/verify.json) is NOT touched.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { takeAdaptations, launchBrowser } from './lib/browser.mjs';
import { engineChecks, renderMatrix, SCOPE } from './lib/cross-catalogue.mjs';
import { setEngine } from './lib/findings.mjs';
import { engDir, projectDir } from './lib/git.mjs';
import { baselineLabel, coreDir, project, stylesheet } from './lib/project.mjs';
import { loadEntries } from './lib/registry.mjs';
import { runEntry } from './checks/runners.mjs';

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d; };
const engine = arg('--engine', 'chromium');
if (!['chromium', 'firefox', 'webkit'].includes(engine)) { console.error('usage: cross-browser.mjs --engine chromium|firefox|webkit'); process.exit(2); }
setEngine(engine);
const only = arg('--only') ? arg('--only').split(',') : null;
const limitMs = Number(arg('--timeout-minutes', 12)) * 60000;

// The runnable checks are the registry's engine-scope entries (checks.json, the industry adapter, the project manifest), called with the same arguments the Chromium job uses.
const RUN = Object.fromEntries(loadEntries({ coreRoot: coreDir, manifest: project.manifest, label: baselineLabel }).filter((e) => e.scope === 'engine').map((e) => [e.id, () => runEntry(e, { fast: false, browserName: engine, strictEnv: false })]));

// ---- 1. capabilities of the engine, and the CSS features the stylesheet actually uses
const FEATURES = [
  ['aspect-ratio', /aspect-ratio/, () => CSS.supports('aspect-ratio', '2 / 1')], ['object-fit', /object-fit/, () => CSS.supports('object-fit', 'cover')],
  ['clamp()', /clamp\(/, () => CSS.supports('width', 'clamp(1px, 2vw, 3px)')], ['min()/max()', /\b(min|max)\(/, () => CSS.supports('width', 'min(1px, 2px)')],
  ['inset', /\binset:/, () => CSS.supports('inset', '0')], ['mask-image', /mask-image|mask:/, () => CSS.supports('mask-image', 'linear-gradient(#000, #000)') || CSS.supports('-webkit-mask-image', 'linear-gradient(#000, #000)')],
  ['backdrop-filter', /backdrop-filter/, () => CSS.supports('backdrop-filter', 'blur(2px)') || CSS.supports('-webkit-backdrop-filter', 'blur(2px)')],
  [':focus-visible', /:focus-visible/, () => CSS.supports('selector(:focus-visible)')], [':has()', /:has\(/, () => CSS.supports('selector(:has(a))')],
  ['color-mix()', /color-mix\(/, () => CSS.supports('color', 'color-mix(in srgb, red, blue)')], ['dvh/svh units', /\d(dvh|svh|lvh)/, () => CSS.supports('height', '100dvh')],
  ['text-wrap', /text-wrap/, () => CSS.supports('text-wrap', 'balance')], ['accent-color', /accent-color/, () => CSS.supports('accent-color', 'red')],
  ['scroll-behavior', /scroll-behavior/, () => CSS.supports('scroll-behavior', 'smooth')], ['forced-colors media query', /forced-colors/, () => matchMedia('(forced-colors: none)').matches || matchMedia('(forced-colors: active)').matches],
  ['prefers-reduced-motion', /prefers-reduced-motion/, () => matchMedia('(prefers-reduced-motion: reduce)').media !== 'not all'], ['@property', /@property/, () => typeof CSS.registerProperty === 'function'],
  ['font-display / fonts API', /font-display|@font-face/, () => !!document.fonts && typeof document.fonts.load === 'function'], ['transform/animation', /@keyframes/, () => CSS.supports('animation-name', 'x')],
];
async function capabilities() {
  const { browser, version } = await launchBrowser(engine);
  const css = readFileSync(join(projectDir, stylesheet), 'utf8');
  const used = FEATURES.filter(([, re]) => re.test(css));
  try {
    const page = await browser.newPage();
    await page.setContent('<video id="v"></video>');
    const r = await page.evaluate((fnSrcs) => {
      const v = document.getElementById('v');
      const codecs = { 'webm vp9': 'video/webm; codecs="vp9"', 'webm vp8': 'video/webm; codecs="vp8"', 'mp4 h.264': 'video/mp4; codecs="avc1.64001f"' };
      return { ua: navigator.userAgent, codecs: Object.fromEntries(Object.entries(codecs).map(([k, t]) => [k, v.canPlayType(t) || 'no'])), features: fnSrcs.map(([n, src]) => { try { return [n, !!eval(`(${src})()`)]; } catch (e) { return [n, `error: ${e.message}`]; } }) };
    }, used.map(([n, , fn]) => [n, fn.toString()]));
    await page.close();
    console.log(`\n== engine: ${engine} ${version}`);
    console.log(`  user agent: ${r.ua}`);
    console.log(`  video support (canPlayType): ${Object.entries(r.codecs).map(([k, v]) => `${k}: ${v}`).join('; ')}`);
    console.log(`  CSS features used by ${stylesheet} (${r.features.length}): ${r.features.map(([n, ok]) => `${n}: ${ok === true ? 'supported' : ok === false ? 'NOT SUPPORTED (check the fallback)' : ok}`).join('; ')}`);
    return { version, ...r };
  } finally { await browser.close(); }
}

const withTimeout = (p, ms, id) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${id} exceeded ${ms / 60000} minutes and was stopped by the runner`)), ms))]);

const t00 = Date.now();
let caps = null;
try { caps = await capabilities(); } catch (e) { console.log(`\n== engine: ${engine}\n  CAPABILITY PROBE FAILED: ${e.message.split('\n')[0]}`); }
const results = {}, report = [];
for (const id of engineChecks()) {
  if (only && !only.includes(id)) continue;
  const t0 = Date.now();
  console.log(`\n== ${id} in ${engine}`);
  let r;
  try { r = await withTimeout(RUN[id](), limitMs, id); } catch (e) { r = { problems: [`check crashed in ${engine}: ${(e.stack || e.message).split('\n').slice(0, 6).join(' | ')}`], notes: [] }; }
  const adapt = takeAdaptations();
  adapt.forEach((a) => console.log(`  ADAPTED: ${a}`));
  r.notes.forEach((n) => console.log('  ' + n));
  r.problems.forEach((p) => console.log('  - ' + p));
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const state = r.notApplicable ? 'n/a' : r.problems.length ? 'fail' : 'pass';
  console.log(`${state === 'pass' ? 'PASS' : state === 'fail' ? 'FAIL' : 'N/A '}  ${id} in ${engine} (${secs} s)`);
  results[id] = { state, detail: state === 'fail' ? `${r.problems.length} problem(s)` : state === 'n/a' ? r.notes[0]?.slice(0, 200) : `${secs} s${adapt.length ? `, ${adapt.length} adaptation(s)` : ''}`, seconds: Number(secs) };
  report.push({ id, state, seconds: Number(secs), adaptations: adapt, problems: r.problems, notes: r.notes });
}

console.log(`\n== cross-browser matrix: ${engine}${caps ? ' ' + caps.version : ''}`);
if (only) console.log(`  (partial run: ${only.join(', ')})`);
renderMatrix(engine, only ? Object.fromEntries(Object.keys(SCOPE).map((k) => [k, results[k] || (SCOPE[k][0] === 'engine' ? { state: 'n/a', detail: 'not selected in this partial run' } : undefined)]).filter(([, v]) => v)) : results).forEach((l) => console.log(l));
const failed = report.filter((x) => x.state === 'fail').length, na = report.filter((x) => x.state === 'n/a').length;
console.log(`\n  ${engine}: ${report.length - failed - na} passed, ${failed} failed, ${na} not applicable, of ${report.length} browser-driven checks run (${((Date.now() - t00) / 60000).toFixed(1)} min)`);
mkdirSync(join(engDir, '.reports'), { recursive: true });
writeFileSync(join(engDir, '.reports', `cross-${engine}.json`), JSON.stringify({ engine, version: caps?.version ?? null, capabilities: caps, report }, null, 2));
process.exit(failed ? 1 : 0);
