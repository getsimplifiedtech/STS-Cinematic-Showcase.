// Hosting adapters: registry, bundle rendering and the bundle check (G6-4, APR-JE-044). See README.md for the interface and its invariants.
// No adapter reads a credential, reaches a network or deploys anything: each is a pure function from a delivered folder to a staged bundle, and from a bundle to a list of problems.
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { buildCsp, httpsHeaders, loadPolicy, noindexState } from '../../lib/security.mjs';
import { parseStrictJson } from '../../lib/strict-json.mjs';
import { ASSET_DIRS, AdapterError, MANIFEST, MANIFEST_SCHEMA, NEVER_SERVED, NOT_FOUND_PAGE, SEARCH_FILES, canonicalJson, composeHeaders, describeSite, readManifest, sha256, verifyServed, walkFiles, writeBundle } from './common.mjs';
import { cloudflarePages } from './cloudflare-pages.mjs';
import { vercel } from './vercel.mjs';
import { staticServer } from './static.mjs';
import { profileOf } from './profiles.mjs';

export const ADAPTERS = Object.freeze({ 'cloudflare-pages': cloudflarePages, vercel, static: staticServer });
export const adapterOf = (id) => (typeof id === 'string' && Object.hasOwn(ADAPTERS, id) ? ADAPTERS[id] : null);
export { describeSite, profileOf, verifyServed, readManifest, AdapterError, MANIFEST };
const STATIC_EXT = new Set(['.html', '.css', '.js', '.webp', '.webm', '.mp4', '.woff2', '.txt', '.xml', '.ico', '.svg', '.png', '.jpg', '.json', '.md']);
const ROLES = new Set(['site', 'headers', 'deploy-config', 'server-config', 'doc']);
const MANIFEST_KEYS = new Set(['schema', 'adapter', 'channel', 'urlStyle', 'baseUrl', 'siteRoot', 'options', 'files', 'siteTreeSha256', 'settingsToApply', 'notes', 'noCredential']);
// folders of the project that must never be in a delivered site (they hold sources, tests, tooling or configuration)
const PROJECT_DIRS = /^(config|src|tests?|engineering|docs?|baselines?|release|host|\.github|node_modules|coverage|scripts?)$/i;
// strings that look like a credential. High precision: provider token prefixes, key blocks, and an assignment of a long secret-looking value.
const CREDENTIAL = [/\bcf(?:at|ut)_[A-Za-z0-9]{20,}/, /\bvercel_blob_rw_[A-Za-z0-9_]{10,}/, /\bvcp_[A-Za-z0-9]{20,}/, /\b(?:CLOUDFLARE|VERCEL|CF)_[A-Z_]*(?:TOKEN|KEY|SECRET)\s*[=:]/, /\bgh[pousr]_[A-Za-z0-9]{30,}/, /\bgithub_pat_[A-Za-z0-9_]{30,}/, /\bAKIA[0-9A-Z]{16}\b/, /\bxox[abprs]-[A-Za-z0-9-]{10,}/, /\bsk_(?:live|test)_[A-Za-z0-9]{16,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\b(?:api[_-]?key|secret|password|passwd|access[_-]?token|auth[_-]?token)["']?\s*[:=]\s*["']?[A-Za-z0-9_\-+/=]{16,}/i, /\bBearer\s+[A-Za-z0-9._~+/-]{20,}/, /\bhttps?:\/\/[^\s/@:]+:[^\s/@]+@/];

// What every bundle must be able to say about live behaviour it has NOT seen. The list is written into SETTINGS.txt and the manifest.
export const UNVERIFIED_LIVE = Object.freeze({
  'cloudflare-pages': [
    'the status of the redirect from /menu.html to /menu (308 is assumed)', 'what /menu/ does (HR-03)', 'what /index, /404 and /404.html do (modelled: not found, answered with the 404 page)',
    'that the 404.html response has status 404 (the documentation says only that the page is displayed when a file is not found)', 'whether the _headers rules apply to the 404.html response and to the home-page fallback',
    'whether a header set in _headers replaces the platform\'s default of the same name (modelled, as the documentation says _headers "override what Cloudflare ordinarily sends") or is joined with it; Access-Control-Allow-Origin: * is a platform default the bundle does not remove',
    'the content types served for .xml, .txt, .webm, .mp4 and .woff2', 'Range support for the hero video: the documentation says 200 is returned, which Safari cannot seek (HR-12)', 'that the deployed bytes equal the staged bytes (checklist C-07)',
    'compression and caching at the edge', 'HSTS: that the header is sent as written and not changed by a zone setting',
  ],
  vercel: [
    'that a 404.html in the output directory is served with status 404', 'what /404 and /404.html do (modelled: answered with the 404 page)', 'that vercel.json at the bundle root works with the Root Directory setting (HR-06)',
    'that the HSTS header in vercel.json replaces the platform default for a custom domain (VC-15); *.vercel.app domains get includeSubDomains; preload from the platform whatever vercel.json says',
    'how several matching header entries combine when a key repeats (the open-source routing code sets it again)', 'that the source "/(.*)" is not treated as a named segment (which would change how colons in header values are read, VC-06)',
    'that the routing library\'s /index and /x/index redirects (modelled) are what the platform does', 'the content types served for .xml, .txt, .webm, .mp4 and .woff2', 'Range support for the hero video',
    'that the deployed bytes equal the staged bytes (checklist C-07)', 'Deployment Protection state (whether previews are protected by default was reported inconsistently, HR-14) and the preview X-Robots-Tag (VC-16)',
  ],
  static: ['everything: this adapter only wraps the existing nginx and Apache renderings; no server was run'],
});

const sitemapLocs = (text) => [...text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
const canonicals = (html) => [...html.matchAll(/<link[^>]*\brel=["']canonical["'][^>]*>/gi)].map((m) => /\bhref=["']([^"']+)["']/i.exec(m[0])?.[1]).filter(Boolean);
const pathOf = (u) => { try { return new URL(u).pathname; } catch { return null; } };

// problems with the site folder itself, for any adapter. read(f) returns a file's bytes (the delivered folder or the bundle's site).
export function siteProblems(site, adapter, { sizes = null, read = null } = {}) {
  const problems = [];
  const lower = new Map();
  for (const f of site.files) {
    const segs = f.split('/');
    if (!/^[A-Za-z0-9._/-]+$/.test(f)) problems.push(`${f}: file names must be plain ASCII (letters, digits, dot, dash, underscore)`);
    for (const s of segs) {
      if (adapter.forbiddenInSite.some((re) => re.test(s))) problems.push(`${f}: ${s} is a host, application or secret file; the delivered site is vendor free and the adapter writes the host files`);
      else if (s.startsWith('.')) problems.push(`${f}: hidden file`);
    }
    if (segs.length > 1 && PROJECT_DIRS.test(segs[0])) problems.push(`${f}: ${segs[0]}/ holds project sources, tests, tooling or configuration; the delivered site is the built pages and assets only`);
    if (NEVER_SERVED.includes(f)) problems.push(`${f}: belongs to the release package (run by the recipient), never to a deployed site`);
    const ext = extname(f);
    if (!STATIC_EXT.has(ext.toLowerCase())) problems.push(`${f}: not a static web file type`);
    else if (ext !== ext.toLowerCase()) problems.push(`${f}: the extension must be lower case (${ext}); the pages, the cache rules and the search-file guards are case-sensitive`);
    if (/\.html$/i.test(f) && segs.length > 1) problems.push(`${f}: an HTML page must sit at the top level (nested pages are not supported: their inline items would not be hashed in the CSP and no host rule covers them)`);
    if (segs.length > 1 && ASSET_DIRS.includes(segs[0]) && /\.(css|js|html)$/i.test(f)) problems.push(`${f}: ${segs[0]}/ holds assets only (cached for a week); stylesheets, scripts and pages belong outside it`);
    const k = f.toLowerCase();
    if (lower.has(k) && lower.get(k) !== f) problems.push(`${f} and ${lower.get(k)} differ only by case`);
    lower.set(k, f);
    if (SEARCH_FILES.includes(k) && f !== k) problems.push(`${f}: a search file must be named exactly ${k}`);
    if (sizes && adapter.capabilities.limits.fileBytes && sizes.get(f) > adapter.capabilities.limits.fileBytes) problems.push(`${f}: ${sizes.get(f)} bytes is over the host limit of ${adapter.capabilities.limits.fileBytes}`);
  }
  for (const pg of site.pages) { const stem = pg.file.replace(/\.html$/, '').toLowerCase(); if (site.files.some((f) => f.toLowerCase().startsWith(`${stem}/`))) problems.push(`${pg.file}: a folder named ${stem}/ collides with the page of the same name`); }
  const searchPresent = SEARCH_FILES.filter((f) => site.files.some((x) => x.toLowerCase() === f));
  if (site.channel === 'client-production') {
    const missing = SEARCH_FILES.filter((f) => !site.files.includes(f));
    if (missing.length) problems.push(`an indexable client build must serve ${missing.join(', ')} from the root`);
  } else if (searchPresent.length) problems.push(`the demonstration must not publish ${searchPresent.join(', ')} (it stays noindex)`);
  if (read) {
    for (const f of SEARCH_FILES) if (site.files.includes(f) && !read(f).toString('utf8').trim()) problems.push(`${f} is empty`);
    if (site.hasNotFoundPage) {
      const nf = read(NOT_FOUND_PAGE).toString('utf8');
      if (!nf.replace(/<head[\s\S]*?<\/head>/i, '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<[^>]*>/g, ' ').trim()) problems.push(`${NOT_FOUND_PAGE} has no text: a 404 page must say the page was not found`);
      if (/<meta[^>]+http-equiv=["']?refresh/i.test(nf)) problems.push(`${NOT_FOUND_PAGE} redirects with a meta refresh: that is a soft 404`);
      if (site.files.includes('index.html') && read('index.html').equals(read(NOT_FOUND_PAGE))) problems.push(`${NOT_FOUND_PAGE} is a copy of index.html: that is a soft 404`);
    }
    // the declared URL style must be the one the site's own sitemap and canonical links use (a sitemap full of addresses that the host would redirect or not find)
    const want = new Set(site.pages.map((p) => p.public));
    const check = (what, urls) => { for (const u of urls) { const p = pathOf(u); if (p === null) problems.push(`${what}: ${u} is not an absolute URL`); else if (!want.has(p)) problems.push(`${what}: ${p} is not a page address under urlStyle "${site.urlStyle}" (the pages are ${[...want].join(', ')})`); } };
    if (site.files.includes('sitemap.xml')) check('sitemap.xml', sitemapLocs(read('sitemap.xml').toString('utf8')));
    if (site.channel === 'client-production') for (const pg of site.pages) check(`${pg.file} canonical`, canonicals(read(pg.file).toString('utf8')));
  }
  if (site.baseUrl) {
    try {
      const u = new URL(site.baseUrl);
      if (site.channel === 'client-production') {
        if (u.protocol !== 'https:') problems.push(`the base URL ${site.baseUrl} is not https`);
        if (u.username || u.password) problems.push('the base URL carries a user name or password');
        if (u.port || u.search || u.hash) problems.push(`the base URL ${site.baseUrl} has a port, query or fragment`);
        if (!/^\/?$/.test(u.pathname)) problems.push(`the base URL ${site.baseUrl} has a path: an indexable production site must use a domain or subdomain root (D-P3-2)`);
      }
    } catch { problems.push(`the base URL ${site.baseUrl} is not a URL`); }
  }
  return problems;
}

// text that looks like a credential, anywhere in a bundle (the site, the host files, the manifest)
export function credentialProblems(entries) {
  const problems = [];
  for (const [name, buf] of entries) {
    if (!/\.(html|css|js|txt|xml|json|md|toml|conf|htaccess|svg)$/i.test(name) && !/^(_headers|htaccess|SETTINGS\.txt)$/.test(name.split('/').pop())) continue;
    const text = buf.toString('utf8');
    for (const re of CREDENTIAL) if (re.test(text)) { problems.push(`${name}: contains text that looks like a credential (${re.source.slice(0, 40)}...); a bundle holds none`); break; }
  }
  return problems;
}

// What would be wrong on a live host if the site were released as it is. Not a bundle defect: a release blocker (D-P3-1 for the 404).
export function liveBlockers(site, adapter) {
  const out = [];
  if (!site.hasNotFoundPage) {
    out.push({
      id: 'real-404', decision: 'D-P3-1', risk: 'HR-01',
      text: adapter.id === 'cloudflare-pages'
        ? 'there is no top-level 404.html: Cloudflare Pages then treats the site as a single-page application and answers EVERY unknown path, including /robots.txt, /sitemap.xml and /llms.txt on the demonstration, with the home page and status 200 (CF-10, CF-11)'
        : adapter.id === 'vercel' ? 'there is no 404.html: unknown paths get the platform\'s own 404 page (status 404 is expected but not established, VC-14), which is not the site\'s design'
          : 'there is no 404.html: unknown paths get the server\'s own error page, not the site\'s design',
      closedBy: 'an owner-approved 404 page (visual proposal VP-3 is not approved) placed in the delivered folder',
    });
  }
  return out;
}

const settingsText = (adapter, settings, blockers) => [
  `Settings for ${adapter.id}: SYNTHETIC STAGING INSTRUCTIONS. This bundle holds no credential, account, project or team identifier and cannot deploy anything.`, '',
  ...settings.map((s) => `* ${s.name}: ${s.value}`), '',
  'Provider facts this adapter rests on: ' + (adapter.facts.length ? adapter.facts.join(', ') : 'none') + ' (engineering/hosting/provider-facts.json).',
  '', 'NOT OBSERVED ON A LIVE HOST (each is an unverified assumption until a separately authorised live check records it):',
  ...(UNVERIFIED_LIVE[adapter.id] || []).map((u) => `  - ${u}`), ...blockers.map((b) => `\nLIVE RELEASE BLOCKER (${b.decision}, ${b.risk}): ${b.text}`), '',
].join('\n');

// everything an adapter writes besides the site, and the descriptive parts of the manifest: ONE function, used to write a bundle and to write it again when checking
function expected(adapter, site, policy, hsts) {
  const { extra, settings } = adapter.render({ site, policy, hsts });
  const blockers = liveBlockers(site, adapter);
  const all = [...extra, { path: 'SETTINGS.txt', role: 'doc', content: settingsText(adapter, settings, blockers) }];
  const notes = { unverifiedLive: UNVERIFIED_LIVE[adapter.id] || [], liveBlockers: blockers, providerFacts: adapter.facts, capabilities: adapter.capabilities };
  return { extra: all, settings, blockers, notes };
}

// ---- render
export function renderBundle(adapterId, { siteDir, outDir, urlStyle, baseUrl = null, channel = null, hsts = null, policy = loadPolicy() }) {
  const adapter = adapterOf(adapterId);
  if (!adapter) throw new AdapterError('unknown-adapter', `no adapter named ${JSON.stringify(String(adapterId).slice(0, 40))} (${Object.keys(ADAPTERS).join(', ')})`);
  const site = describeSite(siteDir, { urlStyle, baseUrl, channel });
  const sizes = new Map(site.files.map((f) => [f, lstatSync(join(siteDir, f)).size]));
  const problems = [...siteProblems(site, adapter, { sizes, read: (f) => readFileSync(join(siteDir, f)) }), ...adapter.validateSite(site), ...credentialProblems(site.files.map((f) => [f, readFileSync(join(siteDir, f))]))];
  if (problems.length) throw new AdapterError('site-invalid', `the site cannot be staged for ${adapterId}:\n  - ${problems.join('\n  - ')}`);
  if (hsts) httpsHeaders(policy, hsts);   // throws when includeSubDomains has no recorded authorisation
  const ex = expected(adapter, site, policy, hsts);
  const bundle = writeBundle({
    outDir, adapter: adapterId, site, siteRoot: adapter.siteRoot, extra: ex.extra,
    options: { hsts: hsts && hsts.includeSubDomains === true ? { includeSubDomains: true, authorisation: hsts.authorisation } : { includeSubDomains: false } },
    settingsToApply: ex.settings, notes: ex.notes,
  });
  return { ...bundle, blockers: ex.blockers, site };
}

// ---- check
// Checks a bundle two ways that must agree: (1) from the outside, with rules that do not use the code that wrote it; (2) by writing it again from the site files it holds and
// comparing byte for byte, host files, SETTINGS.txt and the descriptive parts of the manifest included. forRelease turns the live blockers (a missing 404.html) into problems.
// deliveredDir, when given, is the folder the site files must equal.
export function checkBundle(bundleDir, { policy = loadPolicy(), forRelease = false, deliveredDir = null } = {}) {
  const problems = [], notes = [];
  let manifest;
  try { manifest = parseStrictJson(readFileSync(join(bundleDir, MANIFEST), 'utf8')); } catch (e) { return { problems: [`${MANIFEST}: missing or not valid JSON (${String(e.message).slice(0, 80)})`], blockers: [], notes }; }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return { problems: [`${MANIFEST}: not an object`], blockers: [], notes };
  if (manifest.schema !== MANIFEST_SCHEMA) problems.push(`${MANIFEST}: schema is ${JSON.stringify(manifest.schema)}, expected ${MANIFEST_SCHEMA}`);
  for (const k of Object.keys(manifest)) if (!MANIFEST_KEYS.has(k)) problems.push(`${MANIFEST}: "${k}" is not a field of a bundle manifest (no identifier, account or token has a place here)`);
  const adapter = adapterOf(manifest.adapter);
  if (!adapter) return { problems: [...problems, `${MANIFEST}: unknown adapter ${JSON.stringify(String(manifest.adapter).slice(0, 40))}`], blockers: [], notes };
  if (manifest.siteRoot !== adapter.siteRoot) problems.push(`${MANIFEST}: siteRoot is ${JSON.stringify(manifest.siteRoot)}, the adapter's is ${adapter.siteRoot}`);
  if (!Array.isArray(manifest.files)) return { problems: [...problems, `${MANIFEST}: files is not a list`], blockers: [], notes };
  // 1. the manifest against the disk: the same set of files, the same bytes, nothing else
  let disk = [];
  try { disk = walkFiles(bundleDir).filter((f) => f !== MANIFEST); } catch (e) { problems.push(`bundle: ${e.message}`); }
  const listed = new Map();
  for (const e of manifest.files) {
    if (!e || typeof e.path !== 'string' || /(^|\/)\.\.?(\/|$)|^\/|\\|\u0000/.test(e.path)) { problems.push(`${MANIFEST}: an unsafe or malformed path ${JSON.stringify(e?.path)}`); continue; }
    if (listed.has(e.path)) problems.push(`${MANIFEST}: ${e.path} is listed twice`);
    listed.set(e.path, e);
    if (!ROLES.has(e.role)) problems.push(`${MANIFEST}: ${e.path} has the unknown role ${JSON.stringify(e.role)}`);
    if (e.role === 'site' && !e.path.startsWith(`${manifest.siteRoot}/`)) problems.push(`${MANIFEST}: ${e.path} has the role site but is outside ${manifest.siteRoot}/`);
  }
  const lowered = new Map();
  for (const p of listed.keys()) { const k = p.toLowerCase(); if (lowered.has(k) && lowered.get(k) !== p) problems.push(`${p} and ${lowered.get(k)} differ only by case`); lowered.set(k, p); }
  for (const f of disk) if (!listed.has(f)) problems.push(`${f}: in the bundle but not listed in the manifest`);
  for (const [p, e] of listed) {
    if (!disk.includes(p)) { problems.push(`${p}: listed in the manifest but missing from the bundle`); continue; }
    const buf = readFileSync(join(bundleDir, p));
    if (sha256(buf) !== e.sha256 || buf.length !== e.bytes) problems.push(`${p}: the bytes differ from the manifest (edited after staging)`);
  }
  const extraPaths = [...listed.values()].filter((e) => e.role !== 'site').map((e) => e.path).sort();
  const declared = adapter.declared().slice().sort();
  if (extraPaths.join() !== declared.join()) problems.push(`the bundle's own files are ${extraPaths.join(', ') || 'none'}; the ${adapter.id} adapter declares exactly ${declared.join(', ')} (no other vendor or host file may ride along)`);
  const siteEntries = [...listed.values()].filter((e) => e.role === 'site');
  const treeOf = (list) => sha256([...list].sort((a, b) => (a.path < b.path ? -1 : 1)).map((e) => `${e.sha256}  ${e.path.slice(manifest.siteRoot.length + 1)}`).join('\n'));
  if (treeOf(siteEntries) !== manifest.siteTreeSha256) problems.push(`${MANIFEST}: siteTreeSha256 does not match the site files it lists`);
  // 2. the delivered folder, when known
  if (deliveredDir) {
    let want = []; try { want = walkFiles(deliveredDir); } catch (e) { problems.push(`delivered folder: ${e.message}`); }
    const have = new Set(siteEntries.map((e) => e.path.slice(manifest.siteRoot.length + 1)));
    for (const f of want) { const e = listed.get(`${manifest.siteRoot}/${f}`); if (!e) problems.push(`${f}: part of the delivered site but not of the bundle`); else if (e.sha256 !== sha256(readFileSync(join(deliveredDir, f)))) problems.push(`${f}: differs from the delivered file`); }
    for (const f of have) if (!want.includes(f)) problems.push(`${f}: in the bundle's site but not in the delivered folder`);
  }
  // 3. the site as the bundle holds it
  const siteDir = join(bundleDir, manifest.siteRoot);
  if (!existsSync(siteDir)) return { problems: [...problems, `${manifest.siteRoot}/ is missing`], blockers: [], notes };
  let site;
  try { site = describeSite(siteDir, { urlStyle: manifest.urlStyle, baseUrl: manifest.baseUrl ?? null, channel: manifest.channel }); } catch (e) { return { problems: [...problems, `site: ${e.message}`], blockers: [], notes }; }
  site.files = siteEntries.map((e) => e.path.slice(manifest.siteRoot.length + 1)).sort();
  site.searchFiles = SEARCH_FILES.filter((f) => site.files.includes(f)); site.hasNotFoundPage = site.files.includes(NOT_FOUND_PAGE);
  const sizes = new Map(siteEntries.map((e) => [e.path.slice(manifest.siteRoot.length + 1), e.bytes]));
  const readSite = (f) => readFileSync(join(siteDir, f));
  problems.push(...siteProblems(site, adapter, { sizes, read: (f) => (site.files.includes(f) && disk.includes(`${manifest.siteRoot}/${f}`) ? readSite(f) : Buffer.alloc(0)) }), ...adapter.validateSite(site));
  // 4. the options the manifest claims
  const optKeys = manifest.options && typeof manifest.options === 'object' ? Object.keys(manifest.options) : [];
  if (optKeys.join() !== 'hsts') problems.push(`${MANIFEST}: options must be exactly { hsts }`);
  let hsts = manifest.options?.hsts?.includeSubDomains === true ? { includeSubDomains: true, authorisation: manifest.options.hsts.authorisation } : null;
  if (manifest.options?.hsts && manifest.options.hsts.includeSubDomains !== true && manifest.options.hsts.includeSubDomains !== false) problems.push(`${MANIFEST}: options.hsts.includeSubDomains must be true or false`);
  if (hsts) { try { httpsHeaders(policy, hsts); } catch (e) { problems.push(`${MANIFEST}: ${e.message}`); hsts = null; } }   // an opt-in without a recorded authorisation is not honoured
  // 5. the adapter's files from the outside, then written again and compared (host files, SETTINGS.txt and the descriptive manifest fields)
  const files = new Map(); for (const e of listed.values()) if (e.role !== 'site' && disk.includes(e.path)) files.set(e.path, readFileSync(join(bundleDir, e.path)));
  const h = composeHeaders(site, policy, { hsts });
  const computed = { noindex: noindexState(siteDir), csp: buildCsp(siteDir, policy, { https: true }), pages: site.pages.map((p) => p.public), code: h.cache.code, staticDirs: h.cache.staticDirs };
  problems.push(...adapter.checkFiles({ site, policy, files, computed, hsts }));
  try {
    const ex = expected(adapter, site, policy, hsts);
    for (const x of ex.extra) { const have = files.get(x.path); if (have !== undefined && !have.equals(Buffer.from(x.content))) problems.push(`${x.path}: differs from what the ${adapter.id} adapter writes for this site (edited by hand, or written for other pages)`); }
    if (canonicalJson(manifest.settingsToApply ?? null) !== canonicalJson(ex.settings)) problems.push(`${MANIFEST}: settingsToApply is not what the ${adapter.id} adapter writes`);
    if (canonicalJson(manifest.notes ?? null) !== canonicalJson(ex.notes)) problems.push(`${MANIFEST}: notes (the unverified-live list, the live blockers, the provider facts, the capabilities) are not what the ${adapter.id} adapter writes: a claim of live verification cannot be added by editing the manifest`);
    if (typeof manifest.noCredential !== 'string' || !/holds no hosting credential/.test(manifest.noCredential)) problems.push(`${MANIFEST}: the no-credential statement is missing`);
  } catch (e) { problems.push(`the bundle could not be written again: ${e.message}`); }
  // 6. nothing in the bundle looks like a credential
  const everything = [...listed.values()].filter((e) => disk.includes(e.path)).map((e) => [e.path, readFileSync(join(bundleDir, e.path))]);
  everything.push([MANIFEST, readFileSync(join(bundleDir, MANIFEST))]);
  problems.push(...credentialProblems(everything));
  // 7. live blockers
  const blockers = liveBlockers(site, adapter);
  if (forRelease) for (const b of blockers) problems.push(`release blocker ${b.decision} (${b.risk}): ${b.text}`);
  notes.push(`${adapter.id}: ${siteEntries.length} site files, ${extraPaths.length} adapter files, channel ${site.channel}, urlStyle ${site.urlStyle}`);
  return { problems, blockers, notes, manifest, site };
}
