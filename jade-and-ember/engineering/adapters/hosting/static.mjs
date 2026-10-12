// Hosting adapter: a plain static server (nginx or Apache) (G6-4, APR-JE-044). It wraps the two existing renderers in the same interface and the same contract tests;
// it adds no behaviour of its own. Pure function of files; no credential; cannot deploy. Files are served as named (urlStyle "extension"); extension-less URLs and a custom 404 page
// need server configuration that this adapter does not write (it says so in SETTINGS.txt).
import { renderApache, renderNginx } from '../../lib/security.mjs';

const unesc = (v) => v.replace(/\\"/g, '"');
export function parseNginx(text) {
  return [...text.matchAll(/add_header\s+([^\s]+)\s+"((?:[^"\\]|\\.)*)"\s+always;/g)].map((m) => [m[1], unesc(m[2])]);
}
export function parseApache(text) {
  return [...text.matchAll(/Header always set (\S+) "((?:[^"\\]|\\.)*)"/g)].map((m) => [m[1], unesc(m[2])]);
}
// every occurrence of a header in a server config must carry the policy value (a location block that repeats the headers must not change them)
export function checkServerHeaders(pairs, { policy, hsts, computed, label }) {
  const problems = [];
  const want = { 'Content-Security-Policy': computed?.csp, ...policy.headers, 'Strict-Transport-Security': policy.httpsOnlyHeaders['Strict-Transport-Security'] + (hsts?.includeSubDomains ? '; includeSubDomains' : '') };
  for (const [name, value] of Object.entries(want)) {
    const got = pairs.filter(([k]) => k.toLowerCase() === name.toLowerCase());
    if (!got.length) { problems.push(`${label}: ${name} is missing`); continue; }
    for (const [, v] of got) if (value !== undefined && v !== value) problems.push(`${label}: ${name} is "${v.slice(0, 80)}", the policy says "${String(value).slice(0, 80)}"`);
  }
  const sts = pairs.find(([k]) => k.toLowerCase() === 'strict-transport-security')?.[1] || '';
  if (/includeSubDomains/i.test(sts) && !hsts?.includeSubDomains) problems.push(`${label}: Strict-Transport-Security carries includeSubDomains without a recorded authorisation (D-P3-4, D-P4-5)`);
  if (/preload/i.test(sts)) problems.push(`${label}: Strict-Transport-Security carries preload`);
  const noindex = Object.entries(policy.noindexHeaders || {}).filter(([k]) => k !== '$comment');
  for (const [name, value] of noindex) {
    const got = pairs.filter(([k]) => k.toLowerCase() === name.toLowerCase());
    if (computed?.noindex === 'all' && (!got.length || got.some(([, v]) => v !== value))) problems.push(`${label}: the demonstration needs ${name}: ${value} everywhere the security headers are set`);
    if (computed?.noindex === 'none' && got.length) problems.push(`${label}: ${name} appears in an indexable build`);
  }
  for (const [, v] of pairs) if (/[\r\n\u0000-\u001f]/.test(v)) problems.push(`${label}: control characters in a header value`);
  return problems;
}

export const staticServer = {
  id: 'static',
  siteRoot: 'site',
  facts: [],
  capabilities: { cleanUrls: 'none', trailingSlash: 'none', headersMechanism: 'server-config', unknownPath: 'not-found', previewNoindex: 'none', previewProtection: 'none', mount: ['domain-root'], limits: {}, ranges: 'server default (nginx and Apache answer Range requests)' },
  declared: () => ['nginx.conf', 'htaccess', 'SETTINGS.txt'],
  validateSite(site) {
    const problems = [];
    if (site.urlStyle !== 'extension') problems.push('a plain static server serves files as named: the site must declare seo.urlStyle "extension" (extension-less URLs need server rewrites this adapter does not write)');
    return problems;
  },
  forbiddenInSite: [/^nginx\.conf$/i, /^htaccess$/i, /^\.htaccess$/i, /^_headers$/i, /^_redirects$/i, /^vercel\.json$/i, /^wrangler\.(toml|json|jsonc)$/i, /^\.env/i, /^\.git/i, /^node_modules$/i, /^package(-lock)?\.json$/i],
  render({ site, policy, hsts }) {
    return { extra: [
      { path: 'nginx.conf', role: 'server-config', content: renderNginx(site.siteDir, policy, { https: true, hsts }) },
      { path: 'htaccess', role: 'server-config', content: renderApache(site.siteDir, policy, { https: true, hsts }) },
    ], settings: settingsFor(site) };
  },
  checkFiles({ policy, files, computed, hsts }) {
    const problems = [];
    const n = files.get('nginx.conf'), a = files.get('htaccess');
    if (n === undefined) problems.push('nginx.conf is missing'); else problems.push(...checkServerHeaders(parseNginx(n.toString('utf8')), { policy, hsts, computed, label: 'nginx.conf' }));
    if (a === undefined) problems.push('htaccess is missing'); else problems.push(...checkServerHeaders(parseApache(a.toString('utf8')), { policy, hsts, computed, label: 'htaccess' }));
    return problems;
  },
};

export function settingsFor(site) {
  return [
    { name: 'nginx', value: 'Include nginx.conf inside the server block that serves the site folder; add `error_page 404 /404.html;` once a 404 page exists (D-P3-1).' },
    { name: 'Apache', value: 'Needs mod_headers. Save htaccess as .htaccess in the site folder; add `ErrorDocument 404 /404.html` once a 404 page exists (D-P3-1).' },
    { name: 'TLS', value: `${site.channel === 'client-production' ? 'Serve the site over HTTPS only; the HSTS header is sent over HTTPS.' : 'The demonstration is never published.'}` },
  ];
}
