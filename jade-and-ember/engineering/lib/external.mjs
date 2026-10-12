// External destinations (Gate 5 Phase 5, APR-JE-033). Three separate things, kept apart on purpose:
//   collect    every external URL in the delivered files, with where it is and what it is (a clickable link, a mention in plain text, or an
//              identifier such as an XML namespace that nobody fetches)
//   registry   engineering/external-destinations.json: the destinations the demonstration is allowed to carry. A new or removed one is a finding.
//   verify     what a network said about each destination on a given day, classified honestly: a blocked, unavailable or inconclusive answer is
//              NEVER recorded as a pass. The verifier can run anywhere; only the result of a run that had a network means anything.
// Nothing here is called by the browser or by the site: it is development tooling.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

export const CLASSES = ['verified', 'blocked', 'unavailable', 'inconclusive', 'insecure'];
export const CLASS_MEANING = {
  verified: 'the final response was 2xx, every hop was https, the certificate was valid',
  blocked: 'the site refused an automated request (401, 403, 429, 999); this says nothing about whether the page exists, so it is not a pass',
  unavailable: 'the final response was an error (404, 410, other 4xx, 5xx after one retry) or the redirects never ended',
  inconclusive: 'the network could not tell: DNS failure, refused or filtered connection, timeout; the environment, not the destination, may be at fault',
  insecure: 'a hop used http, or the certificate was invalid',
};
const IDENTIFIERS = new Set(['http://www.w3.org/2000/svg', 'http://www.w3.org/1999/xlink', 'http://www.w3.org/1999/xhtml', 'http://www.sitemaps.org/schemas/sitemap/0.9', 'https://schema.org', 'http://schema.org', 'https://schema.org/', 'http://schema.org/']);
const TEXT_EXT = /\.(html|css|js|mjs|txt|md|xml|json|webmanifest|svg)$/i;
const URL_RE = /\bhttps?:\/\/[^\s"'<>`\\)\]}]+/gi;
const decode = (s) => s.replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);?/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
const PROTO_REL = /(?<![:\w/])\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s"'<>`\\)\]}]*)?/gi;   // //host/path (the page's own protocol)
const trimEnd = (u) => u.replace(/[.,;:!?]+$/, '');

function walk(dir) { const out = []; for (const e of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isDirectory()) out.push(...walk(p)); else out.push(p); } return out; }

// -> [{ url, file, line, kind }] kind: 'link' (a URL inside a markup tag, in any attribute and in any form: quoted, unquoted, split over lines, srcset, formaction, a
// meta refresh, protocol-relative, entity-encoded; or a CSS url() / @import), 'mention' (plain text, script text, JSON-LD), 'identifier' (a namespace or schema address).
// A URL inside a tag is a link because a browser may fetch or follow it; only text is a mention (G6-3 review, F4).
export function collectExternal(root) {
  const found = [];
  for (const path of walk(root).sort()) {
    const file = relative(root, path).split('\\').join('/');
    if (!TEXT_EXT.test(file)) continue;
    const text = readFileSync(path, 'utf8');
    const starts = [0]; for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
    const lineAt = (i) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= i) lo = mid; else hi = mid - 1; } return lo + 1; };
    const spans = [];   // [start, end) ranges already classified as links
    if (/\.html$/i.test(file)) {
      for (const m of text.matchAll(/<[a-zA-Z][^>]*>/g)) {
        spans.push([m.index, m.index + m[0].length]);
        const tag = decode(m[0]);
        for (const u of tag.matchAll(URL_RE)) found.push({ url: u[0], file, line: lineAt(m.index), kind: IDENTIFIERS.has(u[0]) ? 'identifier' : 'link' });
        for (const u of tag.matchAll(PROTO_REL)) found.push({ url: `https:${u[0]}`, file, line: lineAt(m.index), kind: 'link' });
      }
    } else if (/\.css$/i.test(file)) {
      for (const m of text.matchAll(/(?:url\(\s*|@import\s+)["']?(https?:\/\/[^"')\s]+|\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+[^"')\s]*)/gi)) {
        spans.push([m.index, m.index + m[0].length]);
        found.push({ url: m[1].startsWith('//') ? `https:${m[1]}` : m[1], file, line: lineAt(m.index), kind: 'link' });
      }
    }
    // everything else is text: a mention
    for (const m of text.matchAll(URL_RE)) {
      const at = m.index;
      if (spans.some(([a, z]) => at >= a && at < z)) continue;
      const u = trimEnd(decode(m[0]));
      found.push({ url: u, file, line: lineAt(at), kind: IDENTIFIERS.has(u) ? 'identifier' : 'mention' });
    }
  }
  return found;
}

