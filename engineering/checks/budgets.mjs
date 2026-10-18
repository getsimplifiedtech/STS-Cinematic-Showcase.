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
import { baselineLabel, project, selector, stylesheet } from '../lib/project.mjs';

import { assembleCandidate, deliveredPagesOf, pagesOf, SHARED } from '../lib/site.mjs';
import { rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { record } from '../lib/project-records.mjs';
import { approvalsText, parseApprovals } from '../lib/approvals.mjs';

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
  const fonts = [...new Set([...readFileSync(join(root, css[0] || stylesheet), 'utf8').matchAll(/url\(([^)]+\.woff2)\)/g)].map((m) => m[1]))];
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
  const files = [...deliveredPagesOf(root), ...SHARED, ...listFiles(join(root, 'fonts')).map((f) => `fonts/${f}`), ...listFiles(join(root, 'media')).map((f) => `media/${f}`)];
  const sizes = Object.fromEntries(files.map((f) => [f, rawSize(join(root, f))]));
  const by = (re) => files.filter((f) => re.test(f)).map((f) => sizes[f]);
  return {
    pages,
    deliveredBytes: Object.values(sizes).reduce((s, n) => s + n, 0),
    imageSizes: Object.fromEntries(files.filter((f) => /\.webp$/.test(f)).map((f) => [f, sizes[f]])),
    maxImageBytes: Math.max(...by(/\.webp$/)), maxWebmBytes: Math.max(...by(/\.webm$/)), maxMp4Bytes: Math.max(...by(/\.mp4$/)),
    fontBytes: by(/\.woff2$/).reduce((s, n) => s + n, 0), fontFiles: by(/\.woff2$/).length,
    cssGzip: sizeOf(join(root, stylesheet)), scriptsGzipTotal: SHARED.filter((f) => f.endsWith('.js')).reduce((s, f) => s + sizeOf(join(root, f)), 0),
  };
}

// Runtime: in-page collectors are installed before any script runs.
export const COLLECT = () => {
  window.__m = { lcp: 0, cls: 0, blocking: 0, events: [], delay: [], present: [], total: [], worst: null };
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__m.lcp = Math.max(window.__m.lcp, e.startTime); }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__m.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__m.blocking += Math.max(0, e.duration - 50); }).observe({ type: 'longtask', buffered: true });
  // Interaction cost is the time the page's OWN code takes to handle the event (processingStart to processingEnd). The wait before the handler
  // starts (input delay) and the wait for the next frame (presentation delay) are retained and reported (endToEndMs) but not gated: on a CI runner they reached 570 to 750 ms
  // and 700 ms while the main thread was idle (blocking time 5 ms, no long task), so they measure the headless input and rendering pipeline of the
  // machine, not this site. Anything the page does to hold the main thread up is still caught by the blocking-time limit and by the handler time.
  new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__m.events.push(Math.max(0, e.processingEnd - e.processingStart)); window.__m.delay.push(Math.max(0, e.processingStart - e.startTime)); window.__m.present.push(Math.max(0, e.duration - (e.processingEnd - e.startTime))); window.__m.total.push(e.duration); if (!window.__m.worst || e.duration > window.__m.worst.duration) window.__m.worst = { name: e.name, delay: Math.round(e.processingStart - e.startTime), handler: Math.round(e.processingEnd - e.processingStart), duration: e.duration }; } }).observe({ type: 'event', durationThreshold: 16, buffered: true });
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
        if (await page.$(selector('navToggle'))) { await page.click(selector('navToggle')); await page.waitForTimeout(150); await page.keyboard.press('Escape'); await page.waitForTimeout(250); }
        const m = await page.evaluate(() => window.__m);
        runs.push({ lcp: m.lcp, cls: m.cls, blocking: m.blocking, interaction: Math.max(0, ...m.events), delay: Math.max(0, ...m.delay), total: Math.max(0, ...m.total), worstEvent: m.worst, present: Math.max(0, ...m.present), requests: seen.size, bytes: [...seen.values()].reduce((s, v) => s + v, 0) });
        await ctx.close();
      }
      const med = (k) => runs.map((r) => r[k]).sort((a, b) => a - b)[1];
      const slow = runs.reduce((a, r) => (r.total > (a?.total ?? -1) ? r : a), null);
      out[file] = { worstEvent: slow?.worstEvent ? slow.worstEvent.name : null, lcpMs: Math.round(med('lcp')), cls: Math.round(med('cls') * 1000) / 1000, blockingMs: Math.round(med('blocking')), interactionMs: Math.round(med('interaction')), inputDelayMs: Math.round(med('delay')), endToEndMs: Math.round(med('total')), presentationMs: Math.round(med('present')), requests: med('requests'), transferBytes: med('bytes') };
    }
  }, { root, browserName, pages: only });
  return out;
}

