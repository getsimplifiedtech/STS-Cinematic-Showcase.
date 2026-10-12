// Builds the security headers and Content Security Policy for the delivered pages, and renders them for common static hosts.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { engDir, readJson } from './git.mjs';
import { pagesOf } from './site.mjs';

export const loadPolicy = () => readJson(join(engDir, 'security.json'));
const sha = (s) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;
const decode = (v) => v.replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');

// Inline script bodies and inline style attribute values found in the pages: what the policy has to allow by hash.
export function inlineItems(root) {
  const scripts = new Set(), styles = new Set(), perPage = {};
  for (const file of pagesOf(root)) {
    const html = readFileSync(join(root, file), 'utf8');
    // JSON-LD is a data block, not executable script: CSP does not govern it and it needs no hash
    const s = [...html.matchAll(/<script(?![^>]*\ssrc=)(?![^>]*type="application\/ld\+json")[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    const st = [...html.matchAll(/\sstyle="([^"]*)"/g)].map((m) => decode(m[1]));
    s.forEach((x) => scripts.add(x)); st.forEach((x) => styles.add(x));
    perPage[file] = { scripts: s.length, styleAttributes: st.length };
  }
  return { scripts: [...scripts].sort(), styles: [...styles].sort(), perPage };
}

export function buildCsp(root, policy = loadPolicy(), { https = false } = {}) {
  const items = inlineItems(root);
  const fill = (src) => src.flatMap((v) => (v === '{script-hashes}' ? items.scripts.map(sha) : v === '{style-attr-hashes}' ? items.styles.map(sha) : [v]));
  const parts = Object.entries(policy.csp).map(([d, srcs]) => [d, ...fill(srcs)].join(' '));
  if (https) parts.push(...policy.httpsOnlyCsp);
  return parts.join('; ');
}

// All headers as an object. https: add the headers that only make sense when the site is served over HTTPS.
export function securityHeaders(root, policy = loadPolicy(), { https = false, hsts = null } = {}) {
  return { 'Content-Security-Policy': buildCsp(root, policy, { https }), ...policy.headers, ...(https ? httpsHeaders(policy, hsts) : {}) };
}

// The HTTPS-only headers. Strict-Transport-Security has no includeSubDomains by default (D-P3-4, D-P4-5): it is a per-client opt-in that must name the
// authorisation it rests on, and the preload directive is never produced.
//   hsts: null (the default) or { includeSubDomains: true, authorisation: '<approvals reference>' }
export function httpsHeaders(policy, hsts = null) {
  const out = { ...policy.httpsOnlyHeaders };
  const key = 'Strict-Transport-Security';
  if (/includeSubDomains|preload/i.test(out[key] || '')) throw new Error('security.json: the default Strict-Transport-Security must not contain includeSubDomains or preload (D-P3-4, D-P4-5)');
  if (hsts) {
    const unknown = Object.keys(hsts).filter((k) => !['includeSubDomains', 'authorisation'].includes(k));
    if (unknown.length) throw new Error(`HSTS option ${unknown.join(', ')} is not supported (preload is never produced)`);
    if (hsts.includeSubDomains !== undefined && typeof hsts.includeSubDomains !== 'boolean') throw new Error('hsts.includeSubDomains must be true or false');
  }
  if (hsts && hsts.includeSubDomains === true) {
    const listed = policy.hstsOptions?.authorisations;
    if (!Array.isArray(listed) || typeof hsts.authorisation !== 'string' || !listed.includes(hsts.authorisation)) throw new Error(`HSTS includeSubDomains needs a recorded authorisation for this client: the reference ${JSON.stringify(hsts.authorisation)} is not listed in security.json hstsOptions.authorisations (it is off by default, D-P3-4)`);
    out[key] = `${out[key]}; includeSubDomains`;
  }
  return out;
}

export function cacheHeader(pathname, type, policy = loadPolicy()) {
  if (/text\/html/.test(type) || pathname.endsWith('/')) return policy.cache.html;
  if (/css|javascript/.test(type)) return policy.cache.code;
  return policy.cache.static;
}

// Does the built site tell search engines to stay away? Read from the delivered pages, not from the configuration, so the answer is what a
// visitor's crawler would see: 'all' when every page carries the robots noindex meta tag, 'none' when no page does, 'mixed' otherwise.
export function noindexState(root) {
  const pages = pagesOf(root).filter((f) => f !== '404.html');   // the not-found page may carry noindex or not; it is not a page of the registry
  const flags = pages.map((f) => /<meta name="robots" content="[^"]*\bnoindex\b[^"]*">/i.test(readFileSync(join(root, f), 'utf8')));
  return flags.length && flags.every(Boolean) ? 'all' : flags.some(Boolean) ? 'mixed' : 'none';
}
// The response headers that keep the fictional demonstration out of search results (security.json "noindexHeaders"): empty for an indexable
// build. A build where only some pages are noindex is a mistake and is refused, so no host file is written for it.
export function robotsHeaders(root, policy = loadPolicy()) {
  const state = noindexState(root);
  if (state === 'mixed') throw new Error('some pages carry the robots noindex meta tag and others do not: a build is either entirely noindex (the demonstration) or entirely indexable');
  const { $comment, ...headers } = policy.noindexHeaders || {};
  return state === 'all' ? headers : {};
}

// ---- host renderings
export function renderHeadersFile(root, policy, { prefix = '', https = true, hsts = null } = {}) {
  const h = { ...securityHeaders(root, policy, { https, hsts }), ...robotsHeaders(root, policy) };
  // cache rules by REQUEST path: on a host that serves /menu for menu.html a rule written for "/*.html" never matches the page (HR-02, G6-4), so each page also gets its clean path
  const pageRules = pagesOf(root).filter((f) => f !== 'index.html' && f !== '404.html').map((f) => `${prefix}/${f.replace(/\.html$/, '')}`).sort().map((r) => `${r}\n  Cache-Control: ${policy.cache.html}\n`).join('');   // sorted: the build (registry order) and a verifier that only sees the unpacked site (file order) must write the same bytes
  const block = (pat, extra = {}) => `${prefix}${pat}\n${Object.entries({ ...h, ...extra }).map(([k, v]) => `  ${k}: ${v}`).join('\n')}\n`;
  return `# Generated by engineering/tools/host-files.mjs from engineering/security.json. Netlify and Cloudflare Pages "_headers" format.\n# HTTPS-only headers are included: remove Strict-Transport-Security and upgrade-insecure-requests for plain-HTTP hosting.\n${block('/*')}\n${prefix || '/'}\n  Cache-Control: ${policy.cache.html}\n${prefix}/*.html\n  Cache-Control: ${policy.cache.html}\n${pageRules}${prefix}/*.css\n  Cache-Control: ${policy.cache.code}\n${prefix}/*.js\n  Cache-Control: ${policy.cache.code}\n${prefix}/media/*\n  Cache-Control: ${policy.cache.static}\n${prefix}/fonts/*\n  Cache-Control: ${policy.cache.static}\n`;
}
export function renderNginx(root, policy, { https = true, hsts = null } = {}) {
  const h = { ...securityHeaders(root, policy, { https, hsts }), ...robotsHeaders(root, policy) };
  return `# Generated by engineering/tools/host-files.mjs from engineering/security.json. Put inside the server block that serves the site.\n# add_header in a location replaces the server-level ones, so the security headers are repeated where a cache header is set.\n${Object.entries(h).map(([k, v]) => `add_header ${k} "${v.replace(/"/g, '\\"')}" always;`).join('\n')}\nlocation ~* \\.(html)$ { add_header Cache-Control "${policy.cache.html}" always; ${Object.entries(h).map(([k, v]) => `add_header ${k} "${v.replace(/"/g, '\\"')}" always;`).join(' ')} }\nlocation ~* \\.(css|js)$ { add_header Cache-Control "${policy.cache.code}" always; ${Object.entries(h).map(([k, v]) => `add_header ${k} "${v.replace(/"/g, '\\"')}" always;`).join(' ')} }\nlocation ~* ^/(media|fonts)/ { add_header Cache-Control "${policy.cache.static}" always; ${Object.entries(h).map(([k, v]) => `add_header ${k} "${v.replace(/"/g, '\\"')}" always;`).join(' ')} }\n`;
}
export function renderApache(root, policy, { https = true, hsts = null } = {}) {
  const h = { ...securityHeaders(root, policy, { https, hsts }), ...robotsHeaders(root, policy) };
  return `# Generated by engineering/tools/host-files.mjs from engineering/security.json. Needs mod_headers. Place in the site folder as .htaccess.\n<IfModule mod_headers.c>\n${Object.entries(h).map(([k, v]) => `  Header always set ${k} "${v.replace(/"/g, '\\"')}"`).join('\n')}\n  <FilesMatch "\\.(html)$">\n    Header set Cache-Control "${policy.cache.html}"\n  </FilesMatch>\n  <FilesMatch "\\.(css|js)$">\n    Header set Cache-Control "${policy.cache.code}"\n  </FilesMatch>\n  <FilesMatch "\\.(webp|webm|mp4|woff2)$">\n    Header set Cache-Control "${policy.cache.static}"\n  </FilesMatch>\n</IfModule>\n`;
}

// Parses a CSP string into { directive: [sources] }.
export function parseCsp(csp) { const o = {}; for (const part of csp.split(';').map((s) => s.trim()).filter(Boolean)) { const [d, ...src] = part.split(/\s+/); o[d] = src; } return o; }
