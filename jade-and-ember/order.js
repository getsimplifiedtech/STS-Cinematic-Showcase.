/* Jade & Ember, Order online: the ember on the lacquer cards. Decorative only; the cards are complete without it (parked, still).
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
