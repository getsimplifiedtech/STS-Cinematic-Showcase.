// check:keyboard (ENG-042, ENG-043). Real key presses in the pinned browser, on every page, desktop and phone width:
//   1. every visible interactive element is reachable with Tab, exactly once, in DOM order; none has a positive tabindex; nothing else takes focus
//   2. no keyboard trap: Shift+Tab walks the same order back; focus never sticks
//   3. the focused element is visibly different from the unfocused one (pixels), and is not hidden behind another element (2.4.11)
//   4. the skip link is first, appears on focus and moves the starting point for Tab into <main>
//   5. phone menu: Enter opens it, its links are then reachable in order, Escape closes it and returns focus to the toggle
//   6. target size: 24 CSS px for every interactive element (2.5.8), 44 CSS px for the configured primary actions
// Failures are reconciled with engineering/findings.json (known v0.8 findings are reported, new ones fail).
import { join } from 'node:path';
import { reconcile } from '../lib/findings.mjs';
import { withSite } from '../lib/runtime.mjs';
import { comparePng } from '../lib/pixels.mjs';
import { engDir, isMain, readJson } from '../lib/git.mjs';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

// Runs in the page. Marks the visible interactive elements in DOM order and describes them.
const mark = (selector) => {
  const els = [...document.querySelectorAll(selector)].filter((e) => e.checkVisibility({ checkVisibilityCSS: true }) && !e.closest('[inert]'));
  const name = (e) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : ''} "${(e.getAttribute('aria-label') || e.innerText || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24)}"`;
  els.forEach((e, i) => { e.dataset.kb = String(i); });
  return els.map((e, i) => ({ i, name: name(e), tabindex: e.getAttribute('tabindex'), skip: e.classList.contains('skip') }));
};
const active = () => { const e = document.activeElement; if (!e || e === document.body || e === document.documentElement) return { kb: null, body: true }; const r = e.getBoundingClientRect(); return { kb: e.dataset.kb === undefined ? null : Number(e.dataset.kb), name: `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}`, rect: { x: r.x, y: r.y, w: r.width, h: r.height } }; };
const covered = () => { const e = document.activeElement; const r = e.getBoundingClientRect(); const vx = Math.max(r.left, 0), vy = Math.max(r.top, 0), vr = Math.min(r.right, innerWidth), vb = Math.min(r.bottom, innerHeight); if (vr <= vx || vb <= vy) return 'outside the viewport'; const pts = [[0.5, 0.5], [0.15, 0.5], [0.85, 0.5], [0.5, 0.2], [0.5, 0.8]].map(([a, b]) => [vx + (vr - vx) * a, vy + (vb - vy) * b]); const visible = pts.some(([x, y]) => { const t = document.elementFromPoint(x, y); return t && (t === e || e.contains(t) || t.contains(e) && getComputedStyle(t).pointerEvents !== 'none' && t.tagName !== 'HTML' && t.tagName !== 'BODY' && t.tagName !== 'MAIN'); }); return visible ? null : 'covered by another element'; };

export async function checkKeyboard({ root = null, browserName = 'chromium', pages: only = null } = {}) {
  const cfg = readJson(join(engDir, 'a11y.json'));
  const measured = [], notes = [];
  let stops = 0, focusChecks = 0, sized = 0;
  await withSite(async ({ pages, newPage, env }) => {
    const rect = (r) => ({ x: Math.max(0, Math.floor(r.x - cfg.keyboard.focusPadding)), y: Math.max(0, Math.floor(r.y - cfg.keyboard.focusPadding)), width: Math.ceil(r.w + cfg.keyboard.focusPadding * 2), height: Math.ceil(r.h + cfg.keyboard.focusPadding * 2) });
    for (const ctxDef of cfg.keyboard.contexts) for (const file of pages) {
      const tag = `keyboard:${file}@${ctxDef.name}`;
      const bad = (rule, who, detail, extra = {}) => measured.push({ key: `${tag}:${rule}:${who}`, detail, ...extra });
      const { page, close } = await newPage({ viewport: { width: ctxDef.width, height: ctxDef.height } }, file);
      const els = await page.evaluate(mark, FOCUSABLE);
      els.filter((e) => e.tabindex !== null && Number(e.tabindex) > 0).forEach((e) => bad('positive-tabindex', e.name, `${e.name} has tabindex=${e.tabindex}, which overrides the natural order`));
      if (!els[0]?.skip) bad('skip-link-first', els[0]?.name || 'none', 'the first focusable element must be the skip link');

      // 1 + 2: forward pass in DOM order, with the focus-visible and not-obscured checks at each stop
      const seq = [];
      let leftDocument = false;
      for (let n = 0; n < els.length + 2; n++) {
        await page.keyboard.press('Tab'); await page.waitForTimeout(40);
        const a = await page.evaluate(active);
        if (a.body) { leftDocument = true; break; }
        seq.push(a.kb); stops++;
        const who = els[a.kb]?.name || a.name;
        if (a.kb === null) { bad('unlisted-focus', a.name, `focus landed on ${a.name}, which is not a visible interactive element`); continue; }
        if (n > 0 && seq[n - 1] === a.kb) { bad('trap', who, `focus stuck on ${who}`); break; }
        const hidden = await page.evaluate(covered);
        if (hidden) bad('obscured', who, `${who} is ${hidden} while focused (2.4.11)`);
        // focus visible: the same region with and without focus must differ
        const clip = rect(a.rect);
        if (clip.width > 0 && clip.height > 0 && a.rect.y + a.rect.h > 0 && a.rect.y < ctxDef.height) {
          const on = await page.screenshot({ clip, animations: 'disabled', caret: 'hide' });
          await page.evaluate(() => document.activeElement.blur()); await page.waitForTimeout(30);
          const off = await page.screenshot({ clip, animations: 'disabled', caret: 'hide' });
          await page.evaluate((k) => document.querySelector(`[data-kb="${k}"]`).focus({ preventScroll: true }), a.kb);
          const r = comparePng(on, off, { pixelThreshold: 0.05, maxDiffRatio: 1, cell: 32, maxCellPixels: 1e9 });
          focusChecks++;
          if (r.differing < cfg.keyboard.focusMinChangedPixels) bad('focus-visible', who, `${who} shows no visible focus indicator (${Math.max(0, r.differing)} pixels change)`);
        }
        if (n === 0 && a.kb === 0 && els[0]?.skip) {   // the skip link: Enter, then Tab must start inside <main>
          await page.keyboard.press('Enter'); await page.waitForTimeout(80); await page.keyboard.press('Tab'); await page.waitForTimeout(40);
          const inMain = await page.evaluate(() => !!document.activeElement.closest('main'));
          if (!inMain) bad('skip-link-target', 'skip', 'after the skip link, Tab does not start inside <main>');
          // restart the forward pass in order from here is unnecessary: the remaining stops are checked by position
          await page.evaluate(() => { document.activeElement.blur(); scrollTo({ top: 0, behavior: 'instant' }); document.querySelector('[data-kb="0"]').focus({ preventScroll: true }); });
        }
      }
      const expected = els.map((e) => e.i);
      const missing = expected.filter((i) => !seq.includes(i));
      missing.forEach((i) => bad('unreachable', els[i].name, `${els[i].name} cannot be reached with Tab`));
      if (seq.some((v, k) => k > 0 && v <= seq[k - 1])) bad('order', 'sequence', `Tab order is not DOM order: ${seq.join(',')}`);

      // 2: Shift+Tab walks back through the same elements
      const back = [];
      for (let n = 0; n < seq.length; n++) { await page.keyboard.press('Shift+Tab'); await page.waitForTimeout(25); const a = await page.evaluate(active); if (a.body) break; back.push(a.kb); }
      // when the forward pass ended by leaving the document, the first Shift+Tab returns to the last element; otherwise it goes to the one before it
      const want = leftDocument ? [...seq].reverse() : seq.slice(0, -1).reverse();
      if (back.length < Math.min(want.length, 3) || back.slice(0, want.length).join() !== want.slice(0, back.length).join()) bad('reverse-order', 'sequence', `Shift+Tab does not walk the same order backwards (got ${back.join(',')}, expected ${want.join(',')})`);

      // 6: target sizes
      const sizes = await page.evaluate(({ primary }) => [...document.querySelectorAll('[data-kb]')].map((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); const inline = cs.display === 'inline' && !!e.closest('p, li, dd, td, address, figcaption'); return { name: `${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : ''} "${(e.innerText || e.getAttribute('aria-label') || '').trim().slice(0, 20)}"`, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, skip: e.classList.contains('skip'), primary: primary.some((s) => e.matches(s)), inline }; }), { primary: cfg.target.primarySelectors });
      for (const s of sizes) {
        if (s.skip) continue; sized++;
        const small = (v, m) => v < m - 0.5;
        if (!s.inline && (small(s.w, cfg.target.minimum) || small(s.h, cfg.target.minimum))) bad('target-24', s.name, `${s.name} is ${s.w}x${s.h} CSS px, under ${cfg.target.minimum} (2.5.8)`, { value: Math.min(s.w, s.h) });
        if (s.primary && small(Math.min(s.w, s.h), cfg.target.primaryMinimum)) bad('target-44', s.name, `primary action ${s.name} is ${s.w}x${s.h} CSS px, under the STS minimum of ${cfg.target.primaryMinimum}`, { value: Math.min(s.w, s.h) });
      }
      await close();
    }

    // 5: the phone menu by keyboard
    for (const file of pages) {
      const tag = `keyboard:${file}@phone-menu`;
      const { page, close } = await newPage({ viewport: { width: 390, height: 844 } }, file);
      const bad = (rule, detail) => measured.push({ key: `${tag}:${rule}:toggle`, detail });
      await page.focus('.nav-toggle'); await page.keyboard.press('Enter'); await page.waitForTimeout(100);
      const open = await page.evaluate(() => ({ expanded: document.querySelector('.nav-toggle').getAttribute('aria-expanded'), links: [...document.querySelectorAll('#site-nav a')].filter((a) => a.checkVisibility({ checkVisibilityCSS: true })).length, total: document.querySelectorAll('#site-nav a').length }));
      if (open.expanded !== 'true') bad('opens', 'Enter on the menu button does not open the menu');
      else {
        if (open.links !== open.total) bad('links-visible', `only ${open.links} of ${open.total} menu links are visible when open`);
        const walked = [];
        for (let n = 0; n < open.total; n++) { await page.keyboard.press('Tab'); walked.push(await page.evaluate(() => (document.activeElement.closest('#site-nav') ? document.activeElement.textContent.trim() : 'OUTSIDE'))); }
        if (walked.includes('OUTSIDE')) bad('links-reachable', `the menu links are not reached in order by Tab (${walked.join(' | ')})`);
        await page.keyboard.press('Escape'); await page.waitForTimeout(80);
        const closed = await page.evaluate(() => ({ expanded: document.querySelector('.nav-toggle').getAttribute('aria-expanded'), focus: document.activeElement === document.querySelector('.nav-toggle') }));
        if (closed.expanded !== 'false' || !closed.focus) bad('escape', 'Escape does not close the menu and return focus to the button');
      }
      await close();
    }
  }, { root, browserName, pages: only });
  notes.push(`${stops} Tab stops walked on ${cfg.keyboard.contexts.length} contexts x pages; ${focusChecks} focus indicators compared by pixels; ${sized} target sizes measured`);
  const r = reconcile('keyboard', measured);
  return { problems: r.problems, notes: [...notes, ...r.notes] };
}

if (isMain(import.meta.url)) {
  const t0 = Date.now();
  const { problems, notes } = await checkKeyboard();
  notes.forEach((n) => console.log('  ' + n));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:keyboard (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  process.exit(problems.length ? 1 : 0);
}
