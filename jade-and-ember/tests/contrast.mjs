// Hero text contrast over the photograph. axe cannot compute this, so we measure it.
//
// For each viewport and for several points in the hero motion (five positions in the video loop where the clip plays,
// three in the 38 s push where it does not), the hero's text is made
// transparent (button fills, borders and scrims stay), the hero is screenshotted, and the pixels behind every
// line of text are compared with the text's computed colour using the WCAG relative-luminance formula.
//
// Gate: at least 99% of the sampled pixels behind each line meet the WCAG ratio (4.5:1, or 3:1 for large text).
// The worst single pixel is reported too, because film grain and sparks make a strict min-pixel gate meaningless.
// Run: npm run test:contrast   (set CHROMIUM_PATH to use an installed Chromium; VERBOSE=1 lists every line)
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const { server, base } = serve();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

const viewports = [
  [1920, 1080], [1440, 900], [1280, 720], [1024, 768], [960, 700],
  [820, 1180], [768, 1024], [430, 932], [414, 896], [390, 844], [360, 740], [320, 640],
  [844, 390], [667, 375],
];
const pushPhases = [['start', '0s'], ['middle', '-19s'], ['end', '-37.9s']];
const videoPhases = [['0%', 0], ['25%', 0.25], ['50%', 0.5], ['75%', 0.75], ['100%', 0.999]];
const selectors = ['.eyebrow', '#hero-title span:nth-child(1)', '#hero-title span:nth-child(2)', '.hero-text', '.hero-actions a', '.hero-caption', '.pause-txt', '.pause-ico'];
const GATE = 0.99;
const modes = { video: 0, push: 0 };
let failures = 0, rows = 0, worst = { ratio: 99, where: '' }, lowestP1 = { ratio: 99, where: '' };

