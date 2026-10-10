// Validators for the search and AI-discovery artifacts of an indexable client build (STS Search and AI Discovery Readiness standard):
// page metadata, llms.txt, the robots.txt crawler policy, factual consistency across the pages, the structured data and llms.txt, URL hygiene
// (no foreign, staging or example hosts, no internal paths or secrets), and the final public URL on each kind of host.
// Everything returns readable problems; nothing here writes. They test TECHNICAL readiness, not rankings, citations or inclusion anywhere.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CRAWLERS, KNOWN_AGENTS, blockedAgents, policyOf } from '../../src/lib/crawlers.mjs';
import { addressText, baseOf, isReservedHost, publicUrl, urlStyleOf } from '../../src/lib/seo.mjs';
import { serveSite } from './server.mjs';

export const RIGHTS_CLAIM = /\b(royalty[- ]free|fully licen[cs]ed|licen[cs]ed (for|to|under)|rights[- ]cleared|copyright[- ]cleared|commercially (cleared|licen[cs]ed)|all rights (granted|reserved by us))\b/i;
const DEMO_WORDING = /\b(fictional|sample|lorem|placeholder|example street|demonstration)\b/i;
const INTERNAL = /(localhost|127\.0\.0\.1|file:\/\/|node_modules|\/home\/|\/Users\/|\b[A-Z]:\\|engineering\/|\.env\b|api[_-]?key|secret|password|bearer\s|\btoken\b|BEGIN [A-Z ]*PRIVATE)/i;

const decodeEntities = (s) => s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');
export const pageText = (html) => decodeEntities(html.replace(/<head[\s\S]*?<\/head>/i, ' ').replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const metaContent = (html, re) => [...html.matchAll(re)].map((m) => decodeEntities(m[1]));
export function pageMeta(html) {
  return {
    titles: metaContent(html, /<title>([^<]*)<\/title>/g),
    descriptions: metaContent(html, /<meta name="description" content="([^"]*)">/g),
    ogTitle: metaContent(html, /<meta property="og:title" content="([^"]*)">/g),
    ogDescription: metaContent(html, /<meta property="og:description" content="([^"]*)">/g),
    ogUrl: metaContent(html, /<meta property="og:url" content="([^"]*)">/g),
    canonical: metaContent(html, /<link rel="canonical" href="([^"]*)">/g),
  };
}

// ---- page metadata: present, single, unique, sensible length, og matches, og:url is the canonical (indexable) or absent (demonstration)
export function metadataProblems({ pagesHtml, cfg, indexable }) {
  const p = [], seenT = new Map(), seenD = new Map();
  for (const page of cfg.pages) {
    const m = pageMeta(pagesHtml[page.file]), f = page.file;
    if (m.titles.length !== 1) p.push(`${f}: expected one <title>, found ${m.titles.length}`);
    if (m.descriptions.length !== 1) p.push(`${f}: expected one meta description, found ${m.descriptions.length}`);
    const t = m.titles[0] || '', d = m.descriptions[0] || '';
    if (!t.trim()) p.push(`${f}: the title is empty`); else if (t.length > 120) p.push(`${f}: the title is ${t.length} characters (limit 120)`);
    if (!d.trim()) p.push(`${f}: the meta description is empty`); else if (d.length < 30 || d.length > 320) p.push(`${f}: the meta description is ${d.length} characters (30 to 320)`);
    if (t && seenT.has(t)) p.push(`${f}: the title "${t}" is also the title of ${seenT.get(t)} (titles must be unique per page)`); else if (t) seenT.set(t, f);
    if (d && seenD.has(d)) p.push(`${f}: the meta description is identical to that of ${seenD.get(d)} (descriptions must be unique per page)`); else if (d) seenD.set(d, f);
    if (m.ogTitle[0] !== t) p.push(`${f}: og:title differs from the title`);
    if (m.ogDescription[0] !== d) p.push(`${f}: og:description differs from the meta description`);
    if (indexable) {
      if (m.ogUrl.length !== 1) p.push(`${f}: expected one og:url, found ${m.ogUrl.length}`);
      else if (m.ogUrl[0] !== publicUrl(cfg, page)) p.push(`${f}: og:url ${m.ogUrl[0]} is not the page's public URL ${publicUrl(cfg, page)}`);
      if (m.canonical.length === 1 && m.ogUrl[0] && m.ogUrl[0] !== m.canonical[0]) p.push(`${f}: og:url and canonical differ`);
    } else if (m.ogUrl.length) p.push(`${f}: a noindex build must not carry og:url (it would publish a canonical address)`);
  }
  return p;
}

