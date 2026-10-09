// Jade & Ember static build. No dependencies. Run: node build.mjs
// Reads config/*.json, validates it, and writes one standalone HTML file per page in the page registry (config/site.json).
// Everything restaurant-specific lives in config/; page markup lives in src/pages; shared parts live in src/components.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadConfig, validate } from './src/lib/config.mjs';
import { document } from './src/components/document.mjs';
import home from './src/pages/home.mjs';
import menu from './src/pages/menu.mjs';
import pending from './src/pages/pending.mjs';

const dir = dirname(fileURLToPath(import.meta.url));
const cfg = loadConfig(dir);
const errors = validate(cfg);
if (errors.length) {
  console.error(`Config validation failed (${errors.length}):\n` + errors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}

const renderers = { home, menu };
for (const page of cfg.pages) {
  const render = page.status === 'built' ? renderers[page.id] : pending;
  if (!render) { console.error(`No renderer for page "${page.id}"`); process.exit(1); }
  const out = render(cfg, page);
  const html = document(cfg, page, out);
  writeFileSync(join(dir, page.file), html);
  console.log(`${page.file.padEnd(18)} ${String(html.length).padStart(6)} bytes  ${page.status}`);
}
console.log(`Ordering: ${cfg.live ? 'live URL' : 'demo placeholder'}. Demo flag: ${cfg.demo}.`);
