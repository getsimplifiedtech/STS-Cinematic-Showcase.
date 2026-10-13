// check:reflow (ENG-044). WCAG 1.4.10 reflow at 320 CSS px, 1.4.4 text resize (200 percent zoom of a 1280 px window = 640 CSS px at
// device pixel ratio 2) and 1.4.12 text spacing (line height 1.5, paragraph spacing 2 em, letter spacing 0.12 em, word spacing 0.16 em).
// On every page the check measures, in the pinned browser: horizontal overflow; content clipped by a box with hidden overflow; text drawn
// over other text; interactive elements overlapping each other. For text spacing only what the override CAUSES counts (the same
// measurement without the override is the reference). Failures are reconciled with engineering/findings.json.
import { join } from 'node:path';
import { reconcile } from '../lib/findings.mjs';
import { withSite } from '../lib/runtime.mjs';
import { engDir, isMain, readJson } from '../lib/git.mjs';
import { markup } from '../lib/project.mjs';
import { policy } from '../lib/policy.mjs';

// Runs in the page. Returns everything the check needs; no judgement here.
export const measure = ({ minOverlap, skipClass }) => {
  const label = (e) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}`;
  const out = { overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth, wide: [], clipped: [], overlaps: [], tight: [] };
  const scrollsX = (e) => { for (let a = e.parentElement; a; a = a.parentElement) { const o = getComputedStyle(a).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return true; } return false; };
  const all = [...document.body.querySelectorAll('*')].filter((e) => e.checkVisibility({ checkVisibilityCSS: true }));
  for (const e of all) {
    const r = e.getBoundingClientRect();
    if (r.width > 0 && r.right > innerWidth + 1 && !scrollsX(e) && getComputedStyle(e).position !== 'fixed') out.wide.push(`${label(e)} ends ${Math.round(r.right - innerWidth)}px beyond the viewport`);
    const cs = getComputedStyle(e);
    if ((cs.overflowX !== 'visible' || cs.overflowY !== 'visible') && e.tagName !== 'HTML' && e.tagName !== 'BODY' && (e.innerText || '').trim() && r.width > 2 && r.height > 2) {
      const dx = e.scrollWidth - e.clientWidth, dy = e.scrollHeight - e.clientHeight;
      const clips = (axis, d) => (axis === 'hidden' || axis === 'clip') && d > 1;
      if (clips(cs.overflowX, dx) || clips(cs.overflowY, dy)) out.clipped.push(`${label(e)} clips ${dx > 1 ? dx + 'px sideways ' : ''}${dy > 1 ? dy + 'px vertically' : ''}`.trim());
      // a scrolling region is fine when the keyboard can scroll it: it holds something focusable, or is itself focusable
      const scrolls = (cs.overflowX === 'auto' || cs.overflowX === 'scroll') && dx > 1;
      if (scrolls && !e.querySelector('a[href], button, input, select, textarea, [tabindex]') && !e.hasAttribute('tabindex')) out.clipped.push(`${label(e)} scrolls sideways (${dx}px) but the keyboard cannot reach it`);
    }
  }
  // text rectangles: one per text node (the glyph area, not the padded box)
  const texts = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.nodeValue.trim()) continue;
    const el = n.parentElement;
    if (!el.checkVisibility({ checkVisibilityCSS: true }) || el.closest('.vh, [hidden], script, style, [aria-hidden="true"]')) continue;
    const range = document.createRange(); range.selectNodeContents(n);
    for (const r of range.getClientRects()) if (r.width > 1 && r.height > 1) texts.push({ el, r, t: n.nodeValue.trim().slice(0, 18) });
  }
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
    const a = texts[i], b = texts[j];
    if (a.el === b.el) continue;
    const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    // overlap of the glyph boxes must be real: tight leading on display type overlaps the boxes by a fraction of a line without touching the letters
    if (w > 1 && h > 0.35 * Math.min(a.r.height, b.r.height) && w * h >= minOverlap) out.overlaps.push(`"${a.t}" (${label(a.el)}) over "${b.t}" (${label(b.el)})`);
  }
  // interactive elements overlapping each other
  const ints = [...document.querySelectorAll('a[href], button')].filter((e) => e.checkVisibility({ checkVisibilityCSS: true }) && !e.classList.contains(skipClass));
  for (let i = 0; i < ints.length; i++) for (let j = i + 1; j < ints.length; j++) {
    if (ints[i].contains(ints[j]) || ints[j].contains(ints[i])) continue;
    const a = ints[i].getBoundingClientRect(), b = ints[j].getBoundingClientRect();
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (w > 2 && h > 2) out.tight.push(`${label(ints[i])} overlaps ${label(ints[j])}`);
  }
  return out;
};

export const spacingCss = (s) => `* { line-height: ${s.lineHeight} !important; letter-spacing: ${s.letterSpacingEm}em !important; word-spacing: ${s.wordSpacingEm}em !important; } p { margin-bottom: ${s.paragraphSpacingEm}em !important; }`;

export async function checkReflow({ root = null, browserName = 'chromium', pages: only = null } = {}) {
  const cfg = policy('a11y').reflow;
  const measured = [], notes = [];
  let runs = 0;
  await withSite(async ({ pages, newPage }) => {
    const add = (tag, rule, items, detail) => { for (const it of [...new Set(items)]) measured.push({ key: `${tag}:${rule}:${it}`, detail: `${detail}: ${it}` }); };
    // reflow and zoom
    for (const w of cfg.widths) for (const file of pages) {
      const tag = `reflow:${file}@${w.name}`;
      const { page, close } = await newPage({ viewport: { width: w.width, height: w.height }, deviceScaleFactor: w.deviceScaleFactor || 1 }, file);
      const m = await page.evaluate(measure, { minOverlap: cfg.overlapMinPixels, skipClass: markup.selectors.skipLinkClass }); runs++;
      if (m.overflowX > 1) measured.push({ key: `${tag}:horizontal-scroll:page`, detail: `the page scrolls sideways by ${m.overflowX}px (1.4.10)`, value: m.overflowX });
      add(tag, 'wide', m.wide, 'content extends past the viewport');
      add(tag, 'clipped', m.clipped, 'content is clipped');
      add(tag, 'text-overlap', m.overlaps, 'text overlaps text');
      add(tag, 'target-overlap', m.tight, 'controls overlap');
      await close();
    }
    // text spacing: only what the override causes
    for (const c of cfg.spacing.contexts) for (const file of pages) {
      const tag = `reflow:${file}@spacing-${c.name}`;
      const { page, close } = await newPage({ viewport: { width: c.width, height: c.height } }, file);
      const before = await page.evaluate(measure, { minOverlap: cfg.overlapMinPixels, skipClass: markup.selectors.skipLinkClass });
      await page.addStyleTag({ content: spacingCss(cfg.spacing) }); await page.waitForTimeout(150);
      const after = await page.evaluate(measure, { minOverlap: cfg.overlapMinPixels, skipClass: markup.selectors.skipLinkClass }); runs++;
      const added = (k) => after[k].filter((x) => !before[k].includes(x));
      if (after.overflowX > before.overflowX + 1) measured.push({ key: `${tag}:horizontal-scroll:page`, detail: `text spacing makes the page scroll sideways by ${after.overflowX}px (1.4.12)`, value: after.overflowX });
      add(tag, 'wide', added('wide'), 'text spacing pushes content past the viewport');
      add(tag, 'clipped', added('clipped'), 'text spacing clips content (1.4.12)');
      add(tag, 'text-overlap', added('overlaps'), 'text spacing makes text overlap');
      add(tag, 'target-overlap', added('tight'), 'text spacing makes controls overlap');
      await close();
    }
  }, { root, browserName, pages: only });
  notes.push(`${runs} measurements: ${cfg.widths.map((w) => w.name).join(', ')} and text spacing at ${cfg.spacing.contexts.map((c) => c.name).join(', ')} on every page`);
  const r = reconcile('reflow', measured);
  return { problems: r.problems, notes: [...notes, ...r.notes] };
}

if (isMain(import.meta.url)) {
  const t0 = Date.now();
  const { problems, notes } = await checkReflow();
  notes.forEach((n) => console.log('  ' + n));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:reflow (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  process.exit(problems.length ? 1 : 0);
}
