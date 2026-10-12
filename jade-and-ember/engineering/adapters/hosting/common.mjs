// Shared parts of the hosting adapters (G6-4, APR-JE-044). Pure functions of files: no network, no credential, no deployment. An adapter turns the DELIVERED
// folder (never modified) into a staged BUNDLE: the byte-identical site plus exactly the host files that adapter declares, and a manifest that lists them.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { buildCsp, httpsHeaders, loadPolicy, noindexState, robotsHeaders } from '../../lib/security.mjs';

export const sha256 = (b) => createHash('sha256').update(b).digest('hex');
export class AdapterError extends Error { constructor(code, message) { super(message); this.code = code; } }

export const SEARCH_FILES = ['robots.txt', 'sitemap.xml', 'llms.txt'];
export const NOT_FOUND_PAGE = '404.html';
export const MANIFEST = 'bundle.manifest.json';
export const MANIFEST_SCHEMA = 'sts/hosting-bundle@1';
// files that exist in a RELEASE PACKAGE next to the site but are never served (the ZIP carries them for the recipient); an adapter refuses them in the site
export const NEVER_SERVED = ['START-HERE.txt', 'serve.py'];

// every file of a folder as sorted posix paths; refuses symbolic links and anything that is not a plain file or folder
export function walkFiles(root) {
  const out = [];
  const go = (d) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name), st = lstatSync(p);
      const rel = relative(root, p).split('\\').join('/');
      if (st.isSymbolicLink()) throw new AdapterError('symlink', `${rel} is a symbolic link`);
      if (st.isDirectory()) go(p); else if (st.isFile()) out.push(rel); else throw new AdapterError('special-file', `${rel} is not a plain file`);
    }
  };
  go(root);
  return out;
}

// what the pages are, from the delivered folder alone: top-level .html files (404.html is the not-found page, not a page of the registry)
export function pageFiles(siteDir) {
  return readdirSync(siteDir).filter((f) => f.endsWith('.html') && f !== NOT_FOUND_PAGE && lstatSync(join(siteDir, f)).isFile()).sort();
}
export const publicPathOf = (file, urlStyle) => (file === 'index.html' ? '/' : urlStyle === 'clean' ? `/${file.replace(/\.html$/, '')}` : `/${file}`);

// The facts every adapter works from. channel is READ from the pages (all noindex = demonstration, none = client production) and must agree with an explicit one.
export function describeSite(siteDir, { urlStyle, baseUrl = null, channel = null } = {}) {
  if (!existsSync(siteDir) || !lstatSync(siteDir).isDirectory()) throw new AdapterError('no-site', `${siteDir} is not a folder`);
  if (!['clean', 'extension'].includes(urlStyle)) throw new AdapterError('url-style', 'urlStyle must be "clean" or "extension" (the site declares it: client.seo.urlStyle)');
  const files = walkFiles(siteDir);
  const state = noindexState(siteDir);
  if (state === 'mixed') throw new AdapterError('mixed-noindex', 'some pages carry the robots noindex meta tag and others do not: a build is either entirely noindex (the demonstration) or entirely indexable');
  const derived = state === 'all' ? 'demonstration' : 'client-production';
  if (channel && channel !== derived) throw new AdapterError('channel', `the channel was given as ${channel} but the pages say ${derived} (${state === 'all' ? 'every page is noindex' : 'no page is noindex'})`);
  const pages = pageFiles(siteDir).map((file) => ({ file, public: publicPathOf(file, urlStyle) }));
  if (!pages.some((p) => p.file === 'index.html')) throw new AdapterError('no-index', 'the site has no index.html at the root');
  return {
    siteDir, urlStyle, baseUrl, channel: derived, pages, files,
    searchFiles: SEARCH_FILES.filter((f) => files.includes(f)),
    hasNotFoundPage: files.includes(NOT_FOUND_PAGE),
  };
}

