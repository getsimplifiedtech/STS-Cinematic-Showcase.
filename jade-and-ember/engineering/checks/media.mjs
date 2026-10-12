// check:media (ENG-046, ENG-047, ENG-062, ENG-063, ENG-096, ENG-045). Every media file and reference of the delivered site:
//   formats      the bytes are what the extension says (WebP, WebM VP9, MP4 H.264, WOFF2); no orphan files, no unreferenced references
//   dimensions   the real pixel size of every image matches its width and height attributes and the configuration; video size, duration
//                and tracks (silent) match the configuration
//   alt text     every image has alt; meaningful alt is a real sentence, not a file name or "image of"; decorative images have empty alt
//   loading      one fetchpriority=high image per page and never lazy; every other image lazy; preload only the fonts and the priority image
//   video        muted, looping, inline, no autoplay or controls, hidden from assistive technology and the tab order, not preloaded
//   provenance   every file in media/ has a row in PROVENANCE.md, and the file states rights (audit finding m-8)
//   rights       (Gate 5 Phase 5) engineering/media-rights-inventory.json covers every image, video and font, matches their bytes, marks nothing verified
//                without a recorded rights-verification approval, never calls generated media licensed, and for fonts finds the licence text and a
//                copyright notice that agrees with the one inside the font file
//   motion       (browser) reduced motion, Save-Data and a 2g connection load no video and run no animation; every page that moves
//                offers a Pause control; Pause stops the motion; video loads only at the widths and states where it is meant to
// Failures are reconciled with engineering/findings.json.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { reconcile } from '../lib/findings.mjs';
import { readMp4, readWebm, readWebp, sniff } from '../lib/media.mjs';
import { ffmpegAvailable, flashStats } from '../lib/flash.mjs';
import { withSite } from '../lib/runtime.mjs';
import { assembleCandidate, pagesOf } from '../lib/site.mjs';
import { engDir, isMain, listFiles, projectDir, readJson, repoRoot } from '../lib/git.mjs';
import { selector, stylesheet } from '../lib/project.mjs';
import { industry } from '../lib/industry.mjs';
import { mediaRightsProblems } from '../lib/media-rights.mjs';
import { standingRightsRecords } from '../lib/records.mjs';
import { rmSync } from 'node:fs';

const attr = (tag, name) => { const m = new RegExp(`(?:^|\\s)${name}(?:="([^"]*)")?(?=[\\s>/])`).exec(tag); return m ? (m[1] ?? '') : null; };

