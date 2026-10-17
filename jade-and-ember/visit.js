/* Jade & Ember, Visit us: the candle. One soft pool of warm light drifts and flickers behind the frosted panel. Decorative only; the page is complete without it.
   The flicker is read from a short table (the same flame the Home sequence was filmed from), smoothed, and applied as transform and opacity on one element.
   Runs only while the room is on screen and the tab is visible; not started for reduced motion or Save-Data; the Pause control stops it where it is. */
(() => {
  'use strict';
  const room = document.querySelector('.visit-room'), pool = document.querySelector('.candle'), btn = document.querySelector('.pause');
  const conn = navigator.connection || {};
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || conn.saveData || /(^|-)2g$/.test(conn.effectiveType || '')) return;
  document.documentElement.classList.add('v-art');   // switches on the scroll choreography in visit.css, which therefore never runs for reduced motion, Save-Data or 2g
  if (!room || !pool) return;
  const T = [36,0,33,55,90,26,22,0,23,48,99,13,42,56,32,48,93,81,83,0,43,72,89,80,40,96,99,61,39,82,0,6,56,1,92,72,29,47,62,18,85,56,54,40,0,50,51,43];
  let raf = 0, seen = true, paused = false, v = 0.5, t0 = performance.now(), off = 0;

  const frame = (now) => {
    raf = 0; if (paused || !seen || document.hidden) return;
    const t = (now - t0) / 1000 + off;
    v += (T[Math.floor(t * 9) % T.length] / 99 - v) * 0.12;
    const x = Math.sin(t * 0.21) * 6 + Math.sin(t * 0.07 + 1) * 4, y = Math.sin(t * 0.17 + 2) * 4;
    pool.style.transform = 'translate3d(' + x.toFixed(2) + 'vw,' + y.toFixed(2) + 'vh,0)';
    pool.style.opacity = (0.72 + v * 0.28).toFixed(3);
    raf = requestAnimationFrame(frame);
  };
  const run = () => { if (!raf && !paused && seen && !document.hidden) { t0 = performance.now(); raf = requestAnimationFrame(frame); } };
  const set = () => { btn.setAttribute('aria-pressed', String(paused)); btn.querySelector('.pause-txt').textContent = paused ? 'Play motion' : 'Pause motion'; };

  new IntersectionObserver((es) => { seen = es[0].isIntersecting; if (seen) run(); }).observe(room);
  document.addEventListener('visibilitychange', run);
  if (btn) {
    btn.hidden = false; set();
    btn.addEventListener('click', () => { paused = !paused; set(); if (paused) { off += (performance.now() - t0) / 1000; } else run(); });
  }
  run();
})();
