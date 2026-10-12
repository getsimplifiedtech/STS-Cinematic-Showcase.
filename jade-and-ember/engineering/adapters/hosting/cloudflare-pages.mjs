// Hosting adapter: Cloudflare Pages (G6-4, APR-JE-044). A pure function of files. It holds no credential, names no account or project and cannot deploy.
// Provider facts it rests on are filed in engineering/hosting/provider-facts.json (CF-nn). Nothing here has been observed on a live host: every behaviour that
// only a live check can establish is listed in `unverifiedLive` and in the bundle manifest.
//
// Bundle layout (what the deploy directory holds; the provider serves `site/`):
//   bundle.manifest.json   what the bundle holds (hashes, roles), written last, not served
//   SETTINGS.txt           the dashboard settings a person applies (the tool cannot)
//   site/                  the delivered files, byte-identical, plus `_headers` (role "headers"; Cloudflare reads it from the deploy directory and does not serve it, CF-04)
import { parseStrictJson } from '../../lib/strict-json.mjs';
import { renderHeadersFile } from '../../lib/security.mjs';
import { loadPolicy } from '../../lib/security.mjs';
import { AdapterError, MANIFEST } from './common.mjs';

export const PAGES_LIMITS = { rules: 100, lineChars: 2000, files: 20000, fileBytes: 25 * 1024 * 1024 };
const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const FORBIDDEN = [/^_redirects$/i, /^_worker\.js$/i, /^_routes\.json$/i, /^functions$/i, /^wrangler\.(toml|json|jsonc)$/i, /^vercel\.json$/i, /^\.vercel$/i, /^netlify\.toml$/i, /^package(-lock)?\.json$/i, /^node_modules$/i, /^next\.config\./i, /^\.env/i, /^\.git/i, /^_headers$/i];

// Parses a Cloudflare/Netlify style _headers file into rules (and says what it could not parse).
export function parseHeadersFile(text) {
  const rules = []; let cur = null; const problems = [];
  text.split('\n').forEach((line, i) => {
    if (!line.trim() || line.trimStart().startsWith('#')) return;
    if (/^\s/.test(line)) {
      if (!cur) { problems.push(`line ${i + 1}: a header with no rule above it`); return; }
      const m = line.trim().match(/^([^:\s]+):\s?(.*)$/);
      if (!m) { problems.push(`line ${i + 1}: not "Name: value"`); return; }
      cur.headers.push([m[1], m[2]]);
    } else { cur = { path: line.trim(), headers: [], line: i + 1 }; rules.push(cur); }
  });
  return { rules, problems };
}

