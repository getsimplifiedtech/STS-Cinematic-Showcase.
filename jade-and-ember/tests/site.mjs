// Site-level integrity across all pages in the registry (config/site.json). Run: npm run test:site
// Set CHROMIUM_PATH to use an installed Chromium.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const root = new URL('../', import.meta.url);
const site = JSON.parse(readFileSync(new URL('config/site.json', root), 'utf8'));
const client = JSON.parse(readFileSync(new URL('config/client.json', root), 'utf8'));
const pages = site.pages;
const { server, base } = serve();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
let failed = 0;
const report = (name, problems) => { console.log(`${problems.length ? 'FAIL' : 'PASS'}  ${name}`); problems.forEach((x) => console.log('   - ' + x)); if (problems.length) failed++; };

const url = (p) => base + (p.file === 'index.html' ? '' : p.file);
const data = {};
for (const pg of pages) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });
  await page.goto(url(pg));
  await page.waitForTimeout(700);
  data[pg.id] = await page.evaluate(() => ({
    title: document.title,
    desc: document.querySelector('meta[name=description]')?.content || '',
    robots: document.querySelector('meta[name=robots]')?.content || '',
    h1: [...document.querySelectorAll('h1')].map((h) => h.textContent.trim()),
    headings: [...document.querySelectorAll('h1,h2,h3')].map((h) => +h.tagName[1]),
    nav: [...document.querySelectorAll('.site-nav a')].map((a) => [a.getAttribute('href'), a.textContent.trim(), a.getAttribute('aria-current')]),
    cta: [...document.querySelectorAll('.top-cta')].map((a) => [a.getAttribute('href'), a.getAttribute('aria-current')]),
    foot: [...document.querySelectorAll('.foot-nav a')].map((a) => [a.getAttribute('href'), a.textContent.trim(), a.getAttribute('aria-current')]),
    current: document.querySelectorAll('.site-nav a[aria-current=page]').length,
    ids: [...document.querySelectorAll('[id]')].map((e) => e.id),
    links: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')),
    scripts: [...document.scripts].map((s) => s.getAttribute('src')).filter(Boolean),
    video: !!document.querySelector('.hero-video'),
    landmarks: ['header', 'nav[aria-label=Primary]', 'main#main', 'footer', 'nav[aria-label=Footer]', 'a.skip'].map((s) => !!document.querySelector(s)),
    lang: document.documentElement.lang,
    dataPage: document.documentElement.dataset.page,
  }));
  data[pg.id].requests = requests.filter((u) => !u.startsWith(base) && !u.startsWith('data:'));
  data[pg.id].errors = errors;
  await ctx.close();
}

