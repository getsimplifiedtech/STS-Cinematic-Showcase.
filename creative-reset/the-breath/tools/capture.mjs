// Capture and measurement harness for The Breath (lab). Not part of the site; no dependency is added to the repository.
// It needs a Playwright that is already installed (set PLAYWRIGHT_MODULE to its index.mjs if `playwright` does not resolve), and the lab served
// locally:  python3 tools/serve.py 8431   then   node tools/capture.mjs --only=shots,modes --out=shots
//
// IMPORTANT: headless Chromium here renders WebGL in software (SwiftShader). Frame times it reports are the worst case for the code path and are
// NOT evidence of real-device performance. Real-device testing (iPhone Safari, a mid-range Android Chrome) is still required.
//
// Two builds are served: the shipped bundle (js/breath.min.js) and the lab bundle (js/breath.lab.js: same code plus window.lab hooks).
// Sections that measure the product (modes, keyboard, gating, perf, load) run the SHIPPED bundle and read only what the browser reports.
// Sections that need deterministic positions or internals (shots, handover, resize, contrast) run the lab bundle.
import { writeFileSync, mkdirSync, statSync, readdirSync, readFileSync } from 'node:fs';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..');
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] ?? d;
const BASE = arg('base', 'http://localhost:8431/'), OUT = join(root, arg('out', 'shots')), ONLY = arg('only', 'shots,modes,keyboard,handover,resize,gating,perf,load,contrast,assets').split(',');
const STEPS = +arg('steps', 240);
mkdirSync(OUT, { recursive: true });
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const results = {}; const log = (...a) => console.log(...a);
const browser = await chromium.launch({ args: GL });

// Counters the shipped bundle cannot provide itself: per-canvas draw and clear calls (a clear on the steam canvas is one frame), frame timestamps,
// paint and layout metrics, long tasks. They observe the page; they do not change what it does.
const PROBE = () => {
  const m = (window.__m = { clears: {}, draws: {}, frames: [], long: [], lcp: 0, fcp: 0, cls: 0 });
  const proto = WebGL2RenderingContext.prototype, cl = proto.clear, da = proto.drawArrays;
  proto.clear = function (...a) { const k = this.canvas.className || '?'; m.clears[k] = (m.clears[k] || 0) + 1; if (k === 'steam') { m.frames.push(performance.now()); if (m.frames.length > 4000) m.frames.shift(); } return cl.apply(this, a); };
  proto.drawArrays = function (...a) { const k = this.canvas.className || '?'; m.draws[k] = (m.draws[k] || 0) + 1; return da.apply(this, a); };
  const obs = (type, fn) => { try { new PerformanceObserver((l) => l.getEntries().forEach(fn)).observe({ type, buffered: true }); } catch (e) { /* unsupported */ } };
  obs('largest-contentful-paint', (e) => { m.lcp = e.startTime; });
  obs('paint', (e) => { if (e.name === 'first-contentful-paint') m.fcp = e.startTime; });
  obs('layout-shift', (e) => { if (!e.hadRecentInput) m.cls += e.value; });
  obs('longtask', (e) => m.long.push([Math.round(e.startTime), Math.round(e.duration)]));
};
const pct = (a, f) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(f * s.length))]; };

