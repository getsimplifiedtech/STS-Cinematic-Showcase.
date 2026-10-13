// Structured-data validation for the Home page's JSON-LD (G6-5, APR-JE-046; D-P4-2: the framework supports industry-specific schemas). The industry adapter named by the
// project manifest supplies the schema.org types and the fields only that industry has.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { requireIndustry } from './industry.mjs';
import { project } from './project.mjs';

export const LD_FORBIDDEN_KEYS = ['license', 'copyrightHolder', 'copyrightNotice', 'copyrightYear', 'creditText', 'acquireLicensePage', 'usageInfo', 'isAccessibleForFree'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Validates the JSON-LD block of an indexable build against the configuration it came from. Returns problems. What is common to a local business is checked here;
// what only the project's industry has (the schema.org type, a restaurant's cuisine and price range and menu link) is asked of the industry adapter (D-P4-2).
export function validateStructuredData(ld, cfg, root) {
  const industry = requireIndustry();
  const p = [], bad = (m) => p.push(m);
  const base = cfg.client.seo.baseUrl.replace(/\/+$/, '');
  const url = (v) => typeof v === 'string' && /^https:\/\/[^\s]+$/.test(v);
  if (ld['@context'] !== 'https://schema.org') bad('@context must be https://schema.org');
  if (!industry.allowedTypes.includes(ld['@type'])) bad(`unexpected @type ${ld['@type']}`);
  if (ld.name !== cfg.client.brand.name) bad('name must equal client.brand.name');
  if (ld.url !== `${base}/`) bad(`url must be ${base}/`);
  if (!url(ld.image) || !ld.image.startsWith(base + '/') || !existsSync(join(root, ld.image.slice(base.length + 1)))) bad('image must be an https URL under the base URL that exists in the site');
  if (!/^\+[1-9]\d{6,14}$/.test(ld.telephone || '')) bad('telephone must be international (E.164)');
  if (ld.telephone !== cfg.client.contact.phone.href.replace(/^tel:/, '')) bad('telephone must equal the configured number');
  industry.fieldProblems(ld, cfg, root).forEach(bad);
  const a = ld.address || {};
  if (a['@type'] !== 'PostalAddress') bad('address must be a PostalAddress');
  for (const k of ['streetAddress', 'addressLocality', 'postalCode']) if (!a[k]) bad(`address.${k} is required`);
  if (!/^[A-Z]{2}$/.test(a.addressCountry || '')) bad('address.addressCountry must be a two-letter ISO code');
  const spec = ld.openingHoursSpecification;
  if (!Array.isArray(spec) || !spec.length) bad('openingHoursSpecification is required');
  else {
    const seen = new Set();
    for (const s of spec) {
      if (s['@type'] !== 'OpeningHoursSpecification') bad('each opening-hours entry must be an OpeningHoursSpecification');
      if (!Array.isArray(s.dayOfWeek) || !s.dayOfWeek.length || s.dayOfWeek.some((d) => !DAYS.includes(d))) bad('dayOfWeek must list valid day names');
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.opens) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.closes)) bad(`opens and closes must be HH:MM (${s.opens}, ${s.closes})`);
      for (const d of s.dayOfWeek || []) { if (seen.has(d)) bad(`${d} appears in two opening-hours entries`); seen.add(d); }
    }
    // independent oracle: every Closed row's days are absent, every open row's days are present
    for (const r of cfg.client.hours.rows) {
      const closed = /^closed$/i.test(r.time.trim());
      const rowDays = r.days.includes('–') || r.days.includes('-') ? DAYS.slice(DAYS.findIndex((d) => d.toLowerCase().startsWith(r.days.trim().toLowerCase().slice(0, 3))), DAYS.findIndex((d) => d.toLowerCase().startsWith(r.days.split(/[–-]/)[1].trim().toLowerCase().slice(0, 3))) + 1) : [DAYS.find((d) => d.toLowerCase().startsWith(r.days.trim().toLowerCase().slice(0, 3)))];
      for (const d of rowDays) if (closed === seen.has(d)) bad(`${d} is ${closed ? 'closed' : 'open'} in client.hours but ${seen.has(d) ? 'listed' : 'missing'} in the structured data`);
    }
  }
  industry.pageProblems(ld, cfg, root).forEach(bad);
  if (ld.sameAs !== undefined && (!Array.isArray(ld.sameAs) || ld.sameAs.some((s) => !url(s)))) bad('sameAs must list https URLs');
  for (const k of Object.keys(ld)) if (LD_FORBIDDEN_KEYS.includes(k)) bad(`the structured data must not assert ${k}: media rights are unverified (${project.governance.documents.mediaRightsPolicy})`);
  return p;
}
