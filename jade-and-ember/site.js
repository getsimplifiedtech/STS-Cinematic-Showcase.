/* Jade & Ember: site-wide progressive enhancement (every page).
   1. the phone navigation toggle;
   2. scroll progress: an element marked data-p gets --p (0 to 1) while it is near the screen. data-p="pin" measures a tall track whose child is pinned
      (0 at the top of the track, 1 when its end reaches the bottom of the screen); any other value measures the element crossing the screen
      (0 as it enters at the bottom, 1 as it leaves at the top). CSS does the rest, so scrolling back up reverses every effect.
   The pages are complete without this file; with reduced motion --p is never set and every page shows its resting state. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);

  /* Mobile navigation */
  const toggle = $('.nav-toggle');
  const nav = $('#site-nav');
  if (toggle && nav) {
    const mq = window.matchMedia('(max-width: 759px)');
    // Collapsing is done in CSS (.js .site-nav) so the layout is right on first paint; JS only toggles .is-open.
    const set = (open) => { toggle.setAttribute('aria-expanded', String(open)); nav.classList.toggle('is-open', open); toggle.closest('.top').classList.toggle('is-open', open); };
    toggle.addEventListener('click', () => set(toggle.getAttribute('aria-expanded') !== 'true'));
    nav.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') { set(false); toggle.focus(); }
    });
    (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(() => set(false));
  }

  /* Scroll progress */
  const els = [...document.querySelectorAll('[data-p]')];
  if (els.length && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const live = new Set(); let raf = 0;
    const tick = () => {
      raf = 0; const vh = innerHeight;
      live.forEach((el) => {
        const r = el.getBoundingClientRect();
        const p = el.dataset.p === 'pin' ? -r.top / Math.max(1, r.height - vh) : (vh - r.top) / (vh + r.height);
        el.style.setProperty('--p', Math.min(1, Math.max(0, p)).toFixed(3));
      });
    };
    const ask = () => { if (!raf) raf = requestAnimationFrame(tick); };
    // an element that has left the screen rests at the end it left by, so a fast scroll never strands it half-way
    const io = new IntersectionObserver((es) => { es.forEach((e) => { if (e.isIntersecting) live.add(e.target); else { live.delete(e.target); e.target.style.setProperty('--p', e.boundingClientRect.top > 0 ? '0' : '1'); } }); ask(); }, { rootMargin: '10% 0px' });
    els.forEach((el) => io.observe(el));
    addEventListener('scroll', ask, { passive: true });
    addEventListener('resize', ask);
  }
})();
