// check:selftest-gate4. Targeted negative tests for the Gate 4 checks (HTML validation, internal links, SEO output, release gate, hosting files).
// Each test damages a COPY of the delivered site, a client build, a configuration, the gate's input or the host files in a way a real mistake
// could, runs the real check, and requires it to report the defect. Nothing in the working tree or the baseline is touched. Options: --only <text>
import { appendFileSync, cpSync, readFileSync, rmSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { validateHtml, probeTelWrapping } from './html.mjs';
import { scanLinks, checkSearchAgreement } from './links.mjs';
import { checkPhone, WIDTHS as PHONE_WIDTHS } from './phone.mjs';
import { checkSeo, checkSeoClient, readSitemap, readRobots } from './seo.mjs';
import { findSearchReview } from '../lib/approvals.mjs';
import { searchDigest } from '../lib/release.mjs';
import { crawlerRecordProblems, crawlerReviewGaps, llmsProblems, readLlms, robotsProblems, urlStrategyProblems, metadataProblems, factsProblems, hostProblems, pageText } from '../lib/search.mjs';
import { isReservedHost, publicUrl } from '../../src/lib/seo.mjs';
import { checkFolder, checkHeadersFile } from './hosting.mjs';
import { greenClientContext, policyProblems } from './release.mjs';
import { buildClient } from '../lib/client-fixture.mjs';
import { evaluateGate, loadReleasePolicy } from '../lib/release.mjs';
import { reconcile } from '../lib/findings.mjs';
import { loadPolicy, noindexState, renderHeadersFile, robotsHeaders } from '../lib/security.mjs';
import { assembleCandidate, pagesOf } from '../lib/site.mjs';
import { isMain, projectDir, readJson, tempDir } from '../lib/git.mjs';
import { collectExternal, recordProblems, registryProblems, verifyUrl } from '../lib/external.mjs';
import { mediaRightsProblems } from '../lib/media-rights.mjs';

const edit = (file, fn) => { const before = readFileSync(file, 'utf8'), after = fn(before); if (after === before) throw new Error(`the edit changed nothing in ${file}: the test would prove nothing`); writeFileSync(file, after); };
const clone = (o) => JSON.parse(JSON.stringify(o));
const sandbox = [];
const demoDir = () => { const d = assembleCandidate(projectDir, 'g4'); sandbox.push(d); return d; };
let pristine = null;                    // one client build, copied for every test that edits output
const client = () => {
  if (!pristine) { pristine = buildClient({ label: 'g4-client' }); sandbox.push(pristine.root); if (pristine.status !== 0) throw new Error('client fixture failed: ' + pristine.text.slice(0, 200)); }
  const root = tempDir('g4-copy'); sandbox.push(root); cpSync(pristine.root, root, { recursive: true });
  return { root, dir: join(root, 'site'), cfgDir: join(root, 'config') };
};
const htmlOf = async (dir, file) => (await validateHtml([[file, readFileSync(join(dir, file), 'utf8')]], 'x')).problems;
const seoOf = (fx) => checkSeoClient({ fixture: fx }).problems;
const linksOf = (dir) => scanLinks({ root: dir }).problems;
const gate = (over) => evaluateGate(greenClientContext(over));
const blockedBy = (r) => (r.allowed ? [] : r.requirements.filter((x) => !x.ok).map((x) => `${x.id}: ${x.detail}`));
const badConfig = (edit_) => { const f = buildClient({ edit: edit_, label: 'g4-bad' }); sandbox.push(f.root); return f.status === 0 ? [] : [f.text]; };

// ---- helpers for the search-readiness cases (Gate 4 reconciliation)
const cfgOf = (fx) => ({ client: readJson(join(fx.cfgDir, 'client.json')), copy: readJson(join(fx.cfgDir, 'copy.json')), pages: readJson(join(fx.cfgDir, 'site.json')).pages });
const htmlMap = (fx, cfg) => Object.fromEntries(cfg.pages.map((p) => [p.file, readFileSync(join(fx.dir, p.file), 'utf8')]));
const llmsOf = (fx) => { const cfg = cfgOf(fx); return llmsProblems({ text: readFileSync(join(fx.dir, 'llms.txt'), 'utf8'), cfg, pagesHtml: htmlMap(fx, cfg), sitemapUrls: readSitemap(readFileSync(join(fx.dir, 'sitemap.xml'), 'utf8')).urls.map((u) => u.loc) }); };
const robotsOf = (fx) => robotsProblems({ text: readFileSync(join(fx.dir, 'robots.txt'), 'utf8'), cfg: cfgOf(fx) });
const build = (edit_, opts = {}) => { const f = buildClient({ edit: edit_, label: 'g4-sr', ...opts }); sandbox.push(f.root); if (f.status !== 0) throw new Error('fixture failed: ' + f.text.slice(0, 200)); return f; };
const clientFx = (h, c) => build((n, o) => { if (n === 'client') { o.seo.host = h; o.seo.urlStyle = c; } });
const publicUrlsOf = (fx) => { const cfg = cfgOf(fx); const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(readFileSync(join(fx.dir, 'index.html'), 'utf8'))[1]); return [...cfg.pages.map((p) => publicUrl(cfg, p)), ...readSitemap(readFileSync(join(fx.dir, 'sitemap.xml'), 'utf8')).urls.map((u) => u.loc), ...readLlms(readFileSync(join(fx.dir, 'llms.txt'), 'utf8')).links.map((l) => l.url), ld.url, ld.hasMenu]; };
const strategy = async (fx, host = null) => (await urlStrategyProblems({ dir: fx.dir, cfg: cfgOf(fx), publicUrls: publicUrlsOf(fx), host })).problems;
const wholeSeo = (fx) => checkSeoClient({ fixture: fx }).problems;
const crawlers = (c) => build((n, o) => { if (n === 'client') o.seo.crawlers = c; });
const css = (d, rule) => appendFileSync(join(d, 'styles.css'), '\n' + rule + '\n');
const phoneOf = (d, file = 'visit-us.html') => checkPhone({ root: d, pages: [file], widths: [PHONE_WIDTHS[0], PHONE_WIDTHS[3]] }).then((r) => r.problems);

// ---- helpers for the Gate 5 Phase 5 cases (external destinations, verification classes, the media rights inventory)
const registryOf = () => readJson(join(projectDir, 'engineering', 'external-destinations.json'));
const historyOf = () => readJson(join(projectDir, 'engineering', 'external-links-verification.json'));
const extProblems = (dir, registry = registryOf()) => registryProblems({ registry, found: collectExternal(dir) });
const resp = (status, headers = {}) => ({ status, headers: new Headers(headers), body: null });
// a scripted network: url -> list of answers in order (a number is a status, [status, {location}] a redirect, an Error is thrown); nothing leaves the process
const scripted = (map) => { const seen = {}; return async (url, { method }) => { const key = `${method} ${url}`, alt = `* ${url}`; const list = map[key] || map[alt]; if (!list) throw Object.assign(new Error('unscripted'), { cause: { code: 'ENOTFOUND' } }); const i = seen[key] = (seen[key] ?? -1) + 1; const a = list[Math.min(i, list.length - 1)]; if (a instanceof Error) throw a; return Array.isArray(a) ? resp(a[0], a[1]) : resp(a); }; };
const certErr = () => Object.assign(new Error('fetch failed'), { cause: { code: 'CERT_HAS_EXPIRED' } });
const dnsErr = () => Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } });
const verdict = async (url, map, opts = {}) => { const r = await verifyUrl(url, { fetchImpl: scripted(map), sleep: async () => {}, delayMs: 0, ...opts }); return r.class === 'verified' ? [] : [`${r.class}: ${r.detail}`]; };
const recBase = () => ({ records: [{ id: 'EXTV-1', date: '2026-10-11', runner: { kind: 'github-actions', description: 'a hosted runner with a network' }, registryDigest: 'a'.repeat(64), results: [{ url: 'https://example.org/', kind: 'link', class: 'verified', finalUrl: 'https://example.org/', finalStatus: 200, chain: [{ url: 'https://example.org/', status: 200, method: 'HEAD' }], attempts: 1, detail: 'answered directly' }] }] });
const recFile = (mutate) => { const f = recBase(); mutate(f.records[0], f); return recordProblems({ file: f, today: '2026-10-12' }); };
const invOf = () => clone(readJson(join(projectDir, 'engineering', 'media-rights-inventory.json')));
const rights = (dir, mutate = () => {}, { approvals = [], licence } = {}) => { const inv = invOf(); mutate(inv); const lic = licence ?? readFileSync(join(dir, 'fonts', 'LICENSES.txt'), 'utf8'); const r = mediaRightsProblems({ inventory: inv, root: dir, approvals, licenceText: typeof lic === 'function' ? lic(readFileSync(join(dir, 'fonts', 'LICENSES.txt'), 'utf8')) : lic }); return r.problems.map((x) => x.detail); };
const fontNotices = (dir) => mediaRightsProblems({ inventory: invOf(), root: dir, approvals: [], licenceText: readFileSync(join(dir, 'fonts', 'LICENSES.txt'), 'utf8') }).notices.map((x) => x.detail);
const GREEN = () => greenClientContext();
const crawlerRecord = () => clone(readJson(join(projectDir, 'engineering', 'search-crawler-verification.json')));
const recProblems = (fn, over = {}) => { const r = crawlerRecord(); fn(r); return crawlerRecordProblems({ record: r, today: '2026-10-12', ...over }); };

