// check:order (ENG-048). The DOM order of headings and interactive elements must match the order a sighted reader follows (WCAG 1.3.2, 2.4.3).
// For each consecutive pair in DOM order: items on the same row must run left to right; otherwise the next item must be lower on screen,
// or start a new column to the right of the previous one (columns read one after the other are normal). Moving up in the same column, or
// left and up, is a violation (4 px tolerance). Run on every page at desktop and phone width.
import { reconcile } from '../lib/findings.mjs';
import { withSite } from '../lib/runtime.mjs';
import { isMain } from '../lib/git.mjs';
import { markup } from '../lib/project.mjs';

const collect = (skipClass) => {
  const sel = 'h1, h2, h3, h4, h5, h6, a[href], button, [tabindex]:not([tabindex="-1"])';
  const name = (e) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''} "${(e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 22)}"`;
  return [...document.querySelectorAll(sel)].filter((e) => e.checkVisibility({ checkVisibilityCSS: true }) && !e.classList.contains(skipClass) && !e.closest('[aria-hidden="true"]')).map((e) => { const r = e.getBoundingClientRect(); return { n: name(e), x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; });
};

export async function checkOrder({ root = null, browserName = 'chromium', pages: only = null } = {}) {
  const measured = [], notes = [];
  let pairs = 0;
  await withSite(async ({ pages, newPage }) => {
    const TOL = 4;
    for (const ctx of [{ name: 'desktop-1440', w: 1440, h: 900 }, { name: 'mobile-390', w: 390, h: 844 }]) for (const file of pages) {
      const { page, close } = await newPage({ viewport: { width: ctx.w, height: ctx.h } }, file);
      const items = await page.evaluate(collect, markup.selectors.skipLinkClass);
      for (let i = 1; i < items.length; i++) {
        const a = items[i - 1], b = items[i]; pairs++;
        const overlapV = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        const sameRow = overlapV > 0.5 * Math.min(a.h, b.h);
        const newColumn = b.x > a.x + TOL;   // the next column of a row of columns
        const ok = sameRow ? b.x >= a.x - TOL : b.y >= a.y - TOL || newColumn;
        if (!ok) measured.push({ key: `order:${file}@${ctx.name}:${sameRow ? 'row' : 'column'}:${a.n} -> ${b.n}`, detail: `${a.n} comes before ${b.n} in the DOM but ${sameRow ? 'to the right of it on the same row' : 'below it'} on screen` });
      }
      await close();
    }
  }, { root, browserName, pages: only });
  notes.push(`${pairs} consecutive pairs of headings and controls compared (DOM order against screen order)`);
  const r = reconcile('order', measured);
  return { problems: r.problems, notes: [...notes, ...r.notes] };
}

if (isMain(import.meta.url)) {
  const t0 = Date.now();
  const { problems, notes } = await checkOrder();
  notes.forEach((n) => console.log('  ' + n));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:order (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  process.exit(problems.length ? 1 : 0);
}
