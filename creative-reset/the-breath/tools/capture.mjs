// Capture and measurement harness for The Breath (lab). Not part of the site; no dependency is added to the repository.
// It needs a Playwright that is already installed (set PLAYWRIGHT_MODULE to its index.mjs if `playwright` does not resolve), and the lab served
// locally:  python3 tools/serve.py 8431   then   node tools/capture.mjs --only=shots,modes --out=shots
//
// IMPORTANT: headless Chromium here renders WebGL in software (SwiftShader). Frame times it reports are the worst case for the code path and are
// NOT evidence of real-device performance. Real-device testing (iPhone Safari, a mid-range Android Chrome) is still required.
import { writeFileSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..');
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] ?? d;
const BASE = arg('base', 'http://localhost:8431/'), OUT = join(root, arg('out', 'shots')), ONLY = arg('only', 'shots,modes,keyboard,reverse,resize,gating,perf,assets').split(',');
const STEPS = +arg('steps', 300);
mkdirSync(OUT, { recursive: true });
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const results = {}; const log = (...a) => console.log(...a);
const browser = await chromium.launch({ args: GL });

async function open(vp, { ctx = {}, query = '', init, js = true } = {}) {
  const [w, h] = vp.split('x').map(Number);
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 600, isMobile: w < 600, javaScriptEnabled: js, ...ctx });
  if (init) await context.addInitScript(init);
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(BASE + 'index.html' + query); await page.waitForLoadState('load');
  return { context, page, errors };
}
const seek = (page, p) => page.evaluate(([p, o]) => window.lab.seek(p, o), [p, { steps: STEPS, span: .3 }]);
const shot = (page, name) => page.screenshot({ path: join(OUT, name + '.png') });

// ---------------------------------------------------------------- 1. the sequence, desktop and mobile
if (ONLY.includes('shots')) {
  results.shots = {};
  for (const [vp, tag, ps] of [['1440x900', 'desktop-1440x900', [0, .2, .36, .52, .7, .8, 1]], ['390x844', 'mobile-390x844', [0, .2, .36, .52, .7, .8, 1]]]) {
    const { context, page, errors } = await open(vp, { query: '?lab=1&perf=off&video=off' });
    await page.evaluate(() => window.lab.ready());
    for (const p of ps) { await seek(page, p); await page.waitForTimeout(120); await shot(page, `${tag}-p${String(Math.round(p * 100)).padStart(3, '0')}`); }
    results.shots[tag] = { errors, stats: await page.evaluate(() => window.lab.stats()) };
    await context.close(); log('shots', tag);
  }
}

// ---------------------------------------------------------------- 2. degraded modes
if (ONLY.includes('modes')) {
  results.modes = {};
  const cases = {
    'reduced-motion': { ctx: { reducedMotion: 'reduce' } },
    'save-data': { init: () => { Object.defineProperty(navigator, 'connection', { value: { saveData: true, effectiveType: '4g' } }); } },
    'no-webgl2': { init: () => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...r) { return t === 'webgl2' ? null : g.call(this, t, ...r); }; } },
    'no-javascript': { js: false },
  };
  for (const [name, c] of Object.entries(cases)) for (const vp of ['1440x900', '390x844']) {
    const { context, page, errors } = await open(vp, { ...c, query: '?perf=off' });
    await page.waitForTimeout(800);
    const info = c.js === false ? { mode: 'no-js' } : await page.evaluate(() => ({ mode: window.lab.mode, stats: window.lab.stats(), canvasVisible: getComputedStyle(document.querySelector('.steam')).visibility, video: !!document.querySelector('.flame source') }));
    const h = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    const frames = {};
    for (const [label, f] of [['top', 0], ['mid', .34], ['steam', .52], ['plate', .9]]) {
      await page.evaluate((y) => window.scrollTo(0, y), c.js === false ? 0 : 0).catch(() => {});
      await page.mouse.wheel(0, 0);
      const y = Math.round(f * h);
      if (c.js === false) { await page.keyboard.press('Home'); await page.mouse.wheel(0, y); } else { await page.evaluate((y) => window.scrollTo(0, y), y); }
      await page.waitForTimeout(350);
      await shot(page, `mode-${name}-${vp}-${label}`); frames[label] = y;
    }
    results.modes[`${name}@${vp}`] = { ...info, errors, scrollHeight: h, positions: frames };
    await context.close(); log('mode', name, vp, info.mode);
  }
}

