// Simulation profiles (G6-4, APR-JE-044). A profile is part of an adapter: it APPLIES the generated host files to requests so the checks can walk the bundle the way a visitor
// would, and it says in plain words what it models and what it does not. It is a SIMULATION OF DOCUMENTED BEHAVIOUR, not a test of the real service: nothing here was observed
// on a live host. Every assumption that the provider documentation does not settle is listed in `assumptions` and ends up in the report.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseStrictJson } from '../../lib/strict-json.mjs';
import { parseHeadersFile } from './cloudflare-pages.mjs';
import { parseNginx } from './static.mjs';
import { AdapterError, MANIFEST, NOT_FOUND_PAGE, diskIo, exactFile, readManifest } from './common.mjs';

// a request path that tries to leave the site folder is never a file
const safe = (rel) => typeof rel === 'string' && !rel.startsWith('/') && !rel.includes('\\') && !rel.includes('\u0000') && !rel.split('/').some((s) => s === '..');
const NF = (rel) => rel === NOT_FOUND_PAGE || rel === NOT_FOUND_PAGE.replace(/\.html$/, '');   // /404 and /404.html have no address of their own: they are answered as any unknown path

// "/*" "/media/*" "/*.css" "/products" "/": a single splat matches greedily (CF-03 and the headers page); anything else is literal
function pagesPattern(pattern) {
  if ((pattern.match(/\*/g) || []).length > 1) return null;
  const esc = pattern.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^${esc.join('.*')}$`);
}
// the subset of Vercel header sources the adapter writes: "/(.*)", "/", an exact path, "/folder/(.*)"
function vercelSource(source) {
  if (!/^(?:\/|\/\(\.\*\)|(?:\/[A-Za-z0-9._-]+)+|(?:\/[A-Za-z0-9._-]+)+\/\(\.\*\))$/.test(source)) throw new AdapterError('source', `unsupported header source ${JSON.stringify(source)}`);
  return new RegExp(`^${source.replace('(.*)', '\u0000').replace(/[.+?^${}|[\]\\]/g, '\\$&').replace('\u0000', '.*')}$`);
}

export function cloudflareProfile(siteDir, io = diskIo) {
  const headersText = existsSync(join(siteDir, '_headers')) ? readFileSync(join(siteDir, '_headers'), 'utf8') : '';
  const rules = parseHeadersFile(headersText).rules.map((r) => ({ re: pagesPattern(r.path), headers: r.headers })).filter((r) => r.re);
  const exists = (rel) => safe(rel) && rel !== '_headers' && rel !== '_redirects' && exactFile(siteDir, rel, io);   // the _headers file is parsed, never served (CF-04)
  return {
    id: 'cloudflare-pages', siteDir, ranges: false,
    redirect(p) {
      if (NF(p.slice(1))) return null;
      if (p.endsWith('/index.html') && exists(p.slice(1))) return { status: 308, location: p.slice(0, -'index.html'.length) };
      if (p.endsWith('.html') && exists(p.slice(1))) return { status: 308, location: p.slice(0, -5) };
      return null;
    },
    resolve(p) {
      if (p === '/') return exists('index.html') ? { file: 'index.html', status: 200, kind: 'file' } : { file: null, status: 404, kind: 'platform-404' };
      const rel = p.slice(1);
      if (!NF(rel) && rel !== 'index' && !rel.endsWith('/') && exists(rel) && !rel.endsWith('.html')) return { file: rel, status: 200, kind: 'file' };
      if (!NF(rel) && rel !== 'index' && !rel.endsWith('/') && exists(`${rel}.html`)) return { file: `${rel}.html`, status: 200, kind: 'file' };
      if (exists(NOT_FOUND_PAGE)) return { file: NOT_FOUND_PAGE, status: 404, kind: 'notfound-page' };
      return { file: 'index.html', status: 200, kind: 'spa-fallback' };   // CF-10, CF-11: without a top-level 404.html every unknown path is answered with the home page
    },
    headers(p, { kind }) {
      if (kind === 'redirect') return {};   // CF-06: a redirect takes priority over headers
      const out = {};
      for (const r of rules) if (r.re.test(p)) for (const [k, v] of r.headers) { const key = k.toLowerCase(); out[key] = out[key] ? `${out[key]}, ${v}` : v; }   // CF-02, CF-03
      const defaults = { 'access-control-allow-origin': '*', 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin' };   // CF-14, CF-15
      for (const [k, v] of Object.entries(defaults)) if (!(k in out)) out[k] = v;
      if (!('cache-control' in out)) out['cache-control'] = 'public, max-age=0, must-revalidate';
      return out;
    },
    models: ['extension-less page URLs and the 308 from the .html form (CF-08)', 'the _headers rules applied to the REQUEST path, several matching rules combined, repeated headers joined with a comma (CF-02, CF-03)', 'unknown paths: 404.html when present, otherwise the home page with 200 (CF-10, CF-11)', 'Range requests answered with 200 (CF-12)', 'redirects carry no _headers headers (CF-06)', 'the platform default headers (CF-14, CF-15)'],
    doesNotModel: ['compression (CF-13), ETag and 304 handling, edge caching and purge behaviour', 'HTTP to HTTPS redirects, TLS, www and the domain', 'the exact redirect status code (308 is assumed; the page says only "redirected")', 'a request for /products/ (modelled as not found; the documentation does not say)', 'content types for .xml, .txt, .webm, .mp4 and .woff2 (the local server\'s table is used)', 'headers on the 404.html response (assumed to follow the same rules as any asset)', 'zone features that rewrite HTML (Rocket Loader, email obfuscation, analytics beacon)'],
    assumptions: ['request paths are matched case-sensitively (/Products is not answered from products.html)', 'redirect status 308', '/products/, /index, /404 and /404.html are answered as unknown paths', 'the 404.html response has status 404 (the documentation says only that the page is displayed)', 'the _headers rules apply to the 404.html response', 'a header set in _headers replaces the platform default of the same name (the documentation: "override what Cloudflare ordinarily sends")'],
  };
}

export function vercelProfile(bundleDir, siteDir, io = diskIo) {
  const j = parseStrictJson(readFileSync(join(bundleDir, 'vercel.json'), 'utf8'));
  const entries = (j.headers || []).map((e) => ({ re: vercelSource(e.source), headers: e.headers }));
  const exists = (rel) => safe(rel) && exactFile(siteDir, rel, io);
  const clean = j.cleanUrls === true;
  return {
    id: 'vercel', siteDir, ranges: true,
    redirect(p) {
      let loc = null;
      if (clean) {
        let m = /^\/(?:(.+)\/)?index(?:\.html)?\/?$/.exec(p);                       // VC-01
        if (m) loc = `/${m[1] || ''}`;
        else if ((m = /^\/(.*)\.html\/?$/.exec(p))) loc = `/${m[1]}`;               // VC-02
      }
      if (!loc && j.trailingSlash === false) { const m = /^\/(.*)\/$/.exec(p); if (m) loc = `/${m[1]}`; }   // VC-03
      return loc === null ? null : { status: 308, location: loc };
    },
    resolve(p) {
      if (p === '/') return exists('index.html') ? { file: 'index.html', status: 200, kind: 'file' } : { file: null, status: 404, kind: 'platform-404' };
      const rel = p.slice(1);
      if (!NF(rel) && exists(rel)) return { file: rel, status: 200, kind: 'file' };
      if (!NF(rel) && clean && !rel.endsWith('/') && exists(`${rel}.html`)) return { file: `${rel}.html`, status: 200, kind: 'file' };
      if (exists(NOT_FOUND_PAGE)) return { file: NOT_FOUND_PAGE, status: 404, kind: 'notfound-page' };
      return { file: null, status: 404, kind: 'platform-404' };
    },
    headers(p, { kind }) {
      if (kind === 'redirect') return {};
      const out = {};
      for (const e of entries) if (e.re.test(p)) for (const h of e.headers) out[h.key.toLowerCase()] = h.value;   // VC-05: every matching entry applies, a repeated key is set again
      if (!('cache-control' in out)) out['cache-control'] = 'public, max-age=0, must-revalidate';
      return out;
    },
    models: ['cleanUrls: the 308 from /x.html, /index.html and /x/index to the clean path (VC-01, VC-02)', 'trailingSlash false: the 308 from /x/ to /x (VC-03)', 'every matching headers entry applied to the request path, a repeated key set again (VC-05)', 'unknown paths: 404.html when present, otherwise a platform 404 page'],
    doesNotModel: ['the status code of a response served from 404.html (404 is assumed; the documentation results did not state it, VC-14)', 'whether a 404.html is used on every unknown path, and what the platform 404 page looks like', 'the platform default headers, above all Strict-Transport-Security (a platform default of max-age=63072000 may or may not be overridden by vercel.json: VC-15)', 'compression, ETag, edge caching, HTTP to HTTPS redirects, TLS, the domain', 'Deployment Protection and the automatic preview X-Robots-Tag (VC-16)', 'Range support (assumed: 206 as for any static file)', 'content types for .xml, .txt, .webm, .mp4 and .woff2 (the local server\'s table is used)', 'header-source matching exactly as the platform implements it (the open-source routing code is modelled, the platform is expected but not proven to match)'],
    assumptions: ['request paths are matched case-sensitively (/Products is not answered from products.html)', 'a 404.html response has status 404', 'Range requests are answered with 206', 'the open-source routing library behaves as the platform does'],
  };
}

export function staticProfile(bundleDir, siteDir, io = diskIo) {
  const nginx = existsSync(join(bundleDir, 'nginx.conf')) ? parseNginx(readFileSync(join(bundleDir, 'nginx.conf'), 'utf8')) : [];
  const exists = (rel) => safe(rel) && exactFile(siteDir, rel, io);
  const fixed = {}; for (const [k, v] of nginx) fixed[k.toLowerCase()] = v;
  return {
    id: 'static', siteDir, ranges: true,
    redirect() { return null; },
    resolve(p) { const rel = p === '/' ? 'index.html' : p.slice(1); return !NF(rel) && exists(rel) ? { file: rel, status: 200, kind: 'file' } : exists(NOT_FOUND_PAGE) ? { file: NOT_FOUND_PAGE, status: 404, kind: 'notfound-page' } : { file: null, status: 404, kind: 'platform-404' }; },
    headers(p, { kind }) { return kind === 'redirect' ? {} : { ...fixed }; },
    models: ['files served as named', 'the security headers of nginx.conf on every response', 'unknown paths: 404'],
    cache: false,
    doesNotModel: ['cache rules, compression, TLS, the domain', 'error_page / ErrorDocument (the 404 page needs server configuration this adapter does not write)'],
    assumptions: [],
  };
}

export function profileOf(bundleDir, io = diskIo) {
  const m = readManifest(bundleDir);
  const siteDir = join(bundleDir, m.siteRoot);
  if (m.adapter === 'cloudflare-pages') return cloudflareProfile(siteDir, io);
  if (m.adapter === 'vercel') return vercelProfile(bundleDir, siteDir, io);
  if (m.adapter === 'static') return staticProfile(bundleDir, siteDir, io);
  throw new AdapterError('adapter', `unknown adapter ${m.adapter}`);
}
void MANIFEST;
