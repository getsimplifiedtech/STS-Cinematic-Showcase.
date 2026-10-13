// Loads the client configuration files and validates the contract every STS website shares (specification 16, section 8): the client's facts, the page registry, one
// title and description per page, and the production metadata. What only one industry has (an industry's own catalogue, for example) is the industry adapter's business and the
// project's own configuration generator, named in its manifest; this module knows none of it. A validation error fails the build, not the page.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { seoErrors } from './seo.mjs';

const read = (configDir, name) => JSON.parse(readFileSync(join(configDir, `${name}.json`), 'utf8'));

// dir: the project folder (media is checked there). configDir: where the JSON files live (default dir/config). industry: the adapter, for the hooks it offers (optional).
export function loadConfig(dir, configDir = join(dir, 'config'), { industry = null } = {}) {
  const client = read(configDir, 'client');
  const copy = read(configDir, 'copy');
  const site = read(configDir, 'site');
  const pages = site.pages;
  const byId = Object.fromEntries(pages.map((p) => [p.id, p]));
  return { dir, client, copy, site, pages, byId, demo: client.flags?.demo === true, industry };
}

export function validate(cfg) {
  const { dir, client, copy, site, pages } = cfg;
  const errors = [];
  const need = (cond, msg) => { if (!cond) errors.push(msg); };
  const fileExists = (rel) => existsSync(join(dir, rel));

  // client facts
  need(client.brand?.name, 'client.brand.name is required');
  need(Array.isArray(client.address?.lines) && client.address.lines.length > 0, 'client.address.lines is required');
  need(client.contact?.phone?.display && /^tel:/.test(client.contact.phone.href || ''), 'client.contact.phone needs display and a tel: href');
  need(Array.isArray(client.hours?.rows) && client.hours.rows.length > 0, 'client.hours.rows is required');
  (client.hours?.rows || []).forEach((r, i) => need(r.days && r.time, `client.hours.rows[${i}] needs days and time`));
  need(typeof client.flags?.demo === 'boolean' && typeof client.flags?.heroVideo === 'boolean', 'client.flags.demo and heroVideo must be booleans');
  if (client.seo.noindex === false) need(/^https:\/\//.test(client.seo.baseUrl || ''), 'seo.noindex false needs a seo.baseUrl so canonical tags can be written');
  if (client.seo.business?.image) { need(/\.webp$/.test(client.seo.business.image), 'seo.business.image must be a .webp file'); need(fileExists(client.seo.business.image), `seo.business.image: missing file ${client.seo.business.image}`); }
  if (client.address.mapUrl) need(/^https:\/\//.test(client.address.mapUrl), 'client.address.mapUrl must be null or an https:// URL');
  errors.push(...seoErrors(cfg));   // a demonstration stays noindex; production canonical, sitemap, robots and structured data need valid configuration

  // page registry
  const ids = new Set();
  pages.forEach((p) => {
    need(!ids.has(p.id), `duplicate page id ${p.id}`); ids.add(p.id);
    need(/^[a-z0-9-]+\.html$/.test(p.file), `page ${p.id}: file must be a flat .html name`);
    need(p.nav, `page ${p.id}: nav label missing`);
    need(copy[p.id]?.meta?.title && copy[p.id]?.meta?.description, `copy.${p.id}.meta needs a title and a description`);
  });
  need(new Set(pages.map((p) => p.file)).size === pages.length, 'page files must be unique');
  const titles = pages.map((p) => copy[p.id]?.meta?.title);
  need(new Set(titles).size === titles.length, 'page titles must be unique');
  need(pages.filter((p) => p.cta).length === 1, 'exactly one page must be the header call to action (cta)');
  if (cfg.industry?.validateConfig) errors.push(...cfg.industry.validateConfig(cfg));

  // a client build must carry no demonstration text
  if (!cfg.demo) {
    const DEMO = /\b(fictional|sample|samples|invented|nonfunctional)\b|example street|\(555\)/i;
    const skip = new Set(['site.demo', 'copy.demo']);   // text that only ever renders when flags.demo is true
    const walk = (o, path) => {
      if (skip.has(path)) return;
      if (typeof o === 'string') { if (DEMO.test(o)) errors.push(`${path} still contains demonstration text ("${o.slice(0, 50)}...") but flags.demo is false`); return; }
      if (o && typeof o === 'object') { if (o.sample === true) errors.push(`${path} is marked sample but flags.demo is false`); Object.entries(o).forEach(([k, v]) => walk(v, `${path}.${k}`)); }
    };
    walk(client, 'client'); walk(copy, 'copy'); walk(site, 'site');
  }
  return errors;
}