// The checks on a _headers file, independent of the code that wrote it.
//   root     the delivered folder (for the CSP, the noindex state and the page list); prefix: a stored-under path (non-indexable builds only)
//   hsts     null, or { includeSubDomains: true, authorisation } when this client's opt-in is recorded
export function checkHeadersFile(text, { root, policy = loadPolicy(), prefix = '', label = 'headers', hsts = null, computed = null } = {}) {
  const problems = [], { rules, problems: parse } = parseHeadersFile(text);
  parse.forEach((p) => problems.push(`${label}: ${p}`));
  if (rules.length > PAGES_LIMITS.rules) problems.push(`${label}: ${rules.length} rules exceed the Pages limit of ${PAGES_LIMITS.rules} (CF-01)`);
  text.split('\n').forEach((l, i) => { if (l.length > PAGES_LIMITS.lineChars) problems.push(`${label}: line ${i + 1} is ${l.length} characters (limit ${PAGES_LIMITS.lineChars}, CF-01)`); });
  const security = new Set(Object.keys({ ...policy.headers, ...policy.httpsOnlyHeaders, 'Content-Security-Policy': 1 }).map((s) => s.toLowerCase()));
  const seen = new Map();
  for (const r of rules) {
    if (!r.path.startsWith(prefix + '/') && r.path !== prefix) problems.push(`${label}: rule "${r.path}" does not start at "${prefix}/"`);
    if (/\s/.test(r.path)) problems.push(`${label}: rule "${r.path}" contains whitespace`);
    if ((r.path.match(/\*/g) || []).length > 1) problems.push(`${label}: rule "${r.path}" has more than one splat (only one is allowed)`);
    const names = new Set();
    for (const [k, v] of r.headers) {
      if (!TOKEN.test(k)) problems.push(`${label}: "${k}" is not a valid header name`);
      if (names.has(k.toLowerCase())) problems.push(`${label}: rule "${r.path}" repeats ${k}`);
      names.add(k.toLowerCase());
      if (/[\r\n\u0000-\u001f]/.test(v)) problems.push(`${label}: control characters in ${k}`);
      if (/immutable/i.test(v)) problems.push(`${label}: ${k} uses immutable for unhashed file names (rule "${r.path}")`);
      seen.set(k.toLowerCase(), (seen.get(k.toLowerCase()) || 0) + 1);
      if (security.has(k.toLowerCase()) && r.path !== `${prefix}/*`) problems.push(`${label}: security header ${k} in rule "${r.path}" (must be only in the "/*" rule, or Cloudflare would send it twice: CF-02)`);
      if (k.toLowerCase() === 'cache-control' && r.path === `${prefix}/*`) problems.push(`${label}: Cache-Control in the catch-all rule would join with the narrower rules (CF-02, CF-03)`);
    }
  }
  for (const name of security) if (!seen.has(name)) problems.push(`${label}: ${name} is missing`);
  // HSTS: the policy value, plus includeSubDomains only when this client's recorded opt-in is given (D-P3-4, D-P4-5); never preload
  const catchAll = rules.find((r) => r.path === `${prefix}/*`);
  const sts = catchAll?.headers.find(([k]) => k.toLowerCase() === 'strict-transport-security')?.[1];
  if (sts !== undefined) {
    const want = policy.httpsOnlyHeaders['Strict-Transport-Security'] + (hsts?.includeSubDomains ? '; includeSubDomains' : '');
    if (/preload/i.test(sts)) problems.push(`${label}: Strict-Transport-Security carries preload`);
    if (/includeSubDomains/i.test(sts) && !hsts?.includeSubDomains) problems.push(`${label}: Strict-Transport-Security carries includeSubDomains without a recorded authorisation for this client (D-P3-4, D-P4-5)`);
    if (sts !== want) problems.push(`${label}: Strict-Transport-Security is "${sts}", the policy says "${want}"`);
  }
  if (computed) {
    const { noindex, csp, pages } = computed;
    const wanted = policy.noindexHeaders ? Object.entries(policy.noindexHeaders).filter(([k]) => k !== '$comment') : [];
    for (const [name, value] of wanted) {
      const all = rules.flatMap((r) => r.headers.filter(([k]) => k.toLowerCase() === name.toLowerCase()).map(([, v]) => [r.path, v]));
      if (noindex === 'all') {
        if (!all.length) problems.push(`${label}: the demonstration is noindex but the ${name} header is missing (defence in depth if a host rewrites the HTML)`);
        else {
          if (all.length > 1) problems.push(`${label}: ${name} appears ${all.length} times (Cloudflare joins matching rules, so it would be sent twice)`);
          for (const [path, v] of all) { if (path !== `${prefix}/*`) problems.push(`${label}: ${name} in rule "${path}" (must be only in the "/*" rule)`); if (v !== value) problems.push(`${label}: ${name} is "${v}", the policy says "${value}"`); }
        }
      } else if (noindex === 'none' && all.length) problems.push(`${label}: ${name} appears in an indexable build (${all.map(([p]) => p).join(', ')}): it would keep the real site out of search results`);
      else if (noindex === 'mixed') problems.push(`${label}: only some pages carry the robots noindex meta tag`);
    }
    const cspNow = catchAll?.headers.find(([k]) => k.toLowerCase() === 'content-security-policy')?.[1];
    if (csp && cspNow !== csp) problems.push(`${label}: the CSP in the file is not the policy computed from the built pages (regenerate it after every rebuild)`);
    // request-path cache rules: a rule written for "/*.html" never matches the clean URL /menu (HR-02), so every page needs a rule for ITS public path
    for (const pub of pages || []) {
      const wants = pub === '/' ? (prefix ? [prefix, `${prefix}/`] : ['/']) : [`${prefix}${pub}`];
      const want = wants[0];
      const rule = rules.find((r) => wants.includes(r.path));
      if (!rule) problems.push(`${label}: no cache rule for the request path ${want} (a "/*.html" rule does not match a clean URL: HR-02)`);
      else if (rule.headers.find(([k]) => k.toLowerCase() === 'cache-control')?.[1] !== policy.cache.html) problems.push(`${label}: the cache rule for ${want} is not the policy's "${policy.cache.html}"`);
    }
  }
  return problems;
}

