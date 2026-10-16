// The Breath: scroll controller. One progress value p (0..1) along a pinned track drives everything: the four typographic beats (real DOM),
// the "weather" the steam solver reacts to, and the dish reveal. Nothing is scripted by time except the fluid itself, so every position is
// reachable in both directions. The Kling clip plays normally underneath; it is never scrubbed.
import { loadImage } from './gl.js';
import { createSteam } from './steam.js';

const $ = (s, r = document) => r.querySelector(s);
const root = document.documentElement, section = $('[data-breath]'), stage = $('[data-stage]'), canvas = $('.steam'), video = $('.flame'), poster = $('.poster');
const pauseBtn = $('.pause'), beats = [...document.querySelectorAll('.beat')];
const q = new URLSearchParams(location.search);
const mq = (s) => matchMedia(s), listen = (m, f) => (m.addEventListener ? m.addEventListener('change', f) : m.addListener(f));
const reduce = mq('(prefers-reduced-motion: reduce)'), wide = mq('(min-width: 960px)'), phone = mq('(max-aspect-ratio: 1/1) and (max-width: 959px)');
const conn = navigator.connection || {};
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const key = (p, k) => { if (p <= k[0][0]) return k[0][1]; for (let i = 1; i < k.length; i++) if (p <= k[i][0]) { const [a, va] = k[i - 1], [b, vb] = k[i]; return va + (vb - va) * ((p - a) / (b - a)); } return k[k.length - 1][1]; };
const stillOnly = () => reduce.matches || conn.saveData === true || /^(slow-2g|2g)$/.test(conn.effectiveType || '') || q.get('mode') === 'calm' || q.get('saveData') === '1';

// ---------------------------------------------------------------- the choreography (weather as a function of progress)
// p: 0 hero · .105 Fire · .295 Steam · .48 Texture · .665 The plate. All values are linearly interpolated, then eased in time by the caller.
const TL = {
  emit: [[0, .38], [.10, .46], [.28, .66], [.50, 1], [.66, .85], [.76, .4], [.9, .2], [1, .16]],
  spread: [[0, 0], [.28, .04], [.34, .3], [.42, .9], [.46, 1], [.62, 1], [.70, .55], [.80, .1], [1, 0]],
  clear: [[0, 0], [.60, 0], [.64, .04], [.78, .85], [.84, 1], [1, 1.15]],
  haze: [[0, 1], [.80, 1], [.93, .42], [1, .3]],
  glow: [[0, .55], [.10, .85], [.28, 1], [.46, .6], [.62, .35], [.80, .25], [1, .25]],
  detail: [[0, .3], [.3, .5], [.5, 1], [.64, 1], [.8, .6], [1, .4]],
};
const stageVars = (p) => ({
  dark: key(p, [[0, 1], [.1, .8], [.5, .62], [.8, .5], [1, .38]]),
  push: key(p, [[0, 0], [.08, 0], [.5, 1], [.66, 1], [1, .35]]),
  steam: smooth(.2, .36, p) * (1 - smooth(.6, .72, p)),
  dish: smooth(.62, .76, p),
});

// ---------------------------------------------------------------- state
let mode = 'nojs', userPaused = false, glFailed = false, bailed = false, steam = null, steamPending = null, inView = true;
let scrollRaf = 0, top = 0, travel = 1, p = 0, lastP = 0, raf = 0, last = 0, parkedAt = 0, catchup = 0, labMode = q.has('lab');
const target = {}, cur = {}, cache = new WeakMap(), stats = { frames: 0, raf: 0, ms: [], cpu: [], bails: 0, slow: 0, drawn: 0, parkedFrames: 0 };
const setTargets = (pp) => { for (const k in TL) target[k] = key(pp, TL[k]); target.dishLight = 1; };
setTargets(0); Object.assign(cur, target);

// ---------------------------------------------------------------- measure
function measure() {
  const r = section.getBoundingClientRect();
  top = r.top + scrollY; travel = Math.max(1, section.offsetHeight - stage.clientHeight);
}
const progress = () => clamp((scrollY - top) / travel);

