// Jade & Ember QA: axe (WCAG 2.2 AA tags) + behaviour checks. Run: npm run test:a11y
// Set CHROMIUM_PATH to use a preinstalled Chromium.
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { serve } from './serve.mjs';

const { server, base } = serve();
const pages = JSON.parse(readFileSync(new URL('../config/site.json', import.meta.url), 'utf8')).pages;   // every page in the registry is tested
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

for (const pg of pages) for (const [caseName, opts] of cases) {
  const name = `${caseName} · ${pg.file}`;
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const problems = [];
  const external = [];
  page.on('pageerror', (e) => problems.push(`js error: ${e}`));
  page.on('request', (r) => { if (!r.url().startsWith(base) && !r.url().startsWith('data:')) external.push(r.url()); });
  page.on('response', (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url()}`); });
  await page.goto(base + (pg.file === 'index.html' ? '' : pg.file));
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
  // Pause control and the cinematic loop (the video is the primary motion on desktop; the CSS push is only a fallback)
  if (!(await page.isVisible('.pause'))) p.push('Pause motion button not visible when motion is allowed');
  await page.waitForSelector('.hero.is-video', { timeout: 10000 }).catch(() => p.push('hero video never started (.hero.is-video missing after 10 s)'));
  await page.waitForTimeout(800);   // let the 400 ms crossfade finish
  const vs = () => page.evaluate(() => { const v = document.querySelector('.hero-video'); return { paused: v.paused, t: v.currentTime, muted: v.muted, loop: v.loop, controls: v.controls, hidden: v.getAttribute('aria-hidden'), src: [...v.querySelectorAll('source')].map((s) => s.type), op: getComputedStyle(v).opacity, push: getComputedStyle(document.querySelector('.hero-media img')).animationName }; });
  let a1 = await vs(); await page.waitForTimeout(700); let a2 = await vs();
  if (a1.paused || a2.t <= a1.t) p.push(`video is not advancing: ${JSON.stringify([a1.t, a2.t, a1.paused])}`);
  if (!a1.muted || !a1.loop || a1.controls || a1.hidden !== 'true') p.push(`video attributes wrong: ${JSON.stringify(a1)}`);
  if (a1.src[0] !== 'video/webm; codecs="vp9"' || a1.src[1] !== 'video/mp4') p.push(`source order should be WebM (VP9) then MP4: ${a1.src}`);
  if (a1.op !== '1') p.push(`video should be faded in (opacity ${a1.op})`);
  if (a1.push !== 'none') p.push(`CSS push must be off while the video plays (animation: ${a1.push})`);
  await page.click('.pause');
  await page.waitForTimeout(200); const b1 = await vs(); await page.waitForTimeout(400); const b2 = await vs();
  const pressed = await page.getAttribute('.pause', 'aria-pressed'); const label = await page.textContent('.pause-txt');
  if (!b1.paused || b2.t !== b1.t || pressed !== 'true' || label !== 'Play motion') p.push(`Pause did not pause the video: ${JSON.stringify([b1.paused, b1.t, b2.t, pressed, label])}`);
  await page.click('.pause'); await page.waitForTimeout(700); const c1 = await vs();
  if (c1.paused || c1.t <= b2.t) p.push('Play motion did not resume the video');
  // off-screen pause and resume
  await page.evaluate(() => scrollTo(0, 3000)); await page.waitForTimeout(600);
  if (!(await vs()).paused) p.push('video should pause when the hero is off screen');
  await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(800);
  if ((await vs()).paused) p.push('video should resume when the hero returns');
  const robots = await page.getAttribute('meta[name=robots]', 'content').catch(() => null);
  if (!robots || !/noindex/.test(robots)) p.push(`expected <meta name="robots" content="noindex…">, got ${robots}`);
  const heats = await page.evaluate(() => [...document.querySelectorAll('.heat')].map((h) => h.getAttribute('aria-label')));
  if (!heats.length || heats.some((l) => !/^Heat [123] of 3$/.test(l))) p.push(`heat indicators missing or unlabelled: ${heats}`);
  const sig = await page.evaluate(() => document.querySelectorAll('.dish').length);
  if (sig !== 3) p.push(`expected 3 signature dishes, got ${sig}`);
  report('behaviour: Home hero video + Pause + off-screen pause + noindex + heat labels (desktop)', p);
  await ctx.close();
}
{
  // Menu page: every category is on the page; the jump links are real anchors, sticky, and never leave a heading hidden under the sticky bars.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const p = [];
  await page.goto(base + 'menu.html');
  await page.waitForTimeout(400);
  const cats = await page.evaluate(() => [...document.querySelectorAll('.cat')].map((c) => c.id));
  if (cats.join() !== 'small,wok,noodle,roast,sweet') p.push(`menu categories on the page: ${cats}`);
  if (await page.evaluate(() => document.querySelector('[role=tab],[role=tablist]'))) p.push('the menu must not use tab roles any more (all categories are visible)');
  if ((await page.evaluate(() => document.querySelectorAll('.cat[hidden]').length)) !== 0) p.push('no category may be hidden');
  const stuck = await page.evaluate(async () => { scrollTo({ top: 2200, behavior: 'instant' }); await new Promise((r) => setTimeout(r, 400)); const j = document.querySelector('.jump').getBoundingClientRect(); const t = document.querySelector('.top').getBoundingClientRect(); return { jumpTop: Math.round(j.top), headerBottom: Math.round(t.bottom) }; });
  if (Math.abs(stuck.jumpTop - stuck.headerBottom) > 2) p.push(`jump links should stick directly under the header: ${JSON.stringify(stuck)}`);
  for (const id of ['noodle', 'sweet']) {
    await page.click(`.jump a[href="#${id}"]`);
    await page.waitForTimeout(900);
    const r = await page.evaluate((i) => { const h = document.getElementById(i + '-h').getBoundingClientRect(); const j = document.querySelector('.jump').getBoundingClientRect(); return { heading: Math.round(h.top), jumpBottom: Math.round(j.bottom), cur: document.querySelector('.jump a[aria-current]')?.getAttribute('href') }; }, id);
    if (r.heading < r.jumpBottom) p.push(`"${id}" heading is hidden under the sticky bars: ${JSON.stringify(r)}`);
    if (r.cur !== '#' + id) p.push(`the jump link for "${id}" should be marked current after jumping, got ${r.cur}`);
  }
  // keyboard: the links are reachable in order
  await page.evaluate(() => { scrollTo(0, 0); document.querySelector('.jump a').focus(); });
  await page.keyboard.press('Tab');
  if (!(await page.evaluate(() => document.activeElement.getAttribute('href') === '#wok'))) p.push('Tab should move to the next jump link');
  // print: no header, band, jump links or order band; light ground
  await page.emulateMedia({ media: 'print' });
  const pr = await page.evaluate(() => { const d = (s) => getComputedStyle(document.querySelector(s)).display; return { top: d('.top'), jump: d('.jump'), band: d('.menu-band'), cta: d('.cta-band'), bg: getComputedStyle(document.body).backgroundColor, cols: getComputedStyle(document.querySelector('.items')).columnCount, brand: d('.print-brand') }; });
  if (pr.top !== 'none' || pr.jump !== 'none' || pr.band !== 'none' || pr.cta !== 'none') p.push(`print should hide header, jump links, band and order band: ${JSON.stringify(pr)}`);
  if (pr.bg !== 'rgb(255, 255, 255)' || pr.cols !== '2' || pr.brand !== 'block') p.push(`print should be white, two columns, with the brand line: ${JSON.stringify(pr)}`);
  const pdf = await page.pdf({ format: 'Letter', printBackground: false });
  const pdfPages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  if (pdfPages < 1 || pdfPages > 3) p.push(`the printed menu should fit on 1 to 3 pages, got ${pdfPages}`);
  report('behaviour: Menu page (all categories, sticky jump links, anchors, keyboard, print)', p);
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
  // Simulated no-JS: block every script and drop the .js class the inline script adds.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const p = [];
  await page.route('**/*.js', (r) => r.abort());
  await page.goto(base + 'menu.html');
  await page.evaluate(() => document.documentElement.classList.remove('js'));
  const n = await page.evaluate(() => [...document.querySelectorAll('.cat')].filter((c) => getComputedStyle(c).display !== 'none').length);
  if (n !== 5) p.push(`without JS expected all 5 menu categories visible, saw ${n}`);
  const jumps = await page.evaluate(() => [...document.querySelectorAll('.jump a')].filter((a) => document.getElementById(a.getAttribute('href').slice(1))).length);
  if (jumps !== 5) p.push(`without JS the 5 jump links must be plain anchors to real categories, found ${jumps}`);
  await page.goto(base);
  await page.evaluate(() => document.documentElement.classList.remove('js'));
  const navVisible = await page.evaluate(() => [...document.querySelectorAll('.site-nav a')].filter((a) => a.getBoundingClientRect().height > 0).length);
  if (navVisible < 5) p.push(`without JS expected nav links visible on a phone, saw ${navVisible}`);
  if (await page.isVisible('.pause')) p.push('pause button should not show without JS (no JS = no motion control needed? check animation)');
  const anim = await page.evaluate(() => getComputedStyle(document.querySelector('.hero-media img')).animationName);
  if (anim !== 'none') p.push(`without JS the hero push still animates and cannot be paused (animation: ${anim})`);
  report('behaviour: no-JS fallback (simulated), all menu categories, jump links, nav, no unpausable motion', p);
  await ctx.close();
}

/* Hero video: when it may and may not load, and what happens when it fails */
const heroReq = (log) => log.filter((r) => /hero-loop/.test(r.url));
async function scenario(name, opts, init, check, wait = 3500) {
  const { server: s2, log, base: b2 } = serve();
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const p = [];
  if (init) await init(page, ctx);
  page.on('pageerror', (e) => p.push(`js error: ${e}`));
  await page.goto(b2);
  await page.waitForTimeout(wait);
  await check({ page, p, reqs: heroReq(log), log });
  report(name, p);
  await ctx.close(); s2.close();
}
const state = (page) => page.evaluate(() => ({ cls: document.querySelector('.hero').className, anim: getComputedStyle(document.querySelector('.hero-media img')).animationName, src: document.querySelector('.hero-video').querySelectorAll('source').length, pause: !document.querySelector('.pause').hidden }));

await scenario('video: not requested before the page has loaded (poster first)', { viewport: { width: 1280, height: 800 } }, async (page) => {
  page.__t = {}; page.on('request', (r) => { if (/hero-loop/.test(r.url()) && !page.__t.first) page.__t.first = Date.now(); });
  page.on('load', () => { page.__t.load = Date.now(); });
}, async ({ page, p }) => {
  const t = page.__t;
  if (!t.first) p.push('video was never requested on desktop'); else if (!t.load || t.first < t.load) p.push(`video requested ${t.load ? t.load - t.first : '?'} ms before the load event`);
});
await scenario('video: reduced motion = never requested, still only, no Pause', { viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' }, null, async ({ page, p, reqs }) => {
  const s = await state(page);
  if (reqs.length) p.push(`hero video requested under reduced motion: ${reqs.map((r) => r.url)}`);
  if (s.cls.includes('is-video') || s.cls.includes('push-on') || s.anim !== 'none' || s.pause) p.push(`expected a still: ${JSON.stringify(s)}`);
});
await scenario('video: Save-Data = never requested, still only, no Pause', { viewport: { width: 1280, height: 800 } }, (page) => page.addInitScript(() => Object.defineProperty(navigator, 'connection', { value: { saveData: true, effectiveType: '4g' } })), async ({ page, p, reqs }) => {
  const s = await state(page);
  if (reqs.length) p.push(`hero video requested with Save-Data: ${reqs.map((r) => r.url)}`);
  if (s.cls.includes('is-video') || s.cls.includes('push-on') || s.anim !== 'none' || s.pause) p.push(`expected a still: ${JSON.stringify(s)}`);
});
await scenario('video: slow connection (2g) = never requested, still only', { viewport: { width: 1280, height: 800 } }, (page) => page.addInitScript(() => Object.defineProperty(navigator, 'connection', { value: { saveData: false, effectiveType: '2g' } })), async ({ page, p, reqs }) => {
  const s = await state(page);
  if (reqs.length) p.push(`hero video requested on 2g: ${reqs.map((r) => r.url)}`);
  if (s.cls.includes('is-video') || s.cls.includes('push-on') || s.anim !== 'none' || s.pause) p.push(`expected a still: ${JSON.stringify(s)}`);
});
await scenario('video: request fails = poster + slow push + working Pause', { viewport: { width: 1280, height: 800 } }, (page) => page.route('**/hero-loop.*', (r) => r.abort()), async ({ page, p }) => {
  const s = await state(page);
  if (s.cls.includes('is-video') || !s.cls.includes('push-on') || s.anim !== 'push' || !s.pause) p.push(`expected the push fallback: ${JSON.stringify(s)}`);
  await page.click('.pause');
  const ps = await page.evaluate(() => getComputedStyle(document.querySelector('.hero-media img')).animationPlayState);
  if (ps !== 'paused') p.push(`Pause should pause the push fallback (${ps})`);
}, 4500);
await scenario('video: autoplay refused = poster + slow push, no broken state', { viewport: { width: 1280, height: 800 } }, (page) => page.addInitScript(() => { HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('blocked', 'NotAllowedError')); }), async ({ page, p }) => {
  const s = await state(page);
  if (s.cls.includes('is-video') || !s.cls.includes('push-on') || s.anim !== 'push') p.push(`expected the push fallback: ${JSON.stringify(s)}`);
});
await scenario('video: phone portrait (390x844) = never requested, poster + push + Pause', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, null, async ({ page, p, reqs }) => {
  const s = await state(page);
  if (reqs.length) p.push(`hero video requested on a portrait phone: ${reqs.map((r) => r.url)}`);
  if (s.cls.includes('is-video') || !s.cls.includes('push-on') || s.anim !== 'push' || !s.pause) p.push(`expected poster + push + Pause: ${JSON.stringify(s)}`);
});
await scenario('video: phone landscape (844x390) = never requested, poster + push + Pause', { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true }, null, async ({ page, p, reqs }) => {
  const s = await state(page);
  if (reqs.length) p.push(`hero video requested on a landscape phone: ${reqs.map((r) => r.url)}`);
  if (s.cls.includes('is-video') || !s.cls.includes('push-on') || s.anim !== 'push' || !s.pause) p.push(`expected poster + push + Pause: ${JSON.stringify(s)}`);
  await page.click('.pause');
  const ps = await page.evaluate(() => getComputedStyle(document.querySelector('.hero-media img')).animationPlayState);
  if (ps !== 'paused') p.push(`Pause should pause the push on a landscape phone (${ps})`);
});
await scenario('video: tablet portrait (820x1180) = never requested, poster + push', { viewport: { width: 820, height: 1180 } }, null, async ({ page, p, reqs }) => {
  const s = await state(page);
  if (reqs.length || s.cls.includes('is-video') || !s.cls.includes('push-on')) p.push(`expected poster + push, no video: ${JSON.stringify([reqs.length, s])}`);
});
await scenario('video: 959px wide (landscape) = never requested, poster + push', { viewport: { width: 959, height: 700 } }, null, async ({ page, p, reqs }) => {
  const s = await state(page);
  if (reqs.length || s.cls.includes('is-video') || !s.cls.includes('push-on')) p.push(`959px must not load the video: ${JSON.stringify([reqs.length, s])}`);
});
await scenario('video: 960px wide = plays, Pause works', { viewport: { width: 960, height: 700 } }, null, async ({ page, p }) => {
  await page.waitForSelector('.hero.is-video', { timeout: 8000 }).catch(() => p.push('video did not start at 960px'));
  await page.click('.pause').catch(() => p.push('Pause not clickable at 960px'));
  const paused = await page.evaluate(() => document.querySelector('.hero-video').paused);
  if (!paused) p.push('Pause did not pause the video at 960px');
});
await scenario('video: touch device at desktop width (1280x800) = plays', { viewport: { width: 1280, height: 800 }, isMobile: true, hasTouch: true }, null, async ({ page, p }) => {
  await page.waitForSelector('.hero.is-video', { timeout: 8000 }).catch(() => p.push('video did not start on a wide touch device (width, not device type, decides)'));
});
await scenario('video: resizing across 960px stops and restarts it (and the push takes over)', { viewport: { width: 1280, height: 800 } }, null, async ({ page, p }) => {
  await page.waitForSelector('.hero.is-video', { timeout: 8000 }).catch(() => p.push('video did not start at 1280px'));
  await page.setViewportSize({ width: 800, height: 800 }); await page.waitForTimeout(800);
  let s = await state(page);
  if (s.cls.includes('is-video') || !s.cls.includes('push-on') || s.src !== 0) p.push(`below 960px the clip should be dropped and the push should run: ${JSON.stringify(s)}`);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForSelector('.hero.is-video', { timeout: 8000 }).catch(() => p.push('video did not restart after resizing back above 960px'));
  s = await state(page);
  if (s.anim !== 'none') p.push(`the push must stop again once the clip plays: ${JSON.stringify(s)}`);
}, 3500);
await scenario('video: no JS (simulated) = no source, invisible element, no motion', { viewport: { width: 1280, height: 800 } }, (page) => page.route('**/*.js', (r) => r.abort()), async ({ page, p, reqs }) => {
  const s = await page.evaluate(() => ({ sources: document.querySelector('.hero-video').querySelectorAll('source').length, src: document.querySelector('.hero-video').getAttribute('src'), op: getComputedStyle(document.querySelector('.hero-video')).opacity, anim: getComputedStyle(document.querySelector('.hero-media img')).animationName }));
  if (reqs.length || s.sources || s.src || s.op !== '0' || s.anim !== 'none') p.push(`without JS expected no video, no motion: ${JSON.stringify([reqs.length, s])}`);
}, 1500);
await browser.close(); server.close();
console.log(failed ? `\n${failed} check group(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