// ---- llms.txt
// llms.txt escapes [ ] and \ in free text so it can never form a link; the validators compare the unescaped text.
const unmd = (s) => String(s).replace(/\\([\[\]\\])/g, '$1');
export function readLlms(text) {
  const errors = [];
  if (text.charCodeAt(0) === 0xfeff) errors.push('starts with a byte-order mark');
  if (/\r/.test(text)) errors.push('contains carriage returns (use LF)');
  if (!text.endsWith('\n') || text.endsWith('\n\n')) errors.push('must end with exactly one newline');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) errors.push('contains control characters');
  if (text.includes('�')) errors.push('contains the replacement character (broken encoding)');
  const lines = text.replace(/\n$/, '').split('\n');
  const title = unmd(/^# (\S.*)$/.exec(lines[0] || '')?.[1] ?? '') || undefined;
  if (!title) errors.push('the first line must be "# Name"');
  if (lines[1] !== '') errors.push('the title must be followed by a blank line');
  const summary = unmd(/^> (\S.*)$/.exec(lines[2] || '')?.[1] ?? '') || undefined;
  if (!summary) errors.push('the summary must be a "> " line after the title');
  const sections = {}; let cur = null;
  lines.forEach((l, i) => {
    const h = /^## (\S.*)$/.exec(l);
    if (h) { cur = h[1]; if (sections[cur]) errors.push(`section "${cur}" appears twice`); sections[cur] = []; }
    else if (/^#{1,6} /.test(l) && i > 0) errors.push(`line ${i + 1}: only "## " section headings are used`);
    else if (cur && l !== '') sections[cur].push(l);
  });
  const links = [...text.matchAll(/\[((?:\\.|[^\]\\])+)\]\(([^)\s]*)\)/g)].map((m) => ({ text: m[1].replace(/\\(.)/g, '$1'), url: m[2] }));
  const urls = [...text.matchAll(/https?:\/\/[^\s)>\]]+/g)].map((m) => m[0]);
  return { title, summary, sections, links, urls, errors };
}