// ---------------------------------------------------------------- placement of the steam source and the dish in stage uv (y up)
const SRC = { desk: [0.50, 0.58], phone: [0.55, 0.62] };   // measured on the posters: where the vapour leaves the wok (image uv, y down)
function layout() {
  if (!steam) return;
  const sw = stage.clientWidth, sh = stage.clientHeight, ph = phone.matches;
  const [iw, ih] = ph ? [810, 1440] : [1920, 1080];
  const [fx, fy] = (getComputedStyle(poster).objectPosition || '50% 50%').split(' ').map((v) => parseFloat(v) / 100);
  const s = Math.max(sw / iw, sh / ih), rw = iw * s, rh = ih * s, ox = (rw - sw) * (fx ?? .5), oy = (rh - sh) * (fy ?? .5);
  const [u, v] = ph ? SRC.phone : SRC.desk;
  steam.L.src = [(u * rw - ox) / sw, 1 - (v * rh - oy) / sh];
  // the dish: the plate (72% of the photograph's width) sits where the wok was, right of the type
  const plateW = ph ? .96 * sw : Math.min(.6 * sw, 1.18 * sh * 1.2), imgW = plateW / .72, imgH = imgW * 800 / 1200;
  const c = ph ? [.5, .40] : [.64, .5], ex = imgW / sw, ey = imgH / sh;
  steam.L.dishRect = [c[0] + .01 * ex, c[1] - .03 * ey, ex, ey];
  steam.L.dc = c; steam.L.shade = ph ? [0, 1] : [1, 0];
  stage.style.setProperty('--ox', (steam.L.src[0] * 100).toFixed(2) + '%'); stage.style.setProperty('--oy', ((1 - steam.L.src[1]) * 100).toFixed(2) + '%');
  const a = sw / sh; steam.L.aspect = a;
  steam.L.reach = Math.max(Math.hypot(c[0] * a, c[1]), Math.hypot((1 - c[0]) * a, c[1]), Math.hypot(c[0] * a, 1 - c[1]), Math.hypot((1 - c[0]) * a, 1 - c[1]));
}

// ---------------------------------------------------------------- DOM beats: all text is real, ordered DOM; only opacity and a transform change
function applyDom(pp, force) {
  for (const el of beats) {
    const from = +el.dataset.from, to = +el.dataset.to;
    const inn = from <= 0 ? 1 : smooth(from, from + .03, pp), out = to > 1 ? 0 : smooth(to, to + .02, pp);
    const c = cache.get(el);
    if (force || !c || c[0] !== inn || c[1] !== out) {
      el.style.setProperty('--in', inn.toFixed(3)); el.style.setProperty('--out', out.toFixed(3));
      el.classList.toggle('off', inn <= 0 || out >= 1); cache.set(el, [inn, out]);
    }
  }
  const sv = stageVars(pp);
  const c = cache.get(stage);
  const sig = [sv.dark, sv.push, sv.steam, sv.dish].map((x) => x.toFixed(3)).join();
  if (force || c !== sig) {
    stage.style.setProperty('--dark', sv.dark.toFixed(3)); stage.style.setProperty('--push', sv.push.toFixed(3));
    stage.style.setProperty('--steam', sv.steam.toFixed(3)); stage.style.setProperty('--dish', sv.dish.toFixed(3));
    cache.set(stage, sig);
  }
}

// ---------------------------------------------------------------- flame light (video luminance) for the steam to pick up
const probe = document.createElement('canvas'); probe.width = 24; probe.height = 14;
const pctx = probe.getContext('2d', { willReadFrequently: true });
let flick = .5, lo = 1, hi = 0, probeAt = 0, lum = 0;
function readFlicker(now) {
  const playing = stage.classList.contains('is-video') && !video.paused;
  if (playing && now - probeAt > 120) {
    probeAt = now;
    try { pctx.drawImage(video, 0, 0, 24, 14); const d = pctx.getImageData(0, 0, 24, 14).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] * .5 + d[i + 1] * .35 + d[i + 2] * .15; lum = s / (d.length / 4) / 255; lo = Math.min(lum, lo + .0004); hi = Math.max(lum, hi - .0004); } catch (e) { /* tainted or not ready: keep the last value */ }
  }
  const raw = playing ? clamp((lum - lo) / Math.max(.04, hi - lo)) : .5 + .16 * Math.sin(now * .0011) * Math.sin(now * .00037 + 1);   // a still poster gets a slow ember breath instead
  flick += (raw - flick) * .2;
  return flick;
}