// The headers for one site from the single policy: security (with the CSP computed from THESE pages), the noindex defence for the demonstration, and the
// cache classes keyed by the REQUEST path (a rule written for "*.html" never matches the clean URL /menu: HR-02).
export function composeHeaders(site, policy = loadPolicy(), { hsts = null } = {}) {
  const security = { 'Content-Security-Policy': buildCsp(site.siteDir, policy, { https: true }), ...policy.headers, ...httpsHeaders(policy, hsts) };
  const robots = robotsHeaders(site.siteDir, policy);
  const top = site.files.filter((f) => !f.includes('/'));
  const cache = {
    pages: site.pages.map((p) => p.public),                                   // revalidate: policy.cache.html
    code: top.filter((f) => /\.(css|js)$/.test(f)).map((f) => `/${f}`),       // revalidate: policy.cache.code
    staticDirs: ['fonts', 'media'].filter((d) => site.files.some((f) => f.startsWith(`${d}/`))),   // reusable for a week: policy.cache.static
  };
  return { security, robots, cache, values: { pages: policy.cache.html, code: policy.cache.code, static: policy.cache.static } };
}

// ---- bundle writing and the manifest
export function copySite(siteDir, destDir, files) {
  for (const f of files) { mkdirSync(dirname(join(destDir, f)), { recursive: true }); cpSync(join(siteDir, f), join(destDir, f)); }
}
export function writeBundle({ outDir, adapter, site, siteRoot, extra, options, settingsToApply, notes }) {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, siteRoot), { recursive: true });
  copySite(site.siteDir, join(outDir, siteRoot), site.files);
  const entries = site.files.map((f) => ({ path: `${siteRoot}/${f}`, role: 'site', sha256: sha256(readFileSync(join(site.siteDir, f))), bytes: lstatSync(join(site.siteDir, f)).size }));
  for (const x of extra) {
    mkdirSync(dirname(join(outDir, x.path)), { recursive: true });
    writeFileSync(join(outDir, x.path), x.content);
    entries.push({ path: x.path, role: x.role, sha256: sha256(Buffer.from(x.content)), bytes: Buffer.byteLength(x.content) });
  }
  entries.sort((a, b) => (a.path < b.path ? -1 : 1));
  const siteHashes = entries.filter((e) => e.role === 'site').map((e) => `${e.sha256}  ${e.path.slice(siteRoot.length + 1)}`).join('\n');
  const manifest = {
    schema: MANIFEST_SCHEMA, adapter, channel: site.channel, urlStyle: site.urlStyle, baseUrl: site.baseUrl, siteRoot,
    options, files: entries, siteTreeSha256: sha256(siteHashes), settingsToApply, notes,
    noCredential: 'This bundle holds no hosting credential, account, project or team identifier and cannot deploy anything.',
  };
  writeFileSync(join(outDir, MANIFEST), JSON.stringify(manifest, null, 2) + '\n');
  return { root: outDir, siteRoot, manifest, manifestSha256: sha256(readFileSync(join(outDir, MANIFEST))) };
}
export const readManifest = (bundleDir) => JSON.parse(readFileSync(join(bundleDir, MANIFEST), 'utf8'));

// ---- the deployed-bytes comparison (D-P3-3, live checklist C-07): pure, so it can be run against bytes fetched later by something that holds no credential.
// served: Map of public path -> Buffer. Every PAGE and every site file must be byte-identical to the bundle's; anything the bundle does not serve must not be served.
export function verifyServed(manifest, served, { site = null } = {}) {
  const problems = [];
  // 404.html is answered for unknown paths, it has no public address of its own
  const siteFiles = manifest.files.filter((e) => e.role === 'site' && e.path !== `${manifest.siteRoot}/${NOT_FOUND_PAGE}`);
  for (const e of siteFiles) {
    const name = e.path.slice(manifest.siteRoot.length + 1);
    const urls = name === 'index.html' ? ['/'] : name.endsWith('.html') && manifest.urlStyle === 'clean' ? [`/${name.replace(/\.html$/, '')}`] : [`/${name}`];
    for (const u of urls) {
      const got = served.get(u);
      if (!got) { problems.push(`${u}: not served (expected ${name})`); continue; }
      if (sha256(got) !== e.sha256) problems.push(`${u}: the served bytes differ from the staged file ${name} (a host that rewrites HTML invalidates the CSP hashes: HR-08)`);
    }
  }
  for (const u of served.keys()) {
    const known = siteFiles.some((e) => { const n = e.path.slice(manifest.siteRoot.length + 1); return u === `/${n}` || (n === 'index.html' && u === '/') || (manifest.urlStyle === 'clean' && n.endsWith('.html') && u === `/${n.replace(/\.html$/, '')}`); });
    if (!known) problems.push(`${u}: served but not part of the staged bundle`);
  }
  void site;
  return problems;
}
