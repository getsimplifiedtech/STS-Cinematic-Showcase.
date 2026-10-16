// Frame-rate sweep for the phone tier (software GL: only the ratios mean anything). node tools/sweep.mjs <WxH> <dpr> p "sim:dye[:maxPixels]" ["sim:dye[:maxPixels]" ...]
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [vp, dpr, p, ...variants] = process.argv.slice(2); const [w, h] = vp.split('x').map(Number);
for (const v of variants) {
  const [sim, dye, px] = v.split(':');
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: +dpr, isMobile: w < 600, hasTouch: w < 600 });
  const page = await ctx.newPage();
  await page.route('**/js/breath.min.js', (r) => r.fulfill({ path: new URL('../js/breath.lab.js', import.meta.url).pathname, contentType: 'text/javascript' }));
  await page.goto(`${process.env.BASE || 'http://localhost:8431/'}index.html?perf=off&video=off&quality=low${sim && sim !== '-' ? '&sim=' + sim : ''}${dye && dye !== '-' ? '&dye=' + dye : ''}${px ? '&px=' + px : ''}`); await page.waitForLoadState('load');
  await page.evaluate(() => window.lab.ready());
  await page.evaluate((p) => { const s = document.querySelector('[data-breath]'); scrollTo(0, s.offsetTop + (s.offsetHeight - innerHeight) * p); }, +p);
  await page.waitForTimeout(9000); await page.evaluate(() => window.lab.resetStats()); await page.waitForTimeout(10000);
  const st = await page.evaluate(() => window.lab.stats());
  console.log(v, JSON.stringify({ grids: st.grids, fps: +(st.frames / 10).toFixed(1), rafMs: st.rafMs, gpuMB: st.gpuMB }));
  await b.close();
}
