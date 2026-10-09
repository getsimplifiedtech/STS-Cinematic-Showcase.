/* Jade & Ember — site-wide progressive enhancement (every page): the phone navigation toggle.
   The pages are complete without this file. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);

  /* Mobile navigation */
  const toggle = $('.nav-toggle');
  const nav = $('#site-nav');
  if (toggle && nav) {
    const mq = window.matchMedia('(max-width: 759px)');
    // Collapsing is done in CSS (.js .site-nav) so the layout is right on first paint; JS only toggles .is-open.
    const set = (open) => { toggle.setAttribute('aria-expanded', String(open)); nav.classList.toggle('is-open', open); };
    toggle.addEventListener('click', () => set(toggle.getAttribute('aria-expanded') !== 'true'));
    nav.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') { set(false); toggle.focus(); }
    });
    (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(() => set(false));
  }
})();