// ---------------------------------------------------------------- the frame
const relaxRate = { emit: 3.2, spread: 2.4, glow: 3, detail: 2.6, clear: 6, haze: 3, dishLight: 3 };
function relax(dt) { for (const k in target) cur[k] += (target[k] - cur[k]) * (1 - Math.exp(-dt * (relaxRate[k] || 3))); }
function frame(now) {
  raf = requestAnimationFrame(frame);
  const dtReal = Math.min(.05, (now - last) / 1000); const gap = now - last; last = now;
  if (gap < 250) { stats.ms.push(gap); if (stats.ms.length > 360) stats.ms.shift(); }
  const t0 = performance.now();
  p = progress();
  if (Math.abs(p - lastP) > .12) catchup = Math.max(catchup, 120);   // a jump (anchor, scrollbar drag, reload mid-way): let the fluid catch up quickly
  lastP = p;
  applyDom(p);
  setTargets(p); relax(dtReal);
  Object.assign(steam.P, cur, { flick: readFlicker(now) });
  if (catchup > 0) { const n = Math.min(catchup, 10); steam.warm(n); catchup -= n; }
  steam.frame(dtReal);
  stats.frames++; stats.cpu.push(performance.now() - t0); if (stats.cpu.length > 360) stats.cpu.shift();
  syncVideoForDish();
  if (!q.has('perf') || q.get('perf') !== 'off') adapt(gap);
}
// Adaptive load: first shrink the canvas, then the pressure solver, and only if the frame is still slow, hand over to the calm layout.
let emaMs = 16.7, adaptN = 0;
function adapt(gap) {
  if (gap > 250) return;
  emaMs = emaMs * .9 + gap * .1; if (++adaptN % 30) return;
  if (emaMs > 30) {
    if (steam.scale > .55) { steam.setScale(steam.scale * .85); }
    else if (steam.jacobi > 8) steam.setJacobi(steam.jacobi - 3);
    else if (++stats.slow >= 3) { stats.bails++; bailed = true; applyMode(); }
  } else if (emaMs < 18 && steam.scale < 1 && adaptN % 120 === 0) steam.setScale(Math.min(1, steam.scale * 1.08));
}

// ---------------------------------------------------------------- run / park: the loop exists only while it can be seen
function shouldRun() { return mode === 'live' && !!steam && inView && !document.hidden && !labMode; }
function sync() {
  const run = shouldRun();
  if (run && !raf) { last = performance.now(); if (now_gap()) catchup = Math.max(catchup, 90); raf = requestAnimationFrame(frame); }
  else if (!run && raf) { cancelAnimationFrame(raf); raf = 0; parkedAt = performance.now(); }
  syncVideo();
}
const now_gap = () => parkedAt && performance.now() - parkedAt > 1500;