for (const [w, h] of viewports) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 900, hasTouch: w < 900 });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.waitForTimeout(600);
  // Where the page plays the clip (desktop and landscape) measure the video frames; elsewhere the poster with its push.
  const hasVideo = await page.waitForSelector('.hero.is-video', { timeout: 6000 }).then(() => true, () => false);
  const mode = hasVideo ? 'video' : 'push';
  if (hasVideo) {
    await page.click('.pause');   // freeze the clip so frames can be set exactly
    await page.evaluate(() => { document.querySelector('.hero-video').pause(); });
  } else {
    await page.addStyleTag({ content: '.hero-media img{animation-play-state:paused!important}' });
  }
  const phases = hasVideo ? videoPhases : pushPhases;
  // intended text colours and sizes, read before the transparent override is applied
  const meta = await page.evaluate((sels) => sels.flatMap((sel) => [...document.querySelectorAll(sel)].map((el, idx) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || el.hidden || el.getBoundingClientRect().width < 2) return null;
    el.setAttribute('data-ct', `${sel}#${idx}`);
    const m = cs.color.match(/[\d.]+/g).map(Number);
    return { key: `${sel}#${idx}`, sel, rgb: m.slice(0, 3), fs: parseFloat(cs.fontSize), fw: parseInt(cs.fontWeight, 10) };
  })).filter(Boolean), selectors);

  for (const [phase, delay] of phases) {
    if (hasVideo) {
      await page.evaluate(async (f) => {
        const v = document.querySelector('.hero-video');
        v.currentTime = Math.min(v.duration - 0.05, f * v.duration);
        await new Promise((r) => { v.addEventListener('seeked', r, { once: true }); setTimeout(r, 2000); });
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      }, delay);
    } else await page.evaluate((d) => { document.querySelectorAll('.hero-media img').forEach((i) => { i.style.animationDelay = d; }); }, delay);
    await page.evaluate(() => {
      let st = document.getElementById('ct-hide');
      if (!st) { st = document.createElement('style'); st.id = 'ct-hide'; document.head.appendChild(st); }
      st.textContent = '.top,.disclosure{visibility:hidden!important}.hero [data-ct],.hero .pause-ico{color:transparent!important;text-shadow:none!important}.pause-ico{visibility:hidden}';
    });
    await page.waitForTimeout(80);
    const geo = await page.evaluate(() => {
      const hero = document.querySelector('.hero').getBoundingClientRect();
      const lines = {};
      document.querySelectorAll('[data-ct]').forEach((el) => {
        // visible text only: skip visually-hidden spans, whose layout boxes are not painted
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        const rects = [];
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (!n.textContent.trim() || (n.parentElement && n.parentElement.closest('.vh'))) continue;
          const r = document.createRange(); r.selectNodeContents(n);
          rects.push(...[...r.getClientRects()].filter((q) => q.width > 2 && q.height > 2).map((q) => [q.x + scrollX, q.y + scrollY, q.width, q.height]));
        }
        lines[el.getAttribute('data-ct')] = rects.length ? rects : [...(() => { const r = document.createRange(); r.selectNodeContents(el); return r.getClientRects(); })()].filter((q) => q.width > 2 && q.height > 2).map((q) => [q.x + scrollX, q.y + scrollY, q.width, q.height]);
      });
      return { bottom: Math.ceil(hero.bottom + scrollY), lines };
    });
    const shot = await page.screenshot({ fullPage: true, clip: { x: 0, y: 0, width: w, height: Math.min(geo.bottom, 4000) } });
    const lums = await page.evaluate(async ({ b64, lines }) => {
      const img = new Image();
      await new Promise((res) => { img.onload = res; img.src = 'data:image/png;base64,' + b64; });
      const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
      const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
      const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      const out = {};
      for (const [k, rects] of Object.entries(lines)) {
        const ys = [];
        for (const [x, y, rw, rh] of rects) {
          const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y)), x1 = Math.min(img.width, Math.ceil(x + rw)), y1 = Math.min(img.height, Math.ceil(y + rh));
          if (x1 <= x0 || y1 <= y0) continue;
          const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data;
          for (let i = 0; i < d.length; i += 8) ys.push(0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]));
        }
        out[k] = ys;
      }
      return out;
    }, { b64: shot.toString('base64'), lines: geo.lines });

    for (const m of meta) {
      const ys = lums[m.key];
      if (!ys || !ys.length) continue;
      const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      const L1 = 0.2126 * lin(m.rgb[0]) + 0.7152 * lin(m.rgb[1]) + 0.0722 * lin(m.rgb[2]);
      const ratios = ys.map((L2) => (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)).sort((a, b) => a - b);
      const large = m.fs >= 24 || (m.fs >= 18.66 && m.fw >= 700);
      const need = large || m.sel === '.pause-ico' ? 3 : 4.5;
      const pass = ratios.filter((r) => r >= need).length / ratios.length;
      const ok = pass >= GATE;
      const p1 = ratios[Math.floor(ratios.length * 0.01)];
      const where = `${w}x${h} ${mode} ${phase} ${m.sel}`;
      rows++; modes[mode]++;
      if (!ok) failures++;
      if (ratios[0] < worst.ratio) worst = { ratio: ratios[0], where };
      if (p1 < lowestP1.ratio) lowestP1 = { ratio: p1, where };
      if (!ok || process.env.VERBOSE) console.log(`${ok ? 'ok  ' : 'FAIL'} ${where.padEnd(52)} need ${need}  min ${ratios[0].toFixed(2)}  p1 ${p1.toFixed(2)}  meeting ${(pass * 100).toFixed(1)}%`);
    }
  }
  await ctx.close();
}
console.log(`\n${rows} text lines measured (${viewports.length} viewports; ${modes.video} in video mode, ${modes.push} in push mode); ${failures} below the ${GATE * 100}% gate.`);
console.log(`Worst single pixel: ${worst.ratio.toFixed(2)}:1 (${worst.where}). Lowest 1st-percentile: ${lowestP1.ratio.toFixed(2)}:1 (${lowestP1.where}).`);
await browser.close(); server.close();
process.exit(failures ? 1 : 0);
