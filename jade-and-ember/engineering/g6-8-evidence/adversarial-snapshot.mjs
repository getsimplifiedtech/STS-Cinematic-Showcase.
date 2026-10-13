// G6-8 Stage B: adversarial tests of the committed snapshot of THIS repository. Each case damages a throw-away copy in one way and states what must refuse it.
//
//   node jade-and-ember/engineering/g6-8-evidence/adversarial-snapshot.mjs [--framework <private framework checkout>]
//
// Part 1 uses the snapshot tool that sits in the snapshot itself (the consumer's own check); part 2 needs the private framework checkout and shows what only the private side can
// prove (verify --against); part 3 clones this repository and damages the workflow and the record to see what check:ci and check:extraction say. Nothing here changes the repository.
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..', '..');
const argv = process.argv.slice(2);
const fw = argv.includes('--framework') ? resolve(argv[argv.indexOf('--framework') + 1]) : null;
const tool = join(repo, 'engineering', 'tools', 'snapshot.mjs');
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const blobOid = (b) => createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${b.length}\0`), b])).digest('hex');
const { treeOid } = await import(`file://${tool}`);

let failures = 0;
const lines = [];
const say = (ok, text) => { lines.push(`${ok ? 'caught' : 'FAILED'}: ${text}`); if (!ok) failures++; };

// a copy of only what the snapshot is: the two folders and the record
function freshCopy(withGit = true) {
  const d = mkdtempSync(join(tmpdir(), 'sts-adv-'));
  for (const p of ['engineering', '.github/actions/engineering']) { mkdirSync(dirname(join(d, p)), { recursive: true }); cpSync(join(repo, p), join(d, p), { recursive: true, filter: (s) => !/(^|\/)node_modules$/.test(s) }); }
  cpSync(join(repo, 'sts-framework-snapshot.json'), join(d, 'sts-framework-snapshot.json'));
  if (withGit) { execFileSync('git', ['init', '-q'], { cwd: d }); }
  return d;
}
const verify = (d, extra = []) => { const r = spawnSync(process.execPath, [tool, 'verify', '--repo', d, ...extra], { encoding: 'utf8' }); return { status: r.status, text: r.stdout + r.stderr }; };
const editRecord = (d, f) => { const p = join(d, 'sts-framework-snapshot.json'); const r = JSON.parse(readFileSync(p, 'utf8')); f(r); writeFileSync(p, JSON.stringify(r, null, 1)); };
const refreshEntry = (r, rel, body) => { const e = r.files.find((x) => x.path === rel); e.sha256 = sha256(body); e.blob = blobOid(body); e.bytes = body.length; r.snapshotTree = treeOid(r.files); r.totals.bytes = r.files.reduce((n, x) => n + x.bytes, 0); return e; };
const expectRefused = (name, d, re, extra = []) => { const v = verify(d, extra); say(v.status !== 0 && re.test(v.text), `${name} -> ${v.status === 0 ? 'ACCEPTED' : (re.test(v.text) ? 'refused' : 'refused for another reason: ' + v.text.trim().slice(0, 140))}`); rmSync(d, { recursive: true, force: true }); };

// the untouched copy must pass
{ const d = freshCopy(); const v = verify(d); say(v.status === 0, `the untouched snapshot verifies (${v.text.trim().split('\n').at(-2)?.trim().slice(0, 120)})`); rmSync(d, { recursive: true, force: true }); }

