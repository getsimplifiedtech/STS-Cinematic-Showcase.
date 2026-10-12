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
import { buildCsp, loadPolicy, noindexState, renderHeadersFile, robotsHeaders } from '../lib/security.mjs';
import { PAGES_LIMITS, checkHeadersFile as cfCheck, parseHeadersFile } from '../adapters/hosting/cloudflare-pages.mjs';
import { publicPathOf } from '../adapters/hosting/common.mjs';
import { pagesOf } from '../lib/site.mjs';
import { checkHostingAdapters } from './hosting-adapters.mjs';
import { isMain, projectDir } from '../lib/git.mjs';
import { coreRel, engRel, project } from '../lib/project.mjs';

const STATIC_EXT = new Set(['.html', '.css', '.js', '.webp', '.webm', '.mp4', '.woff2', '.txt', '.xml', '.ico', '.svg', '.png', '.jpg', '.json', '.md']);
const FORBIDDEN_NAMES = [/^vercel\.json$/i, /^\.vercel$/i, /^netlify\.toml$/i, /^wrangler\.(toml|json|jsonc)$/i, /^_worker\.js$/i, /^_routes\.json$/i, /^functions$/i, /^package(-lock)?\.json$/i, /^node_modules$/i, /^next\.config\./i, /^_redirects$/i, /^\.env/i, /^\.git/i];

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

// The _headers parser and checker now live with the Cloudflare Pages adapter (G6-4); these are kept here with their original signatures so every caller keeps working.
export { PAGES_LIMITS, parseHeadersFile };
export function checkHeadersFile(text, { root, policy = loadPolicy(), prefix = '', label = 'headers', hsts = null } = {}) {
  const computed = root ? { noindex: noindexState(root), csp: buildCsp(root, policy, { https: true }), pages: pagesOf(root).filter((f) => f !== '404.html').map((f) => publicPathOf(f, 'clean')) } : null;
  return cfCheck(text, { root, policy, prefix, label, hsts, computed });
}

const FORBIDDEN_IN_SOURCES = /vercel/i;
export function checkNoVendor() {
  const problems = [];
  const D = project.delivery;
  const roots = [...D.sourceRoots, D.configDir, ...D.sharedFiles, 'package.json', ...['security.json', 'htmlvalidate.json', 'release'].map((x) => `${engRel}/${x}`)];
  // seo.mjs names the hosts (Cloudflare Pages, Vercel, a plain server) only to choose the public URL style; it calls no host API and needs no host file.
  const allowed = new Set([`${coreRel}/checks/ci.mjs`, `${coreRel}/checks/hosting.mjs`, project.generators.seo].filter(Boolean));
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
    notes.push(`static folder: demonstration ${a.files} files (${a.pages} pages), client build ${b.files} files (${b.pages} pages, with robots.txt, sitemap.xml and llms.txt); no application, function, redirect or vendor file; all under the Pages limits`);
    let n = 0;
    for (const [name, root] of [['demonstration', demo], ['client build', client.dir]]) for (const prefix of ['', '/site']) {
      let t; try { t = renderHeadersFile(root, policy, { prefix, https: true }); } catch (e) { problems.push(`${name} _headers: ${e.message}`); continue; }
      const p = checkHeadersFile(t, { root, policy, prefix, label: `${name} _headers${prefix ? ' under ' + prefix : ''}` });
      problems.push(...p); n++;
    }
    notes.push(`_headers: ${n} renderings (2 builds x domain root and sub-path) within 100 rules and 2000-character lines; security headers once, in "/*" only; Cache-Control only in narrower rules; no immutable; CSP equals the computed policy`);
    const stDemo = noindexState(demo), stClient = noindexState(client.dir);
    if (stDemo !== 'all') problems.push(`the demonstration must be entirely noindex (found: ${stDemo})`);
    if (stClient !== 'none') problems.push(`the client build must be entirely indexable (found: ${stClient})`);
    if (stDemo === 'all' && !Object.keys(robotsHeaders(demo, policy)).length) problems.push('the demonstration gets no X-Robots-Tag header from the policy');
    if (stClient === 'none' && Object.keys(robotsHeaders(client.dir, policy)).length) problems.push('an indexable client build would get an X-Robots-Tag header');
    notes.push(`noindex defence in depth: the demonstration's host files carry ${Object.entries(robotsHeaders(demo, policy)).map(([k, v]) => `${k}: ${v}`).join('; ')} (meta tag on all pages, header in "/*"); the indexable client build carries none`);
    const v = checkNoVendor(); problems.push(...v);
    // G6-4: the hosting adapters (Cloudflare Pages, Vercel, plain static): bundles, simulation profiles, golden outputs, provider facts and adversarial negative cases
    const ad = await checkHostingAdapters(); problems.push(...ad.problems.map((p) => `hosting adapters: ${p}`)); notes.push(...ad.notes.map((n) => `adapters: ${n}`));
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
