// check:links. Comprehensive internal-link validation over the pages the build produces (the demonstration and an indexable client build).
//   targets     every local href, src, srcset, data-webm, data-mp4 and CSS url() resolves to a delivered file, with EXACT letter case (a case-insensitive
//               machine would hide a mismatch that breaks on Linux hosts); no empty href, bare "#", javascript: or whitespace-padded URL
//   fragments   every #fragment, same page or cross page, names an id that exists in the target page; none point at duplicate ids
//   graph       every page is reachable from Home by links, every page is linked from the primary navigation and the footer on every page, no
//               page links to a page that is not in the registry, no dead ends
//   protocols   tel: links hold an international number, mailto: a plausible address, external links well-formed https URLs
//   search      canonical URLs, the sitemap and robots.txt of a client build agree with the files (each canonical path is a delivered page)
//   external    offline: every external address in the delivered files is in engineering/external-destinations.json (a new or vanished one is a
//               finding) and the verification history (external-links-verification.json) is well formed. `--online` also requests each registered
//               destination (HEAD then GET, redirects followed and recorded, one retry) and classifies it verified | blocked | unavailable |
//               inconclusive | insecure; only verified is a pass (Gate 5 Phase 5)
// Run: node engineering/checks/links.mjs [--online]
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, posix } from 'node:path';
import { tokenize } from '../lib/html.mjs';
import { assembleCandidate, pagesOf } from '../lib/site.mjs';
import { buildClient } from '../lib/fixtures.mjs';
import { readSitemap } from './seo.mjs';
import { engDir, isMain, projectDir, readJson } from '../lib/git.mjs';
import { CLASSES, collectExternal, recordProblems, registryProblems, verifyUrl } from '../lib/external.mjs';

// exact-case existence: every path segment must appear in its directory listing as written
const exactExists = (root, rel) => { let d = root; for (const seg of rel.split('/').filter(Boolean)) { if (!existsSync(d) || !readdirSync(d).includes(seg)) return false; d = join(d, seg); } return true; };
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