// Group by (url, kind): { url, kind, files: [..], count }
export function groupDestinations(found) {
  const map = new Map();
  for (const f of found) {
    if (f.kind === 'identifier') continue;
    const k = `${f.kind} ${f.url}`;
    const e = map.get(k) || { url: f.url, kind: f.kind, files: new Set(), count: 0 };
    e.files.add(f.file); e.count++; map.set(k, e);
  }
  return [...map.values()].map((e) => ({ ...e, files: [...e.files].sort() })).sort((a, b) => (a.url < b.url ? -1 : 1));
}

export const registryDigest = (registry) => createHash('sha256').update(JSON.stringify((registry.destinations || []).map((d) => [d.kind, d.url]).sort())).digest('hex');

// The registry against what the delivered files contain. Returns readable problems.
export function registryProblems({ registry, found }) {
  const p = [];
  if (!registry || !Array.isArray(registry.destinations)) return ['external-destinations.json has no destinations list'];
  const seen = new Set();
  for (const d of registry.destinations) {
    const w = `external destination ${d && d.id}`;
    if (!d || !/^EXT-\d{2,}$/.test(d.id || '')) { p.push(`${w}: id must look like EXT-01`); continue; }
    if (seen.has(d.id)) p.push(`${w}: listed twice`);
    seen.add(d.id);
    if (!['link', 'mention'].includes(d.kind)) p.push(`${w}: kind must be "link" or "mention"`);
    let u; try { u = new URL(d.url); } catch { u = null; }
    if (!u) p.push(`${w}: ${JSON.stringify(d.url)} is not a URL`);
    else if (d.kind === 'link' && u.protocol !== 'https:') p.push(`${w}: a clickable link must be https (${d.url})`);
    if (typeof d.purpose !== 'string' || d.purpose.trim().length < 10) p.push(`${w}: purpose must say why the destination is there`);
    if (!Array.isArray(d.files) || !d.files.length) p.push(`${w}: files must list where it appears`);
  }
  const have = new Map(groupDestinations(found).map((g) => [`${g.kind} ${g.url}`, g]));
  const want = new Map(registry.destinations.map((d) => [`${d.kind} ${d.url}`, d]));
  for (const [k, g] of have) {
    const d = want.get(k);
    if (!d) { p.push(`${g.kind === 'link' ? 'external link' : 'external address in text'} ${g.url} (${g.files.join(', ')}) is not in the destination registry: a new destination needs a recorded decision`); continue; }
    if (JSON.stringify([...d.files].sort()) !== JSON.stringify(g.files)) p.push(`${g.url}: the registry lists ${[...d.files].sort().join(', ')} but it appears in ${g.files.join(', ')}`);
  }
  for (const [k, d] of want) if (!have.has(k)) p.push(`${d.id} (${d.url}) is in the registry but no longer appears in the delivered files: remove it or restore the destination`);
  return p;
}

// ---- verification
const UA = 'STS-link-check/1.0 (engineering verification of a static website; one request per address; contact: Simplified Tech Solutions)';
const CERT_CODES = /^(CERT_|DEPTH_ZERO|UNABLE_TO_|SELF_SIGNED|ERR_TLS_CERT|ERR_SSL|HOSTNAME_MISMATCH)/;
const errCode = (e) => String(e?.cause?.code || e?.code || e?.cause?.name || e?.name || 'ERROR');

