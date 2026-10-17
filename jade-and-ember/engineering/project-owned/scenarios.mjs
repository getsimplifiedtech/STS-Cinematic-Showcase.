// Behaviour scenarios. Each runs against one site (baseline or candidate) and returns a plain JSON trace. The harness runs every scenario on
// both and requires equal traces: the same states, the same labels, the same ARIA values, the same focus order, the same requests.
// Traces contain only things the visitor or a script can observe; nothing time-dependent beyond a settled state.
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const CTX = { locale: 'en-US', timezoneId: 'UTC', colorScheme: 'light', deviceScaleFactor: 1 };

async function withPage(browser, opts, fn) {
  const ctx = await browser.newContext({ ...CTX, ...opts });
  const page = await ctx.newPage();
  const log = { errors: [], failed: [] };
  page.on('pageerror', (e) => log.errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') log.errors.push(`console: ${m.text()}`); });
  // Aborted requests are cancellations (navigating away, the hero stopping its video), not failures; HTTP errors and real network errors are.
  page.on('requestfailed', (r) => { if (!/ERR_ABORTED/.test(r.failure()?.errorText || '')) log.failed.push(new URL(r.url()).pathname); });
  page.on('response', (r) => { if (r.status() >= 400) log.failed.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  try { return await fn(page, log); } finally { await ctx.close(); }
}

const heroState = (page) => page.evaluate(() => {
  const hero = document.querySelector('[data-ambient-root]'), pause = document.querySelector('.pause'), video = document.querySelector('.hero-video');
  return {
    classes: ['is-video', 'push-on', 'is-paused'].filter((c) => hero.classList.contains(c)),
    pauseHidden: pause.hidden, label: pause.querySelector('.pause-txt').textContent, pressed: pause.getAttribute('aria-pressed'),
    sources: video ? video.querySelectorAll('source').length : -1, videoPaused: video ? video.paused : null,
  };
});
const settled = (page) => page.waitForFunction(() => { const h = document.querySelector('[data-ambient-root]'); return h.classList.contains('is-video') || h.classList.contains('push-on'); }, null, { timeout: 25000 });

const viewport = (w, h) => ({ viewport: { width: w, height: h } });
const descriptor = () => { const e = document.activeElement; if (!e || e === document.body) return null; return { tag: e.tagName.toLowerCase(), id: e.id || undefined, text: (e.getAttribute('aria-label') || e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40), href: e.getAttribute('href') || undefined }; };

export const scenarios = [
  { name: 'hero: desktop with motion allowed, Pause and Play', run: ({ browser, base }) => withPage(browser, { ...viewport(1440, 900), reducedMotion: 'no-preference' }, async (page, log) => {
    await page.goto(base); await settled(page);
    const initial = await heroState(page);
    await page.click('.pause'); await page.waitForTimeout(400);
    const paused = await heroState(page);
    await page.click('.pause'); await page.waitForTimeout(400);
    const resumed = await heroState(page);
    return { initial, paused, resumed, log };
  }) },
  { name: 'hero: reduced motion shows the still and no control', run: ({ browser, base }) => withPage(browser, { ...viewport(1440, 900), reducedMotion: 'reduce' }, async (page, log) => { await page.goto(base); await page.waitForTimeout(1500); return { state: await heroState(page), log }; }) },
  { name: 'hero: Save-Data connection shows the still', run: ({ browser, base }) => withPage(browser, { ...viewport(1440, 900), reducedMotion: 'no-preference' }, async (page, log) => {
    await page.addInitScript(() => Object.defineProperty(navigator, 'connection', { value: { saveData: true, effectiveType: '4g' } }));
    await page.goto(base); await page.waitForTimeout(1500); return { state: await heroState(page), log };
  }) },
  { name: 'hero: 2g connection shows the still', run: ({ browser, base }) => withPage(browser, { ...viewport(1440, 900), reducedMotion: 'no-preference' }, async (page, log) => {
    await page.addInitScript(() => Object.defineProperty(navigator, 'connection', { value: { saveData: false, effectiveType: '2g' } }));
    await page.goto(base); await page.waitForTimeout(1500); return { state: await heroState(page), log };
  }) },
  { name: 'hero: width under 960 px uses the slow push, no video', run: ({ browser, base }) => withPage(browser, { ...viewport(820, 1180), reducedMotion: 'no-preference' }, async (page, log) => { await page.goto(base); await page.waitForTimeout(1500); return { state: await heroState(page), log }; }) },
  { name: 'hero: blocked video falls back to poster and push', run: ({ browser, base }) => withPage(browser, { ...viewport(1440, 900), reducedMotion: 'no-preference' }, async (page) => {
    await page.route(/\.(webm|mp4)(\?.*)?$/, (r) => r.abort());
    // Firelight has no slow-push poster mode: with the footage blocked the hero stays on its still (neither is-video nor push-on is added), so this scenario waits for the page to load and settle rather than for a class.
    await page.goto(base, { waitUntil: 'load' }); await page.waitForTimeout(3000); return { state: await heroState(page) };
  }) },
  { name: 'navigation: phone menu toggle, Escape, resize', run: ({ browser, base }) => withPage(browser, { ...viewport(390, 844), isMobile: true, hasTouch: true, reducedMotion: 'reduce' }, async (page, log) => {
    await page.goto(base);
    const s = () => page.evaluate(() => ({ expanded: document.querySelector('.nav-toggle').getAttribute('aria-expanded'), open: document.querySelector('#site-nav').classList.contains('is-open'), visible: document.querySelector('#site-nav a').getBoundingClientRect().height > 0, focus: document.activeElement === document.querySelector('.nav-toggle') }));
    const closed = await s();
    await page.click('.nav-toggle'); const opened = await s();
    await page.keyboard.press('Escape'); const escaped = await s();
    await page.click('.nav-toggle'); await page.setViewportSize({ width: 1000, height: 800 }); await page.waitForTimeout(300); const resized = await s();
    return { closed, opened, escaped, resized, log };
  }) },
  { name: 'menu page: jump-link current state while scrolling', run: ({ browser, base }) => withPage(browser, { ...viewport(1440, 900), reducedMotion: 'reduce' }, async (page, log) => {
    await page.goto(base + 'menu.html'); await page.waitForTimeout(500);
    const ids = await page.evaluate(() => [...document.querySelectorAll('.jump a')].map((a) => a.getAttribute('href').slice(1)));
    const trace = [];
    for (const id of ids) {
      await page.evaluate((i) => { const y = document.getElementById(i).getBoundingClientRect().top + scrollY - innerHeight * 0.32; scrollTo({ top: y, left: 0, behavior: 'instant' }); }, id);
      await page.waitForTimeout(350);
      trace.push([id, await page.evaluate(() => [...document.querySelectorAll('.jump a[aria-current]')].map((a) => a.getAttribute('href')))]);
    }
    return { trace, log };
  }) },
  { name: 'every page: skip link and first Tab stops', run: ({ browser, base, pages }) => withPage(browser, { ...viewport(1440, 900), reducedMotion: 'reduce' }, async (page, log) => {
    const out = {};
    for (const f of pages) {
      await page.goto(base + f); await page.keyboard.press('Tab'); await page.waitForTimeout(500);
      const first = await page.evaluate(descriptor);
      const box = await page.evaluate(() => { const r = document.activeElement.getBoundingClientRect(); return { onScreen: r.top >= 0 && r.left >= 0 && r.height > 0 }; });
      await page.keyboard.press('Enter'); await page.waitForTimeout(100);
      out[f] = { first, box, hash: await page.evaluate(() => location.hash), after: await page.evaluate(() => ({ tag: document.activeElement.tagName, id: document.activeElement.id })) };
    }
    return { out, log };
  }) },
  { name: 'every page: keyboard tab order (first 45 stops)', run: ({ browser, base, pages }) => withPage(browser, { ...viewport(1440, 900), reducedMotion: 'reduce' }, async (page, log) => {
    const out = {};
    for (const f of pages) { await page.goto(base + f); const seq = []; for (let i = 0; i < 45; i++) { await page.keyboard.press('Tab'); seq.push(await page.evaluate(descriptor)); } out[f] = seq; }
    return { out, log };
  }) },
  { name: 'every page: requests made, failures and console errors', run: ({ browser, base, pages }) => withPage(browser, { ...viewport(1440, 900), reducedMotion: 'no-preference' }, async (page, log) => {
    const out = {};
    for (const f of pages) {
      const seen = new Set(); const handler = (r) => seen.add(new URL(r.url()).pathname);
      page.on('request', handler); log.errors.length = 0; log.failed.length = 0;
      await page.goto(base + f); await page.waitForTimeout(1800);
      page.off('request', handler);
      out[f] = { requests: [...seen].sort(), errors: [...log.errors], failed: [...log.failed] };
    }
    return { out };
  }) },
  { name: 'every page without JavaScript: content and navigation', run: ({ browser, base, pages }) => withPage(browser, { ...viewport(390, 844), javaScriptEnabled: false }, async (page) => {
    const out = {};
    for (const f of pages) { await page.goto(base + f); out[f] = await page.evaluate(() => ({ text: document.body.innerText.replace(/\s+/g, ' ').trim(), nav: [...document.querySelectorAll('nav a')].map((a) => [a.textContent.trim(), a.getBoundingClientRect().height > 0]) })); }
    return out;
  }) },
  { name: 'opened as files from the folder (file://), no server', run: ({ browser, root, pages }) => withPage(browser, { ...viewport(1440, 900), reducedMotion: 'reduce' }, async (page, log) => {
    const out = {};
    for (const f of pages) {
      log.errors.length = 0; log.failed.length = 0;
      await page.goto(pathToFileURL(join(root, f)).href); await page.waitForTimeout(800);
      out[f] = await page.evaluate(async () => { await Promise.all([...document.fonts].filter((x) => !/Fallback/.test(x.family)).map((x) => x.load().catch(() => {}))); await document.fonts.ready; return { title: document.title, h1: document.querySelector('h1')?.innerText, images: [...document.images].map((i) => [(i.getAttribute('alt') || '').slice(0, 30), i.complete && i.naturalWidth > 0]), fonts: [...document.fonts].filter((x) => !/Fallback/.test(x.family)).map((x) => `${x.family} ${x.weight} ${x.status}`).sort() }; });
      await page.waitForTimeout(400);   // console events reach this process asynchronously: let the ones the font loads just caused arrive before the log is read (a refused font load in WebKit was sometimes read before, sometimes after)
      const rootUrl = pathToFileURL(root).href;   // the two folders live in different temp folders: make the traces independent of that
      const norm = (t) => t.split(rootUrl).join('<root>').split(root).join('<root>').replace(/\.[0-9a-f]{8}\.(woff2|webp|webm|mp4|css|js)\b/g, '.$1');   // also makes the trace independent of hashed file names
      out[f].errors = log.errors.map(norm).sort(); out[f].failed = log.failed.map((p) => norm(p)).sort();   // concurrent failures arrive in no fixed order in every engine: the SET must be equal, the order is not behaviour
    }
    return { out };
  }) },
];