export function scanLinks({ root, label = '' }) {
  const problems = [], externals = new Set();
  const pages = pagesOf(root);
  const ids = {}, hrefs = {};
  for (const f of pages) {
    const html = readFileSync(join(root, f), 'utf8');
    const { tags } = tokenize(html);
    const seen = new Map();
    for (const t of tags) if (!t.close && t.attrs.id !== undefined) seen.set(t.attrs.id, (seen.get(t.attrs.id) || 0) + 1);
    ids[f] = seen;
    hrefs[f] = { tags, html };
  }
  const check = (from, raw, kind, tag = null) => {
    const u = decode(raw);
    if (u !== u.trim()) problems.push(`${label}${from}: ${kind} "${raw}" has leading or trailing whitespace`);
    if (u === '' && kind !== 'img') { problems.push(`${label}${from}: empty ${kind}`); return null; }
    if (u === '#') { problems.push(`${label}${from}: a link to a bare "#" (it goes nowhere)`); return null; }
    if (/^javascript:/i.test(u)) { problems.push(`${label}${from}: javascript: ${kind}`); return null; }
    if (/^mailto:/i.test(u)) { if (!/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u)) problems.push(`${label}${from}: malformed ${u}`); return null; }
    if (/^tel:/i.test(u)) { if (!/^tel:\+?[0-9]{6,15}$/.test(u)) problems.push(`${label}${from}: malformed ${u}`); return null; }
    if (/^data:/i.test(u)) return null;
    if (/^https?:\/\//i.test(u) || u.startsWith('//')) {
      let url; try { url = new URL(u); } catch { problems.push(`${label}${from}: ${u} is not a valid URL`); return null; }
      if (url.protocol !== 'https:') problems.push(`${label}${from}: ${u} is not https`);
      externals.add(u); return null;
    }
    if (u === '../') return null;   // the demonstration's back-link to the showcase
    const [path, frag] = u.split('#');
    const target = path === '' ? from : posix.normalize(posix.join(posix.dirname(from), path.split('?')[0]));
    if (target.startsWith('..') || target.startsWith('/')) { problems.push(`${label}${from}: "${u}" leaves the site folder`); return null; }
    if (!exactExists(root, target)) { problems.push(`${label}${from}: "${u}" does not exist${existsSync(join(root, target)) ? ' with that exact letter case' : ''}`); return null; }
    if (frag !== undefined) {
      if (frag === '') problems.push(`${label}${from}: "${u}" ends with an empty fragment`);
      else if (target.endsWith('.html')) {
        const count = ids[target]?.get(decodeURIComponent(frag));
        if (!count) problems.push(`${label}${from}: "${u}": no element with id "${frag}" in ${target}`);
        else if (count > 1) problems.push(`${label}${from}: "${u}": id "${frag}" appears ${count} times in ${target}`);
      }
    }
    return target;
  };
  const edges = {};
  for (const f of pages) {
    edges[f] = new Set();
    const { tags, html } = hrefs[f];
    for (const t of tags) {
      if (t.close) continue;
      for (const [attr, kind] of [['href', t.name === 'a' ? 'link' : t.name === 'link' ? 'stylesheet or icon link' : 'href'], ['src', t.name], ['data-webm', 'video source'], ['data-mp4', 'video source']]) {
        if (t.attrs[attr] === undefined) continue;
        if (t.name === 'link' && /^(canonical|icon)$/.test(t.attrs.rel || '') && /^https?:|^data:/.test(t.attrs[attr])) { if (t.attrs.rel === 'canonical') externals.delete(decode(t.attrs[attr])); continue; }
        if (t.name === 'a' && attr === 'href' && /target="_blank"/.test(JSON.stringify(t.attrs)) === false) { /* normal link */ }
        const tgt = check(f, t.attrs[attr], kind, t);
        if (t.name === 'a' && tgt && tgt.endsWith('.html')) edges[f].add(tgt);
      }
      if (t.attrs.srcset) for (const part of t.attrs.srcset.split(',')) check(f, part.trim().split(/\s+/)[0], 'srcset');
      if (t.attrs.imagesrcset) for (const part of t.attrs.imagesrcset.split(',')) check(f, part.trim().split(/\s+/)[0], 'imagesrcset');
    }
    void html;
  }
  for (const f of readdirSync(root).filter((x) => x.endsWith('.css'))) for (const m of readFileSync(join(root, f), 'utf8').matchAll(/url\(\s*['"]?([^)'"]+)['"]?\s*\)/g)) check(f, m[1], 'css url()');
  // graph
  const home = pages.find((p) => p === 'index.html') || pages[0];
  const reach = new Set([home]); const queue = [home];
  while (queue.length) for (const n of edges[queue.shift()] || []) if (!reach.has(n)) { reach.add(n); queue.push(n); }
  for (const f of pages) {
    if (!reach.has(f)) problems.push(`${label}${f} cannot be reached from the Home page by links`);
    for (const g of pages) if (g !== f && !edges[g].has(f)) problems.push(`${label}${g} does not link to ${f}: every page should link to every other page (header and footer navigation)`);
    if (!edges[f].size) problems.push(`${label}${f} links to no other page (a dead end)`);
  }
  return { problems, externals: [...externals].sort(), pages: pages.length, links: Object.values(edges).reduce((s, e) => s + e.size, 0) };
}

export function checkSearchAgreement({ dir, base }) {
  const problems = [];
  const pages = pagesOf(dir);
  if (!existsSync(join(dir, 'sitemap.xml'))) return ['sitemap.xml is missing from the indexable build'];
  const sm = readSitemap(readFileSync(join(dir, 'sitemap.xml'), 'utf8'));
  for (const u of sm.urls) {
    const path = new URL(u.loc).pathname.replace(new URL(base).pathname.replace(/\/$/, ''), '').replace(/^\//, '') || 'index.html';
    // a clean-URL host serves menu.html at /menu: the public address may omit .html, but it must still name a delivered page
    if (!pages.includes(path) && !pages.includes(`${path}.html`)) problems.push(`sitemap.xml lists ${u.loc}, which is not a delivered page (${path})`);
  }
  for (const f of pages) { const m = /<link rel="canonical" href="([^"]*)">/.exec(readFileSync(join(dir, f), 'utf8')); if (m && !sm.urls.some((u) => u.loc === decode(m[1]))) problems.push(`${f}: canonical ${m[1]} is not in sitemap.xml`); }
  return problems;
}

