// Hosting adapters: registry, bundle rendering and the bundle check (G6-4, APR-JE-044). See README.md for the interface and its invariants.
// No adapter reads a credential, reaches a network or deploys anything: each is a pure function from a delivered folder to a staged bundle, and from a bundle to a list of problems.
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { buildCsp, httpsHeaders, loadPolicy, noindexState } from '../../lib/security.mjs';
import { parseStrictJson } from '../../lib/strict-json.mjs';
import { AdapterError, MANIFEST, MANIFEST_SCHEMA, NEVER_SERVED, NOT_FOUND_PAGE, SEARCH_FILES, composeHeaders, describeSite, readManifest, sha256, verifyServed, walkFiles, writeBundle } from './common.mjs';
import { cloudflarePages } from './cloudflare-pages.mjs';
import { vercel } from './vercel.mjs';
import { staticServer } from './static.mjs';
import { profileOf } from './profiles.mjs';

export const ADAPTERS = Object.freeze({ 'cloudflare-pages': cloudflarePages, vercel, static: staticServer });
export { describeSite, profileOf, verifyServed, readManifest, AdapterError, MANIFEST };
const STATIC_EXT = new Set(['.html', '.css', '.js', '.webp', '.webm', '.mp4', '.woff2', '.txt', '.xml', '.ico', '.svg', '.png', '.jpg', '.json', '.md']);
const ROLES = new Set(['site', 'headers', 'deploy-config', 'server-config', 'doc']);

// What every bundle must be able to say about live behaviour it has NOT seen. The list is written into SETTINGS.txt and the manifest.
export const UNVERIFIED_LIVE = Object.freeze({
  'cloudflare-pages': [
    'the status of the redirect from /menu.html to /menu (308 is assumed)', 'what /menu/ does (HR-03)', 'whether the _headers rules apply to the 404.html response and to the home-page fallback',
    'the content types served for .xml, .txt, .webm, .mp4 and .woff2', 'Range support for the hero video: the documentation says 200 is returned, which Safari cannot seek (HR-12)', 'that the deployed bytes equal the staged bytes (checklist C-07)',
    'compression and caching at the edge', 'HSTS: that the header is sent as written and not changed by a zone setting',
  ],
  vercel: [
    'that a 404.html in the output directory is served with status 404', 'that vercel.json at the bundle root works with the Root Directory setting (HR-06)', 'that the HSTS header in vercel.json replaces the platform default for a custom domain (VC-15)',
    'how several matching header entries combine when a key repeats (the open-source routing code sets it again)', 'the content types served for .xml, .txt, .webm, .mp4 and .woff2', 'Range support for the hero video',
    'that the deployed bytes equal the staged bytes (checklist C-07)', 'Deployment Protection state and the preview X-Robots-Tag (VC-16)',
  ],
  static: ['everything: this adapter only wraps the existing nginx and Apache renderings; no server was run'],
});

