// check:delivery. What is delivered is self-contained, free of development tooling, and unchanged in kind.
//   1. the delivered file set (five pages, shared script/style files, fonts/, media/) equals the v0.8 preview package's site files
//   2. every reference in pages, scripts and styles is a relative path to a delivered file (or tel:, mailto:, #, ../ back-link, https link)
//      so index.html opens straight from the folder, and nothing is absolute, local or a file:// URL
//   3. nothing delivered mentions or needs Node.js, npm, node_modules, engineering/, a build step or a module loader
// It checks the candidate folder assembled from a fresh build, which is exactly what a visitor receives. Run: node engineering/checks/delivery.mjs
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { assembleCandidate, pagesOf, SHARED } from '../lib/site.mjs';
import { baselineRecord, isMain, listFiles, projectDir, repoRoot } from '../lib/git.mjs';
import { baselineLabel } from '../lib/project.mjs';

// The preview package also carries START-HERE.txt (written when the ZIP is packed) and the optional serve.py helper.
const PACKAGING_ONLY = new Set(['START-HERE.txt', 'serve.py']);

export function checkDelivery({ root = null } = {}) {
  const problems = [], notes = [];
  const own = !root;
  const dir = root || assembleCandidate(projectDir, 'delivery');
  try {
    const delivered = [...pagesOf(dir), ...SHARED, ...listFiles(join(dir, 'fonts')).map((f) => `fonts/${f}`), ...listFiles(join(dir, 'media')).map((f) => `media/${f}`)].sort();
    const rec = baselineRecord();
    const zipSet = readFileSync(join(repoRoot, rec.recordsDir, 'SHA256SUMS.preview-contents.txt'), 'utf8').split('\n').filter(Boolean).map((l) => l.slice(66)).filter((f) => !PACKAGING_ONLY.has(f)).sort();
    for (const f of delivered) if (!zipSet.includes(f)) problems.push(`delivered file not in the ${baselineLabel} preview package: ${f} (a new delivered file needs an approved change)`);
    for (const f of zipSet) if (!delivered.includes(f)) problems.push(`${baselineLabel} preview package file missing from the delivered set: ${f}`);
    notes.push(`delivered set: ${delivered.length} files, same as the ${baselineLabel} preview package (without START-HERE.txt and serve.py)`);

    const set = new Set(delivered);
    const okExternal = /^(https:|tel:|mailto:|#|data:)/;
    let refs = 0;
    const checkRef = (from, u) => {
      refs++;
      if (okExternal.test(u) || u === '../') return;
      if (/^(http:|file:|\/\/|\/|[A-Za-z]:\\)/.test(u) || /localhost|127\.0\.0\.1/.test(u)) { problems.push(`${from}: "${u}" is absolute, local or not https`); return; }
      const target = posix.normalize(posix.join(posix.dirname(from), u.split('#')[0].split('?')[0]));
      if (target.startsWith('..')) problems.push(`${from}: "${u}" leaves the folder`);
      else if (!set.has(target)) problems.push(`${from}: "${u}" is not a delivered file`);
    };
    for (const f of delivered.filter((x) => /\.html$/.test(x))) {
      const html = readFileSync(join(dir, f), 'utf8');
      for (const m of html.matchAll(/\b(?:href|src|data-webm|data-mp4)="([^"]*)"/g)) checkRef(f, m[1]);
      for (const m of html.matchAll(/\bsrcset="([^"]*)"/g)) for (const part of m[1].split(',')) checkRef(f, part.trim().split(/\s+/)[0]);
      for (const m of html.matchAll(/url\(([^)]+)\)/g)) checkRef(f, m[1].replace(/^['"]|['"]$/g, ''));
      if (/<script[^>]*type="module"/i.test(html)) problems.push(`${f}: a module script needs a server and a build step`);
    }
    for (const f of delivered.filter((x) => /\.css$/.test(x))) for (const m of readFileSync(join(dir, f), 'utf8').matchAll(/url\(([^)]+)\)/g)) { const u = m[1].replace(/^['"]|['"]$/g, ''); if (!u.startsWith('data:')) checkRef(f, u); }
    notes.push(`${refs} references in pages and styles all resolve inside the folder (or are tel:, mailto:, https links or the ../ back-link)`);

    const tooling = /node_modules|engineering\/|package(-lock)?\.json|\.mjs\b|sourceMappingURL|webpack|require\s*\(|\bimport\s*[({'"]|\bexport\s+(default|const|function)|process\.env|\bnpm\b|\bNode\.js\b/;
    for (const f of delivered.filter((x) => /\.(html|css|js)$/.test(x))) {
      readFileSync(join(dir, f), 'utf8').split('\n').forEach((line, i) => { if (tooling.test(line)) problems.push(`${f}:${i + 1} refers to development tooling or a module system: ${line.trim().slice(0, 80)}`); });
    }
    notes.push('no delivered page, script or stylesheet refers to Node.js, npm, node_modules, engineering/, a build step or a module loader');
  } finally { if (own) rmSync(dir, { recursive: true, force: true }); }
  return { problems, notes };
}

if (isMain(import.meta.url)) {
  const { problems, notes } = checkDelivery();
  notes.forEach((n) => console.log('  ' + n));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:delivery`);
  process.exit(problems.length ? 1 : 0);
}