// ---------------------------------------------------------------- 3. keyboard: tab order, visible focus, Pause toggles
if (ONLY.includes('keyboard')) {
  const { context, page, errors } = await open('1440x900', { query: '?perf=off&video=off' });
  await page.waitForTimeout(1500);
  const order = [];
  for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); order.push(await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return 'body'; const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return `${e.tagName.toLowerCase()}.${e.className || ''}|${(e.textContent || '').trim().slice(0, 24)}|${Math.round(r.top)}|outline:${cs.outlineStyle}/${cs.outlineWidth}`; })); }
  await page.focus('.pause'); await shot(page, 'keyboard-focus-pause');
  const before = await page.evaluate(() => ({ pressed: document.querySelector('.pause').getAttribute('aria-pressed'), mode: window.lab.mode }));
  await page.keyboard.press('Enter'); await page.waitForTimeout(500);
  const after = await page.evaluate(() => ({ pressed: document.querySelector('.pause').getAttribute('aria-pressed'), label: document.querySelector('.pause-txt').textContent, mode: window.lab.mode }));
  await page.keyboard.press('Space'); await page.waitForTimeout(500);
  const back = await page.evaluate(() => ({ pressed: document.querySelector('.pause').getAttribute('aria-pressed'), label: document.querySelector('.pause-txt').textContent, mode: window.lab.mode }));
  // keyboard scrolling keeps working while the pointer is over the stage
  await page.keyboard.press('PageDown'); await page.waitForTimeout(2500);
  const y = await page.evaluate(() => scrollY);
  // the narrative stays readable by assistive technology: every beat heading is in the accessibility tree in order
  const tree = await page.evaluate(() => [...document.querySelectorAll('.beat h1, .beat h2')].map((h) => ({ t: h.textContent.trim(), hidden: getComputedStyle(h).visibility === 'hidden' || getComputedStyle(h.closest('.beat')).display === 'none' })));
  results.keyboard = { order, pause: { before, after, back }, pageDownMovedTo: y, headings: tree, errors };
  await context.close(); log('keyboard ok');
}

// ---------------------------------------------------------------- 4. reverse scrolling with the real loop (not the deterministic seek)
if (ONLY.includes('reverse')) {
  const { context, page, errors } = await open('1440x900', { query: '?perf=off&video=off&quality=low' });
  await page.waitForTimeout(2500);
  const H = await page.evaluate(() => document.querySelector('[data-breath]').offsetHeight - innerHeight);
  const wheelTo = async (p) => { const cur = await page.evaluate(() => scrollY); const target = p * H; const n = 14; for (let i = 1; i <= n; i++) { await page.mouse.wheel(0, (target - cur) / n); await page.waitForTimeout(120); } };
  const sample = () => page.evaluate(() => { const o = {}; for (const el of document.querySelectorAll('.beat')) o[el.className.match(/beat-\d/)[0]] = [+el.style.getPropertyValue('--in'), +el.style.getPropertyValue('--out')]; return { p: +window.lab.p.toFixed(3), beats: o, clear: window.lab.steam?.P.clear, spread: window.lab.steam?.P.spread }; });
  const trace = [];
  for (const p of [.2, .52, .8, .52, .2, 0]) { await wheelTo(p); await page.waitForTimeout(2500); trace.push(await sample()); await shot(page, `reverse-${trace.length}-p${Math.round(p * 100)}`); }
  results.reverse = { trace, errors };
  await context.close(); log('reverse ok');
}

