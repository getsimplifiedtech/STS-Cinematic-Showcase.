// check:budgets (ENG-060, ENG-061). Measurable page-weight and performance budgets with regression detection (limits in budgets.json).
//   static   (no browser) exact bytes: each file against its limit; per page the weight of everything it references (compressed text,
//            images and fonts as stored; video excluded and budgeted by file); the delivered total against the v0.8 baseline's
//   runtime  (pinned browser, Chromium only) at 390 px on a throttled connection (150 ms, 1.6 Mbit/s, CPU x4): requests and bytes loaded,
//            LCP, CLS, blocking time and interaction handler time (the page's own code; input delay and presentation delay are
//            reported, not gated, because they vary with the machine's input and rendering pipeline), median of 3 loads, against the limits for Core Web Vitals
// A value fails when it exceeds its limit, or exceeds the recorded v0.8 measurement by more than the regression tolerance.
// `node engineering/checks/budgets.mjs --update-measured` rewrites the recorded measurements after a deliberate, reviewed change.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { withSite } from '../lib/runtime.mjs';
import { exportBaseline, engDir, isMain, listFiles, readJson } from '../lib/git.mjs';
import { assembleCandidate, pagesOf, SHARED } from '../lib/site.mjs';
import { rmSync } from 'node:fs';
import { dirname } from 'node:path';

const textual = /\.(html|css|js|json|svg|txt|md)$/;
const sizeOf = (p) => { const b = readFileSync(p); return textual.test(p) ? gzipSync(b, { level: 9 }).length : b.length; };   // text as it would be compressed in transit
const rawSize = (p) => readFileSync(p).length;

// Everything a page references, resolved to files, with flags.
export function pageParts(root, file) {
  const html = readFileSync(join(root, file), 'utf8');
  const css = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map((m) => m[1]);
  const js = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  const inlineJs = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1].length);
  const preload = [...html.matchAll(/<link[^>]+rel="preload"[^>]+href="([^"]+)"/g)].map((m) => m[1]);
  const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => ({ src: /src="([^"]+)"/.exec(m[0])[1], lazy: /loading="lazy"/.test(m[0]) }));
  const fonts = [...new Set([...readFileSync(join(root, css[0] || 'styles.css'), 'utf8').matchAll(/url\(([^)]+\.woff2)\)/g)].map((m) => m[1]))];
  return { html: file, css, js, inlineJs, preload, imgs, fonts };
}

export function measureStatic(root) {
  const pages = {};
  for (const file of pagesOf(root)) {
    const p = pageParts(root, file);
    const g = (f) => sizeOf(join(root, f));
    const initial = g(file) + p.css.reduce((s, f) => s + g(f), 0) + p.js.reduce((s, f) => s + g(f), 0) + p.preload.reduce((s, f) => s + g(f), 0) + p.imgs.filter((i) => !i.lazy).reduce((s, i) => s + g(i.src), 0);
    const full = g(file) + p.css.reduce((s, f) => s + g(f), 0) + p.js.reduce((s, f) => s + g(f), 0) + p.fonts.reduce((s, f) => s + g(f), 0) + [...new Set(p.imgs.map((i) => i.src))].reduce((s, f) => s + g(f), 0);
    pages[file] = { htmlGzip: g(file), cssGzip: p.css.reduce((s, f) => s + g(f), 0), jsGzip: p.js.reduce((s, f) => s + g(f), 0), inlineJsBytes: p.inlineJs.reduce((s, n) => s + n, 0), initialGzip: initial, fullGzip: full, images: new Set(p.imgs.map((i) => i.src)).size, scripts: p.js.length };
  }
  const files = [...pagesOf(root), ...SHARED, ...listFiles(join(root, 'fonts')).map((f) => `fonts/${f}`), ...listFiles(join(root, 'media')).map((f) => `media/${f}`)];
  const sizes = Object.fromEntries(files.map((f) => [f, rawSize(join(root, f))]));
  const by = (re) => files.filter((f) => re.test(f)).map((f) => sizes[f]);
  return {
    pages,
    deliveredBytes: Object.values(sizes).reduce((s, n) => s + n, 0),
    maxImageBytes: Math.max(...by(/\.webp$/)), maxWebmBytes: Math.max(...by(/\.webm$/)), maxMp4Bytes: Math.max(...by(/\.mp4$/)),
    fontBytes: by(/\.woff2$/).reduce((s, n) => s + n, 0), fontFiles: by(/\.woff2$/).length,
    cssGzip: sizeOf(join(root, 'styles.css')), scriptsGzipTotal: SHARED.filter((f) => f.endsWith('.js')).reduce((s, f) => s + sizeOf(join(root, f)), 0),
  };
}