async function open(vp, { ctx = {}, query = '', init, js = true, bundle = 'lab', dpr = 1, probe = false, mobile } = {}) {
  const [w, h] = vp.split('x').map(Number);
  const m = mobile ?? w < 600;
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: m, isMobile: m, javaScriptEnabled: js, ...ctx });
  if (probe) await context.addInitScript(PROBE);
  if (init) await context.addInitScript(init);
  const page = await context.newPage(); const errors = [];
  if (bundle === 'lab') await page.route('**/js/breath.min.js', (r) => r.fulfill({ path: join(root, 'js', 'breath.lab.js'), contentType: 'text/javascript' }));
  page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m2) => { if (m2.type() === 'error') errors.push(m2.text()); });
  await page.goto(BASE + 'index.html' + query); await page.waitForLoadState('load');
  return { context, page, errors };
}
const seek = (page, p) => page.evaluate(([p, o]) => window.lab.seek(p, o), [p, { steps: STEPS, span: .3 }]);
const shot = (page, name, o = {}) => page.screenshot({ path: join(OUT, name + '.jpg'), type: 'jpeg', quality: 84, timeout: 180000, ...o });
const modeOf = (page) => page.evaluate(() => (document.documentElement.classList.contains('is-live') ? 'live' : 'calm'));
const state = (page) => page.evaluate(() => { const st = document.querySelector('[data-stage]'), d = document.querySelector('.dish'), s = getComputedStyle(st); return { mode: document.documentElement.classList.contains('is-live') ? 'live' : 'calm', media: +s.getPropertyValue('--media'), dish: +s.getPropertyValue('--dish'), dishCanvas: getComputedStyle(d).visibility, steamCanvas: getComputedStyle(document.querySelector('.steam')).visibility, videoPlaying: !!document.querySelector('.is-video') }; });
const snap = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__m, (k, v) => (k === 'frames' ? undefined : v))));
const frameStats = (page) => page.evaluate(() => { const f = window.__m.frames, d = []; for (let i = 1; i < f.length; i++) d.push(f[i] - f[i - 1]); return d; });
const cdpCpu = async () => { const s = await browser.newBrowserCDPSession(); const r = await s.send('SystemInfo.getProcessInfo'); await s.detach(); const o = {}; for (const p of r.processInfo) o[p.type] = (o[p.type] || 0) + p.cpuTime; return o; };

// ---------------------------------------------------------------- 1. the sequence, desktop and mobile (lab bundle, deterministic)
if (ONLY.includes('shots')) {
  results.shots = {};
  const ps = [0, .2, .36, .52, .62, .66, .70, .74, .78, .84, 1];
  for (const [vp, tag] of [['1440x900', 'desktop-1440x900'], ['390x844', 'mobile-390x844']]) {
    const { context, page, errors } = await open(vp, { query: '?lab=1&perf=off&video=off' });
    await page.evaluate(() => window.lab.ready());
    for (const p of ps) { await seek(page, p); await page.waitForTimeout(120); await shot(page, `${tag}-p${String(Math.round(p * 100)).padStart(3, '0')}`); }
    results.shots[tag] = { errors, stats: await page.evaluate(() => window.lab.stats()), overlap: await page.evaluate(() => window.lab.overlap()) };
    await context.close(); log('shots', tag);
  }
}

// ---------------------------------------------------------------- 2. degraded modes (shipped bundle)
if (ONLY.includes('modes')) {
  results.modes = {};
  const cases = {
    'reduced-motion': { ctx: { reducedMotion: 'reduce' } },
    'save-data': { init: () => { Object.defineProperty(navigator, 'connection', { value: { saveData: true, effectiveType: '4g' } }); } },
    'no-webgl2': { init: () => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...r) { return t === 'webgl2' ? null : g.call(this, t, ...r); }; } },
    'no-javascript': { js: false },
  };
  for (const [name, c] of Object.entries(cases)) for (const vp of ['1440x900', '390x844']) {
    const { context, page, errors } = await open(vp, { ...c, bundle: 'min', query: '?perf=off' });
    await page.waitForTimeout(1200);
    const info = c.js === false ? { mode: 'no-js' } : { ...(await state(page)), videoRequested: await page.evaluate(() => !!document.querySelector('.flame source')), pauseHidden: await page.evaluate(() => document.querySelector('.pause').hidden) };
    const h = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    const frames = {};
    for (const [label, f] of [['top', 0], ['mid', .34], ['steam', .52], ['handover', .7], ['plate', .9]]) {
      const y = Math.round(f * h);
      await page.evaluate((y) => window.scrollTo(0, y), y);
      await page.waitForTimeout(450);
      await shot(page, `mode-${name}-${vp}-${label}`); frames[label] = y;
    }
    results.modes[`${name}@${vp}`] = { ...info, errors, scrollHeight: h, positions: frames, overflowX: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth) };
    await context.close(); log('mode', name, vp, info.mode);
  }
}