// ---------------------------------------------------------------- 5. viewport resizing
if (ONLY.includes('resize')) {
  const { context, page, errors } = await open('1440x900', { query: '?perf=off&video=off&quality=low' });
  await page.waitForTimeout(1500); const steps = [];
  for (const vp of ['1024x768', '390x844', '844x390', '1440x900']) {
    const [w, h] = vp.split('x').map(Number); await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(1500);
    steps.push({ vp, ...(await page.evaluate(() => ({ canvas: [document.querySelector('.steam').width, document.querySelector('.steam').height], grids: window.lab.stats().grids, mode: window.lab.mode, overflowX: document.documentElement.scrollWidth > innerWidth }))) });
    await shot(page, `resize-${vp}`);
  }
  results.resize = { steps, errors }; await context.close(); log('resize ok');
}

// ---------------------------------------------------------------- 6. hidden tab and off-screen: the loop must stop
if (ONLY.includes('gating')) {
  const { context, page, errors } = await open('1440x900', { query: '?perf=off&video=off&quality=low' });
  await page.waitForTimeout(2500);
  const frames = () => page.evaluate(() => window.lab.stats().frames);
  const r = {}; let a = await frames(); await page.waitForTimeout(2000); let b = await frames(); r.visible = { frames: b - a, raf: await page.evaluate(() => window.lab.stats().raf) };
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(300); a = await frames(); await page.waitForTimeout(2000); b = await frames(); r.hiddenTab = { frames: b - a, raf: await page.evaluate(() => window.lab.stats().raf) };
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(1500); a = await frames(); await page.waitForTimeout(2000); b = await frames(); r.resumed = { frames: b - a, raf: await page.evaluate(() => window.lab.stats().raf) };
  await page.evaluate(() => document.querySelector('#menu-stub').scrollIntoView()); await page.mouse.wheel(0, 3000); await page.waitForTimeout(1200);
  a = await frames(); await page.waitForTimeout(2000); b = await frames(); r.offScreen = { frames: b - a, raf: await page.evaluate(() => window.lab.stats().raf), inView: await page.evaluate(() => window.lab.stats().inView) };
  results.gating = { ...r, errors }; await context.close(); log('gating ok', JSON.stringify(r));
}

// ---------------------------------------------------------------- 7. performance of the real loop (software GL: worst case, not representative)
if (ONLY.includes('perf')) {
  results.perf = {};
  for (const [vp, q] of [['1440x900', 'mid'], ['390x844', 'low']]) {
    const { context, page, errors } = await open(vp, { query: `?perf=off&video=off&quality=${q}` });
    await page.waitForTimeout(2000);
    await page.evaluate(() => { const b = document.querySelector('[data-breath]'); scrollTo(0, b.offsetTop + (b.offsetHeight - innerHeight) * .5); });
    await page.waitForTimeout(6000); await page.evaluate(() => window.lab.resetStats()); await page.waitForTimeout(8000);
    results.perf[`${vp}-${q}`] = { ...(await page.evaluate(() => window.lab.stats())), errors };
    await context.close(); log('perf', vp, q);
  }
}

// ---------------------------------------------------------------- 8. asset sizes (bytes on disk, gzip for text)
if (ONLY.includes('assets')) {
  const files = ['index.html', 'breath.css', 'js/gl.js', 'js/steam.js', 'js/breath.js', ...readdirSync(join(root, 'media')).map((f) => 'media/' + f), ...readdirSync(join(root, 'fonts')).filter((f) => f.endsWith('.woff2')).map((f) => 'fonts/' + f)];
  results.assets = {};
  for (const f of files) { const b = readFileSync(join(root, f)); results.assets[f] = { bytes: statSync(join(root, f)).size, ...(/\.(html|css|js)$/.test(f) ? { gzip: gzipSync(b).length } : {}) }; }
}

let prev = {}; try { prev = JSON.parse(readFileSync(join(OUT, 'results.json'), 'utf8')); } catch (e) { /* first run */ }
writeFileSync(join(OUT, 'results.json'), JSON.stringify({ ...prev, ...results }, null, 1));   // sections run now replace their old values; the rest are kept
await browser.close(); log('wrote', join(OUT, 'results.json'));