// ---------------------------------------------------------------- the Kling clip: same protections as the production hero (idle start, 960px gate, Save-Data, startup and stall fallbacks, Pause)
let vState = 'idle', vStart = 0, vStall = 0, vQueued = false;
const dishCovered = () => cur.clear > 1.0;
function syncVideo() {
  if (vState !== 'playing') return;
  const go = mode === 'live' && !userPaused && inView && !document.hidden && !dishCovered();
  if (go && video.paused) { const pr = video.play(); if (pr && pr.catch) pr.catch(vFail); }
  else if (!go && !video.paused) video.pause();
}
function syncVideoForDish() { if (vState === 'playing') { const cov = dishCovered(); if (cov !== !!syncVideoForDish.cov) { syncVideoForDish.cov = cov; syncVideo(); } } }
function stopVideo() {
  clearTimeout(vStart); clearTimeout(vStall);
  video.pause(); video.querySelectorAll('source').forEach((n) => n.remove());
  if (video.getAttribute('src')) video.removeAttribute('src');
  if (vState !== 'idle') video.load();
  stage.classList.remove('is-video'); if (vState !== 'failed') vState = 'idle';
}
function vFail() { vState = 'failed'; stopVideo(); }
function startVideo() {
  vQueued = false;
  if (vState !== 'idle' || mode !== 'live' || stillOnly() || !wide.matches || q.get('video') === 'off') return;
  vState = 'loading'; let bad = 0;
  const add = (src, type) => { const n = document.createElement('source'); n.src = src; n.type = type; n.addEventListener('error', () => { if (++bad >= video.querySelectorAll('source').length) vFail(); }); video.appendChild(n); };
  if (video.canPlayType('video/webm; codecs="vp9"')) add(video.dataset.webm, 'video/webm; codecs="vp9"');
  if (video.canPlayType('video/mp4; codecs="avc1.640020"') || video.canPlayType('video/mp4')) add(video.dataset.mp4, 'video/mp4');
  if (!video.querySelector('source')) return vFail();
  video.preload = 'auto'; vStart = setTimeout(vFail, 6000); video.load();
  const pr = video.play(); if (pr && pr.catch) pr.catch(vFail);
}
function queueVideo() {
  if (vQueued || vState !== 'idle') return; vQueued = true;
  const go = () => ('requestIdleCallback' in window ? requestIdleCallback(startVideo, { timeout: 2000 }) : setTimeout(startVideo, 300));
  document.readyState === 'complete' ? go() : addEventListener('load', go, { once: true });
}
video.addEventListener('playing', () => { clearTimeout(vStart); clearTimeout(vStall); if (vState === 'loading') { vState = 'playing'; stage.classList.add('is-video'); } syncVideo(); });
video.addEventListener('waiting', () => { if (vState === 'playing' && !video.paused) { clearTimeout(vStall); vStall = setTimeout(vFail, 3000); } });
['canplay', 'seeked', 'pause'].forEach((ev) => video.addEventListener(ev, () => clearTimeout(vStall)));
video.addEventListener('error', () => { if (vState !== 'idle') vFail(); });

// ---------------------------------------------------------------- mode: live (WebGL2 sequence) or calm (stills, opacity only)
function wantCalm() { return stillOnly() || userPaused || glFailed || bailed || q.get('mode') === 'calm'; }
async function ensureSteam() {
  if (steam || steamPending || glFailed) return steamPending;
  steamPending = (async () => {
    try {
      const dish = await loadImage('media/dish-charsiu.webp');
      const tier = q.get('quality') || (phone.matches ? 'low' : ((navigator.hardwareConcurrency || 4) >= 8 && (navigator.deviceMemory || 8) >= 8 ? 'high' : 'mid'));
      steam = createSteam({ canvas, dish, tier });
      canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); steam = null; glFailed = true; applyMode(); });
      layout(); setTargets(progress()); Object.assign(cur, target); Object.assign(steam.P, cur); steam.settle();
      catchup = 150;
    } catch (err) { console.warn('The Breath: WebGL2 unavailable, using the calm layout.', err && err.message); glFailed = true; steam = null; }
    steamPending = null; applyMode();
  })();
  return steamPending;
}
function applyMode() {
  const next = wantCalm() ? 'calm' : 'live';
  if (next === 'live' && !steam) { if (!steamPending) ensureSteam(); if (mode === 'nojs') root.classList.add('is-calm'); return; }   // until the solver is ready, the calm layout is a complete page
  if (next !== mode) {
    mode = next; root.classList.toggle('is-live', mode === 'live'); root.classList.toggle('is-calm', mode === 'calm');
    if (mode === 'calm') { stopVideo(); canvas.style.visibility = 'hidden'; } else { canvas.style.visibility = ''; }
  }
  root.classList.toggle('is-calm', mode === 'calm' || (mode === 'nojs'));
  // Pause control: offered whenever the live sequence is possible at all
  const canLive = !stillOnly() && !glFailed && !bailed;
  pauseBtn.hidden = !canLive;
  pauseBtn.setAttribute('aria-pressed', String(userPaused));
  $('.pause-txt', pauseBtn).textContent = userPaused ? 'Play motion' : 'Pause motion';
  if (mode === 'live') queueVideo();
  p = progress(); applyDom(p, true);
  sync();
}
pauseBtn.addEventListener('click', () => { userPaused = !userPaused; applyMode(); });
listen(reduce, () => { if (reduce.matches) stopVideo(); applyMode(); });
listen(wide, () => { if (!wide.matches) stopVideo(); else if (mode === 'live') { vState = vState === 'failed' ? 'failed' : 'idle'; queueVideo(); } });
listen(phone, () => { layout(); catchup = 150; });