export function classifyStatus(status) {
  if (status >= 200 && status < 300) return 'verified';
  if ([401, 403, 429, 999].includes(status)) return 'blocked';
  return 'unavailable';
}

// One attempt: follow redirects by hand (HEAD first, GET when a server will not answer HEAD), record every hop.
export async function attempt(url, { fetchImpl = fetch, timeoutMs = 15000, maxHops = 5, allowHttpStart = false } = {}) {
  const chain = [];
  let cur = url, method = 'HEAD', hops = 0;
  try {
    for (;;) {
      if (new URL(cur).protocol !== 'https:' && !(allowHttpStart && chain.length === 0)) return { class: 'insecure', chain, finalUrl: cur, finalStatus: chain.at(-1)?.status ?? null, detail: `the address ${cur} is not https` };
      const res = await fetchImpl(cur, { method, redirect: 'manual', headers: { 'user-agent': UA, accept: '*/*' }, signal: AbortSignal.timeout(timeoutMs) });
      const status = res.status;
      try { await res.body?.cancel(); } catch { /* nothing to release */ }
      chain.push({ url: cur, status, method });
      if (status >= 300 && status < 400 && res.headers.get('location')) {
        if (++hops > maxHops) return { class: 'unavailable', chain, finalUrl: cur, finalStatus: status, detail: `more than ${maxHops} redirects` };
        cur = new URL(res.headers.get('location'), cur).href; method = 'HEAD'; continue;
      }
      if (method === 'HEAD' && [400, 403, 404, 405, 501].includes(status)) { method = 'GET'; continue; }
      const cls = status >= 300 && status < 400 ? 'unavailable' : classifyStatus(status);
      const host = (u) => new URL(u).host;
      if (cls === 'verified' && new URL(cur).protocol !== 'https:') return { class: 'insecure', chain, finalUrl: cur, finalStatus: status, detail: 'the address is printed as http and the destination does not upgrade it to https' };
      const detail = cls === 'verified' ? (chain.length > 1 ? `redirected ${chain.length - 1} time(s) to ${cur}${host(url) !== host(cur) ? ' (a different host)' : ''}` : 'answered directly') : `final status ${status}`;
      return { class: cls, chain, finalUrl: cur, finalStatus: status, detail };
    }
  } catch (e) {
    const code = errCode(e);
    if (CERT_CODES.test(code)) return { class: 'insecure', chain, finalUrl: cur, finalStatus: null, detail: `certificate problem (${code})` };
    return { class: 'inconclusive', chain, finalUrl: cur, finalStatus: null, detail: `no answer (${code})` };
  }
}