// Runtime: in-page collectors are installed before any script runs.
const COLLECT = () => {
  window.__m = { lcp: 0, cls: 0, blocking: 0, events: [], delay: [], present: [] };
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__m.lcp = Math.max(window.__m.lcp, e.startTime); }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__m.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__m.blocking += Math.max(0, e.duration - 50); }).observe({ type: 'longtask', buffered: true });
  // Interaction cost is the time the page's OWN code takes to handle the event (processingStart to processingEnd). The wait before the handler
  // starts (input delay) and the wait for the next frame (presentation delay) are reported but not gated: on a CI runner they reached 570 to 750 ms
  // and 700 ms while the main thread was idle (blocking time 5 ms, no long task), so they measure the headless input and rendering pipeline of the
  // machine, not this site. Anything the page does to hold the main thread up is still caught by the blocking-time limit and by the handler time.
  new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__m.events.push(Math.max(0, e.processingEnd - e.processingStart)); window.__m.delay.push(Math.max(0, e.processingStart - e.startTime)); window.__m.present.push(Math.max(0, e.duration - (e.processingEnd - e.startTime))); } }).observe({ type: 'event', durationThreshold: 16, buffered: true });
};

export async function measureRuntime(root, browserName, only = null) {
  const out = {};
  await withSite(async ({ pages, browser, base, env }) => {
    for (const file of pages) {
      const runs = [];
      for (let n = 0; n < 3; n++) {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, locale: env.context.locale, timezoneId: env.context.timezoneId, reducedMotion: 'no-preference' });
        const page = await ctx.newPage();
        await page.addInitScript(COLLECT);
        const cdp = await ctx.newCDPSession(page);
        await cdp.send('Network.enable');
        await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        const seen = new Map();
        page.on('response', async (r) => { try { const b = await r.body(); const u = new URL(r.url()).pathname; seen.set(u, textual.test(u) ? gzipSync(b, { level: 9 }).length : b.length); } catch { /* aborted media */ } });
        await page.goto(base + file, { waitUntil: 'load' });
        await page.waitForTimeout(2500);
        // an interaction: the phone menu button, then Escape
        if (await page.$('.nav-toggle')) { await page.click('.nav-toggle'); await page.waitForTimeout(150); await page.keyboard.press('Escape'); await page.waitForTimeout(250); }
        const m = await page.evaluate(() => window.__m);
        runs.push({ lcp: m.lcp, cls: m.cls, blocking: m.blocking, interaction: Math.max(0, ...m.events), delay: Math.max(0, ...m.delay), present: Math.max(0, ...m.present), requests: seen.size, bytes: [...seen.values()].reduce((s, v) => s + v, 0) });
        await ctx.close();
      }
      const med = (k) => runs.map((r) => r[k]).sort((a, b) => a - b)[1];
      out[file] = { lcpMs: Math.round(med('lcp')), cls: Math.round(med('cls') * 1000) / 1000, blockingMs: Math.round(med('blocking')), interactionMs: Math.round(med('interaction')), inputDelayMs: Math.round(med('delay')), presentationMs: Math.round(med('present')), requests: med('requests'), transferBytes: med('bytes') };
    }
  }, { root, browserName, pages: only });
  return out;
}

