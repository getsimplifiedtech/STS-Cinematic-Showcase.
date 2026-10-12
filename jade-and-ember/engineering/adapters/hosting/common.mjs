// Shared parts of the hosting adapters (G6-4, APR-JE-044). Pure functions of files: no network, no credential, no deployment. An adapter turns the DELIVERED
// folder (never modified) into a staged BUNDLE: the byte-identical site plus exactly the host files that adapter declares, and a manifest that lists them.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { buildCsp, httpsHeaders, loadPolicy, noindexState, robotsHeaders } from '../../lib/security.mjs';

export const sha256 = (b) => createHash('sha256').update(b).digest('hex');
export { canonicalJson } from '../../lib/candidate.mjs';
export class AdapterError extends Error { constructor(code, message) { super(message); this.code = code; } }

export const SEARCH_FILES = ['robots.txt', 'sitemap.xml', 'llms.txt'];
export const ASSET_DIRS = ['fonts', 'media'];
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
  const cache = {
    pages: site.pages.map((p) => p.public),                                   // revalidate: policy.cache.html
    code: site.files.filter((f) => /\.(css|js)$/.test(f) && !ASSET_DIRS.some((d) => f.startsWith(`${d}/`))).map((f) => `/${f}`),   // revalidate: policy.cache.code (any depth outside the asset folders; the site may hold none inside them)
    staticDirs: ASSET_DIRS.filter((d) => site.files.some((f) => f.startsWith(`${d}/`))),   // reusable for a week: policy.cache.static
  };
  return { security, robots, cache, values: { pages: policy.cache.html, code: policy.cache.code, static: policy.cache.static } };
}

// ---- bundle writing and the manifest
export function copySite(siteDir, destDir, files) {
  for (const f of files) { mkdirSync(dirname(join(destDir, f)), { recursive: true }); cpSync(join(siteDir, f), join(destDir, f)); }
}
// The bundle is written to a folder this tool may empty. It refuses the delivered folder itself, anything inside it, anything that contains it, and any existing folder that
// is neither empty nor a bundle this tool wrote (a mistyped --out must never delete a site, a repository or a home folder).
export function assertSafeOut(outDir, siteDir) {
  const real = (p) => { let q = resolve(p); const tail = []; while (!existsSync(q)) { tail.unshift(q.slice(dirname(q).length + 1)); q = dirname(q); } return join(realpathSync(q), ...tail); };
  const o = real(outDir), d = real(siteDir);
  const within = (a, b) => a === b || a.startsWith(b + sep);
  if (within(o, d)) throw new AdapterError('unsafe-out', `the output folder ${outDir} is the delivered folder or inside it: the delivered folder is never modified`);
  if (within(d, o)) throw new AdapterError('unsafe-out', `the output folder ${outDir} contains the delivered folder: staging would delete it`);
  if (o === resolve('/') || within(resolve(process.cwd()), o)) throw new AdapterError('unsafe-out', `the output folder ${outDir} contains the working folder`);
  if (existsSync(o)) {
    if (!lstatSync(o).isDirectory()) throw new AdapterError('unsafe-out', `${outDir} exists and is not a folder`);
    const entries = readdirSync(o);
    if (entries.length && !entries.includes(MANIFEST)) throw new AdapterError('unsafe-out', `${outDir} is not empty and is not a bundle written by this tool (no ${MANIFEST}); choose an empty or new folder`);
  }
}
export function writeBundle({ outDir, adapter, site, siteRoot, extra, options, settingsToApply, notes }) {
  assertSafeOut(outDir, site.siteDir);
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

// ---- file lookup the way a host does it: case-sensitive. Cloudflare Pages and Vercel serve /Menu only if a file is named exactly Menu(.html); a stat on macOS (APFS) or Windows (NTFS)
// folds the case and would answer /Menu from menu.html. So every path segment must appear in the folder's listing exactly as requested (no case folding, no Unicode normalisation).
// io is injectable so the rule is tested on a Linux disk against a case-folding stand-in.
export const diskIo = { list: (dir) => readdirSync(dir), isFile: (p) => { try { return lstatSync(p).isFile(); } catch { return false; } } };
export function exactFile(siteDir, rel, io = diskIo) {
  if (typeof rel !== 'string' || rel === '') return false;
  let at = siteDir;
  for (const part of rel.split('/')) {
    let names; try { names = io.list(at); } catch { return false; }
    if (!names.includes(part)) return false;
    at = join(at, part);
  }
  return io.isFile(at);
}

// ---- the deployed-bytes comparison (D-P3-3, live checklist C-07): pure, so it can be run against bytes fetched later by something that holds no credential.
// served: Map of public path -> Buffer. Every PAGE and every site file must be byte-identical to the bundle's at its PUBLIC address; the .html form of a page must not be
// served at all under clean URLs (it is a redirect), and nothing the bundle does not serve may be served. 404.html has no address of its own: it answers unknown paths.
//   unknown (optional): { status, body } of a request for a path that does not exist; the status must be 404 and the body must not be a page of the site (no soft 404)
export function verifyServed(manifest, served, { unknown = null } = {}) {
  const problems = [];
  const entries = manifest.files.filter((e) => e.role === 'site' && e.path !== `${manifest.siteRoot}/${NOT_FOUND_PAGE}`);
  const clean = manifest.urlStyle === 'clean';
  const addressOf = (name) => (name === 'index.html' ? '/' : clean && name.endsWith('.html') ? `/${name.replace(/\.html$/, '')}` : `/${name}`);
  const known = new Map();
  for (const e of entries) { const name = e.path.slice(manifest.siteRoot.length + 1); known.set(addressOf(name), e); }
  for (const [u, e] of known) {
    const got = served.get(u);
    if (!got) { problems.push(`${u}: not served (expected ${e.path.slice(manifest.siteRoot.length + 1)})`); continue; }
    if (sha256(got) !== e.sha256) problems.push(`${u}: the served bytes differ from the staged file ${e.path.slice(manifest.siteRoot.length + 1)} (a host that rewrites HTML invalidates the CSP hashes: HR-08)`);
  }
  for (const u of served.keys()) {
    if (known.has(u)) continue;
    problems.push(clean && /\.html$/.test(u) || u === '/index' ? `${u}: served although a clean-URL host redirects it (it must be a redirect, not a second copy of the page)` : `${u}: served but not part of the staged bundle`);
  }
  if (unknown) {
    if (unknown.status !== 404) problems.push(`an unknown path answered ${unknown.status}, expected 404 (a soft 404 is a search-visible duplicate: D-P3-1)`);
    else if (unknown.body && entries.some((e) => sha256(unknown.body) === e.sha256 && e.path.endsWith('index.html'))) problems.push('an unknown path answered with the home page');
  }
  return problems;
}
