// node engineering/tools/hashed-build.mjs [--out hashed]   Writes a content-hashed COPY of the built site for hosts that want immutable caching.
// The delivered site itself keeps its plain names. Deploy either one, never both. Nothing is deployed by this tool.
import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { assembleCandidate } from '../lib/site.mjs';
import { buildHashed } from '../lib/hashed.mjs';
import { projectDir } from '../lib/git.mjs';
const i = process.argv.indexOf('--out');
const out = resolve(i > -1 ? process.argv[i + 1] : join(projectDir, 'hashed'));
const dir = assembleCandidate(projectDir, 'hashed');
try { rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true }); const r = buildHashed(dir, out); console.log(`wrote ${out}: ${r.files} files, ${Object.keys(r.map).length} renamed to name.<hash>.ext`); } finally { rmSync(dir, { recursive: true, force: true }); }
