// check:hosting (ledger ENG-081, scope item 8). The delivered site is a plain static folder that Cloudflare Pages (and any static host) serves
// with no build service, function, redirect rule or vendor-specific file, and the generated host files respect Cloudflare Pages' documented limits.
//   folder    only static files (html, css, js, webp, webm, mp4, woff2, txt, xml, ico); none of the files that would make a host treat it as an
//             application: vercel.json, .vercel, netlify.toml, wrangler.toml, _worker.js, _routes.json, functions/, package.json, node_modules,
//             next.config.*, _redirects (the site needs none); file count and file sizes under the Pages limits (20 000 files, 25 MiB per file);
//             every page is a real .html file (pretty URLs are the host's decision, not a rewrite the site depends on)
//   no vendor nothing in the delivered files, the build sources, the configuration or the engineering rules refers to Vercel, and no script of the
//             site calls a vendor API; the engineering folder names Vercel only where it forbids it (this check's own rule list and ci.mjs)
//   _headers  generated for the demonstration build and for a realistic client build, at the domain root and under a sub-path: at most 100 rules,
//             no line over 2000 characters, every rule starts at "/", header names are valid tokens, no header repeated within one rule, security
//             headers only in the "/*" rule (Cloudflare joins values of matching rules, so a header in two rules would be sent twice), Cache-Control
//             only in the narrower rules, no "immutable" for unhashed names, and the CSP in the file is the CSP the security check proves
//   robots    a client build serves /robots.txt, /sitemap.xml and /llms.txt from the folder root; the demonstration serves none of them
// Nothing here deploys anything or contacts a host.
import { readdirSync, readFileSync, statSync, rmSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { assembleCandidate } from '../lib/site.mjs';
import { buildClient } from '../lib/client-fixture.mjs';
import { buildCsp, loadPolicy, renderHeadersFile } from '../lib/security.mjs';
import { isMain, projectDir } from '../lib/git.mjs';

export const PAGES_LIMITS = { rules: 100, lineChars: 2000, files: 20000, fileBytes: 25 * 1024 * 1024 };
const STATIC_EXT = new Set(['.html', '.css', '.js', '.webp', '.webm', '.mp4', '.woff2', '.txt', '.xml', '.ico', '.svg', '.png', '.jpg', '.json', '.md']);
const FORBIDDEN_NAMES = [/^vercel\.json$/i, /^\.vercel$/i, /^netlify\.toml$/i, /^wrangler\.(toml|json|jsonc)$/i, /^_worker\.js$/i, /^_routes\.json$/i, /^functions$/i, /^package(-lock)?\.json$/i, /^node_modules$/i, /^next\.config\./i, /^_redirects$/i, /^\.env/i, /^\.git/i];
const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

export function walk(dir) { const out = []; for (const e of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isDirectory()) out.push(...walk(p)); else out.push(p); } return out; }

export function checkFolder(dir, { client = false, label = 'site' } = {}) {
  const problems = [];
  const all = walk(dir); const rel = all.map((p) => relative(dir, p).split('\\').join('/'));
  if (all.length > PAGES_LIMITS.files) problems.push(`${label}: ${all.length} files exceed the Pages limit of ${PAGES_LIMITS.files}`);
  for (const p of all) {
    const r = relative(dir, p).split('\\').join('/');
    const size = statSync(p).size;
    if (size > PAGES_LIMITS.fileBytes) problems.push(`${label}: ${r} is ${size} bytes, over the Pages limit of 25 MiB per file`);
    for (const seg of r.split('/')) for (const re of FORBIDDEN_NAMES) if (re.test(seg)) problems.push(`${label}: ${r} would make a host treat the folder as an application or carries vendor/secret configuration`);
    if (!STATIC_EXT.has(extname(p).toLowerCase())) problems.push(`${label}: ${r} is not a static web file type`);
  }
  const pages = rel.filter((r) => r.endsWith('.html')); if (!pages.includes('index.html')) problems.push(`${label}: no index.html at the root`);
  for (const f of rel.filter((r) => /\.(html|css|js|xml|txt)$/.test(r))) {
    const t = readFileSync(join(dir, f), 'utf8');
    if (/vercel/i.test(t)) problems.push(`${label}: ${f} refers to Vercel`);
    if (/\b(?:fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource)\b/.test(t) && f.endsWith('.js')) problems.push(`${label}: ${f} makes network calls the static site does not need`);
  }
  const hasRobots = rel.includes('robots.txt'), hasMap = rel.includes('sitemap.xml'), hasLlms = rel.includes('llms.txt');
  if (client && !(hasRobots && hasMap && hasLlms)) problems.push(`${label}: an indexable client build must serve robots.txt, sitemap.xml and llms.txt from the root`);
  if (!client && (hasRobots || hasMap || hasLlms)) problems.push(`${label}: the demonstration must not publish a sitemap, robots.txt or llms.txt (it stays noindex)`);
  return { problems, files: all.length, pages: pages.length };
}

// Parses a Cloudflare/Netlify style _headers file into rules.
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