// ---- approved exceptions -------------------------------------------------------------------------------------------------------------------------------------------------------
// budgets.json may carry an optional `exceptions` object, for a project whose owner has approved a page or an image that needs more than the shared limit:
//   "exceptions": { "pages":  { "<page file>":  { "approval": "<id in the approvals log>", "reason": "<why>", "limits": { "<limit>": <number> } } },
//                   "images": { "<media file>": { "approval": "<id in the approvals log>", "reason": "<why>", "bytes": <number> } } }
// A project without it is held to the shared limits exactly as before. An exception is accepted only when it is complete and authorised: a page that is delivered, only the named limits,
// positive whole numbers, an approval id that exists in the project's approvals log and a reason. Anything else is reported and NO exception is applied while the object is invalid (the
// shared limits then decide, so a bad entry can only make the check stricter, never looser). An exception changes only the page or the image it names and only the limits it lists.
export const PAGE_EXCEPTION_STATIC = ['htmlGzip', 'initialGzip', 'fullGzip', 'jsGzip', 'inlineJsBytes', 'scripts'];
export const PAGE_EXCEPTION_RUNTIME = ['requests', 'transferBytes', 'blockingMs'];
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isCount = (v) => typeof v === 'number' && Number.isInteger(v) && v > 0;
export function validateBudgetExceptions(exceptions, { pages, files, approvalIds }) {
  if (exceptions === undefined) return [];
  if (!isObj(exceptions)) return ['budgets.json: "exceptions" must be an object with "pages" and/or "images"'];
  const errors = [];
  const known = (e, allowed, where) => { for (const k of Object.keys(e)) if (!allowed.includes(k)) errors.push(`${where}: unknown field "${k}"`); };
  const authorised = (e, where) => {
    if (typeof e.approval !== 'string' || !e.approval.trim()) errors.push(`${where}: "approval" is required (the id of the owner's decision in the approvals log)`);
    else if (!approvalIds.includes(e.approval.trim())) errors.push(`${where}: approval "${e.approval}" is not in the approvals log, so the exception is not authorised`);
    if (typeof e.reason !== 'string' || !e.reason.trim()) errors.push(`${where}: "reason" is required`);
  };
  known(exceptions, ['pages', 'images'], 'budgets.json exceptions');
  for (const [group, entries] of [['pages', exceptions.pages], ['images', exceptions.images]]) {
    if (entries === undefined) continue;
    if (!isObj(entries)) { errors.push(`budgets.json exceptions.${group} must be an object keyed by file`); continue; }
    for (const [file, e] of Object.entries(entries)) {
      const where = `exception for ${group === 'pages' ? 'page' : 'image'} ${file}`;
      if (group === 'pages' ? !pages.includes(file) : !files.includes(file)) errors.push(`${where}: ${group === 'pages' ? 'not a delivered page' : 'not a delivered image'}`);
      if (!isObj(e)) { errors.push(`${where}: must be an object`); continue; }
      authorised(e, where);
      if (group === 'pages') {
        known(e, ['approval', 'reason', 'limits'], where);
        if (!isObj(e.limits) || !Object.keys(e.limits).length) errors.push(`${where}: "limits" must name at least one limit`);
        else for (const [k, v] of Object.entries(e.limits)) {
          if (![...PAGE_EXCEPTION_STATIC, ...PAGE_EXCEPTION_RUNTIME].includes(k)) errors.push(`${where}: "${k}" is not a limit that may have an exception`);
          else if (!isCount(v)) errors.push(`${where}: ${k} must be a positive whole number (got ${JSON.stringify(v)})`);
        }
      } else {
        known(e, ['approval', 'reason', 'bytes'], where);
        if (!isCount(e.bytes)) errors.push(`${where}: "bytes" must be a positive whole number (got ${JSON.stringify(e.bytes)})`);
      }
    }
  }
  return errors;
}

