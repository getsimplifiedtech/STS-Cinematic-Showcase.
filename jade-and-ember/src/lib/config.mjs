// Loads the four client configuration files, validates them, and returns one context object for the build.
// A validation error fails the build (not the page): nothing half-configured is ever written.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { seoErrors } from './seo.mjs';
import { webpSize } from './image-size.mjs';

const read = (configDir, name) => JSON.parse(readFileSync(join(configDir, `${name}.json`), 'utf8'));

// dir: the project folder (media and fonts are checked there). configDir: where the four JSON files live (default dir/config).
export function loadConfig(dir, configDir = join(dir, 'config')) {
  const client = read(configDir, 'client');
  const menu = read(configDir, 'menu');
  const copy = read(configDir, 'copy');
  const site = read(configDir, 'site');
  const pages = site.pages;
  const byId = Object.fromEntries(pages.map((p) => [p.id, p]));
  const ordering = client.ordering;
  const live = typeof ordering.url === 'string' && /^https:\/\//.test(ordering.url);
  const signature = menu.categories.flatMap((k) => k.items).filter((i) => i.signature).sort((a, b) => a.signature.order - b.signature.order);
  // the signature photographs are not all the same size (the Home sequence ends on a 2400 px plate), so each carries its real pixel size for width and height attributes
  signature.forEach((i) => { const z = webpSize(join(dir, i.signature.image)); if (z) { i.signature.width = z.width; i.signature.height = z.height; } });
  return { dir, client, menu, copy, site, pages, byId, live, signature, demo: client.flags.demo === true };
}