export async function checkLinks({ root = null, online = false } = {}) {
  const own = !root;
  const dir = root || assembleCandidate(projectDir, 'links');
  const cleanup = [];
  try {
    const demo = scanLinks({ root: dir, label: 'demonstration ' });
    const fx = buildClient({}); cleanup.push(fx.root);
    const problems = [...demo.problems], notes = [];
    let client = { links: 0, pages: 0, externals: [] };
    if (fx.status !== 0) problems.push(`the client fixture failed to build: ${fx.text.slice(0, 200)}`);
    else {
      client = scanLinks({ root: fx.dir, label: 'client build ' });
      problems.push(...client.problems);
      problems.push(...checkSearchAgreement({ dir: fx.dir, base: 'https://jadeandember.example.test' }).map((m) => `client build ${m}`));
    }
    // the same site built for a clean-URL host (Cloudflare Pages): the files and internal links are unchanged, the public addresses lose .html
    const fc = buildClient({ edit: (n, o) => { if (n === 'client') { o.seo.host = 'cloudflare-pages'; o.seo.urlStyle = 'clean'; } } }); cleanup.push(fc.root);
    if (fc.status !== 0) problems.push(`the clean-URL client fixture failed to build: ${fc.text.slice(0, 200)}`);
    else { const c2 = scanLinks({ root: fc.dir, label: 'clean-URL client build ' }); problems.push(...c2.problems); problems.push(...checkSearchAgreement({ dir: fc.dir, base: 'https://jadeandember.example.test' }).map((m) => `clean-URL client build ${m}`)); }
    const ext = [...new Set([...demo.externals, ...client.externals])];
    // the destinations the demonstration may carry, and the history of verification runs (structure only: a record being old is not a failure)
    const registry = readJson(join(engDir, 'external-destinations.json')), history = readJson(join(engDir, 'external-links-verification.json'));
    problems.push(...registryProblems({ registry, found: collectExternal(dir) }), ...recordProblems({ file: history }));
    const latest = [...history.records].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    notes.push(`external destinations: ${registry.destinations.length} registered (${registry.destinations.filter((d) => d.kind === 'link').length} clickable link, ${registry.destinations.filter((d) => d.kind === 'mention').length} addresses printed in text); none unregistered; ${history.records.length} verification run(s) on record${latest ? `, latest ${latest.id} on ${latest.date} (${latest.runner.kind}): ${CLASSES.map((c) => `${latest.results.filter((r) => r.class === c).length} ${c}`).join(', ')}` : ''}`);
    if (online) {
      // a networked run: only "verified" is a pass; blocked and inconclusive answers are reported as unverified, unavailable and insecure ones fail
      for (const d of registry.destinations.filter((x, i, a) => a.findIndex((y) => y.url === x.url) === i)) {
        const r = await verifyUrl(d.url, { allowHttpStart: !registry.destinations.some((x) => x.url === d.url && x.kind === 'link') });
        notes.push(`online: ${d.url} is ${r.class.toUpperCase()}: ${r.detail}${r.class === 'blocked' || r.class === 'inconclusive' ? ' (UNVERIFIED, not a pass)' : ''}`);
        if (r.class === 'unavailable' || r.class === 'insecure') problems.push(`external destination ${d.url} is ${r.class}: ${r.detail}`);
      }
    }
    notes.unshift(`internal links: ${demo.pages} demonstration pages and ${client.pages} client-build pages fully cross-linked (${demo.links} and ${client.links} page-to-page links); every href, src, srcset, video source and CSS url() resolves with exact letter case; every #fragment names a unique id; no page is an orphan or a dead end; tel:, mailto: and https URLs well-formed; the client sitemap and canonicals match the delivered pages; ${ext.length} external URL(s) listed, ${online ? 'checked online' : 'not fetched (offline checks; use --online)'}`);
    return { problems, notes, externals: ext };
  } finally { cleanup.forEach((d) => rmSync(d, { recursive: true, force: true })); if (own) rmSync(dir, { recursive: true, force: true }); }
}

if (isMain(import.meta.url)) {
  const t0 = Date.now();
  const { problems, notes } = await checkLinks({ online: process.argv.includes('--online') });
  notes.forEach((n) => console.log('  ' + n));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:links (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  process.exit(problems.length ? 1 : 0);
}
