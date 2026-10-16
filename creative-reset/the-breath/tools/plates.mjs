// Renders the calm-mode steam stills from the same solver and posters (no generation service, nothing downloaded): the poster plus the steam at the
// densest moment of the sequence, without type, so the calm layout can cross-fade to it with opacity only. Rendered at each poster's own size so the
// still lines up exactly with the poster under it (same cover-fit and focus point).
//   node tools/plates.mjs      (needs the lab served on :8431 and python3 with Pillow for the WebP conversion)
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const [vp, name, q] of [['1920x1080', 'steam-plate.webp', 'mid'], ['810x1440', 'steam-plate-m.webp', 'mid']]) {
  const [w, h] = vp.split('x').map(Number);
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const pg = await ctx.newPage();
  await pg.route('**/js/breath.min.js', (r) => r.fulfill({ path: join(root, 'js', 'breath.lab.js'), contentType: 'text/javascript' }));   // lab bundle: seek()
  await pg.goto(`http://localhost:8431/index.html?lab=1&perf=off&video=off&quality=${q}`); await pg.waitForLoadState('load');
  await pg.evaluate(() => window.lab.ready());
  await pg.evaluate(() => window.lab.seek(.5, { steps: 360, span: .3 }));
  await pg.addStyleTag({ content: '.beats,.top,.pause,.dark{display:none!important}.is-live .media,.is-live .steam{transform:none!important}.is-live .media{opacity:1!important}' });
  const png = join(root, 'shots', name.replace('.webp', '.png')); mkdirSync(join(root, 'shots'), { recursive: true });
  await pg.waitForTimeout(150); await pg.screenshot({ path: png, timeout: 180000 });
  execFileSync('python3', ['-I', '-c', 'import sys;from PIL import Image;im=Image.open(sys.argv[1]).convert("RGB");im.save(sys.argv[2],"WEBP",quality=int(sys.argv[3]),method=6)', png, join(root, 'media', name), w < 1000 ? '68' : '70']);
  await ctx.close(); console.log('plate', name);
}
await b.close();