export function validate(cfg) {
  const { dir, client, menu, copy, site, pages, byId } = cfg;
  const errors = [];
  const need = (cond, msg) => { if (!cond) errors.push(msg); };
  const fileExists = (rel) => existsSync(join(dir, rel));

  // client facts
  need(client.brand?.name, 'client.brand.name is required');
  need(Array.isArray(client.address?.lines) && client.address.lines.length > 0, 'client.address.lines is required');
  need(client.contact?.phone?.display && /^tel:/.test(client.contact.phone.href || ''), 'client.contact.phone needs display and a tel: href');
  need(Array.isArray(client.hours?.rows) && client.hours.rows.length > 0, 'client.hours.rows is required');
  (client.hours?.rows || []).forEach((r, i) => need(r.days && r.time, `client.hours.rows[${i}] needs days and time`));
  need(client.ordering.url === null || /^https:\/\//.test(client.ordering.url), 'client.ordering.url must be null or an https:// URL');
  need(['page', 'direct'].includes(client.ordering.headerCta), 'client.ordering.headerCta must be "page" or "direct"');
  need(client.ordering.headerCta !== 'direct' || cfg.live, 'client.ordering.headerCta "direct" needs a live ordering.url');
  need(typeof client.flags.demo === 'boolean' && typeof client.flags.heroVideo === 'boolean', 'client.flags.demo and heroVideo must be booleans');
  if (client.seo.noindex === false) need(/^https:\/\//.test(client.seo.baseUrl || ''), 'seo.noindex false needs a seo.baseUrl so canonical tags can be written');
  if (client.seo.business?.image) { need(/\.webp$/.test(client.seo.business.image), 'seo.business.image must be a .webp file'); need(fileExists(client.seo.business.image), `seo.business.image: missing file ${client.seo.business.image}`); }
  errors.push(...seoErrors(cfg));   // demonstration stays noindex; production canonical, sitemap, robots and structured data need valid configuration

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

  // menu
  const catIds = new Set();
  menu.categories.forEach((k) => {
    need(!catIds.has(k.id), `duplicate menu category id ${k.id}`); catIds.add(k.id);
    need(/^[a-z0-9-]+$/.test(k.id), `menu category id ${k.id} must be lowercase letters, numbers and hyphens`);
    k.items.forEach((it) => {
      const w = `menu item "${it.name}"`;
      need(it.name && it.text, `${w} needs a name and text`);
      need(typeof it.price === 'number' && it.price > 0, `${w} needs a numeric price`);
      need(Number.isInteger(it.heat) && it.heat >= 0 && it.heat <= 3, `${w}: heat must be 0 to 3`);
      if (it.signature) {
        need(it.signature.alt && it.signature.alt.length > 10, `${w}: signature image needs real alt text`);
        need(fileExists(it.signature.image), `${w}: missing file ${it.signature.image}`);
        if ((it.signature.width || 0) > 1600) need(fileExists(it.signature.image.replace(/\.webp$/, '-1200.webp')), `${w}: a signature photograph wider than 1600 px needs a 1200 px copy named ${it.signature.image.replace(/\.webp$/, '-1200.webp')} for the Menu`);
      }
    });
  });
  need(cfg.signature.length === 3, `exactly three signature dishes are expected on Home (found ${cfg.signature.length})`);

  // images referenced from copy
  const h = copy.home.hero;
  [h.image.desktop, h.image.mobile, h.video?.webm, h.video?.mp4].filter(Boolean).forEach((f) => need(fileExists(f), `hero: missing file ${f}`));
  need(h.image.alt && h.image.alt.length > 10, 'hero image needs alt text');
  const band = copy.menu.band;
  need(fileExists(band.src), `menu band: missing file ${band.src}`);
  need(band.decorative === true || (band.alt && band.alt.length > 3), 'menu band needs alt text, or decorative: true');
  if (copy.story.image) need(fileExists(copy.story.image.src), `story: missing file ${copy.story.image.src}`);

  // Our story, Visit us, Order online
  const st = copy.story;
  need(Array.isArray(st.chapters) && st.chapters.length >= 3, 'copy.story.chapters needs at least three chapters');
  (st.chapters || []).forEach((c) => need(c.id && c.heading && c.paragraphs?.length, `story chapter "${c.id}" needs id, heading and paragraphs`));
  need(Array.isArray(st.name?.characters) && st.name.characters.length === 2, 'copy.story.name.characters must be exactly two characters');
  need(st.image?.alt && st.image.alt.length > 10, 'story image needs alt text');
  const ids2 = (st.chapters || []).map((c) => c.id);
  need(new Set(ids2).size === ids2.length, 'story chapter ids must be unique');
  const vg = copy.visit.goodToKnow?.groups || [];
  vg.forEach((g) => need(g.title && Array.isArray(g.items) && g.items.length, `visit "good to know" group "${g.title}" needs a title and items`));
  const os = copy.order.steps || [];
  need(os.length >= 2 && os.length <= 4, 'copy.order.steps needs 2 to 4 steps');
  os.forEach((s) => { need(s.name && s.text, 'every order step needs a name and text'); if (s.link) need(byId[s.link.page], `order step links to unknown page ${s.link.page}`); });
  need(copy.order.pickup?.link && byId[copy.order.pickup.link.page], 'copy.order.pickup.link must name a page');
  if (client.address.mapUrl) need(/^https:\/\//.test(client.address.mapUrl), 'client.address.mapUrl must be null or an https:// URL');

  // a client build must carry no demonstration text
  if (!cfg.demo) {
    const DEMO = /\b(fictional|fictionland|sample|samples|invented|sampletown|nonfunctional)\b|example street|\(555\)/i;
    const skip = new Set(['site.demo', 'copy.demo', 'copy.visit.fictionalNote']);   // text that only ever renders when flags.demo is true
    const walk = (o, path) => {
      if (skip.has(path)) return;
      if (typeof o === 'string') { if (DEMO.test(o)) errors.push(`${path} still contains demonstration text ("${o.slice(0, 50)}...") but flags.demo is false`); return; }
      if (o && typeof o === 'object') { if (o.sample === true) errors.push(`${path} is marked sample but flags.demo is false`); Object.entries(o).forEach(([k, v]) => walk(v, `${path}.${k}`)); }
    };
    walk(client, 'client'); walk(menu, 'menu'); walk(copy, 'copy'); walk(site, 'site');
  }
  return errors;
}
