// The release readiness dry run (Gate 5 Phase 7, APR-JE-035). It runs the REAL release tool (engineering/tools/release.mjs, unchanged) against a
// SYNTHETIC client build inside a throwaway copy of the project, so that the success path and every blocker can be exercised without touching the
// demonstration, the real approvals log, the real evidence folder or any report.
//
// What is synthetic, and how it is kept apart from real release records:
//   * the sandbox is a temporary folder with its own git repository; it is deleted when the run ends and nothing in it is ever copied back;
//   * the synthetic approvals, evidence records and verification report exist only inside it, are labelled SYNTHETIC in their own text, and are
//     kept out of the sandbox's tracked files (see "the ledger problem" below);
//   * the real docs/JADE_AND_EMBER_APPROVALS.md, engineering/release/evidence/ and engineering/.reports/ are never written (check:release-dryrun
//     proves it by hashing them before and after).
// Nothing here is evidence of anything: no person, device, screen reader, licence, run or review exists behind these records.
//
// The ledger problem (found by this dry run): the gate demands a release approval and a CI-run record that name the exact HEAD commit, yet both are
// files in the repository, so recording them creates a new commit and they name the previous one. The sandbox can only reach a green gate by keeping
// them out of git's tracked files. `recordInTree()` shows the honest in-tree flow failing.
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { projectDir, repoRoot, tempDir } from './git.mjs';
import { buildClient } from './client-fixture.mjs';
import { assembleCandidate } from './site.mjs';
import { buildManifest } from './hashed.mjs';
import { fixtureRecord } from './evidence-fixtures.mjs';
import { loadSpec } from './evidence.mjs';

export const SYNTH = 'SYNTHETIC DRY-RUN FIXTURE (not an approval, not evidence)';
export const TODAY = () => new Date().toISOString().slice(0, 10);
const sha = (b) => createHash('sha256').update(b).digest('hex');
const deep = (o) => JSON.parse(JSON.stringify(o));
const LEDGER = 'docs/JADE_AND_EMBER_APPROVALS.md';
const TARGETS = ['iphone-safari', 'android-chrome', 'sr-nvda-firefox', 'sr-voiceover-macos-safari', 'sr-talkback-android-chrome', 'desktop-chrome', 'desktop-firefox', 'desktop-safari', 'ci-run'];
const SKIP_ANY = new Set(['node_modules', '.reports', '__pycache__', '.lighthouseci', 'shots']);
const SKIP_TOP = new Set(['release', 'host', 'hashed', 'tests', 'tools', 'QA.md']);
const GIT = ['-c', 'user.name=Dry Run', '-c', 'user.email=dry-run@invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null'];

export const personaRecord = (id, { commit, tree, date = TODAY(), tag = '' }) => {
  const { record, files } = fixtureRecord(id, { commit, tree, date, tag });
  if (record.type === 'ci-run') return { record: { ...record, by: 'synthetic dry-run (no real run)', summary: 'SYNTHETIC DRY-RUN: no workflow ran and nothing was verified.', url: 'https://github.com/synthetic-dry-run/none/actions/runs/1' }, files };
  record.build.package = 'SYNTHETIC DRY-RUN: no package was tested';
  record.tester = { name: 'Dry-run Persona', role: 'synthetic dry-run persona (not a person)' };
  record.attestation = { ...record.attestation, signedBy: 'Dry-run Persona' };
  const mark = (o) => { for (const v of Object.values(o)) v.note = `SYNTHETIC. ${v.note}`; };
  mark(record.results.session); for (const p of Object.values(record.results.pages)) mark(p);
  return { record, files };
};

