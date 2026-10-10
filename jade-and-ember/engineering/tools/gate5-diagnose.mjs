// node engineering/tools/gate5-diagnose.mjs --engine firefox|webkit|chromium [--part hours|candidates|strip|all]
// INVESTIGATION TOOL, not a gate. It always exits 0 and changes nothing in the site. Gate 5 Phase 1 review follow-up:
//   hours       F-G5-04: the Visit page opening-hours table under the WCAG 1.4.12 text-spacing override: element boxes, text rectangles, computed
//               styles and a screenshot (printed as base64 in the log), plus an INK measurement (do the drawn glyphs overlap, or only their rectangles?)
//   candidates  the same table and every page with a candidate CSS rule injected by script (nothing is committed): does it remove the overlap, and does
//               it leave the normal appearance (pixels at seven widths) and every other reflow/spacing measurement unchanged?
//   strip       F-G5-03: the Menu page category strip at phone width: is it a Tab stop, does it show a focus indicator, can the keyboard scroll it,
//               is there a focus trap, do its links still work?
// Output: lines "DIAG <name> <json>" and "PNG-BEGIN <name>" ... base64 lines ... "PNG-END <name>".
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { withSite } from '../lib/runtime.mjs';
import { comparePng } from '../lib/pixels.mjs';
import { measure, spacingCss } from '../checks/reflow.mjs';
import { engDir, readJson, isMain } from '../lib/git.mjs';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d; };
const ENGINE = arg('--engine', 'chromium'), PART = arg('--part', 'all');
const a11y = readJson(join(engDir, 'a11y.json')).reflow;
const SPACING = spacingCss(a11y.spacing);
const out = (name, obj) => console.log(`DIAG ${name} ${JSON.stringify(obj)}`);
const png = (name, buf) => { console.log(`PNG-BEGIN ${name} ${buf.length}`); const b = buf.toString('base64'); for (let i = 0; i < b.length; i += 120) console.log(b.slice(i, i + 120)); console.log(`PNG-END ${name}`); };
const TOL = { pixelThreshold: 0.05, maxDiffRatio: 1, cell: 32, maxCellPixels: 1e9 };
const NO_PIXELS = { ...TOL };

// ink: bounding box and mask of pixels that differ from the background render
const inkMask = (shot, bg) => { const A = PNG.sync.read(shot), B = PNG.sync.read(bg); const m = new Uint8Array(A.width * A.height); let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < A.height; y++) for (let x = 0; x < A.width; x++) { const i = (y * A.width + x) * 4; if (Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]) > 40) { m[y * A.width + x] = 1; n++; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } }
  return { m, n, box: n ? [x0, y0, x1 - x0 + 1, y1 - y0 + 1] : null, w: A.width, h: A.height }; };

// Runs in the page: geometry of every cell of the hours table, with the check's own overlap rule applied to each th/td pair.
const hoursGeometry = () => {
  const t = document.querySelector('table.hours'); const tr = t.getBoundingClientRect();
  const rect = (r) => [r.left, r.top, r.width, r.height].map((v) => Math.round(v * 10) / 10);
  const rows = [...t.rows].map((row, i) => {
    const cells = [...row.cells].map((c) => { const cs = getComputedStyle(c); const rg = document.createRange(); rg.selectNodeContents(c.firstChild); const b = c.getBoundingClientRect();
      return { tag: c.tagName, text: c.textContent, box: rect(b), textRects: [...rg.getClientRects()].map(rect), scrollW: c.scrollWidth, clientW: c.clientWidth, ws: cs.whiteSpace, ls: cs.letterSpacing, wsp: cs.wordSpacing, lh: cs.lineHeight, fs: cs.fontSize, ff: cs.fontFamily.slice(0, 60), pad: cs.paddingLeft + ' ' + cs.paddingRight, display: cs.display, width: cs.width }; });
    const th = cells[0], td = cells[1]; const pairs = [];
    for (const a of th.textRects) for (const b of td.textRects) { const w = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]), h = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]); if (w > 0 && h > 0) pairs.push({ w: Math.round(w * 10) / 10, h: Math.round(h * 10) / 10 }); }
    const gap = td.textRects.length && th.textRects.length ? Math.round((Math.min(...td.textRects.map((r) => r[0])) - Math.max(...th.textRects.map((r) => r[0] + r[2]))) * 10) / 10 : null;
    return { row: i, th, td, rectOverlaps: pairs, gapBetweenTextRects: gap };
  });
  const cs = getComputedStyle(t);
  return { table: { box: rect(tr), width: cs.width, layout: cs.tableLayout, collapse: cs.borderCollapse, parentBox: rect(t.parentElement.getBoundingClientRect()), parentClass: t.parentElement.className }, rows,
    fonts: [...document.fonts].map((f) => `${f.family} ${f.weight} ${f.status}`), ua: navigator.userAgent };
};

