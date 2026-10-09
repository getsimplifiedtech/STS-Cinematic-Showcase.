/* Jade & Ember — progressive enhancement only. The page is complete without this file. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

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

  /* Menu tabs: one category at a time. Without JS every category is listed. */
  const tablist = $('.tabs');
  const tabs = $$('.tab');
  if (tablist && tabs.length) {
    tablist.setAttribute('role', 'tablist');
    $$('li', tablist).forEach((li) => li.setAttribute('role', 'presentation'));
    const panels = tabs.map((t) => document.getElementById(t.getAttribute('href').slice(1)));
    tabs.forEach((t, i) => {
      t.setAttribute('role', 'tab');
      t.setAttribute('aria-controls', panels[i].id);
      panels[i].setAttribute('role', 'tabpanel');
      panels[i].setAttribute('aria-labelledby', t.id);
      panels[i].setAttribute('aria-labelledby', t.id);
    });
    const select = (i, focus) => {
      tabs.forEach((t, j) => {
        const on = i === j;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        panels[j].hidden = !on;
      });
      if (focus) tabs[i].focus();
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', (e) => { e.preventDefault(); select(i); history.replaceState(null, '', '#menu'); });
      t.addEventListener('keydown', (e) => {
        const k = e.key;
        let n = null;
        if (k === 'ArrowRight' || k === 'ArrowDown') n = (i + 1) % tabs.length;
        else if (k === 'ArrowLeft' || k === 'ArrowUp') n = (i - 1 + tabs.length) % tabs.length;
        else if (k === 'Home') n = 0;
        else if (k === 'End') n = tabs.length - 1;
        if (n !== null) { e.preventDefault(); select(n, true); }
      });
    });
    const fromHash = () => {
      const i = panels.findIndex((p) => '#' + p.id === location.hash);
      select(i === -1 ? 0 : i);
      if (i !== -1) $('#menu').scrollIntoView();
    };
    window.addEventListener('hashchange', fromHash);
    fromHash();
  }

  /* Hero motion: one slow push on the still. Pause control is always offered when motion is running (WCAG 2.2.2). */
  const hero = $('[data-ambient-root]');
  const pause = $('.pause');
  if (hero && pause) {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const c = navigator.connection || {};
    const saveData = c.saveData === true;
    const apply = () => {
      const still = reduce.matches || saveData;
      hero.classList.toggle('no-motion', saveData);
      pause.hidden = still;
    };
    apply();
    (reduce.addEventListener ? reduce.addEventListener.bind(reduce, 'change') : reduce.addListener.bind(reduce))(apply);
    pause.addEventListener('click', () => {
      const on = pause.getAttribute('aria-pressed') !== 'true';
      pause.setAttribute('aria-pressed', String(on));
      pause.querySelector('.pause-txt').textContent = on ? 'Play motion' : 'Pause motion';
      hero.classList.toggle('is-paused', on);
    });
  }
})();
