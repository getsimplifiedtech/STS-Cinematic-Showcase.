// Hosting adapter: Vercel (G6-4, APR-JE-044). A pure function of files: it holds no credential, names no team, project or account, and cannot deploy.
// Provider facts (VC-nn in engineering/hosting/provider-facts.json) are of two kinds: statements of Vercel's open-source routing code, and PARAPHRASES of
// official pages that could not be fetched here. Nothing was observed on a live Vercel project; `unverifiedLive` in the manifest lists what only a live check can settle.
//
// Bundle layout:
//   bundle.manifest.json   what the bundle holds (hashes, roles), not served
//   vercel.json            the only vendor file: lives OUTSIDE the delivered site (role "deploy-config")
//   SETTINGS.txt           the project settings a person applies (the tool cannot)
//   site/                  the delivered files, byte-identical (the Output Directory)
import { parseStrictJson } from '../../lib/strict-json.mjs';
import { loadPolicy } from '../../lib/security.mjs';
import { composeHeaders } from './common.mjs';

export const VERCEL_LIMITS = { routes: 2048 };
const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const ALLOWED_KEYS = new Set(['framework', 'outputDirectory', 'cleanUrls', 'trailingSlash', 'headers']);
// only the source forms the adapter writes: the documented global pattern, the root, an exact path, a folder wildcard. No named segments, no regular expressions.
const SOURCE_FORMS = /^(?:\/|\/\(\.\*\)|(?:\/[A-Za-z0-9._-]+)+|(?:\/[A-Za-z0-9._-]+)+\/\(\.\*\))$/;
const FORBIDDEN = [/^vercel\.json$/i, /^\.vercel$/i, /^netlify\.toml$/i, /^wrangler\.(toml|json|jsonc)$/i, /^_headers$/i, /^_redirects$/i, /^_worker\.js$/i, /^_routes\.json$/i, /^functions$/i, /^api$/i, /^package(-lock)?\.json$/i, /^node_modules$/i, /^next\.config\./i, /^\.env/i, /^\.git/i];

export function renderVercelJson({ site, policy = loadPolicy(), hsts = null }) {
  const h = composeHeaders(site, policy, { hsts });
  const kv = (o) => Object.entries(o).map(([key, value]) => ({ key, value }));
  const headers = [{ source: '/(.*)', headers: kv({ ...h.security, ...h.robots }) }];
  for (const p of h.cache.pages) headers.push({ source: p, headers: kv({ 'Cache-Control': h.values.pages }) });
  for (const f of h.cache.code) headers.push({ source: f, headers: kv({ 'Cache-Control': h.values.code }) });
  for (const d of h.cache.staticDirs) headers.push({ source: `/${d}/(.*)`, headers: kv({ 'Cache-Control': h.values.static }) });
  return formatVercelJson({ framework: null, outputDirectory: 'site', cleanUrls: site.urlStyle === 'clean', trailingSlash: false, headers });
}

// two-space JSON with each header on one line, so a reviewer (and a golden file) reads one header per line
export function formatVercelJson(o) {
  const head = (e) => `    {\n      "source": ${JSON.stringify(e.source)},\n      "headers": [\n${e.headers.map((h) => `        { "key": ${JSON.stringify(h.key)}, "value": ${JSON.stringify(h.value)} }`).join(',\n')}\n      ]\n    }`;
  return `{\n  "framework": ${JSON.stringify(o.framework)},\n  "outputDirectory": ${JSON.stringify(o.outputDirectory)},\n  "cleanUrls": ${JSON.stringify(o.cleanUrls)},\n  "trailingSlash": ${JSON.stringify(o.trailingSlash)},\n  "headers": [\n${o.headers.map(head).join(',\n')}\n  ]\n}\n`;
}

