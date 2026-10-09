// Text contrast where type sits on or against a photograph below the hero: the dish names and descriptions that
// overlap the feathered edge of each plate, the story quote and caption. axe cannot compute these, so we measure.
//
// All glyphs in the chosen blocks are made transparent, the page is screenshotted, and the pixels behind every text
// line are compared with the text's computed colour using the WCAG relative-luminance formula. Same gate as
// tests/contrast.mjs: at least 99% of sampled pixels at 4.5:1 (3:1 for large text).
// Run: npm run test:contrast-sections   (set CHROMIUM_PATH to use an installed Chromium; VERBOSE=1 lists every line)
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const { server, base } = serve();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const viewports = [[2560, 1440], [1920, 1080], [1440, 900], [1280, 720], [1024, 768], [960, 700], [820, 1180], [768, 1024], [430, 932], [390, 844], [360, 740], [320, 640], [844, 390]];
const roots = ['.dish-body', '.pull', '.story-text', '.story-fig figcaption'];
const GATE = 0.99;
let failures = 0, rows = 0, worst = { ratio: 99, where: '' };

for (const [w, h] of viewports) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 900, hasTouch: w < 900, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.evaluate(async () => { const im = [...document.images]; im.forEach((i) => { i.loading = 'eager'; }); await Promise.all(im.map((i) => i.decode().catch(() => {}))); });
  await page.waitForTimeout(300);
  const meta = await page.evaluate((rootSels) => {
    const out = [];
    let n = 0;
    for (const sel of rootSels) for (const root of document.querySelectorAll(sel)) {
      for (const el of [root, ...root.querySelectorAll('*')]) {
        if (![...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) continue;
        if (el.closest('.vh')) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        el.setAttribute('data-ct', String(n));
        const m = cs.color.match(/[\d.]+/g).map(Number);
        out.push({ key: String(n), label: `${sel} ${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''}`, rgb: m.slice(0, 3), fs: parseFloat(cs.fontSize), fw: parseInt(cs.fontWeight, 10) });
        n++;
      }
    }
    return out;
  }, roots);
  await page.addStyleTag({ content: '[data-ct]{color:transparent!important;text-shadow:none!important;text-decoration-color:transparent!important}.top,.disclosure{visibility:hidden!important}' });
  await page.waitForTimeout(80);
  const lines = await page.evaluate(() => {
    const out = {};
    document.querySelectorAll('[data-ct]').forEach((el) => {
      const rects = [];
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        if (!t.textContent.trim() || t.parentElement.closest('[data-ct]') !== el) continue;
        const r = document.createRange(); r.selectNodeContents(t);
        rects.push(...[...r.getClientRects()].filter((q) => q.width > 2 && q.height > 2).map((q) => [q.x + scrollX, q.y + scrollY, q.width, q.height]));
      }
      out[el.getAttribute('data-ct')] = rects;
    });
    return out;
  });
  const shot = await page.screenshot({ fullPage: true });
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
  }, { b64: shot.toString('base64'), lines });
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  for (const m of meta) {
    const ys = lums[m.key];
    if (!ys || !ys.length) continue;
    const L1 = 0.2126 * lin(m.rgb[0]) + 0.7152 * lin(m.rgb[1]) + 0.0722 * lin(m.rgb[2]);
    const ratios = ys.map((L2) => (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)).sort((a, b) => a - b);
    const need = m.fs >= 24 || (m.fs >= 18.66 && m.fw >= 700) ? 3 : 4.5;
    const pass = ratios.filter((r) => r >= need).length / ratios.length;
    const ok = pass >= GATE;
    const where = `${w}x${h} ${m.label}`;
    rows++;
    if (!ok) failures++;
    if (ratios[0] < worst.ratio) worst = { ratio: ratios[0], where };
    if (!ok || process.env.VERBOSE) console.log(`${ok ? 'ok  ' : 'FAIL'} ${where.padEnd(58)} need ${need}  min ${ratios[0].toFixed(2)}  meeting ${(pass * 100).toFixed(1)}%`);
  }
  await ctx.close();
}
console.log(`\n${rows} text blocks measured over ${viewports.length} viewports; ${failures} below the ${GATE * 100}% gate. Worst single pixel: ${worst.ratio.toFixed(2)}:1 (${worst.where}).`);
await browser.close(); server.close();
process.exit(failures ? 1 : 0);
