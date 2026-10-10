// Jade & Ember static build. No dependencies. Run: node build.mjs
// Reads config/*.json, validates it, and writes one standalone HTML file per page in the page registry (config/site.json).
// Everything restaurant-specific lives in config/; page markup lives in src/pages; shared parts live in src/components.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { loadConfig, validate } from './src/lib/config.mjs';
import { configSchemaErrors } from './engineering/lib/config-schema.mjs';
import { document } from './src/components/document.mjs';
import { isIndexable, robotsTxt, sitemapXml, llmsTxt, baseOf, reservedHostOf } from './src/lib/seo.mjs';
import home from './src/pages/home.mjs';
import menu from './src/pages/menu.mjs';
import story from './src/pages/story.mjs';
import visit from './src/pages/visit.mjs';
import order from './src/pages/order.mjs';

const dir = dirname(fileURLToPath(import.meta.url));
// Optional: node build.mjs --config <folder with the four JSON files> --out <folder to write the pages to> (used by tests/variants.mjs)
const arg = (name) => { const i = process.argv.indexOf(name); return i > -1 ? resolve(process.argv[i + 1]) : null; };
const outDir = arg('--out') || dir;
const configDir = arg('--config') || join(dir, 'config');
// 1. every config file against its JSON Schema (structure and types), 2. the cross-file rules. Both lists are reported together.
const errors = configSchemaErrors(configDir);
let cfg;
try { cfg = loadConfig(dir, configDir); errors.push(...validate(cfg)); } catch (e) { if (!errors.length) throw e; }
if (errors.length) {
  console.error(`Config validation failed (${errors.length}):\n` + errors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}

const renderers = { home, menu, story, visit, order };
for (const page of cfg.pages) {
  const render = renderers[page.id];
  if (!render) { console.error(`No renderer for page "${page.id}"`); process.exit(1); }
  const out = render(cfg, page);
  const html = document(cfg, page, out);
  writeFileSync(join(outDir, page.file), html);
  console.log(`${page.file.padEnd(18)} ${String(html.length).padStart(6)} bytes`);
}
// Production search files exist only for an indexable client build; the demonstration (noindex) gets none.
if (isIndexable(cfg) || !cfg.demo) console.log('NOTICE: this is a client-production configuration (demo off or indexable). It may not be released until `npm run release:gate` passes: a recorded release approval, rights verification, device, screen-reader, browser and CI evidence.');
if (isIndexable(cfg)) {
  writeFileSync(join(outDir, 'sitemap.xml'), sitemapXml(cfg));
  writeFileSync(join(outDir, 'robots.txt'), robotsTxt(cfg));
  writeFileSync(join(outDir, 'llms.txt'), llmsTxt(cfg));
  const reserved = reservedHostOf(cfg);
  if (reserved) console.log(`WARNING: seo.baseUrl uses ${reserved}, a reserved, example or preview address. Fine for staging; the release gate refuses it for a client-production release.`);
  console.log(`sitemap.xml, robots.txt and llms.txt written for ${baseOf(cfg)}/` + (new URL(cfg.client.seo.baseUrl).pathname.replace(/\/$/, '') ? ' (the base URL has a path: robots.txt is only read at the root of the domain, so place it there)' : ''));
}
console.log(`Ordering: ${cfg.live ? 'live URL' : 'demo placeholder'}. Demo flag: ${cfg.demo}.`);
