/* Jade & Ember — Menu page only. Marks the category you are reading in the sticky jump links.
   Optional: every category is always on the page and the links are plain anchors, so the page is complete without this file. A second block, at the end, starts the ember on the cards. */
(() => {
  'use strict';
  const links = [...document.querySelectorAll('.jump a')];
  const sections = links.map((a) => document.getElementById(a.getAttribute('href').slice(1))).filter(Boolean);
  if (!links.length || !('IntersectionObserver' in window)) return;
  const mark = (id) => links.forEach((a) => { if (a.getAttribute('href') === '#' + id) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
  // The band between 25% and 40% from the top of the viewport decides which category is "current".
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) mark(e.target.id); });
  }, { rootMargin: '-25% 0px -60% 0px' });
  sections.forEach((s) => io.observe(s));
})();

/* Jade & Ember, Menu: the ember on the lacquer cards. Decorative only; the cards are complete without it (parked, still).
   Adds .lit to <html> (styles.css then lets the ember travel each card's edge), never for reduced motion, Save-Data or 2g, and shows the one Pause button, which
   adds .still to stop it. */
(() => {
  'use strict';
  const root = document.documentElement, conn = navigator.connection || {}, btn = document.querySelector('.pause[data-lq]');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || conn.saveData || /(^|-)2g$/.test(conn.effectiveType || '')) return;
  root.classList.add('lit');
  if (!btn) return;
  btn.hidden = false;
  btn.addEventListener('click', () => {
    const on = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', String(on)); btn.querySelector('.pause-txt').textContent = on ? 'Play motion' : 'Pause motion'; root.classList.toggle('still', on);
  });
})();
