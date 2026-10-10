// node engineering/tools/latency-probe.mjs [--reps 3] [--json file]
// INVESTIGATION TOOL, not a gate. It always exits 0. Question: when the budget check sees an interaction take 570 to 750 ms on a CI runner but
// 6 to 30 ms on a development machine, where does the time go, and is it the page?
// For each combination of CONDITION (no throttling, CPU x4, network emulation, both = the budget profile) and DISPATCH method (Playwright click,
// raw mouse click, touch tap) it opens the phone menu on two pages and records, for the same interaction:
//   inputDelay     handler start minus the browser's timestamp of the event (the wait before the page's code could run)
//   handler        processingStart to processingEnd of the Event Timing entry (the page's code)
//   toNextFrame    event timestamp to the next animation frame after the handler (end-to-end up to the first paint opportunity)
//   duration       the Event Timing entry's own duration (what INP would report: input delay + handler + presentation, rounded to 8 ms)
//   heartbeatGap   the longest gap of a 4 ms timer chain on the main thread during the interaction: if it is small while inputDelay is large,
//                  the main thread was idle and the delay is outside the page (the browser's input path or compositor)
//   longTasks      number of main-thread tasks over 50 ms
// Reading the result: handler small + heartbeatGap small + inputDelay large  =>  not the page.
import { writeFileSync } from 'node:fs';
import { assembleCandidate, pagesOf } from '../lib/site.mjs';
import { launchBrowser } from '../lib/browser.mjs';
import { serveSite } from '../lib/server.mjs';
import { projectDir } from '../lib/git.mjs';
import { rmSync } from 'node:fs';
import { settleFonts } from '../lib/runtime.mjs';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d; };
const REPS = Number(arg('--reps', 3));
const CONDITIONS = [
  { name: 'plain', cpu: 1, net: false }, { name: 'cpu x4', cpu: 4, net: false }, { name: 'network', cpu: 1, net: true }, { name: 'cpu x4 + network (budget profile)', cpu: 4, net: true },
];
const DISPATCH = ['playwright click', 'raw mouse click', 'touch tap'];

const INIT = () => {
  window.__p = { handlers: [], frames: [], events: [], gaps: [], long: 0, mark: 0 };
  let last = performance.now();
  const tick = () => { const n = performance.now(); if (window.__p.mark && n >= window.__p.mark) window.__p.gaps.push(n - last); last = n; setTimeout(tick, 4); };
  setTimeout(tick, 4);
  for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'touchstart', 'touchend']) {
    document.addEventListener(t, (e) => { window.__p.handlers.push({ t, delay: performance.now() - e.timeStamp }); if (t === 'click') requestAnimationFrame(() => window.__p.frames.push({ t, toFrame: performance.now() - e.timeStamp })); }, true);
  }
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__p.events.push({ name: e.name, delay: e.processingStart - e.startTime, handler: e.processingEnd - e.processingStart, duration: e.duration }); }).observe({ type: 'event', durationThreshold: 16, buffered: true });
  new PerformanceObserver((l) => { window.__p.long += l.getEntries().length; }).observe({ type: 'longtask', buffered: true });
};

const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const r1 = (x) => Math.round(x * 10) / 10;

async function once(browser, base, file, cond, how) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
  const page = await ctx.newPage();
  await page.addInitScript(INIT);
  const cdp = await ctx.newCDPSession(page);
  if (cond.net) { await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 }); }
  if (cond.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cond.cpu });
  await page.goto(base + file, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  await page.evaluate(() => { window.__p.handlers.length = 0; window.__p.frames.length = 0; window.__p.events.length = 0; window.__p.gaps.length = 0; window.__p.mark = performance.now(); });
  const box = await page.locator('.nav-toggle').boundingBox();
  if (how === 'playwright click') await page.click('.nav-toggle');
  else if (how === 'raw mouse click') await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  else await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(600);
  const p = await page.evaluate(() => window.__p);
  await ctx.close();
  const click = p.events.filter((e) => e.name === 'click' || e.name === 'pointerup' || e.name === 'mouseup');
  return {
    inputDelay: Math.max(0, ...p.handlers.map((h) => h.delay)),
    handler: Math.max(0, ...p.events.map((e) => e.handler)),
    toNextFrame: Math.max(0, ...p.frames.map((f) => f.toFrame)),
    duration: Math.max(0, ...click.map((e) => e.duration)),
    heartbeatGap: Math.max(0, ...p.gaps), longTasks: p.long, nEvents: p.events.length,
  };
}

const dir = assembleCandidate(projectDir, 'latency');
const sv = serveSite(dir);
const { browser, version } = await launchBrowser('chromium');
const rows = [];
try {
  const pages = pagesOf(dir).filter((f) => ['index.html', 'menu.html'].includes(f));
  console.log(`latency probe: ${version}, ${REPS} repetitions, pages ${pages.join(', ')}, phone viewport 390 px, phone menu button, node ${process.version}, ${process.platform}`);
  console.log('condition | dispatch | median max inputDelay | handler | toNextFrame | event duration | heartbeat gap | long tasks (all in ms)');
  for (const cond of CONDITIONS) for (const how of DISPATCH) {
    const runs = [];
    for (const f of pages) for (let i = 0; i < REPS; i++) { try { runs.push(await once(browser, sv.base, f, cond, how)); } catch (e) { runs.push({ error: e.message.slice(0, 80) }); } }
    const ok = runs.filter((r) => !r.error);
    const m = (k) => r1(med(ok.map((r) => r[k])));
    const row = { condition: cond.name, dispatch: how, runs: ok.length, failed: runs.length - ok.length, inputDelay: m('inputDelay'), handler: m('handler'), toNextFrame: m('toNextFrame'), duration: m('duration'), heartbeatGap: m('heartbeatGap'), longTasks: m('longTasks'), worstInputDelay: r1(Math.max(0, ...ok.map((r) => r.inputDelay))), worstDuration: r1(Math.max(0, ...ok.map((r) => r.duration))) };
    rows.push(row);
    console.log(`${cond.name} | ${how} | ${row.inputDelay} | ${row.handler} | ${row.toNextFrame} | ${row.duration} | ${row.heartbeatGap} | ${row.longTasks}${row.failed ? ` | ${row.failed} failed` : ''}   (worst inputDelay ${row.worstInputDelay}, worst duration ${row.worstDuration})`);
  }
  const worst = rows.reduce((a, r) => (r.worstInputDelay > a.worstInputDelay ? r : a), rows[0]);
  const verdict = worst.worstInputDelay > 100 && worst.heartbeatGap < 100 && worst.handler < 50
    ? `Largest input delay ${worst.worstInputDelay} ms (${worst.condition}, ${worst.dispatch}) with an idle main thread (longest heartbeat gap ${worst.heartbeatGap} ms) and a ${worst.handler} ms handler: the delay is outside the page's code.`
    : worst.worstInputDelay > 100 ? `Largest input delay ${worst.worstInputDelay} ms (${worst.condition}, ${worst.dispatch}); heartbeat gap ${worst.heartbeatGap} ms, handler ${worst.handler} ms: look at the main thread before blaming the browser.`
    : `Largest input delay ${worst.worstInputDelay} ms: the interaction is fast in every condition tried here.`;
  console.log('\n' + verdict);
  if (arg('--json', null)) writeFileSync(arg('--json'), JSON.stringify({ browser: version, node: process.version, platform: process.platform, reps: REPS, rows }, null, 2) + '\n');
} finally { await browser.close(); sv.close(); rmSync(dir, { recursive: true, force: true }); }
