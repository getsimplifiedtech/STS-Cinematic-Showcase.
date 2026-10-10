// The v0.8 regression harness. Compares a candidate site folder with the frozen baseline, layer by layer, in one pinned browser:
//   source      shipped files byte for byte (pages, scripts, styles, media, fonts, config), through the allowlist
//   text        visible text and document title/language, per page and viewport
//   structure   the accessibility tree (ARIA snapshot), per page and viewport
//   styles      computed style and geometry of every element (and ::before/::after), per page and viewport
//   pixels      full-page screenshots with tolerances, plus the phone menu, focus ring, current jump link and print layout
//   behaviour   scripted scenarios (hero state machine and fallbacks, navigation, keyboard, requests, no-JS, file://)
// Baseline and candidate are rendered in the same run, by the same browser, so engine, fonts and hardware differences cancel out.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { serve } from '../../tests/serve.mjs';
import { environment, launchBrowser } from './browser.mjs';
import { comparePng } from './pixels.mjs';
import { scenarios } from './scenarios.mjs';
import { compareSources, loadAllowlist, pagesOf } from './site.mjs';

const require = createRequire(import.meta.url);

// Runs inside the page: one entry per element with a hash of every computed property plus its rounded geometry.
export const stylesSnapshot = () => {
  const hash = (str) => { let h1 = 0xdeadbeef, h2 = 0x41c6ce57; for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); } h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909); return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36); };
  // Sorted by name: the order in which the browser lists custom properties varies from page to page.
  const props = (cs) => { const a = []; for (let i = 0; i < cs.length; i++) a.push(`${cs[i]}:${cs.getPropertyValue(cs[i])};`); return a.sort().join(''); };
  const out = [];
  [document.documentElement, ...document.body.querySelectorAll('*')].forEach((el, i) => {
    const r = el.getBoundingClientRect();
    const geo = [r.left + scrollX, r.top + scrollY, r.width, r.height].map((n) => Math.round(n * 100) / 100).join(',');
    const label = `${i}:${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).join('.') : ''}`;
    let s = props(getComputedStyle(el)) + '|' + geo;
    for (const pseudo of ['::before', '::after']) { const ps = getComputedStyle(el, pseudo); if (ps.content !== 'none' && ps.content !== 'normal') s += `|${pseudo}${props(ps)}`; }
    out.push([label, hash(s)]);
  });
  return out;
};
export const stylesDetail = (wanted) => {
  const out = {};
  [document.documentElement, ...document.body.querySelectorAll('*')].forEach((el, i) => {
    if (!wanted.includes(i)) return;
    const cs = getComputedStyle(el), o = {}; for (let k = 0; k < cs.length; k++) o[cs[k]] = cs.getPropertyValue(cs[k]);
    const r = el.getBoundingClientRect(); o['[geometry]'] = [r.left + scrollX, r.top + scrollY, r.width, r.height].map((n) => Math.round(n * 100) / 100).join(',');
    out[i] = o;
  });
  return out;
};
export const settle = async (page) => {
  await page.evaluate(async () => {
    document.querySelectorAll('img[loading="lazy"]').forEach((i) => { i.loading = 'eager'; });
    // Load every declared web font explicitly: document.fonts.ready can resolve before a lazily discovered font has even started.
    await Promise.all([...document.fonts].filter((f) => !/Fallback/.test(f.family)).map((f) => f.load().catch(() => {})));
    await document.fonts.ready;
    await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
    // behavior 'instant' overrides the page's smooth scrolling, so both sides always end exactly at the top
    for (let y = 0; y < document.body.scrollHeight; y += 400) { scrollTo({ top: y, left: 0, behavior: 'instant' }); await new Promise((r) => setTimeout(r, 25)); }
    scrollTo({ top: 0, left: 0, behavior: 'instant' });
    for (let i = 0; i < 40 && scrollY !== 0; i++) await new Promise((r) => setTimeout(r, 25));
    await new Promise((r) => setTimeout(r, 250));
  });
};

