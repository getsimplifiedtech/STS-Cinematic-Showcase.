// PROJECT-OWNED (Jade & Ember, Firelight branch): the budget check for the Firelight build. It reuses the shared measurements (measureStatic, measureRuntime from
// checks/budgets.mjs, read-only) and applies two sets of limits: the v0.9 limits in budgets.json to Menu, Our Story, Visit Us and Order Online, and the documented Home
// limits in budgets-firelight.json to Home. It judges nothing against the frozen v0.8 baseline (that is check:budgets, which cannot run on this branch).
//   node engineering/project-owned/budgets-firelight.mjs [--static] [--print] [--update-measured]
import { readFileSync, writeFileSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { measureStatic, measureRuntime, COLLECT } from '../../../engineering/checks/budgets.mjs';
import { withSite } from '../../../engineering/lib/runtime.mjs';
import { assembleCandidate } from '../../../engineering/lib/site.mjs';
import { projectDir } from '../../../engineering/lib/git.mjs';

const read = (f) => JSON.parse(readFileSync(join(projectDir, 'engineering', f), 'utf8'));


// Home at 390 px on the shared throttled connection (150 ms, 1.6 Mbit/s, CPU x4), median of 3, in two states: the live sequence (The Breath with its steam) and the calm
// layout (reduced motion), which is the same page without the solver. Headless Chromium draws WebGL in software here, so the live state cannot say how a phone's GPU behaves:
// its blocking time is recorded for regression and reported, not judged against the 200 ms limit; it is judged by what the page does about it (see `liveBail`).
export async function measureHomeRuntime(dir, file) {
  const textual = /\.(html|css|js|json|svg|txt|md)$/;
  const out = {};
  await withSite(async ({ browser, base, env }) => {
    for (const [state, reducedMotion] of [['live', 'no-preference'], ['calm', 'reduce']]) {
      const runs = [];
      for (let n = 0; n < 3; n++) {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, locale: env.context.locale, timezoneId: env.context.timezoneId, reducedMotion });
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
        const loaded = await page.evaluate(() => ({ lcp: window.__m.lcp, cls: window.__m.cls, blocking: window.__m.blocking }));
        await page.click('.nav-toggle'); await page.waitForTimeout(150); await page.keyboard.press('Escape'); await page.waitForTimeout(250);
        await page.waitForTimeout(state === 'live' ? 7000 : 0);
        const m = await page.evaluate(() => ({ ...window.__m, mode: document.documentElement.classList.contains('is-live') ? 'live' : document.documentElement.classList.contains('is-calm') ? 'calm' : 'none' }));
        runs.push({ lcp: m.lcp, cls: m.cls, blocking: m.blocking, interaction: Math.max(0, ...m.events), requests: seen.size, bytes: [...seen.values()].reduce((a, b) => a + b, 0), mode: m.mode, blockingAt2500: loaded.blocking });
        await ctx.close();
      }
      const med = (k) => runs.map((r) => r[k]).sort((a, b) => a - b)[1];
      out[state] = { lcpMs: Math.round(med('lcp')), cls: Math.round(med('cls') * 1000) / 1000, blockingMs: Math.round(med('blocking')), blockingAt2500Ms: Math.round(med('blockingAt2500')), interactionMs: Math.round(med('interaction')), requests: med('requests'), transferBytes: med('bytes'), endModes: runs.map((r) => r.mode) };
    }
  }, { root: dir, pages: [file] });
  return out;
}

