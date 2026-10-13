// The generic fixture's static build. No dependencies. Run: node build.mjs [--config <folder>] [--out <folder>]
// Reads config/*.json, validates it with the engineering's configuration contract, and writes one standalone HTML file per page of the registry plus the error page.
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, validate } from '../../generators/config.mjs';
import { baseOf, isIndexable, llmsTxt, reservedHostOf, robotsTxt, sitemapXml } from '../../generators/seo.mjs';
import { industry } from '../../lib/industry.mjs';
import { renderNotFound, renderPage } from './src/render.mjs';

const dir = dirname(fileURLToPath(import.meta.url));
const arg = (name) => { const i = process.argv.indexOf(name); return i > -1 ? resolve(process.argv[i + 1]) : null; };
const outDir = arg('--out') || dir;
const configDir = arg('--config') || join(dir, 'config');
const cfg = loadConfig(dir, configDir, { industry });
const errors = validate(cfg);
if (errors.length) { console.error(`Config validation failed (${errors.length}):\n` + errors.map((e) => `  - ${e}`).join('\n')); process.exit(1); }
for (const page of cfg.pages) { const html = renderPage(cfg, page); writeFileSync(join(outDir, page.file), html); console.log(`${page.file.padEnd(16)} ${String(html.length).padStart(6)} bytes`); }
writeFileSync(join(outDir, '404.html'), renderNotFound(cfg));
// Search files exist only for an indexable build; a demonstration (noindex) gets none.
if (isIndexable(cfg)) { writeFileSync(join(outDir, 'sitemap.xml'), sitemapXml(cfg)); writeFileSync(join(outDir, 'robots.txt'), robotsTxt(cfg)); writeFileSync(join(outDir, 'llms.txt'), llmsTxt(cfg));
  const reserved = reservedHostOf(cfg);
  if (reserved) console.log(`WARNING: seo.baseUrl uses ${reserved}, a reserved, example or preview address. Fine for staging; the release gate refuses it for a client-production release.`);
  console.log(`sitemap.xml, robots.txt and llms.txt written for ${baseOf(cfg)}/` + (new URL(cfg.client.seo.baseUrl).pathname.replace(/\/$/, '') ? ' (the base URL has a path: robots.txt is only read at the root of the domain, so place it there)' : '')); }
