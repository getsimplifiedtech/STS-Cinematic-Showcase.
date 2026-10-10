// check:security (ENG-093, decision D-5). The security headers and Content Security Policy for HTTP deployments, generated from
// security.json and the built pages, and proof that they work.
//   static   policy shape: no 'unsafe-inline', no 'unsafe-eval', no wildcard or scheme sources, data: only for images, default-src none,
//            frame-ancestors, base-uri, form-action, object-src closed; the hashes cover exactly the inline script and style attributes the
//            pages contain (none missing, none stale); the pages have no event-handler attributes, javascript: URLs, <style>, <base>, forms,
//            frames; _headers, nginx and Apache renderings carry every header with the same value
//   browser  every page served WITH the headers: zero CSP violations and zero console warnings in desktop, phone and menu use, hero video
//            plays, fonts and images load; the candidate under the headers is identical to v0.8 served plain (text, accessibility tree,
//            computed styles, screenshots); policy probes: an injected inline script, an inline handler, an external script, an unlisted
//            inline style and an iframe are all BLOCKED; and over file:// the same injected script RUNS (no headers exist there)
// Over file:// no header applies. See ENG-SECURITY.md for what each delivery mode protects.
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { assembleCandidate, pagesOf } from '../lib/site.mjs';
import { settleFonts } from '../lib/runtime.mjs';
import { buildCsp, inlineItems, loadPolicy, parseCsp, renderApache, renderHeadersFile, renderNginx, securityHeaders } from '../lib/security.mjs';

import { serveSite } from '../lib/server.mjs';
import { launchBrowser } from '../lib/browser.mjs';
import { runRegression } from '../lib/regression.mjs';
import { engDir, exportBaseline, isMain, projectDir } from '../lib/git.mjs';
import { pathToFileURL } from 'node:url';

const REQUIRED_CLOSED = ['object-src', 'base-uri', 'form-action', 'frame-ancestors', 'connect-src', 'manifest-src', 'worker-src'];