export async function checkBudgetsFirelight({ browser = true, update = false } = {}) {
  const v09 = read('budgets.json'), fl = read('budgets-firelight.json');
  const problems = [], notes = [];
  const dir = assembleCandidate(projectDir, 'budgets-firelight');
  try {
    const s = measureStatic(dir);
    const lim = v09.limits, tol = 1 + fl.regressionTolerancePercent / 100;
    const homeFile = fl.home.file;
    const limitFor = (file, key) => (file === homeFile && fl.home.limits[key] !== undefined ? fl.home.limits[key] : lim.page[key]);
    const over = (what, value, limit) => { if (value > limit) problems.push(`${what}: ${value} exceeds the budget of ${limit}`); };
    for (const [file, p] of Object.entries(s.pages)) {
      for (const k of ['htmlGzip', 'initialGzip', 'fullGzip', 'jsGzip', 'inlineJsBytes', 'scripts']) over(`${file} ${k}`, p[k], limitFor(file, k));
      const was = fl.measured?.static?.[file];
      if (file === homeFile && was) for (const k of ['htmlGzip', 'initialGzip', 'fullGzip', 'jsGzip']) if (p[k] > was[k] * tol) problems.push(`${file} ${k}: ${p[k]} is more than ${fl.regressionTolerancePercent}% above the recorded Firelight measurement of ${was[k]}`);
    }
    over('stylesheet (gzip)', s.cssGzip, lim.cssGzip);
    over('largest WebM', s.maxWebmBytes, lim.maxWebmBytes);
    over('largest MP4', s.maxMp4Bytes, lim.maxMp4Bytes);
    over('font files', s.fontFiles, lim.fontFiles);
    over('font bytes', s.fontBytes, lim.fontBytes);
    over('delivered site total', s.deliveredBytes, fl.site?.limits?.deliveredBytes ?? lim.deliveredBytes);   // Firelight's own total (budgets-firelight.json, site); the v0.9 total stays in budgets.json
    // images: 68,000 B each, except the documented exceptions (Home's live dish; Visit Us's two larger hero sizes)
    const imageExceptions = { ...fl.home.imageExceptions, ...fl.site?.imageExceptions };
    const media = join(dir, 'media');
    for (const f of readdirSync(media).filter((n) => n.endsWith('.webp'))) over(`media/${f}`, statSync(join(media, f)).size, imageExceptions[`media/${f}`] ?? lim.maxImageBytes);
    for (const [f, max] of Object.entries(imageExceptions)) notes.push(`image exception: ${f} may be up to ${max} B (${f in fl.home.imageExceptions ? 'Home' : 'Visit Us'} only; see budgets-firelight.json)`);
    notes.push(`static: ${Object.keys(s.pages).length} pages; Home script ${s.pages[homeFile].jsGzip} B gzip in ${s.pages[homeFile].scripts} scripts (limit ${fl.home.limits.jsGzip}); other pages' scripts at most ${Math.max(...Object.entries(s.pages).filter(([f]) => f !== homeFile).map(([, p]) => p.jsGzip))} B (limit ${lim.page.jsGzip}); delivered ${s.deliveredBytes} B`);

    let rt = null, home = null;
    if (browser) {
      rt = await measureRuntime(dir, 'chromium', Object.keys(s.pages).filter((f) => f !== homeFile));   // the four v0.9 pages, exactly as the v0.9 check measures them
      const v = lim.webVitals, L = fl.home.runtimeLimits;
      for (const [file, m] of Object.entries(rt)) {
        over(`${file} LCP (ms, throttled mobile)`, m.lcpMs, v.lcpMs);
        over(`${file} CLS`, m.cls, v.cls);
        over(`${file} blocking time (ms)`, m.blockingMs, v.blockingMs);
        over(`${file} interaction handler time (ms)`, m.interactionMs, v.interactionMs);
        over(`${file} requests`, m.requests, lim.requests);
        over(`${file} transfer at 390 px (bytes)`, m.transferBytes, lim.transferBytes);
      }
      home = await measureHomeRuntime(dir, homeFile);
      for (const [state, m] of Object.entries(home)) {
        over(`${homeFile} (${state}) LCP (ms, throttled mobile)`, m.lcpMs, v.lcpMs);
        over(`${homeFile} (${state}) CLS`, m.cls, v.cls);
        over(`${homeFile} (${state}) interaction handler time (ms)`, m.interactionMs, v.interactionMs);
        over(`${homeFile} (${state}) requests`, m.requests, L[state].requests);
        over(`${homeFile} (${state}) transfer at 390 px (bytes)`, m.transferBytes, L[state].transferBytes);
      }
      over(`${homeFile} (calm) blocking time (ms)`, home.calm.blockingMs, v.blockingMs);   // the page without the solver meets the ordinary limit
      over(`${homeFile} (live) blocking time (ms, software WebGL, CPU x4: recorded, limit is a regression guard only)`, home.live.blockingMs, L.live.blockingMsRegressionGuard);
      if (home.live.endModes.some((m) => m === 'none')) problems.push(`${homeFile} (live): the page ended in neither live nor calm mode`);
      const worst = (k) => Math.max(...Object.values(rt).map((m) => m[k]));
      notes.push(`runtime v0.9 pages (390 px, 150 ms / 1.6 Mbit/s / CPU x4, median of 3, headless Chromium; not a real device): worst LCP ${worst('lcpMs')} ms (limit ${v.lcpMs}), CLS ${worst('cls')}, blocking ${worst('blockingMs')} ms (limit ${v.blockingMs}), interaction ${worst('interactionMs')} ms`);
      for (const [state, m] of Object.entries(home)) notes.push(`runtime Home ${state}: LCP ${m.lcpMs} ms, CLS ${m.cls}, blocking ${m.blockingMs} ms (${m.blockingAt2500Ms} ms of it in the first 2.5 s), interaction ${m.interactionMs} ms, ${m.requests} requests, ${m.transferBytes} B; ended in ${m.endModes.join('/')}`);
      notes.push('Home live blocking time is software WebGL on a throttled CPU in headless Chromium: it shows the page leaves the solver quickly when frames crawl, not how a phone behaves [unverified on a real device]');
    } else notes.push('runtime budgets skipped (--static)');

    if (update) {
      fl.measured = { static: Object.fromEntries(Object.entries(s.pages).filter(([f]) => f === homeFile).map(([f, p]) => [f, { htmlGzip: p.htmlGzip, initialGzip: p.initialGzip, fullGzip: p.fullGzip, jsGzip: p.jsGzip }])), ...(home ? { runtime: home } : {}) };
      writeFileSync(join(projectDir, 'engineering', 'budgets-firelight.json'), JSON.stringify(fl, null, 2) + '\n');
      notes.push('measured values rewritten in budgets-firelight.json');
    }
    return { problems, notes, measured: { static: s, runtime: rt, home } };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const t0 = Date.now();
  const r = await checkBudgetsFirelight({ browser: !process.argv.includes('--static'), update: process.argv.includes('--update-measured') });
  if (process.argv.includes('--print')) console.log(JSON.stringify(r.measured, null, 1));
  r.notes.forEach((n) => console.log('  ' + n));
  r.problems.forEach((p) => console.log('  - ' + p));
  console.log(`${r.problems.length ? 'FAIL' : 'PASS'}  check:budgets-firelight (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  process.exit(r.problems.length ? 1 : 0);
}
