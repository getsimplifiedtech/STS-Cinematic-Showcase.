// check:seo (decision D-7, audit finding M-4). Production search metadata, generated from validated client configuration, and the demonstration kept out.
//   demonstration  the delivered demo build stays noindex, nofollow: no canonical, no JSON-LD, no sitemap.xml, no robots.txt; the build refuses an
//                  indexable demonstration, and refuses structured data on a noindex build
//   client build   an indexable client fixture (the demonstration configuration with the demo wording replaced and the production fields set):
//                  every page has one absolute https canonical equal to base URL + file, unique, no noindex; sitemap.xml is well-formed, lists exactly
//                  the five canonicals, valid dates, escaped; robots.txt allows crawling and names the sitemap; the Home page carries one JSON-LD
//                  Restaurant that parses, matches the configuration (name, phone, address, cuisine, hours from the rows, Closed days absent, menu
//                  page, image that exists) and cannot break out of its script element; it claims no licence or rights; a hostile configuration
//                  cannot inject markup into any generated file; the build is deterministic; a base URL with a path is handled; the client build also
//                  passes the static security and privacy checks and loads under the CSP without a violation
//   validation     bad configuration fails the build with readable messages: http or localhost base URL, structured data without the business block,
//                  unparseable hours, a phone number that is not international, demonstration + indexable, structured data + noindex
import { readFileSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { assembleCandidate, pagesOf } from '../lib/site.mjs';
import { BUSINESS, buildClient } from '../lib/client-fixture.mjs';
import { treeHash } from '../lib/hashed.mjs';
import { hoursSpecs } from '../../src/lib/seo.mjs';
import { checkSecurityStatic } from './security.mjs';
import { checkPrivacyStatic } from './privacy.mjs';
import { isMain, projectDir, readJson } from '../lib/git.mjs';

const RIGHTS_CLAIM = /\b(royalty[- ]free|fully licen[cs]ed|licen[cs]ed (for|to|under)|rights[- ]cleared|copyright[- ]cleared|commercially (cleared|licen[cs]ed)|all rights (granted|reserved by us))\b/i;
const LD_FORBIDDEN_KEYS = ['license', 'copyrightHolder', 'copyrightNotice', 'copyrightYear', 'creditText', 'acquireLicensePage', 'usageInfo', 'isAccessibleForFree'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// A strict enough reader for the sitemap we write: returns { urls, errors }.
export function readSitemap(text) {
  const errors = [], urls = [];
  if (!text.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')) errors.push('missing the XML declaration');
  if (!/<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/.test(text)) errors.push('missing the sitemap namespace');
  const body = text.replace(/^<\?xml[^>]*\?>\s*/, '');
  if (/&(?!(amp|lt|gt|quot|apos|#\d+);)/.test(body)) errors.push('an unescaped ampersand');
  for (const m of body.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = /^<loc>([^<]*)<\/loc>(?:<lastmod>([^<]*)<\/lastmod>)?$/.exec(m[1].trim());
    if (!loc) { errors.push(`a <url> entry is malformed: ${m[1].trim().slice(0, 60)}`); continue; }
    urls.push({ loc: loc[1].replace(/&amp;/g, '&'), lastmod: loc[2] });
  }
  if ((body.match(/<url>/g) || []).length !== urls.length) errors.push('url entries could not all be read');
  if (!/<\/urlset>\s*$/.test(body)) errors.push('the urlset is not closed');
  return { urls, errors };
}

export function readRobots(text) {
  const errors = [], lines = text.split('\n').filter(Boolean);
  if (lines[0] !== 'User-agent: *') errors.push('the first line must be "User-agent: *"');
  if (lines.some((l) => /^Disallow:\s*\/\s*$/i.test(l))) errors.push('robots.txt disallows the whole site');
  if (!lines.includes('Allow: /')) errors.push('robots.txt must allow crawling ("Allow: /")');
  const sm = lines.filter((l) => /^Sitemap:/i.test(l));
  if (sm.length !== 1 || !/^Sitemap: https:\/\/[^\s]+\/sitemap\.xml$/.test(sm[0])) errors.push('robots.txt must name exactly one https sitemap.xml');
  return { errors, sitemap: sm[0]?.replace(/^Sitemap: /, '') };
}

// Validates one JSON-LD Restaurant against the configuration it came from. Returns problems.
export function validateRestaurant(ld, cfg, root) {
  const p = [], bad = (m) => p.push(m);
  const base = cfg.client.seo.baseUrl.replace(/\/+$/, '');
  const url = (v) => typeof v === 'string' && /^https:\/\/[^\s]+$/.test(v);
  if (ld['@context'] !== 'https://schema.org') bad('@context must be https://schema.org');
  if (!['Restaurant', 'FoodEstablishment', 'CafeOrCoffeeShop', 'BarOrPub', 'Bakery', 'FastFoodRestaurant'].includes(ld['@type'])) bad(`unexpected @type ${ld['@type']}`);
  if (ld.name !== cfg.client.brand.name) bad('name must equal client.brand.name');
  if (ld.url !== `${base}/`) bad(`url must be ${base}/`);
  if (!url(ld.image) || !ld.image.startsWith(base + '/') || !existsSync(join(root, ld.image.slice(base.length + 1)))) bad('image must be an https URL under the base URL that exists in the site');
  if (!/^\+[1-9]\d{6,14}$/.test(ld.telephone || '')) bad('telephone must be international (E.164)');
  if (ld.telephone !== cfg.client.contact.phone.href.replace(/^tel:/, '')) bad('telephone must equal the configured number');
  if (!Array.isArray(ld.servesCuisine) || !ld.servesCuisine.length || ld.servesCuisine.some((c) => typeof c !== 'string' || !c)) bad('servesCuisine must be a non-empty list of text');
  if (typeof ld.priceRange !== 'string' || !ld.priceRange) bad('priceRange is required');
  const a = ld.address || {};
  if (a['@type'] !== 'PostalAddress') bad('address must be a PostalAddress');
  for (const k of ['streetAddress', 'addressLocality', 'postalCode']) if (!a[k]) bad(`address.${k} is required`);
  if (!/^[A-Z]{2}$/.test(a.addressCountry || '')) bad('address.addressCountry must be a two-letter ISO code');
  const spec = ld.openingHoursSpecification;
  if (!Array.isArray(spec) || !spec.length) bad('openingHoursSpecification is required');
  else {
    const seen = new Set();
    for (const s of spec) {
      if (s['@type'] !== 'OpeningHoursSpecification') bad('each opening-hours entry must be an OpeningHoursSpecification');
      if (!Array.isArray(s.dayOfWeek) || !s.dayOfWeek.length || s.dayOfWeek.some((d) => !DAYS.includes(d))) bad('dayOfWeek must list valid day names');
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.opens) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.closes)) bad(`opens and closes must be HH:MM (${s.opens}, ${s.closes})`);
      for (const d of s.dayOfWeek || []) { if (seen.has(d)) bad(`${d} appears in two opening-hours entries`); seen.add(d); }
    }
    // independent oracle: every Closed row's days are absent, every open row's days are present
    for (const r of cfg.client.hours.rows) {
      const closed = /^closed$/i.test(r.time.trim());
      const rowDays = r.days.includes('–') || r.days.includes('-') ? DAYS.slice(DAYS.findIndex((d) => d.toLowerCase().startsWith(r.days.trim().toLowerCase().slice(0, 3))), DAYS.findIndex((d) => d.toLowerCase().startsWith(r.days.split(/[–-]/)[1].trim().toLowerCase().slice(0, 3))) + 1) : [DAYS.find((d) => d.toLowerCase().startsWith(r.days.trim().toLowerCase().slice(0, 3)))];
      for (const d of rowDays) if (closed === seen.has(d)) bad(`${d} is ${closed ? 'closed' : 'open'} in client.hours but ${seen.has(d) ? 'listed' : 'missing'} in the structured data`);
    }
  }
  const menu = cfg.pages.find((x) => x.id === 'menu');
  if (ld.hasMenu !== `${base}/${menu.file}`) bad('hasMenu must be the menu page URL');
  if (ld.sameAs !== undefined && (!Array.isArray(ld.sameAs) || ld.sameAs.some((s) => !url(s)))) bad('sameAs must list https URLs');
  for (const k of Object.keys(ld)) if (LD_FORBIDDEN_KEYS.includes(k)) bad(`the structured data must not assert ${k}: media rights are unverified (docs/JADE_AND_EMBER_MEDIA_RIGHTS_POLICY.md)`);
  return p;
}

const loadCfg = (root, cfgDir) => ({ client: readJson(join(cfgDir, 'client.json')), copy: readJson(join(cfgDir, 'copy.json')), pages: readJson(join(cfgDir, 'site.json')).pages });

export function checkSeoClient({ fixture }) {
  const problems = [], notes = [];
  const { dir, cfgDir } = fixture;
  const cfg = loadCfg(dir, cfgDir);
  const base = cfg.client.seo.baseUrl.replace(/\/+$/, '');
  const pages = pagesOf(dir).length ? pages_(cfg) : [];
  const canon = [];
  for (const p of cfg.pages) {
    const html = readFileSync(join(dir, p.file), 'utf8');
    const cs = [...html.matchAll(/<link rel="canonical" href="([^"]*)">/g)].map((m) => m[1].replace(/&amp;/g, '&'));
    const want = `${base}/${p.file === 'index.html' ? '' : p.file}`;
    if (cs.length !== 1) problems.push(`${p.file}: expected one canonical link, found ${cs.length}`);
    else if (cs[0] !== want) problems.push(`${p.file}: canonical ${cs[0]} should be ${want}`);
    canon.push(cs[0]);
    if (/name="robots"/.test(html)) problems.push(`${p.file}: an indexable build must not carry a robots meta tag (found one)`);
    const lds = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    if (p.id === 'home') {
      if (lds.length !== 1) problems.push(`${p.file}: expected one JSON-LD block, found ${lds.length}`);
      else {
        if (/[<>]/.test(lds[0][1])) problems.push(`${p.file}: JSON-LD contains a raw < or >; it could break out of its script element`);
        let ld; try { ld = JSON.parse(lds[0][1]); } catch (e) { problems.push(`${p.file}: JSON-LD does not parse (${e.message})`); }
        if (ld) validateRestaurant(ld, cfg, dir).forEach((m) => problems.push(`${p.file} JSON-LD: ${m}`));
      }
    } else if (lds.length) problems.push(`${p.file}: only the Home page carries structured data`);
    if (RIGHTS_CLAIM.test(html.replace(/<script[\s\S]*?<\/script>/g, (s) => s))) problems.push(`${p.file}: wording that claims media rights or licences`);
  }
  if (new Set(canon).size !== canon.length) problems.push('canonical URLs are not unique');
  // sitemap and robots
  const sm = readSitemap(readFileSync(join(dir, 'sitemap.xml'), 'utf8'));
  sm.errors.forEach((m) => problems.push(`sitemap.xml: ${m}`));
  if (JSON.stringify(sm.urls.map((u) => u.loc)) !== JSON.stringify(canon)) problems.push('sitemap.xml must list exactly the page canonicals, in page order');
  sm.urls.forEach((u) => { if (u.lastmod !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(u.lastmod)) problems.push(`sitemap.xml: bad lastmod ${u.lastmod}`); if (!/^https:\/\//.test(u.loc)) problems.push(`sitemap.xml: ${u.loc} is not an https URL`); });
  if (sm.urls.length > 50000) problems.push('sitemap.xml exceeds 50,000 URLs');
  const rb = readRobots(readFileSync(join(dir, 'robots.txt'), 'utf8'));
  rb.errors.forEach((m) => problems.push(`robots.txt: ${m}`));
  if (rb.sitemap !== `${base}/sitemap.xml`) problems.push(`robots.txt names ${rb.sitemap}; expected ${base}/sitemap.xml`);
  for (const f of ['sitemap.xml', 'robots.txt']) if (RIGHTS_CLAIM.test(readFileSync(join(dir, f), 'utf8'))) problems.push(`${f}: wording that claims media rights`);
  // the client build also passes the static security and privacy policies
  checkSecurityStatic({ root: dir }).problems.forEach((m) => problems.push(`client build, security: ${m}`));
  checkPrivacyStatic({ root: dir, cfgRoot: join(cfgDir, '..') }).problems.forEach((m) => problems.push(`client build, privacy: ${m}`));
  notes.push(`client build: ${cfg.pages.length} canonicals unique and equal to base + file, no robots meta; sitemap.xml lists them (well-formed, dated); robots.txt allows crawling and names the sitemap; Home carries one JSON-LD Restaurant matching the configuration (name, phone, address, cuisine, hours, menu, image), no raw angle brackets, no rights or licence claim; static security and privacy policies pass`);
  return { problems, notes };
}
const pages_ = (cfg) => cfg.pages;

export async function checkSeo({ root = null, browser = true, browserName = 'chromium' } = {}) {
  const own = !root;
  const dir = root || assembleCandidate(projectDir, 'seo');
  const problems = [], notes = [];
  const cleanup = [];
  const fx = (opts) => { const f = buildClient(opts); cleanup.push(f.root); return f; };
  try {
    // demonstration
    const names = readdirSync(dir);
    for (const f of ['sitemap.xml', 'robots.txt']) if (names.includes(f)) problems.push(`the demonstration build contains ${f}: it must stay noindex with no search files`);
    for (const f of pagesOf(dir)) {
      const h = readFileSync(join(dir, f), 'utf8');
      if (!h.includes('<meta name="robots" content="noindex, nofollow">')) problems.push(`${f}: the demonstration must carry the noindex, nofollow robots meta`);
      if (/rel="canonical"|application\/ld\+json/.test(h)) problems.push(`${f}: the demonstration must have no canonical link and no structured data`);
    }
    notes.push('demonstration: all five pages noindex, nofollow; no canonical, no JSON-LD, no sitemap.xml, no robots.txt');

    // client build
    const ok = fx({});
    if (ok.status !== 0) problems.push(`the client fixture failed to build: ${ok.text.slice(0, 300)}`);
    else {
      const r = checkSeoClient({ fixture: ok });
      problems.push(...r.problems); notes.push(...r.notes);
      const again = fx({});
      if (treeHash(ok.dir) !== treeHash(again.dir)) problems.push('two client builds are not identical');
      else notes.push('two client builds are byte-identical (no clock in the output)');
    }
    // a hostile configuration cannot inject markup
    const evil = '</script><script>alert(1)</script>"><img src=x onerror=alert(1)>&';
    const h = fx({ edit: (n, o) => { if (n === 'client') { o.brand.name = `Jade ${evil}`; o.seo.business.address.streetAddress = evil; o.seo.business.servesCuisine = [evil]; } } });
    if (h.status !== 0) problems.push(`hostile-text fixture failed to build: ${h.text.slice(0, 200)}`);
    else {
      for (const f of [...pagesOf(h.dir), 'sitemap.xml', 'robots.txt']) { const t = readFileSync(join(h.dir, f), 'utf8'); if (/<img src=x|<script>alert|<\/script><script>/.test(t)) problems.push(`hostile configuration text became markup in ${f}`); }
      const ld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(readFileSync(join(h.dir, 'index.html'), 'utf8'));
      if (!ld || /[<>]/.test(ld[1]) || JSON.parse(ld[1]).address.streetAddress !== evil) problems.push('hostile text must survive in the JSON-LD only as escaped data');
      else notes.push('hostile configuration text (script, tag and attribute breakouts) stays escaped data in the JSON-LD, pages and sitemap');
    }
    // a base URL with a path
    const sub = fx({ base: 'https://example.test/clients/jade' });
    if (sub.status !== 0) problems.push(`subpath fixture failed: ${sub.text.slice(0, 200)}`);
    else { const c = checkSeoClient({ fixture: sub }); problems.push(...c.problems.map((m) => `base URL with a path: ${m}`)); if (!/robots\.txt is only read at the root/.test(sub.text)) problems.push('the build must warn that robots.txt only works at the domain root when the base URL has a path'); else notes.push('a base URL with a path works and the build warns that robots.txt belongs at the domain root'); }
    // validation messages
    const bads = [
      ['an http base URL', { edit: (n, o) => { if (n === 'client') o.seo.baseUrl = 'http://jade.example.test'; } }, /https/],
      ['a localhost base URL', { edit: (n, o) => { if (n === 'client') o.seo.baseUrl = 'https://localhost:8080'; } }, /localhost/],
      ['structured data without the business block', { business: null }, /needs seo\.business/],
      ['hours that cannot be understood', { edit: (n, o) => { if (n === 'client') o.hours.rows[1] = { days: 'Weekdays', time: 'noon till late' }; } }, /cannot be turned into opening hours/],
      ['a phone number that is not international', { edit: (n, o) => { if (n === 'client') o.contact.phone.href = 'tel:5550100'; } }, /international tel:/],
      ['the demonstration made indexable', { edit: (n, o) => { if (n === 'client') o.flags.demo = true; } }, /demonstration must stay noindex/],
      ['structured data on a noindex build', { edit: (n, o) => { if (n === 'client') o.seo.noindex = true; } }, /only valid for an indexable build/],
      ['a business image that does not exist', { edit: (n, o) => { if (n === 'client') o.seo.business.image = 'media/nope.webp'; } }, /missing file media\/nope\.webp/],
      ['a country that is not a two-letter code', { edit: (n, o) => { if (n === 'client') o.seo.business.address.addressCountry = 'Britain'; } }, /addressCountry/],
    ];
    let refused = 0;
    for (const [name, opts, re] of bads) { const f = fx(opts); if (f.status === 0) problems.push(`"${name}" should fail the build but passed`); else if (!re.test(f.text)) problems.push(`"${name}" failed with an unexpected message: ${f.text.slice(0, 200)}`); else refused++; if (f.status !== 0 && existsSync(join(f.dir, 'sitemap.xml'))) problems.push(`"${name}" wrote a sitemap although validation failed`); }
    notes.push(`validation: ${refused}/${bads.length} bad production configurations are refused with readable messages and write nothing`);
    // browser: the client build under the CSP
    if (browser && ok.status === 0) {
      const { launchBrowser } = await import('../lib/browser.mjs');
      const { serveSite } = await import('../lib/server.mjs');
      const { securityHeaders, loadPolicy } = await import('../lib/security.mjs');
      const headers = securityHeaders(ok.dir, loadPolicy(), { https: false });
      const sv = serveSite(ok.dir, { headers: () => headers });
      const { browser: br } = await launchBrowser(browserName);
      try {
        const ctx = await br.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' }); const page = await ctx.newPage();
        const noise = [];
        await page.addInitScript(() => { window.__v = []; window.addEventListener('securitypolicyviolation', (e) => window.__v.push(e.violatedDirective), true); });
        page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) noise.push(m.text().slice(0, 100)); });
        await page.goto(sv.base); await page.waitForTimeout(800);
        const st = await page.evaluate(() => ({ v: window.__v, ld: JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)['@type'] }));
        if (st.v.length || noise.length) problems.push(`the client Home page under the CSP: violations ${JSON.stringify(st.v)}, console ${JSON.stringify(noise)}`);
        else notes.push(`the client Home page loads under the CSP with the JSON-LD block (${st.ld}): 0 violations, 0 console messages`);
        await ctx.close();
      } finally { await br.close(); sv.close(); }
    }
    return { problems, notes };
  } finally { cleanup.forEach((d) => rmSync(d, { recursive: true, force: true })); if (own) rmSync(dir, { recursive: true, force: true }); }
}

if (isMain(import.meta.url)) {
  const t0 = Date.now();
  const { problems, notes } = await checkSeo({ browser: !process.argv.includes('--static') });
  notes.forEach((n) => console.log('  ' + n));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:seo (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  process.exit(problems.length ? 1 : 0);
}
