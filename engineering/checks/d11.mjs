// check:d11 (decision D-11, Gate 5 Phase 1). The Content Security Policy allows the six inline style attributes (the photographs' focal points, written as
// CSS custom properties) by SHA-256 hash with 'unsafe-hashes' in style-src-attr. Chromium honours that. This check answers, for ANY engine, the question
// the decision left open: does the engine honour those hashes, so the photographs keep their approved crop under the headers, and does it still BLOCK an
// inline style that is not listed?
//   honoured      every element with a style attribute resolves the same custom properties and the same object-position with the security headers on as with
//                 no headers at all (desktop and phone widths), and no style-src-attr violation is raised for the six listed attributes
//   enforced      a style attribute set by script that is NOT in the policy is not applied and raises a violation (so the result above is not "CSP off")
// Nothing is changed by this check. If an engine ignores the hashes the result is a finding for the owner (decision D-11: the CSP is kept and the crop is not
// refactored without approval).
import { rmSync } from 'node:fs';
import { assembleCandidate, pagesOf } from '../lib/site.mjs';
import { launchBrowser } from '../lib/browser.mjs';
import { serveSite } from '../lib/server.mjs';
import { loadPolicy, securityHeaders } from '../lib/security.mjs';
import { isMain, projectDir } from '../lib/git.mjs';

const read = () => [...document.querySelectorAll('[style]')].filter((e) => !e.hasAttribute('data-d11-probe')).map((e) => {
  const declared = {};
  for (const d of (e.getAttribute('style') || '').split(';')) { const i = d.indexOf(':'); if (i > 0) declared[d.slice(0, i).trim()] = d.slice(i + 1).trim(); }
  const cs = getComputedStyle(e);
  return { tag: e.tagName.toLowerCase(), src: (e.getAttribute('src') || e.className || '').toString().slice(0, 40), declared, resolved: Object.fromEntries(Object.keys(declared).map((k) => [k, cs.getPropertyValue(k).trim()])), objectPosition: cs.objectPosition };
});

export async function checkD11({ root = null, browserName = 'chromium', policy = loadPolicy() } = {}) {
  const own = !root;
  const dir = root || assembleCandidate(projectDir, 'd11');
  const problems = [], notes = [];
  const headers = securityHeaders(dir, policy, { https: false });
  const plain = serveSite(dir), secured = serveSite(dir, { headers: () => headers });
  const { browser, version } = await launchBrowser(browserName);
  let elements = 0, honoured = 0, violations = 0;
  try {
    for (const file of pagesOf(dir)) for (const ctxDef of [{ name: 'desktop', viewport: { width: 1440, height: 900 } }, { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]) {
      const open = async (base) => {
        const ctx = await browser.newContext({ ...ctxDef, reducedMotion: 'reduce' }); const page = await ctx.newPage();
        await page.addInitScript(() => { window.__v = []; window.addEventListener('securitypolicyviolation', (e) => window.__v.push(`${e.violatedDirective} ${e.blockedURI}`), true); });
        await page.goto(base + file); await page.waitForTimeout(600);
        const data = await page.evaluate(read), v = await page.evaluate(() => window.__v);
        await ctx.close(); return { data, v };
      };
      const a = await open(plain.base), b = await open(secured.base);
      const tag = `${file}@${ctxDef.name}`;
      if (a.data.length !== b.data.length) { problems.push(`${tag}: ${a.data.length} elements carry a style attribute without headers but ${b.data.length} under the headers`); continue; }
      const styleViolations = b.v.filter((x) => /^style-src/.test(x));
      violations += styleViolations.length;
      if (styleViolations.length) problems.push(`${tag}: the engine reported ${styleViolations.length} style violation(s) under the headers: ${styleViolations.slice(0, 2).join('; ')}`);
      a.data.forEach((p, i) => {
        const q = b.data[i]; elements++;
        const same = JSON.stringify(p.resolved) === JSON.stringify(q.resolved) && p.objectPosition === q.objectPosition;
        if (same && !styleViolations.length) honoured++;
        if (!same) problems.push(`${tag}: <${p.tag} ${p.src}> resolves ${JSON.stringify(q.resolved)} / object-position "${q.objectPosition}" under the headers but ${JSON.stringify(p.resolved)} / "${p.objectPosition}" without: the engine does NOT honour the style-attribute hashes here, so the approved crop is lost`);
      });
    }
    // negative control: an inline style set by script and not listed in the policy must be blocked, or "honoured" above would only mean "CSP off"
    const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } }); const page = await ctx.newPage();
    await page.addInitScript(() => { window.__v = []; window.addEventListener('securitypolicyviolation', (e) => window.__v.push(e.violatedDirective), true); });
    await page.goto(secured.base + 'index.html'); await page.waitForTimeout(500);
    const control = await page.evaluate(async () => { const p = document.createElement('p'); p.setAttribute('data-d11-probe', ''); p.textContent = 'probe'; document.body.appendChild(p); p.setAttribute('style', 'color:rgb(255,0,0)'); await new Promise((r) => setTimeout(r, 300)); return { applied: getComputedStyle(p).color === 'rgb(255, 0, 0)', violations: window.__v.slice() }; });
    await ctx.close();
    if (control.applied) problems.push('an inline style that is NOT in the policy was applied under the headers: the engine does not enforce style-src-attr for script-set attributes');
    else if (!control.violations.some((d) => /^style-src/.test(d))) problems.push(`the unlisted inline style was not applied but no style violation was reported (${JSON.stringify(control.violations)}): enforcement is unproven`);
    notes.push(`D-11 on ${browserName} ${version}: ${honoured} of ${elements} element states (every style attribute, at desktop and phone width) resolve identically with and without the headers, ${violations} style violation(s); an unlisted inline style is ${control.applied ? 'APPLIED (not enforced)' : 'blocked'}${control.violations.length ? ` (${control.violations.join(', ')})` : ''}`);
  } finally { await browser.close(); plain.close(); secured.close(); if (own) rmSync(dir, { recursive: true, force: true }); }
  return { problems, notes };
}

if (isMain(import.meta.url)) {
  const i = process.argv.indexOf('--browser');
  const t0 = Date.now();
  const { problems, notes } = await checkD11({ browserName: i > -1 ? process.argv[i + 1] : 'chromium' });
  notes.forEach((n) => console.log('  ' + n));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:d11 (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  process.exit(problems.length ? 1 : 0);
}
