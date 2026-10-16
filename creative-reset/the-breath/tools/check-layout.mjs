// Layout check: brand, Pause and every chapter heading must stay inside the viewport, heading ink must never be cut by its own line mask,
// and the brand must never overlap visible narrative text, at many viewport sizes and scroll positions (live layout, lab bundle for deterministic seeking).
// node tools/check-layout.mjs [--mode=calm] [--out=shots/layout-results.json]
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import { writeFileSync } from 'node:fs';
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const mode = arg('mode', ''), out = arg('out', 'shots/layout-results.json'), base = process.env.BASE || 'http://localhost:8431/';
const VPS = [[320, 568, 2], [360, 640, 3], [375, 667, 2], [390, 844, 3], [414, 896, 2], [768, 1024, 2], [844, 390, 3], [1024, 768, 1], [1280, 720, 1], [1366, 768, 1], [1440, 900, 1], [1920, 1080, 1], [2560, 1440, 1]];
const PS = [0, .03, .08, .12, .2, .3, .4, .47, .5, .56, .6, .63, .66, .7, .8, .9, 1];
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const bad = [], rows = [];
for (const [w, h, dpr] of VPS) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: w < 600, isMobile: w < 600 });
  const page = await ctx.newPage();
  await page.route('**/js/breath.min.js', (r) => r.fulfill({ path: new URL('../js/breath.lab.js', import.meta.url).pathname, contentType: 'text/javascript' }));
  await page.goto(base + 'index.html?lab=1&perf=off&video=off' + (mode ? `&mode=${mode}` : '')); await page.waitForLoadState('load');
  await page.evaluate(() => document.fonts.ready); await page.evaluate(() => window.lab.ready());
  for (const p of PS) {
    await page.evaluate(([p]) => window.lab.seek(p, { steps: 12, span: .3 }), [p]); await page.waitForTimeout(60);
    const r = await page.evaluate(() => {
      const vw = innerWidth, vh = innerHeight, rect = (el) => { const q = el.getBoundingClientRect(); return { l: q.left, t: q.top, r: q.right, b: q.bottom }; };
      const vis = (el) => { const s = getComputedStyle(el); return s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > .05; };
      const items = [];
      for (const sel of ['.brand', '.lab-tag', '.pause']) { const el = document.querySelector(sel); if (el && el.getClientRects().length && vis(el)) items.push({ k: sel, ...rect(el) }); }
      const words = [];
      for (const ln of document.querySelectorAll('.beat .ln')) {
        const beat = ln.closest('.beat'); if (beat.classList.contains('off')) continue;
        const sp = ln.firstElementChild, tr = document.createRange(); tr.selectNodeContents(sp);
        const t = tr.getBoundingClientRect(), L = ln.getBoundingClientRect(), tf = getComputedStyle(sp).transform;
        const inOut = +getComputedStyle(beat).getPropertyValue('--in') * (1 - +getComputedStyle(beat).getPropertyValue('--out'));
        words.push({ text: sp.textContent, t: { l: t.left, r: t.right, t: t.top, b: t.bottom }, L: { l: L.left, r: L.right, t: L.top, b: L.bottom }, settle: inOut, tf, fs: getComputedStyle(sp).fontSize });
      }
      const copies = [...document.querySelectorAll('.beat .copy,.beat .lede,.beat .eyebrow,.beat .dish-name,.beat h1')].filter((e) => !e.closest('.beat.off') && vis(e)).map((e) => ({ k: e.className || e.tagName, ...rect(e) }));
      return { vw, vh, items, words, copies, scrollY };
    });
    const hit = (a, c) => a.l < c.r && a.r > c.l && a.t < c.b && a.b > c.t;
    for (const it of r.items) if (it.l < -0.5 || it.t < -0.5 || it.r > r.vw + .5 || it.b > r.vh + .5) bad.push({ vp: `${w}x${h}`, p, issue: 'outside viewport', ...it });
    const brand = r.items.find((i) => i.k === '.brand'), tag = r.items.find((i) => i.k === '.lab-tag'), pause = r.items.find((i) => i.k === '.pause');
    if (brand && tag && hit(brand, tag)) bad.push({ vp: `${w}x${h}`, p, issue: 'brand overlaps lab tag' });
    if (tag && pause && hit(tag, pause)) bad.push({ vp: `${w}x${h}`, p, issue: 'lab tag overlaps pause' });
    for (const it of r.items) for (const c of r.copies) if (hit(it, c)) bad.push({ vp: `${w}x${h}`, p, issue: `${it.k} overlaps ${c.k}`, ...it });
    for (const wd of r.words) {
      if (wd.settle > .98) {   // fully entered: the whole word, ink included, must sit inside its mask and the viewport
        if (wd.t.r > wd.L.r + .5 || wd.t.l < wd.L.l - .5) bad.push({ vp: `${w}x${h}`, p, issue: 'word wider than its mask', text: wd.text, t: wd.t, L: wd.L });
        if (wd.t.r > r.vw - 8 || wd.t.l < 8) bad.push({ vp: `${w}x${h}`, p, issue: 'word outside safe area', text: wd.text, l: wd.t.l, r: wd.t.r });
      }
    }
    rows.push({ vp: `${w}x${h}`, p, items: r.items.map((i) => i.k), words: r.words.map((x) => [x.text, x.settle.toFixed(2), Math.round(x.t.l), Math.round(x.t.r), Math.round(x.L.r), x.fs]) });
  }
  await ctx.close();
}
await b.close();
writeFileSync(new URL('../' + out, import.meta.url), JSON.stringify({ mode: mode || 'live', problems: bad, count: bad.length, rows }, null, 1));
console.log(`${bad.length} problems`);
const seen = new Set(); for (const x of bad) { const k = `${x.vp} ${x.issue} ${x.text || ''}`; if (!seen.has(k)) { seen.add(k); console.log(k, 'p=' + x.p); } }
