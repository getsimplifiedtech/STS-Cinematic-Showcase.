// Production search-engine files and metadata, generated from the validated client configuration (decision D-7): canonical URLs, sitemap.xml,
// robots.txt, llms.txt and schema.org JSON-LD. Nothing here runs for the fictional demonstration: it stays noindex (client.seo.noindex) and
// gets none of it. Pure functions; no dependencies beyond the crawler list.
import { blockedAgents, CRAWLER_CLASSES, policyOf } from './crawlers.mjs';
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const ABBR = Object.fromEntries(DAYS.flatMap((d, i) => [[d.toLowerCase(), i], [d.slice(0, 3).toLowerCase(), i]]));
const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export const isIndexable = (cfg) => cfg.client.seo.noindex === false;
export const baseOf = (cfg) => cfg.client.seo.baseUrl.replace(/\/+$/, '');

// Hosts differ in what URL a page finally has. Cloudflare Pages redirects menu.html to /menu; Vercel serves menu.html as it is unless
// cleanUrls is on, and then redirects it to /menu. A canonical, sitemap, structured-data or llms.txt URL that is redirected is wrong, so the
// URL style is declared (client.seo.urlStyle) and every generated URL goes through publicUrl. The files stay .html on disk so the folder
// still works from file://; only the public address changes.
//   extension  /menu.html   hosts that serve the file name as it is (Vercel default, nginx, Apache, a plain server)
//   clean      /menu        hosts that serve extension-less URLs and redirect .html to them (Cloudflare Pages, Vercel with cleanUrls)
export const URL_STYLES = ['extension', 'clean'];
export const HOSTS = ['cloudflare-pages', 'vercel', 'static'];
export const urlStyleOf = (cfg) => cfg.client.seo.urlStyle || 'extension';
export const publicPath = (cfg, page) => (page.file === 'index.html' ? '' : urlStyleOf(cfg) === 'clean' ? page.file.replace(/\.html$/, '') : page.file);
export const publicUrl = (cfg, page) => `${baseOf(cfg)}/${publicPath(cfg, page)}`;
// The canonical URL of a page is its final public URL (Home is the base URL itself).
export const canonicalFor = publicUrl;

// Addresses a visitor or a search engine must never be told to treat as the real site: reserved and example names, local and internal names,
// IP addresses, and the free preview and staging domains of hosting providers. Used by the release gate; the build only warns, because the
// same configuration is legitimately built for staging.
const RESERVED_TLD = /\.(test|example|invalid|localhost|local|internal|lan|home\.arpa|corp|intranet)$/;
const RESERVED_SECOND = /(^|\.)example\.(com|net|org)$/;
const PREVIEW_SUFFIX = /\.(pages\.dev|vercel\.app|netlify\.app|workers\.dev|github\.io|web\.app|firebaseapp\.com|onrender\.com|herokuapp\.com|ngrok\.io|ngrok-free\.app|trycloudflare\.com|glitch\.me|surge\.sh|fly\.dev)$/;
const STAGING_LABEL = /^(staging|stage|stg|preview|dev|test|testing|demo|uat|qa|sandbox)$/;
export function isReservedHost(hostname) {
  const h = String(hostname).toLowerCase().replace(/\.$/, '');
  if (!h || !h.includes('.') && h !== 'localhost') return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.startsWith('[')) return true;
  return RESERVED_TLD.test(h) || h === 'localhost' || RESERVED_SECOND.test(h) || PREVIEW_SUFFIX.test(h) || h.split('.').some((l) => STAGING_LABEL.test(l));
}
export const reservedHostOf = (cfg) => { try { const h = new URL(cfg.client.seo.baseUrl).hostname; return isReservedHost(h) ? h : null; } catch { return null; } };

// Plain text of the address as the pages print it, for comparing the structured data and llms.txt against it.
export const addressText = (client) => client.address.lines.map((l) => l.trim()).join(', ');

// "Tuesday – Thursday", "Mon-Fri", "Sunday" -> [1,2,3] (Monday is 0). Returns null when the text is not understood.
export function parseDays(text) {
  const t = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (t === 'daily' || t === 'every day') return [0, 1, 2, 3, 4, 5, 6];
  const m = /^([a-z]+)(?:\s*(?:[–—-]|to)\s*([a-z]+))?$/.exec(t);
  if (!m || !(m[1] in ABBR) || (m[2] && !(m[2] in ABBR))) return null;
  const a = ABBR[m[1]], b = m[2] ? ABBR[m[2]] : a;
  const out = []; for (let i = a; ; i = (i + 1) % 7) { out.push(i); if (i === b) break; if (out.length > 7) return null; }
  return out;
}