// ---------------------------------------------------------------- 3. keyboard: tab order, visible focus, Pause toggles (shipped bundle)
if (ONLY.includes('keyboard')) {
  const { context, page, errors } = await open('1440x900', { bundle: 'min', query: '?perf=off&video=off' });
  await page.waitForTimeout(1800);
  const order = [];
  for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); order.push(await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return 'body'; const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return `${e.tagName.toLowerCase()}.${e.className || ''}|${(e.textContent || '').trim().slice(0, 24)}|${Math.round(r.top)}|outline:${cs.outlineStyle}/${cs.outlineWidth}`; })); }
  await page.focus('.pause'); await shot(page, 'keyboard-focus-pause');
  const read = () => page.evaluate(() => ({ pressed: document.querySelector('.pause').getAttribute('aria-pressed'), label: document.querySelector('.pause-txt').textContent, mode: document.documentElement.classList.contains('is-live') ? 'live' : 'calm' }));
  const before = await read();
  await page.keyboard.press('Enter'); await page.waitForTimeout(600); const after = await read();
  await page.keyboard.press('Space'); await page.waitForTimeout(600); const back = await read();
  await page.keyboard.press('PageDown'); await page.waitForTimeout(2500);
  const y = await page.evaluate(() => scrollY);
  const tree = await page.evaluate(() => [...document.querySelectorAll('.beat h1, .beat h2')].map((h) => ({ t: h.textContent.trim(), hidden: getComputedStyle(h).visibility === 'hidden' || getComputedStyle(h.closest('.beat')).display === 'none' })));
  const canvasesHidden = await page.evaluate(() => ['.dish', '.steam'].map((s) => document.querySelector(s).getAttribute('aria-hidden')));
  results.keyboard = { order, pause: { before, after, back }, pageDownMovedTo: y, headings: tree, canvasAriaHidden: canvasesHidden, errors };
  await context.close(); log('keyboard ok');
}

// ---------------------------------------------------------------- 4. the handover, in both scroll directions, with the real loop (lab bundle, no ?lab so the loop runs)
if (ONLY.includes('handover')) {
  results.handover = {};
  for (const [vp, tag] of [['1440x900', 'desktop'], ['390x844', 'mobile']]) {
    const { context, page, errors } = await open(vp, { query: '?perf=off&video=off&quality=low' });
    await page.waitForTimeout(2500);
    const H = await page.evaluate(() => document.querySelector('[data-breath]').offsetHeight - innerHeight);
    const wheelTo = async (p) => { const cur = await page.evaluate(() => scrollY); const target = p * H; const n = 12; for (let i = 1; i <= n; i++) { await page.mouse.wheel(0, (target - cur) / n); await page.waitForTimeout(100); } };
    const sample = () => page.evaluate(() => { const s = window.lab.steam, st = document.querySelector('[data-stage]'), cs = getComputedStyle(st); return { p: +window.lab.p.toFixed(3), media: +cs.getPropertyValue('--media'), dishCanvas: getComputedStyle(document.querySelector('.dish')).visibility, clear: +(s?.P.clear ?? 0).toFixed(3), spread: +(s?.P.spread ?? 0).toFixed(3), mediaOff: st.classList.contains('media-off') }; });
    const trace = [];
    const route = [.2, .5, .62, .66, .70, .74, .78, .84, .78, .74, .70, .66, .62, .5, .2, 0];
    for (const p of route) { await wheelTo(p); await page.waitForTimeout(vp.startsWith('390') ? 1800 : 3200); const s = await sample(); trace.push({ target: p, ...s }); const dir = trace.length <= 8 ? 'fwd' : 'back'; if (p >= .6 && p <= .85) await shot(page, `handover-${tag}-${dir}-p${String(Math.round(p * 100)).padStart(3, '0')}`); }
    // "never together": any sample where the footage is still visible while the dish canvas is showing
    const together = trace.filter((s) => s.media > .02 && s.dishCanvas === 'visible');
    results.handover[tag] = { trace, samplesWithFootageAndDishTogether: together.length, scan: await page.evaluate(() => window.lab.overlap()), errors };
    await context.close(); log('handover', tag, 'together:', together.length);
  }
}

