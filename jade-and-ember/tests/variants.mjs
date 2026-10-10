// Configuration variants: the reusable-client promise, checked. Builds the site from altered copies of config/ into temporary folders and checks the result.
//   1. validation failures stop the build (nothing is written)
//   2. a live ordering URL turns the example into a real link and removes the owner note
//   3. a client build (flags.demo false, indexing allowed, no hero video) carries no demonstration text at all
// Run: npm run test:variants   (set CHROMIUM_PATH to use an installed Chromium)
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
let failed = 0;
const report = (name, problems) => { console.log(`${problems.length ? 'FAIL' : 'PASS'}  ${name}`); problems.forEach((p) => console.log('   - ' + p)); if (problems.length) failed++; };
const tmp = mkdtempSync(join(tmpdir(), 'je-variants-'));

// A config folder copy that the caller may edit as JSON text.
function variant(name, edit) {
  const cfgDir = join(tmp, name, 'config'), site = join(tmp, name, 'site');
  mkdirSync(site, { recursive: true });
  cpSync(join(root, 'config'), cfgDir, { recursive: true });
  for (const f of readdirSync(cfgDir)) { const p = join(cfgDir, f); writeFileSync(p, edit(f.replace('.json', ''), readFileSync(p, 'utf8'))); }
  for (const a of ['fonts', 'media', 'styles.css', 'site.js', 'hero.js', 'menu.js']) symlinkSync(join(root, a), join(site, a));
  const r = spawnSync(process.execPath, [join(root, 'build.mjs'), '--config', cfgDir, '--out', site], { encoding: 'utf8' });
  return { site, status: r.status, out: r.stdout + r.stderr };
}
const json = (txt, fn) => { const o = JSON.parse(txt); fn(o); return JSON.stringify(o, null, 2); };

// 1. validation failures
{
  const p = [];
  const bad = [
    ['http ordering URL', (n, t) => (n === 'client' ? json(t, (o) => { o.ordering.url = 'http://insecure.example.com'; }) : t), /ordering\.url must be null or an https/],
    ['missing phone href', (n, t) => (n === 'client' ? json(t, (o) => { o.contact.phone.href = '555'; }) : t), /phone needs display and a tel:/],
    ['heat out of range', (n, t) => (n === 'menu' ? json(t, (o) => { o.categories[0].items[0].heat = 7; }) : t), /heat must be 0 to 3/],
    ['missing media file', (n, t) => (n === 'menu' ? json(t, (o) => { o.categories[3].items[0].signature.image = 'media/nope.webp'; }) : t), /missing file media\/nope\.webp/],
    ['dish without alt text', (n, t) => (n === 'menu' ? json(t, (o) => { o.categories[3].items[0].signature.alt = ''; }) : t), /needs real alt text/],
    ['duplicate page title', (n, t) => (n === 'copy' ? json(t, (o) => { o.visit.meta.title = o.menu.meta.title; }) : t), /titles must be unique/],
    ['header "direct" without a live URL', (n, t) => (n === 'client' ? json(t, (o) => { o.ordering.headerCta = 'direct'; }) : t), /direct.*needs a live/],
    ['demo off but demonstration text left in', (n, t) => (n === 'client' ? json(t, (o) => { o.flags.demo = false; }) : t), /demonstration text|marked sample/],
    ['indexing on without a base URL', (n, t) => (n === 'client' ? json(t, (o) => { o.seo.noindex = false; }) : t), /needs a seo\.baseUrl/],
  ];
  for (const [name, edit, re] of bad) {
    const v = variant('bad-' + name.replace(/\W+/g, '-'), edit);
    if (v.status === 0) p.push(`"${name}" should fail the build but passed`);
    else if (!re.test(v.out)) p.push(`"${name}" failed with an unexpected message: ${v.out.slice(0, 160)}`);
    if (v.status !== 0 && existsSync(join(v.site, 'index.html'))) p.push(`"${name}" wrote pages although validation failed`);
  }
  report(`${bad.length} invalid configurations stop the build and write nothing`, p);
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
async function open(site, file) {
  const { server, base } = serve(site);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });
  await page.goto(base + file);
  await page.waitForTimeout(500);
  return { page, errors, done: async () => { await ctx.close(); server.close(); } };
}

