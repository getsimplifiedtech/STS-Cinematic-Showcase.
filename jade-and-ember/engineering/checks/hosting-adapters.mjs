// Tests of the hosting adapters (G6-4, APR-JE-044). Run by check:hosting (so by npm run verify and CI); also runnable alone:
//   node engineering/checks/hosting-adapters.mjs [--update-golden]
// Everything is local and synthetic: an invented fixture site, the real Jade & Ember site as a delivered folder, throwaway bundles, an in-process simulation server. Nothing
// contacts a host or a provider, and no result here is evidence of live behaviour: every behaviour only a live check can settle is marked unverified in the adapters.
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { buildCsp, httpsHeaders, loadPolicy, renderApache, renderHeadersFile, renderNginx } from '../lib/security.mjs';
import { buildClient } from '../lib/client-fixture.mjs';
import { assembleCandidate } from '../lib/site.mjs';
import { serveSite } from '../lib/server.mjs';
import { isMain } from '../lib/git.mjs';
import { ADAPTERS, MANIFEST, checkBundle, profileOf, readManifest, renderBundle, verifyServed } from '../adapters/hosting/index.mjs';
import { composeHeaders, describeSite, sha256, walkFiles } from '../adapters/hosting/common.mjs';
import { writeFixtureSite } from '../adapters/hosting/fixture.mjs';
import { checkHeadersFile as cfCheckImport, parseHeadersFile } from '../adapters/hosting/cloudflare-pages.mjs';
import { parseApache, parseNginx } from '../adapters/hosting/static.mjs';
import { checkVercelJson } from '../adapters/hosting/vercel.mjs';
import { engDir } from '../lib/git.mjs';

const GOLDEN = join(engDir, 'adapters', 'hosting', 'golden');
const FACTS = join(engDir, 'hosting', 'provider-facts.json');
const URL_STYLE = { 'cloudflare-pages': 'clean', vercel: 'clean', static: 'extension' };
const tmp = (l) => mkdtempSync(join(tmpdir(), `je-${l}-`));
const rmrf = (p) => rmSync(p, { recursive: true, force: true });

// ---- behaviour: the bundle served by its adapter's simulation profile, walked with plain requests
async function behaviour(adapterId, bundleDir, { policy, expect404 }) {
  const problems = [];
  const m = readManifest(bundleDir), prof = profileOf(bundleDir), siteDir = join(bundleDir, m.siteRoot);
  const siteFiles = m.files.filter((e) => e.role === 'site').map((e) => e.path.slice(m.siteRoot.length + 1));
  const site = describeSite(siteDir, { urlStyle: m.urlStyle, baseUrl: m.baseUrl, channel: m.channel });
  const h = composeHeaders({ ...site, files: siteFiles }, policy, { hsts: m.options.hsts.includeSubDomains ? m.options.hsts : null });
  const want = { ...h.security, ...h.robots };
  const sv = serveSite(siteDir, { profile: prof });
  const get = async (path, headers = {}) => { const r = await fetch(sv.origin + path, { redirect: 'manual', headers }); const body = Buffer.from(await r.arrayBuffer()); return { status: r.status, h: Object.fromEntries([...r.headers].map(([k, v]) => [k.toLowerCase(), v])), body }; };
  const at = (what) => `${adapterId} ${m.channel} ${what}`;
  const sameHeaders = (r, label, { page = false } = {}) => {
    for (const [k, v] of Object.entries(want)) if (r.h[k.toLowerCase()] !== v) problems.push(`${at(label)}: ${k} is ${JSON.stringify(String(r.h[k.toLowerCase()]).slice(0, 60))}, expected the policy value`);
    if (m.channel === 'client-production' && r.h['x-robots-tag']) problems.push(`${at(label)}: an indexable build sends X-Robots-Tag`);
    if (/includesubdomains|preload/i.test(r.h['strict-transport-security'] || '') && !m.options.hsts.includeSubDomains) problems.push(`${at(label)}: Strict-Transport-Security carries includeSubDomains or preload`);
    if (page && r.h['cache-control'] !== policy.cache.html) problems.push(`${at(label)}: Cache-Control is ${JSON.stringify(r.h['cache-control'])}, expected ${JSON.stringify(policy.cache.html)}`);
  };
  try {
    const served = new Map();
    for (const p of site.pages) {
      const r = await get(p.public);
      if (r.status !== 200) { problems.push(`${at(p.public)}: status ${r.status}`); continue; }
      if (!/^text\/html/.test(r.h['content-type'] || '')) problems.push(`${at(p.public)}: content type ${r.h['content-type']}`);
      if (!r.body.equals(readFileSync(join(siteDir, p.file)))) problems.push(`${at(p.public)}: the served bytes differ from ${p.file}`);
      sameHeaders(r, p.public, { page: true });
      served.set(p.public, r.body);
      if (m.urlStyle === 'clean') {
        const x = await get(p.file === 'index.html' ? '/index.html' : `/${p.file}`);
        if (x.status !== 308 || x.h.location !== p.public) problems.push(`${at(`/${p.file}`)}: expected a 308 to ${p.public}, got ${x.status} ${x.h.location || ''}`);
        if (p.file !== 'index.html') {
          const y = await get(`${p.public}/`);
          if (adapterId === 'vercel' && (y.status !== 308 || y.h.location !== p.public)) problems.push(`${at(`${p.public}/`)}: trailingSlash false must redirect the slashed path with a 308 to ${p.public} (VC-03, HR-03), got ${y.status} ${y.h.location || ''}`);
          if (y.status === 200 && y.body.equals(readFileSync(join(siteDir, p.file)))) problems.push(`${at(`${p.public}/`)}: the page is also served at the slashed path (duplicate content; relative links break: HR-03)`); }
      }
    }
    // shared files and asset folders: content type, bytes, request-path cache class
    for (const f of siteFiles.filter((x) => !x.endsWith('.html'))) {
      const r = await get(`/${f}`);
      if (r.status !== 200) { problems.push(`${at(`/${f}`)}: status ${r.status}`); continue; }
      served.set(`/${f}`, r.body);
      if (!r.body.equals(readFileSync(join(siteDir, f)))) problems.push(`${at(`/${f}`)}: bytes differ`);
      const cls = /\.(css|js)$/.test(f) && !f.includes('/') ? policy.cache.code : /^(fonts|media)\//.test(f) ? policy.cache.static : null;
      if (cls && r.h['cache-control'] !== cls) problems.push(`${at(`/${f}`)}: Cache-Control is ${JSON.stringify(r.h['cache-control'])}, expected ${JSON.stringify(cls)}`);
      sameHeaders(r, `/${f}`);
    }
    // the deployed-bytes comparison over what was just fetched (C-07), against the staged manifest
    verifyServed(m, served).forEach((p) => problems.push(`${at('deployed bytes')}: ${p}`));
    // unknown paths: a real 404, not the home page with 200 (D-P3-1)
    const nf = await get('/no-such-page-g64');
    if (expect404) {
      if (nf.status !== 404) problems.push(`${at('/no-such-page-g64')}: an unknown path answered ${nf.status}, expected 404`);
      else if (site.hasNotFoundPage && !nf.body.equals(readFileSync(join(siteDir, '404.html')))) problems.push(`${at('/no-such-page-g64')}: the 404 body is not 404.html`);
      sameHeaders(nf, '404 response');
    } else if (adapterId === 'cloudflare-pages' && !(nf.status === 200 && nf.body.equals(readFileSync(join(siteDir, 'index.html'))))) problems.push(`${at('/no-such-page-g64')}: without a 404.html the Pages simulation should answer the home page (CF-10, CF-11); got ${nf.status}`);
    // search files: served for an indexable client build, never for the demonstration
    for (const f of ['robots.txt', 'sitemap.xml', 'llms.txt']) {
      const r = await get(`/${f}`);
      if (m.channel === 'client-production') { if (r.status !== 200 || !r.body.equals(readFileSync(join(siteDir, f)))) problems.push(`${at(`/${f}`)}: expected the file, got ${r.status}`); }
      else if (expect404 && r.status !== 404) problems.push(`${at(`/${f}`)}: the demonstration must not serve ${f} (status ${r.status})`);
    }
    // host files are read by the host and never served
    for (const f of ['_headers', 'vercel.json', 'bundle.manifest.json', 'SETTINGS.txt', 'nginx.conf', 'htaccess']) { const r = await get(`/${f}`); if (r.status === 200 && /Content-Security-Policy|"cleanUrls"|add_header|bundle\/hosting|SYNTHETIC STAGING/.test(r.body.toString('utf8'))) problems.push(`${at(`/${f}`)}: a host file is served`); }
    // ranges: the video, as the provider documentation says each host answers
    const video = siteFiles.find((f) => /\.(mp4|webm)$/.test(f));
    if (video) {
      const rg = await get(`/${video}`, { Range: 'bytes=0-99' });
      const wantRange = adapterId === 'cloudflare-pages' ? 200 : 206;
      if (rg.status !== wantRange) problems.push(`${at('Range')}: expected ${wantRange} (the host's documented behaviour), got ${rg.status}`);
      if (wantRange === 206 && rg.h['content-range'] === undefined) problems.push(`${at('Range')}: a 206 without Content-Range`);
    }
    // simulation honesty: a profile must say what it does not model
    if (!prof.doesNotModel.length || !prof.models.length) problems.push(`${at('profile')}: a simulation profile must list what it models and what it does not`);
  } finally { sv.close(); }
  return problems;
}