// subset (self-tests only): { pages: [files], viewports: [names], scenarios: RegExp, states: false } narrows a run so a mutation can be checked in seconds.
export async function runRegression({ baselineRoot, candidateRoot, browserName = 'chromium', reportDir, strictEnv = false, log = console.log, only = null, subset = {} }) {
  const env = environment();
  const layers = {};
  const layer = (name) => (layers[name] ??= { problems: [], checked: 0, notes: [] });
  const want = (name) => !only || only.includes(name);
  mkdirSync(reportDir, { recursive: true });
  const tol = env.visual;
  const pages = pagesOf(baselineRoot);
  const testPages = subset.pages || pages;
  const viewports = subset.viewports ? env.viewports.filter((v) => subset.viewports.includes(v.name)) : env.viewports;

  // pinned environment
  const pw = require('playwright/package.json').version;
  const envNotes = [`Playwright ${pw}`];
  const envProblems = [];
  if (pw !== env.playwright) envProblems.push(`Playwright ${pw} is installed but ${env.playwright} is pinned`);
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (nodeMajor < 20) envProblems.push(`Node ${process.versions.node}: the harness needs ${env.node}`);

  // source layer (no browser needed)
  if (want('source')) {
    const allow = loadAllowlist();
    const L = layer('source');
    L.problems.push(...allow.errors);
    const r = compareSources(baselineRoot, candidateRoot, allow);
    L.problems.push(...r.problems); L.checked = r.compared; L.notes.push(...r.allowed);
  }
  const needBrowser = ['text', 'structure', 'styles', 'pixels', 'behaviour'].some(want);
  let version = null;
  if (needBrowser) {
    const launched = await launchBrowser(browserName);
    const { browser } = launched; version = launched.version;
    envNotes.push(`${browserName} ${version}`);
    const pinned = env.browsers[browserName]?.version;
    if (pinned && pinned !== version) (strictEnv ? envProblems : envNotes).push(`browser build ${version} differs from the pinned ${pinned}`);
    const sb = serve(baselineRoot), sc = serve(candidateRoot);
    const bases = { baseline: sb.base, candidate: sc.base };
    const roots = { baseline: baselineRoot, candidate: candidateRoot };
    try {
      const ctxFor = (vp, extra = {}) => ({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch, locale: env.context.locale, timezoneId: env.context.timezoneId, colorScheme: env.context.colorScheme, deviceScaleFactor: env.context.deviceScaleFactor, reducedMotion: env.context.reducedMotion, ...extra });
      const pair = async (vp, file, extra) => {
        const sides = {};
        for (const side of ['baseline', 'candidate']) {
          const ctx = await browser.newContext(ctxFor(vp, extra)); const page = await ctx.newPage();
          await page.goto(bases[side] + file, { waitUntil: 'load' }); await settle(page);
          sides[side] = { ctx, page };
        }
        return { b: sides.baseline.page, c: sides.candidate.page, close: () => Promise.all(Object.values(sides).map((s) => s.ctx.close())) };
      };
      // Screenshots are captured FIRST on each page and compared afterwards: Playwright's accessibility-tree snapshot can change how a glyph
      // is rasterised afterwards (observed on the 320 px seal, baseline against itself), so nothing else may touch a page before it is captured.
      const capture = (b, c, opts = { fullPage: true }) => Promise.all([b, c].map((p) => p.screenshot({ ...opts, animations: 'disabled', caret: 'hide' })));
      const compareShots = (name, [x, y]) => {
        const L = layer('pixels'); L.checked++;
        const r = comparePng(x, y, tol);
        if (r.diff && !r.ok) { const base = join(reportDir, 'pixels', name); mkdirSync(join(reportDir, 'pixels'), { recursive: true }); writeFileSync(`${base}-baseline.png`, x); writeFileSync(`${base}-candidate.png`, y); writeFileSync(`${base}-diff.png`, r.diff); }
        if (!r.ok) L.problems.push(`${name}: ${r.reason} (images in ${reportDir}/pixels)`);
        else if (r.differing > 0) L.notes.push(`${name}: ${r.differing} pixels differ, within tolerance (worst cell ${r.worstCell})`);
      };
      const shot = async (name, b, c, opts) => compareShots(name, await capture(b, c, opts));

      for (const file of testPages) for (const vp of viewports) {
        const name = `${file.replace('.html', '')}@${vp.name}`;
        const { b, c, close } = await pair(vp, file);
        const shots = want('pixels') ? await capture(b, c) : null;
        if (want('text')) {
          const L = layer('text'); L.checked++;
          const [tb, tc] = await Promise.all([b, c].map((p) => p.evaluate(() => JSON.stringify({ title: document.title, lang: document.documentElement.lang, text: document.body.innerText }))));
          if (tb !== tc) { const x = JSON.parse(tb), y = JSON.parse(tc); const at = [...x.text].findIndex((ch, i) => ch !== y.text[i]); L.problems.push(`${name}: visible text differs${x.title !== y.title ? ' (title too)' : ''}; first difference near "${x.text.slice(Math.max(0, at - 20), at + 30).replace(/\s+/g, ' ')}" vs "${y.text.slice(Math.max(0, at - 20), at + 30).replace(/\s+/g, ' ')}"`); }
        }
        if (want('structure')) {
          const L = layer('structure'); L.checked++;
          const [ab, ac] = await Promise.all([b, c].map((p) => p.locator('body').ariaSnapshot()));
          if (ab !== ac) { const x = ab.split('\n'), y = ac.split('\n'); const i = x.findIndex((l, k) => l !== y[k]); L.problems.push(`${name}: accessibility tree differs at line ${i + 1}: "${(x[i] ?? '').trim()}" vs "${(y[i] ?? '').trim()}"`); }
        }
        if (want('styles')) {
          const L = layer('styles'); L.checked++;
          const [sb1, sc1] = await Promise.all([b, c].map((p) => p.evaluate(stylesSnapshot)));
          if (sb1.length !== sc1.length) L.problems.push(`${name}: ${sb1.length} elements in the baseline, ${sc1.length} in the candidate`);
          else {
            const bad = sb1.map((e, i) => (e[1] !== sc1[i][1] ? i : -1)).filter((i) => i >= 0);
            if (bad.length) {
              const [db, dc] = await Promise.all([b, c].map((p) => p.evaluate(stylesDetail, bad.slice(0, 3))));
              const first = bad[0], props = Object.keys(db[first]).filter((k) => db[first][k] !== dc[first][k]);
              L.problems.push(`${name}: computed style or geometry differs on ${bad.length} element(s), e.g. ${sb1[first][0]}: ${props.slice(0, 4).map((k) => `${k} ${db[first][k]} -> ${dc[first][k]}`).join('; ')}`);
            }
          }
        }
        if (shots) compareShots(name, shots);
        await close();
      }

      if (want('pixels') && subset.states !== false) {
        const vp = (n) => env.viewports.find((v) => v.name === n);
        // phone menu open
        { const { b, c, close } = await pair(vp('mobile-390'), 'index.html'); await Promise.all([b, c].map((p) => p.click('.nav-toggle'))); await b.waitForTimeout(300); await shot('state-phone-menu-open', b, c, { fullPage: false }); await close(); }
        // keyboard focus ring (skip link, then the first navigation link)
        { const { b, c, close } = await pair(vp('desktop-1440'), 'index.html'); for (const p of [b, c]) { await p.keyboard.press('Tab'); await p.keyboard.press('Tab'); } await shot('state-focus-ring', b, c, { fullPage: false }); await close(); }
        // current menu jump link
        { const { b, c, close } = await pair(vp('desktop-1440'), 'menu.html'); await Promise.all([b, c].map(async (p) => { await p.evaluate(() => { const ids = [...document.querySelectorAll('.jump a')].map((a) => a.getAttribute('href').slice(1)); const el = document.getElementById(ids[2]); scrollTo({ top: el.getBoundingClientRect().top + scrollY - innerHeight * 0.32, left: 0, behavior: 'instant' }); }); await p.waitForTimeout(400); })); await shot('state-menu-current-jump-link', b, c, { fullPage: false }); await close(); }
        // print layout of the menu
        { const { b, c, close } = await pair({ name: 'print', width: 1000, height: 1400 }, 'menu.html'); await Promise.all([b, c].map((p) => p.emulateMedia({ media: 'print' }))); await shot('state-menu-print', b, c); await close(); }
      }

      if (want('behaviour')) {
        const L = layer('behaviour');
        for (const sc of scenarios.filter((x) => !subset.scenarios || subset.scenarios.test(x.name))) {
          L.checked++;
          const traces = {};
          for (const side of ['baseline', 'candidate']) {
            try { traces[side] = JSON.stringify(await sc.run({ browser, base: bases[side], root: roots[side], pages }), null, 1); } catch (e) { traces[side] = `scenario error: ${e.message}`; }
          }
          if (traces.baseline !== traces.candidate) {
            const x = traces.baseline.split('\n'), y = traces.candidate.split('\n'); const i = x.findIndex((l, k) => l !== y[k]);
            L.problems.push(`${sc.name}: traces differ at line ${i + 1}: ${(x[i] ?? '').trim()}  vs  ${(y[i] ?? '').trim()}`);
          } else if (traces.baseline.startsWith('scenario error')) L.problems.push(`${sc.name}: ${traces.baseline}`);
          L.notes.push(`scenario ok: ${sc.name}`);
        }
      }
    } finally { await browser.close(); sb.server.close(); sc.server.close(); }
  }

  const summary = {
    environment: { notes: envNotes, problems: envProblems }, browser: { name: browserName, version },
    tolerances: tol, layers: Object.fromEntries(Object.entries(layers).map(([k, v]) => [k, { checked: v.checked, problems: v.problems, notes: v.notes }])),
  };
  writeFileSync(join(reportDir, 'regression.json'), JSON.stringify(summary, null, 2));
  return summary;
}
