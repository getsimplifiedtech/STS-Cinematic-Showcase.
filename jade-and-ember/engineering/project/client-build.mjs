// PROJECT-OWNED (Jade & Ember): the recipe that turns this project's demonstration configuration into an indexable client build. The reusable checks reach it only
// through the manifest (fixtures.clientBuild, lib/fixtures.mjs). A realistic indexable CLIENT build of the site, produced from the demonstration configuration by the same edits tests/variants.mjs uses (demo
// wording replaced, live ordering URL, indexing on), plus the production metadata fields. Used by check:seo and the release tests. The
// folder it returns is a complete delivered site (pages, search files, assets). `edit(name, obj)` may adjust each config file before the build.
import { cpSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { projectDir, tempDir } from '../lib/git.mjs';
import { SHARED } from '../lib/site.mjs';

const FIXES = [
  [/Jade & Ember is a fictional modern Chinese kitchen: a cinematic restaurant website concept by Simplified Tech Solutions\. Sample menu, hours and address\./g, 'Jade & Ember is a modern Chinese kitchen. Menu, hours and address.'],
  [/Sample menu/g, 'Menu'], [/The sample menu at/g, 'The menu at'], [/\(sample details\)/g, ''], [/\(all details are samples\)/g, ''],
  [/ \(the ordering button is a nonfunctional example\)/g, ''], [/a fictional modern Chinese kitchen/g, 'a modern Chinese kitchen'],
  [/Sample Street/g, 'Market Street'], [/Example Street/g, 'High Street'], [/Sampletown, ST 00000/g, 'Springfield, ST 12345'], [/Fictionland/g, 'Country'],
  [/\(555\) 010-0188/g, '(020) 7946 0000'], [/\+15550100188/g, '+442079460000'], [/"sample": true/g, '"sample": false'], [/ \(fictional concept by STS\)/g, ''],
];
export const BUSINESS = {
  type: 'Restaurant', servesCuisine: ['Chinese', 'Modern Chinese'], priceRange: '$$', image: 'media/hero-wok.webp',
  address: { streetAddress: '88 High Street', addressLocality: 'Springfield', addressRegion: 'ST', postalCode: '12345', addressCountry: 'GB' },
  sameAs: ['https://www.instagram.com/jadeandember.example'],
};

// returns { dir (delivered folder), cfgDir, status, text } ; status 0 when the build succeeded
export function buildClient({ edit = () => {}, base = 'https://jadeandember.example.test', business = BUSINESS, structuredData = true, label = 'client' } = {}) {
  const root = tempDir(label), cfgDir = join(root, 'config'), dir = join(root, 'site');
  mkdirSync(dir, { recursive: true });
  cpSync(join(projectDir, 'config'), cfgDir, { recursive: true });
  for (const f of readdirSync(cfgDir)) {
    const name = f.replace('.json', '');
    let t = readFileSync(join(cfgDir, f), 'utf8');
    for (const [a, b] of FIXES) t = t.replace(a, b);
    const o = JSON.parse(t);
    if (name === 'client') {
      Object.assign(o.flags, { demo: false, heroVideo: false });
      Object.assign(o.seo, { noindex: false, baseUrl: base, structuredData, lastModified: '2026-10-10', ...(business ? { business: JSON.parse(JSON.stringify(business)) } : {}) });
      o.ordering.url = 'https://order.example-restaurant.test/jade'; o.address.mapUrl = 'https://maps.example.test/?q=jade';
    }
    if (name === 'site') o.credit.label = 'Website by Simplified Tech Solutions';
    edit(name, o);
    writeFileSync(join(cfgDir, f), JSON.stringify(o, null, 2));
  }
  for (const a of [...SHARED, 'fonts', 'media']) cpSync(join(projectDir, a), join(dir, a), { recursive: true });
  const r = spawnSync(process.execPath, [join(projectDir, 'build.mjs'), '--config', cfgDir, '--out', dir], { encoding: 'utf8' });
  return { root, dir, cfgDir, status: r.status, text: r.stdout + r.stderr };
}