// ---- the sandbox
export function createSandbox({ flavour = 'client' } = {}) {
  const root = tempDir('dryrun'), proj = join(root, 'jade-and-ember');
  const g = (...a) => spawnSync('git', [...GIT, ...a], { cwd: root, encoding: 'utf8' });
  const sb = { root, proj, flavour, spec: loadSpec(), base: null, head: null, parent: null, assetsTree: null, digest: null, records: new Map(), ledgerBase: '', verifyBase: null };
  const p = (rel) => join(proj, rel);
  // the real project, minus everything a release does not read
  cpSync(projectDir, proj, { recursive: true, filter: (src) => { const parts = relative(projectDir, src).split(sep).filter(Boolean); return !parts.some((x) => SKIP_ANY.has(x)) && !(parts.length === 1 && SKIP_TOP.has(parts[0])); } });
  symlinkSync(join(projectDir, 'node_modules'), p('node_modules'));
  mkdirSync(join(root, 'docs'), { recursive: true });
  cpSync(join(repoRoot, LEDGER), join(root, LEDGER));
  for (const f of ['.gitignore']) if (existsSync(join(repoRoot, f))) cpSync(join(repoRoot, f), join(root, f));
  mkdirSync(join(root, '.git', 'info'), { recursive: true });
  g('init', '-q');
  appendFileSync(join(root, '.git', 'info', 'exclude'), ['jade-and-ember/node_modules', LEDGER, 'jade-and-ember/engineering/release/evidence/*.json', 'jade-and-ember/engineering/release/evidence/files/', 'jade-and-ember/engineering/.reports/', ''].join('\n'));
  sb.ledgerBase = readFileSync(join(root, LEDGER), 'utf8');
  g('add', '-A'); g('commit', '-q', '-m', 'synthetic dry run: copy of the demonstration');
  sb.parent = g('rev-parse', 'HEAD').stdout.trim();

  // the synthetic client configuration (the same edits the project's own client fixture uses), then version 1.0.0
  const edit = (name, o) => {
    if (name !== 'client') return;
    if (flavour === 'demo-label') { o.flags.demo = true; o.seo.noindex = true; o.seo.structuredData = false; delete o.seo.business; return; }
    Object.assign(o.seo, { host: 'cloudflare-pages', urlStyle: 'clean', crawlers: { search: 'allow', aiSearch: 'allow', training: 'disallow' } });
  };
  {
    const b = buildClient({ edit, base: 'https://www.jade-and-ember-fixture.com', label: 'dryrun-cfg' });
    if (b.status !== 0) { rmSync(root, { recursive: true, force: true }); rmSync(b.root, { recursive: true, force: true }); throw new Error(`the synthetic client configuration does not build:\n${b.text}`); }
    for (const f of readdirSync(b.cfgDir)) cpSync(join(b.cfgDir, f), p(`config/${f}`));
    rmSync(b.root, { recursive: true, force: true });
  }
  sb.setVersion = (version, channel) => {
    const v = JSON.parse(readFileSync(p('VERSION.json'), 'utf8')); v.version = version; v.channel = channel; writeFileSync(p('VERSION.json'), JSON.stringify(v, null, 2) + '\n');
    const k = JSON.parse(readFileSync(p('package.json'), 'utf8')); k.version = version; writeFileSync(p('package.json'), JSON.stringify(k, null, 2) + '\n');
  };
  if (flavour !== 'demo-label') sb.setVersion('1.0.0', 'client-production');
  // the crawler review: a person has to re-read the providers' pages; the sandbox copy says so synthetically
  const cr = JSON.parse(readFileSync(p('engineering/search-crawler-verification.json'), 'utf8'));
  cr.confirmedByPerson = true; cr.dryRunNote = `${SYNTH}: confirmedByPerson was set by the dry-run harness; no person re-read anything.`;
  writeFileSync(p('engineering/search-crawler-verification.json'), JSON.stringify(cr, null, 2));
  // the recorded asset manifest is regenerated for the new bytes, as a reviewed change to a client project would do
  spawnSync(process.execPath, [p('engineering/tools/asset-manifest.mjs'), '--write'], { cwd: proj, encoding: 'utf8' });
  g('add', '-A'); g('commit', '-q', '-m', 'synthetic dry run: client configuration');
  sb.base = g('rev-parse', 'HEAD').stdout.trim();

  // ---- running the real tool
  sb.git = (...a) => g(...a);
  sb.tool = (args, o = {}) => { const r = spawnSync(process.execPath, [p('engineering/tools/release.mjs'), ...args], { cwd: proj, encoding: 'utf8', timeout: 120000, ...o }); return { status: r.status, out: (r.stdout || '') + (r.stderr || ''), stdout: r.stdout || '', stderr: r.stderr || '' }; };
  sb.gate = (extra = []) => {
    const r = sb.tool(['gate', ...extra]);
    const reqs = [...r.stdout.matchAll(/^ {2}(ok {2}|FAIL) {2}([\w:-]+): (.*)$/gm)].map((m) => ({ ok: m[1].startsWith('ok'), id: m[2], detail: m[3] }));
    return { ...r, reqs, allowed: /^gate: ALLOWED/m.test(r.stdout), blocked: /^gate: BLOCKED/m.test(r.stdout), deployment: /deployment approved: (true|false)/.exec(r.stdout)?.[1] || null, failing: reqs.filter((x) => !x.ok).map((x) => x.id) };
  };

  // ---- synthetic records, written only inside the sandbox
  sb.rows = () => {
    const d = TODAY();
    return [
      `| REL-JE-901 | ${d} | release-approval | ${SYNTH}. Release approval for the synthetic client. channel: client-production; version: ${JSON.parse(readFileSync(p('VERSION.json'), 'utf8')).version}; commit: ${sb.head} | none | none |`,
      `| RIGHTS-JE-901 | ${d} | rights-verification | ${SYNTH}. Verified by Dry-run Persona; sources reviewed: none, nothing exists to review; ${d} | none | none |`,
      `| SRCH-JE-901 | ${d} | search-review | ${SYNTH}. Reviewed by Dry-run Persona on ${d}: business facts, structured data, crawler policy. digest: ${sb.digest} | none | none |`,
    ];
  };
  sb.writeLedger = (text) => { mkdirSync(join(root, 'docs'), { recursive: true }); writeFileSync(join(root, LEDGER), text); };
  sb.readLedger = () => readFileSync(join(root, LEDGER), 'utf8');
  sb.writeVerify = (o = {}) => { mkdirSync(p('engineering/.reports'), { recursive: true }); writeFileSync(p('engineering/.reports/verify.json'), JSON.stringify({ mode: 'full', passed: true, commit: sb.head, dirty: false, assetsTree: sb.assetsTree, results: [{ id: 'SYNTHETIC-DRY-RUN', passed: true, seconds: 0, problems: [], notes: [`${SYNTH}: no check ran; this report was written by the dry-run harness`] }], ...o }, null, 2)); };
  sb.evDir = () => p(sb.spec.attachmentDir.replace(/\/files$/, ''));
  sb.writeRecords = () => {
    const dir = sb.evDir(); mkdirSync(dir, { recursive: true });
    for (const f of existsSync(dir) ? readdirSync(dir) : []) if (f.endsWith('.json')) rmSync(join(dir, f));
    rmSync(join(dir, 'files'), { recursive: true, force: true });
    for (const [id, e] of sb.records) { writeFileSync(join(dir, e.file), JSON.stringify(e.record, null, 2)); for (const [k, v] of e.files) { const t = p(k); mkdirSync(join(t, '..'), { recursive: true }); writeFileSync(t, v); } }
  };
  // recompute everything that depends on HEAD and on the delivered bytes, then rewrite the synthetic records for it
  sb.rebind = () => {
    sb.head = g('rev-parse', 'HEAD').stdout.trim();
    const dir = assembleCandidate(proj, 'dryrun-tree'); sb.assetsTree = buildManifest(dir).treeSha256; rmSync(dir, { recursive: true, force: true });
    sb.digest = /^digest: ([0-9a-f]{64})/m.exec(sb.tool(['search-digest']).stdout)?.[1] || null;
    sb.records = new Map();
    for (const id of TARGETS) { const { record, files } = personaRecord(id, { commit: sb.head, tree: sb.assetsTree }); sb.records.set(id, { file: `${id}.${TODAY()}.json`, record, files }); }
    sb.ledgerBase = sb.ledgerBase.replace(/\n\| (REL|RIGHTS|SRCH)-JE-901 \|.*$/gm, '').replace(/\n+$/, '\n');
    sb.base = sb.base;
    sb.ledgerSynthetic = sb.ledgerBase + sb.rows().join('\n') + '\n';
    sb.writeLedger(sb.ledgerSynthetic); sb.writeRecords(); sb.writeVerify();
    if (!sb.snap) sb.snap = { records: new Map([...sb.records].map(([k, e]) => [k, { file: e.file, record: deep(e.record), files: new Map(e.files) }])), ledger: sb.ledgerSynthetic, verify: readFileSync(p('engineering/.reports/verify.json'), 'utf8'), assetsTree: sb.assetsTree, digest: sb.digest };   // the green baseline, taken once
  };
  // put the sandbox back to the fully green state
  sb.restore = () => {
    g('reset', '-q', '--hard', sb.base); g('clean', '-fdq');
    sb.head = sb.base; sb.assetsTree = sb.snap.assetsTree; sb.digest = sb.snap.digest; sb.rebindError = null; sb.records = new Map([...sb.snap.records].map(([k, e]) => [k, { file: e.file, record: deep(e.record), files: new Map(e.files) }]));
    sb.writeLedger(sb.snap.ledger); sb.writeRecords(); mkdirSync(p('engineering/.reports'), { recursive: true }); writeFileSync(p('engineering/.reports/verify.json'), sb.snap.verify);
    rmSync(p('release'), { recursive: true, force: true });
  };
  // a change that is committed (the tree stays clean), after which the synthetic records are re-bound to the new HEAD: a single defect remains
  sb.committed = (fn, msg = 'synthetic dry run: change') => { fn(); g('add', '-A'); g('commit', '-q', '-m', msg); try { sb.rebind(); } catch (e) { sb.head = g('rev-parse', 'HEAD').stdout.trim(); sb.rebindError = e.message; } };
  // the same, but the records are NOT re-bound: sign-off for a build that no longer exists
  sb.committedUnbound = (fn, msg = 'synthetic dry run: change after sign-off') => { fn(); g('add', '-A'); g('commit', '-q', '-m', msg); sb.head = g('rev-parse', 'HEAD').stdout.trim(); };
  // the honest in-tree flow: the ledger rows and records are committed (git add -f), which moves HEAD past the commit they name
  sb.recordInTree = () => { g('add', '-A'); g('add', '-f', LEDGER, 'jade-and-ember/engineering/release/evidence'); g('commit', '-q', '-m', 'synthetic dry run: record the approval and the evidence'); sb.head = g('rev-parse', 'HEAD').stdout.trim(); };
  sb.editRecord = (id, fn) => { fn(sb.records.get(id).record); sb.writeRecords(); };
  sb.dropRecord = (id) => { sb.records.delete(id); sb.writeRecords(); };
  sb.edit = (rel, fn) => { const t = p(rel); const v = fn(readFileSync(t, 'utf8')); writeFileSync(t, v); };
  sb.json = (rel, fn) => { const t = p(rel); const o = JSON.parse(readFileSync(t, 'utf8')); fn(o); writeFileSync(t, JSON.stringify(o, null, 2) + '\n'); };
  sb.destroy = () => rmSync(root, { recursive: true, force: true });
  sb.rebind();
  sb.base = sb.head;
  return sb;
}

export const hashOf = (path) => { try { return sha(readFileSync(path)); } catch { return null; } };