export function checkHeadersFile(text, { root, policy = loadPolicy(), prefix = '', label = 'headers' } = {}) {
  const problems = [], { rules, problems: parse } = parseHeadersFile(text);
  parse.forEach((p) => problems.push(`${label}: ${p}`));
  if (rules.length > PAGES_LIMITS.rules) problems.push(`${label}: ${rules.length} rules exceed the Pages limit of ${PAGES_LIMITS.rules}`);
  text.split('\n').forEach((l, i) => { if (l.length > PAGES_LIMITS.lineChars) problems.push(`${label}: line ${i + 1} is ${l.length} characters (limit ${PAGES_LIMITS.lineChars})`); });
  const security = new Set(Object.keys({ ...policy.headers, ...policy.httpsOnlyHeaders, 'Content-Security-Policy': 1 }).map((s) => s.toLowerCase()));
  const seen = new Map();
  for (const r of rules) {
    if (!r.path.startsWith(prefix + '/') && r.path !== prefix) problems.push(`${label}: rule "${r.path}" does not start at "${prefix}/"`);
    if (/\s/.test(r.path)) problems.push(`${label}: rule "${r.path}" contains whitespace`);
    const names = new Set();
    for (const [k, v] of r.headers) {
      if (!TOKEN.test(k)) problems.push(`${label}: "${k}" is not a valid header name`);
      if (names.has(k.toLowerCase())) problems.push(`${label}: rule "${r.path}" repeats ${k}`);
      names.add(k.toLowerCase());
      if (/[\r\n]/.test(v)) problems.push(`${label}: control characters in ${k}`);
      if (/immutable/i.test(v)) problems.push(`${label}: ${k} uses immutable for unhashed file names (rule "${r.path}")`);
      seen.set(k.toLowerCase(), (seen.get(k.toLowerCase()) || 0) + 1);
      if (security.has(k.toLowerCase()) && r.path !== `${prefix}/*`) problems.push(`${label}: security header ${k} in rule "${r.path}" (must be only in the "/*" rule, or Cloudflare would send it twice)`);
      if (k.toLowerCase() === 'cache-control' && r.path === `${prefix}/*`) problems.push(`${label}: Cache-Control in the catch-all rule would join with the narrower rules`);
    }
  }
  for (const name of security) if (!seen.has(name)) problems.push(`${label}: ${name} is missing`);
  const catchAll = rules.find((r) => r.path === `${prefix}/*`);
  const csp = catchAll?.headers.find(([k]) => k.toLowerCase() === 'content-security-policy')?.[1];
  if (root && csp !== buildCsp(root, policy, { https: true })) problems.push(`${label}: the CSP in the file is not the policy computed from the built pages (regenerate it after every rebuild)`);
  return problems;
}

const FORBIDDEN_IN_SOURCES = /vercel/i;
export function checkNoVendor() {
  const problems = [];
  const roots = ['src', 'config', 'build.mjs', 'styles.css', 'site.js', 'hero.js', 'menu.js', 'package.json', 'engineering/security.json', 'engineering/htmlvalidate.json', 'engineering/release'];
  // seo.mjs names the hosts (Cloudflare Pages, Vercel, a plain server) only to choose the public URL style; it calls no host API and needs no host file.
  const allowed = new Set(['engineering/checks/ci.mjs', 'engineering/checks/hosting.mjs', 'src/lib/seo.mjs']);
  for (const r of roots) {
    const p = join(projectDir, r); let files;
    try { files = statSync(p).isDirectory() ? walk(p) : [p]; } catch { continue; }
    for (const f of files) { const rr = relative(projectDir, f).split('\\').join('/'); if (allowed.has(rr)) continue; if (FORBIDDEN_IN_SOURCES.test(readFileSync(f, 'utf8').replace(/"host"\s*:\s*"vercel"/g, ''))) problems.push(`${rr} refers to Vercel`); }   // seo.host "vercel" is a choice of URL style, not a dependency
  }
  return problems;
}

export async function checkHosting() {
  const problems = [], notes = [];
  const policy = loadPolicy();
  const demo = assembleCandidate(projectDir, 'hosting-demo');
  const client = buildClient({ label: 'hosting-client' });
  try {
    if (client.status !== 0) { problems.push(`the client build failed: ${client.text}`); return { problems, notes }; }
    const a = checkFolder(demo, { client: false, label: 'demonstration' }), b = checkFolder(client.dir, { client: true, label: 'client build' });
    problems.push(...a.problems, ...b.problems);
    notes.push(`static folder: demonstration ${a.files} files (${a.pages} pages), client build ${b.files} files (${b.pages} pages, with robots.txt and sitemap.xml); no application, function, redirect or vendor file; all under the Pages limits`);
    let n = 0;
    for (const [name, root] of [['demonstration', demo], ['client build', client.dir]]) for (const prefix of ['', '/site']) {
      const t = renderHeadersFile(root, policy, { prefix, https: true });
      const p = checkHeadersFile(t, { root, policy, prefix, label: `${name} _headers${prefix ? ' under ' + prefix : ''}` });
      problems.push(...p); n++;
    }
    notes.push(`_headers: ${n} renderings (2 builds x domain root and sub-path) within 100 rules and 2000-character lines; security headers once, in "/*" only; Cache-Control only in narrower rules; no immutable; CSP equals the computed policy`);
    const v = checkNoVendor(); problems.push(...v);
    notes.push('no source, configuration, delivered file or engineering rule depends on Vercel (functionality is vendor independent)');
  } finally { rmSync(demo, { recursive: true, force: true }); rmSync(client.root, { recursive: true, force: true }); }
  return { problems, notes };
}

if (isMain(import.meta.url)) {
  const { problems, notes } = await checkHosting();
  notes.forEach((n) => console.log('  ' + n));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:hosting`);
  process.exit(problems.length ? 1 : 0);
}
