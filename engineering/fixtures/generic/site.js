"use strict";
// Phone navigation: the Menu button shows and hides the navigation list. Without JavaScript the list is always visible.
(function () {
  var btn = document.querySelector('.nav-toggle'), nav = document.getElementById('site-nav');
  if (!btn || !nav) return;
  btn.addEventListener('click', function () {
    var open = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', open ? 'false' : 'true');
    nav.classList.toggle('open', !open);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || btn.getAttribute('aria-expanded') !== 'true') return;
    btn.setAttribute('aria-expanded', 'false');
    nav.classList.remove('open');
    btn.focus();
  });
})();
