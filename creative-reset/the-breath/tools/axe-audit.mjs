// axe-core accessibility audit of the lab in live and calm modes at a few scroll positions (dev tool; needs `npm install` inside tools/).
// node tools/axe-audit.mjs [--out=shots/axe-results.json]   (needs a Playwright, see PLAYWRIGHT_MODULE, and the lab served on :8431)
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { AxeBuilder } = await import('./node_modules/@axe-core/playwright/dist/index.mjs');
import { writeFileSync } from 'node:fs';
const out = (process.argv.find((a) => a.startsWith('--out=')) || '').split('=')[1] || 'shots/axe-results.json', base = process.env.BASE || 'http://localhost:8431/';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const res = [];
for (const [name, w, h, q] of [['desktop-live', 1440, 900, ''], ['mobile-live', 390, 844, ''], ['desktop-calm', 1440, 900, '&mode=calm'], ['mobile-calm', 390, 844, '&mode=calm']]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: w < 600, isMobile: w < 600 }), page = await ctx.newPage();
  await page.route('**/js/breath.min.js', (r) => r.fulfill({ path: new URL('../js/breath.lab.js', import.meta.url).pathname, contentType: 'text/javascript' }));
  await page.goto(base + 'index.html?lab=1&perf=off&video=off' + q); await page.waitForLoadState('load'); await page.evaluate(() => window.lab.ready());
  for (const p of [0, .2, .4, .6, .8, 1]) {
    await page.evaluate(([p]) => window.lab.seek(p, { steps: 12, span: .3 }), [p]); await page.waitForTimeout(80);
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
    res.push({ name, p, violations: r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, sample: v.nodes[0]?.target })), passes: r.passes.length, incomplete: r.incomplete.map((v) => v.id) });
  }
  await ctx.close();
}
await b.close(); writeFileSync(out, JSON.stringify(res, null, 1));
const all = new Map(); for (const r of res) for (const v of r.violations) all.set(v.id + ' ' + v.impact, (all.get(v.id + ' ' + v.impact) || 0) + 1);
console.log(`${res.length} audits, violations by rule:`, [...all].map(([k, n]) => `${k} x${n}`).join('; ') || 'none');
