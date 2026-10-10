// check:privacy (ENG-094, ENG-090, ENG-064). The delivered site stores nothing, sets no cookie, calls no other origin, and does not fingerprint.
//   static   scripts: no storage, cookie, network, beacon, geolocation, media-device, fingerprinting or dynamic-code APIs (privacy.json lists them;
//            navigator.connection is the one allowed read, for Save-Data); pages and CSS: no external script, style, font, image, frame,
//            preconnect, prefetch or @import; outbound links only to the allowed hosts (plus the client's own ordering and map URLs from
//            config), and new-tab links are noopener noreferrer
//   browser  every page, desktop and phone, with the hero running and the menu used: no cookie in the browser context, no request header
//            or response header for cookies, localStorage, sessionStorage, IndexedDB and Cache Storage empty, no service worker, and every
//            request goes to the site's own origin
// Run: node engineering/checks/privacy.mjs
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { assembleCandidate, pagesOf, SHARED } from '../lib/site.mjs';
import { withSite } from '../lib/runtime.mjs';
import { engDir, isMain, projectDir, readJson } from '../lib/git.mjs';

export function checkPrivacyStatic({ root, cfgRoot = projectDir }) {
  const pol = readJson(join(engDir, 'privacy.json'));
  const problems = [], notes = [];
  const cfg = readJson(join(cfgRoot, 'config', 'client.json'));
  const hosts = new Set(pol.allowedLinkHosts);
  for (const u of [cfg.ordering.url, cfg.address.mapUrl].filter(Boolean)) hosts.add(new URL(u).host);
  const scripts = [...SHARED.filter((f) => f.endsWith('.js')).map((f) => [f, readFileSync(join(root, f), 'utf8')])];
  for (const f of pagesOf(root)) for (const m of readFileSync(join(root, f), 'utf8').matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)) scripts.push([`${f} (inline)`, m[1]]);
  for (const [name, text] of scripts) {
    const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const api of pol.forbiddenScriptApis) if (code.includes(api)) problems.push(`${name} uses ${api}`);
    for (const m of code.matchAll(/navigator\.[a-zA-Z]+/g)) if (!pol.allowedNavigatorReads.includes(m[0]) && !pol.forbiddenScriptApis.includes(m[0])) problems.push(`${name} reads ${m[0]}, which is not in the allowed list`);
    if (/\bimport\s*\(/.test(code) || /https?:\/\//.test(code)) problems.push(`${name} loads or names another origin`);
  }
  let links = 0;
  for (const f of pagesOf(root)) {
    const html = readFileSync(join(root, f), 'utf8');
    for (const m of html.matchAll(/<(script|link|img|iframe|source|video|audio|embed|object)\b[^>]*>/gi)) {
      const t = m[0];
      const url = /(?:src|href|data-webm|data-mp4)="(https?:\/\/[^"]+)"/i.exec(t);
      if (url && !(m[1].toLowerCase() === 'link' && /rel="(canonical)"/.test(t))) problems.push(`${f}: <${m[1]}> loads ${url[1]} from another origin`);
      if (/<link\b/i.test(t) && /rel="(preconnect|dns-prefetch|prefetch|prerender)"/i.test(t)) problems.push(`${f}: ${t.slice(0, 70)} contacts another origin before the visitor asks`);
    }
    if (/http-equiv="refresh"/i.test(html)) problems.push(`${f}: meta refresh`);
    for (const m of html.matchAll(/<a\b[^>]*href="(https?:\/\/[^"]+)"[^>]*>/gi)) {
      links++;
      const host = new URL(m[1]).host;
      if (![...hosts].some((h) => host === h || host.endsWith('.' + h))) problems.push(`${f}: outbound link to ${host}, which is not an allowed host`);
      if (/target="_blank"/.test(m[0]) && !/rel="[^"]*noopener[^"]*noreferrer[^"]*"/.test(m[0])) problems.push(`${f}: a new-tab link to ${host} lacks rel="noopener noreferrer"`);
    }
  }
  const css = readFileSync(join(root, 'styles.css'), 'utf8');
  if (/@import/.test(css)) problems.push('styles.css uses @import');
  if (/url\(\s*['"]?https?:/.test(css)) problems.push('styles.css loads a URL from another origin');
  notes.push(`static: ${scripts.length} scripts scanned for ${pol.forbiddenScriptApis.length} forbidden APIs; ${links} outbound link(s) all to allowed hosts (${[...hosts].join(', ')}); no third-party resource, preconnect or @import`);
  return { problems, notes };
}

export async function checkPrivacy({ root = null, browser = true, browserName = 'chromium', pages: only = null } = {}) {
  const own = !root;
  const dir = root || assembleCandidate(projectDir, 'privacy');
  try {
    const s = checkPrivacyStatic({ root: dir });
    const problems = [...s.problems], notes = [...s.notes];
    if (!browser) { notes.push('browser part skipped (no browser in this tier)'); return { problems, notes }; }
    let loads = 0;
    await withSite(async ({ newPage, pages, base }) => {
      const origin = new URL(base).origin;
      for (const [name, opts] of [['desktop', { viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' }], ['phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'no-preference' }]]) {
        for (const file of pages) {
          const { page, ctx, close } = await newPage(opts);
          const foreign = [], cookieHeaders = [];
          page.on('request', (r) => { if (!r.url().startsWith(origin) && !r.url().startsWith('data:')) foreign.push(r.url()); if (r.headers().cookie) cookieHeaders.push('request cookie'); });
          page.on('response', (r) => { if (r.headers()['set-cookie']) cookieHeaders.push(`set-cookie from ${r.url()}`); });
          await page.goto(base + file); await page.waitForTimeout(name === 'desktop' ? 3000 : 1200);
          if (name === 'phone') { await page.click('.nav-toggle'); await page.keyboard.press('Escape'); }
          if (name === 'desktop' && file === 'index.html') { await page.click('.pause'); await page.click('.pause'); }
          const st = await page.evaluate(async () => ({
            cookie: document.cookie, ls: localStorage.length, ss: sessionStorage.length,
            idb: indexedDB.databases ? (await indexedDB.databases()).length : 0, caches: (await caches.keys()).length,
            sw: (await navigator.serviceWorker.getRegistrations()).length, wname: window.name,
          }));
          const jar = await ctx.cookies();
          loads++;
          const where = `${file} (${name})`;
          if (foreign.length) problems.push(`${where}: requests to another origin: ${foreign.slice(0, 3).join(', ')}`);
          if (cookieHeaders.length || jar.length || st.cookie) problems.push(`${where}: cookies (${[...cookieHeaders, ...jar.map((c) => c.name)].join(', ') || st.cookie})`);
          if (st.ls || st.ss || st.idb || st.caches || st.sw) problems.push(`${where}: stored data (localStorage ${st.ls}, sessionStorage ${st.ss}, IndexedDB ${st.idb}, Cache Storage ${st.caches}, service workers ${st.sw})`);
          if (st.wname) problems.push(`${where}: window.name is set`);
          await close();
        }
      }
    }, { root: dir, browserName, pages: only });
    notes.push(`browser: ${loads} page loads (hero, Pause, phone menu): no cookies, no stored data, no service worker, every request to the site's own origin`);
    return { problems, notes };
  } finally { if (own) rmSync(dir, { recursive: true, force: true }); }
}

if (isMain(import.meta.url)) {
  const t0 = Date.now();
  const { problems, notes } = await checkPrivacy({ browser: !process.argv.includes('--static') });
  notes.forEach((n) => console.log('  ' + n));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:privacy (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  process.exit(problems.length ? 1 : 0);
}
