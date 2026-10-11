// node engineering/tools/evidence.mjs <command>      (npm run evidence:new | evidence:list | evidence:docs | evidence:validate | evidence:hash)
//   new <target> [--commit <sha>] [--tree <hash>] [--dir <folder>]   scaffold an UNFILLED evidence record for a target; it never fills in a result
//   list                                                             the inventory: every target, its class, gate type and procedure
//   docs [--check]                                                   write (or check) the procedures in docs/device-testing/ from the specification
//   validate <file> [--release-commit <sha>]                         judge one record the way the release gate would, for the current build
//   hash <file>                                                      the SHA-256 to put in a record's attachments
// Nothing here changes the site, deploys anything or contacts anything.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { loadSpec, scaffold, defaultVctx, validateRecord, realGit } from '../lib/evidence.mjs';
import { renderAll } from '../lib/evidence-docs.mjs';
import { assembleCandidate } from '../lib/site.mjs';
import { buildManifest } from '../lib/hashed.mjs';
import { engDir, projectDir, repoRoot } from '../lib/git.mjs';

const args = process.argv.slice(2);
const cmd = args[0];
const arg = (n) => { const i = args.indexOf(n); return i > -1 ? args[i + 1] : null; };
const docsDir = join(repoRoot, 'docs', 'device-testing');
const spec = loadSpec();

function currentBuild() {
  const dir = assembleCandidate(projectDir, 'evidence');
  try { return { assetsTree: buildManifest(dir).treeSha256 }; } finally { rmSync(dir, { recursive: true, force: true }); }
}

if (cmd === 'new') {
  const target = args[1];
  if (!target || target.startsWith('--')) { console.error(`usage: evidence:new -- <target>\ntargets: ${Object.keys(spec.targets).join(', ')}`); process.exit(2); }
  if (!spec.targets[target]) { console.error(`unknown target "${target}"; known: ${Object.keys(spec.targets).join(', ')}`); process.exit(2); }
  const commit = (arg('--commit') || 'HEAD').toLowerCase() === 'head' ? realGit && (await import('node:child_process')).spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).stdout.trim() : arg('--commit');
  const tree = arg('--tree') || currentBuild().assetsTree;
  const rec = scaffold(spec, target, { commit, assetsTree: tree });
  const dir = resolve(arg('--dir') || join(engDir, 'release', 'evidence'));
  mkdirSync(dir, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  let name = join(dir, `${target}.${day}.json`);
  for (let n = 2; existsSync(name); n++) name = join(dir, `${target}.${day}.${n}.json`);
  writeFileSync(name, JSON.stringify(rec, null, 2) + '\n');
  console.log(`wrote ${name}\n\nThe record is an UNFILLED template (status "template"): the release gate rejects it until a person has done the test, filled every field and signed it.\nProcedure: docs/device-testing/${target}.md\nBuild to test: commit ${commit.slice(0, 12)}, delivered-files hash ${tree.slice(0, 12)}...`);
  process.exit(0);
}
if (cmd === 'list') {
  for (const [id, t] of Object.entries(spec.targets)) console.log(`${id.padEnd(28)} ${t.classes.join('/').padEnd(6)} ${t.gateType.padEnd(15)} ${t.estimatedMinutes ? `${String(t.estimatedMinutes).padStart(3)} min` : '  automated'}  ${t.title}`);
  process.exit(0);
}
if (cmd === 'docs') {
  const files = renderAll(spec);
  const want = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v.endsWith('\n') ? v : v + '\n']));
  if (args.includes('--check')) {
    const have = existsSync(docsDir) ? [] : null;
    const bad = [];
    for (const [k, v] of Object.entries(want)) { const p = join(docsDir, k); if (!existsSync(p)) bad.push(`${k} is missing`); else if (readFileSync(p, 'utf8') !== v) bad.push(`${k} differs from the specification`); }
    const listed = existsSync(docsDir) ? [...readdirSync(docsDir), ...(existsSync(join(docsDir, 'procedures')) ? readdirSync(join(docsDir, 'procedures')).map((f) => `procedures/${f}`) : [])].filter((f) => f.endsWith('.md')) : [];
    for (const f of listed) if (!(f in want)) bad.push(`${f} is not generated from the specification`);
    void have;
    if (bad.length) { console.error(bad.join('\n') + '\nrun: npm run evidence:docs'); process.exit(1); }
    console.log(`docs/device-testing: ${Object.keys(want).length} generated files match the specification`); process.exit(0);
  }
  for (const [k, v] of Object.entries(want)) { const p = join(docsDir, k); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, v); }
  console.log(`wrote ${Object.keys(want).length} files to docs/device-testing/`); process.exit(0);
}
if (cmd === 'hash') {
  if (!args[1] || !existsSync(args[1])) { console.error('usage: evidence:hash -- <file>'); process.exit(2); }
  console.log(createHash('sha256').update(readFileSync(args[1])).digest('hex') + '  ' + args[1]); process.exit(0);
}
if (cmd === 'validate') {
  const f = args[1];
  if (!f || !existsSync(f)) { console.error('usage: evidence:validate -- <record.json> [--release-commit <sha>]'); process.exit(2); }
  const head = (await import('node:child_process')).spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).stdout.trim();
  let rec; try { rec = JSON.parse(readFileSync(f, 'utf8')); } catch (e) { console.error(`not valid JSON: ${e.message}`); process.exit(1); }
  const v = validateRecord(rec, defaultVctx({ releaseCommit: arg('--release-commit') || head, assetsTree: currentBuild().assetsTree }));
  if (v.problems.length) { console.error(`REJECTED (${v.problems.length}):\n- ${v.problems.join('\n- ')}`); process.exit(1); }
  console.log(v.success ? 'ACCEPTED: a complete, consistent, signed record with a successful outcome for the current build.' : 'WELL-FORMED but it does not count: the outcome is a failure or an open Blocker or Major finding remains.');
  process.exit(v.success ? 0 : 1);
}
console.error('usage: evidence.mjs new <target> | list | docs [--check] | validate <file> | hash <file>'); process.exit(2);