// The checks on a vercel.json, independent of the code that wrote it.
export function checkVercelJson(text, { site, policy = loadPolicy(), hsts = null, computed = null, label = 'vercel.json' } = {}) {
  const problems = [];
  let j;
  try { j = parseStrictJson(text); } catch (e) { return [`${label}: not valid JSON (${String(e.message).slice(0, 80)})`]; }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return [`${label}: not an object`];
  for (const k of Object.keys(j)) if (!ALLOWED_KEYS.has(k)) problems.push(`${label}: "${k}" is not a key this adapter writes (the site needs no routes, rewrites, redirects, functions, builds, environment or identifiers; a misspelt key is silently ignored by the provider)`);
  if (j.framework !== null) problems.push(`${label}: framework must be null (the preset "Other"; VC-13)`);
  if (j.outputDirectory !== 'site') problems.push(`${label}: outputDirectory must be "site", the folder of the delivered files (VC-13)`);
  const wantClean = site.urlStyle === 'clean';
  if (j.cleanUrls !== wantClean) problems.push(`${label}: cleanUrls is ${JSON.stringify(j.cleanUrls)} but the site's urlStyle is "${site.urlStyle}" (${wantClean ? 'every canonical would be a 404' : 'the .html form would be redirected away from the canonical'})`);
  if (j.trailingSlash !== false) problems.push(`${label}: trailingSlash must be explicitly false: left undefined, /products/ also serves the page and every relative link on it breaks (VC-11, HR-03)`);
  if (!Array.isArray(j.headers)) { problems.push(`${label}: headers must be a list`); return problems; }
  if (j.headers.length > VERCEL_LIMITS.routes) problems.push(`${label}: ${j.headers.length} header entries exceed the ${VERCEL_LIMITS.routes} routes per deployment (VC-17)`);
  const security = new Set(Object.keys({ ...policy.headers, ...policy.httpsOnlyHeaders, 'Content-Security-Policy': 1 }).map((s) => s.toLowerCase()));
  const sources = new Set(); const seenSecurity = new Map(); const robotsName = Object.keys(policy.noindexHeaders || {}).filter((k) => k !== '$comment');
  let global = null; const cacheBy = new Map(); const robotsSeen = [];
  j.headers.forEach((e, i) => {
    const at = `${label}: headers[${i}]`;
    if (!e || typeof e !== 'object' || Array.isArray(e)) { problems.push(`${at} is not an object`); return; }
    for (const k of Object.keys(e)) if (!['source', 'headers'].includes(k)) problems.push(`${at}: "${k}" is not allowed (conditional matching is not used)`);
    if (typeof e.source !== 'string' || !SOURCE_FORMS.test(e.source)) { problems.push(`${at}: source ${JSON.stringify(e.source)} is not one of the forms the adapter writes ("/(.*)", "/", an exact path, or "/folder/(.*)")`); return; }
    if (sources.has(e.source)) problems.push(`${at}: source ${e.source} appears twice`);
    sources.add(e.source);
    if (j.cleanUrls && /\.html$/.test(e.source)) problems.push(`${at}: source ${e.source} ends in .html while cleanUrls is on: the request path is the clean URL, so the rule never matches (HR-02)`);
    if (!Array.isArray(e.headers) || !e.headers.length) { problems.push(`${at}: headers must be a non-empty list (VC-12)`); return; }
    const names = new Set();
    for (const h of e.headers) {
      if (!h || typeof h.key !== 'string' || typeof h.value !== 'string' || Object.keys(h).some((k) => !['key', 'value'].includes(k))) { problems.push(`${at}: a header is not { key, value }`); continue; }
      if (!TOKEN.test(h.key)) problems.push(`${at}: "${h.key}" is not a valid header name`);
      if (/[\r\n\u0000-\u001f]/.test(h.value)) problems.push(`${at}: control characters in ${h.key}`);
      if (/immutable/i.test(h.value)) problems.push(`${at}: ${h.key} uses immutable for unhashed file names`);
      if (names.has(h.key.toLowerCase())) problems.push(`${at}: ${h.key} repeated in one entry`);
      names.add(h.key.toLowerCase());
      const lk = h.key.toLowerCase();
      if (security.has(lk)) { seenSecurity.set(lk, (seenSecurity.get(lk) || 0) + 1); if (e.source !== '/(.*)') problems.push(`${at}: security header ${h.key} outside the single "/(.*)" entry (VC-05: several matching entries all apply, so it could be sent or overridden twice)`); }
      if (lk === 'cache-control' && e.source === '/(.*)') problems.push(`${at}: Cache-Control in the global entry would apply to every path (VC-05)`);
      if (robotsName.some((n) => n.toLowerCase() === lk)) robotsSeen.push([e.source, h.value, h.key]);
    }
    if (e.source === '/(.*)') global = e;
    else { const c = e.headers.find((h) => h.key?.toLowerCase() === 'cache-control'); if (c) cacheBy.set(e.source, c.value); }
  });
  if (!global) problems.push(`${label}: no "/(.*)" entry: the security headers would not be sent`);
  if (j.headers[0]?.source !== '/(.*)') problems.push(`${label}: the "/(.*)" entry must come first`);
  for (const name of security) if ((seenSecurity.get(name) || 0) !== 1) problems.push(`${label}: ${name} appears ${seenSecurity.get(name) || 0} times (must be exactly once, in "/(.*)")`);
  const g = new Map((global?.headers || []).map((h) => [h.key.toLowerCase(), h.value]));
  for (const [k, v] of Object.entries(policy.headers)) if (g.get(k.toLowerCase()) !== v) problems.push(`${label}: ${k} is "${g.get(k.toLowerCase())}", the policy says "${v}"`);
  const stsWant = policy.httpsOnlyHeaders['Strict-Transport-Security'] + (hsts?.includeSubDomains ? '; includeSubDomains' : '');
  const sts = g.get('strict-transport-security');
  if (/preload/i.test(sts || '')) problems.push(`${label}: Strict-Transport-Security carries preload`);
  if (/includeSubDomains/i.test(sts || '') && !hsts?.includeSubDomains) problems.push(`${label}: Strict-Transport-Security carries includeSubDomains without a recorded authorisation for this client (D-P3-4, D-P4-5)`);
  if (sts !== stsWant) problems.push(`${label}: Strict-Transport-Security is "${sts}", the policy says "${stsWant}"`);
  if (computed) {
    if (computed.csp && g.get('content-security-policy') !== computed.csp) problems.push(`${label}: the CSP is not the policy computed from the staged pages (regenerate it after every rebuild)`);
    const wanted = Object.entries(policy.noindexHeaders || {}).filter(([k]) => k !== '$comment');
    for (const [name, value] of wanted) {
      const where = robotsSeen.filter(([, , k]) => k.toLowerCase() === name.toLowerCase());
      if (computed.noindex === 'all') {
        if (!where.length) problems.push(`${label}: the demonstration is noindex but the ${name} header is missing`);
        for (const [src, v] of where) { if (src !== '/(.*)') problems.push(`${label}: ${name} in entry ${src} (must be only in "/(.*)")`); if (v !== value) problems.push(`${label}: ${name} is "${v}", the policy says "${value}"`); }
        if (where.length > 1) problems.push(`${label}: ${name} appears ${where.length} times`);
      } else if (computed.noindex === 'none' && where.length) problems.push(`${label}: ${name} appears in an indexable build: it would keep the real site out of search results`);
      else if (computed.noindex === 'mixed') problems.push(`${label}: only some pages carry the robots noindex meta tag`);
    }
    // request-path cache entries for every page, every shared css/js file and each asset folder (HR-02), and no entry for anything else
    const want = new Map();
    for (const p of computed.pages) want.set(p, policy.cache.html);
    for (const f of computed.code) want.set(f, policy.cache.code);
    for (const d of computed.staticDirs) want.set(`/${d}/(.*)`, policy.cache.static);
    for (const [src, v] of want) { if (!cacheBy.has(src)) problems.push(`${label}: no Cache-Control entry for ${src}`); else if (cacheBy.get(src) !== v) problems.push(`${label}: Cache-Control for ${src} is "${cacheBy.get(src)}", the policy says "${v}"`); }
    for (const src of cacheBy.keys()) if (!want.has(src)) problems.push(`${label}: a Cache-Control entry for ${src}, which is not a page, a shared file or an asset folder of this site`);
  }
  return problems;
}