{
  const p = [];
  for (const pg of pages) if (!existsSync(new URL(pg.file, root)) || statSync(new URL(pg.file, root)).size < 1000) p.push(`${pg.file} is missing or empty`);
  report(`${pages.length} page files exist`, p);
}
{
  const p = [];
  const titles = pages.map((pg) => data[pg.id].title), descs = pages.map((pg) => data[pg.id].desc);
  if (new Set(titles).size !== pages.length) p.push(`titles are not unique: ${titles}`);
  if (new Set(descs).size !== pages.length) p.push('descriptions are not unique');
  for (const pg of pages) {
    const d = data[pg.id];
    if (d.h1.length !== 1) p.push(`${pg.file}: expected one h1, found ${d.h1.length}`);
    if (!d.title.includes(JSON.parse(readFileSync(new URL('config/client.json', root), 'utf8')).brand.name)) p.push(`${pg.file}: title lacks the brand name`);
    if (d.desc.length < 50 || d.desc.length > 200) p.push(`${pg.file}: description length ${d.desc.length}`);
    if (d.headings[0] !== 1 || d.headings.some((h, i) => i && h - d.headings[i - 1] > 1)) p.push(`${pg.file}: heading levels skip: ${d.headings}`);
    if (!d.landmarks.every(Boolean)) p.push(`${pg.file}: missing landmark(s) ${d.landmarks}`);
    if (d.lang !== site.lang || d.dataPage !== pg.id) p.push(`${pg.file}: lang or data-page wrong`);
    const dup = d.ids.filter((x, i) => d.ids.indexOf(x) !== i);
    if (dup.length) p.push(`${pg.file}: duplicate ids ${dup}`);
  }
  report('titles and descriptions unique; one h1; heading order; landmarks; ids', p);
}
{
  const p = [];
  const expected = pages.filter((pg) => !pg.cta).map((pg) => [pg.file, pg.nav]);
  const cta = pages.find((pg) => pg.cta);
  for (const pg of pages) {
    const d = data[pg.id];
    const navNoCurrent = d.nav.slice(0, -1).map(([h, t]) => [h, t]);
    if (JSON.stringify(navNoCurrent) !== JSON.stringify(expected)) p.push(`${pg.file}: primary nav differs from the registry: ${JSON.stringify(navNoCurrent)}`);
    const last = d.nav[d.nav.length - 1];
    if (last[0] !== cta.file || last[1] !== cta.nav) p.push(`${pg.file}: the last nav item should be ${cta.nav}`);
    if (d.cta.length !== 1 || d.cta[0][0] !== cta.file) p.push(`${pg.file}: header button should go to ${cta.file}: ${JSON.stringify(d.cta)}`);
    if (d.current !== 1 && !(pg.cta && d.current === 1)) p.push(`${pg.file}: expected exactly one aria-current page in the nav, found ${d.current}`);
    const cur = d.nav.filter((n) => n[2] === 'page').map((n) => n[0]);
    if (cur[0] !== pg.file) p.push(`${pg.file}: aria-current is on ${cur}`);
    if (JSON.stringify(d.foot.map((f) => [f[0], f[1]])) !== JSON.stringify(pages.map((x) => [x.file, x.nav]))) p.push(`${pg.file}: footer links differ from the registry`);
  }
  report('navigation identical on every page; one current page; header button goes to the Order page; footer matches', p);
}
{
  const p = [];
  for (const pg of pages) {
    for (const href of data[pg.id].links) {
      if (/^(https?:|tel:|mailto:)/.test(href)) continue;
      const [file, frag] = href.split('#');
      const target = file === '' ? pg : pages.find((x) => x.file === file);
      if (file !== '' && !target && !existsSync(new URL(file, root))) { p.push(`${pg.file}: link to ${href} does not resolve`); continue; }
      if (frag && target && !data[target.id].ids.includes(frag)) p.push(`${pg.file}: ${href} points at a missing id`);
    }
  }
  report('every internal link and fragment resolves', p);
}
{
  const p = [];
  const wantRobots = client.seo.noindex;
  for (const pg of pages) {
    const d = data[pg.id];
    if (wantRobots && !/noindex/.test(d.robots)) p.push(`${pg.file}: config says noindex but robots is "${d.robots}"`);
    if (!wantRobots && /noindex/.test(d.robots)) p.push(`${pg.file}: noindex present but config allows indexing`);
    if (d.requests.length) p.push(`${pg.file}: external requests ${d.requests}`);
    if (d.errors.length) p.push(`${pg.file}: ${d.errors}`);
    if (d.video !== (pg.id === 'home')) p.push(`${pg.file}: the hero video belongs on Home only (video element: ${d.video})`);
    const want = pg.id === 'home' ? ['site.js', 'hero.js'] : pg.id === 'menu' ? ['site.js', 'menu.js'] : ['site.js'];
    if (JSON.stringify(d.scripts) !== JSON.stringify(want)) p.push(`${pg.file}: scripts ${d.scripts}, expected ${want}`);
  }
  report('robots matches config; no external requests; no errors; hero video and scripts only where they belong', p);
}
{
  // One source for business facts: the address and phone appear identically wherever they are shown.
  const p = [];
  const home = readFileSync(new URL('index.html', root), 'utf8');
  for (const line of client.address.lines) if (!home.includes(line)) p.push(`Home does not show address line "${line}"`);
  if (!home.includes(client.contact.phone.display)) p.push('Home does not show the phone number');
  for (const r of client.hours.rows) if (!home.includes(r.time)) p.push(`Home does not show hours "${r.time}"`);
  const menuHtml = readFileSync(new URL('menu.html', root), 'utf8');
  const menuCfg = JSON.parse(readFileSync(new URL('config/menu.json', root), 'utf8'));
  for (const it of menuCfg.categories.flatMap((k) => k.items)) if (!menuHtml.includes(it.name.replace(/&/g, '&amp;'))) p.push(`Menu page lacks "${it.name}"`);
  const sigs = menuCfg.categories.flatMap((k) => k.items).filter((i) => i.signature);
  for (const it of sigs) {
    const m = menuHtml.match(new RegExp(it.name.replace(/&/g, '&amp;') + '[\\s\\S]*?\\$(\\d+)'));
    if (!m || +m[1] !== it.price) p.push(`price of ${it.name} differs between config and the Menu page`);
    if (!home.includes('$' + it.price)) p.push(`Home shows a different price for ${it.name}`);
  }
  report('business facts and prices come from config on every page', p);
}
await browser.close(); server.close();
console.log(failed ? `\n${failed} group(s) failed.` : '\nAll site checks passed.');
process.exit(failed ? 1 : 0);
