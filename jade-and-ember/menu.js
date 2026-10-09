/* Jade & Ember — Menu page only. Marks the category you are reading in the sticky jump links.
   Optional: every category is always on the page and the links are plain anchors, so the page is complete without this file. */
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