export async function checkBudgets({ root = null, browser = true, browserName = 'chromium', update = false, pages = null, budgets = null, approvalIds = null } = {}) {   // budgets and approvalIds: self-tests only
  const b = budgets || record('budgets.json');
  const problems = [], notes = [];
  const own = !root;
  const dir = root || assembleCandidate(undefined, 'budgets');
  let baseExport = null;
  try {
    const s = measureStatic(dir);
    const lim = b.limits, reg = 1 + b.regressionTolerancePercent / 100;
    const over = (what, value, limit) => { if (value > limit) problems.push(`${what}: ${value} exceeds the budget of ${limit}`); };
    const drift = (what, value, was) => { if (was !== undefined && value > was * reg) problems.push(`${what}: ${value} is more than ${b.regressionTolerancePercent}% above the ${baselineLabel} measurement of ${was}`); };
    // approved exceptions: validated first; while they are invalid none applies
    let E = {};
    if (b.exceptions !== undefined) {
      let ids = approvalIds;
      if (!ids) { try { ids = parseApprovals(approvalsText()).map((r) => r.id); } catch (e) { ids = []; problems.push(`budgets.json exceptions cannot be authorised: the approvals log could not be read (${e.message.split('\n')[0]})`); } }
      const bad = validateBudgetExceptions(b.exceptions, { pages: Object.keys(s.pages), files: Object.keys(s.imageSizes), approvalIds: ids });
      bad.forEach((e) => problems.push(e));
      if (!bad.length) {
        E = b.exceptions;
        const parts = [...Object.entries(E.pages ?? {}).map(([f, e]) => `${f} (${e.approval}): ${Object.entries(e.limits).map(([k, v]) => `${k} ${v}`).join(', ')}`), ...Object.entries(E.images ?? {}).map(([f, e]) => `${f} (${e.approval}): ${e.bytes} B`)];
        notes.push(`approved exceptions in force: ${parts.join('; ')}`);
      }
    }
    const pageLim = (file) => ({ ...lim.page, ...(E.pages?.[file]?.limits ?? {}) });
    const runLim = (file) => ({ requests: lim.requests, transferBytes: lim.transferBytes, blockingMs: lim.webVitals.blockingMs, ...Object.fromEntries(Object.entries(E.pages?.[file]?.limits ?? {}).filter(([k]) => PAGE_EXCEPTION_RUNTIME.includes(k))) });
    for (const [file, p] of Object.entries(s.pages)) {
      const L = pageLim(file);
      over(`${file} HTML (gzip)`, p.htmlGzip, L.htmlGzip);
      over(`${file} initial transfer (gzip)`, p.initialGzip, L.initialGzip);
      over(`${file} full page weight, no video (gzip)`, p.fullGzip, L.fullGzip);
      over(`${file} scripts (gzip)`, p.jsGzip, L.jsGzip);
      over(`${file} inline script bytes`, p.inlineJsBytes, L.inlineJsBytes);
      over(`${file} scripts requested`, p.scripts, L.scripts);
      const was = b.measured?.static?.pages?.[file];
      for (const k of ['htmlGzip', 'initialGzip', 'fullGzip', 'jsGzip']) drift(`${file} ${k}`, p[k], was?.[k]);
    }
    over('stylesheet (gzip)', s.cssGzip, lim.cssGzip);
    // every image is held to the shared limit unless the owner approved a limit for that one file; the message for the shared limit is unchanged
    const regularImages = Object.entries(s.imageSizes).filter(([f]) => !E.images?.[f]).map(([, n]) => n);
    over('largest image', regularImages.length ? Math.max(...regularImages) : 0, lim.maxImageBytes);
    for (const [f, e] of Object.entries(E.images ?? {})) over(`image ${f} (approved exception ${e.approval})`, s.imageSizes[f], e.bytes);
    over('largest WebM', s.maxWebmBytes, lim.maxWebmBytes);
    over('largest MP4', s.maxMp4Bytes, lim.maxMp4Bytes);
    over('font files', s.fontFiles, lim.fontFiles);
    over('font bytes', s.fontBytes, lim.fontBytes);
    over('delivered site total', s.deliveredBytes, lim.deliveredBytes);
    drift('delivered site total', s.deliveredBytes, b.measured?.static?.deliveredBytes);
    // the delivered size against the frozen baseline itself (a project with no baseline has none to grow against)
    let baseNote = '';
    if (project.baseline) {
      baseExport = exportBaseline('budgets-base');
      const baseTotal = measureStatic(baseExport).deliveredBytes;
      const pct = ((s.deliveredBytes - baseTotal) / baseTotal) * 100;
      if (pct > b.baselineGrowthPercent) problems.push(`delivered size grew ${pct.toFixed(2)}% over the ${baselineLabel} baseline (${baseTotal} to ${s.deliveredBytes} bytes); the limit is ${b.baselineGrowthPercent}%`);
      baseNote = ` (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}% against the ${baselineLabel} baseline of ${baseTotal})`;
    }
    notes.push(`static: ${Object.keys(s.pages).length} pages measured; delivered ${s.deliveredBytes} bytes${baseNote}; largest page initial transfer ${Math.max(...Object.values(s.pages).map((p) => p.initialGzip))} bytes gzip`);

    let rt = null;
    if (browser) {
      rt = await measureRuntime(dir, browserName, pages);
      const v = lim.webVitals;
      for (const [file, m] of Object.entries(rt)) {
        over(`${file} LCP (ms, throttled mobile)`, m.lcpMs, v.lcpMs);
        over(`${file} CLS`, m.cls, v.cls);
        const R = runLim(file);
        over(`${file} blocking time (ms)`, m.blockingMs, R.blockingMs);
        over(`${file} interaction handler time (ms)`, m.interactionMs, v.interactionMs);
        over(`${file} requests`, m.requests, R.requests);
        over(`${file} transfer at 390 px (bytes)`, m.transferBytes, R.transferBytes);
        const was = b.measured?.runtime?.[file];
        drift(`${file} transfer at 390 px`, m.transferBytes, was?.transferBytes);
        drift(`${file} requests`, m.requests, was?.requests);
      }
      const worst = (k) => Math.max(...Object.values(rt).map((m) => m[k]));
      notes.push(`runtime (390 px, 150 ms / 1.6 Mbit/s / CPU x4, median of 3): worst LCP ${worst('lcpMs')} ms (limit ${v.lcpMs}), CLS ${worst('cls')} (limit ${v.cls}), blocking ${worst('blockingMs')} ms (limit ${v.blockingMs}), interaction handler time ${worst('interactionMs')} ms (limit ${v.interactionMs}; END-TO-END ${worst('endToEndMs')} ms (input delay ${worst('inputDelayMs')} ms + handler + presentation ${worst('presentationMs')} ms; slowest event: ${Object.values(rt).find((m) => m.endToEndMs === worst('endToEndMs'))?.worstEvent ?? 'n/a'}) is reported, not gated; 200 ms is the INP good reference${worst('endToEndMs') > 200 ? ' and it is EXCEEDED here: see the latency investigation in engineering/CI.md' : ''}), most requests ${worst('requests')}, most bytes ${worst('transferBytes')}`);
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
