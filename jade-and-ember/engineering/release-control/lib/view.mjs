// The verification view (G6-3A proof of concept). The existing package verifier judges a package against an "engineering folder": policy, schemas, check list, and a digest of
// the verifying code that the package's verification record must carry. In this repository that folder mixes TOOLING (code RC trusts) with PROJECT DATA that legitimately
// changes with every release (the recorded asset manifest, the rights inventory, the external-destination registry, the findings register, the dependency register, the
// crawler review). RC therefore builds, for every verification, a throwaway view: RC's own adopted copy of the tooling, with ONLY the declared data files replaced by the
// ones that travel with the package (package/data/). The client can change data; it cannot change a single line of code, and a verification record made by other code
// than RC's own does not match the view's digest and is refused. (Splitting tooling from data properly is a G6-5 task; this is the proof of concept's seam.)
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { RcError, inside } from './util.mjs';
import { engineFiles } from '../../lib/verification.mjs';
import { tempDir } from '../../lib/git.mjs';

export const DEFAULT_DATA_FILES = Object.freeze(['assets.manifest.json', 'media-rights-inventory.json', 'external-destinations.json', 'findings.json', 'dependencies.json', 'search-crawler-verification.json']);
const MAX_DATA_BYTES = 5 * 1024 * 1024;

// the data files that travel with a package: flat, named from the allow-list, plain, small, valid JSON. Returns Map name -> Buffer.
export function readDataFiles(packageDir, allowed) {
  const dir = join(packageDir, 'data'), out = new Map();
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name), st = lstatSync(p);
    if (!allowed.includes(name) || !st.isFile() || st.size > MAX_DATA_BYTES) throw new RcError('bad-data-file', `data/${name} is not an allowed project data file (${allowed.join(', ')})`);
    const buf = readFileSync(p);
    try { JSON.parse(buf.toString('utf8')); } catch { throw new RcError('bad-data-file', `data/${name} is not valid JSON`); }
    out.set(name, buf);
  }
  return out;
}

// returns { eng, dispose }
export function buildView(toolingEng, data) {
  const root = tempDir('rc-view'), engOut = join(root, 'repo', 'jade-and-ember', 'engineering');
  try {
    cpSync(toolingEng, engOut, { recursive: true, filter: (s) => !/[\\/](\.reports|node_modules)([\\/]|$)/.test(s) });
    for (const f of engineFiles(toolingEng)) {
      const from = f.startsWith('project/') ? join(toolingEng, '..', f.slice(8)) : f.startsWith('repo/') ? join(toolingEng, '..', '..', f.slice(5)) : null;
      if (!from) continue;
      const to = f.startsWith('project/') ? join(root, 'repo', 'jade-and-ember', f.slice(8)) : join(root, 'repo', f.slice(5));
      mkdirSync(dirname(to), { recursive: true }); cpSync(from, to);
    }
    for (const [name, buf] of data) { const to = inside(engOut, name); mkdirSync(dirname(to), { recursive: true }); writeFileSync(to, buf); }
    return { eng: engOut, dispose: () => rmSync(root, { recursive: true, force: true }) };
  } catch (e) { rmSync(root, { recursive: true, force: true }); throw e; }
}
