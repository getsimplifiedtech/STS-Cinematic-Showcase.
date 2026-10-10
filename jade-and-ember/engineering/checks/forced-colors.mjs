// check:forced-colors (ENG-050). With the browser's forced-colours (Windows high-contrast) emulation active, on every page at desktop and phone width:
//   1. every line of text is readable against what is really painted behind it (at least 4.5:1, or 3:1 for large text; at most 1 percent of pixels below)
//   2. every visible control paints something (text, border or icon): a control that draws nothing is invisible
//   3. a keyboard focus indicator shows on one control of each kind
// Text is measured over the pixels really painted around it: the dominant colour behind each line (glyph colours excluded) must be solid enough
// to be a background (at least 30 percent of the line) and contrast with the text colour. Forced colours replace author colours with system
// colours; this finds the places where that leaves text on a photograph or controls without edges.
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { reconcile } from '../lib/findings.mjs';
import { withSite } from '../lib/runtime.mjs';
import { comparePng } from '../lib/pixels.mjs';
import { engDir, isMain, readJson } from '../lib/git.mjs';

const lum = (r, g, b) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

const textRuns = () => {
  const out = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (!n.nodeValue.trim()) continue;
    const el = n.parentElement;
    if (!el.checkVisibility({ checkVisibilityCSS: true }) || el.closest('.vh, [hidden], script, style')) continue;
    const cs = getComputedStyle(el), m = /rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/.exec(cs.color) || [];
    const range = document.createRange(); range.selectNodeContents(n);
    const rects = [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1).map((r) => ({ x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }));
    if (!rects.length) continue;
    const size = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700;
    out.push({ t: n.nodeValue.trim().slice(0, 24), el: `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : ''}`, rgb: [Number(m[1]), Number(m[2]), Number(m[3])], large: size >= 24 || (bold && size >= 18.66), rects });
  }
  return out;
};
const controls = () => [...document.querySelectorAll('a[href], button')].filter((e) => e.checkVisibility({ checkVisibilityCSS: true }) && !e.classList.contains('skip')).map((e) => { const r = e.getBoundingClientRect(); return { n: `${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : ''} "${(e.innerText || e.getAttribute('aria-label') || '').trim().slice(0, 18)}"`, kind: `${e.tagName.toLowerCase()}.${(typeof e.className === 'string' ? e.className : '').trim().split(/\s+/).join('.')}`, x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; });

export async function checkForcedColors({ root = null, browserName = 'chromium', pages: only = null } = {}) {
  const cfg = readJson(join(engDir, 'a11y.json')).forcedColors;
  const measured = [], notes = [];
  let lines = 0, ctrls = 0, adjustNone = 0, notApplicable = null;
  await withSite(async ({ pages, newPage }) => {
    // Another engine may not support forced-colours emulation at all. That is reported as NOT APPLICABLE with the evidence, never as a pass and never
    // silently skipped (Chromium, the reference engine, keeps its strict behaviour: no activation is a problem).
    if (browserName !== 'chromium') {
      const probe = await newPage({ viewport: { width: 800, height: 600 }, forcedColors: 'active' }, pages[0]);
      const active = await probe.page.evaluate(() => matchMedia('(forced-colors: active)').matches);
      await probe.close();
      if (!active) { notApplicable = `${browserName} did not activate forced-colours emulation: matchMedia('(forced-colors: active)') stayed false after the forcedColors context option was applied`; return; }
    }
    for (const c of cfg.contexts) for (const file of pages) {
      const tag = `forced-colors:${file}@${c.name}`;
      const bad = (rule, who, detail, extra = {}) => measured.push({ key: `${tag}:${rule}:${who}`, detail, ...extra });
      const { page, close } = await newPage({ viewport: { width: c.width, height: c.height }, forcedColors: 'active' }, file);
      if (!(await page.evaluate(() => matchMedia('(forced-colors: active)').matches))) { bad('emulation', 'browser', 'forced-colours emulation did not activate'); await close(); continue; }
      const runs = await page.evaluate(textRuns), ctl = await page.evaluate(controls);
      adjustNone += await page.evaluate(() => [...document.querySelectorAll('*')].filter((e) => getComputedStyle(e).forcedColorAdjust === 'none').length);
      const shot = PNG.sync.read(await page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' }));
      // 1. text over what is painted: dominant non-glyph colour behind each line
      for (const run of runs) {
        const need = run.large ? 3 : cfg.minTextContrast;
        const L = lum(...run.rgb);
        const bins = new Map(); let total = 0;
        for (const r of run.rects) {
          const x0 = Math.max(0, Math.floor(r.x)), x1 = Math.min(shot.width, Math.ceil(r.x + r.w)), y0 = Math.max(0, Math.floor(r.y)), y1 = Math.min(shot.height, Math.ceil(r.y + r.h));
          for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
            const i = (y * shot.width + x) * 4, R = shot.data[i], G = shot.data[i + 1], B = shot.data[i + 2];
            total++;
            if (Math.abs(R - run.rgb[0]) + Math.abs(G - run.rgb[1]) + Math.abs(B - run.rgb[2]) < 60) continue;   // glyph pixels
            const k = ((R >> 3) << 10) | ((G >> 3) << 5) | (B >> 3), e = bins.get(k) || { n: 0, r: 0, g: 0, b: 0 };
            e.n++; e.r += R; e.g += G; e.b += B; bins.set(k, e);
          }
        }
        lines++;
        if (!total) continue;
        const top = [...bins.values()].sort((a, b) => b.n - a.n)[0];
        if (!top || top.n / total < 0.3) { bad('text-background', `${run.el} "${run.t}"`, `"${run.t}" (${run.el}) sits on a busy or missing background in forced colours (no colour covers 30% of the line)`); continue; }
        const cr = ratio(L, lum(top.r / top.n, top.g / top.n, top.b / top.n));
        if (cr < need) bad('text-contrast', `${run.el} "${run.t}"`, `"${run.t}" (${run.el}) has ${cr.toFixed(2)}:1 against its background in forced colours (needs ${need}:1)`);
      }
      // 2. controls paint something
      for (const k of ctl) {
        ctrls++;
        const x0 = Math.max(0, Math.floor(k.x)), x1 = Math.min(shot.width, Math.ceil(k.x + k.w)), y0 = Math.max(0, Math.floor(k.y)), y1 = Math.min(shot.height, Math.ceil(k.y + k.h));
        if (x1 <= x0 || y1 <= y0) continue;
        const ref = (y0 * shot.width + x0) * 4; let diff = 0, total = 0;
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * shot.width + x) * 4; total++; if (Math.abs(shot.data[i] - shot.data[ref]) + Math.abs(shot.data[i + 1] - shot.data[ref + 1]) + Math.abs(shot.data[i + 2] - shot.data[ref + 2]) > 30) diff++; }
        if (100 * diff / total < cfg.minControlPixelsPercent) bad('control-invisible', k.n, `${k.n} paints nothing distinguishable in forced colours (${(100 * diff / total).toFixed(2)}% of its pixels differ from its corner)`);
      }
      // 3. a focus indicator for one control of each kind
      const kinds = await page.evaluate(() => [...document.querySelectorAll('a[href], button')].filter((e) => e.checkVisibility({ checkVisibilityCSS: true }) && !e.classList.contains('skip')).map((e, i) => { e.dataset.fc = String(i); return `${e.tagName.toLowerCase()}.${(typeof e.className === 'string' ? e.className : '').trim().split(/\s+/).join('.')}`; }));
      for (const [kind, i] of kinds.map((k, n) => [k, n]).filter(([k, n]) => kinds.indexOf(k) === n)) {
        await page.keyboard.press('Tab');   // keyboard use first, so that :focus-visible applies to the programmatic focus below
        await page.evaluate(() => document.activeElement && document.activeElement.blur());
        const box = await page.evaluate((n) => { const e = document.querySelector(`[data-fc="${n}"]`); e.scrollIntoView({ block: 'center', behavior: 'instant' }); const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, i);
        const clip = { x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 8), width: box.w + 16, height: box.h + 16 };
        if (clip.width <= 0 || clip.height <= 0) continue;
        await page.waitForTimeout(30);
        const off = await page.screenshot({ clip, animations: 'disabled' });
        await page.evaluate((n) => document.querySelector(`[data-fc="${n}"]`).focus({ preventScroll: true }), i); await page.waitForTimeout(30);
        const on = await page.screenshot({ clip, animations: 'disabled' });
        const r = comparePng(on, off, { pixelThreshold: 0.05, maxDiffRatio: 1, cell: 32, maxCellPixels: 1e9 });
        if (r.differing < 12) bad('focus-indicator', kind, `${kind} shows no focus indicator in forced colours (${Math.max(0, r.differing)} pixels change)`);
      }
      await close();
    }
  }, { root, browserName, pages: only });
  if (notApplicable) return { problems: [], notes: [`NOT APPLICABLE on ${browserName}: ${notApplicable}. Forced-colours behaviour is NOT verified in this engine by automation; it needs a human on a real high-contrast configuration (Windows high contrast for Firefox, macOS Increase Contrast / Windows for Safari-equivalents).`], notApplicable };
  notes.push(`${lines} lines of text and ${ctrls} controls measured in forced-colours emulation on every page at ${cfg.contexts.map((c) => c.name).join(' and ')}; ${adjustNone} element(s) opt out with forced-color-adjust: none (those need a human look)`);
  const r = reconcile('forced-colors', measured);
  return { problems: r.problems, notes: [...notes, ...r.notes] };
}

if (isMain(import.meta.url)) {
  const t0 = Date.now();
  const { problems, notes } = await checkForcedColors();
  notes.forEach((n) => console.log('  ' + n));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:forced-colors (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  process.exit(problems.length ? 1 : 0);
}
