// check:assets (ENG-065, asset and configuration integrity). The delivered files, as recorded and as they could be cached.
//   manifest   assets.manifest.json (size, SHA-256, SRI of every delivered file) equals a fresh build: any change to a delivered byte is a
//              reviewed change to the manifest; every file also still equals the v0.8 baseline's recorded checksum
//   hashed     the content-hashed COPY (npm run build:hashed): every CSS, JS, font and media file renamed name.<8 hex of its SHA-256>.ext,
//              every reference rewritten, none left pointing at an old name, assets byte-identical to the originals, two builds identical,
//              HTML names unchanged; in the browser it equals v0.8 (text, accessibility tree, computed styles, screenshots, hero behaviour,
//              and it opens from the folder over file://)
//   names      the delivered site keeps its plain names and paths (no engineering requirement justified renaming them); hashing is an
//              opt-in copy for hosts that want immutable caching
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { assembleCandidate, loadAllowlist, pagesOf, SHARED } from '../lib/site.mjs';
import { buildHashed, buildManifest, sha256hex, treeHash } from '../lib/hashed.mjs';
import { runRegression } from '../lib/regression.mjs';
import { baselineRecord, engDir, exportBaseline, isMain, listFiles, projectDir, readJson, repoRoot, tempDir } from '../lib/git.mjs';
import { baselineLabel, project, stylesheet } from '../lib/project.mjs';
import { record } from '../lib/project-records.mjs';