// ---- the same security header set in every rendering of the same site
function renderingsAgree(siteDir, policy, hsts = null) {
  const problems = [];
  const csp = buildCsp(siteDir, policy, { https: true });
  const want = { 'Content-Security-Policy': csp, ...policy.headers, ...httpsHeaders(policy, hsts) };
  const cf = parseHeadersFile(renderHeadersFile(siteDir, policy, { https: true, hsts })).rules.find((r) => r.path === '/*')?.headers || [];
  const nginx = parseNginx(renderNginx(siteDir, policy, { https: true, hsts })), apache = parseApache(renderApache(siteDir, policy, { https: true, hsts }));
  const vc = (() => { const t = renderBundleToText('vercel', siteDir, policy, hsts); return JSON.parse(t).headers.find((e) => e.source === '/(.*)').headers.map((x) => [x.key, x.value]); })();
  for (const [label, pairs] of [['_headers', cf], ['nginx.conf', nginx], ['htaccess', apache], ['vercel.json', vc]]) {
    const got = Object.fromEntries(pairs.map(([k, v]) => [k, v]));
    for (const [k, v] of Object.entries(want)) if (got[k] !== v) problems.push(`${label}: ${k} differs from the policy`);
  }
  return problems;
}
function renderBundleToText(adapter, siteDir, policy, hsts) {
  const out = tmp('agree');
  try { renderBundle(adapter, { siteDir, outDir: join(out, 'b'), urlStyle: adapter === 'static' ? 'extension' : 'clean', hsts, policy }); return readFileSync(join(out, 'b', adapter === 'vercel' ? 'vercel.json' : 'x'), 'utf8'); } finally { rmrf(out); }
}