export async function checkBudgets({ root = null, browser = true, browserName = 'chromium', update = false, pages = null } = {}) {
  const b = readJson(join(engDir, 'budgets.json'));
  const problems = [], notes = [];
  const own = !root;
  const dir = root || assembleCandidate(undefined, 'budgets');
  let baseExport = null;
  try {
    const s = measureStatic(dir);
    const lim = b.limits, reg = 1 + b.regressionTolerancePercent / 100;
    const over = (what, value, limit) => { if (value > limit) problems.push(`${what}: ${value} exceeds the budget of ${limit}`); };
    const drift = (what, value, was) => { if (was !== undefined && value > was * reg) problems.push(`${what}: ${value} is more than ${b.regressionTolerancePercent}% above the v0.8 measurement of ${was}`); };
    for (const [file, p] of Object.entries(s.pages)) {
      over(`${file} HTML (gzip)`, p.htmlGzip, lim.page.htmlGzip);
      over(`${file} initial transfer (gzip)`, p.initialGzip, lim.page.initialGzip);
      over(`${file} full page weight, no video (gzip)`, p.fullGzip, lim.page.fullGzip);
      over(`${file} scripts (gzip)`, p.jsGzip, lim.page.jsGzip);
      over(`${file} inline script bytes`, p.inlineJsBytes, lim.page.inlineJsBytes);
      over(`${file} scripts requested`, p.scripts, lim.page.scripts);
      const was = b.measured?.static?.pages?.[file];
      for (const k of ['htmlGzip', 'initialGzip', 'fullGzip', 'jsGzip']) drift(`${file} ${k}`, p[k], was?.[k]);
    }
    over('stylesheet (gzip)', s.cssGzip, lim.cssGzip);
    over('largest image', s.maxImageBytes, lim.maxImageBytes);
    over('largest WebM', s.maxWebmBytes, lim.maxWebmBytes);
    over('largest MP4', s.maxMp4Bytes, lim.maxMp4Bytes);
    over('font files', s.fontFiles, lim.fontFiles);
    over('font bytes', s.fontBytes, lim.fontBytes);
    over('delivered site total', s.deliveredBytes, lim.deliveredBytes);
    drift('delivered site total', s.deliveredBytes, b.measured?.static?.deliveredBytes);
    // the delivered size against the frozen baseline itself
    baseExport = exportBaseline('budgets-base');
    const baseTotal = measureStatic(baseExport).deliveredBytes;
    const pct = ((s.deliveredBytes - baseTotal) / baseTotal) * 100;
    if (pct > b.baselineGrowthPercent) problems.push(`delivered size grew ${pct.toFixed(2)}% over the v0.8 baseline (${baseTotal} to ${s.deliveredBytes} bytes); the limit is ${b.baselineGrowthPercent}%`);
    notes.push(`static: ${Object.keys(s.pages).length} pages measured; delivered ${s.deliveredBytes} bytes (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}% against the v0.8 baseline of ${baseTotal}); largest page initial transfer ${Math.max(...Object.values(s.pages).map((p) => p.initialGzip))} bytes gzip`);

    let rt = null;
    if (browser) {
      rt = await measureRuntime(dir, browserName, pages);
      const v = lim.webVitals;
      for (const [file, m] of Object.entries(rt)) {
        over(`${file} LCP (ms, throttled mobile)`, m.lcpMs, v.lcpMs);
        over(`${file} CLS`, m.cls, v.cls);
        over(`${file} blocking time (ms)`, m.blockingMs, v.blockingMs);
        over(`${file} interaction handler time (ms)`, m.interactionMs, v.interactionMs);
        over(`${file} requests`, m.requests, lim.requests);
        over(`${file} transfer at 390 px (bytes)`, m.transferBytes, lim.transferBytes);
        const was = b.measured?.runtime?.[file];
        drift(`${file} transfer at 390 px`, m.transferBytes, was?.transferBytes);
        drift(`${file} requests`, m.requests, was?.requests);
      }
      const worst = (k) => Math.max(...Object.values(rt).map((m) => m[k]));
      notes.push(`runtime (390 px, 150 ms / 1.6 Mbit/s / CPU x4, median of 3): worst LCP ${worst('lcpMs')} ms (limit ${v.lcpMs}), CLS ${worst('cls')} (limit ${v.cls}), blocking ${worst('blockingMs')} ms (limit ${v.blockingMs}), interaction handler time ${worst('interactionMs')} ms (limit ${v.interactionMs}; input delay ${worst('inputDelayMs')} ms and presentation ${worst('presentationMs')} ms reported, not gated), most requests ${worst('requests')}, most bytes ${worst('transferBytes')}`);
    } else notes.push('runtime budgets skipped (no browser in this tier)');

    if (update) { b.measured = { static: { pages: Object.fromEntries(Object.entries(s.pages).map(([k, p]) => [k, { htmlGzip: p.htmlGzip, initialGzip: p.initialGzip, fullGzip: p.fullGzip, jsGzip: p.jsGzip }])), deliveredBytes: s.deliveredBytes }, ...(rt ? { runtime: rt } : {}) }; writeFileSync(join(engDir, 'budgets.json'), JSON.stringify(b, null, 2) + '\n'); notes.push('budgets.json measured values updated'); }
    return { problems, notes, measured: { static: s, runtime: rt } };
  } finally { if (own) rmSync(dir, { recursive: true, force: true }); if (baseExport) rmSync(dirname(baseExport), { recursive: true, force: true }); }
}

if (isMain(import.meta.url)) {
  const t0 = Date.now();
  const r = await checkBudgets({ update: process.argv.includes('--update-measured'), browser: !process.argv.includes('--static') });
  if (process.argv.includes('--print')) console.log(JSON.stringify(r.measured, null, 1));
  r.notes.forEach((n) => console.log('  ' + n));
  r.problems.forEach((p) => console.log('  - ' + p));
  console.log(`${r.problems.length ? 'FAIL' : 'PASS'}  check:budgets (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  process.exit(r.problems.length ? 1 : 0);
}
