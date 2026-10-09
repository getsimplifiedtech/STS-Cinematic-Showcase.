// Jade & Ember QA: axe (WCAG 2.2 AA tags) + behaviour checks. Run: npm run test:a11y
// Set CHROMIUM_PATH to use a preinstalled Chromium.
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = process.cwd();
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  try {
    let p = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
    if (p.endsWith('/') || p === '.') p = '/index.html';
    const f = join(root, p);
    res.writeHead(200, { 'content-type': types[extname(f)] || 'application/octet-stream' });
    res.end(await readFile(f));
  } catch { res.writeHead(404); res.end('nf'); }
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

let failed = 0;
const report = (name, problems) => {
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  ${name}`);
  problems.forEach((p) => console.log('   - ' + p));
  if (problems.length) failed++;
};

const cases = [
  ['desktop 1440', { viewport: { width: 1440, height: 900 } }],
  ['tablet 820', { viewport: { width: 820, height: 1180 } }],
  ['mobile 390', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }],
  ['reflow 320', { viewport: { width: 320, height: 640 } }],
  ['landscape phone 844x390', { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true }],
  ['reduced-motion', { viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' }],
];

for (const [name, opts] of cases) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const problems = [];
  const external = [];
  page.on('pageerror', (e) => problems.push(`js error: ${e}`));
  page.on('request', (r) => { if (!r.url().startsWith(base) && !r.url().startsWith('data:')) external.push(r.url()); });
  page.on('response', (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url()}`); });
  await page.goto(base);
  const js = opts.javaScriptEnabled !== false;
  if (js) await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); } scrollTo(0, 0); });
  await page.waitForTimeout(600);
  const m = !js ? { overflow: 0, dup: [], imgs: 0, h1: 1, small: [] } : await page.evaluate(() => {
    const ids = {}, dup = [];
    document.querySelectorAll('[id]').forEach((e) => (ids[e.id] ? dup.push(e.id) : (ids[e.id] = 1)));
    const imgs = [...document.images].filter((i) => !i.alt && i.getAttribute('alt') === null).length;
    const small = [...document.querySelectorAll('a,button')].filter((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && (r.height < 24 || r.width < 24) && !e.classList.contains('skip'); }).map((e) => e.outerHTML.slice(0, 60));
    return { overflow: document.documentElement.scrollWidth - innerWidth, dup, imgs, h1: document.querySelectorAll('h1').length, small };
  });
  if (m.overflow > 0) problems.push(`horizontal overflow ${m.overflow}px`);
  if (m.dup.length) problems.push(`duplicate ids: ${m.dup}`);
  if (m.imgs) problems.push(`${m.imgs} images without alt attribute`);
  if (m.h1 !== 1) problems.push(`expected one h1, found ${m.h1}`);
  if (m.small.length) problems.push(`targets under 24px: ${m.small}`);
  if (external.length) problems.push(`external requests: ${external}`);
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
  for (const v of axe.violations) problems.push(`axe ${v.impact} ${v.id}: ${v.help} (${v.nodes.length} nodes) e.g. ${v.nodes[0].target}`);
  report(name, problems);
  await ctx.close();
}