// problems with the site folder itself, for any adapter
export function siteProblems(site, adapter, sizes = null) {
  const problems = [];
  for (const f of site.files) {
    const segs = f.split('/');
    if (!/^[A-Za-z0-9._/-]+$/.test(f)) problems.push(`${f}: file names must be plain ASCII (letters, digits, dot, dash, underscore)`);
    for (const s of segs) {
      if (adapter.forbiddenInSite.some((re) => re.test(s))) problems.push(`${f}: ${s} is a host, application or secret file; the delivered site is vendor free and the adapter writes the host files`);
      else if (s.startsWith('.')) problems.push(`${f}: hidden file`);
    }
    if (NEVER_SERVED.includes(f)) problems.push(`${f}: belongs to the release package (run by the recipient), never to a deployed site`);
    if (!STATIC_EXT.has(extname(f).toLowerCase())) problems.push(`${f}: not a static web file type`);
    if (sizes && adapter.capabilities.limits.fileBytes && sizes.get(f) > adapter.capabilities.limits.fileBytes) problems.push(`${f}: ${sizes.get(f)} bytes is over the host limit of ${adapter.capabilities.limits.fileBytes}`);
  }
  if (site.channel === 'client-production') {
    const missing = SEARCH_FILES.filter((f) => !site.searchFiles.includes(f));
    if (missing.length) problems.push(`an indexable client build must serve ${missing.join(', ')} from the root`);
  } else if (site.searchFiles.length) problems.push(`the demonstration must not publish ${site.searchFiles.join(', ')} (it stays noindex)`);
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

const settingsText = (adapter, site, settings, extra = []) => [
  `Settings for ${adapter.id}: SYNTHETIC STAGING INSTRUCTIONS. This bundle holds no credential, account, project or team identifier and cannot deploy anything.`, '',
  ...settings.map((s) => `* ${s.name}: ${s.value}`), '',
  'Provider facts this adapter rests on: ' + (adapter.facts.length ? adapter.facts.join(', ') : 'none') + ' (engineering/hosting/provider-facts.json).',
  '', 'NOT OBSERVED ON A LIVE HOST (each is an unverified assumption until a separately authorised live check records it):',
  ...(UNVERIFIED_LIVE[adapter.id] || []).map((u) => `  - ${u}`), ...extra, '',
].join('\n');

// ---- render
export function renderBundle(adapterId, { siteDir, outDir, urlStyle, baseUrl = null, channel = null, hsts = null, policy = loadPolicy() }) {
  const adapter = ADAPTERS[adapterId];
  if (!adapter) throw new AdapterError('unknown-adapter', `no adapter named ${JSON.stringify(adapterId)} (${Object.keys(ADAPTERS).join(', ')})`);
  const site = describeSite(siteDir, { urlStyle, baseUrl, channel });
  const sizes = new Map(site.files.map((f) => [f, lstatSync(join(siteDir, f)).size]));
  const problems = [...siteProblems(site, adapter, sizes), ...adapter.validateSite(site)];
  if (problems.length) throw new AdapterError('site-invalid', `the site cannot be staged for ${adapterId}:\n  - ${problems.join('\n  - ')}`);
  if (hsts) httpsHeaders(policy, hsts);   // throws when includeSubDomains has no recorded authorisation
  const { extra, settings } = adapter.render({ site, policy, hsts });
  const blockers = liveBlockers(site, adapter);
  extra.push({ path: 'SETTINGS.txt', role: 'doc', content: settingsText(adapter, site, settings, blockers.map((b) => `\nLIVE RELEASE BLOCKER (${b.decision}, ${b.risk}): ${b.text}`)) });
  const bundle = writeBundle({
    outDir, adapter: adapterId, site, siteRoot: adapter.siteRoot, extra,
    options: { hsts: hsts && hsts.includeSubDomains ? { includeSubDomains: true, authorisation: hsts.authorisation } : { includeSubDomains: false } },
    settingsToApply: settings, notes: { unverifiedLive: UNVERIFIED_LIVE[adapterId] || [], liveBlockers: blockers, providerFacts: adapter.facts, capabilities: adapter.capabilities },
  });
  return { ...bundle, blockers, site };
}

// ---- check
// Checks a bundle two ways that must agree: (1) from the outside, with rules that do not use the code that wrote it; (2) by writing it again from the site files it holds and
// comparing byte for byte. forRelease turns the live blockers (a missing 404.html) into problems. deliveredDir, when given, is the folder the site files must equal.
export function checkBundle(bundleDir, { policy = loadPolicy(), forRelease = false, deliveredDir = null } = {}) {
  const problems = [], notes = [];
  let manifest;
  try { manifest = parseStrictJson(readFileSync(join(bundleDir, MANIFEST), 'utf8')); } catch (e) { return { problems: [`${MANIFEST}: missing or not valid JSON (${String(e.message).slice(0, 80)})`], blockers: [], notes }; }
  if (manifest.schema !== MANIFEST_SCHEMA) problems.push(`${MANIFEST}: schema is ${JSON.stringify(manifest.schema)}, expected ${MANIFEST_SCHEMA}`);
  const adapter = ADAPTERS[manifest.adapter];
  if (!adapter) return { problems: [...problems, `${MANIFEST}: unknown adapter ${JSON.stringify(manifest.adapter)}`], blockers: [], notes };
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
  problems.push(...siteProblems(site, adapter, sizes), ...adapter.validateSite(site));
  // 4. the options the manifest claims
  let hsts = manifest.options?.hsts?.includeSubDomains ? { includeSubDomains: true, authorisation: manifest.options.hsts.authorisation } : null;
  if (hsts) { try { httpsHeaders(policy, hsts); } catch (e) { problems.push(`${MANIFEST}: ${e.message}`); hsts = null; } }   // an opt-in without a recorded authorisation is not honoured
  // 5. the adapter's files from the outside, then written again and compared
  const files = new Map(); for (const e of listed.values()) if (e.role !== 'site' && disk.includes(e.path)) files.set(e.path, readFileSync(join(bundleDir, e.path)));
  const h = composeHeaders(site, policy, { hsts });
  const computed = { noindex: noindexState(siteDir), csp: buildCsp(siteDir, policy, { https: true }), pages: site.pages.map((p) => p.public), code: h.cache.code, staticDirs: h.cache.staticDirs };
  problems.push(...adapter.checkFiles({ site, policy, files, computed, hsts }));
  try {
    const again = adapter.render({ site, policy, hsts });
    for (const x of again.extra) { const have = files.get(x.path); if (have !== undefined && !have.equals(Buffer.from(x.content))) problems.push(`${x.path}: differs from what the ${adapter.id} adapter writes for this site (edited by hand, or written for other pages)`); }
  } catch (e) { problems.push(`the bundle could not be written again: ${e.message}`); }
  // 6. live blockers
  const blockers = liveBlockers(site, adapter);
  if (forRelease) for (const b of blockers) problems.push(`release blocker ${b.decision} (${b.risk}): ${b.text}`);
  notes.push(`${adapter.id}: ${siteEntries.length} site files, ${extraPaths.length} adapter files, channel ${site.channel}, urlStyle ${site.urlStyle}`);
  return { problems, blockers, notes, manifest, site };
}
