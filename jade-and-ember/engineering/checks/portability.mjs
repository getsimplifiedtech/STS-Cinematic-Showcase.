// check:portability. The delivered folder works wherever static files can be put. For each way of serving it, the same walk is made in the pinned
// browser with real clicks: every page through the header navigation (desktop) and through the phone menu, brand and footer links, back
// navigation; every image decoded, the four web fonts loaded, no failed or out-of-folder request, no script error; the hero video starts
// (or the page falls back cleanly where the server cannot stream it).
//   folder       a ZIP of the delivered files, extracted into a path with spaces, an ampersand, an em dash, brackets and "#", opened as file://
//                from index.html with no server at all
//   root         http, served at the domain root
//   subdir       http, under /clients/acme/jade-and-ember/ (nothing in the site may assume the root); also the directory URL without its
//                trailing slash, which every static host redirects
//   pretty       extension-less URLs (/menu) as Netlify, Cloudflare Pages and similar hosts serve them
//   no-range     a server without HTTP Range support (a minimal host): the pages still work, the video plays or the poster and push take over
//   adapters     the folder staged by the Cloudflare Pages and the Vercel adapter and served by that adapter's simulation profile (G6-4)
//   query        a query string and fragments on every page
// Static: file names are plain ASCII without spaces, unique ignoring case, short; no symlinks or hidden files; every link relative; no <base>.
// Supported URL conventions: .html file URLs, extension-less file URLs, directory URLs with a trailing slash. Not supported (documented): pretty URLs
// WITH a trailing slash (/menu/), because the pages use plain relative links.
// Over file:// Chromium reports a CORS error for the two font preloads (the fonts still load from the stylesheet): known finding F-G3-01.
import { engineNoise } from '../lib/engine-noise.mjs';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchBrowser } from '../lib/browser.mjs';
import { reconcile } from '../lib/findings.mjs';
import { serveSite } from '../lib/server.mjs';
import { profileOf, readManifest, renderBundle } from '../adapters/hosting/index.mjs';
import { assembleCandidate, pagesOf, SHARED } from '../lib/site.mjs';
import { unzipTo, zipFolder } from '../lib/zip.mjs';
import { settleFonts } from '../lib/runtime.mjs';
import { isMain, listFiles, projectDir, tempDir } from '../lib/git.mjs';

const titleOf = (dir, f) => /<title>([^<]*)<\/title>/.exec(readFileSync(join(dir, f), 'utf8'))[1].replace(/&amp;/g, '&');
const h1Of = (dir, f) => /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(readFileSync(join(dir, f), 'utf8'))[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
// WebKit refuses a font fetch from a file:// page (origin "null") instead of falling back: the web font is then not loaded at all
const FILE_CORS_BLOCK = /Origin null is not allowed by Access-Control-Allow-Origin/;
const FONT_PRELOAD_NOISE = /Access to font|net::ERR_FAILED|Failed to load resource: net::ERR_FAILED|A preload for .* is found, but is not used/;

export function checkPortabilityStatic({ root }) {
  const problems = [], notes = [];
  const all = listFiles(root);
  const seen = new Map();
  for (const f of all) {
    if (!/^[A-Za-z0-9._/-]+$/.test(f)) problems.push(`${f}: file names must be ASCII letters, digits, dot, dash, underscore (no spaces or accents: Windows, macOS and URL safe)`);
    if (f.length > 80) problems.push(`${f}: path longer than 80 characters`);
    const k = f.toLowerCase(); if (seen.has(k)) problems.push(`${f} and ${seen.get(k)} differ only by case`); seen.set(k, f);
    if (f.split('/').some((p) => p.startsWith('.'))) problems.push(`${f}: hidden file`);
  }
  const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (lstatSync(p).isSymbolicLink()) problems.push(`${p}: symbolic link`); else if (lstatSync(p).isDirectory()) walk(p); } };
  walk(root);
  for (const f of pagesOf(root)) { const h = readFileSync(join(root, f), 'utf8'); if (/<base[\s>]/i.test(h)) problems.push(`${f}: <base> element`); if (!/^<!doctype html>\n<html lang=/.test(h)) problems.push(`${f}: must start with the doctype and <html lang>`); }
  notes.push(`static: ${all.length} files, names plain ASCII (no spaces), unique ignoring case, no symbolic or hidden files, no <base>, plain relative links`);
  return { problems, notes };
}

