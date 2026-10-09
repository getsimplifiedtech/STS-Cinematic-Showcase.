/* Jade & Ember — the cinematic hero (Home only). Unchanged from the single-page build; moved verbatim into its own file so the other
   pages do not download it. The page is complete without this file. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);

  /* Hero motion. Order of preference: the cinematic loop (<video>, muted, over the poster), then one slow push on the still,
     then the still alone. A visible Pause control is always offered while anything is moving (WCAG 2.2.2). */
  const hero = $('[data-ambient-root]');
  const pause = $('.pause');
  const video = $('.hero-video');
  if (hero && pause) {
    const mq = (q) => window.matchMedia(q);
    const listen = (m, f) => (m.addEventListener ? m.addEventListener('change', f) : m.addListener(f));
    const reduce = mq('(prefers-reduced-motion: reduce)');
    const wide = mq('(min-width: 960px)');   // the clip is for desktop widths only, whatever the device or its orientation
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
      if (state !== 'idle' || userPaused || !video || stillOnly() || !wide.matches) return;
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
      const wantVideo = video && wide.matches && state !== 'failed';
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
    listen(wide, render);
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