export const vercel = {
  id: 'vercel',
  siteRoot: 'site',
  facts: ['VC-01', 'VC-02', 'VC-03', 'VC-05', 'VC-06', 'VC-07', 'VC-10', 'VC-11', 'VC-12', 'VC-13', 'VC-14', 'VC-15', 'VC-16', 'VC-17', 'VC-18'],
  capabilities: {
    cleanUrls: 'config', trailingSlash: 'config', headersMechanism: 'config-json', unknownPath: 'not-found (the platform answers; a 404.html in the output directory is used when present; the status of that response is not established)',
    previewNoindex: 'automatic on preview URLs, not on a custom domain of a non-production branch', previewProtection: 'a project setting (Deployment Protection); the default was reported inconsistently (HR-14)', mount: ['domain-root'],
    limits: { rules: VERCEL_LIMITS.routes },
    ranges: 'assumed to be answered with 206 (not established)',
  },
  declared: () => ['vercel.json', 'SETTINGS.txt'],
  validateSite(site) {
    void site;
    return [];   // the base URL, the search files and the URL style are checked for every adapter (siteProblems)
  },
  forbiddenInSite: FORBIDDEN,
  render({ site, policy, hsts }) {
    return { extra: [{ path: 'vercel.json', role: 'deploy-config', content: renderVercelJson({ site, policy, hsts }) }], settings: settingsFor(site) };
  },
  checkFiles({ site, policy, files, computed, hsts }) {
    const t = files.get('vercel.json');
    if (t === undefined) return ['vercel.json is missing from the bundle root: cleanUrls, trailingSlash and the headers would not apply'];
    return checkVercelJson(t.toString('utf8'), { site, policy, hsts, computed });
  },
};

export function settingsFor(site) {
  return [
    { name: 'Framework Preset', value: 'Other (vercel.json also sets "framework": null). Build Command and Install Command: blank (VC-13). No environment variables.' },
    { name: 'Root Directory / Output Directory', value: 'Root Directory: the bundle root, where vercel.json sits (whether vercel.json must sit at the project root when a Root Directory is set was not established: HR-06). Output Directory: site (also in vercel.json).' },
    { name: 'Deployment Protection', value: 'Decide deliberately and record it. Whether previews are protected by default was reported inconsistently by the documentation results (HR-14), so this bundle does not rely on it. Making a preview publicly reachable is a conscious setting change with its own approval (D-P3-5). Keep X-Robots-Tag: noindex (VC-16).' },
    { name: 'Custom domain', value: `${site.channel === 'client-production' ? 'The client domain, at its root (D-P3-2); www to apex is a domain setting, not a rewrite.' : 'None: the demonstration is never published on a client domain.'}` },
    { name: 'Strict-Transport-Security', value: 'The platform default for a custom domain is max-age=63072000 without includeSubDomains; *.vercel.app domains additionally get includeSubDomains; preload from the platform whatever vercel.json says, so the never-preload rule cannot apply there (VC-15). vercel.json sets the policy value for a custom domain; read the live header to see which one wins (unverified).' },
  ];
}