export function checkSecurityStatic({ root, policy = loadPolicy() }) {
  const problems = [], notes = [];
  const csp = parseCsp(buildCsp(root, policy, { https: true }));
  const bad = (m) => problems.push(m);
  if (JSON.stringify(csp['default-src']) !== JSON.stringify(["'none'"])) bad("default-src must be 'none' (everything else is opened explicitly)");
  for (const d of REQUIRED_CLOSED) if (!csp[d]) bad(`${d} is missing from the policy`);
  for (const d of ['object-src', 'base-uri', 'form-action', 'frame-ancestors', 'connect-src']) if (csp[d] && JSON.stringify(csp[d]) !== JSON.stringify(["'none'"])) bad(`${d} must be 'none' (found ${csp[d].join(' ')})`);
  for (const [d, srcs] of Object.entries(csp)) for (const src of srcs) {
    if (policy.forbidden.cspSources.includes(src)) bad(`${d} allows ${src}`);
    if (src === 'data:' && d !== 'img-src') bad(`${d} allows data: (only img-src may, for the inline favicon)`);
    if (/^'unsafe-hashes'$/.test(src) && d !== 'style-src-attr') bad(`${d} uses 'unsafe-hashes' (only style-src-attr may)`);
    if (/^https?:\/\//.test(src)) bad(`${d} allows the external source ${src}`);
  }
  if (!csp['upgrade-insecure-requests']) bad('the HTTPS variant must add upgrade-insecure-requests');
  // hashes cover exactly what the pages contain
  const items = inlineItems(root);
  const fresh = parseCsp(buildCsp(root, policy));
  if (!items.scripts.length || fresh['script-src'].filter((x) => x.startsWith("'sha256-")).length !== items.scripts.length) bad('script hashes do not match the inline scripts in the pages');
  if (fresh['style-src-attr'].filter((x) => x.startsWith("'sha256-")).length !== items.styles.length) bad('style-attribute hashes do not match the inline style attributes in the pages');
  const pageHtml = pagesOf(root).map((f) => [f, readFileSync(join(root, f), 'utf8')]);
  for (const [f, html] of pageHtml) {
    if (/\son[a-z]+\s*=/i.test(html.replace(/<script[\s\S]*?<\/script>/g, ''))) bad(`${f} has an inline event handler`);
    if (/javascript:/i.test(html)) bad(`${f} has a javascript: URL`);
    for (const [re, what] of [[/<style[\s>]/i, 'a <style> element'], [/<base[\s>]/i, 'a <base> element'], [/<form[\s>]/i, 'a form'], [/<(iframe|frame|embed|object)[\s>]/i, 'an embedded frame or object'], [/http-equiv\s*=/i, 'a http-equiv meta tag']]) if (re.test(html)) bad(`${f} contains ${what}, which the policy does not allow for`);
    const scripts = [...html.matchAll(/<script(?![^>]*\ssrc=)(?![^>]*type="application\/ld\+json")[^>]*>/g)].length;
    if (scripts > 1) bad(`${f} has ${scripts} inline scripts (one tiny bootstrap is the budget)`);
  }
  // hosts renderings agree
  const h = securityHeaders(root, policy, { https: true });
  const files = { '_headers': renderHeadersFile(root, policy, { https: true }), nginx: renderNginx(root, policy, { https: true }), apache: renderApache(root, policy, { https: true }) };
  for (const [name, text] of Object.entries(files)) for (const [k, v] of Object.entries(h)) if (!text.includes(k) || !text.includes(v.replace(/"/g, name === '_headers' ? '"' : '\\"'))) bad(`the ${name} output is missing ${k} or its value`);
  const headerNames = Object.keys(h);
  for (const need of ['Content-Security-Policy', 'X-Content-Type-Options', 'Referrer-Policy', 'X-Frame-Options', 'Permissions-Policy', 'Cross-Origin-Opener-Policy', 'Strict-Transport-Security']) if (!headerNames.includes(need)) bad(`header ${need} is not produced`);
  notes.push(`policy: ${Object.keys(csp).length} CSP directives, no unsafe-inline or unsafe-eval; ${items.scripts.length} inline script and ${items.styles.length} inline style values allowed by hash (${Object.values(items.perPage).reduce((s, p) => s + p.styleAttributes, 0)} style attributes on ${Object.values(items.perPage).filter((p) => p.styleAttributes).length} pages); ${headerNames.length} headers; three host renderings agree`);
  return { problems, notes };
}

// Probes: mutated copies of the home page, served with the policy. Each probe must be blocked.
async function probes({ root, policy, browser }) {
  const problems = [], notes = [];
  const headers = securityHeaders(root, policy, { https: false });
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const inject = (frag, name) => writeFileSync(join(root, name), html.replace('</body>', `${frag}</body>`));
  inject('<script>window.__pwn_inline=1</script>', 'probe-inline.html');
  inject('<button id="h" onclick="window.__pwn_handler=1">x</button>', 'probe-handler.html');
  inject('<script src="https://example.invalid/x.js"></script>', 'probe-external.html');
  inject('<p id="p" style="color:rgb(255,0,0)">probe</p>', 'probe-style.html');
  inject('<iframe src="https://example.invalid/"></iframe>', 'probe-frame.html');
  inject('<img id="i" src="https://example.invalid/x.png" alt="x" width="1" height="1">', 'probe-image.html');
  const s = serveSite(root, { headers: () => headers });
  const run = async (file, fn) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.addInitScript(() => { window.__v = []; window.addEventListener('securitypolicyviolation', (e) => window.__v.push(e.violatedDirective), true); });
    await page.goto(s.base + file); await page.waitForTimeout(700);
    if (file === 'probe-handler.html') { await page.click('#h'); await page.waitForTimeout(200); }
    const r = await page.evaluate(fn);
    await ctx.close(); return r;
  };
  const expectBlocked = async (name, file, fn, directive) => {
    const r = await run(file, fn);
    if (!r.blocked) problems.push(`probe "${name}" was NOT blocked: ${JSON.stringify(r)}`);
    else if (directive && !r.v.some((d) => d.startsWith(directive))) problems.push(`probe "${name}" was blocked but not by ${directive} (${JSON.stringify(r)})`);
  };
  await expectBlocked('inline script', 'probe-inline.html', () => ({ blocked: window.__pwn_inline === undefined, v: window.__v }), 'script-src');
  await expectBlocked('inline event handler', 'probe-handler.html', () => ({ blocked: window.__pwn_handler === undefined, v: window.__v }), 'script-src');
  await expectBlocked('external script', 'probe-external.html', () => ({ blocked: window.__v.some((d) => d.startsWith('script-src')), v: window.__v }), 'script-src');
  await expectBlocked('unlisted inline style', 'probe-style.html', () => ({ blocked: getComputedStyle(document.getElementById('p')).color !== 'rgb(255, 0, 0)', v: window.__v }), 'style-src');
  await expectBlocked('iframe', 'probe-frame.html', () => ({ blocked: window.__v.length > 0 && !document.querySelector('iframe')?.contentDocument?.URL?.startsWith('http'), v: window.__v }), '');
  await expectBlocked('external image', 'probe-image.html', () => ({ blocked: window.__v.some((d) => d.startsWith('img-src')), v: window.__v }), 'img-src');
  s.close();
  // file://: no headers exist, so the same injected script runs
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await page.goto(pathToFileURL(join(root, 'probe-inline.html')).href); await page.waitForTimeout(300);
  const ran = await page.evaluate(() => window.__pwn_inline === 1);
  await ctx.close();
  if (!ran) problems.push('over file:// the injected inline script did not run, so the file:// distinction in ENG-SECURITY.md would be wrong');
  notes.push('policy probes over HTTP: an injected inline script, an inline event handler, an external script, an unlisted inline style, an iframe and an external image are all blocked; over file:// the same injected script runs (no headers exist there)');
  return { problems, notes };
}

export async function checkSecurity({ root = null, browser = true, browserName = 'chromium', policy = loadPolicy() } = {}) {
  const own = !root;
  const dir = root || assembleCandidate(projectDir, 'security');
  const problems = [], notes = [];
  let baseExport = null, probeDir = null;
  try {
    const s = checkSecurityStatic({ root: dir, policy });
    problems.push(...s.problems); notes.push(...s.notes);
    if (!browser) { notes.push('browser part skipped (no browser in this tier)'); return { problems, notes }; }
    const headers = securityHeaders(dir, policy, { https: false });
    // 1. every page under the headers: no violations, no console noise, everything works
    const { browser: br } = await launchBrowser(browserName);
    try {
      const sv = serveSite(dir, { headers: () => headers });
      let loads = 0;
      for (const file of pagesOf(dir)) for (const ctxDef of [{ name: 'desktop', viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' }, { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'no-preference' }]) {
        const ctx = await br.newContext(ctxDef); const page = await ctx.newPage();
        const noise = [], failed = [];
        await page.addInitScript(() => { window.__v = []; window.addEventListener('securitypolicyviolation', (e) => window.__v.push(`${e.violatedDirective} ${e.blockedURI}`), true); });
        page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) noise.push(`${m.type()}: ${m.text().slice(0, 100)}`); });
        page.on('pageerror', (e) => noise.push(`pageerror: ${e.message}`));
        page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
        await page.goto(sv.base + file); await page.waitForTimeout(ctxDef.name === 'desktop' ? 3500 : 1500);
        if (ctxDef.name === 'phone') { await page.click('.nav-toggle'); await page.waitForTimeout(150); await page.keyboard.press('Escape'); }
        if (ctxDef.name === 'desktop' && file === 'index.html') {
          const hero = await page.evaluate(() => document.querySelector('[data-ambient-root]').className);
          if (!/is-video/.test(hero)) problems.push(`index.html under the headers: the hero video did not start (${hero})`);
          await page.click('.pause'); await page.waitForTimeout(300);
        }
        if (file === 'menu.html') await page.evaluate(() => { const a = document.querySelector('.jump a'); a && a.click(); });
        await settleFonts(page);   // below-the-fold images are lazy: load them so a blocked one is counted
        const v = await page.evaluate(() => window.__v);
        const imgs = await page.evaluate(() => [...document.images].filter((i) => !(i.complete && i.naturalWidth > 0)).length);
        const fonts = await page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter((f) => !/Fallback/.test(f.family) && f.status === 'error').length; });
        loads++;
        if (v.length) problems.push(`${file} (${ctxDef.name}) under the headers: CSP violations ${JSON.stringify(v)}`);
        if (noise.length) problems.push(`${file} (${ctxDef.name}) under the headers: console messages ${JSON.stringify(noise)}`);
        if (failed.length) problems.push(`${file} (${ctxDef.name}) under the headers: failed requests ${JSON.stringify(failed)}`);
        if (imgs || fonts) problems.push(`${file} (${ctxDef.name}) under the headers: ${imgs} image(s) and ${fonts} font(s) failed`);
        await ctx.close();
      }
      sv.close();
      notes.push(`${loads} page loads under the headers (desktop with video and Pause, phone with menu): 0 CSP violations, 0 console messages, 0 failed requests`);
      // 3. probes on a scratch copy
      probeDir = assembleCandidate(projectDir, 'probes');
      const p = await probes({ root: probeDir, policy, browser: br });
      problems.push(...p.problems); notes.push(...p.notes);
    } finally { await br.close(); }
    // 2. identical to v0.8 under the headers
    baseExport = exportBaseline('security-base');
    const sum = await runRegression({ baselineRoot: baseExport, candidateRoot: dir, reportDir: join(engDir, '.reports', 'security'), only: ['text', 'structure', 'styles', 'pixels'], subset: { viewports: ['desktop-1440', 'tablet-820', 'mobile-390'], states: false }, candidateHeaders: () => headers, browserName });
    let compared = 0;
    for (const [layer, L] of Object.entries(sum.layers)) { compared += L.checked; L.problems.forEach((x) => problems.push(`under the headers, ${layer}: ${x}`)); }
    notes.push(`candidate served WITH the headers equals v0.8 served plain: ${compared} comparisons (text, accessibility tree, computed styles, screenshots) at 1440, 820 and 390 px, 0 differences`);
    return { problems, notes };
  } finally {
    if (own) rmSync(dir, { recursive: true, force: true });
    if (probeDir) rmSync(probeDir, { recursive: true, force: true });
    if (baseExport) rmSync(dirname(baseExport), { recursive: true, force: true });
  }
}

if (isMain(import.meta.url)) {
  const t0 = Date.now();
  const { problems, notes } = await checkSecurity({ browser: !process.argv.includes('--static') });
  notes.forEach((n) => console.log('  ' + n));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:security (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  process.exit(problems.length ? 1 : 0);
}