// ---------------------------------------------------------------- 5. viewport resizing (lab bundle: needs the grids)
if (ONLY.includes('resize')) {
  const { context, page, errors } = await open('1440x900', { query: '?perf=off&video=off&quality=low' });
  await page.waitForTimeout(1500); const steps = [];
  for (const vp of ['1024x768', '390x844', '844x390', '1440x900']) {
    const [w, h] = vp.split('x').map(Number); await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(1800);
    steps.push({ vp, ...(await page.evaluate(() => ({ canvas: [document.querySelector('.steam').width, document.querySelector('.steam').height], dish: [document.querySelector('.dish').width, document.querySelector('.dish').height], grids: window.lab.stats().grids, mode: window.lab.mode, overflowX: document.documentElement.scrollWidth > innerWidth }))) });
    await shot(page, `resize-${vp}`);
  }
  results.resize = { steps, errors }; await context.close(); log('resize ok');
}

// ---------------------------------------------------------------- 6. hidden tab, off-screen, pause: the GPU work must stop (shipped bundle, counters from the probe)
if (ONLY.includes('gating')) {
  const { context, page, errors } = await open('1440x900', { bundle: 'min', probe: true, query: '?perf=off&video=off&quality=low' });
  await page.waitForTimeout(2500);
  const draws = async () => { const m = await snap(page); return (m.draws.steam || 0) + (m.draws.dish || 0); };
  const win = async (ms = 2000) => { const a = await draws(); await page.waitForTimeout(ms); return (await draws()) - a; };
  const r = {};
  r.visible = { drawCallsIn2s: await win() };
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(400); r.hiddenTab = { drawCallsIn2s: await win() };
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(1500); r.resumed = { drawCallsIn2s: await win() };
  await page.evaluate(() => document.querySelector('#menu-stub').scrollIntoView()); await page.mouse.wheel(0, 3000); await page.waitForTimeout(1500);
  r.offScreen = { drawCallsIn2s: await win() };
  await page.evaluate(() => document.querySelector('#main').scrollIntoView()); await page.waitForTimeout(2500);
  r.backOnScreen = { drawCallsIn2s: await win() };
  await page.focus('.pause'); await page.keyboard.press('Enter'); await page.waitForTimeout(900);
  r.pausedByVisitor = { drawCallsIn2s: await win(), mode: await modeOf(page) };
  await page.keyboard.press('Enter'); await page.waitForTimeout(2500);
  r.playAgain = { drawCallsIn2s: await win(), mode: await modeOf(page) };
  // the dish canvas redraws only while the clearing moves: park at the end of the sequence and count
  await page.evaluate(() => { const b = document.querySelector('[data-breath]'); scrollTo(0, b.offsetTop + (b.offsetHeight - innerHeight) * .999); }); await page.waitForTimeout(16000);
  const d0 = (await snap(page)).draws.dish || 0; await page.waitForTimeout(3000); const d1 = (await snap(page)).draws.dish || 0;
  r.dishAtRest = { dishDrawCallsIn3s: d1 - d0 };
  results.gating = { ...r, errors }; await context.close(); log('gating ok', JSON.stringify(r));
}

