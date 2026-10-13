// PROJECT-OWNED (generic fixture): the recipe that turns this project's demonstration configuration into an indexable client build. The reusable checks reach it only through
// the manifest (fixtures.clientBuild, lib/fixtures.mjs). The folder it returns is a complete delivered site (pages, search files, assets). edit(name, obj) may adjust each
// configuration file before the build.
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { projectDir, tempDir } from '../../../../lib/git.mjs';
import { SHARED } from '../../../../lib/site.mjs';

const FIXES = [
  [/Fictional studio[^"]*/g, 'Letterpress studio. Wedding suites, business cards and broadsides.'], [/Quillfeather Letterpress is a fictional studio\.[^"]*/g, 'Quillfeather Letterpress is a letterpress studio.'],
  [/ \(fictional\)/g, ''], [/Sampletown, ST 00000/g, 'Springfield, ST 12345'], [/555\.010\.0142/g, '020.7946.0142'], [/\+15550100142/g, '+442079460142'],
];
export const BUSINESS = {
  type: 'LocalBusiness', image: 'media/press-hero.webp',
  address: { streetAddress: '14 Printers Row', addressLocality: 'Springfield', addressRegion: 'ST', postalCode: '12345', addressCountry: 'GB' },
  sameAs: ['https://www.example.test/quillfeather'],
};

// returns { dir (delivered folder), cfgDir, status, text } ; status 0 when the build succeeded
export function buildClient({ edit = () => {}, base = 'https://quillfeatherletterpress.example.test', business = BUSINESS, structuredData = true, label = 'client' } = {}) {
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
    }
    edit(name, o);
    writeFileSync(join(cfgDir, f), JSON.stringify(o, null, 2));
  }
  for (const a of [...SHARED, 'media']) cpSync(join(projectDir, a), join(dir, a), { recursive: true });
  const r = spawnSync(process.execPath, [join(projectDir, 'build.mjs'), '--config', cfgDir, '--out', dir], { encoding: 'utf8' });
  return { root, dir, cfgDir, status: r.status, text: r.stdout + r.stderr };
}
