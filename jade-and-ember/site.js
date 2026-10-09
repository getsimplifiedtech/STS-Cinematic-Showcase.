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

  /* Hero motion. Order of preference: the cinematic loop (<video>, muted, over the poster), then one slow push on the still,
     then the still alone. A visible Pause control is always offered while anything is moving (WCAG 2.2.2). */
  const hero = $('[data-ambient-root]');
  const pause = $('.pause');
  const video = $('.hero-video');
  if (hero && pause) {
    const mq = (q) => window.matchMedia(q);
    const listen = (m, f) => (m.addEventListener ? m.addEventListener('change', f) : m.addListener(f));
    const reduce = mq('(prefers-reduced-motion: reduce)');
    const portrait = mq('(max-aspect-ratio: 1/1) and (max-width: 959px)');   // same test as the portrait poster crop: no video there
    const conn = navigator.connection || {};
    const stillOnly = () => reduce.matches || conn.saveData === true || /^(slow-2g|2g)$/.test(conn.effectiveType || '');
    const STARTUP_MS = 6000, STALL_MS = 3000;
    let state = 'idle';                  // idle | loading | playing | failed
    let userPaused = false, visible = true, startTimer = 0, stallTimer = 0, queued = false;

    const syncPlayback = () => {
      if (state !== 'playing') return;
      const go = !userPaused && visible && !document.hidden;
      if (go && video.paused) { const p = video.play(); if (p && p.catch) p.catch(fail); }
      else if (!go && !video.paused) video.pause();
    };
    const stopVideo = () => {
      clearTimeout(startTimer); clearTimeout(stallTimer);
      if (video) {
        video.pause();
        video.querySelectorAll('source').forEach((n) => n.remove());
        if (video.getAttribute('src')) video.removeAttribute('src');
        if (state !== 'idle') video.load();   // abort any download in flight
      }
      hero.classList.remove('is-video');
      if (state !== 'failed') state = 'idle';
    };
    function fail() { state = 'failed'; stopVideo(); render(); }   // clip could not play: poster plus the slow push
    const startVideo = () => {
      queued = false;
      if (state !== 'idle' || userPaused || !video || stillOnly() || portrait.matches) return;
      state = 'loading';
      let bad = 0;
      const add = (src, type) => {
        const n = document.createElement('source'); n.src = src; n.type = type;
        // a failed <source> fires its own error event (the <video> does not): give up once every source has failed
        n.addEventListener('error', () => { if (++bad >= video.querySelectorAll('source').length) fail(); });
        video.appendChild(n);
      };
      if (video.canPlayType('video/webm; codecs="vp9"')) add(video.dataset.webm, 'video/webm; codecs="vp9"');
      if (video.canPlayType('video/mp4; codecs="avc1.640020"') || video.canPlayType('video/mp4')) add(video.dataset.mp4, 'video/mp4');
      if (!video.querySelector('source')) return fail();
      video.preload = 'auto';
      startTimer = setTimeout(fail, STARTUP_MS);
      video.load();
      const p = video.play(); if (p && p.catch) p.catch(fail);   // autoplay refused: fall back, no play button over the hero
    };
    // Never compete with first paint: wait for load, then for an idle moment.
    const queueStart = () => {
      if (queued || state !== 'idle') return; queued = true;
      const go = () => ('requestIdleCallback' in window ? requestIdleCallback(startVideo, { timeout: 2000 }) : setTimeout(startVideo, 300));
      document.readyState === 'complete' ? go() : window.addEventListener('load', go, { once: true });
    };
    function render() {
      if (stillOnly()) { stopVideo(); hero.classList.remove('push-on', 'is-paused'); pause.hidden = true; return; }
      pause.hidden = false;
      const wantVideo = video && !portrait.matches && state !== 'failed';
      if (wantVideo) { hero.classList.remove('push-on'); if (state === 'idle') queueStart(); }
      else { stopVideo(); hero.classList.add('push-on'); }
      hero.classList.toggle('is-paused', userPaused);
    }
    if (video) {
      video.addEventListener('playing', () => {
        clearTimeout(startTimer); clearTimeout(stallTimer);
        if (state === 'loading') { state = 'playing'; hero.classList.add('is-video'); hero.classList.remove('push-on'); }
        syncPlayback();
      });
      // A stall only counts while the clip is meant to be playing; any sign of life (or a pause) disarms it.
      video.addEventListener('waiting', () => { if (state === 'playing' && !video.paused) { clearTimeout(stallTimer); stallTimer = setTimeout(fail, STALL_MS); } });
      ['canplay', 'seeked', 'pause'].forEach((ev) => video.addEventListener(ev, () => clearTimeout(stallTimer)));
      video.addEventListener('error', () => { if (state !== 'idle') fail(); });
      if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { visible = e.isIntersecting; syncPlayback(); }, { threshold: 0.1 }).observe(hero);
      document.addEventListener('visibilitychange', syncPlayback);
    }
    listen(reduce, () => { if (reduce.matches) state = state === 'failed' ? 'failed' : 'idle'; render(); });
    listen(portrait, render);
    pause.addEventListener('click', () => {
      userPaused = pause.getAttribute('aria-pressed') !== 'true';
      pause.setAttribute('aria-pressed', String(userPaused));
      pause.querySelector('.pause-txt').textContent = userPaused ? 'Play motion' : 'Pause motion';
      hero.classList.toggle('is-paused', userPaused);
      if (state === 'playing') syncPlayback();
      else if (!userPaused) render();      // the clip had not started yet because the visitor paused first
    });
    render();
  }
})();