// ---- part 1: the consumer's own check
const F = 'engineering/lib/git.mjs';
{ const d = freshCopy(); writeFileSync(join(d, F), `${readFileSync(join(d, F), 'utf8')}\n// x\n`); expectRefused('a byte changed in a copied file', d, /differs from the record|bytes, the record says/); }
{ const d = freshCopy(); writeFileSync(join(d, 'engineering/lib/extra.mjs'), 'export {}\n'); expectRefused('a file added beside the copied files', d, /extra\.mjs: is in the snapshot folders but not in the record/); }
{ const d = freshCopy(); rmSync(join(d, F)); expectRefused('a copied file removed', d, /git\.mjs: is in the record but missing/); }
{ const d = freshCopy(); chmodSync(join(d, F), 0o755); expectRefused('a copied file made executable', d, /mode 100755, the record says 100644/); }
{ const d = freshCopy(); rmSync(join(d, F)); symlinkSync(join(d, 'engineering/lib/zip.mjs'), join(d, F)); expectRefused('a link in place of a file', d, /git\.mjs: is not a regular file/); }
{ const d = freshCopy(); symlinkSync('/nonexistent-target', join(d, 'engineering/lib/ghost.mjs')); expectRefused('a dangling link added', d, /ghost\.mjs: is in the snapshot folders but not in the record/); }
{ const d = freshCopy(); writeFileSync(join(d, '.github/actions/engineering/extra.sh'), 'echo x\n'); expectRefused('a file added to the copied action', d, /extra\.sh: is in the snapshot folders but not in the record/); }
{ const d = freshCopy(); writeFileSync(join(d, '.github/actions/engineering/action.yml'), `${readFileSync(join(d, '.github/actions/engineering/action.yml'), 'utf8')}# changed\n`); expectRefused('the copied action edited', d, /differs from the record|bytes, the record says/); }
{ const d = freshCopy(false); mkdirSync(join(d, 'engineering/lib/node_modules'), { recursive: true }); writeFileSync(join(d, 'engineering/lib/node_modules/evil.mjs'), 'export {}\n'); expectRefused('a hidden node_modules folder below the root, in a copy without git', d, /node_modules\/evil\.mjs: is in the snapshot folders but not in the record/); }
{ const d = freshCopy(); editRecord(d, (r) => { r.files[3].sha256 = 'f'.repeat(64); }); expectRefused('the record lists another checksum', d, /SHA-256 differs from the record/); }
{ const d = freshCopy(); editRecord(d, (r) => { r.snapshotTree = 'a'.repeat(40); }); expectRefused('the record carries a tampered tree id', d, /snapshotTree does not match the files it lists/); }
{ const d = freshCopy(); editRecord(d, (r) => { r.framework.commit = 'main'; }); expectRefused('the record names a branch instead of a commit', d, /full 40-hex ids/); }
{ const d = freshCopy(); editRecord(d, (r) => { r.framework.repository = 'someone/else'; }); expectRefused('the record names another framework repository', d, /framework repository must be/); }
{ const d = freshCopy(); editRecord(d, (r) => { delete r.totals; }); expectRefused('the record without totals', d, /totals are missing or do not match/); }
{ const d = freshCopy(); editRecord(d, (r) => { r.files.find((x) => x.path === F).class = 'devtool'; }); expectRefused('a class the profile does not give (the purity scan would skip the file)', d, /the record says class devtool, the profile says none/); }
{ const d = freshCopy(); rmSync(join(d, 'sts-framework-snapshot.json')); expectRefused('the record deleted', d, /sts-framework-snapshot\.json is missing/); }
{
  const d = freshCopy(); const rel = 'engineering/lib/authenticity.mjs', body = Buffer.from(`${readFileSync(join(d, rel), 'utf8')}\n// weakened\n`);
  writeFileSync(join(d, rel), body); editRecord(d, (r) => { const e = refreshEntry(r, rel, body); r.protected[rel] = e.sha256; });
  expectRefused('the production hard stop weakened, the record made to agree', d, /pins|protected hash differs from the pinned one/);
}