// [name, async () => problems[], expected regex]
const cases = [
  // ---- HTML validation (demonstration pages)
  ['html: an unclosed <div>', async () => { const d = demoDir(); edit(join(d, 'menu.html'), (t) => t.replace('<main id="main">', '<main id="main"><div>')); return htmlOf(d, 'menu.html'); }, /close|element|unclosed|end tag/i],
  ['html: a duplicate id', async () => { const d = demoDir(); edit(join(d, 'index.html'), (t) => t.replace('<main id="main">', '<main id="main"><p id="main">x</p>')); return htmlOf(d, 'index.html'); }, /id|unique|duplicate/i],
  ['html: an image without alt text', async () => { const d = demoDir(); edit(join(d, 'our-story.html'), (t) => t.replace('</main>', '<img src="media/hero-wok.webp" width="10" height="10"></main>')); return htmlOf(d, 'our-story.html'); }, /alt/i],
  ['html: a <p> inside a <ul>', async () => { const d = demoDir(); edit(join(d, 'visit-us.html'), (t) => t.replace('</main>', '<ul><p>x</p></ul></main>')); return htmlOf(d, 'visit-us.html'); }, /permitted|content|child|element/i],
  ['html: a heading level skipped', async () => { const d = demoDir(); edit(join(d, 'order-online.html'), (t) => t.replace('</main>', '<h5>x</h5></main>')); return htmlOf(d, 'order-online.html'); }, /heading|level/i],
  ['html: the lang attribute removed', async () => { const d = demoDir(); edit(join(d, 'index.html'), (t) => t.replace(/<html lang="[^"]*"/, '<html')); return htmlOf(d, 'index.html'); }, /lang/i],
  ['html: an invalid attribute value', async () => { const d = demoDir(); edit(join(d, 'index.html'), (t) => t.replace('</main>', '<button type="push">x</button></main>')); return htmlOf(d, 'index.html'); }, /type|value/i],
  ['html: a button with no accessible name', async () => { const d = demoDir(); edit(join(d, 'index.html'), (t) => t.replace('</main>', '<button type="button"></button></main>')); return htmlOf(d, 'index.html'); }, /text|name|empty|content/i],
  ['html: a rule switched off without a recorded reason', async () => { const d = demoDir(); const cfg = clone(readJson(join(projectDir, 'engineering', 'htmlvalidate.json'))); delete cfg.disabled['tel-non-breaking']; return (await validateHtml([['index.html', readFileSync(join(d, 'index.html'), 'utf8')]], 'x', cfg)).problems; }, /without a recorded reason/],
  ['html: a phone number that can wrap is counted (F-G4-01 cannot grow)', async () => { const d = demoDir(); edit(join(d, 'index.html'), (t) => t.replace('</main>', '<p><a href="tel:+15550100188">(555) 010-0188</a></p></main>')); const n = await probeTelWrapping(pagesOf(d).map((f) => [f, readFileSync(join(d, f), 'utf8')])); return reconcile('html', [{ key: 'html:tel-non-breaking', detail: 'more', value: n }]).problems; }, /worse than the known finding F-G4-01/],

  // ---- internal links
  ['links: a link to a page that does not exist', () => { const d = demoDir(); edit(join(d, 'index.html'), (t) => t.replace('href="menu.html"', 'href="menus.html"')); return linksOf(d); }, /does not exist/],
  ['links: a link with the wrong letter case', () => { const d = demoDir(); edit(join(d, 'index.html'), (t) => t.replace('href="menu.html"', 'href="Menu.html"')); return linksOf(d); }, /exact letter case|does not exist/],
  ['links: a fragment that points at no element', () => { const d = demoDir(); edit(join(d, 'index.html'), (t) => t.replace('href="menu.html"', 'href="menu.html#nowhere"')); return linksOf(d); }, /no element with id "nowhere"/],
  ['links: a skip link to a missing id', () => { const d = demoDir(); edit(join(d, 'menu.html'), (t) => t.replace('href="#main"', 'href="#content"')); return linksOf(d); }, /no element with id "content"/],
  ['links: a bare # link', () => { const d = demoDir(); edit(join(d, 'index.html'), (t) => t.replace('</main>', '<p><a href="#">x</a></p></main>')); return linksOf(d); }, /bare "#"/],
  ['links: a javascript: link', () => { const d = demoDir(); edit(join(d, 'index.html'), (t) => t.replace('</main>', '<p><a href="javascript:void(0)">x</a></p></main>')); return linksOf(d); }, /javascript:/],
  ['links: an empty href', () => { const d = demoDir(); edit(join(d, 'index.html'), (t) => t.replace('</main>', '<p><a href="">x</a></p></main>')); return linksOf(d); }, /empty/],
  ['links: a missing image file', () => { const d = demoDir(); rmSync(join(d, 'media', 'hero-wok.webp')); return linksOf(d); }, /hero-wok\.webp.*does not exist/],
  ['links: a missing font referenced by the stylesheet', () => { const d = demoDir(); const f = readFileSync(join(d, 'styles.css'), 'utf8').match(/url\(['"]?(fonts\/[^)'"]+)/)[1]; rmSync(join(d, f)); return linksOf(d); }, /does not exist/],
  ['links: an http (not https) external link', () => { const d = demoDir(); edit(join(d, 'visit-us.html'), (t) => t.replace('</main>', '<p><a href="http://example.test/">x</a></p></main>')); return linksOf(d); }, /not https/],
  ['links: a malformed phone link', () => { const d = demoDir(); edit(join(d, 'visit-us.html'), (t) => t.replace('</main>', '<p><a href="tel:call-us">x</a></p></main>')); return linksOf(d); }, /malformed tel:/],
  ['links: a malformed mailto link', () => { const d = demoDir(); edit(join(d, 'visit-us.html'), (t) => t.replace('</main>', '<p><a href="mailto:nobody">x</a></p></main>')); return linksOf(d); }, /malformed mailto:/],
  ['links: a link that leaves the site folder', () => { const d = demoDir(); edit(join(d, 'index.html'), (t) => t.replace('</main>', '<p><a href="../../etc/passwd">x</a></p></main>')); return linksOf(d); }, /leaves the site folder/],
  ['links: a page that nothing links to (orphan)', () => { const d = demoDir(); for (const f of pagesOf(d)) if (f !== 'order-online.html') edit(join(d, f), (t) => t.split('href="order-online.html"').join('href="menu.html"')); return linksOf(d); }, /cannot be reached|does not link to order-online\.html/],
  ['links: a dead-end page', () => { const d = demoDir(); edit(join(d, 'our-story.html'), (t) => t.replace(/href="(index|menu|visit-us|order-online)\.html[^"]*"/g, 'href="our-story.html"')); return linksOf(d); }, /dead end|does not link to/],
  ['links: a link with stray whitespace', () => { const d = demoDir(); edit(join(d, 'index.html'), (t) => t.replace('href="menu.html"', 'href=" menu.html"')); return linksOf(d); }, /whitespace/],
  ['links: sitemap lists a page that is not delivered', () => { const fx = client(); edit(join(fx.dir, 'sitemap.xml'), (t) => t.replace('menu.html', 'carte.html')); return checkSearchAgreement({ dir: fx.dir, base: 'https://jadeandember.example.test' }); }, /not a delivered page|canonical/],
  ['links: a canonical that the sitemap does not list', () => { const fx = client(); edit(join(fx.dir, 'menu.html'), (t) => t.replace(/(<link rel="canonical" href=")[^"]*"/, '$1https://jadeandember.example.test/other.html"')); return checkSearchAgreement({ dir: fx.dir, base: 'https://jadeandember.example.test' }); }, /canonical/],

  // ---- SEO: configuration refused by the build
  ['seo config: the demonstration made indexable', () => badConfig((n, o) => { if (n === 'client') { o.flags.demo = true; o.seo.noindex = false; } }), /noindex|demonstration/i],
  ['seo config: structured data on a noindex build', () => badConfig((n, o) => { if (n === 'client') { o.seo.noindex = true; o.seo.structuredData = true; } }), /structuredData/],
  ['seo config: a base URL with http', () => badConfig((n, o) => { if (n === 'client') o.seo.baseUrl = 'http://jade.example.test'; }), /https/],
  ['seo config: a base URL on localhost', () => badConfig((n, o) => { if (n === 'client') o.seo.baseUrl = 'https://localhost'; }), /localhost|public address/],
  ['seo config: a base URL with a query', () => badConfig((n, o) => { if (n === 'client') o.seo.baseUrl = 'https://jade.example.test/?a=1'; }), /query|plain https/],
  ['seo config: an indexable build with no base URL', () => badConfig((n, o) => { if (n === 'client') delete o.seo.baseUrl; }), /baseUrl/],
  ['seo config: structured data without business details', () => badConfig((n, o) => { if (n === 'client') delete o.seo.business; }), /business/],
  ['seo config: a phone number that is not international', () => badConfig((n, o) => { if (n === 'client') o.contact.phone.href = 'tel:5550100'; }), /international|tel:/],
  ['seo config: opening hours that cannot be parsed', () => badConfig((n, o) => { if (n === 'client') o.hours.rows[0].time = 'when we feel like it'; }), /opening hours|time/i],
  ['seo config: a business image that does not exist', () => badConfig((n, o) => { if (n === 'client') o.seo.business.image = 'media/nope.webp'; }), /image|exist/i],
  ['seo config: a sameAs link that is not https', () => badConfig((n, o) => { if (n === 'client') o.seo.business.sameAs = ['http://social.example.test/jade']; }), /sameAs/],
  ['seo config: an invalid last-modified date', () => badConfig((n, o) => { if (n === 'client') o.seo.lastModified = 'yesterday'; }), /lastModified/],

  // ---- SEO: output defects
  ['seo output: two pages share a canonical', () => { const fx = client(); edit(join(fx.dir, 'menu.html'), (t) => t.replace(/(<link rel="canonical" href=")[^"]*"/, '$1https://jadeandember.example.test/"')); return seoOf(fx); }, /canonical/],
  ['seo output: canonical on the wrong host', () => { const fx = client(); edit(join(fx.dir, 'index.html'), (t) => t.replace('https://jadeandember.example.test/', 'https://other.example.test/')); return seoOf(fx); }, /canonical/],
  ['seo output: a canonical link missing', () => { const fx = client(); edit(join(fx.dir, 'visit-us.html'), (t) => t.replace(/<link rel="canonical"[^>]*>\n?/, '')); return seoOf(fx); }, /canonical/],
  ['seo output: an indexable page keeps a noindex meta', () => { const fx = client(); edit(join(fx.dir, 'index.html'), (t) => t.replace('</head>', '<meta name="robots" content="noindex, nofollow"></head>')); return seoOf(fx); }, /robots meta/],
  ['seo output: the sitemap loses a page', () => { const fx = client(); edit(join(fx.dir, 'sitemap.xml'), (t) => t.replace(/<url>(?:(?!<\/url>)[\s\S])*menu\.html(?:(?!<\/url>)[\s\S])*<\/url>\s*/, '')); return seoOf(fx); }, /sitemap/],
  ['seo output: the sitemap is not well formed', () => { const fx = client(); edit(join(fx.dir, 'sitemap.xml'), (t) => t.replace('</urlset>', '')); return seoOf(fx); }, /sitemap/],
  ['seo output: a sitemap URL with http', () => { const fx = client(); edit(join(fx.dir, 'sitemap.xml'), (t) => t.replace('https://', 'http://')); return seoOf(fx); }, /sitemap|https/],
  ['seo output: robots.txt disallows everything', () => { const fx = client(); edit(join(fx.dir, 'robots.txt'), (t) => t.replace(/Allow: \//, 'Disallow: /')); return seoOf(fx); }, /robots/],
  ['seo output: robots.txt names no sitemap', () => { const fx = client(); edit(join(fx.dir, 'robots.txt'), (t) => t.replace(/Sitemap:.*\n?/, '')); return seoOf(fx); }, /robots/],
  ['seo output: structured data on a second page', () => { const fx = client(); edit(join(fx.dir, 'menu.html'), (t) => t.replace('</head>', '<script type="application/ld+json">{}</script></head>')); return seoOf(fx); }, /only the Home page/],
  ['seo output: structured data that is not valid JSON', () => { const fx = client(); edit(join(fx.dir, 'index.html'), (t) => t.replace(/("@type": ?"Restaurant")/, '$1,')); return seoOf(fx); }, /JSON-LD/],
  ['seo output: structured data with a raw < (script breakout)', () => { const fx = client(); edit(join(fx.dir, 'index.html'), (t) => t.replace(/("name": ?")/, '$1</script><b>')); return seoOf(fx); }, /raw < or >|JSON-LD/],
  ['seo output: structured data names a phone number that is not the page\'s', () => { const fx = client(); edit(join(fx.dir, 'index.html'), (t) => t.replace('+442079460000', '+449999999999')); return seoOf(fx); }, /telephone|phone/i],
  ['seo output: structured data asserts media rights (license)', () => { const fx = client(); edit(join(fx.dir, 'index.html'), (t) => t.replace(/("@type": ?"Restaurant",?)/, '$1 "license": "https://creativecommons.org/publicdomain/zero/1.0/",')); return seoOf(fx); }, /rights|license/i],
  ['seo output: page text claiming the images are royalty-free', () => { const fx = client(); edit(join(fx.dir, 'our-story.html'), (t) => t.replace('</main>', '<p>All photographs are royalty-free.</p></main>')); return seoOf(fx); }, /claims media rights/],
  ['seo output: a sitemap with a bad date', () => { const fx = client(); edit(join(fx.dir, 'sitemap.xml'), (t) => t.replace(/<lastmod>[^<]*/, '<lastmod>10/10/2026')); return seoOf(fx); }, /lastmod/],
  ['seo parsers: sitemap and robots readers reject junk', () => [...readSitemap('<html>').errors, ...readRobots('garbage').errors], /./],
  ['seo output: an inline script added to a client page breaks the security policy', () => { const fx = client(); edit(join(fx.dir, 'menu.html'), (t) => t.replace('</body>', '<script>alert(1)</script></body>')); return seoOf(fx); }, /security|inline/i],

  // ---- release gate (invented states; the full single-defect matrix is in check:release)
  ['release: the real demonstration cannot be released as client-production', () => blockedBy(gate({ channel: 'client-production', client: (() => { const c = GREEN().client; c.flags.demo = true; c.seo.noindex = true; return c; })() })), /demonstration|noDemoText|productionSeo|channel/i],
  ['release: an indexable demonstration is blocked', () => blockedBy(gate({ channel: 'demonstration', version: { ...GREEN().version, channel: 'demonstration', version: '0.9.0-dev' }, pkg: { ...GREEN().pkg, version: '0.9.0-dev' }, client: (() => { const c = GREEN().client; c.flags.demo = true; c.seo.noindex = false; return c; })() })), /demoStaysNoindex|noindex/i],
  ['release: no release approval', () => blockedBy(gate({ approvals: GREEN().approvals.filter((a) => a.type !== 'release-approval') })), /releaseApproval/],
  ['release: an approval for a different commit', () => blockedBy(gate({ approvals: GREEN().approvals.map((a) => (a.type === 'release-approval' ? { ...a, decision: a.decision.replace('a'.repeat(40), 'f'.repeat(40)) } : a)) })), /releaseApproval/],
  ['release: media rights not verified', () => blockedBy(gate({ approvals: GREEN().approvals.filter((a) => a.type !== 'rights-verification') })), /rightsVerification/],
  ['release: an uncommitted change', () => blockedBy(gate({ git: { ...GREEN().git, dirty: true } })), /cleanTree/],
  ['release: verification run on other bytes', () => blockedBy(gate({ verify: { ...GREEN().verify, assetsTree: 'OTHER' } })), /verifyPassed/],
  ['release: only the fast verification run', () => blockedBy(gate({ verify: { ...GREEN().verify, mode: 'fast' } })), /verifyPassed/],
  ['release: an open Major finding', () => blockedBy(gate({ findings: [{ id: 'F-X', severity: 'Major', visual: false, status: 'open' }] })), /noBlockingFindings/],
  ['release: no real-device evidence', () => blockedBy(gate({ evidence: GREEN().evidence.filter((e) => e.type !== 'real-device') })), /real-device/],
  ['release: a pre-release version', () => blockedBy(gate({ version: { ...GREEN().version, version: '1.0.0-rc.1' }, pkg: { ...GREEN().pkg, version: '1.0.0-rc.1' } })), /stableVersion/],
  ['release: the policy file loses the release-approval requirement', () => { const p = clone(loadReleasePolicy()); p.channels['client-production'].requires = p.channels['client-production'].requires.filter((r) => r !== 'releaseApproval'); return policyProblems(p); }, /client-production must require releaseApproval/],
  ['release: the policy names a requirement the gate does not implement', () => { const p = clone(loadReleasePolicy()); p.channels['client-production'].requires.push('somethingElse'); return policyProblems(p); }, /does not implement/],
  ['release: the demonstration policy loses the noindex requirement', () => { const p = clone(loadReleasePolicy()); p.channels.demonstration.requires = p.channels.demonstration.requires.filter((r) => r !== 'demoStaysNoindex'); return policyProblems(p); }, /demoStaysNoindex/],


  // ---- Gate 4 reconciliation: llms.txt
  ['llms: the file is missing from an indexable build', () => { const fx = client(); rmSync(join(fx.dir, 'llms.txt')); return wholeSeo(fx); }, /llms\.txt is missing/],
  ['llms: a page is left out', () => { const fx = client(); edit(join(fx.dir, 'llms.txt'), (t) => t.replace(/- \[Menu\][^\n]*\n/, '')); return llmsOf(fx); }, /no link to menu\.html|Pages section has/],
  ['llms: a link to a different host', () => { const fx = client(); edit(join(fx.dir, 'llms.txt'), (t) => t.replace('https://jadeandember.example.test/menu.html', 'https://other.example.test/menu.html')); return llmsOf(fx); }, /not one of the site's page URLs|no link to menu|neither this site/],
  ['llms: a link that is not in the sitemap', () => { const fx = client(); edit(join(fx.dir, 'sitemap.xml'), (t) => t.replace(/<url><loc>[^<]*menu\.html<\/loc>[^\n]*\n/, '')); return llmsOf(fx); }, /not in sitemap\.xml/],
  ['llms: the address differs from the pages', () => { const fx = client(); edit(join(fx.dir, 'llms.txt'), (t) => t.replace('88 High Street', '12 Other Road')); return llmsOf(fx); }, /address .* differs|not printed on the Visit page/],
  ['llms: the phone number differs', () => { const fx = client(); edit(join(fx.dir, 'llms.txt'), (t) => t.replace('(020) 7946 0000 (+442079460000)', '(020) 7946 9999 (+442079469999)')); return llmsOf(fx); }, /phone .* differs|not printed/],
  ['llms: the opening hours differ', () => { const fx = client(); edit(join(fx.dir, 'llms.txt'), (t) => t.replace('5:00 pm – 9:30 pm', '5:00 pm – 11:30 pm')); return llmsOf(fx); }, /opening hours .* differ/],
  ['llms: an invented fact (an award)', () => { const fx = client(); edit(join(fx.dir, 'llms.txt'), (t) => t.replace('## Visit and contact\n', '## Visit and contact\n- Awards: Best restaurant in the county\n')); return llmsOf(fx); }, /not a fact the configuration supports/],
  ['llms: the cuisine differs from the structured data configuration', () => { const fx = client(); edit(join(fx.dir, 'llms.txt'), (t) => t.replace('Cuisine: Chinese, Modern Chinese', 'Cuisine: Italian')); return llmsOf(fx); }, /cuisine/],
  ['llms: the ordering link points elsewhere', () => { const fx = client(); edit(join(fx.dir, 'llms.txt'), (t) => t.replace('https://order.example-restaurant.test/jade', 'https://evil.example.test/order')); return llmsOf(fx); }, /ordering|neither this site/],
  ['llms: a byte-order mark', () => { const fx = client(); edit(join(fx.dir, 'llms.txt'), (t) => '﻿' + t); return llmsOf(fx); }, /byte-order mark/],
  ['llms: carriage returns', () => { const fx = client(); edit(join(fx.dir, 'llms.txt'), (t) => t.replace(/\n/g, '\r\n')); return llmsOf(fx); }, /carriage returns/],
  ['llms: no trailing newline', () => { const fx = client(); edit(join(fx.dir, 'llms.txt'), (t) => t.replace(/\n$/, '')); return llmsOf(fx); }, /exactly one newline/],
  ['llms: not a Markdown title', () => { const fx = client(); edit(join(fx.dir, 'llms.txt'), (t) => t.replace(/^# /, '')); return llmsOf(fx); }, /first line must be/],
  ['llms: a local path leaks in', () => { const fx = client(); edit(join(fx.dir, 'llms.txt'), (t) => t + '- Build: /home/runner/work/site\n'); return llmsOf(fx); }, /internal path|local address/],
  ['llms: a secret-like word leaks in', () => { const fx = client(); edit(join(fx.dir, 'llms.txt'), (t) => t.replace('## Pages', '## Pages\n<!-- api_key=abc -->')); return llmsOf(fx); }, /secret-like|internal path/],
  ['llms: demonstration wording in a client file', () => { const fx = client(); edit(join(fx.dir, 'llms.txt'), (t) => t.replace(/^> .*$/m, '> A fictional sample restaurant.')); return llmsOf(fx); }, /demonstration or placeholder wording|summary/],
  ['llms: a licence claim about the photographs', () => { const fx = client(); edit(join(fx.dir, 'llms.txt'), (t) => t + '- Images: royalty-free\n'); return llmsOf(fx); }, /claims media rights|not a fact/],
  ['llms: a staging host for a page', () => { const fx = client(); edit(join(fx.dir, 'llms.txt'), (t) => t.replace('https://jadeandember.example.test/', 'https://jade.pages.dev/')); return llmsOf(fx); }, /neither this site|not one of the site's page URLs|no link/],
  ['llms: the fictional demonstration must not publish llms.txt', async () => { const d = demoDir(); writeFileSync(join(d, 'llms.txt'), '# Jade & Ember\n'); return (await checkSeo({ root: d, browser: false })).problems; }, /demonstration build contains llms\.txt/],
  ['llms: a hostile business name stays on one line (must find nothing)', () => { const fx = build((n, o) => { if (n === 'client') { o.brand.name = 'Jade\n## Pages\n- [x](https://evil.test/)'; } }); const t = readFileSync(join(fx.dir, 'llms.txt'), 'utf8'); return [...(readLlms(t).links.some((l) => l.url.includes('evil')) ? ['the hostile name became a link in llms.txt'] : []), ...(t.split('\n')[0].includes('\n') ? ['title spans lines'] : [])]; }, null],

  // ---- Gate 4 reconciliation: crawler policy
  ['crawlers: the policy blocks AI search but the file does not', () => { const fx = crawlers({ search: 'allow', aiSearch: 'disallow', training: 'allow' }); writeFileSync(join(fx.dir, 'robots.txt'), 'User-agent: *\nAllow: /\n\nSitemap: https://jadeandember.example.test/sitemap.xml\n'); return robotsOf(fx); }, /class but .* is not blocked/],
  ['crawlers: a training crawler is blocked although the class is allowed', () => { const fx = client(); edit(join(fx.dir, 'robots.txt'), (t) => t.replace('\nSitemap', '\nUser-agent: GPTBot\nDisallow: /\n\nSitemap')); return robotsOf(fx); }, /GPTBot is blocked but its class is allowed/],
  ['crawlers: an agent outside the reviewed list', () => { const fx = crawlers({ search: 'allow', aiSearch: 'allow', training: 'disallow' }); edit(join(fx.dir, 'robots.txt'), (t) => t.replace('User-agent: GPTBot', 'User-agent: MadeUpBot\nUser-agent: GPTBot')); return robotsOf(fx); }, /not in the reviewed crawler list/],
  ['crawlers: a search engine is blocked', () => { const fx = client(); edit(join(fx.dir, 'robots.txt'), (t) => t.replace('\nSitemap', '\nUser-agent: Googlebot\nDisallow: /\n\nSitemap')); return robotsOf(fx); }, /Googlebot is blocked but its class is allowed/],
  ['crawlers: the whole site disallowed for everyone', () => { const fx = client(); edit(join(fx.dir, 'robots.txt'), (t) => t.replace('Allow: /', 'Disallow: /')); return wholeSeo(fx); }, /disallows the whole site|must allow crawling/],
  ['crawlers: a blocked group with a partial rule', () => { const fx = crawlers({ search: 'allow', aiSearch: 'allow', training: 'disallow' }); edit(join(fx.dir, 'robots.txt'), (t) => t.replace('Disallow: /\n\nSitemap', 'Disallow: /private\n\nSitemap')); return robotsOf(fx); }, /must be exactly "Disallow: \/"/],
  ['crawlers: a policy file that is not valid directives', () => { const fx = client(); edit(join(fx.dir, 'robots.txt'), (t) => t + 'crawl-me-maybe\n'); return robotsOf(fx); }, /is not a directive/],
  ['crawlers: search indexing may not be disallowed (build refuses)', () => { try { build((n, o) => { if (n === 'client') o.seo.crawlers = { search: 'disallow' }; }); return []; } catch (e) { return [e.message]; } }, /must not be "disallow"/],
  ['crawlers: an unknown class (build refuses)', () => { try { build((n, o) => { if (n === 'client') o.seo.crawlers = { everything: 'disallow' }; }); return []; } catch (e) { return [e.message]; } }, /not a crawler class|additional|everything/],
  ['crawlers: a value that is not allow or disallow (build refuses)', () => { try { build((n, o) => { if (n === 'client') o.seo.crawlers = { training: 'maybe' }; }); return []; } catch (e) { return [e.message]; } }, /allow|enum|training/],

  // ---- Gate 4 reconciliation: metadata, og:url, facts, hosts
  ['metadata: two pages share a title', () => { const fx = client(); const cfg = cfgOf(fx); const h = htmlMap(fx, cfg); h['menu.html'] = h['menu.html'].replace(/<title>[^<]*<\/title>/, h['index.html'].match(/<title>[^<]*<\/title>/)[0]); return metadataProblems({ pagesHtml: h, cfg, indexable: true }); }, /title .* is also the title/],
  ['metadata: two pages share a description', () => { const fx = client(); const cfg = cfgOf(fx); const h = htmlMap(fx, cfg); h['menu.html'] = h['menu.html'].replace(/<meta name="description" content="[^"]*">/, h['index.html'].match(/<meta name="description" content="[^"]*">/)[0]); return metadataProblems({ pagesHtml: h, cfg, indexable: true }); }, /description is identical/],
  ['metadata: an empty description', () => { const fx = client(); const cfg = cfgOf(fx); const h = htmlMap(fx, cfg); h['visit-us.html'] = h['visit-us.html'].replace(/<meta name="description" content="[^"]*">/, '<meta name="description" content="">'); return metadataProblems({ pagesHtml: h, cfg, indexable: true }); }, /description is empty|characters/],
  ['metadata: a missing og:url', () => { const fx = client(); edit(join(fx.dir, 'menu.html'), (t) => t.replace(/<meta property="og:url"[^>]*>\n/, '')); return wholeSeo(fx); }, /expected one og:url/],
  ['metadata: og:url is not the public URL', () => { const fx = client(); edit(join(fx.dir, 'menu.html'), (t) => t.replace(/(<meta property="og:url" content=")[^"]*"/, '$1https://jadeandember.example.test/wrong"')); return wholeSeo(fx); }, /og:url .* is not the page's public URL|og:url and canonical differ/],
  ['metadata: og:title differs from the title', () => { const fx = client(); edit(join(fx.dir, 'menu.html'), (t) => t.replace(/(<meta property="og:title" content=")[^"]*"/, '$1Something else"')); return wholeSeo(fx); }, /og:title differs/],
  ['metadata: a noindex page carries og:url', () => { const d = demoDir(); edit(join(d, 'menu.html'), (t) => t.replace('<meta property="og:type"', '<meta property="og:url" content="https://example.test/menu.html">\n<meta property="og:type"')); const cfg = { client: readJson(join(projectDir, 'config', 'client.json')), copy: readJson(join(projectDir, 'config', 'copy.json')), pages: readJson(join(projectDir, 'config', 'site.json')).pages }; return metadataProblems({ pagesHtml: Object.fromEntries(cfg.pages.map((p) => [p.file, readFileSync(join(d, p.file), 'utf8')])), cfg, indexable: false }); }, /must not carry og:url/],
  ['facts: the Visit page prints another address', () => { const fx = client(); edit(join(fx.dir, 'visit-us.html'), (t) => t.split('88 High Street').join('9 Elsewhere Lane')); return wholeSeo(fx); }, /address line .* is not printed on the Visit page/],
  ['facts: the Visit page loses an hours row', () => { const fx = client(); edit(join(fx.dir, 'visit-us.html'), (t) => t.split('4:30 pm').join('5:30 pm')); return wholeSeo(fx); }, /hours row/],
  ['facts: a page links a different phone number', () => { const fx = client(); edit(join(fx.dir, 'visit-us.html'), (t) => t.split('tel:+442079460000').join('tel:+442079469999')); return wholeSeo(fx); }, /a phone link .* differs/],
  ['facts: the structured data describes another street (build refuses)', () => { try { build((n, o) => { if (n === 'client') o.seo.business.address.streetAddress = '1 Other Street'; }); return []; } catch (e) { return [e.message]; } }, /does not appear in client\.address\.lines/],
  ['facts: the structured data telephone is not on the Visit page', () => { const fx = client(); const cfg = cfgOf(fx); const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(readFileSync(join(fx.dir, 'index.html'), 'utf8'))[1]); ld.telephone = '+449999999999'; return factsProblems({ cfg, pagesHtml: htmlMap(fx, cfg), jsonLd: ld }); }, /telephone/],
  ['facts: the structured data description differs from the Home description', () => { const fx = client(); const cfg = cfgOf(fx); const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(readFileSync(join(fx.dir, 'index.html'), 'utf8'))[1]); ld.description = 'Best food in town'; return factsProblems({ cfg, pagesHtml: htmlMap(fx, cfg), jsonLd: ld }); }, /description differs/],
  ['hosts: structured data points at a foreign host', () => { const fx = client(); const cfg = cfgOf(fx); const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(readFileSync(join(fx.dir, 'index.html'), 'utf8'))[1]); ld.hasMenu = 'https://elsewhere.example.test/menu.html'; return hostProblems({ cfg, sitemapUrls: [], jsonLd: ld, pagesHtml: htmlMap(fx, cfg) }); }, /not this site or a configured address/],
  ['hosts: the sitemap lists another host', () => { const fx = client(); edit(join(fx.dir, 'sitemap.xml'), (t) => t.replace('jadeandember.example.test/menu.html', 'staging.jade.test/menu.html')); return wholeSeo(fx); }, /not on this site's host|sitemap/],

  // ---- Gate 4 reconciliation: host-aware public URLs
  ['urls: Cloudflare Pages with extension URLs (canonicals would redirect)', async () => strategy(client(), 'cloudflare-pages'), /answers 308 .*redirect to/],
  ['urls: Vercel default with extension-less URLs (they would not be found)', async () => strategy(clientFx('vercel', 'clean'), 'vercel-default'), /answers 404/],
  ['urls: Vercel cleanUrls with extension URLs (canonicals would redirect)', async () => strategy(client(), 'vercel-clean'), /answers 308/],
  ['urls: Cloudflare Pages declared with extension URLs (build refuses)', () => { try { build((n, o) => { if (n === 'client') { o.seo.host = 'cloudflare-pages'; o.seo.urlStyle = 'extension'; } }); return []; } catch (e) { return [e.message]; } }, /redirects \.html addresses to extension-less ones/],
  ['urls: a clean-URL build keeps a .html canonical', () => { const fx = clientFx('cloudflare-pages', 'clean'); edit(join(fx.dir, 'menu.html'), (t) => t.replace(/(<link rel="canonical" href="[^"]*)\/menu"/, '$1/menu.html"')); return wholeSeo(fx); }, /canonical .* should be/],
  ['urls: a clean-URL build keeps a .html sitemap entry', () => { const fx = clientFx('cloudflare-pages', 'clean'); edit(join(fx.dir, 'sitemap.xml'), (t) => t.replace('/menu</loc>', '/menu.html</loc>')); return wholeSeo(fx); }, /sitemap\.xml must list exactly the page canonicals/],
  ['urls: structured data still names the .html menu on a clean-URL host', () => { const fx = clientFx('cloudflare-pages', 'clean'); edit(join(fx.dir, 'index.html'), (t) => t.replace(/(hasMenu":"[^"]*)\/menu"/, '$1/menu.html"')); return wholeSeo(fx); }, /hasMenu/],
  ['urls: the public URLs are correct on the hosts they were built for (must find nothing)', async () => { const a = await strategy(clientFx('cloudflare-pages', 'clean')); const b = await strategy(clientFx('vercel', 'extension')); return [...a, ...b]; }, null],

  // ---- Gate 4 reconciliation: search-review approval and fingerprint
  ['search digest: stable for identical builds, changed by any search artifact (must find nothing)', () => { const a = client(), b = client(); const d0 = searchDigest(a.dir); const out = []; if (d0 !== searchDigest(b.dir)) out.push('two identical builds have different digests'); for (const f of ['llms.txt', 'robots.txt', 'sitemap.xml']) { const c = client(); edit(join(c.dir, f), (t) => t + ' '); if (searchDigest(c.dir) === d0) out.push(`changing ${f} did not change the digest`); } const j = client(); edit(join(j.dir, 'index.html'), (t) => t.replace('"priceRange":"$$"', () => '"priceRange":"$$$"')); if (searchDigest(j.dir) === d0) out.push('changing the JSON-LD did not change the digest'); return out; }, null],
  ['search digest: the demonstration has none (must find nothing)', () => (searchDigest(demoDir()) === null ? [] : ['the demonstration has search artifacts']), null],
  ['search review: a record for another digest does not count (must find nothing)', () => (findSearchReview([{ type: 'search-review', decision: `Reviewed by Sam on 2026-10-10: business facts, structured data, crawler policy. digest: ${'a'.repeat(64)}` }], 'b'.repeat(64)) ? ['a review of other artifacts was accepted'] : []), null],


  // ---- F-G4-01: the phone numbers stay readable, operable and inside the viewport
  ['phone: a number that makes the page scroll sideways', async () => { const d = demoDir(); css(d, '.phone { display: inline-block; width: 700px; }'); return phoneOf(d); }, /scrolls sideways|outside the viewport/],
  ['phone: a number clipped by its container', async () => { const d = demoDir(); css(d, '.visit-contact { overflow: hidden; width: 60px; white-space: nowrap; }'); return phoneOf(d); }, /clipped by|outside the viewport/],
  ['phone: a number set in tiny type', async () => { const d = demoDir(); css(d, '.phone { font-size: 8px; }'); return phoneOf(d); }, /font size is 8px/],
  ['phone: a number covered by another element', async () => { const d = demoDir(); css(d, '.visit-contact { position: relative; } .visit-contact::before { content: ""; position: absolute; inset: -30px -400px; background: transparent; z-index: 5; }'); return phoneOf(d); }, /covers the number|something else/],
  ['phone: a number that cannot be pressed', async () => { const d = demoDir(); css(d, '.phone { pointer-events: none; }'); return phoneOf(d); }, /pointer-events: none/],
  ['phone: a number that is not focusable', async () => { const d = demoDir(); edit(join(d, 'visit-us.html'), (t) => t.replace('<a class="phone" href="tel:+15550100188">', '<a class="phone" tabindex="-1" href="tel:+15550100188">')); return phoneOf(d); }, /not focusable/],
  ['phone: a visible number that differs from the link', async () => { const d = demoDir(); edit(join(d, 'visit-us.html'), (t) => t.replace('href="tel:+15550100188">(555) 010-0188', 'href="tel:+15559999999">(555) 010-0188')); return phoneOf(d); }, /does not match/],
  ['phone: a block-level number with a small target', async () => { const d = demoDir(); css(d, '.phone { display: block; width: 20px; height: 14px; overflow: visible; }'); return phoneOf(d); }, /minimum 24 by 24/],
  ['phone: the number hidden from view', async () => { const d = demoDir(); css(d, '.phone { display: none; }'); return phoneOf(d); }, /not visible/],

  // ---- hosting files and the delivered folder
  ['hosting: a vercel.json in the delivered folder', () => { const d = demoDir(); writeFileSync(join(d, 'vercel.json'), '{}'); return checkFolder(d, { label: 'x' }).problems; }, /vercel\.json/],
  ['hosting: a functions folder', () => { const d = demoDir(); mkdirSync(join(d, 'functions')); writeFileSync(join(d, 'functions', 'a.js'), 'export {}'); return checkFolder(d, { label: 'x' }).problems; }, /functions/],
  ['hosting: a _redirects file', () => { const d = demoDir(); writeFileSync(join(d, '_redirects'), '/a /b 301'); return checkFolder(d, { label: 'x' }).problems; }, /_redirects/],
  ['hosting: a file over the Pages size limit', () => { const d = demoDir(); writeFileSync(join(d, 'media', 'big.mp4'), Buffer.alloc(26 * 1024 * 1024)); return checkFolder(d, { label: 'x' }).problems; }, /25 MiB/],
  ['hosting: a reference to Vercel in a page', () => { const d = demoDir(); edit(join(d, 'index.html'), (t) => t.replace('</main>', '<p>Hosted on vercel.app</p></main>')); return checkFolder(d, { label: 'x' }).problems; }, /Vercel/],
  ['hosting: a script that makes network calls', () => { const d = demoDir(); edit(join(d, 'site.js'), (t) => t + '\nfetch("/api");\n'); return checkFolder(d, { label: 'x' }).problems; }, /network calls/],
  ['hosting: a missing index.html', () => { const d = demoDir(); renameSync(join(d, 'index.html'), join(d, 'home.html')); return checkFolder(d, { label: 'x' }).problems; }, /index\.html/],
  ['hosting: the demonstration publishes a sitemap', () => { const d = demoDir(); writeFileSync(join(d, 'sitemap.xml'), '<urlset/>'); return checkFolder(d, { label: 'x' }).problems; }, /must not publish a sitemap, robots\.txt or llms\.txt/],
  ['hosting: an indexable build without robots.txt', () => { const fx = client(); rmSync(join(fx.dir, 'robots.txt')); return checkFolder(fx.dir, { client: true, label: 'x' }).problems; }, /robots\.txt, sitemap\.xml and llms\.txt/],
  ['hosting: more than 100 header rules', () => { const d = demoDir(); const t = renderHeadersFile(d, loadPolicy()) + Array.from({ length: 101 }, (_, i) => `/p${i}\n  X-A: b\n`).join(''); return checkHeadersFile(t, { root: d }); }, /100/],
  ['hosting: a header line over 2000 characters', () => { const d = demoDir(); const t = renderHeadersFile(d, loadPolicy()) + `/x\n  X-Long: ${'a'.repeat(2100)}\n`; return checkHeadersFile(t, { root: d }); }, /2000/],
  ['hosting: a security header repeated in a second rule', () => { const d = demoDir(); const t = renderHeadersFile(d, loadPolicy()) + '/menu.html\n  X-Frame-Options: DENY\n'; return checkHeadersFile(t, { root: d }); }, /only in the "\/\*" rule/],
  ['hosting: immutable caching for unhashed names', () => { const d = demoDir(); const t = renderHeadersFile(d, loadPolicy()).replace('Cache-Control: no-cache', 'Cache-Control: public, max-age=31536000, immutable'); return checkHeadersFile(t, { root: d }); }, /immutable/],
  ['hosting: a CSP that no longer matches the built pages', () => { const d = demoDir(); edit(join(d, 'index.html'), (t) => t.replace('</body>', '<script>var added=1</script></body>')); const t = renderHeadersFile(assembleCandidateRef(), loadPolicy()); return checkHeadersFile(t, { root: d }); }, /not the policy computed/],
  ['hosting: a rule that does not start at /', () => { const d = demoDir(); const t = renderHeadersFile(d, loadPolicy()) + 'menu.html\n  X-A: b\n'; return checkHeadersFile(t, { root: d }); }, /does not start at/],
  ['hosting: an invalid header name', () => { const d = demoDir(); const t = renderHeadersFile(d, loadPolicy()) + '/x\n  Bad Name: v\n'; return checkHeadersFile(t, { root: d }); }, /not "Name: value"|valid header name/],
  ['hosting: the Strict-Transport-Security header missing', () => { const d = demoDir(); const t = renderHeadersFile(d, loadPolicy()).replace(/ {2}Strict-Transport-Security:.*\n/, ''); return checkHeadersFile(t, { root: d }); }, /strict-transport-security is missing/],
  ['hosting: Cache-Control placed in the catch-all rule', () => { const d = demoDir(); const t = renderHeadersFile(d, loadPolicy()).replace('/*\n', '/*\n  Cache-Control: no-cache\n'); return checkHeadersFile(t, { root: d }); }, /catch-all/],
  // ---- Gate 5 Phase 4 (APR-JE-032): the crawler review record, og:image, the demonstration's X-Robots-Tag, and the release gate's crawler review
  ['crawler record: an agent of the policy has no entry', () => recProblems((r) => { r.agents = r.agents.filter((a) => a.agent !== 'ClaudeBot'); }), /agent ClaudeBot: has no verification entry/],
  ['crawler record: an entry for an agent outside the policy', () => recProblems((r) => { r.agents.push({ ...r.agents[0], agent: 'DuckAssistBot' }); }), /not an agent of the policy/],
  ['crawler record: an agent listed twice', () => recProblems((r) => { r.agents.push({ ...r.agents[0] }); }), /listed twice/],
  ['crawler record: an agent recorded in the wrong class', () => recProblems((r) => { r.agents.find((a) => a.agent === 'GPTBot').class = 'aiSearch'; }), /puts it in "training"/],
  ['crawler record: a source that is not the provider\'s own page', () => recProblems((r) => { r.agents[0].source = 'https://blog.example.com/crawlers'; }), /provider's own site/],
  ['crawler record: a source over http', () => recProblems((r) => { r.agents[1].source = 'http://www.bing.com/webmasters/help/which-crawlers-does-bing-use-8c184ec0'; }), /provider's own site/],
  ['crawler record: a name reported as changed', () => recProblems((r) => { r.agents[2].status = 'changed'; }), /only "confirmed" is acceptable/],
  ['crawler record: a name reported as not found', () => recProblems((r) => { r.agents[3].status = 'not-found'; }), /only "confirmed" is acceptable/],
  ['crawler record: a verification date in the future', () => recProblems((r) => { r.agents[4].verifiedOn = '2027-01-01'; }), /in the future/],
  ['crawler record: no verification date', () => recProblems((r) => { delete r.agents[5].verifiedOn; }), /verifiedOn must be a date/],
  ['crawler record: the policy was reviewed on another day', () => recProblems((r) => { r.verifiedOn = '2026-10-09'; }), /CRAWLERS\.reviewed/],
  ['crawler record: a finding that says nothing', () => recProblems((r) => { r.agents[6].finding = 'ok'; }), /finding must state/],
  ['crawler record: the method is not stated', () => recProblems((r) => { r.method = ''; }), /method must say how/],
  ['crawler record: the limits lose the robots.txt statement', () => recProblems((r) => { r.limits = ['nothing to see']; }), /robots\.txt is a request/],
  ['crawler record: an agent of the policy listed as outside it', () => recProblems((r) => { r.identitiesNotInPolicy.push({ agent: 'Googlebot' }); }), /listed as not in the policy/],
  ['crawler record: not an object', () => crawlerRecordProblems({ record: null }), /missing or not an object/],
  ['crawler record: the untouched record is accepted (must find nothing)', () => recProblems(() => {}), null],
  ['crawler review: nobody has re-read the pages (the release gate asks for it)', () => crawlerReviewGaps({ record: { ...crawlerRecord(), confirmedByPerson: false }, today: '2026-10-12' }), /not been re-read/],
  ['crawler review: a review older than its limit', () => crawlerReviewGaps({ record: { ...crawlerRecord(), confirmedByPerson: true }, today: '2027-06-01' }), /days old/],
  ['crawler review: no record at all', () => crawlerReviewGaps({ record: null }), /missing/],
  ['crawler review: a person-confirmed, recent review has no gap (must find nothing)', () => crawlerReviewGaps({ record: { ...crawlerRecord(), confirmedByPerson: true }, today: '2026-10-12' }), null],
  ['release: crawler identities not re-read by a person', () => blockedBy(gate({ crawlerRecord: { ...crawlerRecord(), confirmedByPerson: false } })), /searchReadiness.*not been re-read/],
  ['release: a crawler review that has gone stale', () => blockedBy(gate({ crawlerRecord: { ...crawlerRecord(), confirmedByPerson: true }, today: '2027-06-01' })), /searchReadiness.*days old/],
  ['release: no crawler record', () => blockedBy(gate({ crawlerRecord: null })), /searchReadiness.*crawler verification record is missing/],
  ['og:image: the demonstration declares a preview image', () => { const d = demoDir(); edit(join(d, 'menu.html'), (t) => t.replace('<meta property="og:type"', '<meta property="og:image" content="https://example.test/a.png">\n<meta property="og:type"')); const cfg = { client: readJson(join(projectDir, 'config', 'client.json')), copy: readJson(join(projectDir, 'config', 'copy.json')), pages: readJson(join(projectDir, 'config', 'site.json')).pages }; return metadataProblems({ pagesHtml: Object.fromEntries(cfg.pages.map((p) => [p.file, readFileSync(join(d, p.file), 'utf8')])), cfg, indexable: false }); }, /social preview image .* no licensed, approved image/],
  ['og:image: a client page declares an og:image', () => { const fx = client(); edit(join(fx.dir, 'menu.html'), (t) => t.replace('<meta property="og:type"', '<meta property="og:image" content="https://jadeandember.example.test/media/hero-wok.webp">\n<meta property="og:type"')); return wholeSeo(fx); }, /social preview image/],
  ['og:image: a client page declares a twitter:image', () => { const fx = client(); edit(join(fx.dir, 'index.html'), (t) => t.replace('<meta property="og:type"', '<meta name="twitter:image" content="https://jadeandember.example.test/media/hero-wok.webp">\n<meta property="og:type"')); return wholeSeo(fx); }, /social preview image/],
  ['noindex header: the demonstration host file loses X-Robots-Tag', () => { const d = demoDir(); const t = renderHeadersFile(d, loadPolicy()).replace(/ {2}X-Robots-Tag:.*\n/, ''); return checkHeadersFile(t, { root: d }); }, /noindex but the X-Robots-Tag header is missing/],
  ['noindex header: the demonstration sends it with another value', () => { const d = demoDir(); const t = renderHeadersFile(d, loadPolicy()).replace('X-Robots-Tag: noindex, nofollow', 'X-Robots-Tag: all'); return checkHeadersFile(t, { root: d }); }, /the policy says "noindex, nofollow"/],
  ['noindex header: a second rule repeats it', () => { const d = demoDir(); const t = renderHeadersFile(d, loadPolicy()) + '/menu.html\n  X-Robots-Tag: noindex, nofollow\n'; return checkHeadersFile(t, { root: d }); }, /appears 2 times|must be only in the "\/\*" rule/],
  ['noindex header: an indexable client build carries it', () => { const fx = client(); const t = renderHeadersFile(fx.dir, loadPolicy()).replace('/*\n', '/*\n  X-Robots-Tag: noindex, nofollow\n'); return checkHeadersFile(t, { root: fx.dir }); }, /appears in an indexable build/],
  ['noindex header: only some pages are noindex', () => { const d = demoDir(); const t = renderHeadersFile(d, loadPolicy()); edit(join(d, 'menu.html'), (h) => h.replace('<meta name="robots" content="noindex, nofollow">\n', '')); return checkHeadersFile(t, { root: d }); }, /only some pages carry the robots noindex meta tag/],
  ['noindex header: a build with mixed pages gets no host file', () => { const d = demoDir(); edit(join(d, 'menu.html'), (h) => h.replace('<meta name="robots" content="noindex, nofollow">\n', '')); try { renderHeadersFile(d, loadPolicy()); return []; } catch (e) { return [e.message]; } }, /some pages carry the robots noindex meta tag and others do not/],
  ['noindex header: the demonstration and the client build are told apart (must find nothing)', () => { const d = demoDir(), fx = client(); const out = []; if (noindexState(d) !== 'all' || !robotsHeaders(d).hasOwnProperty('X-Robots-Tag')) out.push('the demonstration gets no header'); if (noindexState(fx.dir) !== 'none' || Object.keys(robotsHeaders(fx.dir)).length) out.push('the client build gets a header'); return out; }, null],
  // ---- Gate 5 Phase 5 (APR-JE-033): external destinations, how a network answer is classified, and the media rights inventory
  ['external: a new link in a page', () => { const d = demoDir(); edit(join(d, 'index.html'), (t) => t.replace('</main>', '<p><a href="https://example.org/offer">offer</a></p></main>')); return extProblems(d); }, /external link https:\/\/example\.org\/offer .* not in the destination registry/],
  ['external: a new address printed in text', () => { const d = demoDir(); edit(join(d, 'fonts', 'LICENSES.txt'), (t) => t + '\nSee https://licences.example/ofl\n'); return extProblems(d); }, /external address in text https:\/\/licences\.example\/ofl .* not in the destination registry/],
  ['external: the credit link disappears from one page', () => { const d = demoDir(); edit(join(d, 'menu.html'), (t) => t.replace('<a href="https://getsimplifiedtech.com/">Website concept by Simplified Tech Solutions</a>', '<span>Website concept by Simplified Tech Solutions</span>')); return extProblems(d); }, /registry lists .* but it appears in/],
  ['external: a registered destination no longer appears', () => { const d = demoDir(); edit(join(d, 'fonts', 'LICENSES.txt'), (t) => t.split('https://github.com/noirblancrouge/YoungSerif').join('the Young Serif project')); return extProblems(d); }, /EXT-05 .* no longer appears/],
  ['external: the credit link made http', () => linksOf((() => { const d = demoDir(); edit(join(d, 'index.html'), (t) => t.replace('href="https://getsimplifiedtech.com/"', 'href="http://getsimplifiedtech.com/"')); return d; })()), /not https/],
  ['external: a registry entry for a clickable http link', () => { const r = registryOf(); r.destinations[0].url = 'http://getsimplifiedtech.com/'; return registryProblems({ registry: r, found: [] }); }, /clickable link must be https/],
  ['external: a registry entry with no reason', () => { const r = registryOf(); r.destinations[1].purpose = ''; return registryProblems({ registry: r, found: [] }); }, /purpose must say why/],
  ['external: the same registry id twice', () => { const r = registryOf(); r.destinations[1].id = r.destinations[0].id; return registryProblems({ registry: r, found: [] }); }, /listed twice/],
  ['external: the untouched demonstration matches its registry (must find nothing)', () => extProblems(demoDir()), null],
  ['external verify: a direct 200 is verified (must find nothing)', () => verdict('https://a.example/', { 'HEAD https://a.example/': [200] }), null],
  ['external verify: a redirect to an https page that answers 200 is verified (must find nothing)', () => verdict('https://a.example/', { 'HEAD https://a.example/': [[301, { location: '/home' }]], 'HEAD https://a.example/home': [200] }), null],
  ['external verify: a server that refuses HEAD but answers GET is verified (must find nothing)', () => verdict('https://a.example/', { 'HEAD https://a.example/': [405], 'GET https://a.example/': [200] }), null],
  ['external verify: a 403 from a site that blocks automated requests is not a pass', () => verdict('https://a.example/', { 'HEAD https://a.example/': [403], 'GET https://a.example/': [403] }), /^blocked/],
  ['external verify: a 429 is not a pass', () => verdict('https://a.example/', { '* https://a.example/': [429] }), /^blocked/],
  ['external verify: a 404 is unavailable', () => verdict('https://a.example/', { 'HEAD https://a.example/': [404], 'GET https://a.example/': [404] }), /^unavailable/],
  ['external verify: a 500 that persists after the retry is unavailable', () => verdict('https://a.example/', { '* https://a.example/': [500] }), /^unavailable/],
  ['external verify: a redirect loop is unavailable', () => verdict('https://a.example/', { '* https://a.example/': [[302, { location: '/' }]] }), /^unavailable.*redirects/],
  ['external verify: a redirect that leaves https is insecure', () => verdict('https://a.example/', { 'HEAD https://a.example/': [[301, { location: 'http://a.example/' }]] }), /^insecure/],
  ['external verify: an expired certificate is insecure', () => verdict('https://a.example/', { '* https://a.example/': [certErr()] }), /^insecure.*certificate/],
  ['external verify: no DNS answer is inconclusive, not unavailable', () => verdict('https://a.example/', { '* https://a.example/': [dnsErr()] }), /^inconclusive.*ENOTFOUND/],
  ['external verify: a server error followed by success on the retry is verified (must find nothing)', () => verdict('https://a.example/', { 'HEAD https://a.example/': [503, 200] }), null],
  ['external verify: an address printed as http that the destination upgrades is verified (must find nothing)', () => verdict('http://a.example/ofl', { 'HEAD http://a.example/ofl': [[301, { location: 'https://a.example/ofl' }]], 'HEAD https://a.example/ofl': [200] }, { allowHttpStart: true }), null],
  ['external verify: an address printed as http that is not upgraded is insecure', () => verdict('http://a.example/ofl', { 'HEAD http://a.example/ofl': [200] }, { allowHttpStart: true }), /^insecure/],
  ['external verify: a clickable http address is insecure without any request', () => verdict('http://a.example/', { 'HEAD http://a.example/': [200] }), /^insecure/],
  ['external record: "verified" with a 404', () => recFile((r) => { r.results[0].finalStatus = 404; }), /needs a 2xx final status/],
  ['external record: "verified" through an http hop', () => recFile((r) => { r.results[0].chain.push({ url: 'http://example.org/', status: 200, method: 'HEAD' }); }), /http hop/],
  ['external record: "verified" with no hops recorded', () => recFile((r) => { r.results[0].chain = []; }), /no recorded hops/],
  ['external record: "blocked" with a 200', () => recFile((r) => { r.results[0].class = 'blocked'; }), /"blocked" needs a 401, 403, 429 or 999/],
  ['external record: "inconclusive" that carries a status', () => recFile((r) => { r.results[0].class = 'inconclusive'; }), /no answer, yet a status/],
  ['external record: a class outside the vocabulary', () => recFile((r) => { r.results[0].class = 'ok'; }), /is not one of verified/],
  ['external record: a date in the future', () => recFile((r) => { r.date = '2027-01-01'; }), /in the future/],
  ['external record: no runner', () => recFile((r) => { delete r.runner; }), /runner\.kind must be/],
  ['external record: the destination list digest is missing', () => recFile((r) => { delete r.registryDigest; }), /registryDigest/],
  ['external record: the same id twice', () => recFile((r, f) => { f.records.push(clone(r)); }), /listed twice/],
  ['external record: a sandbox run that reports success without a request', () => recFile((r) => { r.runner.kind = 'sandbox'; r.results[0].chain = []; r.results[0].class = 'verified'; }), /sandbox run reports results without any recorded request/],
  ['external record: the untouched history is accepted (must find nothing)', () => recordProblems({ file: historyOf(), today: '2026-10-12' }), null],
  ['rights: an image added with no inventory entry', () => { const d = demoDir(); cpSync(join(d, 'media', 'dish-mapo.webp'), join(d, 'media', 'dish-new.webp')); return rights(d); }, /dish-new\.webp is delivered but has no entry/],
  ['rights: an image that changed after the review', () => { const d = demoDir(); appendFileSync(join(d, 'media', 'dish-mapo.webp'), Buffer.from([0])); return rights(d); }, /has changed since the rights inventory was written/],
  ['rights: an entry for a file that is not delivered', () => { const d = demoDir(); rmSync(join(d, 'media', 'dish-dandan.webp')); return rights(d); }, /in the rights inventory but is not delivered/],
  ['rights: the same file listed twice', () => rights(demoDir(), (i) => { i.assets.push(clone(i.assets[0])); }), /listed twice/],
  ['rights: marked verified with no approval row', () => rights(demoDir(), (i) => { i.assets[0].rights.status = 'verified'; i.assets[0].rights.approval = 'REL-JE-001'; }), /marked verified but no rights-verification approval/],
  ['rights: marked verified without naming any approval', () => rights(demoDir(), (i) => { i.assets[1].rights.status = 'verified'; }), /\(none named\)/],
  ['rights: verified with a real rights-verification row (must find nothing)', () => rights(demoDir(), (i) => { i.assets[0].rights.status = 'verified'; i.assets[0].rights.approval = 'REL-JE-009'; }, { approvals: [{ id: 'REL-JE-009', type: 'rights-verification', decision: 'verified by Sam; sources: terms pages; 2026-10-12' }] }), null],
  ['rights: generated media described as licence-text-shipped', () => rights(demoDir(), (i) => { i.assets[0].rights.status = 'licence-text-shipped'; }), /cannot be "licence-text-shipped"/],
  ['rights: a status outside the vocabulary', () => rights(demoDir(), (i) => { i.assets[0].rights.status = 'cleared'; }), /rights\.status must be one of/],
  ['rights: generated media with no origin', () => rights(demoDir(), (i) => { delete i.assets[0].origin; }), /origin\.service and origin\.generatedOn/],
  ['rights: generated media with no terms to verify', () => rights(demoDir(), (i) => { i.assets[2].termsToVerify = []; }), /termsToVerify must name/],
  ['rights: terms to verify that do not exist', () => rights(demoDir(), (i) => { i.assets[2].termsToVerify = ['T-NOPE']; }), /not in the terms list/],
  ['rights: wording that claims a licence', () => rights(demoDir(), (i) => { i.assets[0].description = 'royalty-free hero image'; }), /claims a right/],
  ['rights: a term that is reviewed but has no reviewer', () => rights(demoDir(), (i) => { i.terms[0].status = 'reviewed'; }), /needs reviewedOn and reviewedBy/],
  ['rights: a term address over http', () => rights(demoDir(), (i) => { i.terms[0].url = 'http://huggingface.co/terms-of-service'; }), /https address/],
  ['rights: a font whose licence section is missing', () => rights(demoDir(), (i) => { i.assets.find((a) => a.kind === 'font').licenceSection = 'nope'; }), /has no section "nope"/],
  ['rights: a font section without the OFL text', () => rights(demoDir(), () => {}, { licence: (t) => t.replace(/SIL OPEN FONT LICENSE Version 1\.1/g, 'A LICENCE') }), /does not contain the SIL Open Font License 1\.1 text/],
  ['rights: a font described as unverified', () => rights(demoDir(), (i) => { i.assets.find((a) => a.kind === 'font').rights.status = 'unverified'; }), /"licence-text-shipped", not "unverified"/],
  ['rights: the licence file missing from the fonts folder', () => { const d = demoDir(); const inv = invOf(); return mediaRightsProblems({ inventory: inv, root: d, approvals: [], licenceText: '' }).problems.map((x) => x.detail); }, /has no section/],
  ['rights: the Noto Serif SC notice differs from the font file (finding F-G5-05)', () => fontNotices(demoDir()), /noto-serif-sc-seal-600\.woff2: the copyright notice inside the font file .* names a different party/],
  ['rights: the Young Serif and Karla notices agree with their files (must find nothing)', () => fontNotices(demoDir()).filter((m) => !/noto-serif-sc/.test(m)), null],
  ['rights: the untouched demonstration matches its inventory (must find nothing)', () => rights(demoDir()), null],
];
function assembleCandidateRef() { const d = assembleCandidate(projectDir, 'g4-ref'); sandbox.push(d); return d; }

export async function checkSelftestGate4({ only = null } = {}) {
  const problems = [], notes = [];
  const t0 = Date.now();
  let n = 0;
  try {
    for (const [name, run, expect] of cases) {
      if (only && !name.includes(only)) continue;
      let r;
      try { r = await run(); } catch (e) { r = [`check crashed: ${e.message}`]; }
      n++;
      if (expect === null) { if (r.length) problems.push(`${name}: ${r[0].slice(0, 200)}`); else notes.push(`held: ${name}`); }
      else if (!r.length) problems.push(`${name}: nothing was reported; the defect went undetected`);
      else if (!expect.test(r.join('\n'))) problems.push(`${name}: reported something else (${r[0].slice(0, 160)}), expected ${expect}`);
      else notes.push(`caught: ${name}`);
    }
    // the untouched inputs pass
    if (!only) {
      n += 3;
      const d = demoDir(), fx = client();
      const h = await validateHtml(pagesOf(d).map((f) => [f, readFileSync(join(d, f), 'utf8')]), 'x'); if (h.problems.length) problems.push(`html: the untouched pages must pass (${h.problems[0]})`); else notes.push('the untouched demonstration pages pass html-validate');
      const l = scanLinks({ root: d }).problems.concat(scanLinks({ root: fx.dir }).problems); if (l.length) problems.push(`links: the untouched sites must pass (${l[0]})`); else notes.push('the untouched demonstration and client build pass the link checks');
      const s = seoOf(fx).concat(checkFolder(fx.dir, { client: true, label: 'x' }).problems); if (s.length) problems.push(`seo/hosting: the untouched client build must pass (${s[0]})`); else notes.push('the untouched client build passes the SEO and hosting checks');
    }
    notes.push(`${n} targeted negative tests run in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  } finally { sandbox.forEach((d) => { try { rmSync(d, { recursive: true, force: true }); } catch { /* gone */ } }); }
  return { problems, notes };
}

if (isMain(import.meta.url)) {
  const i = process.argv.indexOf('--only');
  const t0 = Date.now();
  const { problems, notes } = await checkSelftestGate4({ only: i > -1 ? process.argv[i + 1] : null });
  notes.forEach((x) => console.log('  ' + x));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:selftest-gate4 (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  process.exit(problems.length ? 1 : 0);
}