// "5:00 pm", "9:30 pm", "17:00", "noon" -> "17:00". Returns null when not understood.
export function parseTime(text) {
  const t = text.trim().toLowerCase().replace(/\./g, '');
  if (t === 'noon') return '12:00';
  if (t === 'midnight') return '00:00';
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/.exec(t);
  if (!m) return null;
  let h = Number(m[1]); const min = Number(m[2] || 0);
  if (m[3]) { if (h < 1 || h > 12) return null; h = (h % 12) + (m[3] === 'pm' ? 12 : 0); }
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

// The opening-hours rows of client.hours as schema.org specifications. Closed rows are omitted. errors lists rows that cannot be understood
// (the client then supplies seo.business.hoursSpec instead).
export function hoursSpecs(rows) {
  const specs = [], errors = [];
  rows.forEach((r, i) => {
    if (/^closed$/i.test(r.time.trim())) return;
    const days = parseDays(r.days);
    const parts = r.time.split(/\s*(?:[–—-]|to)\s*/i);
    const opens = parts.length === 2 ? parseTime(parts[0]) : null, closes = parts.length === 2 ? parseTime(parts[1]) : null;
    if (!days || !opens || !closes) { errors.push(`client.hours.rows[${i}] ("${r.days}", "${r.time}") cannot be turned into opening hours; use day names and times such as "Tuesday – Thursday" and "5:00 pm – 9:30 pm", or set seo.business.hoursSpec`); return; }
    specs.push({ '@type': 'OpeningHoursSpecification', dayOfWeek: days.map((d) => DAYS[d]), opens, closes });
  });
  return { specs, errors };
}

const E164 = /^\+[1-9]\d{6,14}$/;

// Everything that must hold for the production metadata, as readable errors. Called by the build's configuration validation.
export function seoErrors(cfg) {
  const errors = [];
  const { client } = cfg, seo = client.seo;
  if (client.flags.demo === true && seo.noindex !== true) errors.push('the fictional demonstration must stay noindex: seo.noindex must be true while flags.demo is true');
  if (seo.structuredData === true && seo.noindex !== false) errors.push('seo.structuredData true is only valid for an indexable build (seo.noindex false)');
  if (seo.noindex === false) {
    let u; try { u = new URL(seo.baseUrl || ''); } catch { u = null; }
    if (!u) return errors;   // the base-URL rule is reported by the existing validation
    if (u.protocol !== 'https:' || u.search || u.hash || u.username || u.password) errors.push('seo.baseUrl must be a plain https URL without query, fragment or credentials');
    if (/^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(u.hostname)) errors.push('seo.baseUrl must be the real public address, not localhost');
    if (seo.lastModified !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(seo.lastModified)) errors.push('seo.lastModified must be a date such as 2026-10-10');
  }
  if (seo.urlStyle !== undefined && !URL_STYLES.includes(seo.urlStyle)) errors.push(`seo.urlStyle must be one of ${URL_STYLES.join(', ')}`);
  if (seo.host !== undefined && !HOSTS.includes(seo.host)) errors.push(`seo.host must be one of ${HOSTS.join(', ')}`);
  if (seo.host === 'cloudflare-pages' && urlStyleOf(cfg) !== 'clean') errors.push('seo.host cloudflare-pages redirects .html addresses to extension-less ones, so seo.urlStyle must be "clean" (otherwise every canonical and sitemap URL would be a redirect)');
  if (seo.crawlers) {
    for (const k of Object.keys(seo.crawlers)) if (!CRAWLER_CLASSES.includes(k)) errors.push(`seo.crawlers.${k} is not a crawler class (${CRAWLER_CLASSES.join(', ')})`);
    for (const [k, v] of Object.entries(seo.crawlers)) if (v !== 'allow' && v !== 'disallow') errors.push(`seo.crawlers.${k} must be "allow" or "disallow"`);
    if (seo.noindex === false && seo.crawlers.search === 'disallow') errors.push('seo.crawlers.search must not be "disallow" for an indexable build: it would contradict the canonical URLs and the sitemap');
  }
  if (seo.llms && seo.llms.summary !== undefined && (typeof seo.llms.summary !== 'string' || !seo.llms.summary.trim() || /[\r\n]/.test(seo.llms.summary) || seo.llms.summary.length > 400)) errors.push('seo.llms.summary must be one line of text, at most 400 characters');
  if (seo.noindex === false && seo.structuredData === true && seo.business) {
    // the structured data must say what the pages say
    const at = addressText(client).toLowerCase(), a = seo.business.address || {};
    for (const k of ['streetAddress', 'addressLocality', 'postalCode']) if (a[k] && !at.includes(String(a[k]).toLowerCase())) errors.push(`seo.business.address.${k} ("${a[k]}") does not appear in client.address.lines ("${addressText(client)}"): the structured data must agree with the address shown on the pages`);
  }
  if (seo.noindex === false && seo.structuredData === true) {
    const b = seo.business;
    if (!b) { errors.push('seo.structuredData needs seo.business (cuisine, price range, address parts and image)'); return errors; }
    if (!client.contact.phone.href || !E164.test(client.contact.phone.href.replace(/^tel:/, ''))) errors.push('structured data needs the phone number as an international tel: link, for example tel:+442079460000');
    if (!b.hoursSpec) errors.push(...hoursSpecs(client.hours.rows).errors);
    if (!b.hoursSpec && hoursSpecs(client.hours.rows).specs.length === 0) errors.push('structured data needs at least one open day in client.hours.rows');
    (b.sameAs || []).forEach((s, i) => { if (!/^https:\/\//.test(s)) errors.push(`seo.business.sameAs[${i}] must be an https URL`); });
  }
  return errors;
}

const escLd = (json) => json.replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

// The Restaurant description for the Home page, or '' when structured data is off or the page is not Home.
export function jsonLdFor(cfg, page) {
  const { client, copy } = cfg, seo = client.seo;
  if (!(seo.noindex === false && seo.structuredData === true) || page.id !== 'home' || !seo.business) return '';
  const b = seo.business, base = baseOf(cfg);
  const hours = b.hoursSpec ? b.hoursSpec.map((h) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: h.dayOfWeek, opens: h.opens, closes: h.closes })) : hoursSpecs(client.hours.rows).specs;
  const menuPage = cfg.pages.find((p) => p.id === 'menu');
  const data = {
    '@context': 'https://schema.org', '@type': b.type || 'Restaurant', '@id': `${base}/#restaurant`, name: client.brand.name,
    description: copy.home.meta.description, url: `${base}/`, image: `${base}/${b.image}`, telephone: client.contact.phone.href.replace(/^tel:/, ''),
    servesCuisine: b.servesCuisine, priceRange: b.priceRange,
    address: { '@type': 'PostalAddress', streetAddress: b.address.streetAddress, addressLocality: b.address.addressLocality, ...(b.address.addressRegion ? { addressRegion: b.address.addressRegion } : {}), postalCode: b.address.postalCode, addressCountry: b.address.addressCountry },
    ...(b.geo ? { geo: { '@type': 'GeoCoordinates', latitude: b.geo.latitude, longitude: b.geo.longitude } } : {}),
    openingHoursSpecification: hours,
    ...(menuPage ? { hasMenu: publicUrl(cfg, menuPage) } : {}),
    ...(b.sameAs && b.sameAs.length ? { sameAs: b.sameAs } : {}),
  };
  return `<script type="application/ld+json">${escLd(JSON.stringify(data))}</script>`;
}

export function sitemapXml(cfg) {
  const last = cfg.client.seo.lastModified;
  const urls = cfg.pages.map((p) => `  <url><loc>${xml(canonicalFor(cfg, p))}</loc>${last ? `<lastmod>${last}</lastmod>` : ''}</url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

// The crawler policy as robots.txt. With every class allowed (the default) this is the plain two-line allow file. A disallowed class adds one
// group that names its agents. robots.txt is a request: it does not control every AI system and promises nothing about search or AI answers.
export function robotsTxt(cfg) {
  const blocked = blockedAgents(policyOf(cfg.client.seo));
  const groups = blocked.length ? `\n# Crawler policy (client.seo.crawlers). robots.txt is a request, not access control, and not every provider separates these classes.\n${blocked.map((a) => `User-agent: ${a}`).join('\n')}\nDisallow: /\n` : '';
  return `User-agent: *\nAllow: /\n${groups}\nSitemap: ${baseOf(cfg)}/sitemap.xml\n`;
}

// llms.txt (llmstxt.org convention): plain Markdown for language-model readers, built from the same verified configuration as the pages and
// the structured data. Every fact is copied from client.json, copy.json or site.json, never written here. The convention is emerging: nothing
// claims that any search or AI service reads this file.
const one = (s) => String(s).replace(/\s+/g, ' ').trim();
// Free text is flattened to one line and its square brackets and backslashes are escaped, so configuration text can never form a Markdown link.
const md = (s) => one(s).replace(/([\\[\]])/g, '\\$1');
export function llmsTxt(cfg) {
  const { client, copy } = cfg, seo = client.seo, b = seo.business;
  const out = [`# ${md(client.brand.name)}`, '', `> ${md(seo.llms?.summary || copy.home.meta.description)}`, '', '## Pages'];
  for (const p of cfg.pages) out.push(`- [${md(p.nav)}](${publicUrl(cfg, p)}): ${md(copy[p.id].meta.description)}`);
  out.push('', '## Visit and contact', `- Address: ${md(addressText(client))}`, `- Phone: ${md(client.contact.phone.display)} (${client.contact.phone.href.replace(/^tel:/, '')})`);
  if (client.contact.email) out.push(`- Email: ${md(client.contact.email)}`);
  out.push(`- Opening hours: ${client.hours.rows.map((r) => `${md(r.days)}: ${md(r.time)}`).join('; ')}`);
  if (client.ordering.url) out.push(`- Order online: ${client.ordering.url}`);
  if (b) { out.push(`- Cuisine: ${b.servesCuisine.map(md).join(', ')}`, `- Price range: ${md(b.priceRange)}`); }
  return out.join('\n') + '\n';
}
