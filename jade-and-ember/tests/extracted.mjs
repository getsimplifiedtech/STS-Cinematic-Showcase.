// Verifies a built site folder the way a reviewer uses it: open index.html, then click through all five pages with the real navigation.
// Works on this folder or on an extracted preview ZIP:  node tests/extracted.mjs [folder]
//   A. file:// (double-click index.html)       B. the folder's own serve.py (if present)      C. a phone-width walk through the mobile menu
// Set CHROMIUM_PATH to use an installed Chromium.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const dir = resolve(process.argv[2] || '.');
const nav = [['index.html', 'Home', 'The breath of the wok.'], ['menu.html', 'Menu', 'Sample menu'], ['our-story.html', 'Our story', 'A small kitchen, one very hot wok.'], ['visit-us.html', 'Visit us', 'Visit us (sample details)'], ['order-online.html', 'Order online', 'Dinner, to go.']];
let failed = 0;
const report = (name, problems) => { console.log(`${problems.length ? 'FAIL' : 'PASS'}  ${name}`); problems.forEach((p) => console.log('   - ' + p)); if (problems.length) failed++; };

// 0. the folder itself
{
  const p = [];
  for (const f of ['index.html', 'menu.html', 'our-story.html', 'visit-us.html', 'order-online.html', 'styles.css', 'site.js', 'hero.js', 'menu.js']) if (!existsSync(join(dir, f))) p.push(`missing ${f}`);
  for (const f of ['young-serif-latin-400-normal.woff2', 'karla-latin-400-normal.woff2', 'karla-latin-600-normal.woff2', 'noto-serif-sc-seal-600.woff2']) if (!existsSync(join(dir, 'fonts', f))) p.push(`missing fonts/${f}`);
  const media = existsSync(join(dir, 'media')) ? readdirSync(join(dir, 'media')) : [];
  for (const f of ['hero-wok.webp', 'hero-wok-m.webp', 'hero-loop.webm', 'hero-loop.mp4', 'dish-mapo.webp', 'dish-charsiu.webp', 'dish-dandan.webp', 'story-jade-bowls.webp']) if (!media.includes(f)) p.push(`missing media/${f}`);
  // every reference in the pages must be relative and exist
  for (const [file] of nav) {
    const html = readFileSync(join(dir, file), 'utf8');
    for (const m of html.matchAll(/(?:href|src|srcset|data-webm|data-mp4)="([^"]+)"/g)) {
      const u = m[1];
      if (/^(https?:|tel:|mailto:|data:|#)/.test(u) || u === '../') continue;
      if (u.startsWith('/')) p.push(`${file}: absolute path ${u}`);
      else if (!existsSync(join(dir, u.split('#')[0]))) p.push(`${file}: ${u} does not exist in the folder`);
    }
  }
  report(`folder contents: ${dir}`, p);
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

async function walk(label, startUrl, { phone = false, expectVideo = true } = {}) {
  const p = [];
  const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(`js error: ${e}`));
  // On file:// the browser refuses the crossorigin font preload (console noise only; the fonts load through CSS and are checked below).
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text()) && !/^Access to font at 'file:/.test(m.text())) problems.push(`console: ${m.text()}`); });
  page.on('response', (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url()}`); });
  page.on('requestfailed', (r) => { if (/ERR_ABORTED/.test(r.failure()?.errorText || '')) return;   // a click on a link cancels the previous page's in-flight image
    if (!/\.woff2/.test(r.url()) || !startUrl.startsWith('file:')) problems.push(`request failed ${r.url()}: ${r.failure()?.errorText}`); });
  await page.goto(startUrl);
  await page.waitForTimeout(900);
  for (let i = 0; i < nav.length; i++) {
    const [file, name, h1] = nav[i];
    if (i > 0) {
      if (phone) { await page.click('.nav-toggle'); await page.waitForTimeout(150); }
      const sel = phone ? `.site-nav a:text-is("${name}")` : (name === 'Order online' ? '.top-cta' : `.site-nav a:text-is("${name}")`);
      await Promise.all([page.waitForURL((u) => u.pathname.endsWith('/' + file) || (file === 'index.html' && u.pathname.endsWith('/'))), page.click(sel)]);
    }
    await page.waitForTimeout(500);
    await page.evaluate(async () => { document.querySelectorAll('img').forEach((im) => { im.loading = 'eager'; }); await Promise.all([...document.images].map((im) => im.decode().catch(() => {}))); });
    const r = await page.evaluate(() => ({ h1: document.querySelector('h1').textContent.trim(), title: document.title, imgs: [...document.images].filter((im) => !(im.complete && im.naturalWidth > 0)).map((im) => im.src.split('/').pop()), cur: document.querySelector('.site-nav a[aria-current=page]')?.textContent.trim(), fonts: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family).filter((v, i, a) => a.indexOf(v) === i), bodyFont: getComputedStyle(document.querySelector('h1')).fontFamily.split(',')[0], overflow: document.documentElement.scrollWidth - innerWidth }));
    if (r.h1 !== h1) p.push(`${file}: h1 is "${r.h1}", expected "${h1}"`);
    if (r.cur !== name) p.push(`${file}: current nav item is "${r.cur}", expected "${name}"`);
    if (r.imgs.length) p.push(`${file}: images not loaded: ${r.imgs}`);
    if (!r.fonts.includes('Young Serif') || !r.fonts.includes('Karla')) p.push(`${file}: web fonts did not load (${r.fonts})`);
    if (r.overflow > 0) p.push(`${file}: horizontal overflow ${r.overflow}px`);
    if (file === 'index.html' && expectVideo && !phone) {
      const ok = await page.waitForSelector('.hero.is-video', { timeout: 10000 }).then(() => true, () => false);
      if (!ok) p.push('Home: the hero video did not start');
      else { const t1 = await page.evaluate(() => document.querySelector('.hero-video').currentTime); await page.waitForTimeout(700); const t2 = await page.evaluate(() => document.querySelector('.hero-video').currentTime); if (!(t2 > t1)) p.push('Home: the hero video is not advancing'); }
    }
    if (file === 'index.html' && phone) {
      if (await page.evaluate(() => !!document.querySelector('.hero.is-video'))) p.push('Home on a phone must not play the video');
    }
    if (file === 'menu.html') {
      await Promise.all([page.waitForTimeout(900), page.click('.jump a[href="#roast"]')]);
      const y = await page.evaluate(() => Math.round(document.getElementById('roast-h').getBoundingClientRect().top));
      if (y < 100 || y > 400) p.push(`Menu: the "Roast & braise" jump link left the heading at y=${y}`);
    }
  }
  // back to Home through the brand link
  await Promise.all([page.waitForURL((u) => u.pathname.endsWith('/index.html') || u.pathname.endsWith('/')), page.click('.brand')]);
  await ctx.close();
  report(label, [...p, ...problems]);
}

await walk('A. file:// from index.html: click through all five pages (desktop)', pathToFileURL(join(dir, 'index.html')).href);
await walk('A. file:// from index.html: all five pages through the phone menu (390 px)', pathToFileURL(join(dir, 'index.html')).href, { phone: true });

if (existsSync(join(dir, 'serve.py'))) {
  const port = 8800 + Math.floor(Math.random() * 90);
  const srv = spawn('python3', ['-I', join(dir, 'serve.py'), String(port)], { cwd: dir, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 1200));
  await walk(`B. python3 serve.py (http://localhost:${port}/): all five pages (desktop)`, `http://127.0.0.1:${port}/`);
  await walk(`B. python3 serve.py: all five pages through the phone menu (390 px)`, `http://127.0.0.1:${port}/`, { phone: true });
  srv.kill();
}
await browser.close();
console.log(failed ? `\n${failed} group(s) failed.` : '\nThe folder works from index.html.');
process.exit(failed ? 1 : 0);