// Up to `retries` more attempts for an inconclusive or server-error answer; blocked, verified and insecure are final.
export async function verifyUrl(url, opts = {}) {
  const { retries = 1, delayMs = 2000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = opts;
  let r, n = 0;
  for (;;) {
    n++;
    r = await attempt(url, opts);
    const retry = r.class === 'inconclusive' || (r.class === 'unavailable' && r.finalStatus >= 500);
    if (!retry || n > retries) break;
    await sleep(delayMs);
  }
  return { url, ...r, attempts: n };
}

// ---- the verification record (engineering/external-links-verification.json): history of runs, append only
export function recordProblems({ file, today = new Date().toISOString().slice(0, 10) }) {
  const p = [];
  if (!file || !Array.isArray(file.records)) return ['external-links-verification.json has no records list'];
  const ids = new Set();
  for (const r of file.records) {
    const w = `verification record ${r && r.id}`;
    if (!r || !/^EXTV-\d+$/.test(r.id || '')) { p.push(`${w}: id must look like EXTV-1`); continue; }
    if (ids.has(r.id)) p.push(`${w}: listed twice`);
    ids.add(r.id);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date || '') || Number.isNaN(Date.parse(r.date))) p.push(`${w}: date must be a date such as 2026-10-11`);
    else if (r.date > today) p.push(`${w}: date ${r.date} is in the future`);
    if (!r.runner || !['sandbox', 'github-actions', 'person'].includes(r.runner.kind)) p.push(`${w}: runner.kind must be sandbox, github-actions or person`);
    if (!r.runner || typeof r.runner.description !== 'string' || r.runner.description.trim().length < 10) p.push(`${w}: runner.description must say where the run happened and whether it had a network`);
    if (!/^[0-9a-f]{64}$/.test(r.registryDigest || '')) p.push(`${w}: registryDigest must be the 64-hex digest of the destination list that was checked`);
    if (!Array.isArray(r.results) || !r.results.length) { p.push(`${w}: no results`); continue; }
    const seenUrls = new Set();
    for (const x of r.results) {
      const wx = `${w}, ${x && x.url}`;
      if (x && typeof x.url === 'string') { if (seenUrls.has(x.url)) p.push(`${wx}: listed twice`); seenUrls.add(x.url); }
      if (!x || typeof x.url !== 'string') { p.push(`${w}: a result has no url`); continue; }
      if (!CLASSES.includes(x.class)) { p.push(`${wx}: class "${x.class}" is not one of ${CLASSES.join(', ')}`); continue; }
      const chain = Array.isArray(x.chain) ? x.chain : [];
      if (chain.some((h) => !h || typeof h.url !== 'string' || !Number.isInteger(h.status))) { p.push(`${wx}: every hop needs a url and a status`); continue; }
      if (chain.length && x.finalUrl !== chain[chain.length - 1].url) p.push(`${wx}: finalUrl is not the last hop`);
      if (x.class === 'verified') {
        if (!(x.finalStatus >= 200 && x.finalStatus < 300)) p.push(`${wx}: "verified" needs a 2xx final status (got ${x.finalStatus})`);
        if (chain.some((h, i) => !/^https:/.test(h.url) && !(i === 0 && x.kind === 'mention'))) p.push(`${wx}: "verified" with an http hop`);
        if (!chain.length) p.push(`${wx}: "verified" with no recorded hops`);
      }
      if (x.class === 'blocked' && ![401, 403, 429, 999].includes(x.finalStatus)) p.push(`${wx}: "blocked" needs a 401, 403, 429 or 999 final status (got ${x.finalStatus})`);
      if (x.class === 'inconclusive' && x.finalStatus !== null && x.finalStatus !== undefined) p.push(`${wx}: "inconclusive" means there was no answer, yet a status is recorded`);
      if (x.class === 'insecure' && !chain.some((h) => !/^https:/.test(h.url)) && !/certificate|not https/.test(x.detail || '')) p.push(`${wx}: "insecure" must say why (an http hop or a certificate problem)`);
      if (typeof x.detail !== 'string' || !x.detail.trim()) p.push(`${wx}: detail is missing`);
    }
    // a run with no network can only be inconclusive; a record that shows it as anything else is not trustworthy
    if (r.runner && r.runner.kind === 'sandbox' && r.results.some((x) => x.class !== 'inconclusive' && !(x.chain || []).length)) p.push(`${w}: a sandbox run reports results without any recorded request`);
  }
  return p;
}

// What the latest record says about a registry (used by reports and by the proposed release requirement): per registered link, the class from the
// newest record that covers the current destination list.
export function latestFor(file, registry) {
  const digest = registryDigest(registry);
  const covering = (file.records || []).filter((r) => r.registryDigest === digest).sort((a, b) => (a.date < b.date ? 1 : -1));
  return { digest, current: covering[0] || null, newest: [...(file.records || [])].sort((a, b) => (a.date < b.date ? 1 : -1))[0] || null };
}