// One full walk. open(path) loads a URL in a new page; start is the URL of index.html (or the directory). Returns { problems, fontNoise }.
async function walkSite(args) {
  // A defect can make the walk itself impossible (a page that cannot be clicked through): that is reported as a problem, not a crash.
  try { return await walkSiteInner(args); } catch (e) { return { problems: [`${args.label}: the walk could not complete: ${String(e.message).split('\n')[0]}`], fontNoise: 0, perLoad: 0 }; }
}
async function walkSiteInner({ browser, dir, label, start, prefixCheck, video = 'expect', clean = false }) {
  const problems = [];
  let fontNoise = 0, loadsSeen = 0, fontsFailed = 0, corsBlocked = 0, preloadMedia = 0;
  const engine = browser.browserType().name();
  const pages = pagesOf(dir);
  const bad = (m) => problems.push(`${label}: ${m}`);
  for (const mobile of [false, true]) {
    const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: mobile, hasTouch: mobile, reducedMotion: 'no-preference' });
    ctx.setDefaultTimeout(8000);   // a broken page must fail fast, not stall the walk
    const page = await ctx.newPage();
    const failed = [], errors = [];
    const handle = (kind, text) => { if (engineNoise(engine, text)) preloadMedia++; else if (start.startsWith('file:') && FONT_PRELOAD_NOISE.test(text)) fontNoise++; else if (start.startsWith('file:') && FILE_CORS_BLOCK.test(text)) corsBlocked++; else errors.push(`${kind}: ${text.slice(0, 140)}`); };
    page.on('load', () => { loadsSeen++; });
    page.on('pageerror', (e) => handle('pageerror', e.message));
    page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) handle(m.type(), m.text()); });
    page.on('requestfailed', (r) => { if (!(start.startsWith('file:') && /fonts\//.test(r.url())) && !/ERR_ABORTED/.test(r.failure()?.errorText || '')) failed.push(`${r.url().split('/').slice(-2).join('/')} ${r.failure()?.errorText}`); });
    page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
    page.on('request', (r) => { if (prefixCheck && !r.url().startsWith(prefixCheck) && r.url() !== prefixCheck.replace(/\/$/, '') && !r.url().startsWith('data:')) failed.push(`request outside the site folder: ${r.url()}`); });
    await page.goto(start); await settleFonts(page);
    const tag = (f) => `${label} ${mobile ? 'phone' : 'desktop'} ${f}`;
    const verifyPage = async (f) => {
      const here = new URL(page.url()).pathname;
      if (clean && f !== 'index.html' && decodeURIComponent(here).endsWith(`/${f.replace(/\.html$/, '')}`)) { /* a clean-URL host (Cloudflare Pages, Vercel cleanUrls) redirected the .html link to the extension-less address */ } else if (!decodeURIComponent(here).endsWith(f === 'index.html' ? /(index\.html|\/)$/.test(here) ? here.slice(-1) === '/' ? '/' : 'index.html' : f : f)) bad(`${tag(f)}: landed on ${here}`);
      if ((await page.title()) !== titleOf(dir, f)) bad(`${tag(f)}: title "${await page.title()}" differs from the built page`);
      if ((await page.locator('h1').first().innerText()).replace(/\s+/g, ' ').trim() !== h1Of(dir, f)) bad(`${tag(f)}: h1 differs from the built page`);
      await settleFonts(page);
      const st = await page.evaluate(() => ({ imgs: [...document.images].filter((i) => !(i.complete && i.naturalWidth > 0)).length, fonts: [...document.fonts].filter((x) => !/Fallback/.test(x.family) && x.status !== 'loaded').length, ids: document.querySelectorAll('#main').length }));
      if (st.imgs) bad(`${tag(f)}: ${st.imgs} image(s) did not load`);
      if (st.fonts) { if (start.startsWith('file:')) fontsFailed += st.fonts; else bad(`${tag(f)}: ${st.fonts} web font(s) did not load`); }   // over file:// this is a recorded, engine-specific finding (see the caller)
      if (st.ids !== 1) bad(`${tag(f)}: the skip-link target #main is missing`);
    };
    await verifyPage('index.html');
    if (!mobile) {
      // the hero
      await page.waitForFunction(() => { const h = document.querySelector('[data-ambient-root]'); return h && (h.classList.contains('is-video') || h.classList.contains('push-on')); }, null, { timeout: 15000 }).catch(() => bad(`${tag('index.html')}: the hero never settled`));
      const hero = await page.evaluate(() => document.querySelector('[data-ambient-root]').className);
      if (video === 'expect' && !/is-video/.test(hero)) bad(`${tag('index.html')}: the hero video did not start (${hero})`);
      if (video === 'either' && !/is-video|push-on/.test(hero)) bad(`${tag('index.html')}: neither the video nor the poster push took over (${hero})`);
    }
    // every page through the navigation, then back
    const visited = ['index.html'];
    for (const f of pages.filter((p) => p !== 'index.html')) {
      if (mobile) { await page.click('.nav-toggle'); await page.waitForTimeout(80); }
      const link = page.locator(`header a[href="${f}"]`).filter({ visible: true }).first();
      await Promise.all([page.waitForLoadState('load'), link.click()]);
      await verifyPage(f); visited.push(f);
      await page.goBack(); await page.waitForLoadState('load');
      if (!/index\.html$|\/$/.test(new URL(page.url()).pathname) && !new URL(page.url()).pathname.endsWith('/')) bad(`${tag(f)}: Back did not return to the previous page (${page.url()})`);
      await page.goForward().catch(() => {}); await page.waitForLoadState('load');
      await page.goto(start); await settleFonts(page);
    }
    // brand link and a footer link
    await page.goto(new URL(pages[1], page.url()).href); await settleFonts(page);
    await Promise.all([page.waitForLoadState('load'), page.click('a.brand')]);
    if (!/index\.html$|\/$/.test(new URL(page.url()).pathname)) bad(`${tag('brand')}: the brand link did not go home (${page.url()})`);
    await Promise.all([page.waitForLoadState('load'), page.click('.foot-nav a[href="visit-us.html"]')]);
    await verifyPage('visit-us.html');
    failed.forEach((m) => bad(`${tag('')} ${m}`));
    errors.forEach((m) => bad(`${tag('')} ${m}`));
    await ctx.close();
  }
  return { problems, fontNoise, fontsFailed, corsBlocked, preloadMedia, preloadPerLoad: loadsSeen ? Math.ceil(preloadMedia / loadsSeen) : 0, perLoad: loadsSeen ? Math.ceil(fontNoise / loadsSeen) : 0 };
}

export async function checkPortability({ root = null, browserName = 'chromium', adapters = true } = {}) {
  const own = !root;
  const dir = root || assembleCandidate(projectDir, 'portability');
  const cleanup = [];
  try {
    const s = checkPortabilityStatic({ root: dir });
    const problems = [...s.problems], notes = [...s.notes];
    const measured = []; let preloadPerLoad = 0;
    const { browser } = await launchBrowser(browserName);
    try {
      // folder: ZIP, extract to a hostile path, open index.html directly
      const zip = zipFolder(dir);
      const holder = tempDir('portability'); cleanup.push(holder);
      const hostile = join(holder, 'Jade & Ember — preview #1 [v0.9]', 'site folder');
      mkdirSync(hostile, { recursive: true });
      const names = unzipTo(zip, hostile);
      if (names.length !== listFiles(dir).length) problems.push(`the ZIP held ${names.length} files, the folder ${listFiles(dir).length}`);
      const f = await walkSite({ browser, dir: hostile, label: 'extracted ZIP over file://', start: pathToFileURL(join(hostile, 'index.html')).href, video: 'expect' });
      problems.push(...f.problems); preloadPerLoad = Math.max(preloadPerLoad, f.preloadPerLoad || 0);
      if (f.fontNoise) measured.push({ key: 'portability:file://:font-preload-cors', detail: `over file:// Chromium logs up to ${f.perLoad} message(s) per page load about the two font preloads (CORS from origin "null"); the fonts load from the stylesheet and nothing changes on screen`, value: f.perLoad });
      if (f.fontsFailed) measured.push({ key: 'portability:file://:fonts-not-loaded', detail: `over file:// ${browserName} did not load ${f.fontsFailed} web-font declaration(s) across the walk (${f.corsBlocked} refusals "Origin null is not allowed by Access-Control-Allow-Origin"): the text falls back to the metric-matched fallback fonts; over http the same fonts load`, value: f.fontsFailed });
      const scenarios = [
        ['http at the domain root', { prefix: '/' }, (b) => b, null],
        ['http under /clients/acme/jade-and-ember/', { prefix: '/clients/acme/jade-and-ember/' }, (b) => b, 'sub'],
        ['http under a subdirectory, directory URL without the trailing slash', { prefix: '/clients/acme/jade-and-ember/' }, (b) => b.replace(/\/$/, ''), 'sub'],
        ['http with extension-less URLs', { prefix: '/', pretty: true }, (b) => b, null],
        ['http without Range support', { prefix: '/', ranges: false }, (b) => b, null],
      ];
      for (const [label, opt, startOf, sub] of scenarios) {
        const sv = serveSite(dir, opt);
        const r = await walkSite({ browser, dir, label, start: startOf(sv.base), prefixCheck: sub ? sv.base : sv.origin + '/', video: opt.ranges === false ? 'either' : 'expect' });
        problems.push(...r.problems); preloadPerLoad = Math.max(preloadPerLoad, r.preloadPerLoad || 0); sv.close();
      }
      // the same delivered folder, staged by each hosting adapter and served by that adapter's simulation profile (G6-4): Cloudflare Pages (clean URLs and the .html redirect, the
      // _headers rules applied, Range answered with 200) and Vercel (cleanUrls, trailingSlash false, the vercel.json headers). A simulation of documented behaviour, not the live service.
      if (adapters) {
        const delivered = tempDir('portability-delivered'); cleanup.push(delivered);
        cpSync(dir, delivered, { recursive: true }); rmSync(join(delivered, 'config'), { recursive: true, force: true });
        for (const adapterId of ['cloudflare-pages', 'vercel']) {
          const holder2 = tempDir('portability-bundle'); cleanup.push(holder2);
          const bundle = join(holder2, 'bundle');
          renderBundle(adapterId, { siteDir: delivered, outDir: bundle, urlStyle: 'clean' });
          const prof = profileOf(bundle), site = join(bundle, readManifest(bundle).siteRoot);
          const sv2 = serveSite(site, { profile: prof, plainHttp: true });   // the walk is plain http on a loopback address: the HTTPS-only headers are tested in check:hosting, not here (WebKit would upgrade every request to https)
          const r = await walkSite({ browser, dir: site, label: `${adapterId} bundle (simulation profile)`, start: sv2.base, prefixCheck: sv2.origin + '/', video: prof.ranges ? 'expect' : 'either', clean: true });
          problems.push(...r.problems); preloadPerLoad = Math.max(preloadPerLoad, r.preloadPerLoad || 0); sv2.close();
        }
      }
      // pretty URLs entered directly, query strings and fragments
      const sv = serveSite(dir, { prefix: '/clients/acme/jade-and-ember/', pretty: true });
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
      for (const f of pagesOf(dir)) {
        const page = await ctx.newPage(); const failed = [];
        page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
        const direct = f === 'index.html' ? '' : f.replace('.html', '');
        for (const url of [`${sv.base}${direct}`, `${sv.base}${f}?utm_source=test#top`, `${sv.base}${f}#main`]) {
          await page.goto(url); await settleFonts(page);
          const st = await page.evaluate(() => ({ imgs: [...document.images].filter((i) => !(i.complete && i.naturalWidth > 0)).length, h1: document.querySelectorAll('h1').length, css: getComputedStyle(document.body).backgroundColor }));
          if (st.imgs || st.h1 !== 1 || st.css === 'rgba(0, 0, 0, 0)') problems.push(`${url}: did not render completely (${JSON.stringify(st)})`);
        }
        failed.forEach((m) => problems.push(`direct URLs, ${f}: ${m}`)); await page.close();
      }
      await ctx.close(); sv.close();
    } finally { await browser.close(); }
    if (adapters) notes.push('the same delivered folder, staged by the Cloudflare Pages and Vercel adapters and served by each adapter\'s simulation profile (clean URLs and the .html redirect, the generated header rules applied, Range answered as that host documents): every page walked on desktop and phone with real clicks, no failed request, no error (a simulation of documented behaviour, not the live service)');
    notes.push('serving conventions walked with real clicks on every page, desktop and phone menu, brand and footer links, Back and Forward: extracted ZIP over file:// (path with spaces, &, em dash, #, brackets), domain root, /clients/acme/jade-and-ember/, the directory URL without a trailing slash (host redirect), extension-less URLs, a server without Range support, query strings and fragments');
    if (preloadPerLoad) measured.push({ key: 'portability:preload-media-warning', detail: `${browserName} writes ${preloadPerLoad} console warning(s) per load of the Home page, "Preload of .../media/hero-wok*.webp was ignored due to unknown as or type values, or non-matching media attribute": the Home page has one media-qualified hero preload per art direction and only one can match; the one that matches is used`, value: preloadPerLoad });
    const r = reconcile('portability', measured);
    return { problems: [...problems, ...r.problems], notes: [...notes, ...r.notes] };
  } finally { cleanup.forEach((d) => rmSync(d, { recursive: true, force: true })); if (own) rmSync(dir, { recursive: true, force: true }); }
}

if (isMain(import.meta.url)) {
  const t0 = Date.now();
  const { problems, notes } = await checkPortability();
  notes.forEach((n) => console.log('  ' + n));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:portability (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  process.exit(problems.length ? 1 : 0);
}
