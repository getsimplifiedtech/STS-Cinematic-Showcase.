// node engineering/tools/asset-manifest.mjs [--write]   Prints or writes engineering/assets.manifest.json for the freshly built delivered site.
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assembleCandidate } from '../lib/site.mjs';
import { buildManifest } from '../lib/hashed.mjs';
import { engDir, projectDir } from '../lib/git.mjs';
const dir = assembleCandidate(projectDir, 'manifest');
try {
  const m = { $comment: 'Integrity record of the delivered site (every page, shared script and stylesheet, font and media file). Generated from a fresh build by engineering/tools/asset-manifest.mjs; check:assets fails when the built site differs from it, so every change to a delivered byte is a reviewed change to this file. SRI strings are for hosts or tools that want them; the pages carry none (SRI adds nothing for same-origin files and is unreliable over file://).', ...buildManifest(dir) };
  if (process.argv.includes('--write')) { writeFileSync(join(engDir, 'assets.manifest.json'), JSON.stringify(m, null, 2) + '\n'); console.log(`wrote engineering/assets.manifest.json (${m.fileCount} files, ${m.totalBytes} bytes, tree ${m.treeSha256.slice(0, 12)})`); } else console.log(JSON.stringify(m, null, 2));
} finally { rmSync(dir, { recursive: true, force: true }); }