async function inkOverlapOfHours(page, clip) {
  const tag = async (css) => { const h = await page.addStyleTag({ content: css }); const b = await page.screenshot({ clip, animations: 'disabled', caret: 'hide' }); await h.evaluate((e) => e.remove()); return b; };
  const bg = await tag('table.hours th, table.hours td { color: transparent !important; }');
  const thOnly = await tag('table.hours td { color: transparent !important; }');
  const tdOnly = await tag('table.hours th { color: transparent !important; }');
  const a = inkMask(thOnly, bg), b = inkMask(tdOnly, bg);
  let both = 0; for (let i = 0; i < a.m.length; i++) if (a.m[i] && b.m[i]) both++;
  const boxOverlap = a.box && b.box ? Math.max(0, Math.min(a.box[0] + a.box[2], b.box[0] + b.box[2]) - Math.max(a.box[0], b.box[0])) : 0;
  return { thInkBox: a.box, tdInkBox: b.box, inkPixelsInBoth: both, inkBoxHorizontalOverlapPx: boxOverlap };
}

async function hoursState(page, label, shot = true) {
  const g = await page.evaluate(hoursGeometry);
  const tb = g.table.box; const clip = { x: Math.max(0, Math.floor(tb[0] - 24)), y: Math.max(0, Math.floor(tb[1] - 24)), width: Math.ceil(tb[2] + 48), height: Math.ceil(tb[3] + 48) };
  const vp = page.viewportSize(); clip.width = Math.min(clip.width, vp.width - clip.x); clip.height = Math.min(clip.height, vp.height - clip.y);
  const ink = clip.height > 0 ? await inkOverlapOfHours(page, clip) : null;
  if (shot) png(label, await page.screenshot({ clip, animations: 'disabled', caret: 'hide' }));
  return { geometry: g, clip, ink };
}

async function partHours(ctx) {
  const { page } = await ctx.newPage({ viewport: { width: 1440, height: 900 } }, 'visit-us.html');
  out(`hours.default.${ENGINE}`, await hoursState(page, `hours-default-${ENGINE}`));
  await page.addStyleTag({ content: SPACING }); await page.waitForTimeout(250);
  out(`hours.spacing.${ENGINE}`, await hoursState(page, `hours-spacing-${ENGINE}`));
  // the same page measured the way check:reflow measures it
  const m = await page.evaluate(measure, a11y.overlapMinPixels); out(`hours.reflow-measure-with-spacing.${ENGINE}`, { overlaps: m.overlaps, wide: m.wide, clipped: m.clipped });
}

const CANDIDATES = [
  { id: 'K1m', css: '@media (min-width:1200px){.hours th{white-space:normal}}', note: 'K1 (let the day label wrap) only at widths of 1200 px and more, where the table is wide enough that it never wraps in the normal state' },
  { id: 'K5', css: '.hours th{white-space:normal;min-width:max-content}', note: 'allow wrapping but never narrower than the label\'s own width' },
  { id: 'K9', css: '.hours th{width:1px}', note: 'the shrink-to-fit column idiom: the day-label column takes exactly its content width' },
  { id: 'K10', css: '.hours th{padding-right:0}.hours td{padding-left:var(--s5)}', note: 'move the gap from the label cell to the value cell' },
];
const WIDTHS = [1440, 1280, 1100, 1024, 820, 600, 390];

