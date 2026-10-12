// check:seo (decision D-7, audit finding M-4). Production search metadata, generated from validated client configuration, and the demonstration kept out.
//   demonstration  the delivered demo build stays noindex, nofollow: no canonical, no JSON-LD, no sitemap.xml, no robots.txt; the build refuses an
//                  indexable demonstration, and refuses structured data on a noindex build
//   client build   an indexable client fixture (the demonstration configuration with the demo wording replaced and the production fields set):
//                  every page has one absolute https canonical equal to base URL + file, unique, no noindex; sitemap.xml is well-formed, lists exactly
//                  the five canonicals, valid dates, escaped; robots.txt allows crawling, carries exactly the configured crawler policy and names the sitemap; llms.txt lists every page and agrees with the pages; titles, descriptions and og:url unique and correct; facts agree across pages, structured data and llms.txt; no foreign host; the Home page carries one JSON-LD
//                  Restaurant that parses, matches the configuration (name, phone, address, cuisine, hours from the rows, Closed days absent, menu
//                  page, image that exists) and cannot break out of its script element; it claims no licence or rights; a hostile configuration
//                  cannot inject markup into any generated file; the build is deterministic; a base URL with a path is handled; the client build also
//                  passes the static security and privacy checks and loads under the CSP without a violation
//   search artifacts (Gate 4 reconciliation, STS Search and AI Discovery Readiness): unique titles and descriptions, og:url, llms.txt (generated for
//                  indexable client builds, never for the demonstration, validated against the pages), the crawler policy in robots.txt, facts that
//                  agree across pages, structured data and llms.txt, no foreign or internal hosts, and the final public URL on each kind of host
//                  (Cloudflare Pages, Vercel with and without cleanUrls, a plain server) with the host's documented behaviour simulated locally
//   validation     bad configuration fails the build with readable messages: http or localhost base URL, structured data without the business block,
//                  unparseable hours, a phone number that is not international, demonstration + indexable, structured data + noindex
import { engineNoise } from '../lib/engine-noise.mjs';
import { readFileSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { assembleCandidate, pagesOf } from '../lib/site.mjs';
import { BUSINESS, buildClient } from '../lib/fixtures.mjs';
import { treeHash } from '../lib/hashed.mjs';
import { hoursSpecs, publicUrl, urlStyleOf, isReservedHost } from '../../src/lib/seo.mjs';
import { RIGHTS_CLAIM, crawlerRecordProblems, factsProblems, hostProblems, llmsProblems, metadataProblems, readLlms, readRobotsGroups, reservedBase, robotsProblems, urlStrategyProblems } from '../lib/search.mjs';
import { checkSecurityStatic } from './security.mjs';
import { checkPrivacyStatic } from './privacy.mjs';
import { engDir, isMain, projectDir, readJson } from '../lib/git.mjs';
import { requireIndustry } from '../lib/industry.mjs';
import { fixtureNames } from '../lib/project.mjs';
import { validateStructuredData } from '../lib/structured-data.mjs';


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
  const r = readRobotsGroups(text), errors = [...r.errors];
  if (!r.groups[0] || r.groups[0].agents.join() !== '*') errors.push('the first line must be "User-agent: *"');
  else {
    if (r.groups[0].rules.some(([k, v]) => k === 'disallow' && v === '/')) errors.push('robots.txt disallows the whole site');
    if (!r.groups[0].rules.some(([k, v]) => k === 'allow' && v === '/')) errors.push('robots.txt must allow crawling ("Allow: /")');
  }
  if (r.sitemaps.length !== 1 || !/^https:\/\/[^\s]+\/sitemap\.xml$/.test(r.sitemaps[0])) errors.push('robots.txt must name exactly one https sitemap.xml');
  return { errors, sitemap: r.sitemaps[0] };
}


const loadCfg = (root, cfgDir) => ({ client: readJson(join(cfgDir, 'client.json')), copy: readJson(join(cfgDir, 'copy.json')), pages: readJson(join(cfgDir, 'site.json')).pages });