export function llmsProblems({ text, cfg, pagesHtml, sitemapUrls }) {
  const p = [], r = readLlms(text), { client, copy } = cfg, base = baseOf(cfg);
  r.errors.forEach((m) => p.push(`llms.txt: ${m}`));
  if (r.title !== client.brand.name) p.push(`llms.txt: the title "${r.title}" is not the business name "${client.brand.name}"`);
  const wantSummary = (client.seo.llms?.summary || copy.home.meta.description).replace(/\s+/g, ' ').trim();
  if (r.summary !== wantSummary) p.push('llms.txt: the summary is not the configured summary or the Home meta description');
  for (const s of ['Pages', 'Visit and contact']) if (!r.sections[s]) p.push(`llms.txt: the "${s}" section is missing`);
  const pageLines = r.sections.Pages || [];
  const want = cfg.pages.map((pg) => ({ pg, url: publicUrl(cfg, pg) }));
  for (const { pg, url } of want) {
    const line = pageLines.find((l) => l.includes(`](${url})`));
    if (!line) { p.push(`llms.txt: no link to ${pg.file} (${url}); every page must be listed`); continue; }
    const m = /^- \[((?:\\.|[^\]\\])+)\]\(([^)\s]+)\): (.+)$/.exec(line);
    if (!m) { p.push(`llms.txt: the line for ${pg.file} is not "- [name](url): description"`); continue; }
    if (m[1].replace(/\\(.)/g, '$1') !== pg.nav) p.push(`llms.txt: the link text for ${pg.file} is "${m[1]}", the page is called "${pg.nav}"`);
    const meta = pageMeta(pagesHtml[pg.file]).descriptions[0];
    if (unmd(m[3]) !== meta) p.push(`llms.txt: the description for ${pg.file} differs from the page's meta description`);
    if (sitemapUrls && !sitemapUrls.includes(url)) p.push(`llms.txt: ${url} is not in sitemap.xml`);
  }
  for (const l of r.links) if (!want.some((w) => w.url === l.url)) p.push(`llms.txt: the link ${l.url} is not one of the site's page URLs`);
  if (pageLines.length !== want.length) p.push(`llms.txt: the Pages section has ${pageLines.length} lines for ${want.length} pages`);
  // hosts: this site's host, and the ordering address as plain text
  const allowedHosts = new Set([new URL(base).host]);
  if (client.ordering.url) allowedHosts.add(new URL(client.ordering.url).host);
  for (const u of r.urls) { let h; try { h = new URL(u).host; } catch { p.push(`llms.txt: ${u} is not a valid URL`); continue; } if (!u.startsWith('https://')) p.push(`llms.txt: ${u} is not https`); if (!allowedHosts.has(h)) p.push(`llms.txt: ${u} points at ${h}, which is neither this site nor its configured ordering page`); }
  if (INTERNAL.test(text)) p.push(`llms.txt: contains an internal path, local address or secret-like word (${INTERNAL.exec(text)[0]})`);
  if (DEMO_WORDING.test(text)) p.push(`llms.txt: contains demonstration or placeholder wording ("${DEMO_WORDING.exec(text)[0]}")`);
  if (RIGHTS_CLAIM.test(text)) p.push('llms.txt: wording that claims media rights');
  // facts, checked against what the pages print (not against the generator)
  const visit = cfg.pages.find((x) => x.id === 'visit'), vt = pageText(pagesHtml[visit.file]);
  const fact = (name) => { const ls = (r.sections['Visit and contact'] || []).filter((l) => l.startsWith(`- ${name}: `)); return ls.length === 1 ? unmd(ls[0].slice(name.length + 4)) : (ls.length ? (p.push(`llms.txt: "${name}" appears ${ls.length} times`), null) : null); };
  const addr = fact('Address'); if (addr === null) p.push('llms.txt: no Address line'); else { if (addr !== addressText(client)) p.push(`llms.txt: the address "${addr}" differs from the configured address "${addressText(client)}"`); for (const l of client.address.lines) if (!vt.includes(l)) p.push(`llms.txt: the address line "${l}" is not printed on the Visit page`); }
  const ph = fact('Phone'); if (ph === null) p.push('llms.txt: no Phone line'); else { const e164 = client.contact.phone.href.replace(/^tel:/, ''); if (ph !== `${client.contact.phone.display} (${e164})`) p.push(`llms.txt: the phone "${ph}" differs from the configured number`); if (!vt.includes(client.contact.phone.display)) p.push('llms.txt: the phone number is not printed on the Visit page'); }
  const hrs = fact('Opening hours'); if (hrs === null) p.push('llms.txt: no Opening hours line'); else { const wantH = client.hours.rows.map((x) => `${x.days}: ${x.time}`).join('; '); if (hrs !== wantH) p.push(`llms.txt: the opening hours "${hrs}" differ from the configured hours`); for (const row of client.hours.rows) if (!vt.includes(row.days) || !vt.includes(row.time)) p.push(`llms.txt: the hours row "${row.days}: ${row.time}" is not printed on the Visit page`); }
  const ord = fact('Order online'); if (client.ordering.url ? ord !== client.ordering.url : ord !== null) p.push(`llms.txt: the ordering line ${ord === null ? 'is missing' : `"${ord}" differs`} (configured: ${client.ordering.url || 'none'})`);
  // every other fact line must be one the configuration supports: nothing is invented
  const KNOWN_FACTS = ['Address', 'Phone', 'Email', 'Opening hours', 'Order online', 'Cuisine', 'Price range'];
  for (const l of r.sections['Visit and contact'] || []) { const m = /^- ([^:]+): /.exec(l); if (!m || !KNOWN_FACTS.includes(m[1])) p.push(`llms.txt: the line "${l.slice(0, 60)}" is not a fact the configuration supports`); }
  const em = fact('Email'); if (client.contact.email ? em !== client.contact.email : em !== null) p.push(`llms.txt: the email line ${em === null ? 'is missing' : `"${em}" differs`} (configured: ${client.contact.email || 'none'})`);
  const biz = client.seo.business;
  const cu = fact('Cuisine'); if (biz ? cu !== biz.servesCuisine.join(', ') : cu !== null) p.push(`llms.txt: the cuisine "${cu}" differs from seo.business.servesCuisine`);
  const pr = fact('Price range'); if (biz ? pr !== biz.priceRange : pr !== null) p.push(`llms.txt: the price range "${pr}" differs from seo.business.priceRange`);
  return p;
}