// 2. live ordering URL (demo flag still on)
{
  const p = [];
  const URL_ = 'https://order.example-restaurant.test/jade';
  const v = variant('live', (n, t) => (n === 'client' ? json(t, (o) => { o.ordering.url = URL_; o.ordering.headerCta = 'direct'; }) : t));
  if (v.status !== 0) p.push(`build failed: ${v.out}`);
  else {
    const { page, errors, done } = await open(v.site, 'order-online.html');
    const r = await page.evaluate(() => ({
      btn: (() => { const a = document.querySelector('.order-action a'); return a ? { href: a.href, target: a.target, rel: a.rel, name: a.textContent.trim() } : null; })(),
      off: !!document.querySelector('.btn-off'),
      owner: !!document.querySelector('.owner'),
      header: (() => { const a = document.querySelector('.top-cta'); return { href: a.href, target: a.target, rel: a.rel }; })(),
      nav: (() => { const a = document.querySelector('.nav-order a'); return { href: a.href, target: a.target }; })(),
    }));
    if (!r.btn || r.btn.href !== URL_ || r.btn.target !== '_blank' || !/noopener/.test(r.btn.rel) || !/new tab/.test(r.btn.name)) p.push(`Order page button should be a safe external link to the ordering URL: ${JSON.stringify(r.btn)}`);
    if (r.off) p.push('the "example" button must be gone when the URL is live');
    if (r.owner) p.push('the owner note explains the nonfunctional example and must be gone when the URL is live');
    if (r.header.href !== URL_ || r.header.target !== '_blank' || !/noopener/.test(r.header.rel)) p.push(`headerCta "direct" should send the header button to the platform: ${JSON.stringify(r.header)}`);
    if (r.nav.href !== URL_) p.push(`the phone-menu Order link should follow headerCta: ${JSON.stringify(r.nav)}`);
    errors.forEach((e) => p.push(e));
    await done();
  }
  report('live ordering URL: real safe link on the Order page, header goes direct, example and owner note removed', p);
}

// 3. a client build
{
  const p = [];
  const fixes = [
    [/Jade & Ember is a fictional modern Chinese kitchen: a cinematic restaurant website concept by Simplified Tech Solutions\. Sample menu, hours and address\./g, 'Jade & Ember is a modern Chinese kitchen. Menu, hours and address.'],
    [/Sample menu/g, 'Menu'], [/The sample menu at/g, 'The menu at'], [/\(sample details\)/g, ''], [/\(all details are samples\)/g, ''],
    [/ \(the ordering button is a nonfunctional example\)/g, ''], [/a fictional modern Chinese kitchen/g, 'a modern Chinese kitchen'],
    [/Sample Street/g, 'Market Street'], [/Example Street/g, 'High Street'], [/Sampletown, ST 00000/g, 'Springfield, ST 12345'], [/Fictionland/g, 'Country'],
    [/\(555\) 010-0188/g, '(020) 7946 0000'], [/\+15550100188/g, '+442079460000'], [/"sample": true/g, '"sample": false'],
    [/ \(fictional concept by STS\)/g, ''],
  ];
  const clean = (t) => fixes.reduce((s, [a, b]) => s.replace(a, b), t);
  const v = variant('client', (n, t) => {
    t = clean(t);
    if (n === 'client') return json(t, (o) => { o.flags.demo = false; o.flags.heroVideo = false; o.seo.noindex = false; o.seo.baseUrl = 'https://jadeandember.example.test'; o.ordering.url = 'https://order.example-restaurant.test/jade'; o.address.mapUrl = 'https://maps.example.test/?q=jade'; });
    if (n === 'site') return json(t, (o) => { o.credit.label = 'Website by Simplified Tech Solutions'; });
    return t;
  });
  if (v.status !== 0) p.push(`client build failed validation: ${v.out}`);
  else {
    const files = readdirSync(v.site).filter((f) => f.endsWith('.html'));
    if (files.length !== 5) p.push(`expected 5 pages, found ${files}`);
    const DEMO = /fictional|sample|invented|nonfunctional|example street|\(555\)|concept|showcase|disclosure|owners/i;
    for (const f of files) {
      const html = readFileSync(join(v.site, f), 'utf8');
      const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '');
      const m = text.match(DEMO);
      if (m) p.push(`${f} still contains demonstration text near "${text.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, ' ')}"`);
      if (/noindex/.test(html)) p.push(`${f} is still noindex`);
      if (!html.includes('rel="canonical"')) p.push(`${f} has no canonical link`);
      if (/class="disclosure"/.test(html) || /class="foot-disc"/.test(html)) p.push(`${f} still has a disclosure`);
      if (/hero-video/.test(html)) p.push(`${f} has a hero video although flags.heroVideo is false`);
    }
    for (const f of ['index.html', 'order-online.html']) {
      const { page, errors, done } = await open(v.site, f);
      const r = await page.evaluate(() => ({ title: document.title, hero: !!document.querySelector('.hero-media img'), btn: document.querySelector('.order-action a')?.href || null, owner: !!document.querySelector('.owner'), pause: null }));
      if (f === 'index.html' && !r.hero) p.push(`Home without the hero video must still show the still: ${JSON.stringify(r)}`);
      if (f === 'order-online.html' && (!r.btn || r.owner)) p.push(`client Order page needs the live button and no owner note: ${JSON.stringify(r)}`);
      if (/fictional|STS/i.test(r.title)) p.push(`title still carries the demo suffix: ${r.title}`);
      errors.forEach((e) => p.push(`${f}: ${e}`));
      await done();
    }
    const visit = readFileSync(join(v.site, 'visit-us.html'), 'utf8');
    if (!visit.includes('Get directions')) p.push('Visit page should show "Get directions" when address.mapUrl is set');
  }
  report('client build (demo off, indexable, no hero video, live ordering): no demonstration text, canonical links, no disclosure', p);
}

await browser.close();
rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `\n${failed} group(s) failed.` : '\nAll variant checks passed.');
process.exit(failed ? 1 : 0);
