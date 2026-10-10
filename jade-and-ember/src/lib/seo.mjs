// Production search-engine files and metadata, generated from the validated client configuration (decision D-7): canonical URLs, sitemap.xml,
// robots.txt and schema.org JSON-LD. Nothing here runs for the fictional demonstration: it stays noindex (client.seo.noindex) and gets none of it.
// Pure functions; no dependencies.
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const ABBR = Object.fromEntries(DAYS.flatMap((d, i) => [[d.toLowerCase(), i], [d.slice(0, 3).toLowerCase(), i]]));
const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export const isIndexable = (cfg) => cfg.client.seo.noindex === false;
export const baseOf = (cfg) => cfg.client.seo.baseUrl.replace(/\/+$/, '');

// The canonical URL of a page: the base URL, then the file name (Home is the base URL itself).
export const canonicalFor = (cfg, page) => `${baseOf(cfg)}/${page.file === 'index.html' ? '' : page.file}`;

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
    ...(menuPage ? { hasMenu: `${base}/${menuPage.file}` } : {}),
    ...(b.sameAs && b.sameAs.length ? { sameAs: b.sameAs } : {}),
  };
  return `<script type="application/ld+json">${escLd(JSON.stringify(data))}</script>`;
}

export function sitemapXml(cfg) {
  const last = cfg.client.seo.lastModified;
  const urls = cfg.pages.map((p) => `  <url><loc>${xml(canonicalFor(cfg, p))}</loc>${last ? `<lastmod>${last}</lastmod>` : ''}</url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

export function robotsTxt(cfg) {
  return `User-agent: *\nAllow: /\n\nSitemap: ${baseOf(cfg)}/sitemap.xml\n`;
}
