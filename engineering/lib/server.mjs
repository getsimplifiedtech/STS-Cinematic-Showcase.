// A configurable static server for the checks (pure Node). Models the ways a real host can serve the site, so the checks can prove the same
// folder works in each: a path prefix (domain root or a subdirectory), extension-less "pretty" URLs, directory redirects, HTTP Range support
// or none, and response headers (security headers). tests/serve.mjs stays as it was; this one is for engineering/.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webp': 'image/webp', '.woff2': 'font/woff2', '.webm': 'video/webm', '.mp4': 'video/mp4', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8' };

// options: prefix ('/' or '/some/dir/'), pretty (map /menu to menu.html), ranges (default true), headers (fn(pathname, type) -> object),
//          host: how a real host treats page URLs (a simulation of the documented behaviour, not a test of the real service):
//            'static'            files exactly as named; with `pretty`, /menu also reaches menu.html (the earlier behaviour, the default)
//            'cloudflare-pages'  /menu serves menu.html; a request for /menu.html is redirected (308) to /menu and /index.html to /
//            'vercel-clean'      Vercel with "cleanUrls": true: the same behaviour as above
//            'vercel-default'    Vercel without cleanUrls: /menu.html is served as it is and /menu is not found
//          profile: a hosting adapter's simulation profile (engineering/adapters/hosting/profiles.mjs). The host-file rules of the bundle are APPLIED to every request: redirects, clean
//            URLs, the not-found behaviour, the generated headers, Range support. Domain root only. It models documented behaviour, not the live service; the profile lists what it does not model.
//          plainHttp: with a profile, the response headers are the profile's minus the two HTTPS-only parts (withoutHttpsOnly). The simulation is reached over http://127.0.0.1, where
//            Strict-Transport-Security has no meaning and `upgrade-insecure-requests` makes some engines (WebKit) request every subresource and navigation over https from a server
//            that speaks no TLS. Chromium exempts loopback from the upgrade, so a Chromium-only run would never show it. Everything else, the hashed CSP included, is kept.
export const HTTPS_ONLY_CSP = ['upgrade-insecure-requests'];
export function withoutHttpsOnly(h) {
  const out = {};
  for (const [k, v] of Object.entries(h)) {
    const key = k.toLowerCase();
    if (key === 'strict-transport-security') continue;
    out[k] = key === 'content-security-policy' ? String(v).split(';').map((d) => d.trim()).filter((d) => d && !HTTPS_ONLY_CSP.includes(d.split(/\s+/)[0].toLowerCase())).join('; ') : v;
  }
  return out;
}
export function serveSite(root, { prefix = '/', pretty = false, ranges = true, headers = null, host = 'static', profile = null, plainHttp = false } = {}) {
  const cleanHost = host === 'cloudflare-pages' || host === 'vercel-clean';
  if (cleanHost) pretty = true;
  const log = [];
  const pre = prefix.endsWith('/') ? prefix : prefix + '/';
  const server = createServer(async (req, res) => {
    const send = (status, h, body) => { res.writeHead(status, h); res.end(body); };
    try {
      const url = new URL(req.url, 'http://x');
      let p = decodeURIComponent(url.pathname);
      log.push({ url: req.url, method: req.method });
      // a directory URL without its trailing slash is redirected, as every static host does
      if (profile) {
        const red = profile.redirect(p);
        if (red) return send(red.status, { location: red.location + url.search, 'content-length': 0 }, '');
        const r = profile.resolve(p);
        const h = plainHttp ? withoutHttpsOnly(profile.headers(p, { kind: r.kind, status: r.status })) : profile.headers(p, { kind: r.kind, status: r.status });
        if (!r.file) return send(r.status, { 'content-type': 'text/html; charset=utf-8', ...h }, '<!doctype html><title>Not found</title><p>The platform\'s own not-found page.</p>');
        const target = normalize(join(root, r.file));
        if (target !== root && !target.startsWith(root + sep)) return send(403, {}, 'forbidden');
        const body = await readFile(target), type = TYPES[extname(r.file)] || 'application/octet-stream';
        const m = profile.ranges ? /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '') : null;
        if (m && (m[1] || m[2]) && r.status === 200) {
          const start = m[1] ? +m[1] : Math.max(0, body.length - +m[2]), end = m[1] && m[2] ? Math.min(+m[2], body.length - 1) : body.length - 1;
          return send(206, { 'content-type': type, 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${body.length}`, 'content-length': end - start + 1, ...h }, body.subarray(start, end + 1));
        }
        return send(r.status, { 'content-type': type, ...(profile.ranges ? { 'accept-ranges': 'bytes' } : {}), 'content-length': body.length, ...h }, body);
      }
      if (pre !== '/' && p === pre.slice(0, -1)) return send(301, { location: pre + url.search }, '');
      if (!p.startsWith(pre)) return send(404, { 'content-type': 'text/plain' }, 'not found');
      let rel = p.slice(pre.length);
      if (cleanHost && rel.endsWith('.html')) { const target = rel === 'index.html' ? '' : rel.replace(/\.html$/, ''); return send(308, { location: pre + target + url.search }, ''); }
      if (rel === '' || rel.endsWith('/')) rel += 'index.html';
      let file = normalize(join(root, rel));
      if (file !== root && !file.startsWith(root + sep)) return send(403, {}, 'forbidden');
      let st = await stat(file).catch(() => null);
      if (!st && pretty && !extname(rel)) { file = normalize(join(root, rel + '.html')); st = await stat(file).catch(() => null); }
      if (!st || st.isDirectory()) return send(404, { 'content-type': 'text/plain', ...(headers ? headers(p, 'text/plain') : {}) }, 'not found');
      const body = await readFile(file);
      const type = TYPES[extname(file)] || 'application/octet-stream';
      const extra = headers ? headers(p, type) : {};
      const m = ranges ? /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '') : null;
      if (m && (m[1] || m[2])) {
        const start = m[1] ? +m[1] : Math.max(0, body.length - +m[2]);
        const end = m[1] && m[2] ? Math.min(+m[2], body.length - 1) : body.length - 1;
        return send(206, { 'content-type': type, 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${body.length}`, 'content-length': end - start + 1, ...extra }, body.subarray(start, end + 1));
      }
      return send(200, { 'content-type': type, ...(ranges ? { 'accept-ranges': 'bytes' } : {}), 'content-length': body.length, ...extra }, body);
    } catch { send(500, {}, 'error'); }
  }).listen(0);
  return { server, log, base: `http://127.0.0.1:${server.address().port}${pre}`, origin: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}