// ---- part 2: what only the private side can prove
if (fw) {
  const forged = (name, edit, re) => { const d = freshCopy(); edit(d); const own = verify(d); const against = verify(d, ['--against', fw]); say(own.status === 0 && against.status !== 0 && re.test(against.text), `${name}: the consumer's own check ${own.status === 0 ? 'passes (as it must: a copy and a record forged together look consistent)' : 'FAILS'}; against the private framework -> ${against.status === 0 ? 'ACCEPTED' : (re.test(against.text) ? 'refused' : 'refused for another reason: ' + against.text.trim().slice(0, 140))}`); rmSync(d, { recursive: true, force: true }); };
  forged('a file and its record changed together', (d) => { const body = Buffer.from(`${readFileSync(join(d, F), 'utf8')}\n// forged\n`); writeFileSync(join(d, F), body); editRecord(d, (r) => refreshEntry(r, F, body)); }, /git\.mjs: differs from the commit/);
  forged('a record naming a commit that is not in the framework repository', (d) => editRecord(d, (r) => { r.framework.commit = 'b'.repeat(40); }), /the commit cannot be read/);
  forged('a record naming another tree for the right commit', (d) => editRecord(d, (r) => { r.framework.tree = 'c'.repeat(40); }), /the commit's tree is/);
  { const d = freshCopy(); const v = verify(d, ['--against', fw]); say(v.status === 0, `the untouched snapshot verifies against the private framework (${v.text.trim().split('\n').at(-2)?.trim().slice(0, 140)})`); rmSync(d, { recursive: true, force: true }); }
} else lines.push('skipped: part 2 (pass --framework <private framework checkout>)');

// ---- part 3: the workflow and the engine's own checks, in a clone of this repository
{
  const clone = mkdtempSync(join(tmpdir(), 'sts-adv-clone-'));
  execFileSync('git', ['clone', '-q', repo, clone]);
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
  execFileSync('git', ['checkout', '-q', head], { cwd: clone });
  const nm = join(repo, 'engineering', 'node_modules');
  if (existsSync(nm)) { symlinkSync(nm, join(clone, 'engineering', 'node_modules')); writeFileSync(join(clone, '.git', 'info', 'exclude'), 'engineering/node_modules\n'); }
  const run = (script, env = {}) => { const r = spawnSync(process.execPath, [join(clone, 'engineering', 'checks', script)], { cwd: join(clone, 'jade-and-ember'), env: { ...process.env, STS_PROJECT_DIR: join(clone, 'jade-and-ember'), GITHUB_REPOSITORY: 'getsimplifiedtech/STS-Cinematic-Showcase.', ...env }, encoding: 'utf8' }); return { status: r.status, text: r.stdout + r.stderr }; };
  const wf = join(clone, '.github', 'workflows', 'jade-and-ember-verify.yml');
  const good = readFileSync(wf, 'utf8');
  const ok = run('ci.mjs'); say(ok.status === 0, `check:ci accepts the committed snapshot caller (${ok.text.trim().split('\n').at(-2)?.trim().slice(0, 100)})`);
  const exp = (name, r, re) => say(r.status !== 0 && re.test(r.text), `${name} -> ${r.status === 0 ? 'ACCEPTED' : (re.test(r.text) ? 'refused' : 'refused for another reason: ' + r.text.trim().slice(0, 160))}`);
  // the direct style of workflow (the one G6-7 allowed for this repository) is refused now
  if (fw) {
    const old = spawnSync('git', ['show', '2bb1737:.github/workflows/jade-and-ember-verify.yml'], { cwd: repo, encoding: 'utf8' });
    if (old.status === 0) { writeFileSync(wf, old.stdout); exp('the old direct-style workflow (the temporary exception is gone)', run('ci.mjs'), /must use the caller workflow/); writeFileSync(wf, good); }
  }
  writeFileSync(wf, good.replace('    runs-on: ubuntu-24.04\n    timeout-minutes: 40\n', '    runs-on: ubuntu-24.04\n    timeout-minutes: 40\n    continue-on-error: true\n'));
  exp('the blocking verify job allowed to fail', run('ci.mjs'), /continue-on-error/); writeFileSync(wf, good);
  writeFileSync(wf, good.replaceAll('./.github/actions/engineering', './.github/actions/mine'));
  exp('a different local action', run('ci.mjs'), /must use \.\/\.github\/actions\/engineering/); writeFileSync(wf, good);
  exp('the same snapshot caller in a private client repository (not on the snapshot list)', run('ci.mjs', { GITHUB_REPOSITORY: 'getsimplifiedtech/some-client' }), /not a repository that may carry the framework as a snapshot|snapshot/);
  // the engine's own checks see a tampered copy
  const g = join(clone, 'engineering', 'lib', 'git.mjs'); const keep = readFileSync(g);
  writeFileSync(g, `${keep}\n// tampered\n`); exp('check:extraction on a tampered snapshot file', run('extraction.mjs'), /differs from the record|SHA-256/); writeFileSync(g, keep);
  rmSync(join(clone, 'sts-framework-snapshot.json')); exp('check:extraction without the record (a repository on the snapshot list must keep it)', run('extraction.mjs'), /sts-framework-snapshot\.json is missing/);
  rmSync(clone, { recursive: true, force: true });
}

console.log(lines.join('\n'));
console.log(`${failures ? 'FAIL' : 'PASS'}  adversarial snapshot tests (${lines.filter((l) => l.startsWith('caught')).length} caught, ${failures} failed)`);
process.exit(failures ? 1 : 0);
