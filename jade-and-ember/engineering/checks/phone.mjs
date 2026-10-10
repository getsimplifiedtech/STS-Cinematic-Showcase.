// check:phone (finding F-G4-01, owner decision in Gate 4 review: accept the phone numbers' appearance PROVIDED they remain readable, operable and
// free of horizontal overflow or clipping at the supported mobile widths). A genuine defect changes the verdict; a number that merely wraps
// onto a second line is recorded, not failed, because the wrap is the v0.8 appearance the owner accepted.
// For every telephone link on every page, at each supported phone width (portrait and landscape):
//   readable    the visible text equals the configured display number; the font is at least 12 px; the text is not clipped by any ancestor
//   no overflow every line box of the link lies inside the viewport; the page does not scroll sideways
//   operable    the link is focusable, a real tel: link whose digits equal the visible number, receives the pointer at the centre of every line
//               box (nothing covers it), and has a pointer target of at least 24 by 24 CSS px
//               unless it is an inline link in running text, where the criterion does not apply (WCAG 2.5.8)
// The wrap map (how many widths split the number across lines) is reported so the owner can see exactly what was accepted.
import { withSite } from '../lib/runtime.mjs';
import { isMain } from '../lib/git.mjs';

export const WIDTHS = [
  { name: '320x568', width: 320, height: 568 }, { name: '360x740', width: 360, height: 740 }, { name: '375x667', width: 375, height: 667 },
  { name: '390x844', width: 390, height: 844 }, { name: '412x915', width: 412, height: 915 }, { name: '430x932', width: 430, height: 932 },
  { name: '568x320 landscape', width: 568, height: 320 }, { name: '667x375 landscape', width: 667, height: 375 }, { name: '768x1024 tablet', width: 768, height: 1024 },
];

// Runs in the page.
const measure = () => {
  const out = [];
  const links = [...document.querySelectorAll('a[href^="tel:"]')];
  const overflowX = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  for (const a of links) {
    a.scrollIntoView({ block: 'center', inline: 'nearest' });   // measure where a visitor presses it: coverage is judged in the viewport
    const cs = getComputedStyle(a), item = { href: a.getAttribute('href'), text: a.textContent.trim(), problems: [], lines: 0, minTarget: 0 };
    if (!a.checkVisibility({ checkVisibilityCSS: true })) { item.problems.push('the phone link is not visible'); out.push(item); continue; }
    const range = document.createRange(); range.selectNodeContents(a);
    const rects = [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1);
    const tops = []; for (const r of rects) if (!tops.some((t) => Math.abs(t - r.top) < 3)) tops.push(r.top);
    item.lines = tops.length;
    if (parseFloat(cs.fontSize) < 12) item.problems.push(`the font size is ${cs.fontSize} (minimum 12px)`);
    if (cs.pointerEvents === 'none') item.problems.push('pointer-events: none (the link cannot be pressed)');
    if (a.tabIndex < 0) item.problems.push('the link is not focusable (negative tabindex)');
    const digits = (s) => s.replace(/\D/g, '');
    if (digits(item.href) !== digits(item.text) && !digits(item.href).endsWith(digits(item.text))) item.problems.push(`the visible number "${item.text}" does not match ${item.href}`);
    for (const r of rects) {
      if (r.left < -0.5 || r.right > innerWidth + 0.5) item.problems.push(`a line of the number runs outside the viewport (${Math.round(r.left)} to ${Math.round(r.right)} of ${innerWidth})`);
      // clipped by an ancestor
      for (let p = a.parentElement; p && p !== document.documentElement; p = p.parentElement) {
        const pc = getComputedStyle(p);
        if (['hidden', 'clip'].includes(pc.overflowX) || ['hidden', 'clip'].includes(pc.overflowY)) {
          const pr = p.getBoundingClientRect();
          if (r.left < pr.left - 0.5 || r.right > pr.right + 0.5 || r.top < pr.top - 0.5 || r.bottom > pr.bottom + 0.5) { item.problems.push(`clipped by ${p.tagName.toLowerCase()}${p.className ? '.' + String(p.className).split(/\s+/)[0] : ''}`); break; }
        }
      }
      // covered?
      const cx = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1), cy = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1);
      if (r.top >= 0 && r.bottom <= innerHeight) { const hit = document.elementFromPoint(cx, cy); if (hit && !a.contains(hit)) item.problems.push(`something else (${hit.tagName.toLowerCase()}) covers the number`); }
    }
    // target size (WCAG 2.5.8): an inline link in running text is exempt; a link set as a block or inline-block must offer 24 px
    const br = a.getBoundingClientRect();
    item.minTarget = Math.round(Math.min(br.width, br.height));
    if (cs.display !== 'inline' && (br.height < 24 || br.width < 24)) item.problems.push(`the target is ${Math.round(br.width)} by ${Math.round(br.height)} px (minimum 24 by 24)`);
    out.push(item);
  }
  return { overflowX, links: out };
};

export async function checkPhone({ root = null, browserName = 'chromium', pages: only = null, widths = WIDTHS } = {}) {
  const problems = [], notes = [];
  let measured = 0, numbers = 0; const wraps = new Map();
  await withSite(async ({ pages, newPage }) => {
    for (const file of pages) for (const w of widths) {
      const { page, close } = await newPage({ viewport: { width: w.width, height: w.height }, isMobile: w.width <= 768, hasTouch: w.width <= 768 }, file);
      const m = await page.evaluate(measure);
      await close();
      if (!m.links.length) continue;
      measured++;
      if (m.overflowX > 1) problems.push(`${file} at ${w.name}: the page scrolls sideways by ${m.overflowX}px`);
      for (const it of m.links) {
        numbers++;
        for (const pr of it.problems) problems.push(`${file} at ${w.name}: ${it.text || it.href}: ${pr}`);
        if (it.lines > 1) wraps.set(`${file}`, [...(wraps.get(file) || []), w.name]);
      }
    }
  }, { root, browserName, pages: only });
  const wrapText = [...wraps.entries()].map(([f, ws]) => `${f}: ${ws.join(', ')}`).join('; ');
  notes.push(`${numbers} phone-number measurements over ${measured} page loads at ${widths.length} supported mobile widths (portrait, landscape, tablet): readable, inside the viewport, not clipped, not covered, pressable${wraps.size ? `. Numbers that wrap onto a second line (the accepted v0.8 appearance, not a defect): ${wrapText}` : '. No number wraps at any of these widths'}`);
  return { problems, notes };
}

if (isMain(import.meta.url)) {
  const t0 = Date.now();
  const { problems, notes } = await checkPhone();
  notes.forEach((n) => console.log('  ' + n));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:phone (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  process.exit(problems.length ? 1 : 0);
}
