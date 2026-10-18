// Asset manifest and the content-hashed build (ledger ENG-065). The delivered site keeps its plain file names. For hosts that want long-lived
// caching, buildHashed() writes a COPY in which every CSS, JS, font and media file is renamed name.<8 hex of its SHA-256>.ext and every
// reference (HTML attributes, CSS url()) is rewritten to match. Nothing else changes: not one byte of any asset, not one pixel.
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { listFiles } from './git.mjs';
import { stylesheet } from './project.mjs';
import { deliveredPagesOf, SHARED } from './site.mjs';

export const sha256hex = (buf) => createHash('sha256').update(buf).digest('hex');
export const sri = (buf) => `sha384-${createHash('sha384').update(buf).digest('base64')}`;

// Every delivered file with size, SHA-256 and a Subresource-Integrity string. Deterministic.
export function buildManifest(root) {
  const files = [...deliveredPagesOf(root), ...SHARED, ...listFiles(join(root, 'fonts')).map((f) => `fonts/${f}`), ...listFiles(join(root, 'media')).map((f) => `media/${f}`)].sort();
  const entries = {};
  for (const f of files) { const b = readFileSync(join(root, f)); entries[f] = { bytes: b.length, sha256: sha256hex(b), integrity: sri(b) }; }
  const tree = sha256hex(files.map((f) => `${entries[f].sha256}  ${f}`).join('\n') + '\n');
  return { algorithm: 'sha256 (hex) and sha384 (SRI)', fileCount: files.length, totalBytes: files.reduce((s, f) => s + entries[f].bytes, 0), treeSha256: tree, files: entries };
}

// Hash of every file in a folder (names and bytes), whatever the files are called.
export const treeHash = (root) => sha256hex(listFiles(root).map((f) => `${sha256hex(readFileSync(join(root, f)))}  ${f}`).join('\n'));

const hashName = (path, buf) => { const i = path.lastIndexOf('.'); return `${path.slice(0, i)}.${sha256hex(buf).slice(0, 8)}${path.slice(i)}`; };

// refs inside text: returns the text with every local reference found in `map` replaced. base: the directory the text is relative to.
function rewrite(text, map, base, kind) {
  const fix = (u) => { const [p, tail = ''] = [u.split(/[?#]/)[0], u.slice(u.split(/[?#]/)[0].length)]; const key = posix.normalize(posix.join(base, p)); return map[key] ? posix.relative(base || '.', map[key]) + tail : u; };
  if (kind === 'css') return text.replace(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/g, (m, q, u) => (/^(data:|https?:|#)/.test(u) ? m : `url(${q}${fix(u)}${q})`));
  return text
    .replace(/(\s(?:href|src|data-webm|data-mp4)=")([^"]+)(")/g, (m, a, u, c) => (/^(data:|https?:|mailto:|tel:|#|\.\.\/)/.test(u) ? m : `${a}${fix(u)}${c}`))
    .replace(/(\s(?:srcset|imagesrcset)=")([^"]+)(")/g, (m, a, v, c) => `${a}${v.split(',').map((part) => { const [u, ...rest] = part.trim().split(/\s+/); return [/^(data:|https?:)/.test(u) ? u : fix(u), ...rest].join(' '); }).join(', ')}${c}`);
}

// The main stylesheet first, then any other .css file among the shared files, in manifest order.
export const stylesheetsOf = () => [stylesheet, ...SHARED.filter((f) => f.endsWith('.css') && f !== stylesheet)];

// Returns { map: oldPath -> newPath, files }. Throws if a script names an asset (it could not be rewritten safely).
export function buildHashed(srcRoot, outRoot) {
  const map = {};
  const put = (rel, buf) => { const dest = join(outRoot, rel); mkdirSync(dirname(dest), { recursive: true }); writeFileSync(dest, buf); };
  const assets = [...listFiles(join(srcRoot, 'media')).map((f) => `media/${f}`), ...listFiles(join(srcRoot, 'fonts')).map((f) => `fonts/${f}`)];
  for (const f of assets) { const b = readFileSync(join(srcRoot, f)); map[f] = hashName(f, b); put(map[f], b); }
  for (const js of SHARED.filter((f) => f.endsWith('.js'))) {
    const text = readFileSync(join(srcRoot, js), 'utf8');
    if (/['"`][^'"`]*(?:media\/|fonts\/|\.(?:webp|webm|mp4|woff2))['"`]|['"`](?:media|fonts)\//.test(text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''))) throw new Error(`${js} names an asset file; it cannot be hashed safely`);
    map[js] = hashName(js, Buffer.from(text)); put(map[js], text);
  }
  // the main stylesheet and every other stylesheet the project delivers (a page's own, listed in delivery.sharedFiles) are rewritten and renamed the same way: url() references first (the
  // assets are already in the map), then the name from the rewritten bytes. A project with one stylesheet runs the loop once, exactly as before.
  for (const sheet of stylesheetsOf()) {
    const css = rewrite(readFileSync(join(srcRoot, sheet), 'utf8'), map, '', 'css');
    map[sheet] = hashName(sheet, Buffer.from(css)); put(map[sheet], css);
  }
  for (const page of deliveredPagesOf(srcRoot)) put(page, rewrite(readFileSync(join(srcRoot, page), 'utf8'), map, '', 'html'));
  return { map, files: Object.keys(map).length + deliveredPagesOf(srcRoot).length };
}