export const cloudflarePages = {
  id: 'cloudflare-pages',
  siteRoot: 'site',
  facts: ['CF-01', 'CF-02', 'CF-03', 'CF-04', 'CF-05', 'CF-06', 'CF-08', 'CF-09', 'CF-10', 'CF-11', 'CF-12', 'CF-17', 'CF-18'],
  capabilities: {
    cleanUrls: 'platform', trailingSlash: 'platform (not established for a page file such as /menu/)', headersMechanism: 'headers-file', unknownPath: 'spa-fallback unless a top-level 404.html exists',
    previewNoindex: 'automatic (platform adds X-Robots-Tag: noindex over preview URLs)', previewProtection: 'optional (public by default)', mount: ['domain-root'],
    limits: { files: PAGES_LIMITS.files, fileBytes: PAGES_LIMITS.fileBytes, rules: PAGES_LIMITS.rules, lineChars: PAGES_LIMITS.lineChars },
    ranges: 'documented to answer Range requests with 200, not 206 (CF-12)',
  },
  // files the adapter itself declares in the bundle, beyond the site (the site folder may contain none of them)
  declared: (site) => ['site/_headers', 'SETTINGS.txt'],
  validateSite(site) {
    const problems = [];
    if (site.urlStyle !== 'clean') problems.push('Cloudflare Pages serves a page at its extension-less path and redirects the .html form (CF-08): the site must declare seo.urlStyle "clean", or every canonical, sitemap and structured-data URL would be a redirect');
    if (site.baseUrl) { try { const u = new URL(site.baseUrl); if (site.channel === 'client-production' && !/^\/?$/.test(u.pathname)) problems.push(`the base URL ${site.baseUrl} has a path: an indexable production site must use a domain or subdomain root (D-P3-2)`); } catch { problems.push(`the base URL ${site.baseUrl} is not a URL`); } }
    if (site.files.length > PAGES_LIMITS.files) problems.push(`${site.files.length} files exceed the Pages limit of ${PAGES_LIMITS.files} (CF-17)`);
    return problems;
  },
  forbiddenInSite: FORBIDDEN,
  render({ site, policy, hsts }) {
    const headers = renderHeadersFile(site.siteDir, policy, { prefix: '', https: true, hsts });
    return { extra: [{ path: 'site/_headers', role: 'headers', content: headers }], settings: settingsFor(site) };
  },
  checkFiles({ site, policy, files, computed, hsts }) {
    const problems = [];
    const h = files.get('site/_headers');
    if (h === undefined) return ['site/_headers is missing: the security headers would not be sent'];
    problems.push(...checkHeadersFile(h.toString('utf8'), { root: site.siteDir, policy, prefix: '', label: 'cloudflare-pages _headers', hsts, computed }));
    return problems;
  },
};

export function settingsFor(site) {
  return [
    { name: 'Deployment method', value: 'Git integration (the STS default, D-P3-3) with framework preset None and the output directory below, or Direct Upload of this bundle. Direct Upload cannot be switched to Git integration later (CF-20): decide per client.' },
    { name: 'Framework preset / build command', value: 'None. Leave the build command blank (CF-22); the same page also says to use `exit 0` when no preset is used (CF-23): use whichever the dashboard accepts. No install step, no environment variables.' },
    { name: 'Build output directory', value: 'site' },
    { name: 'Custom domain', value: `${site.channel === 'client-production' ? 'The client domain, at its root (D-P3-2).' : 'None: the demonstration is never published on a client domain.'} Do not enable zone features that rewrite HTML (email address obfuscation, Rocket Loader, automatic minification, injected analytics): the CSP allows only the hashed inline script (HR-08).` },
    { name: 'Preview deployments', value: 'Public by default (CF-19). None is authorised (D-P3-5). If one is ever authorised, protect it with Cloudflare Access and keep X-Robots-Tag: noindex.' },
  ];
}

export { AdapterError, MANIFEST };
void parseStrictJson;