export function checkMediaStatic(root, cfgRoot = projectDir) {
  const measured = [];
  const bad = (rule, who, detail) => measured.push({ key: `media:${rule}:${who}`, detail });
  const declared = industry ? industry.declaredMedia(cfgRoot) : { images: [], video: null };   // what the project's configuration says about its media (the industry adapter reads it)
  const files = listFiles(join(root, 'media')).filter((f) => f !== 'PROVENANCE.md');
  const referenced = new Set();
  const dims = {};   // intrinsic image sizes
  for (const f of files) {
    const buf = readFileSync(join(root, 'media', f));
    const kind = sniff(buf);
    const ext = f.split('.').pop();
    if ((ext === 'webp' && kind !== 'webp') || (ext === 'webm' && kind !== 'ebml') || (ext === 'mp4' && kind !== 'mp4')) bad('format', f, `media/${f} is not a real .${ext} file (the bytes are ${kind})`);
    if (ext === 'webp') { const w = readWebp(buf); if (!w) bad('format', f, `media/${f} cannot be read as WebP`); else { dims[f] = w; if (w.animated) bad('animated-image', f, `media/${f} is an animated image`); } }
  }
  for (const f of listFiles(join(root, 'fonts')).filter((x) => x.endsWith('.woff2'))) if (sniff(readFileSync(join(root, 'fonts', f))) !== 'woff2') bad('format', f, `fonts/${f} is not a real WOFF2 file`);

  // pages
  for (const file of pagesOf(root)) {
    const html = readFileSync(join(root, file), 'utf8');
    const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
    const high = imgs.filter((t) => attr(t, 'fetchpriority') === 'high');
    if (high.length > 1) bad('priority', file, `${file} has ${high.length} fetchpriority=high images (one is the limit)`);
    for (const t of imgs) {
      const src = attr(t, 'src'), alt = attr(t, 'alt'), w = Number(attr(t, 'width')), h = Number(attr(t, 'height'));
      const name = `${file}:${src}`;
      referenced.add(src.replace(/^media\//, ''));
      if (alt === null) bad('alt-missing', name, `${name} has no alt attribute`);
      else if (alt !== '') {
        if (alt.length < 15) bad('alt-short', name, `${name} alt text is only ${alt.length} characters ("${alt}")`);
        if (/\.(webp|jpe?g|png)\b|^(image|picture|photo|graphic) of\b|^img[_-]?\d*/i.test(alt)) bad('alt-filename', name, `${name} alt text looks like a file name or starts with "image of": "${alt.slice(0, 40)}"`);
        if (alt.length > 250) bad('alt-long', name, `${name} alt text is ${alt.length} characters (250 is the limit; use a caption for more)`);
      }
      if (!w || !h) bad('dimensions-missing', name, `${name} needs width and height attributes (they reserve space and prevent layout shift)`);
      const real = dims[src.replace(/^media\//, '')];
      if (real && w && h) {
        if (Math.abs(real.width / real.height - w / h) > 0.01) bad('dimensions-ratio', name, `${name} attributes ${w}x${h} do not match the file's ${real.width}x${real.height} proportions`);
        if (real.width < w) bad('dimensions-upscaled', name, `${name} is declared ${w} px wide but the file is only ${real.width} px`);
      }
      const high1 = attr(t, 'fetchpriority') === 'high', lazy = attr(t, 'loading') === 'lazy';
      if (high1 && lazy) bad('lcp-lazy', name, `${name} is the priority image and must not be lazy`);
      if (!high1 && !lazy) bad('not-lazy', name, `${name} is not the priority image and should be loading="lazy"`);
      if (attr(t, 'decoding') !== 'async') bad('decoding', name, `${name} should use decoding="async"`);
      if (alt === '' && attr(t, 'role') !== 'presentation' && attr(t, 'aria-hidden') !== 'true') { /* alt="" is enough to hide a decorative image */ }
    }
    // Preload: the two web fonts, and the priority (LCP) image, which may be art-directed: one desktop and one phone image, each with a media query.
    const priority = new Set([...imgs.filter((t) => attr(t, 'fetchpriority') === 'high').map((t) => attr(t, 'src'))]);
    const preloadedImages = [];
    for (const m of html.matchAll(/<link[^>]+rel="preload"[^>]*>/g)) {
      const as = attr(m[0], 'as'), href = attr(m[0], 'href');
      if (href && href.startsWith('media/')) referenced.add(href.slice(6));
      if (as === 'image') preloadedImages.push({ href, media: attr(m[0], 'media') });
      else if (as !== 'font') bad('preload', file, `${file} preloads something that is neither a font nor the priority image: ${m[0].slice(0, 60)}`);
    }
    if (preloadedImages.length > 2) bad('preload', file, `${file} preloads ${preloadedImages.length} images (the priority image and its phone variant are the limit)`);
    if (preloadedImages.length === 2 && preloadedImages.some((p) => !p.media)) bad('preload', file, `${file} preloads two images without media queries, so both download everywhere`);
    if (preloadedImages.length && !preloadedImages.some((p) => priority.has(p.href))) bad('preload', file, `${file} preloads an image that is not its priority image`);
    for (const m of html.matchAll(/<source\b[^>]*>/g)) for (const part of (attr(m[0], 'srcset') || '').split(',')) { const u = part.trim().split(/\s+/)[0]; if (u) referenced.add(u.replace(/^media\//, '')); }
    for (const m of html.matchAll(/<video\b[^>]*>/g)) {
      const t = m[0];
      for (const need of ['muted', 'loop', 'playsinline', 'aria-hidden']) if (attr(t, need) === null) bad('video-attr', `${file}:${need}`, `${file}: the hero video needs ${need}`);
      for (const forbid of ['autoplay', 'controls']) if (attr(t, forbid) !== null) bad('video-attr', `${file}:${forbid}`, `${file}: the hero video must not have ${forbid} (it starts from script, only where allowed, and has its own Pause control)`);
      if (attr(t, 'aria-hidden') !== 'true') bad('video-hidden', file, `${file}: the decorative video must be aria-hidden="true"`);
      if (attr(t, 'tabindex') !== '-1') bad('video-tabindex', file, `${file}: the decorative video must have tabindex="-1"`);
      if (attr(t, 'preload') !== 'none') bad('video-preload', file, `${file}: the video must be preload="none" so it does not compete with first paint`);
      for (const k of ['data-webm', 'data-mp4']) { const v = attr(t, k); if (v) referenced.add(v.replace(/^media\//, '')); }
    }
  }
  // CSS references
  for (const m of readFileSync(join(root, stylesheet), 'utf8').matchAll(/url\(([^)]+)\)/g)) { const u = m[1].replace(/^['"]|['"]$/g, ''); if (u.startsWith('media/')) referenced.add(u.slice(6)); }
  for (const f of files) if (!referenced.has(f)) bad('orphan', f, `media/${f} is not used by any page or stylesheet`);
  for (const r of referenced) if (!files.includes(r)) bad('missing', r, `a page references media/${r}, which is not delivered`);

  // configuration against the files
  const cfgDims = declared.images;
  for (const [src, w, hh] of cfgDims) { const real = dims[src.replace(/^media\//, '')]; if (real && (real.width !== w || real.height !== hh)) bad('config-dimensions', src, `config says ${src} is ${w}x${hh}; the file is ${real.width}x${real.height}`); }

  // video files
  const v = declared.video;
  if (v) {
    const webm = readWebm(readFileSync(join(root, v.webm))), mp4 = readMp4(readFileSync(join(root, v.mp4)));
    if (!webm) bad('video-format', v.webm, `${v.webm} cannot be read as WebM`);
    else {
      const vt = webm.tracks.filter((t) => t.type === 'vide'), at = webm.tracks.filter((t) => t.type === 'soun');
      if (webm.doctype !== 'webm') bad('video-format', v.webm, `${v.webm} doctype is "${webm.doctype}", not webm`);
      if (vt.length !== 1 || at.length) bad('video-tracks', v.webm, `${v.webm} must have exactly one video track and no audio (it has ${vt.length} video, ${at.length} audio)`);
      if (vt[0] && vt[0].codec !== 'V_VP9') bad('video-codec', v.webm, `${v.webm} codec is ${vt[0].codec}, expected V_VP9`);
      if (vt[0] && (vt[0].width !== v.width || vt[0].height !== v.height)) bad('video-dimensions', v.webm, `${v.webm} is ${vt[0].width}x${vt[0].height}; config says ${v.width}x${v.height}`);
      if (webm.duration !== null && Math.abs(webm.duration - v.loopSeconds) > 0.25) bad('video-duration', v.webm, `${v.webm} lasts ${webm.duration.toFixed(2)} s; config says ${v.loopSeconds} s`);
    }
    if (!mp4) bad('video-format', v.mp4, `${v.mp4} cannot be read as MP4`);
    else {
      const vt = mp4.tracks.filter((t) => t.type === 'vide'), at = mp4.tracks.filter((t) => t.type === 'soun');
      if (vt.length !== 1 || at.length) bad('video-tracks', v.mp4, `${v.mp4} must have exactly one video track and no audio (it has ${vt.length} video, ${at.length} audio)`);
      if (vt[0] && vt[0].codec !== 'avc1') bad('video-codec', v.mp4, `${v.mp4} codec is ${vt[0].codec}, expected avc1 (H.264)`);
      if (vt[0] && (vt[0].width !== v.width || vt[0].height !== v.height)) bad('video-dimensions', v.mp4, `${v.mp4} is ${vt[0].width}x${vt[0].height}; config says ${v.width}x${v.height}`);
      if (mp4.duration !== null && Math.abs(mp4.duration - v.loopSeconds) > 0.25) bad('video-duration', v.mp4, `${v.mp4} lasts ${mp4.duration.toFixed(2)} s; config says ${v.loopSeconds} s`);
    }

  }

  // provenance and rights
  const prov = readFileSync(join(root, 'media', 'PROVENANCE.md'), 'utf8');
  for (const f of files) if (!prov.includes(f)) bad('provenance-row', f, `media/${f} has no entry in media/PROVENANCE.md`);
  if (!/\b(licen[cs]e|rights|copyright|terms of use)\b/i.test(prov)) bad('provenance-rights', 'PROVENANCE.md', 'media/PROVENANCE.md states no licence or rights terms for the generated media (audit finding m-8)');
  // rights inventory (Gate 5 Phase 5): nothing here asserts a right; it checks that the record of what is and is not established is complete and true to the files
  try {
    const inventory = readJson(join(engDir, 'media-rights-inventory.json'));
    const licenceText = existsSync(join(root, 'fonts', 'LICENSES.txt')) ? readFileSync(join(root, 'fonts', 'LICENSES.txt'), 'utf8') : null;
    if (licenceText === null) bad('rights-inventory', 'fonts/LICENSES.txt', 'fonts/LICENSES.txt is missing: the fonts must travel with their licence text');
    const r = mediaRightsProblems({ inventory, root, approvals: standingRightsRecords(), licenceText });
    for (const p of r.problems) bad('rights-inventory', p.key, p.detail);
    for (const n of r.notices) bad('font-notice', n.family, n.detail);
  } catch (e) { bad('rights-inventory', 'inventory', `the media rights inventory cannot be read (${e.message})`); }
  return { measured, stats: { files: files.length, videos: 2, pages: pagesOf(root).length } };
}

// reduced motion and friends, in the browser
export async function checkMediaBrowser({ root = null, browserName = 'chromium', pages: only = null } = {}) {
  const measured = [];
  let checks = 0;
  await withSite(async ({ pages, browser, base, env }) => {
    const ctxBase = { locale: env.context.locale, timezoneId: env.context.timezoneId, colorScheme: 'light', deviceScaleFactor: 1 };
    const run = async (name, opts, init, file, settleMs = 2500) => {
      const ctx = await browser.newContext({ ...ctxBase, ...opts });
      const page = await ctx.newPage();
      const media = [];
      page.on('request', (r) => { if (/\.(webm|mp4)(\?|$)/.test(r.url())) media.push(new URL(r.url()).pathname); });
      if (init) await page.addInitScript(init);
      await page.goto(base + file); await page.waitForTimeout(settleMs);
      const state = await page.evaluate((pauseSelector) => {
        const long = document.getAnimations().filter((a) => { const t = a.effect?.getComputedTiming?.(); return a.playState === 'running' && t && (t.iterations === Infinity || t.endTime > 5000); });
        const running = document.getAnimations().filter((a) => a.playState === 'running');
        const vids = [...document.querySelectorAll('video')].map((v) => ({ paused: v.paused, sources: v.querySelectorAll('source').length + (v.getAttribute('src') ? 1 : 0) }));
        const pause = document.querySelector(pauseSelector);
        return { running: running.length, long: long.length, vids, pauseVisible: !!pause && pause.checkVisibility({ checkVisibilityCSS: true }), scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior, playingVideo: vids.some((v) => !v.paused) };
      }, selector('pauseControl'));
      checks++;
      return { ctx, page, media, state, name };
    };
    const still = async (name, opts, init) => {
      await Promise.all(pages.map(async (file) => {
        const r = await run(name, opts, init, file, 1500);
        const bad = (rule, detail) => measured.push({ key: `media:motion:${file}@${name}:${rule}`, detail: `${file} (${name}): ${detail}` });
        if (r.media.length) bad('video-requested', `a video was requested (${r.media.join(', ')}) although motion must be off`);
        if (r.state.running) bad('animation-running', `${r.state.running} animation(s) are running although motion must be off`);
        if (r.state.vids.some((v) => v.sources || !v.paused)) bad('video-loaded', 'the video has sources or is playing');
        await r.ctx.close();
      }));
    };
    await still('reduced-motion', { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await still('save-data', { viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' }, () => Object.defineProperty(navigator, 'connection', { value: { saveData: true, effectiveType: '4g' } }));
    await still('2g', { viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' }, () => Object.defineProperty(navigator, 'connection', { value: { saveData: false, effectiveType: '2g' } }));
    // reduced motion also means no smooth scrolling
    { const r = await run('reduced-motion', { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' }, null, pages[0], 300); if (r.state.scrollBehavior === 'smooth') measured.push({ key: 'media:motion:smooth-scroll', detail: 'smooth scrolling is on although reduced motion is requested' }); await r.ctx.close(); }
    // normal motion: video only where it is meant to play; moving things are pausable and Pause works
    for (const [name, vp] of [['phone-390', { width: 390, height: 844, isMobile: true, hasTouch: true }], ['tablet-820', { width: 820, height: 1180 }], ['desktop-1440', { width: 1440, height: 900 }]]) {
      await Promise.all(pages.map(async (file) => {
        const r = await run(name, { viewport: vp, reducedMotion: 'no-preference' }, null, file);
        const bad = (rule, detail) => measured.push({ key: `media:motion:${file}@${name}:${rule}`, detail: `${file} (${name}): ${detail}` });
        if (vp.width < 960 && r.media.length) bad('video-too-narrow', `a video was requested at ${vp.width} px; it is for 960 px and wider only`);
        if ((r.state.long || r.state.playingVideo) && !r.state.pauseVisible) bad('no-pause', 'something moves for more than 5 seconds and there is no visible Pause control (2.2.2)');
        if ((r.state.long || r.state.playingVideo) && r.state.pauseVisible) {
          await r.page.click(selector('pauseControl')); await r.page.waitForTimeout(500);
          const after = await r.page.evaluate(() => ({ running: document.getAnimations().filter((a) => a.playState === 'running').length, playing: [...document.querySelectorAll('video')].some((v) => !v.paused) }));
          if (after.running || after.playing) bad('pause-ineffective', `Pause leaves ${after.running} animation(s) running and video ${after.playing ? 'playing' : 'stopped'}`);
        }
        if (r.state.vids.length && file !== 'index.html') bad('video-off-home', 'a video element appears on a page other than Home');
        await r.ctx.close();
      }));
    }
  }, { root, browserName, pages: only });
  return { measured, checks };
}

export async function checkMedia({ root = null, browser = true, browserName = 'chromium', pages = null } = {}) {
  const own = !root;
  const dir = root || assembleCandidate(projectDir, 'media');
  try {
    const s = checkMediaStatic(dir);
    const notes = [`static: ${s.stats.files} media files and ${s.stats.pages} pages checked (format, dimensions, alt text, loading, video attributes, provenance); video container, codec, size, duration and silence read from the files`];
    let measured = s.measured;
    // flashing (2.3.1): every video file, when ffmpeg is on the machine
    if (ffmpegAvailable()) {
      const copy = industry ? industry.declaredMedia(projectDir).video : null;
      for (const f of copy ? [copy.webm, copy.mp4] : []) {
        const st = flashStats(join(dir, f));
        if (!st.ok) measured.push({ key: `media:flash:${f}`, detail: `${f} has up to ${st.maxPerSecond} large luminance reversals in one second (${st.worst}); the limit is 3 (2.3.1)` });
        notes.push(`flash proxy: ${f} ${st.frames} frames, at most ${st.maxPerSecond} reversal(s) per second`);
      }
    } else notes.push('flash proxy skipped: ffmpeg is not installed (it remains a manual check, see QA.md)');
    if (browser) {
      const b = await checkMediaBrowser({ root: dir, browserName, pages });
      measured = measured.concat(b.measured);
      notes.push(`browser: ${b.checks} page loads in reduced-motion, Save-Data, 2g, phone, tablet and desktop states (video requests, running animations, Pause)`);
    } else notes.push('browser part skipped (no browser in this tier)');
    const r = reconcile('media', measured);
    return { problems: r.problems, notes: [...notes, ...r.notes] };
  } finally { if (own) rmSync(dir, { recursive: true, force: true }); }
}

if (isMain(import.meta.url)) {
  const t0 = Date.now();
  const { problems, notes } = await checkMedia({ browser: !process.argv.includes('--static') });
  notes.forEach((n) => console.log('  ' + n));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:media (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  process.exit(problems.length ? 1 : 0);
}
