// Quick frame grabber for tuning: node tools/frames.mjs <WxH> <dpr> <outPrefix> <p> [p ...]   (lab bundle, deterministic seek, software GL)
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [vp, dpr, out, ...ps] = process.argv.slice(2); const [w, h] = vp.split('x').map(Number);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: +dpr, hasTouch: w < 600, isMobile: w < 600 });
const page = await ctx.newPage(); page.on('pageerror', (e) => console.log('pageerror', e.message)); page.on('console', (m) => m.type() === 'warning' && console.log(m.text()));
await page.route('**/js/breath.min.js', (r) => r.fulfill({ path: new URL('../js/breath.lab.js', import.meta.url).pathname, contentType: 'text/javascript' }));
await page.goto((process.env.BASE || 'http://localhost:8431/') + 'index.html?lab=1&perf=off&video=off' + (process.env.Q || '')); await page.waitForLoadState('load');
console.log(await page.evaluate(() => window.lab.ready()));
for (const p of ps) { await page.evaluate(([p, o]) => window.lab.seek(p, o), [+p, { steps: +(process.env.STEPS || 240), span: .3 }]); await page.waitForTimeout(100); await page.screenshot({ path: `${out}-p${String(Math.round(+p * 100)).padStart(3, '0')}.jpg`, type: 'jpeg', quality: 88, timeout: 180000 }); console.log('p', p); }
console.log(JSON.stringify(await page.evaluate(() => window.lab.stats())));
await b.close();