// ---------------------------------------------------------------- observers
new IntersectionObserver(([e]) => { inView = e.isIntersecting; sync(); }, { rootMargin: '120px 0px' }).observe(section);
document.addEventListener('visibilitychange', sync);
let rz = 0;
new ResizeObserver(() => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { measure(); if (steam) { steam.relayout(); layout(); } p = progress(); applyDom(p, true); if (mode !== 'live') return; if (labMode) steam.draw(); }); }).observe(stage);
addEventListener('scroll', () => { if (mode !== 'live' || !raf) { cancelAnimationFrame(scrollRaf); scrollRaf = requestAnimationFrame(() => { p = progress(); applyDom(p); }); } }, { passive: true });
// the pointer parts the steam on desktop; touch is never read (no pointer capture, no touch-action override: scrolling is never taken from the visitor)
let pm = null;
addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse' || !steam || !raf) return;
  const r = stage.getBoundingClientRect(); if (e.clientY < r.top || e.clientY > r.bottom) return;
  const x = (e.clientX - r.left) / r.width, y = 1 - (e.clientY - r.top) / r.height, t = performance.now();
  if (pm) { const dt = Math.max(.008, (t - pm[2]) / 1000); steam.stir(x, y, clamp((x - pm[0]) * 160 / dt * .02, -60, 60), clamp((y - pm[1]) * 160 / dt * .02, -60, 60)); }
  pm = [x, y, t];
}, { passive: true });

// ---------------------------------------------------------------- boot
measure(); p = progress(); applyDom(p, true);
document.fonts && document.fonts.ready.then(() => { measure(); p = progress(); applyDom(p, true); });
(() => { const go = () => { applyMode(); }; if (stillOnly()) go(); else if (document.readyState === 'complete') go(); else addEventListener('load', () => setTimeout(go, 0), { once: true }); })();

// ---------------------------------------------------------------- lab hooks: deterministic capture and measurement (no effect on visitors)
const pct = (a, f) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(f * s.length))]; };
window.lab = {
  get mode() { return mode; }, get p() { return p; }, get steam() { return steam; },
  async ready() { applyMode(); if (steamPending) await steamPending; applyMode(); return mode; },
  // jump to progress pp, replay the last stretch of the sequence through the solver, draw one frame
  async seek(pp, { span = .3, steps = 300, scroll = true } = {}) {
    await this.ready();
    if (scroll) { scrollTo(0, top + pp * travel); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); }
    p = progress(); applyDom(p, true);
    if (mode !== 'live' || !steam) return { mode };
    const p0 = Math.max(0, pp - span); setTargets(p0); Object.assign(cur, target); Object.assign(steam.P, cur); steam.settle();
    for (let i = 0; i <= steps; i++) { const pi = p0 + (pp - p0) * (i / steps); setTargets(pi); relax(1 / 60); Object.assign(steam.P, cur, { flick: .5 + .1 * Math.sin(i * .21), dbg: +(q.get('view') === 'dye') + 2 * +(q.get('view') === 'vel') }); steam.warm(1); }
    steam.draw(); return { mode, p: pp };
  },
  stats() {
    const m = stats.ms; const mem = performance.memory ? { usedJSHeapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) } : {};
    return { mode, raf: !!raf, frames: stats.frames, rafMs: { p50: +pct(m, .5).toFixed(1), p95: +pct(m, .95).toFixed(1), n: m.length }, cpuMs: { p50: +pct(stats.cpu, .5).toFixed(2), p95: +pct(stats.cpu, .95).toFixed(2) },
      bails: stats.bails, grids: steam && steam.grids, gpuMB: steam ? +(steam.gpuBytes / 1048576).toFixed(2) : 0, video: vState, inView, hidden: document.hidden, userPaused, glFailed, bailed, ...mem };
  },
  resetStats() { stats.ms.length = 0; stats.cpu.length = 0; stats.frames = 0; },
};