async function partCandidates(ctx) {
  const pages = ctx.pages;
  // baseline pixels (default spacing) of every page at seven widths
  const base = {};
  for (const file of pages) for (const w of WIDTHS) { const { page, close } = await ctx.newPage({ viewport: { width: w, height: 900 } }, file); base[`${file}@${w}`] = await page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' }); await close(); }
  const baseMeasure = {};
  const contexts = [...a11y.widths.map((x) => ({ name: x.name, width: x.width, height: x.height, dsf: x.deviceScaleFactor || 1, spacing: false })), ...a11y.spacing.contexts.map((c) => ({ name: 'spacing-' + c.name, width: c.width, height: c.height, dsf: 1, spacing: true }))];
  const run = async (css) => { const res = {}; for (const c of contexts) for (const file of pages) { const { page, close } = await ctx.newPage({ viewport: { width: c.width, height: c.height }, deviceScaleFactor: c.dsf }, file); if (css) await page.addStyleTag({ content: css }); const before = c.spacing ? await page.evaluate(measure, a11y.overlapMinPixels) : null; if (c.spacing) { await page.addStyleTag({ content: SPACING }); await page.waitForTimeout(150); } const m = await page.evaluate(measure, a11y.overlapMinPixels); res[`${file}@${c.name}`] = { m, before }; await close(); } return res; };
  const baseRun = await run(null);
  const items = (r) => { const s = new Set(); for (const [k, v] of Object.entries(r)) for (const kind of ['wide', 'clipped', 'overlaps', 'tight']) for (const it of v.m[kind]) if (!v.before || !v.before[kind].includes(it)) s.add(`${k}:${kind}:${it}`); return s; };
  const baseItems = items(baseRun);
  out(`candidates.baseline.${ENGINE}`, { findingsPresent: [...baseItems] });
  for (const k of CANDIDATES) {
    const r = { id: k.id, css: k.css, note: k.note };
    // 1. the hours table under spacing
    const { page, close } = await ctx.newPage({ viewport: { width: 1440, height: 900 } }, 'visit-us.html');
    await page.addStyleTag({ content: k.css }); await page.addStyleTag({ content: SPACING }); await page.waitForTimeout(250);
    const st = await hoursState(page, `hours-spacing-${k.id}-${ENGINE}`, true);
    r.hoursSpacing = { rectOverlaps: st.geometry.rows.map((x) => x.rectOverlaps.length), gaps: st.geometry.rows.map((x) => x.gapBetweenTextRects), inkPixelsInBoth: st.ink && st.ink.inkPixelsInBoth, inkBoxOverlapPx: st.ink && st.ink.inkBoxHorizontalOverlapPx, tableBox: st.geometry.table.box };
    await close();
    // 2. normal appearance: pixels at seven widths on every page against the same engine without the rule
    const diffs = [];
    for (const file of pages) for (const w of WIDTHS) { const { page: p, close: c2 } = await ctx.newPage({ viewport: { width: w, height: 900 } }, file); await p.addStyleTag({ content: k.css }); await p.waitForTimeout(100); const shot = await p.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' }); await c2(); const cmp = comparePng(base[`${file}@${w}`], shot, NO_PIXELS); if (cmp.differing !== 0) diffs.push(`${file}@${w}: ${cmp.differing < 0 ? cmp.reason : cmp.differing + ' px'}`); }
    r.defaultAppearanceDifferences = diffs;
    // 3. every reflow and text-spacing measurement
    const candRun = await run(k.css); const ci = items(candRun);
    r.reflowAdded = [...ci].filter((x) => !baseItems.has(x)); r.reflowRemoved = [...baseItems].filter((x) => !ci.has(x));
    out(`candidate.${k.id}.${ENGINE}`, r);
  }
}


// Root cause: is the column width stale after a style change, or does the engine mis-measure the spaced label even from the first layout?
const SPACING_ONLY = { ls: '* { letter-spacing: 0.12em !important; }', ws: '* { word-spacing: 0.16em !important; }', lh: '* { line-height: 1.5 !important; }' };
const hoursNumbers = (page) => page.evaluate(() => { const t = document.querySelector('table.hours'); const r = t.rows[1]; const th = r.cells[0], td = r.cells[1]; const rg = document.createRange(); rg.selectNodeContents(th.firstChild); const tr = [...rg.getClientRects()]; const rg2 = document.createRange(); rg2.selectNodeContents(td.firstChild); const dr = [...rg2.getClientRects()];
  const textRight = Math.max(...tr.map((x) => x.right)), tdLeft = Math.min(...dr.map((x) => x.left)); return { thBoxW: Math.round(th.getBoundingClientRect().width * 10) / 10, thTextW: Math.round((textRight - Math.min(...tr.map((x) => x.left))) * 10) / 10, gapTextToValue: Math.round((tdLeft - textRight) * 10) / 10, thScrollW: th.scrollWidth, thClientW: th.clientWidth }; });

async function partExperiments(ctx) {
  const res = {};
  const open = async (viewport, init) => { const c = await ctx.browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce' }); const page = await c.newPage(); if (init) await page.addInitScript(init); await page.goto(ctx.base + 'visit-us.html'); await page.evaluate(async () => { await Promise.all([...document.fonts].filter((f) => !/Fallback/.test(f.family)).map((f) => f.load().catch(() => {}))); await document.fonts.ready; }); await page.waitForTimeout(250); return { page, close: () => c.close() }; };
  const V = { width: 1440, height: 900 };
  // A: the spacing rule is in the HTML itself (a <style> element in <head>, added by a route), so it applies from the very first layout
  { const c = await ctx.browser.newContext({ viewport: V, deviceScaleFactor: 1, reducedMotion: 'reduce' }); await c.route('**/visit-us.html', async (route) => { const resp = await route.fetch(); const body = (await resp.text()).replace('</head>', `<style>${SPACING}</style></head>`); await route.fulfill({ response: resp, body }); });
    const page = await c.newPage(); await page.goto(ctx.base + 'visit-us.html'); await page.evaluate(async () => { await Promise.all([...document.fonts].filter((f) => !/Fallback/.test(f.family)).map((f) => f.load().catch(() => {}))); await document.fonts.ready; }); await page.waitForTimeout(250);
    res.A_spacingInTheHtmlFromFirstLayout = await hoursNumbers(page); await c.close(); }
  // B: injected after load (what check:reflow, bookmarklets and extensions do), then forced relayouts
  { const { page, close } = await open(V, null); res.B0_normal = await hoursNumbers(page);
    await page.addStyleTag({ content: SPACING }); await page.waitForTimeout(250); res.B1_injectedAfterLoad = await hoursNumbers(page);
    await page.evaluate(() => { const t = document.querySelector('table.hours'); t.style.display = 'none'; void t.offsetHeight; t.style.display = ''; void t.offsetHeight; }); res.B2_afterHideShowTable = await hoursNumbers(page);
    await page.setViewportSize({ width: 1441, height: 900 }); await page.waitForTimeout(150); await page.setViewportSize(V); await page.waitForTimeout(250); res.B3_afterResizeBy1pxAndBack = await hoursNumbers(page);
    await close(); }
  { const { page, close } = await open(V, null); await page.addStyleTag({ content: SPACING }); await page.waitForTimeout(250); await page.evaluate(() => { for (const c of document.querySelectorAll('table.hours th')) c.textContent = c.textContent; }); await page.waitForTimeout(150); res.B4_afterRewritingLabelText = await hoursNumbers(page); await close(); }
  // C: which property is not picked up when injected after load
  for (const [k, css] of Object.entries(SPACING_ONLY)) { const { page, close } = await open(V, null); await page.addStyleTag({ content: css }); await page.waitForTimeout(250); res['C_only_' + k] = await hoursNumbers(page); await close(); }
  // D: scope of the rule, injected after load
  for (const [k, css] of Object.entries({ cellsOnly: '.hours th, .hours td { letter-spacing: 0.12em !important; word-spacing: 0.16em !important; line-height: 1.5 !important; }', tableOnly: 'table.hours { letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }', bodyInherited: 'body { letter-spacing: 0.12em; word-spacing: 0.16em; line-height: 1.5; }' })) { const { page, close } = await open(V, null); await page.addStyleTag({ content: css }); await page.waitForTimeout(250); res['D_' + k] = await hoursNumbers(page); await close(); }
  out(`experiments.${ENGINE}`, res);
}

// Does the defect occur at other widths, and do the candidates leave those widths alone?
async function partSweep(ctx) {
  const rows = {};
  const one = async (css, w, spacing) => { const { page, close } = await ctx.newPage({ viewport: { width: w, height: 900 } }, 'visit-us.html'); if (css) await page.addStyleTag({ content: css }); if (spacing) { await page.addStyleTag({ content: SPACING }); await page.waitForTimeout(200); } const n = await page.evaluate(() => { const t = document.querySelector('table.hours'); const rowsOut = [...t.rows].map((r) => { const th = r.cells[0], td = r.cells[1]; const a = document.createRange(); a.selectNodeContents(th.firstChild); const b = document.createRange(); b.selectNodeContents(td.firstChild); const ar = [...a.getClientRects()], br = [...b.getClientRects()]; let ov = 0; for (const x of ar) for (const y of br) { const ww = Math.min(x.right, y.right) - Math.max(x.left, y.left), hh = Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top); if (ww > 0 && hh > 0) ov = Math.max(ov, ww); } return { thBoxW: Math.round(th.getBoundingClientRect().width), overlapPx: Math.round(ov * 10) / 10 }; }); return { tableW: Math.round(t.getBoundingClientRect().width), worstOverlapPx: Math.max(...rowsOut.map((r) => r.overlapPx)), thBoxW: rowsOut.map((r) => r.thBoxW) }; });
    await close(); return n; };
  for (const [id, css] of [['none', null], ...CANDIDATES.map((k) => [k.id, k.css])]) { rows[id] = {}; for (const w of WIDTHS) rows[id][w] = { normal: id === 'none' ? await one(null, w, false) : undefined, spacing: await one(css, w, true) }; }
  out(`sweep.${ENGINE}`, rows);
}

async function partStrip(ctx) {
  for (const [w, h] of [[390, 844], [1440, 900]]) {
    const { page, close } = await ctx.newPage({ viewport: { width: w, height: h } }, 'menu.html');
    const info = await page.evaluate(() => { const ul = document.querySelector('.jump ul'); const cs = getComputedStyle(ul); return { overflowX: cs.overflowX, scrollW: ul.scrollWidth, clientW: ul.clientWidth, tabindex: ul.getAttribute('tabindex'), links: [...ul.querySelectorAll('a')].map((a) => a.textContent) }; });
    const desc = () => page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return 'body'; return `${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : ''}${e.tagName === 'A' ? ' "' + e.textContent.trim().slice(0, 20) + '"' : ''}`; });
    const seq = [];
    let onUl = false;
    for (let n = 0; n < 60; n++) { await page.keyboard.press('Tab'); await page.waitForTimeout(30); const d = await desc(); seq.push(d); if (d === 'ul') { onUl = true; break; } if (d.startsWith('a') && /Small plates/.test(d)) break; }
    const res = { viewport: `${w}x${h}`, strip: info, tabsUntilStrip: seq.length, stripSequence: seq.slice(-3), ulIsTabStop: onUl };
    if (onUl) {
      const rect = await page.evaluate(() => { const r = document.activeElement.getBoundingClientRect(); return { x: Math.max(0, Math.floor(r.x - 8)), y: Math.max(0, Math.floor(r.y - 8)), width: Math.ceil(r.width + 16), height: Math.ceil(r.height + 16) }; });
      res.focusVisibleMatches = await page.evaluate(() => document.activeElement.matches(':focus-visible'));
      res.outline = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return { style: s.outlineStyle, width: s.outlineWidth, color: s.outlineColor, offset: s.outlineOffset, boxShadow: s.boxShadow }; });
      const on = await page.screenshot({ clip: rect, animations: 'disabled', caret: 'hide' });
      await page.evaluate(() => document.activeElement.blur()); await page.waitForTimeout(40);
      const off = await page.screenshot({ clip: rect, animations: 'disabled', caret: 'hide' });
      await page.evaluate(() => document.querySelector('.jump ul').focus({ focusVisible: true })); await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab'); await page.waitForTimeout(40);
      res.focusIndicatorPixelsChanged = comparePng(on, off, TOL).differing;
      png(`strip-focused-${w}-${ENGINE}`, on); png(`strip-unfocused-${w}-${ENGINE}`, off);
      // keyboard scrolling while the strip itself has focus
      const s0 = await page.evaluate(() => document.querySelector('.jump ul').scrollLeft);
      for (let i = 0; i < 4; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(60); }
      const s1 = await page.evaluate(() => document.querySelector('.jump ul').scrollLeft);
      for (let i = 0; i < 4; i++) { await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(60); }
      const s2 = await page.evaluate(() => document.querySelector('.jump ul').scrollLeft);
      res.keyboardScroll = { before: s0, afterRight: s1, afterLeft: s2, scrolls: s1 > s0 };
      // moving on: every Tab must advance; walk to past the strip, then back
      const fwd = []; for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); await page.waitForTimeout(30); fwd.push(await desc()); }
      res.forward = fwd;
      res.noTrapForward = new Set(fwd).size === fwd.length;
      const back = []; for (let i = 0; i < 8; i++) { await page.keyboard.press('Shift+Tab'); await page.waitForTimeout(30); back.push(await desc()); }
      res.backward = back; res.noTrapBackward = new Set(back).size === back.length;
      // a link of the strip still works with Enter
      await page.evaluate(() => { location.hash = ''; document.querySelector('.jump a[href="#wok"]').focus(); });
      await page.keyboard.press('Enter'); await page.waitForTimeout(300);
      res.enterOnLink = await page.evaluate(() => ({ hash: location.hash, targetTop: Math.round(document.querySelector('#wok')?.getBoundingClientRect().top ?? -1) }));
    }
    out(`strip.${ENGINE}.${w}`, res);
    await close();
  }
}

export async function diagnose() {
  await withSite(async (ctx) => {
    out('engine', { engine: ENGINE, version: ctx.version });
    const parts = { hours: partHours, experiments: partExperiments, sweep: partSweep, candidates: partCandidates, strip: partStrip };
    for (const [name, fn] of Object.entries(parts)) {
      if (PART !== 'all' && PART !== name) continue;
      try { await fn(ctx); } catch (e) { out(`${name}.ERROR.${ENGINE}`, { message: String(e.message).split('\n')[0] }); }
    }
  }, { browserName: ENGINE });
}

if (isMain(import.meta.url)) { await diagnose(); process.exit(0); }