// ---- robots.txt: groups, and the crawler policy
export function readRobotsGroups(text) {
  const groups = [], sitemaps = [], errors = []; let cur = null, ruleSeen = false;
  text.split('\n').forEach((raw, i) => {
    const l = raw.trim(); if (!l || l.startsWith('#')) return;
    const m = /^([A-Za-z-]+):\s*(.*)$/.exec(l);
    if (!m) { errors.push(`line ${i + 1} is not a directive: ${l.slice(0, 40)}`); return; }
    const k = m[1].toLowerCase(), v = m[2];
    if (k === 'user-agent') { if (!cur || ruleSeen) { cur = { agents: [], rules: [] }; groups.push(cur); ruleSeen = false; } cur.agents.push(v); }
    else if (k === 'allow' || k === 'disallow') { if (!cur) { errors.push(`line ${i + 1}: a rule before any User-agent`); return; } cur.rules.push([k, v]); ruleSeen = true; }
    else if (k === 'sitemap') sitemaps.push(v);
    else errors.push(`line ${i + 1}: unknown directive ${m[1]}`);
  });
  return { groups, sitemaps, errors };
}

export function robotsProblems({ text, cfg }) {
  const p = [], r = readRobotsGroups(text), policy = policyOf(cfg.client.seo), base = baseOf(cfg);
  r.errors.forEach((m) => p.push(`robots.txt: ${m}`));
  const star = r.groups[0];
  if (!star || star.agents.join() !== '*') p.push('robots.txt: the first group must be "User-agent: *"');
  else {
    if (star.rules.some(([k, v]) => k === 'disallow' && (v === '/' || v === ''))) { if (star.rules.some(([k, v]) => k === 'disallow' && v === '/')) p.push('robots.txt: the "*" group disallows the whole site'); }
    if (!star.rules.some(([k, v]) => k === 'allow' && v === '/')) p.push('robots.txt: the "*" group must allow crawling ("Allow: /")');
  }
  if (r.sitemaps.length !== 1 || r.sitemaps[0] !== `${base}/sitemap.xml`) p.push(`robots.txt: must name exactly one sitemap, ${base}/sitemap.xml (found ${r.sitemaps.join(', ') || 'none'})`);
  // the crawler policy
  const got = new Set(), want = new Set(blockedAgents(policy));
  for (const g of r.groups.slice(1)) {
    if (!g.rules.length || g.rules.some(([k, v]) => k !== 'disallow' || v !== '/')) p.push(`robots.txt: the group for ${g.agents.join(', ')} must be exactly "Disallow: /"`);
    for (const a of g.agents) { if (!KNOWN_AGENTS.includes(a)) p.push(`robots.txt: ${a} is not in the reviewed crawler list (src/lib/crawlers.mjs)`); if (got.has(a)) p.push(`robots.txt: ${a} appears twice`); got.add(a); }
  }
  for (const a of want) if (!got.has(a)) p.push(`robots.txt: the policy disallows ${a}'s class but ${a} is not blocked`);
  for (const a of got) if (!want.has(a)) p.push(`robots.txt: ${a} is blocked but its class is allowed by the policy`);
  if (!want.size && text !== `User-agent: *\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n`) p.push('robots.txt: with every class allowed the file must be the plain allow file');
  return p;
}

