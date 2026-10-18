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
import { serve } from '../tests/serve.mjs';
import { serveSite } from './server.mjs';
import { environment, launchBrowser } from './browser.mjs';
import { satisfies } from './node-range.mjs';
import { comparePng } from './pixels.mjs';
import { join as joinPath } from 'node:path';
import { pathToFileURL } from 'node:url';
import { project } from './project.mjs';

// The behaviour scenarios and the state screenshots are the PROJECT's: they exercise its own controls (sts.engineering.json, baseline.regression). The harness only compares.
const projectRegression = project.baseline && project.baseline.regression ? await import(pathToFileURL(joinPath(project.root, ...project.baseline.regression.split('/'))).href) : { scenarios: [], states: [] };
const { scenarios, states } = projectRegression;
import { compareSources, loadAllowlist, pagesOf } from './site.mjs';
import { approvedStyleDifference, loadApprovedStyleDifferences } from './approved-styles.mjs';

const require = createRequire(import.meta.url);

// Runs inside the page: one entry per element with a hash of every computed property plus its rounded geometry.
// opts.normalizeHashedNames (check:assets only): the baseline is compared with a content-hashed copy, whose file names differ by design, so a computed url() ends in the final name with its
// `.<8 hex>` removed. Every other comparison keeps file names exactly as they are.
export const stylesSnapshot = (opts) => {
  const hash = (str) => { let h1 = 0xdeadbeef, h2 = 0x41c6ce57; for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); } h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909); return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36); };
  // Sorted by name: the order in which the browser lists custom properties varies from page to page.
  // A computed url() (a CSS background-image, or a custom property holding one) carries the address of the server that served the page, and the baseline and the candidate are served by two
  // servers on two ports. Only that one thing is removed: a url() that starts with this page's own origin loses the origin and keeps its path, query and fragment. Another origin, a
  // different path or a different file is left alone, so it still differs. (The same rule is in stylesDetail, which runs in the page too and cannot share code with this function.)
  const origin = location.origin, stripHash = !!(opts && opts.normalizeHashedNames);
  const norm = (v) => (v.indexOf('url(') < 0 ? v : v.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, (m, q, u) => { let t = u; if (origin !== 'null' && t.startsWith(origin + '/')) t = t.slice(origin.length); if (stripHash) t = t.replace(/\.[0-9a-f]{8}(\.[A-Za-z0-9]+)(?=[?#]|$)/, '$1'); return t === u ? m : `url(${q}${t}${q})`; }));
  const props = (cs) => { const a = []; for (let i = 0; i < cs.length; i++) a.push(`${cs[i]}:${norm(cs.getPropertyValue(cs[i]))};`); return a.sort().join(''); };
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
export const stylesDetail = (arg) => {
  const wanted = Array.isArray(arg) ? arg : arg.wanted;
  // the same url() rule as stylesSnapshot
  const origin = location.origin, stripHash = !Array.isArray(arg) && !!arg.normalizeHashedNames;
  const norm = (v) => (v.indexOf('url(') < 0 ? v : v.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, (m, q, u) => { let t = u; if (origin !== 'null' && t.startsWith(origin + '/')) t = t.slice(origin.length); if (stripHash) t = t.replace(/\.[0-9a-f]{8}(\.[A-Za-z0-9]+)(?=[?#]|$)/, '$1'); return t === u ? m : `url(${q}${t}${q})`; }));
  const out = {};
  [document.documentElement, ...document.body.querySelectorAll('*')].forEach((el, i) => {
    if (!wanted.includes(i)) return;
    const cs = getComputedStyle(el), o = {}; for (let k = 0; k < cs.length; k++) o[cs[k]] = norm(cs.getPropertyValue(cs[k]));
    o['[tag]'] = el.tagName.toLowerCase(); o['[inHoursTable]'] = String(!!el.closest('table.hours'));
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

// candidateHeaders: fn(pathname, type) -> headers; serves the candidate with them (for example the security headers) while the baseline is served plain.
// subset (self-tests only): { pages: [files], viewports: [names], scenarios: RegExp, states: false } narrows a run so a mutation can be checked in seconds.
export async function runRegression({ baselineRoot, candidateRoot, browserName = 'chromium', reportDir, strictEnv = false, log = console.log, only = null, subset = {}, candidateHeaders = null, normalizeHashedNames = false }) {
  const env = environment();
  const approvedStyles = loadApprovedStyleDifferences();
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
  if (!satisfies(process.versions.node, env.node)) envProblems.push(`Node ${process.versions.node}: the harness needs ${env.node} (the tested baseline is ${env.nodeBaseline.version})`);

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
    const sb = serve(baselineRoot), sc = candidateHeaders ? serveSite(candidateRoot, { headers: candidateHeaders }) : serve(candidateRoot);
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
          const [sb1, sc1] = await Promise.all([b, c].map((p) => p.evaluate(stylesSnapshot, { normalizeHashedNames })));
          if (sb1.length !== sc1.length) L.problems.push(`${name}: ${sb1.length} elements in the baseline, ${sc1.length} in the candidate`);
          else {
            const bad = sb1.map((e, i) => (e[1] !== sc1[i][1] ? i : -1)).filter((i) => i >= 0);
            if (bad.length) {
              // a few differing elements are inspected one by one so that an APPROVED difference (approved-style-differences.json: engine, element,
              // properties) is accepted and reported; anything else, or any difference in position or size, is a problem
              const look = bad.length <= 60 ? bad : bad.slice(0, 3);
              const [db, dc] = await Promise.all([b, c].map((p) => p.evaluate(stylesDetail, { wanted: look, normalizeHashedNames })));
              const unapproved = [], approved = new Map();
              for (const i of bad) {
                const id = look.includes(i) && bad.length <= 60 ? approvedStyleDifference(approvedStyles, browserName, db[i], dc[i]) : null;
                if (id) approved.set(id, (approved.get(id) || 0) + 1); else unapproved.push(i);
              }
              for (const [id, n] of approved) L.notes.push(`${name}: ${n} element(s) differ only as approved by ${id}`);
              if (unapproved.length) {
                const first = unapproved[0], x = db[first] || {}, y = dc[first] || {}, props = Object.keys(x).filter((k) => x[k] !== y[k]);
                L.problems.push(`${name}: computed style or geometry differs on ${unapproved.length} element(s), e.g. ${sb1[first][0]}: ${props.slice(0, 4).map((k) => `${k} ${x[k]} -> ${y[k]}`).join('; ')}`);
              }
            }
          }
        }
        if (shots) compareShots(name, shots);
        await close();
      }

      if (want('pixels') && subset.states !== false) {
        const vp = (n) => env.viewports.find((v) => v.name === n);
        for (const st of states) await st.run({ pair, vp, shot });   // the project's state screenshots (project/regression.mjs)
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