// every local reference in pages and CSS resolves to a file in the folder
export function refsResolve(dir) {
  const problems = [];
  const check = (from, u) => {
    if (/^(data:|https?:|mailto:|tel:|#|\.\.\/)/.test(u)) return;
    const t = posix.normalize(posix.join(posix.dirname(from), u.split(/[?#]/)[0]));
    if (!existsSync(join(dir, t))) problems.push(`${from}: "${u}" does not exist`);
  };
  for (const f of pagesOf(dir)) { const h = readFileSync(join(dir, f), 'utf8'); for (const m of h.matchAll(/\s(?:href|src|data-webm|data-mp4)="([^"]+)"/g)) check(f, m[1]); for (const m of h.matchAll(/\s(?:srcset|imagesrcset)="([^"]+)"/g)) for (const part of m[1].split(',')) check(f, part.trim().split(/\s+/)[0]); }
  const css = readdirCss(dir);
  for (const f of css) for (const m of readFileSync(join(dir, f), 'utf8').matchAll(/url\(\s*['"]?([^)'"]+)['"]?\s*\)/g)) if (!m[1].startsWith('data:')) check(f, m[1]);
  return problems;
}
const readdirCss = (dir) => listFiles(dir, (p) => p.includes('/') && !/^(media|fonts)\//.test(p)).filter((f) => f.endsWith('.css'));

export function checkAssetsStatic({ root }) {
  const problems = [], notes = [];
  const recorded = record('assets.manifest.json');
  const fresh = buildManifest(root);
  const diff = [...new Set([...Object.keys(recorded.files), ...Object.keys(fresh.files)])].filter((f) => JSON.stringify(recorded.files[f]) !== JSON.stringify(fresh.files[f]));
  if (diff.length) problems.push(`the built site differs from assets.manifest.json in ${diff.length} file(s): ${diff.slice(0, 6).join(', ')}${diff.length > 6 ? ', ...' : ''} (after a reviewed change run: node engineering/tools/asset-manifest.mjs --write)`);
  else notes.push(`manifest: ${fresh.fileCount} delivered files, ${fresh.totalBytes} bytes, tree ${fresh.treeSha256.slice(0, 12)} equal the recorded manifest`);
  // against the baseline's own checksums (a project with no baseline has none to hold the files against)
  if (!project.baseline) { notes.push('no baseline: the delivered files are held to the recorded manifest only'); return { problems, notes, fresh }; }
  const rec = baselineRecord();
  const sums = Object.fromEntries(readFileSync(join(repoRoot, rec.recordsDir, rec.sourceTreeChecksums.file), 'utf8').split('\n').filter(Boolean).map((l) => [l.slice(66), l.slice(0, 64)]));
  const allow = loadAllowlist();
  const explained = (f, e) => {   // a text file may differ from v0.8 only as an approved allowlist entry explains: the candidate, normalised, must hash to the baseline's checksum
    const entry = allow.entries.find((x) => x.file === f);
    if (!entry || allow.errors.length) return false;
    let text = readFileSync(join(root, f), 'utf8');
    for (const r of entry.normalize) text = text.replace(new RegExp(r.find, 'g'), r.replace);
    if (sha256hex(text) !== sums[`${rec.projectPath}/${f}`]) return false;
    notes.push(`${f} differs from the ${baselineLabel} checksum only as approved by ${entry.id} (${entry.approval || entry.workPackage})`);
    return true;
  };
  const changed = Object.entries(fresh.files).filter(([f, e]) => sums[`${rec.projectPath}/${f}`] && sums[`${rec.projectPath}/${f}`] !== e.sha256 && !explained(f, e)).map(([f]) => f);
  const missing = Object.keys(fresh.files).filter((f) => !sums[`${rec.projectPath}/${f}`]);
  if (changed.length) problems.push(`delivered file(s) differ from the ${baselineLabel} baseline checksums: ${changed.join(', ')}`);
  if (missing.length) problems.push(`delivered file(s) not in the ${baselineLabel} baseline: ${missing.join(', ')}`);
  if (!changed.length && !missing.length) notes.push(`every delivered file equals its ${baselineLabel} baseline checksum, or differs only as an approved allowlist entry explains; names and paths are unchanged`);
  return { problems, notes, fresh };
}

export async function checkAssets({ root = null, browser = true, browserName = 'chromium' } = {}) {
  const own = !root;
  const dir = root || assembleCandidate(projectDir, 'assets');
  const cleanup = [];
  try {
    const s = checkAssetsStatic({ root: dir });
    const problems = [...s.problems], notes = [...s.notes];
    // hashed build
    const h1 = tempDir('hashed1'), h2 = tempDir('hashed2'); cleanup.push(h1, h2);
    let built;
    try { built = buildHashed(dir, h1); buildHashed(dir, h2); } catch (e) { return { problems: [...problems, `hashed build failed: ${e.message}`], notes }; }
    if (treeHash(h1) !== treeHash(h2)) problems.push('two hashed builds differ');
    for (const [old, now] of Object.entries(built.map)) {
      const orig = readFileSync(join(dir, old)), out = readFileSync(join(h1, now));
      const textual = /\.(css|js)$/.test(old);
      if (!textual && !orig.equals(out)) problems.push(`${old}: renaming changed the bytes`);
      if (!now.includes(`.${sha256hex(out).slice(0, 8)}.`)) problems.push(`${now}: the name does not carry the hash of its content`);
    }
    for (const f of SHARED.filter((x) => x.endsWith('.js'))) if (!readFileSync(join(dir, f)).equals(readFileSync(join(h1, built.map[f])))) problems.push(`${f}: script bytes changed by hashing`);
    problems.push(...refsResolve(h1).map((p) => `hashed build: ${p}`));
    const stale = (text, names) => names.filter((old) => new RegExp(`(?<![\\w.-])${old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w.])`).test(text));
    const css = readFileSync(join(h1, built.map[stylesheet]), 'utf8');
    for (const f of pagesOf(h1)) for (const old of stale(readFileSync(join(h1, f), 'utf8'), Object.keys(built.map).filter((k) => !/\.(md|txt)$/.test(k)))) problems.push(`hashed build: ${f} still refers to ${old}`);
    for (const old of stale(css, Object.keys(built.map).filter((k) => /^(fonts|media)\//.test(k) && !/\.(md|txt)$/.test(k)))) problems.push(`hashed build: the stylesheet still refers to ${old}`);
    for (const f of pagesOf(dir)) if (!existsSync(join(h1, f))) problems.push(`hashed build lost ${f}`);
    notes.push(`hashed copy: ${Object.keys(built.map).length} files renamed name.<8 hex>.ext, all references rewritten and resolving, assets byte-identical, two builds identical`);
    if (browser && project.baseline) {
      const base = exportBaseline('assets-base'); cleanup.push(dirname(base));
      const sum = await runRegression({ baselineRoot: base, candidateRoot: h1, reportDir: join(engDir, '.reports', 'assets'), only: ['text', 'structure', 'styles', 'pixels', 'behaviour'], subset: { viewports: ['desktop-1440', 'tablet-820', 'mobile-390'], states: false, scenarios: /^hero: desktop|^hero: reduced|file:\/\/|^requests/ }, browserName });
      let compared = 0;
      for (const [layer, L] of Object.entries(sum.layers)) { compared += L.checked; L.problems.forEach((x) => problems.push(`hashed copy, ${layer}: ${x}`)); }
      notes.push(`hashed copy in the browser equals ${baselineLabel}: ${compared} comparisons (text, accessibility tree, computed styles, screenshots at 1440, 820, 390 px; hero video, reduced motion, requests, and every page opened from the folder over file://), 0 differences`);
    } else notes.push(browser ? 'not run: the browser comparison of the hashed copy with the frozen baseline (the project declares no baseline, so there is no reference to compare with)' : 'browser comparison of the hashed copy skipped (no browser in this tier)');
    return { problems, notes };
  } finally { cleanup.forEach((d) => rmSync(d, { recursive: true, force: true })); if (own) rmSync(dir, { recursive: true, force: true }); }
}

if (isMain(import.meta.url)) {
  const t0 = Date.now();
  const { problems, notes } = await checkAssets({ browser: !process.argv.includes('--static') });
  notes.forEach((n) => console.log('  ' + n));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:assets (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  process.exit(problems.length ? 1 : 0);
}