export function checkSeoClient({ fixture }) {
  const problems = [], notes = [];
  const { dir, cfgDir } = fixture;
  const cfg = loadCfg(dir, cfgDir);
  const base = cfg.client.seo.baseUrl.replace(/\/+$/, '');
  const pages = pagesOf(dir).length ? pages_(cfg) : [];
  const canon = [], pagesHtml = {};
  let ldData = null;
  for (const p of cfg.pages) {
    const html = readFileSync(join(dir, p.file), 'utf8'); pagesHtml[p.file] = html;
    const cs = [...html.matchAll(/<link rel="canonical" href="([^"]*)">/g)].map((m) => m[1].replace(/&amp;/g, '&'));
    const clean = cfg.client.seo.urlStyle === 'clean';   // independent of the generator: the public address is the file name, or without .html for a clean-URL host
    const want = `${base}/${p.file === 'index.html' ? '' : clean ? p.file.replace(/\.html$/, '') : p.file}`;
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
        if (ld) { ldData = ld; validateStructuredData(ld, cfg, dir).forEach((m) => problems.push(`${p.file} JSON-LD: ${m}`)); }
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
  const robotsText = readFileSync(join(dir, 'robots.txt'), 'utf8');
  readRobots(robotsText).errors.forEach((m) => problems.push(`robots.txt: ${m}`));
  problems.push(...robotsProblems({ text: robotsText, cfg }));
  // llms.txt, page metadata, facts and hosts
  let llmsText = null;
  try { llmsText = readFileSync(join(dir, 'llms.txt'), 'utf8'); } catch { problems.push('llms.txt is missing from the indexable client build'); }
  const sitemapUrls = sm.urls.map((u) => u.loc);
  if (llmsText !== null) problems.push(...llmsProblems({ text: llmsText, cfg, pagesHtml, sitemapUrls }));
  problems.push(...metadataProblems({ pagesHtml, cfg, indexable: true }));
  problems.push(...factsProblems({ cfg, pagesHtml, jsonLd: ldData }));
  problems.push(...hostProblems({ cfg, sitemapUrls, jsonLd: ldData, llmsUrls: llmsText ? readLlms(llmsText).urls : [], pagesHtml }));
  for (const f of ['sitemap.xml', 'robots.txt', 'llms.txt']) if (RIGHTS_CLAIM.test((() => { try { return readFileSync(join(dir, f), 'utf8'); } catch { return ''; } })())) problems.push(`${f}: wording that claims media rights`);
  // the client build also passes the static security and privacy policies
  checkSecurityStatic({ root: dir }).problems.forEach((m) => problems.push(`client build, security: ${m}`));
  checkPrivacyStatic({ root: dir, cfgRoot: join(cfgDir, '..') }).problems.forEach((m) => problems.push(`client build, privacy: ${m}`));
  notes.push(`client build: ${cfg.pages.length} canonicals unique and equal to base + file, no robots meta; sitemap.xml lists them (well-formed, dated); robots.txt allows crawling and names the sitemap; Home carries one JSON-LD ${requireIndustry().summary}, no raw angle brackets, no rights or licence claim; static security and privacy policies pass`);
  return { problems, notes };
}
const pages_ = (cfg) => cfg.pages;
const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

export async function checkSeo({ root = null, browser = true, browserName = 'chromium' } = {}) {
  const own = !root;
  const dir = root || assembleCandidate(projectDir, 'seo');
  const problems = [], notes = [];
  const cleanup = [];
  const fx = (opts) => { const f = buildClient(opts); cleanup.push(f.root); return f; };
  try {
    // demonstration
    const names = readdirSync(dir);
    for (const f of ['sitemap.xml', 'robots.txt', 'llms.txt']) if (names.includes(f)) problems.push(`the demonstration build contains ${f}: it must stay noindex with no search files`);
    for (const f of pagesOf(dir)) {
      const h = readFileSync(join(dir, f), 'utf8');
      if (!h.includes('<meta name="robots" content="noindex, nofollow">')) problems.push(`${f}: the demonstration must carry the noindex, nofollow robots meta`);
      if (/rel="canonical"|application\/ld\+json/.test(h)) problems.push(`${f}: the demonstration must have no canonical link and no structured data`);
    }
    const demoCfg = loadCfg(projectDir, join(projectDir, 'config'));
    problems.push(...metadataProblems({ pagesHtml: Object.fromEntries(pagesOf(dir).map((f) => [f, readFileSync(join(dir, f), 'utf8')])), cfg: demoCfg, indexable: false }).map((m) => `demonstration: ${m}`));
    // the review record of the crawler identities (Gate 5 Phase 4): complete, dated, sourced, and the same list as the policy
    try {
      const rec = readJson(join(engDir, 'search-crawler-verification.json'));
      const cp = crawlerRecordProblems({ record: rec });
      problems.push(...cp.map((m) => `crawler record: ${m}`));
      if (!cp.length) notes.push(`crawler identities: ${rec.agents.length} agents in the policy each confirmed against the provider's documentation on ${rec.verifiedOn} (${rec.confirmedByPerson ? 'a person re-read the pages' : 'from search summaries of the official pages; no person has re-read them yet, so the release gate will not accept it'}); ${rec.identitiesNotInPolicy.length} further identities recorded for the owner`);
    } catch (e) { problems.push(`crawler record: cannot be read (${e.message})`); }
    notes.push(`demonstration: all ${NUMBER_WORDS[pagesOf(dir).length] || pagesOf(dir).length} pages noindex, nofollow; unique titles and descriptions; no og:url, canonical, JSON-LD, sitemap.xml, robots.txt or llms.txt (it is a fictional concept and is never presented as a real ${requireIndustry().businessNoun})`);

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
    const h = fx({ edit: (n, o) => { if (n === 'client') { o.brand.name = `${fixtureNames.brand} ${evil}`; o.seo.business.address.streetAddress = evil; o.address.lines[0] = evil; requireIndustry().hostileFields(o.seo.business, evil); } } });
    if (h.status !== 0) problems.push(`hostile-text fixture failed to build: ${h.text.slice(0, 200)}`);
    else {
      for (const f of [...pagesOf(h.dir), 'sitemap.xml', 'robots.txt']) { const t = readFileSync(join(h.dir, f), 'utf8'); if (/<img src=x|<script>alert|<\/script><script>/.test(t)) problems.push(`hostile configuration text became markup in ${f}`); }
      const ld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(readFileSync(join(h.dir, 'index.html'), 'utf8'));
      if (!ld || /[<>]/.test(ld[1]) || JSON.parse(ld[1]).address.streetAddress !== evil) problems.push('hostile text must survive in the JSON-LD only as escaped data');
      else notes.push('hostile configuration text (script, tag and attribute breakouts) stays escaped data in the JSON-LD, pages and sitemap');
    }
    // a base URL with a path
    const sub = fx({ base: `https://example.test/clients/${fixtureNames.short}` });
    if (sub.status !== 0) problems.push(`subpath fixture failed: ${sub.text.slice(0, 200)}`);
    else { const c = checkSeoClient({ fixture: sub }); problems.push(...c.problems.map((m) => `base URL with a path: ${m}`)); if (!/robots\.txt is only read at the root/.test(sub.text)) problems.push('the build must warn that robots.txt only works at the domain root when the base URL has a path'); else notes.push('a base URL with a path works and the build warns that robots.txt belongs at the domain root'); }
    // validation messages
    const bads = [
      ['an http base URL', { edit: (n, o) => { if (n === 'client') o.seo.baseUrl = `http://${fixtureNames.short}.example.test`; } }, /https/],
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
    // staging and example hosts are recognised; real-looking domains are not
    const n = fixtureNames.short;
    const reservedYes = [`${n}.example.test`, 'example.com', 'www.example.org', 'localhost', '127.0.0.1', '10.1.2.3', `${n}.pages.dev`, `${n}.vercel.app`, `${n}.netlify.app`, `staging.${n}.com`, `preview.${n}.com`, `${n}.local`, 'intranet.corp', `${n}.github.io`, n];
    const reservedNo = [`www.${fixtureNames.compact}.com`, `${fixtureNames.compact}.co.uk`, requireIndustry().realLookingDomain, fixtureNames.productionHost];
    for (const h of reservedYes) if (!isReservedHost(h)) problems.push(`${h} must be recognised as a staging, example or local host`);
    for (const h of reservedNo) if (isReservedHost(h)) problems.push(`${h} must not be treated as a staging host`);
    notes.push(`staging and example hosts: ${reservedYes.length} reserved, preview and local names recognised, ${reservedNo.length} real-looking domains not flagged; the fixture's own host ${reservedBase(loadCfg(ok.dir, ok.cfgDir)) || '(none)'} is reserved by design`);
    // a production-shaped domain builds clean end to end
    const prod = fx({ base: `https://${fixtureNames.productionHost}`, edit: (n, o) => { if (n === 'client') { o.seo.host = 'cloudflare-pages'; o.seo.urlStyle = 'clean'; o.seo.crawlers = { search: 'allow', aiSearch: 'allow', training: 'disallow' }; } } });
    if (prod.status !== 0) problems.push(`production-shaped fixture failed to build: ${prod.text.slice(0, 200)}`);
    else {
      const c = checkSeoClient({ fixture: prod }); problems.push(...c.problems.map((m) => `production-shaped build: ${m}`));
      if (reservedBase(loadCfg(prod.dir, prod.cfgDir))) problems.push('the production-shaped fixture must not be a reserved host');
    }
    // the final public URL on each host, with the host's documented behaviour simulated (nothing is deployed)
    const hostsTested = [];
    for (const [label, opts] of [
      ['Cloudflare Pages (extension-less URLs, .html redirected)', { edit: (n, o) => { if (n === 'client') { o.seo.host = 'cloudflare-pages'; o.seo.urlStyle = 'clean'; } } }],
      ['Vercel with cleanUrls true', { edit: (n, o) => { if (n === 'client') { o.seo.host = 'vercel'; o.seo.urlStyle = 'clean'; } } }],
      ['Vercel default (no cleanUrls, .html served as named)', { edit: (n, o) => { if (n === 'client') { o.seo.host = 'vercel'; o.seo.urlStyle = 'extension'; } } }],
      ['a plain static server', {}],
    ]) {
      const f = fx(opts);
      if (f.status !== 0) { problems.push(`${label}: fixture failed to build: ${f.text.slice(0, 200)}`); continue; }
      const c = checkSeoClient({ fixture: f }); problems.push(...c.problems.map((m) => `${label}: ${m}`));
      const cfgF = loadCfg(f.dir, f.cfgDir);
      const urls = [...cfgF.pages.map((pg) => publicUrl(cfgF, pg)), ...readSitemap(readFileSync(join(f.dir, 'sitemap.xml'), 'utf8')).urls.map((u) => u.loc), ...readLlms(readFileSync(join(f.dir, 'llms.txt'), 'utf8')).links.map((l) => l.url)];
      const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(readFileSync(join(f.dir, 'index.html'), 'utf8'))[1]); urls.push(ld.url, ld.hasMenu);
      const r = await urlStrategyProblems({ dir: f.dir, cfg: cfgF, publicUrls: urls });
      problems.push(...r.problems.map((m) => `${label}: ${m}`));
      hostsTested.push(`${label}: ${r.sim}, ${urls.length} public URLs answer 200 directly, ${r.links} internal links resolve${r.hops ? ` (${r.hops} redirect once to the same final page)` : ''}`);
    }
    notes.push(`host-aware public URLs (simulated, nothing deployed): ${hostsTested.join('; ')}`);
    // crawler policy variants
    let crawlerOk = 0;
    for (const crawlers of [{ search: 'allow', aiSearch: 'allow', training: 'allow' }, { search: 'allow', aiSearch: 'disallow', training: 'allow' }, { search: 'allow', aiSearch: 'allow', training: 'disallow' }, { search: 'allow', aiSearch: 'disallow', training: 'disallow' }]) {
      const f = fx({ edit: (n, o) => { if (n === 'client') o.seo.crawlers = crawlers; } });
      if (f.status !== 0) { problems.push(`crawler policy ${JSON.stringify(crawlers)} failed to build: ${f.text.slice(0, 160)}`); continue; }
      const m = robotsProblems({ text: readFileSync(join(f.dir, 'robots.txt'), 'utf8'), cfg: loadCfg(f.dir, f.cfgDir) });
      if (m.length) problems.push(...m.map((x) => `crawler policy ${JSON.stringify(crawlers)}: ${x}`)); else crawlerOk++;
    }
    notes.push(`crawler policy: ${crawlerOk}/4 variants (all allowed, AI search blocked, training blocked, both blocked) render exactly the configured groups; search indexing can never be blocked on an indexable build`);
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
        const noise = []; let known = 0;
        await page.addInitScript(() => { window.__v = []; window.addEventListener('securitypolicyviolation', (e) => window.__v.push(e.violatedDirective), true); });
        page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) { if (engineNoise(browserName, m.text())) known++; else noise.push(m.text().slice(0, 100)); } });
        await page.goto(sv.base); await page.waitForTimeout(800);
        const st = await page.evaluate(() => ({ v: window.__v, ld: JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)['@type'] }));
        if (st.v.length || noise.length) problems.push(`the client Home page under the CSP: violations ${JSON.stringify(st.v)}, console ${JSON.stringify(noise)}`);
        else notes.push(`the client Home page loads under the CSP with the JSON-LD block (${st.ld}): 0 violations, ${known ? `${known} known ${browserName} console warning(s) about the media-qualified hero preload (F-G5-02), no others` : '0 console messages'}`);
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