// ---------------------------------------------------------------- 7. cost of the real loop (shipped bundle). Software GL: a floor for the code path, NOT a device number
if (ONLY.includes('perf')) {
  results.perf = {};
  for (const [vp, q, dpr] of [['1440x900', 'mid', 1], ['390x844', 'low', 2]]) {
    const { context, page, errors } = await open(vp, { bundle: 'min', probe: true, dpr, query: `?perf=off&video=off&quality=${q}` });
    await page.waitForTimeout(2000);
    const res = {};
    for (const [label, p] of [['steam-at-fullest', .55], ['dish-reveal', .76], ['dish-at-rest', .97]]) {
      await page.evaluate((p) => { const b = document.querySelector('[data-breath]'); scrollTo(0, b.offsetTop + (b.offsetHeight - innerHeight) * p); }, p);
      await page.waitForTimeout(5000);
      const a = await cdpCpu(), m0 = await snap(page), t0 = Date.now(); const f0 = (await page.evaluate(() => window.__m.frames.length));
      await page.waitForTimeout(8000);
      const b = await cdpCpu(), m1 = await snap(page), dt = (Date.now() - t0) / 1000;
      const nNew = (await page.evaluate(() => window.__m.frames.length)) - f0;
      const iv = (await frameStats(page)).slice(-Math.max(2, nNew - 1));
      res[label] = { p, framesPerSecond: +(nNew / dt).toFixed(2), frameIntervalMs: { p50: +pct(iv, .5).toFixed(0), p95: +pct(iv, .95).toFixed(0) }, cpuSecondsPerSecond: Object.fromEntries(Object.keys(b).map((k) => [k, +(((b[k] - (a[k] || 0)) / dt)).toFixed(2)])), steamDrawCallsPerFrame: +(((m1.draws.steam || 0) - (m0.draws.steam || 0)) / Math.max(1, nNew)).toFixed(1), dishDrawCalls: (m1.draws.dish || 0) - (m0.draws.dish || 0) };
    }
    const cdp = await context.newCDPSession(page); await cdp.send('Performance.enable'); const pm = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
    results.perf[`${vp}-${q}-dpr${dpr}`] = { ...res, heapMB: +(pm.JSHeapUsedSize / 1048576).toFixed(1), longTasksOver50ms: (await snap(page)).long.length, errors };
    await context.close(); log('perf', vp, q);
  }
}

// ---------------------------------------------------------------- 8. loading behaviour under throttling (shipped bundle). Lighthouse-STYLE numbers from the browser's own APIs, NOT Lighthouse
if (ONLY.includes('load')) {
  results.load = {};
  for (const [vp, dpr, label] of [['1440x900', 1, 'desktop'], ['390x844', 2.625, 'mobile']]) {
    for (const [net, cpu] of [['none', 1], ['slow4g', 4]]) {
      const context = await browser.newContext({ viewport: { width: +vp.split('x')[0], height: +vp.split('x')[1] }, deviceScaleFactor: dpr, isMobile: label === 'mobile', hasTouch: label === 'mobile' });
      await context.addInitScript(PROBE);
      const page = await context.newPage(); const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      if (net === 'slow4g') { await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 }); await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu }); }
      const reqs = []; cdp.on('Network.responseReceived', (e) => reqs.push({ url: e.response.url.replace(BASE, ''), type: e.type, id: e.requestId }));
      const sizes = {}; cdp.on('Network.loadingFinished', (e) => { sizes[e.requestId] = e.encodedDataLength; });
      const t0 = Date.now(); await page.goto(BASE + 'index.html?perf=off', { waitUntil: 'load' }); const loadMs = Date.now() - t0;
      await page.waitForTimeout(6000);
      const m = await snap(page); const modeNow = await modeOf(page);
      await cdp.send('Performance.enable'); const cpuMetrics = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
      const byType = {}; for (const r of reqs) { const k = r.type; byType[k] = byType[k] || { requests: 0, bytes: 0 }; byType[k].requests++; byType[k].bytes += sizes[r.id] || 0; }
      const tbt = m.long.reduce((s, [, d]) => s + Math.max(0, d - 50), 0);
      results.load[`${label}-${net === 'none' ? 'unthrottled' : 'slow4g-cpu4x'}`] = { loadEventMs: loadMs, fcpMs: Math.round(m.fcp), lcpMs: Math.round(m.lcp), cls: +m.cls.toFixed(4), totalBlockingTimeMs: Math.round(tbt), longTasks: m.long, requests: reqs.length, transferredKB: +(Object.values(sizes).reduce((a, b) => a + b, 0) / 1024).toFixed(1), byType, scriptDurationMs: Math.round(cpuMetrics.ScriptDuration * 1000), taskDurationMs: Math.round(cpuMetrics.TaskDuration * 1000), modeAfterLoad: modeNow, jsFiles: reqs.filter((r) => /\.js/.test(r.url)).map((r) => r.url) };
      await context.close(); log('load', label, net);
    }
  }
}