// ---- negative cases: each damages a rendered bundle (or the request to render one) in one way; the check must refuse it for the right reason
const readJ = (p) => JSON.parse(readFileSync(p, 'utf8'));
const editFile = (p, fn) => writeFileSync(p, fn(readFileSync(p, 'utf8')));
const fixHash = (b, rel) => { const mp = join(b, MANIFEST), m = readJ(mp); const e = m.files.find((x) => x.path === rel); const buf = readFileSync(join(b, rel)); e.sha256 = sha256(buf); e.bytes = buf.length; writeFileSync(mp, JSON.stringify(m, null, 2) + '\n'); };   // an attacker who also fixes the manifest entry
const treeOf = (m) => sha256(m.files.filter((e) => e.role === 'site').sort((a, b) => (a.path < b.path ? -1 : 1)).map((e) => `${e.sha256}  ${e.path.slice(m.siteRoot.length + 1)}`).join('\n'));
// edits that keep the manifest consistent (an attacker who knows the format): the file list, the hashes and the tree hash are all repaired
const addSiteFile = (b, name, content) => { const mp = join(b, MANIFEST), m = readJ(mp), rel = `${m.siteRoot}/${name}`; mkdirSync(dirname(join(b, rel)), { recursive: true }); writeFileSync(join(b, rel), content); m.files.push({ path: rel, role: 'site', sha256: sha256(Buffer.from(content)), bytes: Buffer.byteLength(content) }); m.files.sort((x, y) => (x.path < y.path ? -1 : 1)); m.siteTreeSha256 = treeOf(m); writeFileSync(mp, JSON.stringify(m, null, 2) + '\n'); };
const removeSiteFile = (b, name) => { const mp = join(b, MANIFEST), m = readJ(mp), rel = `${m.siteRoot}/${name}`; rmrf(join(b, rel)); m.files = m.files.filter((e) => e.path !== rel); m.siteTreeSha256 = treeOf(m); writeFileSync(mp, JSON.stringify(m, null, 2) + '\n'); };
const editJson = (p, fn) => { const j = JSON.parse(readFileSync(p, 'utf8')); fn(j); writeFileSync(p, JSON.stringify(j, null, 2) + '\n'); };
const CASES = [
  // --- any adapter
  { n: 'an extra file rides along in the site folder', a: ['cloudflare-pages', 'vercel', 'static'], f: (b, m) => writeFileSync(join(b, m.siteRoot, 'extra.txt'), 'x'), re: /extra\.txt.*not listed in the manifest/ },
  { n: 'a delivered file is altered after staging (the manifest is not touched)', a: ['cloudflare-pages', 'vercel', 'static'], f: (b, m) => appendFileSync(join(b, m.siteRoot, 'site.js'), '//'), re: /site\.js: the bytes differ from the manifest/ },
  { n: 'a delivered file is altered AND the manifest entry is repaired (the tree hash still gives it away)', a: ['cloudflare-pages', 'vercel', 'static'], f: (b, m) => { appendFileSync(join(b, m.siteRoot, 'site.js'), '//'); fixHash(b, `${m.siteRoot}/site.js`); }, re: /siteTreeSha256 does not match/ },
  { n: 'a delivered page is altered, with the manifest repaired, against the delivered folder', a: ['cloudflare-pages', 'vercel', 'static'], f: (b, m) => { appendFileSync(join(b, m.siteRoot, 'menu.html'), '<!-- x -->'); fixHash(b, `${m.siteRoot}/menu.html`); const mm = readJ(join(b, MANIFEST)); void mm; }, deliveredCheck: true, re: /menu\.html: differs from the delivered file/ },
  { n: 'a symbolic link inside the bundle', a: ['cloudflare-pages', 'vercel', 'static'], f: (b, m) => symlinkSync('/etc/passwd', join(b, m.siteRoot, 'link.txt')), re: /symbolic link/ },
  { n: 'the manifest is missing', a: ['cloudflare-pages', 'vercel', 'static'], f: (b) => rmrf(join(b, MANIFEST)), re: /bundle\.manifest\.json: missing/ },
  { n: 'the manifest lists a path that leaves the bundle', a: ['cloudflare-pages', 'vercel', 'static'], f: (b) => { const m = readJ(join(b, MANIFEST)); m.files.push({ path: '../outside', role: 'site', sha256: '0'.repeat(64), bytes: 1 }); writeFileSync(join(b, MANIFEST), JSON.stringify(m)); }, re: /unsafe or malformed path/ },
  { n: 'the manifest names another adapter', a: ['cloudflare-pages', 'vercel'], f: (b) => { const m = readJ(join(b, MANIFEST)); m.adapter = 'static'; writeFileSync(join(b, MANIFEST), JSON.stringify(m)); }, re: /adapter declares exactly|differs from what the static adapter/ },
  { n: 'a vendor file of another host rides along (wrangler.toml)', a: ['cloudflare-pages', 'vercel', 'static'], f: (b, m) => writeFileSync(join(b, m.siteRoot, 'wrangler.toml'), 'name = "x"'), re: /wrangler\.toml.*(host, application or secret|not listed)/ },
  { n: 'an environment file with a secret in the site', a: ['cloudflare-pages', 'vercel', 'static'], f: (b, m) => { writeFileSync(join(b, m.siteRoot, '.env'), 'TOKEN=abc'); }, re: /\.env/ },
  { n: 'the release package\'s serve.py in the site', a: ['cloudflare-pages', 'vercel', 'static'], f: (b, m) => { writeFileSync(join(b, m.siteRoot, 'serve.py'), 'print(1)'); }, re: /serve\.py/ },
  { n: 'a server-side file type in the site', a: ['cloudflare-pages', 'vercel', 'static'], f: (b, m) => { writeFileSync(join(b, m.siteRoot, 'run.php'), '<?php'); }, re: /run\.php/ },
  { n: 'forRelease: the 404.html is removed and the manifest repaired', a: ['cloudflare-pages', 'vercel', 'static'], f: (b) => removeSiteFile(b, '404.html'), forRelease: true, re: /release blocker D-P3-1/ },
  { n: 'forRelease: a bundle staged from a site that never had a 404.html', a: ['cloudflare-pages', 'vercel', 'static'], fixture: { with404: false }, f: () => {}, forRelease: true, re: /release blocker D-P3-1/ },
  { n: 'the demonstration gains a robots.txt (manifest repaired)', a: ['cloudflare-pages', 'vercel', 'static'], channel: 'demonstration', f: (b) => addSiteFile(b, 'robots.txt', 'User-agent: *\n'), re: /demonstration must not publish robots\.txt/ },
  { n: 'an indexable build loses its sitemap (manifest repaired)', a: ['cloudflare-pages', 'vercel', 'static'], channel: 'client-production', f: (b) => removeSiteFile(b, 'sitemap.xml'), re: /must serve sitemap\.xml/ },
  { n: 'a server-side file added with a repaired manifest', a: ['cloudflare-pages', 'vercel', 'static'], f: (b) => addSiteFile(b, 'run.php', '<?php'), re: /run\.php: not a static web file type/ },
  { n: 'a hidden file added with a repaired manifest', a: ['cloudflare-pages', 'vercel', 'static'], f: (b) => addSiteFile(b, '.htpasswd', 'a:b'), re: /\.htpasswd/ },
  { n: 'the security headers are stale after a page changed (the CSP no longer matches the pages)', a: ['cloudflare-pages', 'vercel'], f: (b, m) => { writeFileSync(join(b, m.siteRoot, 'about.html'), readFileSync(join(b, m.siteRoot, 'about.html'), 'utf8').replace('</main>', '<p style="color:red">x</p></main>')); fixHash(b, `${m.siteRoot}/about.html`); }, re: /CSP.*not the policy computed|differs from what the/ },
  { n: 'a harmless extra rule in _headers with the manifest repaired (only writing the bundle again can tell)', a: ['cloudflare-pages'], f: (b, m) => { appendFileSync(join(b, m.siteRoot, '_headers'), '/extra\n  X-Extra: 1\n'); fixHash(b, `${m.siteRoot}/_headers`); }, re: /differs from what the cloudflare-pages adapter writes/ },
  { n: 'a harmless extra header in vercel.json with the manifest repaired', a: ['vercel'], f: (b) => { editJson(join(b, 'vercel.json'), (j) => { j.headers.find((e) => e.source === '/menu').headers.push({ key: 'X-Extra', value: '1' }); }); fixHash(b, 'vercel.json'); }, re: /differs from what the vercel adapter writes/ },
  { n: 'a harmless comment in nginx.conf with the manifest repaired', a: ['static'], f: (b) => { appendFileSync(join(b, 'nginx.conf'), '# extra\n'); fixHash(b, 'nginx.conf'); }, re: /differs from what the static adapter writes/ },
  { n: 'START-HERE.txt (a release-package file) added to the site with the manifest repaired', a: ['cloudflare-pages', 'vercel', 'static'], f: (b) => addSiteFile(b, 'START-HERE.txt', 'open index.html'), re: /START-HERE\.txt: belongs to the release package/ },
  { n: 'a hidden folder added to the site with the manifest repaired', a: ['cloudflare-pages', 'vercel', 'static'], f: (b) => addSiteFile(b, '.well-known/x.txt', 'x'), re: /hidden file/ },
  // --- HSTS (D-P3-4, D-P4-5)
  { n: 'HSTS includeSubDomains slipped into the headers without a recorded authorisation', a: ['cloudflare-pages'], f: (b, m) => editFile(join(b, m.siteRoot, '_headers'), (t) => t.replace('Strict-Transport-Security: max-age=31536000', 'Strict-Transport-Security: max-age=31536000; includeSubDomains')), re: /includeSubDomains without a recorded authorisation/ },
  { n: 'HSTS includeSubDomains slipped into vercel.json without a recorded authorisation', a: ['vercel'], f: (b) => editFile(join(b, 'vercel.json'), (t) => t.replace('"max-age=31536000"', '"max-age=31536000; includeSubDomains"')), re: /includeSubDomains without a recorded authorisation/ },
  { n: 'HSTS includeSubDomains slipped into nginx.conf and htaccess', a: ['static'], f: (b) => { editFile(join(b, 'nginx.conf'), (t) => t.replaceAll('max-age=31536000', 'max-age=31536000; includeSubDomains')); }, re: /includeSubDomains without a recorded authorisation/ },
  { n: 'HSTS preload added', a: ['cloudflare-pages'], f: (b, m) => editFile(join(b, m.siteRoot, '_headers'), (t) => t.replace('max-age=31536000', 'max-age=31536000; preload')), re: /preload/ },
  { n: 'HSTS header removed', a: ['cloudflare-pages', 'vercel'], f: (b, m) => { if (m.adapter === 'vercel') editJson(join(b, 'vercel.json'), (j) => { j.headers[0].headers = j.headers[0].headers.filter((h) => h.key !== 'Strict-Transport-Security'); }); else editFile(join(b, m.siteRoot, '_headers'), (t) => t.replace(/ {2}Strict-Transport-Security:[^\n]*\n/, '')); }, re: /strict-transport-security is missing|Strict-Transport-Security appears 0 times/i },
  { n: 'the manifest claims an includeSubDomains opt-in with a fake authorisation shape', a: ['cloudflare-pages'], f: (b) => { const m = readJ(join(b, MANIFEST)); m.options.hsts = { includeSubDomains: true, authorisation: 'yes' }; writeFileSync(join(b, MANIFEST), JSON.stringify(m)); }, re: /needs a recorded authorisation/ },
  // --- Cloudflare Pages
  { n: 'a security header in a second rule (Cloudflare would join and send it twice)', a: ['cloudflare-pages'], f: (b, m) => appendFileSync(join(b, m.siteRoot, '_headers'), '/menu\n  X-Frame-Options: DENY\n'), re: /security header X-Frame-Options in rule "\/menu"/ },
  { n: 'Cache-Control in the catch-all rule', a: ['cloudflare-pages'], f: (b, m) => editFile(join(b, m.siteRoot, '_headers'), (t) => t.replace('  Cross-Origin-Resource-Policy: same-origin\n', '  Cross-Origin-Resource-Policy: same-origin\n  Cache-Control: no-store\n')), re: /Cache-Control in the catch-all rule/ },
  { n: 'cache rules written only for *.html (do not match clean URLs: HR-02)', a: ['cloudflare-pages'], f: (b, m) => editFile(join(b, m.siteRoot, '_headers'), (t) => t.replace(/\/menu\n {2}Cache-Control: no-cache\n/, '')), re: /no cache rule for the request path \/menu/ },
  { n: 'immutable caching for unhashed names', a: ['cloudflare-pages'], f: (b, m) => editFile(join(b, m.siteRoot, '_headers'), (t) => t.replace('/*.css\n  Cache-Control: no-cache', '/*.css\n  Cache-Control: public, max-age=31536000, immutable')), re: /immutable/ },
  { n: 'more than 100 rules', a: ['cloudflare-pages'], f: (b, m) => appendFileSync(join(b, m.siteRoot, '_headers'), Array.from({ length: 100 }, (_, i) => `/r${i}\n  X-Test: 1\n`).join('')), re: /exceed the Pages limit of 100/ },
  { n: 'a header line over 2,000 characters', a: ['cloudflare-pages'], f: (b, m) => appendFileSync(join(b, m.siteRoot, '_headers'), `/long\n  X-Long: ${'a'.repeat(2100)}\n`), re: /limit 2000/ },
  { n: 'a header value with a control character', a: ['cloudflare-pages'], f: (b, m) => appendFileSync(join(b, m.siteRoot, '_headers'), '/x\n  X-Test: a\u0007b\n'), re: /control characters in X-Test/ },
  { n: 'a header name that is not a token', a: ['cloudflare-pages'], f: (b, m) => appendFileSync(join(b, m.siteRoot, '_headers'), '/x\n  Bad Name: 1\n'), re: /not "Name: value"|not a valid header name/ },
  { n: 'a _redirects file in the site', a: ['cloudflare-pages'], f: (b, m) => writeFileSync(join(b, m.siteRoot, '_redirects'), '/a /b 301\n'), re: /_redirects/ },
  { n: 'a Pages Function folder in the site', a: ['cloudflare-pages'], f: (b, m) => { mkdirSync(join(b, m.siteRoot, 'functions')); writeFileSync(join(b, m.siteRoot, 'functions', 'x.js'), 'export {}'); }, re: /functions/ },
  { n: 'a vercel.json inside the Cloudflare site', a: ['cloudflare-pages'], f: (b, m) => writeFileSync(join(b, m.siteRoot, 'vercel.json'), '{}'), re: /vercel\.json/ },
  { n: 'the demonstration without X-Robots-Tag', a: ['cloudflare-pages', 'vercel'], channel: 'demonstration', f: (b, m) => { if (m.adapter === 'vercel') editJson(join(b, 'vercel.json'), (j) => { j.headers[0].headers = j.headers[0].headers.filter((h) => h.key !== 'X-Robots-Tag'); }); else editFile(join(b, m.siteRoot, '_headers'), (t) => t.replace(/ {2}X-Robots-Tag:[^\n]*\n/, '')); }, re: /X-Robots-Tag header is missing/ },
  { n: 'an indexable client build carrying X-Robots-Tag', a: ['cloudflare-pages', 'vercel'], channel: 'client-production', f: (b, m) => { if (m.adapter === 'vercel') editJson(join(b, 'vercel.json'), (j) => { j.headers[0].headers.push({ key: 'X-Robots-Tag', value: 'noindex, nofollow' }); }); else editFile(join(b, m.siteRoot, '_headers'), (t) => t.replace('  Strict-Transport-Security: max-age=31536000\n', '  Strict-Transport-Security: max-age=31536000\n  X-Robots-Tag: noindex, nofollow\n')); }, re: /indexable build/ },
  // --- Vercel
  { n: 'vercel.json inside the delivered site', a: ['vercel'], f: (b, m) => writeFileSync(join(b, m.siteRoot, 'vercel.json'), '{}'), re: /vercel\.json.*(host, application or secret|not listed)/ },
  { n: 'cleanUrls false while the site uses clean URLs', a: ['vercel'], f: (b) => editFile(join(b, 'vercel.json'), (t) => t.replace('"cleanUrls": true', '"cleanUrls": false')), re: /cleanUrls is false/ },
  { n: 'trailingSlash missing', a: ['vercel'], f: (b) => editFile(join(b, 'vercel.json'), (t) => t.replace('  "trailingSlash": false,\n', '')), re: /trailingSlash must be explicitly false/ },
  { n: 'trailingSlash true', a: ['vercel'], f: (b) => editFile(join(b, 'vercel.json'), (t) => t.replace('"trailingSlash": false', '"trailingSlash": true')), re: /trailingSlash must be explicitly false/ },
  { n: 'a misspelt key (silently ignored by the provider)', a: ['vercel'], f: (b) => editFile(join(b, 'vercel.json'), (t) => t.replace('"cleanUrls"', '"cleanUrl"')), re: /"cleanUrl" is not a key/ },
  { n: 'rewrites in vercel.json', a: ['vercel'], f: (b) => editFile(join(b, 'vercel.json'), (t) => t.replace('"headers": [', '"rewrites": [{ "source": "/(.*)", "destination": "/index.html" }],\n  "headers": [')), re: /"rewrites" is not a key/ },
  { n: 'redirects in vercel.json', a: ['vercel'], f: (b) => editFile(join(b, 'vercel.json'), (t) => t.replace('"headers": [', '"redirects": [{ "source": "/a", "destination": "/b" }],\n  "headers": [')), re: /"redirects" is not a key/ },
  { n: 'a project identifier in vercel.json', a: ['vercel'], f: (b) => editFile(join(b, 'vercel.json'), (t) => t.replace('"headers": [', '"projectId": "prj_123",\n  "headers": [')), re: /"projectId" is not a key/ },
  { n: 'a duplicate key in vercel.json (last one wins in some parsers)', a: ['vercel'], f: (b) => editFile(join(b, 'vercel.json'), (t) => t.replace('"cleanUrls": true,', '"cleanUrls": true,\n  "cleanUrls": false,')), re: /not valid JSON|duplicate/i },
  { n: 'framework not null', a: ['vercel'], f: (b) => editFile(join(b, 'vercel.json'), (t) => t.replace('"framework": null', '"framework": "nextjs"')), re: /framework must be null/ },
  { n: 'outputDirectory points elsewhere', a: ['vercel'], f: (b) => editFile(join(b, 'vercel.json'), (t) => t.replace('"outputDirectory": "site"', '"outputDirectory": "."')), re: /outputDirectory must be "site"/ },
  { n: 'a header value that differs from the policy', a: ['vercel'], f: (b) => editFile(join(b, 'vercel.json'), (t) => t.replace('"value": "DENY"', '"value": "SAMEORIGIN"')), re: /X-Frame-Options is "SAMEORIGIN"/ },
  { n: 'a security header in a second entry', a: ['vercel'], f: (b) => editFile(join(b, 'vercel.json'), (t) => t.replace('"source": "/menu",\n      "headers": [\n        { "key": "Cache-Control", "value": "no-cache" }', '"source": "/menu",\n      "headers": [\n        { "key": "X-Frame-Options", "value": "DENY" },\n        { "key": "Cache-Control", "value": "no-cache" }')), re: /security header X-Frame-Options outside the single/ },
  { n: 'a cache source ending in .html while cleanUrls is on (HR-02)', a: ['vercel'], f: (b) => editFile(join(b, 'vercel.json'), (t) => t.replace('"source": "/menu"', '"source": "/menu.html"')), re: /ends in \.html while cleanUrls is on/ },
  { n: 'conditional matching (has) in a headers entry', a: ['vercel'], f: (b) => editFile(join(b, 'vercel.json'), (t) => t.replace('"source": "/menu",', '"source": "/menu",\n      "has": [{ "type": "header", "key": "x" }],')), re: /"has" is not allowed/ },
  { n: 'a regular-expression source', a: ['vercel'], f: (b) => editFile(join(b, 'vercel.json'), (t) => t.replace('"source": "/menu"', '"source": "/(menu|about)"')), re: /not one of the forms the adapter writes/ },
  { n: 'more than 2,048 entries', a: ['vercel'], f: (b) => editFile(join(b, 'vercel.json'), (t) => { const j = JSON.parse(t); for (let i = 0; i < 2100; i++) j.headers.push({ source: `/p${i}`, headers: [{ key: 'X-T', value: '1' }] }); return JSON.stringify(j); }), re: /exceed the 2048 routes/ },
  { n: 'the global entry is not first', a: ['vercel'], f: (b) => editFile(join(b, 'vercel.json'), (t) => { const j = JSON.parse(t); j.headers.push(j.headers.shift()); return JSON.stringify(j, null, 2); }), re: /must come first/ },
  { n: 'Cache-Control in the global entry', a: ['vercel'], f: (b) => editFile(join(b, 'vercel.json'), (t) => t.replace('{ "key": "X-Content-Type-Options", "value": "nosniff" }', '{ "key": "Cache-Control", "value": "no-store" },\n        { "key": "X-Content-Type-Options", "value": "nosniff" }')), re: /Cache-Control in the global entry/ },
  { n: 'a header injection in a value', a: ['vercel'], f: (b) => editFile(join(b, 'vercel.json'), (t) => t.replace('"value": "nosniff"', '"value": "nosniff\\r\\nSet-Cookie: a=b"')), re: /control characters/ },
  // --- plain static server
  { n: 'nginx.conf with another CSP', a: ['static'], f: (b) => editFile(join(b, 'nginx.conf'), (t) => t.replace(/Content-Security-Policy "[^"]*"/, 'Content-Security-Policy "default-src *"')), re: /Content-Security-Policy is/ },
  { n: 'htaccess missing a security header', a: ['static'], f: (b) => editFile(join(b, 'htaccess'), (t) => t.replace(/ {2}Header always set X-Frame-Options[^\n]*\n/, '')), re: /X-Frame-Options is missing/ },
];

// requests that must be refused before a bundle exists
const REFUSALS = [
  { n: 'HSTS includeSubDomains without an authorisation', adapter: 'cloudflare-pages', opts: { hsts: { includeSubDomains: true } }, re: /needs a recorded authorisation/ },
  { n: 'HSTS includeSubDomains with a vague authorisation ("yes")', adapter: 'vercel', opts: { hsts: { includeSubDomains: true, authorisation: 'yes' } }, re: /needs a recorded authorisation/ },
  { n: 'Cloudflare Pages for a site that declares extension URLs', adapter: 'cloudflare-pages', opts: { urlStyle: 'extension' }, re: /urlStyle "clean"/ },
  { n: 'a plain server for a site that declares clean URLs', adapter: 'static', opts: { urlStyle: 'clean' }, re: /urlStyle "extension"/ },
  { n: 'an indexable site whose base URL has a path (D-P3-2)', adapter: 'vercel', opts: { baseUrl: 'https://example.test/shop/' }, channel: 'client-production', re: /domain or subdomain root/ },
  { n: 'a channel that disagrees with the pages', adapter: 'vercel', opts: { channel: 'demonstration' }, channel: 'client-production', re: /channel was given as demonstration but the pages say client-production/ },
  { n: 'an unknown adapter', adapter: 'netlify', opts: {}, re: /no adapter named/ },
  { n: 'a mixed noindex build', adapter: 'vercel', opts: {}, mutateSite: (d) => editFile(join(d, 'about.html'), (t) => t.replace('<meta name="robots" content="noindex, nofollow">\n', '')), channel: 'demonstration', re: /some pages carry the robots noindex/ },
  { n: 'a site without index.html', adapter: 'vercel', opts: {}, mutateSite: (d) => rmrf(join(d, 'index.html')), re: /no index\.html/ },
  { n: 'a vendor file in the delivered site', adapter: 'cloudflare-pages', opts: {}, mutateSite: (d) => writeFileSync(join(d, '_worker.js'), 'export default {}'), re: /_worker\.js/ },
  { n: 'a symbolic link in the delivered site', adapter: 'vercel', opts: {}, mutateSite: (d) => symlinkSync('/etc/passwd', join(d, 'link.txt')), re: /symbolic link/ },
  { n: 'a file over the Pages size limit', adapter: 'cloudflare-pages', opts: {}, mutateSite: (d) => writeFileSync(join(d, 'media', 'huge.mp4'), Buffer.alloc(25 * 1024 * 1024 + 1)), re: /over the host limit/ },
];

// The two independent checkers on their own, so a fault in one cannot hide behind the other layer (the bundle check also writes the files again and compares).
function unitCases(policy) {
  const problems = [];
  const site = writeFixtureSite(join(tmp('unit'), 'site'), { channel: 'demonstration' });
  const client = writeFixtureSite(join(tmp('unit'), 'site'), { channel: 'client-production' });
  try {
    for (const [label, root] of [['demonstration', site], ['client', client]]) {
      const d = describeSite(root, { urlStyle: 'clean' }), h = composeHeaders(d, policy);
      const computed = { noindex: d.channel === 'demonstration' ? 'all' : 'none', csp: buildCsp(root, policy, { https: true }), pages: d.pages.map((p) => p.public), code: h.cache.code, staticDirs: h.cache.staticDirs };
      const cf = renderHeadersFile(root, policy, { https: true }), vc = renderBundleToText('vercel', root, policy, null);
      const cfCheck = (t, hs = null) => checkHeadersFileDirect(t, { root, policy, computed, hsts: hs });
      const vcCheck = (t, hs = null) => checkVercelJson(t, { site: d, policy, hsts: hs, computed });
      if (cfCheck(cf).length || vcCheck(vc).length) { problems.push(`unit (${label}): the undamaged files fail: ${[...cfCheck(cf), ...vcCheck(vc)][0]}`); continue; }
      const expectOnly = (what, got, re) => { if (!got.some((x) => re.test(x))) problems.push(`unit (${label}) ${what}: expected ${re}, got ${got.slice(0, 2).join(' | ') || 'nothing'}`); };
      expectOnly('_headers with a stale CSP', cfCheck(cf.replace(/script-src 'self' [^;]*;/, "script-src 'self';")), /CSP in the file is not the policy computed/);
      expectOnly('vercel.json with a stale CSP', vcCheck(vc.replace(/script-src 'self' [^;]*;/, "script-src 'self';")), /CSP is not the policy computed/);
      expectOnly('_headers with a changed HSTS max-age', cfCheck(cf.replace('max-age=31536000', 'max-age=60')), /Strict-Transport-Security is "max-age=60"/);
      expectOnly('vercel.json with a changed HSTS max-age', vcCheck(vc.replace('max-age=31536000', 'max-age=60')), /Strict-Transport-Security is "max-age=60"/);
      expectOnly('_headers with HSTS preload', cfCheck(cf.replace('max-age=31536000', 'max-age=31536000; preload')), /carries preload/);
      expectOnly('vercel.json with HSTS preload', vcCheck(vc.replace('"max-age=31536000"', '"max-age=31536000; preload"')), /carries preload/);
      expectOnly('_headers with includeSubDomains and an opt-in that was never recorded', cfCheck(cf.replace('max-age=31536000', 'max-age=31536000; includeSubDomains')), /includeSubDomains without a recorded authorisation/);
      expectOnly('the same file when the opt-in IS recorded must pass', cfCheck(cf.replace('max-age=31536000', 'max-age=31536000; includeSubDomains'), { includeSubDomains: true, authorisation: 'APR-JE-044' }).length ? ['fails'] : ['ok'], /ok/);
    }
    // the policy itself: a default HSTS value that carries includeSubDomains or preload is refused
    for (const bad of ['max-age=31536000; includeSubDomains', 'max-age=31536000; preload']) {
      try { httpsHeaders({ ...policy, httpsOnlyHeaders: { 'Strict-Transport-Security': bad } }, null); problems.push(`a default Strict-Transport-Security of "${bad}" was accepted`); } catch { /* refused */ }
    }
  } finally { rmrf(dirname(site)); rmrf(dirname(client)); }
  return problems;
}
const checkHeadersFileDirect = (text, o) => cfCheckImport(text, { ...o, label: 'unit _headers' });

export async function checkHostingAdapters({ updateGolden = false } = {}) {
  const problems = [], notes = [];
  const policy = loadPolicy();
  const temps = [];
  const t = (l) => { const d = tmp(l); temps.push(d); return d; };
  try {
    // 0. provider facts: filed, well formed, nothing marked confirmed live
    try {
      const f = readJ(FACTS);
      const ids = new Set(f.facts.map((x) => x.id));
      if (ids.size !== f.facts.length) problems.push('provider-facts.json: a fact id is repeated');
      for (const x of f.facts) {
        if (!['official-docs-raw-source', 'official-docs-search-paraphrase', 'provider-open-source-code'].includes(x.sourceKind)) problems.push(`provider-facts.json: ${x.id} has the unknown source kind ${x.sourceKind}`);
        if (x.sourceKind !== 'official-docs-search-paraphrase' && (!x.quote || !f.sources[x.source]?.sha256)) problems.push(`provider-facts.json: ${x.id} has no verbatim quote with a source digest`);
        if (x.sourceKind === 'official-docs-search-paraphrase' && (!x.note || !x.publishedPage)) problems.push(`provider-facts.json: ${x.id} is a paraphrase and must say so and name the page`);
        if (x.live !== 'unchecked' || x.confirmedBy !== null) problems.push(`provider-facts.json: ${x.id} is marked as live-checked or confirmed, but no preview is authorised (D-P3-5) and no person has confirmed it`);
      }
      if (f.personConfirmation?.status !== 'not done') problems.push('provider-facts.json: personConfirmation must say "not done" until a person has re-read the pages (D-P3-6)');
      for (const a of Object.values(ADAPTERS)) for (const id of a.facts) if (!ids.has(id)) problems.push(`${a.id}: cites ${id}, which is not in provider-facts.json`);
      notes.push(`provider facts: ${f.facts.length} filed (${f.facts.filter((x) => x.sourceKind === 'official-docs-raw-source').length} verbatim from the Cloudflare documentation source, ${f.facts.filter((x) => x.sourceKind === 'provider-open-source-code').length} from Vercel's open-source routing code, ${f.facts.filter((x) => x.sourceKind === 'official-docs-search-paraphrase').length} paraphrases of Vercel pages that could not be fetched); none confirmed by a person or observed live`);
    } catch (e) { problems.push(`provider-facts.json: ${e.message}`); }

    // 1. the HSTS default (D-P3-4, D-P4-5)
    if (/includeSubDomains|preload/i.test(policy.httpsOnlyHeaders['Strict-Transport-Security'])) problems.push('security.json: the default Strict-Transport-Security contains includeSubDomains or preload');
    try { httpsHeaders(policy, { includeSubDomains: true }); problems.push('HSTS includeSubDomains was produced without an authorisation'); } catch { /* refused */ }
    if (httpsHeaders(policy, { includeSubDomains: true, authorisation: 'APR-JE-044' })['Strict-Transport-Security'] !== `${policy.httpsOnlyHeaders['Strict-Transport-Security']}; includeSubDomains`) problems.push('the authorised HSTS opt-in is not the default plus includeSubDomains');

    // 2. every adapter x channel on the invented fixture: bundle checks, behaviour under the simulation profile, byte-for-byte golden outputs
    let behaviours = 0, golden = 0;
    for (const adapterId of Object.keys(ADAPTERS)) for (const channel of ['demonstration', 'client-production']) for (const with404 of [true, false]) {
      const site = writeFixtureSite(join(t('fixture'), 'site'), { channel, with404 });
      const out = t('bundle');
      const bundle = join(out, 'b');
      let r;
      try { r = renderBundle(adapterId, { siteDir: site, outDir: bundle, urlStyle: URL_STYLE[adapterId], baseUrl: channel === 'client-production' ? 'https://fixture-bakery.example' : null, policy }); } catch (e) { problems.push(`${adapterId} ${channel}${with404 ? '' : ' without 404'}: ${e.message}`); continue; }
      const c = checkBundle(bundle, { policy, forRelease: false, deliveredDir: site });
      c.problems.forEach((p) => problems.push(`${adapterId} ${channel}${with404 ? '' : ' without 404'}: ${p}`));
      const rel = checkBundle(bundle, { policy, forRelease: true });
      if (with404 && rel.problems.length) problems.push(`${adapterId} ${channel}: a bundle with a 404.html failed the release check: ${rel.problems[0]}`);
      if (!with404 && !rel.problems.some((p) => /release blocker D-P3-1/.test(p))) problems.push(`${adapterId} ${channel}: a bundle with no 404.html passed the release check`);
      if (with404 && c.blockers.length) problems.push(`${adapterId} ${channel}: blockers on a complete fixture: ${c.blockers.map((b) => b.id).join(', ')}`);
      if (adapterId !== 'static') { (await behaviour(adapterId, bundle, { policy, expect404: with404 })).forEach((p) => problems.push(p)); behaviours++; }
      if (with404) {   // golden: every file the adapter writes, byte for byte
        const gd = join(GOLDEN, adapterId, channel);
        const mine = r.manifest.files.filter((e) => e.role !== 'site').map((e) => e.path).concat([MANIFEST]);
        if (updateGolden) { rmrf(gd); for (const f of mine) { mkdirSync(dirname(join(gd, f)), { recursive: true }); cpSync(join(bundle, f), join(gd, f)); } }
        else {
          const have = existsSync(gd) ? walkFiles(gd) : [];
          for (const f of mine) { if (!have.includes(f)) problems.push(`golden ${adapterId}/${channel}/${f} is missing (run with --update-golden and review the diff)`); else if (!readFileSync(join(gd, f)).equals(readFileSync(join(bundle, f)))) problems.push(`golden ${adapterId}/${channel}/${f} differs from the generated file`); }
          for (const f of have) if (!mine.includes(f)) problems.push(`golden ${adapterId}/${channel}/${f} is no longer generated`);
        }
        golden += mine.length;
      }
    }
    notes.push(`3 adapters x 2 channels on the invented fixture bakery: every bundle passes the outside check and the regenerate-and-compare check; ${behaviours} bundle/profile walks (pages, .html redirects, slashed path, unknown path, search files, host files not served, cache class per request path, Range, security headers, deployed-bytes comparison); ${golden} golden files byte-identical; a bundle with no 404.html is accepted for staging and refused for release (D-P3-1)`);

    // 3. all renderings carry one header set
    const fx = writeFixtureSite(join(t('agree'), 'site'), { channel: 'client-production' });
    renderingsAgree(fx, policy).forEach((p) => problems.push(`renderings: ${p}`));
    renderingsAgree(fx, policy, { includeSubDomains: true, authorisation: 'APR-JE-044' }).forEach((p) => problems.push(`renderings (HSTS opt-in): ${p}`));
    notes.push('_headers, nginx.conf, htaccess and vercel.json carry the same security header names and values as security.json, with and without the HSTS opt-in');

    // 4. the real site: Jade & Ember's demonstration and a realistic indexable client build
    const cand = assembleCandidate(undefined, 'hosting-adapters');
    rmrf(join(cand, 'config'));
    const client = buildClient({ label: 'hosting-adapters-client', edit: (name, o) => { if (name === 'client') o.seo.urlStyle = 'clean'; } });
    temps.push(cand, client.root);
    if (client.status !== 0) problems.push(`the client build failed: ${client.text}`);
    else for (const [label, dir, base] of [['Jade & Ember demonstration', cand, null], ['indexable client build', client.dir, 'https://jadeandember.example.test']]) {
      for (const adapterId of ['cloudflare-pages', 'vercel']) {
        const out = t('real'), bundle = join(out, 'b');
        try {
          const r = renderBundle(adapterId, { siteDir: dir, outDir: bundle, urlStyle: 'clean', baseUrl: base, policy });
          const c = checkBundle(bundle, { policy, deliveredDir: dir });
          c.problems.forEach((p) => problems.push(`${label} / ${adapterId}: ${p}`));
          const ids = r.blockers.map((b) => b.id).join();
          if (ids !== 'real-404') problems.push(`${label} / ${adapterId}: the open live blockers are [${ids}], expected exactly [real-404] (the site has no 404.html; visual proposal VP-3 is not approved)`);
          (await behaviour(adapterId, bundle, { policy, expect404: false })).forEach((p) => problems.push(p));
        } catch (e) { problems.push(`${label} / ${adapterId}: ${e.message}`); }
      }
    }
    notes.push('the real Jade & Ember site (demonstration) and an indexable client build of it, delivered folder unchanged, stage and check under both Cloudflare Pages and Vercel; the only open live blocker is the missing 404.html (D-P3-1: no page is created here; VP-3 is not approved)');

    unitCases(policy).forEach((p) => problems.push(p));
    notes.push('the Cloudflare _headers checker and the vercel.json checker, run on their own against damaged text (a stale CSP, a changed HSTS max-age, preload, an unrecorded includeSubDomains), and the policy loader against a default HSTS that carries includeSubDomains or preload');
    // 5. adversarial negative cases
    const baseFor = (channel, adapterId, fx = {}) => {
      const site = writeFixtureSite(join(t('neg-site'), 'site'), { channel, ...fx });
      const out = t('neg'), bundle = join(out, 'b');
      renderBundle(adapterId, { siteDir: site, outDir: bundle, urlStyle: URL_STYLE[adapterId], baseUrl: channel === 'client-production' ? 'https://fixture-bakery.example' : null, policy });
      return { site, bundle };
    };
    let negatives = 0;
    for (const c of CASES) for (const adapterId of c.a) {
      negatives++;
      const channel = c.channel || 'client-production';
      let site, bundle;
      try { ({ site, bundle } = baseFor(channel, adapterId, c.fixture)); } catch (e) { problems.push(`negative "${c.n}" (${adapterId}): the clean bundle could not be written: ${e.message}`); continue; }
      const clean = checkBundle(bundle, { policy, forRelease: !c.fixture });
      if (clean.problems.length) { problems.push(`negative "${c.n}" (${adapterId}): the undamaged bundle already fails: ${clean.problems[0]}`); continue; }
      const m = readManifest(bundle);
      try { c.f(bundle, m, site); } catch (e) { problems.push(`negative "${c.n}" (${adapterId}): the damage could not be applied: ${e.message}`); continue; }
      let res;
      try { res = checkBundle(bundle, { policy, forRelease: Boolean(c.forRelease), deliveredDir: c.deliveredCheck ? site : null }); } catch (e) { problems.push(`negative "${c.n}" (${adapterId}): the check crashed: ${e.message}`); continue; }
      if (!res.problems.some((p) => c.re.test(p))) problems.push(`negative "${c.n}" (${adapterId}): not refused for the right reason. Expected ${c.re}; got ${res.problems.length ? res.problems.slice(0, 2).join(' | ').slice(0, 220) : 'no problem at all'}`);
    }
    for (const rf of REFUSALS) {
      negatives++;
      const site = writeFixtureSite(join(t('ref-site'), 'site'), { channel: rf.channel || 'client-production' });
      try { rf.mutateSite?.(site); renderBundle(rf.adapter, { siteDir: site, outDir: join(t('ref'), 'b'), urlStyle: rf.opts.urlStyle || URL_STYLE[rf.adapter] || 'clean', baseUrl: rf.opts.baseUrl ?? null, channel: rf.opts.channel ?? null, hsts: rf.opts.hsts ?? null, policy }); problems.push(`refusal "${rf.n}": the bundle was written`); }
      catch (e) { if (!rf.re.test(e.message)) problems.push(`refusal "${rf.n}": refused for the wrong reason: ${e.message.slice(0, 200)}`); }
    }
    // the vercel.json checker on its own, with the site omitted from the files (hand-written JSON)
    if (checkVercelJson('not json', { site: { urlStyle: 'clean' } }).length !== 1) problems.push('checkVercelJson accepted text that is not JSON');
    notes.push(`${negatives} adversarial negative cases refused for the right reason: tampered or extra files, a repaired manifest, symlinks, vendor and secret files, stale CSP, HSTS includeSubDomains/preload slipped in or faked, header injection, duplicate/misspelt/foreign vercel.json keys, routes the site does not use, header-source forms, rule and size limits, wrong channel headers, a missing 404 for release, a missing search file, a base URL with a path`);

    // 6. the deployed-bytes comparison on its own
    {
      const site = writeFixtureSite(join(t('served-site'), 'site'), {}), out = t('served'), bundle = join(out, 'b');
      renderBundle('cloudflare-pages', { siteDir: site, outDir: bundle, urlStyle: 'clean', baseUrl: 'https://fixture-bakery.example', policy });
      const m = readManifest(bundle), ok = new Map();
      for (const e of m.files.filter((x) => x.role === 'site' && x.path !== 'site/404.html')) { const n = e.path.slice(5); ok.set(n === 'index.html' ? '/' : n.endsWith('.html') ? `/${n.slice(0, -5)}` : `/${n}`, readFileSync(join(bundle, e.path))); }
      if (verifyServed(m, ok).length) problems.push(`the deployed-bytes comparison rejected the staged bytes: ${verifyServed(m, ok)[0]}`);
      const rewritten = new Map(ok); rewritten.set('/menu', Buffer.from(ok.get('/menu').toString('utf8').replace('</body>', '<script src="//beacon.example/x.js"></script></body>')));
      if (!verifyServed(m, rewritten).some((p) => /\/menu: the served bytes differ/.test(p))) problems.push('a page rewritten by the host (an injected beacon) passed the deployed-bytes comparison');
      const missing = new Map(ok); missing.delete('/about');
      if (!verifyServed(m, missing).some((p) => /\/about: not served/.test(p))) problems.push('a missing page passed the deployed-bytes comparison');
      const extra = new Map(ok); extra.set('/admin', Buffer.from('x'));
      if (!verifyServed(m, extra).some((p) => /\/admin: served but not part of the staged bundle/.test(p))) problems.push('an extra served path passed the deployed-bytes comparison');
      notes.push('deployed-bytes comparison (C-07, D-P3-3): accepts the staged bytes; refuses a page rewritten by the host, a missing page and an extra served path');
    }
    // 7. the shipped host-file generators still carry the corrected default
    const demo = assembleCandidate(undefined, 'hosting-hsts');
    temps.push(demo);
    for (const [n, text] of [['_headers', renderHeadersFile(demo, policy, { https: true })], ['nginx.conf', renderNginx(demo, policy, { https: true })], ['htaccess', renderApache(demo, policy, { https: true })]]) if (/includeSubDomains/.test(text)) problems.push(`${n} (the release package's host file) still carries HSTS includeSubDomains`);
    notes.push('the release package\'s host files (_headers, nginx.conf, htaccess) carry Strict-Transport-Security: max-age=31536000 with no includeSubDomains');
  } catch (e) { problems.push(`the adapter tests crashed: ${e.stack?.split('\n').slice(0, 3).join(' | ') || e.message}`); }
  finally { for (const d of temps) rmrf(d); }
  return { problems, notes };
}

if (isMain(import.meta.url)) {
  const t0 = Date.now();
  const { problems, notes } = await checkHostingAdapters({ updateGolden: process.argv.includes('--update-golden') });
  notes.forEach((n) => console.log('  ' + n));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:hosting-adapters (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  process.exit(problems.length ? 1 : 0);
}
void readdirSync;