/* Behaviour checks */
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const p = [];
  await page.goto(base);
  // Menu tabs: only one category visible, keyboard arrows move selection
  const visible = () => page.evaluate(() => [...document.querySelectorAll('.cat')].filter((c) => !c.hidden).map((c) => c.id));
  let v = await visible();
  if (v.length !== 1 || v[0] !== 'cat-small') p.push(`initial visible categories: ${v}`);
  await page.focus('#tab-small');
  await page.keyboard.press('ArrowRight');
  v = await visible();
  if (v[0] !== 'cat-wok') p.push(`ArrowRight did not select 'From the wok' (got ${v})`);
  await page.keyboard.press('End');
  v = await visible();
  if (v[0] !== 'cat-sweet') p.push(`End did not select last tab (got ${v})`);
  await page.click('#tab-noodle');
  v = await visible();
  if (v[0] !== 'cat-noodle') p.push('click on tab did not switch category');
  // Pause control
  const pauseVisible = await page.isVisible('.pause');
  if (!pauseVisible) p.push('Pause motion button not visible when motion is allowed');
  const state = () => page.evaluate(() => getComputedStyle(document.querySelector('.hero-media img')).animationPlayState);
  const run1 = await state();
  await page.click('.pause');
  const run2 = await state();
  const pressed = await page.getAttribute('.pause', 'aria-pressed');
  if (run1 !== 'running' || run2 !== 'paused' || pressed !== 'true') p.push(`pause control: ${run1} -> ${run2}, aria-pressed=${pressed}`);
  const robots = await page.getAttribute('meta[name=robots]', 'content').catch(() => null);
  if (!robots || !/noindex/.test(robots)) p.push(`expected <meta name="robots" content="noindex…">, got ${robots}`);
  const heats = await page.evaluate(() => [...document.querySelectorAll('.heat')].map((h) => h.getAttribute('aria-label')));
  if (!heats.length || heats.some((l) => !/^Heat [123] of 3$/.test(l))) p.push(`heat indicators missing or unlabelled: ${heats}`);
  const sig = await page.evaluate(() => document.querySelectorAll('.dish').length);
  if (sig !== 3) p.push(`expected 3 signature dishes, got ${sig}`);
  report('behaviour: tabs + pause control + noindex + heat labels (desktop)', p);
  await ctx.close();
}
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const p = [];
  await page.goto(base);
  const navHidden = () => page.evaluate(() => !document.getElementById('site-nav').classList.contains('is-open'));
  if (!(await navHidden())) p.push('mobile nav should start collapsed');
  await page.click('.nav-toggle');
  if (await navHidden()) p.push('mobile nav did not open'); 
  if ((await page.getAttribute('.nav-toggle', 'aria-expanded')) !== 'true') p.push('aria-expanded not true when open');
  await page.keyboard.press('Escape');
  if (!(await navHidden())) p.push('Escape did not close mobile nav');
  const bar = await page.evaluate(() => ({ long: getComputedStyle(document.querySelector('.bar-long')).display, short: getComputedStyle(document.querySelector('.bar-short')).display }));
  if (bar.long !== 'none' || bar.short === 'none') p.push(`phone should show the short disclosure only: ${JSON.stringify(bar)}`);
  const pauseName = await page.evaluate(() => { const b = document.querySelector('.pause'); return b.hidden ? null : b.textContent.trim(); });
  if (pauseName !== 'Pause motion') p.push(`phone pause button needs the accessible name "Pause motion", got ${pauseName}`);
  const pw = await page.evaluate(() => Math.round(document.querySelector('.pause').getBoundingClientRect().width));
  if (pw < 44) p.push(`phone pause button narrower than 44px: ${pw}`);
  report('behaviour: mobile navigation + mobile hero chrome', p);
  await ctx.close();
}
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const p = [];
  await page.goto(base);
  const anim = await page.evaluate(() => getComputedStyle(document.querySelector('.hero-media img')).animationName);
  if (anim !== 'none') p.push(`animation still running under reduced motion: ${anim}`);
  if (await page.isVisible('.pause')) p.push('pause button should be hidden when there is no motion');
  report('behaviour: reduced motion = static still, no motion', p);
  await ctx.close();
}
{
  // Simulated no-JS: block site.js and drop the .js class the inline script adds.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const p = [];
  await page.route('**/site.js', (r) => r.abort());
  await page.goto(base);
  await page.evaluate(() => document.documentElement.classList.remove('js'));
  const n = await page.evaluate(() => [...document.querySelectorAll('.cat')].filter((c) => getComputedStyle(c).display !== 'none').length);
  if (n !== 5) p.push(`without JS expected all 5 menu categories visible, saw ${n}`);
  const navVisible = await page.evaluate(() => [...document.querySelectorAll('.site-nav a')].filter((a) => a.getBoundingClientRect().height > 0).length);
  if (navVisible < 5) p.push(`without JS expected nav links visible on a phone, saw ${navVisible}`);
  if (await page.isVisible('.pause')) p.push('pause button should not show without JS (no JS = no motion control needed? check animation)');
  const anim = await page.evaluate(() => getComputedStyle(document.querySelector('.hero-media img')).animationName);
  if (anim !== 'none') p.push(`without JS the hero push still animates and cannot be paused (animation: ${anim})`);
  report('behaviour: no-JS fallback (simulated), all categories, nav, no unpausable motion', p);
  await ctx.close();
}
await browser.close(); server.close();
console.log(failed ? `\n${failed} check group(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