// ---- factual consistency: the pages, the structured data and llms.txt say the same thing
export function factsProblems({ cfg, pagesHtml, jsonLd }) {
  const p = [], { client, copy } = cfg;
  const visit = cfg.pages.find((x) => x.id === 'visit'), vt = pageText(pagesHtml[visit.file]);
  for (const l of client.address.lines) if (!vt.includes(l)) p.push(`the address line "${l}" is not printed on the Visit page`);
  if (!vt.includes(client.contact.phone.display)) p.push(`the phone number ${client.contact.phone.display} is not printed on the Visit page`);
  for (const row of client.hours.rows) if (!vt.includes(row.days) || !vt.includes(row.time)) p.push(`the hours row "${row.days}: ${row.time}" is not printed on the Visit page`);
  for (const page of cfg.pages) {
    for (const m of pagesHtml[page.file].matchAll(/href="(tel:[^"]*)"/g)) if (m[1] !== client.contact.phone.href) p.push(`${page.file}: a phone link ${m[1]} differs from the configured ${client.contact.phone.href}`);
    for (const m of pagesHtml[page.file].matchAll(/href="mailto:([^"]*)"/g)) if (m[1] !== client.contact.email) p.push(`${page.file}: an email link ${m[1]} differs from the configured address ${client.contact.email}`);
  }
  if (jsonLd) {
    const a = jsonLd.address || {};
    for (const k of ['streetAddress', 'addressLocality', 'postalCode']) if (a[k] && !vt.toLowerCase().includes(String(a[k]).toLowerCase())) p.push(`the structured data's ${k} "${a[k]}" is not printed on the Visit page`);
    const tels = [...pagesHtml[visit.file].matchAll(/href="tel:([^"]*)"/g)].map((m) => m[1]);
    if (tels.length && !tels.includes(jsonLd.telephone)) p.push(`the structured data's telephone ${jsonLd.telephone} is not a phone link on the Visit page`);
    if (jsonLd.name !== client.brand.name) p.push('the structured data names a different business than the pages');
    const home = pageMeta(pagesHtml[cfg.pages.find((x) => x.id === 'home').file]).descriptions[0];
    if (jsonLd.description !== home) p.push("the structured data's description differs from the Home meta description");
    if (jsonLd.description !== copy.home.meta.description) p.push("the structured data's description differs from copy.home.meta.description");
  }
  return p;
}

