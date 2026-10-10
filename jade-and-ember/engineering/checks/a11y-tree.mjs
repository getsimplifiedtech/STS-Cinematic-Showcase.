// check:a11y-tree (ENG-049 automated part, ENG-051). Rules over the accessibility tree and the ARIA references of every page, desktop and phone:
//   landmarks: exactly one banner, main and contentinfo, in that order; every navigation labelled and the labels unique
//   headings: exactly one h1; levels never skip; no empty heading
//   names: every link, button and image role has an accessible name; links with the same name go to the same place
//   references: aria-labelledby / aria-controls targets exist; no focusable element is aria-hidden; aria-current marks the current page
// The tree itself is also compared with v0.8 by check:regression. This check catches defects in the structure, wherever they come from.
// It does not replace a human screen-reader pass (a release requirement, see QA.md).
import { reconcile } from '../lib/findings.mjs';
import { withSite } from '../lib/runtime.mjs';
import { isMain } from '../lib/git.mjs';

// Parses Playwright's ARIA snapshot (YAML-like) into nodes { depth, role, name, attrs, url }.
export function parseAria(text) {
  const nodes = [];
  for (const line of text.split('\n')) {
    const m = /^(\s*)- (\/url): (.*)$/.exec(line);
    if (m) { if (nodes.length) nodes[nodes.length - 1].url = m[3].trim(); continue; }
    const n = /^(\s*)- ([a-z]+)(?: "((?:[^"\\]|\\.)*)")?((?: \[[^\]]+\])*):?\s*(.*)$/.exec(line);
    if (n) nodes.push({ depth: n[1].length / 2, role: n[2], name: (n[3] || '').replace(/\\"/g, '"'), attrs: n[4] || '', rest: n[5] || '', url: null });
  }
  return nodes;
}

const domFacts = () => {
  const id = (e) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}`;
  const out = { missingRefs: [], hiddenFocusable: [], current: [], langBad: [], emptyHeadings: [] };
  for (const attr of ['aria-labelledby', 'aria-controls', 'aria-describedby']) for (const e of document.querySelectorAll(`[${attr}]`)) for (const ref of e.getAttribute(attr).split(/\s+/)) if (!document.getElementById(ref)) out.missingRefs.push(`${id(e)} ${attr}="${ref}"`);
  for (const e of document.querySelectorAll('[aria-hidden="true"]')) if (e.matches('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])') || e.querySelector('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')) out.hiddenFocusable.push(id(e));
  for (const e of document.querySelectorAll('[aria-current]')) out.current.push(`${id(e)}:${e.getAttribute('aria-current')}:${e.closest('nav')?.getAttribute('aria-label') || '-'}`);
  for (const h of document.querySelectorAll('h1,h2,h3,h4,h5,h6')) if (!(h.textContent || '').trim()) out.emptyHeadings.push(id(h));
  out.lang = document.documentElement.getAttribute('lang');
  out.title = document.title;
  return out;
};

export async function checkA11yTree({ root = null, browserName = 'chromium', pages: only = null } = {}) {
  const measured = [], notes = [];
  let nodesSeen = 0;
  await withSite(async ({ pages, newPage }) => {
    for (const ctx of [{ name: 'desktop-1440', w: 1440, h: 900 }, { name: 'mobile-390', w: 390, h: 844 }]) for (const file of pages) {
      const tag = `a11y-tree:${file}@${ctx.name}`;
      const bad = (rule, who, detail) => measured.push({ key: `${tag}:${rule}:${who}`, detail });
      const { page, close } = await newPage({ viewport: { width: ctx.w, height: ctx.h } }, file);
      const tree = parseAria(await page.locator('body').ariaSnapshot());
      const dom = await page.evaluate(domFacts);
      nodesSeen += tree.length;
      const top = tree.filter((n) => n.depth === 0).map((n) => n.role);
      const count = (role) => tree.filter((n) => n.role === role).length;
      for (const r of ['banner', 'main', 'contentinfo']) if (count(r) !== 1) bad('landmark-count', r, `expected exactly one ${r} landmark, found ${count(r)}`);
      const order = ['banner', 'main', 'contentinfo'].map((r) => top.indexOf(r));
      if (order.some((v) => v < 0) || order[0] > order[1] || order[1] > order[2]) bad('landmark-order', 'page', `banner, main and contentinfo must appear in that order (got ${top.join(', ')})`);
      const navs = tree.filter((n) => n.role === 'navigation');
      if (!navs.length) bad('navigation', 'page', 'no navigation landmark');
      navs.forEach((n) => { if (!n.name) bad('navigation-name', 'nav', 'a navigation landmark has no label'); });
      if (new Set(navs.map((n) => n.name)).size !== navs.length) bad('navigation-unique', 'nav', `navigation labels must be unique (${navs.map((n) => n.name || '(none)').join(', ')})`);
      const heads = tree.filter((n) => n.role === 'heading');
      const levels = heads.map((h) => Number(/level=(\d)/.exec(h.attrs)?.[1] || 0));
      if (levels.filter((l) => l === 1).length !== 1) bad('h1', 'page', `expected exactly one h1, found ${levels.filter((l) => l === 1).length}`);
      levels.forEach((l, i) => { if (i > 0 && l > levels[i - 1] + 1) bad('heading-skip', heads[i].name.slice(0, 30), `heading level jumps from ${levels[i - 1]} to ${l} at "${heads[i].name.slice(0, 40)}"`); });
      if (levels[0] !== 1) bad('heading-first', 'page', 'the first heading must be the h1');
      dom.emptyHeadings.forEach((h) => bad('heading-empty', h, `${h} has no text`));
      for (const n of tree.filter((x) => ['link', 'button', 'img', 'checkbox', 'textbox', 'combobox', 'radio'].includes(x.role))) if (!n.name.trim()) bad('name-missing', `${n.role}@${n.url || ''}`, `a ${n.role}${n.url ? ` to ${n.url}` : ''} has no accessible name`);
      const byName = new Map();
      for (const l of tree.filter((x) => x.role === 'link' && x.name)) { const set = byName.get(l.name) || new Set(); set.add(l.url); byName.set(l.name, set); }
      for (const [name, urls] of byName) if (urls.size > 1) bad('link-ambiguous', name, `links named "${name}" go to different places (${[...urls].join(', ')})`);
      dom.missingRefs.forEach((r) => bad('aria-reference', r, `${r} points at an id that does not exist`));
      dom.hiddenFocusable.forEach((r) => bad('aria-hidden-focusable', r, `${r} is aria-hidden but contains something focusable`));
      const cur = dom.current.filter((c) => c.endsWith(':Primary') || c.endsWith(':Footer'));
      const inPrimary = cur.filter((c) => c.endsWith(':Primary'));
      if (inPrimary.length < 1) bad('aria-current', 'Primary', 'the current page is not marked aria-current="page" in the primary navigation');
      if (!/^[a-z]{2,3}(-[A-Za-z0-9]+)*$/.test(dom.lang || '')) bad('lang', 'html', `invalid or missing lang on <html> ("${dom.lang}")`);
      if (!dom.title.trim()) bad('title', 'page', 'the page has no title');
      await close();
    }
  }, { root, browserName, pages: only });
  notes.push(`${nodesSeen} accessibility-tree nodes checked on every page at desktop and phone width`);
  const r = reconcile('a11y-tree', measured);
  return { problems: r.problems, notes: [...notes, ...r.notes] };
}

if (isMain(import.meta.url)) {
  const t0 = Date.now();
  const { problems, notes } = await checkA11yTree();
  notes.forEach((n) => console.log('  ' + n));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:a11y-tree (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  process.exit(problems.length ? 1 : 0);
}
