// check:selftest-gate4. Targeted negative tests for the Gate 4 checks (HTML validation, internal links, SEO output, release gate, hosting files).
// Each test damages a COPY of the delivered site, a client build, a configuration, the gate's input or the host files in a way a real mistake
// could, runs the real check, and requires it to report the defect. Nothing in the working tree or the baseline is touched. Options: --only <text>
import { cpSync, readFileSync, rmSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { validateHtml, probeTelWrapping } from './html.mjs';
import { scanLinks, checkSearchAgreement } from './links.mjs';
import { checkSeoClient, readSitemap, readRobots } from './seo.mjs';
import { checkFolder, checkHeadersFile } from './hosting.mjs';
import { greenClientContext, policyProblems } from './release.mjs';
import { buildClient } from '../lib/client-fixture.mjs';
import { evaluateGate, loadReleasePolicy } from '../lib/release.mjs';
import { reconcile } from '../lib/findings.mjs';
import { loadPolicy, renderHeadersFile } from '../lib/security.mjs';
import { assembleCandidate, pagesOf } from '../lib/site.mjs';
import { isMain, projectDir, readJson, tempDir } from '../lib/git.mjs';

const edit = (file, fn) => writeFileSync(file, fn(readFileSync(file, 'utf8')));
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
const GREEN = () => greenClientContext();

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

  // ---- hosting files and the delivered folder
  ['hosting: a vercel.json in the delivered folder', () => { const d = demoDir(); writeFileSync(join(d, 'vercel.json'), '{}'); return checkFolder(d, { label: 'x' }).problems; }, /vercel\.json/],
  ['hosting: a functions folder', () => { const d = demoDir(); mkdirSync(join(d, 'functions')); writeFileSync(join(d, 'functions', 'a.js'), 'export {}'); return checkFolder(d, { label: 'x' }).problems; }, /functions/],
  ['hosting: a _redirects file', () => { const d = demoDir(); writeFileSync(join(d, '_redirects'), '/a /b 301'); return checkFolder(d, { label: 'x' }).problems; }, /_redirects/],
  ['hosting: a file over the Pages size limit', () => { const d = demoDir(); writeFileSync(join(d, 'media', 'big.mp4'), Buffer.alloc(26 * 1024 * 1024)); return checkFolder(d, { label: 'x' }).problems; }, /25 MiB/],
  ['hosting: a reference to Vercel in a page', () => { const d = demoDir(); edit(join(d, 'index.html'), (t) => t.replace('</main>', '<p>Hosted on vercel.app</p></main>')); return checkFolder(d, { label: 'x' }).problems; }, /Vercel/],
  ['hosting: a script that makes network calls', () => { const d = demoDir(); edit(join(d, 'site.js'), (t) => t + '\nfetch("/api");\n'); return checkFolder(d, { label: 'x' }).problems; }, /network calls/],
  ['hosting: a missing index.html', () => { const d = demoDir(); renameSync(join(d, 'index.html'), join(d, 'home.html')); return checkFolder(d, { label: 'x' }).problems; }, /index\.html/],
  ['hosting: the demonstration publishes a sitemap', () => { const d = demoDir(); writeFileSync(join(d, 'sitemap.xml'), '<urlset/>'); return checkFolder(d, { label: 'x' }).problems; }, /must not publish a sitemap/],
  ['hosting: an indexable build without robots.txt', () => { const fx = client(); rmSync(join(fx.dir, 'robots.txt')); return checkFolder(fx.dir, { client: true, label: 'x' }).problems; }, /robots\.txt and sitemap\.xml/],
  ['hosting: more than 100 header rules', () => { const d = demoDir(); const t = renderHeadersFile(d, loadPolicy()) + Array.from({ length: 101 }, (_, i) => `/p${i}\n  X-A: b\n`).join(''); return checkHeadersFile(t, { root: d }); }, /100/],
  ['hosting: a header line over 2000 characters', () => { const d = demoDir(); const t = renderHeadersFile(d, loadPolicy()) + `/x\n  X-Long: ${'a'.repeat(2100)}\n`; return checkHeadersFile(t, { root: d }); }, /2000/],
  ['hosting: a security header repeated in a second rule', () => { const d = demoDir(); const t = renderHeadersFile(d, loadPolicy()) + '/menu.html\n  X-Frame-Options: DENY\n'; return checkHeadersFile(t, { root: d }); }, /only in the "\/\*" rule/],
  ['hosting: immutable caching for unhashed names', () => { const d = demoDir(); const t = renderHeadersFile(d, loadPolicy()).replace('Cache-Control: no-cache', 'Cache-Control: public, max-age=31536000, immutable'); return checkHeadersFile(t, { root: d }); }, /immutable/],
  ['hosting: a CSP that no longer matches the built pages', () => { const d = demoDir(); edit(join(d, 'index.html'), (t) => t.replace('</body>', '<script>var added=1</script></body>')); const t = renderHeadersFile(assembleCandidateRef(), loadPolicy()); return checkHeadersFile(t, { root: d }); }, /not the policy computed/],
  ['hosting: a rule that does not start at /', () => { const d = demoDir(); const t = renderHeadersFile(d, loadPolicy()) + 'menu.html\n  X-A: b\n'; return checkHeadersFile(t, { root: d }); }, /does not start at/],
  ['hosting: an invalid header name', () => { const d = demoDir(); const t = renderHeadersFile(d, loadPolicy()) + '/x\n  Bad Name: v\n'; return checkHeadersFile(t, { root: d }); }, /not "Name: value"|valid header name/],
  ['hosting: the Strict-Transport-Security header missing', () => { const d = demoDir(); const t = renderHeadersFile(d, loadPolicy()).replace(/ {2}Strict-Transport-Security:.*\n/, ''); return checkHeadersFile(t, { root: d }); }, /strict-transport-security is missing/],
  ['hosting: Cache-Control placed in the catch-all rule', () => { const d = demoDir(); const t = renderHeadersFile(d, loadPolicy()).replace('/*\n', '/*\n  Cache-Control: no-cache\n'); return checkHeadersFile(t, { root: d }); }, /catch-all/],
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
      if (!r.length) problems.push(`${name}: nothing was reported; the defect went undetected`);
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