// ---- URL hygiene across the generated artifacts
export function hostProblems({ cfg, sitemapUrls, jsonLd, llmsUrls = [], pagesHtml }) {
  const p = [], base = new URL(baseOf(cfg)), { client } = cfg;
  const own = (u, where) => { let h; try { h = new URL(u); } catch { p.push(`${where}: ${u} is not a valid URL`); return; } if (h.host !== base.host) p.push(`${where}: ${u} is not on this site's host ${base.host}`); };
  sitemapUrls.forEach((u) => own(u, 'sitemap.xml'));
  for (const page of cfg.pages) { const m = pageMeta(pagesHtml[page.file]); [...m.canonical, ...m.ogUrl].forEach((u) => own(u, `${page.file} canonical/og:url`)); }
  const allowed = new Set([base.host]);
  for (const u of [client.ordering.url, client.address.mapUrl, ...(client.seo.business?.sameAs || [])].filter(Boolean)) allowed.add(new URL(u).host);
  const walk = (v, k = '') => { if (k === '@context') return; if (typeof v === 'string' && /^https?:\/\//.test(v)) { let h; try { h = new URL(v).host; } catch { p.push(`structured data: ${v} is not a valid URL`); return; } if (!allowed.has(h)) p.push(`structured data: ${v} points at ${h}, which is not this site or a configured address`); } else if (v && typeof v === 'object') Object.entries(v).forEach(([kk, vv]) => walk(vv, kk)); };
  if (jsonLd) { walk(jsonLd); if (INTERNAL.test(JSON.stringify(jsonLd))) p.push(`structured data: contains an internal path or secret-like word (${INTERNAL.exec(JSON.stringify(jsonLd))[0]})`); }
  for (const u of llmsUrls) { try { if (!allowed.has(new URL(u).host)) p.push(`llms.txt: ${u} points at a host that is not this site or a configured address`); } catch { /* reported by llmsProblems */ } }
  return p;
}

// The staging/example judgement, kept separate: a fixture build legitimately uses a reserved name, a production release must not.
export const reservedBase = (cfg) => { try { const h = new URL(baseOf(cfg)).hostname; return isReservedHost(h) ? h : null; } catch { return null; } };

// ---- the final public URL on each kind of host, with the host's documented behaviour simulated (server.mjs). Nothing is deployed or contacted.
export const simHostFor = (seo) => {
  const style = seo.urlStyle || 'extension';
  if (seo.host === 'cloudflare-pages') return 'cloudflare-pages';
  if (seo.host === 'vercel') return style === 'clean' ? 'vercel-clean' : 'vercel-default';
  return 'static';
};

// Every public URL (canonical, sitemap, og:url, structured data, llms.txt) must answer 200 directly: a redirect or a 404 means the URL style does
// not match the host. Every internal link of every page, resolved from the page's PUBLIC address, must also end in a 200.
export async function urlStrategyProblems({ dir, cfg, publicUrls, host = null }) {
  const p = [], seo = cfg.client.seo, sim = host || simHostFor(seo), style = urlStyleOf(cfg);
  const sv = serveSite(dir, { host: sim, pretty: sim === 'static' && style === 'clean' });
  const origin = sv.origin;
  const at = (u) => origin + new URL(u).pathname;
  let hops = 0, links = 0;
  try {
    for (const u of [...new Set(publicUrls)]) {
      const r = await fetch(at(u), { redirect: 'manual' });
      if (r.status !== 200) p.push(`${u} answers ${r.status}${r.headers.get('location') ? ` (redirect to ${r.headers.get('location')})` : ''} on ${sim}: the public URL must be the final address (seo.urlStyle "${style}" does not match this host)`);
    }
    for (const page of cfg.pages) {
      const pageUrl = at(publicUrl(cfg, page));
      const r = await fetch(pageUrl); if (r.status !== 200) continue;
      const html = await r.text();
      const refs = new Set([...html.matchAll(/\b(?:href|src)="([^"#][^"]*)"/g)].map((m) => m[1]).filter((u) => !/^(https?:|mailto:|tel:|data:|\/\/)/.test(u)));
      for (const ref of refs) {
        const target = new URL(ref, pageUrl).href; links++;
        const first = await fetch(target, { redirect: 'manual' });
        if (first.status >= 300 && first.status < 400) hops++;
        const final = first.status >= 300 && first.status < 400 ? await fetch(target) : first;
        if (final.status !== 200) p.push(`${page.file}: the link "${ref}" ends at ${final.status} on ${sim}`);
      }
    }
  } finally { sv.close(); }
  return { problems: p, sim, hops, links };
}
