/* Jade & Ember, Our story: embers rising from the name. Decorative only; the page is complete without it.
   Own code, no library: a small pool of particles (24 on a phone, 40 elsewhere) drawn on one canvas, only while the opening is on screen, the tab is visible
   and the visitor has not paused. Not started at all for reduced motion or Save-Data. The Pause control stops the drawing and clears the canvas. */
(() => {
  'use strict';
  const pin = document.querySelector('.story-pin'), cv = document.querySelector('.embers'), btn = document.querySelector('.pause');
  const conn = navigator.connection || {};
  if (!pin || !cv || matchMedia('(prefers-reduced-motion: reduce)').matches || conn.saveData || /(^|-)2g$/.test(conn.effectiveType || '')) return;
  document.documentElement.classList.add('lit');   // starts the ember on the lacquer card (styles.css); not added for reduced motion, Save-Data or 2g
  const ctx = cv.getContext('2d'); if (!ctx) return;
  const small = matchMedia('(max-width: 759px)').matches, MAX = small ? 24 : 40;
  let w = 0, h = 0, dpr = 1, ps = [], last = 0, raf = 0, seen = true, paused = false;

  const size = () => { dpr = Math.min(devicePixelRatio || 1, 1.5); w = cv.clientWidth; h = cv.clientHeight; cv.width = w * dpr | 0; cv.height = h * dpr | 0; };
  const fill = () => parseFloat(pin.parentElement.style.getPropertyValue('--p')) || 0.5;
  // an ember is born low, near the glyph, and drifts up and a little sideways while it cools from ember-hi to nothing
  const spawn = () => ({ x: w * (0.22 + Math.random() * 0.56), y: h * (0.72 + Math.random() * 0.2), vx: (Math.random() - 0.4) * 14, vy: -(26 + Math.random() * 46), life: 0, ttl: 2.4 + Math.random() * 2.6, r: 1 + Math.random() * 1.8, ph: Math.random() * 6.28 });
  const frame = (t) => {
    raf = 0; if (paused || !seen || document.hidden) return;
    const dt = Math.min(0.05, (t - last) / 1000 || 0.016); last = t;
    const want = Math.round(MAX * Math.min(1, fill() * 1.3));
    while (ps.length < want && Math.random() < 0.35) ps.push(spawn());
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h); ctx.globalCompositeOperation = 'lighter';
    ps = ps.filter((p) => (p.life += dt) < p.ttl);
    for (const p of ps) {
      p.x += (p.vx + Math.sin(p.life * 2 + p.ph) * 9) * dt; p.y += p.vy * dt;
      const k = 1 - p.life / p.ttl, g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 5);
      g.addColorStop(0, 'rgba(247,161,92,' + (0.9 * k) + ')'); g.addColorStop(1, 'rgba(240,138,60,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 5, 0, 6.2832); ctx.fill();
    }
    raf = requestAnimationFrame(frame);
  };
  const run = () => { if (!raf && !paused && seen && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  const set = () => { if (btn) { btn.setAttribute('aria-pressed', String(paused)); btn.querySelector('.pause-txt').textContent = paused ? 'Play motion' : 'Pause motion'; } document.documentElement.classList.toggle('still', paused); };

  size(); addEventListener('resize', size);
  new IntersectionObserver((es) => { seen = es[0].isIntersecting; if (seen) run(); else ctx.clearRect(0, 0, w, h); }).observe(pin);
  document.addEventListener('visibilitychange', run);
  if (btn) {
    btn.hidden = false; set();
    btn.addEventListener('click', () => { paused = !paused; set(); if (paused) { ps = []; ctx.clearRect(0, 0, w, h); } else run(); });
  }
  run();
})();
