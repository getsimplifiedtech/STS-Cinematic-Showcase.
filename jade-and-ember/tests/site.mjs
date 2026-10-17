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
    shown: document.body.innerText,
    hiddenOnly: [...document.querySelectorAll('[aria-label],[title],[alt]')].map((e) => [e.getAttribute('aria-label'), e.getAttribute('title'), e.getAttribute('alt')].join(' ')).join(' '),
  }));
  data[pg.id].requests = requests.filter((u) => !u.startsWith(base) && !u.startsWith('data:'));
  data[pg.id].errors = errors;
  await ctx.close();
}

{
  // the finished site never shows development status: no lab or prototype label, no "not the production site" notice, in the text a visitor reads or in labels a screen reader announces
  const p = [], dev = /lab prototype|prototype|not the production|work in progress|concept v\d|\bWIP\b|staging|lorem ipsum/i;
  for (const pg of pages) { const m = dev.exec(data[pg.id].shown + ' ' + data[pg.id].hiddenOnly); if (m) p.push(`${pg.file} shows development wording: "${m[0]}"`); }
  report('no development or lab label on any page', p);
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
    if (pg.id !== 'home' && d.video) p.push(`${pg.file}: the footage belongs on Home only (video element: ${d.video})`);   // Home's own <video> is added by breath.js
    const want = { home: ['site.js', 'breath.js'], menu: ['site.js', 'menu.js'], story: ['site.js', 'story.js'], visit: ['site.js', 'visit.js'] }[pg.id] || ['site.js'];
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
{
  // The three pages built in Gate 2: structure and content come from config.
  const p = [];
  const copy = JSON.parse(readFileSync(new URL('config/copy.json', root), 'utf8'));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const grab = async (file, fn, arg) => { const pg = await ctx.newPage(); await pg.goto(base + file); const r = await pg.evaluate(fn, arg); await pg.close(); return r; };

  const s = await grab('our-story.html', () => ({
    h2: [...document.querySelectorAll('main h2')].map((h) => h.textContent.trim()),
    seal: (() => { const e = document.querySelector('.name-glyph'); return e ? { hidden: e.getAttribute('aria-hidden'), lang: e.getAttribute('lang'), text: e.textContent } : null; })(),
    img: (() => { const a = [...document.querySelectorAll('.chapter-fig img')]; return a.length ? { n: a.length, alt: Math.min(...a.map((i) => i.alt.length)), w: Math.min(...a.map((i) => i.getAttribute('width') | 0)), h: Math.min(...a.map((i) => i.getAttribute('height') | 0)) } : null; })(),
    note: document.querySelector('.name-note')?.textContent || '',
    numbered: document.querySelectorAll('main .step-no').length,
  }));
  const wantH2 = [...copy.story.chapters.map((c) => c.heading), copy.story.name.heading];
  if (JSON.stringify(s.h2.slice(0, wantH2.length)) !== JSON.stringify(wantH2)) p.push(`Our story headings should be the chapters then the name: ${s.h2}`);
  if (!s.seal || s.seal.hidden !== 'true' || s.seal.lang !== 'zh-Hans' || s.seal.text !== copy.story.name.characters.join('')) p.push(`the large seal should be aria-hidden, lang zh-Hans, and the two configured characters: ${JSON.stringify(s.seal)}`);
  if (!s.img || s.img.n !== copy.story.chapters.length || s.img.alt < 10 || !s.img.w || !s.img.h) p.push(`every Our story picture needs alt text and dimensions: ${JSON.stringify(s.img)}`);
  if (!/jade/.test(s.note) || !/fire/.test(s.note)) p.push('the seal note should say what the characters mean');
  if (s.numbered) p.push('story chapters are headed, not numbered');

  const v = await grab('visit-us.html', () => ({
    rows: [...document.querySelectorAll('.hours tr')].map((r) => [r.querySelector('th').textContent.trim(), r.querySelector('td').textContent.trim()]),
    addr: document.querySelector('.visit-address')?.innerText.split('\n').map((x) => x.trim()),
    tel: document.querySelector('.visit-contact a.phone')?.getAttribute('href'),
    groups: [...document.querySelectorAll('.good-group h3')].map((h) => h.textContent.trim()),
    map: !!document.querySelector('a[target=_blank]'),
    photos: [...document.querySelectorAll('main img')].filter((i) => i.alt.length < 10 && !i.closest('[aria-hidden=true]')).length,   // a picture is either decorative (hidden with its figure) or has real alt text
    room: [...document.querySelectorAll('main figure img')].map((i) => ({ alt: i.alt.length, w: i.getAttribute('width'), h: i.getAttribute('height'), lazy: i.loading === 'lazy', cap: !!i.closest('figure').querySelector('figcaption') })),
    h2: [...document.querySelectorAll('main h2')].map((h) => h.textContent.trim()),
    sizes: [...document.querySelectorAll('.room-photo source')].map((s) => ({ media: s.media, srcset: s.srcset.split(',').map((x) => x.trim().split(/\s+/).pop()) })),
  }));
  // the opening photograph: a phone crop below 760 px, and three widths of the same photograph for larger screens
  if (v.sizes.length !== 2 || !/max-width: 759px/.test(v.sizes[0].media) || JSON.stringify(v.sizes[1].srcset) !== JSON.stringify(['1280w', '1920w', '2560w'])) p.push(`Visit opening photograph should have a phone crop and 1280, 1920 and 2560 px sizes: ${JSON.stringify(v.sizes)}`);
  // the three interior photographs: the opening one loads at once (and has a phone crop), the other two are lazy; each is described, sized and captioned
  if (v.room.length !== 3 || v.room.some((r) => r.alt < 40 || r.alt > 250 || !r.w || !r.h || !r.cap) || v.room[0].lazy || !v.room[1].lazy || !v.room[2].lazy) p.push(`Visit interior photographs: ${JSON.stringify(v.room)}`);
  if (v.h2.length !== 4 || v.h2[2] !== copy.visit.goodToKnow.heading) p.push(`Visit should have the counter and materials sections, then good to know, then the order band: ${v.h2}`);
  if (JSON.stringify(v.rows) !== JSON.stringify(client.hours.rows.map((r) => [r.days, r.time]))) p.push(`Visit hours differ from config: ${JSON.stringify(v.rows)}`);
  if (JSON.stringify(v.addr) !== JSON.stringify(client.address.lines)) p.push(`Visit address differs from config: ${JSON.stringify(v.addr)}`);
  if (v.tel !== client.contact.phone.href) p.push(`Visit phone link differs from config: ${v.tel}`);
  if (JSON.stringify(v.groups) !== JSON.stringify(copy.visit.goodToKnow.groups.map((g) => g.title))) p.push(`good-to-know groups differ from config: ${v.groups}`);
  if (v.photos) p.push(`Visit: ${v.photos} picture(s) are neither decorative nor described`);
  if (!client.address.mapUrl && v.map) p.push('no "Get directions" link may appear while address.mapUrl is empty');

  const o = await grab('order-online.html', () => ({
    steps: [...document.querySelectorAll('ol.steps li')].map((li) => li.querySelector('h3').textContent.replace(/^\d+/, '').trim()),
    ordered: !!document.querySelector('ol.steps'),
    off: (() => { const e = document.querySelector('.order-action .btn-off'); return e ? { tag: e.tagName, text: e.textContent.trim() } : null; })(),
    link: document.querySelector('.order-action a')?.href || null,
    owner: !!document.querySelector('.owner'),
    allergy: document.querySelector('.info-allergy p')?.textContent.trim(),
    tel: document.querySelector('.info-call a')?.getAttribute('href'),
    photos: [...document.querySelectorAll('main img')].filter((i) => i.alt.length < 10 && !i.closest('[aria-hidden=true]')).length,
    placeholders: /\{(platform|pickup)\}/.test(document.body.innerText),
  }));
  if (JSON.stringify(o.steps) !== JSON.stringify(copy.order.steps.map((x) => x.name))) p.push(`Order steps differ from config: ${o.steps}`);
  if (!client.ordering.url) {
    if (!o.off || o.off.tag !== 'SPAN' || !/\(example\)/.test(o.off.text)) p.push(`with no ordering URL the button must be the plainly labelled non-link example: ${JSON.stringify(o.off)}`);
    if (o.link) p.push('no link may exist in the primary action while ordering.url is empty');
    if (!o.owner) p.push('the example state needs the note for restaurant owners');
  }
  if (o.allergy !== JSON.parse(readFileSync(new URL('config/copy.json', root), 'utf8')).menu.note) p.push('the Order page allergy text must be the Menu note (one source)');
  if (o.tel !== client.contact.phone.href) p.push('Order page phone link differs from config');
  if (o.photos) p.push(`Order: ${o.photos} picture(s) are neither decorative nor described`);
  if (o.placeholders) p.push('an unreplaced {platform} or {pickup} placeholder is showing');
  await ctx.close();
  report('Our story, Visit us and Order online: structure and content come from config', p);
}
await browser.close(); server.close();
console.log(failed ? `\n${failed} group(s) failed.` : '\nAll site checks passed.');
process.exit(failed ? 1 : 0);