// ---------------------------------------------------------------- 9. text contrast over the live frames: render a frame with and without the text, measure the background under each text box
if (ONLY.includes('contrast')) {
  results.contrast = {};
  const dir = join(OUT, '_contrast'); mkdirSync(dir, { recursive: true });
  for (const [vp, tag] of [['1440x900', 'desktop'], ['390x844', 'mobile']]) {
    const { context, page, errors } = await open(vp, { query: '?lab=1&perf=off&video=off' });
    await page.evaluate(() => window.lab.ready());
    const spots = [['hero', .02], ['fire', .20], ['steam', .39], ['texture', .56], ['handover', .67], ['plate', .90], ['rest', 1]]; const list = [];
    for (const [name, p] of spots) {
      await seek(page, p); await page.waitForTimeout(150);
      const boxes = await page.evaluate(() => [...document.querySelectorAll('.beat:not(.off) :is(h1,h2,.copy,.lede,.eyebrow,.dish-name,.btn,.btn-link)')].filter((e) => { const cs = getComputedStyle(e); return +cs.opacity > .5 && cs.visibility !== 'hidden'; }).map((e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return { sel: e.className || e.tagName.toLowerCase(), text: e.textContent.trim().slice(0, 28), x: r.x, y: r.y, w: r.width, h: r.height, color: cs.color, size: parseFloat(cs.fontSize), weight: +cs.fontWeight, opacity: +cs.opacity }; }));
      const tag2 = await page.addStyleTag({ content: '.beats{visibility:hidden!important}.pause,.top{visibility:hidden!important}' });
      await page.waitForTimeout(100); await page.screenshot({ path: join(dir, `${tag}-${name}.png`), type: 'png' });
      await tag2.evaluate((n) => n.remove());
      list.push({ name, p, boxes });
    }
    writeFileSync(join(dir, `${tag}.json`), JSON.stringify({ vp, spots: list }, null, 1));
    results.contrast[tag] = { file: `_contrast/${tag}.json`, errors }; await context.close(); log('contrast captured', tag);
  }
}

// ---------------------------------------------------------------- 10. asset sizes (bytes on disk, gzip and brotli for text)
if (ONLY.includes('assets')) {
  const files = ['index.html', 'breath.css', 'js/breath.min.js', ...readdirSync(join(root, 'src')).map((f) => 'src/' + f), ...readdirSync(join(root, 'media')).map((f) => 'media/' + f), ...readdirSync(join(root, 'fonts')).filter((f) => f.endsWith('.woff2')).map((f) => 'fonts/' + f)];
  results.assets = {};
  for (const f of files) { const b = readFileSync(join(root, f)); results.assets[f] = { bytes: statSync(join(root, f)).size, ...(/\.(html|css|js)$/.test(f) ? { gzip: gzipSync(b).length, brotli: brotliCompressSync(b).length } : {}) }; }
}

let prev = {}; try { prev = JSON.parse(readFileSync(join(OUT, 'results.json'), 'utf8')); } catch (e) { /* first run */ }
writeFileSync(join(OUT, 'results.json'), JSON.stringify({ ...prev, ...results }, null, 1));   // sections run now replace their old values; the rest are kept
await browser.close(); log('wrote', join(OUT, 'results.json'));
