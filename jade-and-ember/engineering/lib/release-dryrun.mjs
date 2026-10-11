// The release readiness dry run (Gate 5 Phase 7, APR-JE-035; rebuilt for release model v2 in G6-2, APR-JE-039). It runs the REAL release tool
// (engineering/tools/release.mjs) against a SYNTHETIC build inside a throwaway copy of the project, so that the success path and every blocker can be
// exercised without touching the demonstration, the real records, the real reviewer table or any report.
//
// What is synthetic, and how it is kept apart from real release records:
//   * the sandbox is a temporary folder with its own git repository; it is deleted when the run ends and nothing in it is ever copied back;
//   * the synthetic reviewers, approvals, evidence records and verification record exist only inside it, say SYNTHETIC in their own text, and are bound to the
//     sandbox's own candidate artifact digest, so none of them can mean anything for the real build;
//   * the real docs/JADE_AND_EMBER_APPROVALS.md, engineering/release/{approvals,evidence,deployments}/, reviewers.json, demonstrations.json and
//     engineering/.reports/ are never written (check:release-dryrun proves it by hashing them before and after).
// Nothing here is evidence of anything: no person, device, screen reader, licence, run or review exists behind these records.
//
// Release model v2 changes the flow the dry run follows: the records are COMMITTED (git add), because they are bound to the candidate artifact digest and not to
// HEAD, so committing them does not invalidate them. That is the RG-01 scenario ("the committed-ledger flow reaches green"); in model v1 the same flow could never
// pass, which is why the v1 sandbox had to keep the records out of git.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { projectDir, repoRoot, tempDir } from './git.mjs';
import { buildClient } from './client-fixture.mjs';
import { fixtureRecord } from './evidence-fixtures.mjs';
import { loadSpec } from './evidence.mjs';
import { APPROVAL_SCHEMA, DEPLOYMENT_SCHEMA, REVIEWERS_SCHEMA, SEARCH_REVIEWED } from './records.mjs';
import { buildVerificationRecord, sealOf } from './verification.mjs';

export const SYNTH = 'SYNTHETIC DRY-RUN FIXTURE (not an approval, not evidence)';
export const TODAY = () => new Date().toISOString().slice(0, 10);
const sha = (b) => createHash('sha256').update(b).digest('hex');
const deep = (o) => JSON.parse(JSON.stringify(o));
const LEDGER = 'docs/JADE_AND_EMBER_APPROVALS.md';
const TARGETS = ['iphone-safari', 'android-chrome', 'sr-nvda-firefox', 'sr-voiceover-macos-safari', 'sr-talkback-android-chrome', 'desktop-chrome', 'desktop-firefox', 'desktop-safari', 'ci-run'];
const SKIP_ANY = new Set(['node_modules', '.reports', '__pycache__', '.lighthouseci', 'shots']);
const SKIP_TOP = new Set(['release', 'host', 'hashed', 'tests', 'tools', 'QA.md']);
const GIT = ['-c', 'user.name=Dry Run', '-c', 'user.email=dry-run@invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null'];

// the synthetic reviewers: personas, not people
export const PERSONA = {
  owner: { reviewer: 'R-91', name: 'Dry-run Owner Persona' },
  rights: { reviewer: 'R-92', name: 'Dry-run Rights Persona' },
  deployer: { reviewer: 'R-93', name: 'Dry-run Deployer Persona' },
};
const ALL = ['release-approval', 'rights-verification', 'search-review'];
export const reviewerTable = () => ({
  $comment: `${SYNTH}: personas written by the dry-run harness inside a throwaway copy.`, schema: REVIEWERS_SCHEMA, establishedBy: 'APR-JE-001',
  reviewers: [
    { id: 'R-91', name: PERSONA.owner.name, role: 'synthetic dry-run persona (not a person)', mayApprove: ALL, mayReject: ALL, mayRevoke: [...ALL, 'deployment-authorisation'], validFrom: '2026-01-01', validTo: null },
    { id: 'R-92', name: PERSONA.rights.name, role: 'synthetic dry-run persona (not a person)', mayApprove: ['rights-verification'], mayReject: ['rights-verification'], mayRevoke: [], validFrom: '2026-01-01', validTo: null },
    { id: 'R-93', name: PERSONA.deployer.name, role: 'synthetic dry-run persona (not a person)', mayApprove: ['deployment-authorisation'], mayReject: ['deployment-authorisation'], mayRevoke: ['deployment-authorisation'], validFrom: '2026-01-01', validTo: null },
  ],
});

export const personaRecord = (id, { commit, tree, candidate, engine, registry, checks, date = TODAY(), tag = '' }) => {
  const { record, files } = fixtureRecord(id, { commit, tree, candidate, engine, registry, checks, date, tag });
  if (record.type === 'ci-run') return { record: { ...record, by: 'synthetic dry-run (no real run)', summary: 'SYNTHETIC DRY-RUN: no workflow ran and nothing was verified.', url: record.url, verification: { ...record.verification, runId: '123456', seal: sha('synthetic ci seal').slice(0, 64) } }, files };
  record.build.package = 'SYNTHETIC DRY-RUN: no package was tested';
  record.tester = { name: 'Dry-run Persona', role: 'synthetic dry-run persona (not a person)' };
  record.attestation = { ...record.attestation, signedBy: 'Dry-run Persona' };
  const mark = (o) => { for (const v of Object.values(o)) v.note = `SYNTHETIC. ${v.note}`; };
  mark(record.results.session); for (const p of Object.values(record.results.pages)) mark(p);
  return { record, files };
};

// the helper that reads the sandbox's own libraries (so the sandbox is judged by its own copy of the code), run outside the sandbox's git repository
const HELPER = `import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
const proj = process.cwd();
const imp = (p) => import(pathToFileURL(join(proj, 'engineering', p)).href);
const { assembleCandidate } = await imp('lib/site.mjs');
const { computeCandidate } = await imp('lib/candidate.mjs');
const { searchDigest } = await imp('lib/search-digest.mjs');
const { buildManifest } = await imp('lib/hashed.mjs');
const V = await imp('lib/verification.mjs');
const dir = assembleCandidate(proj, 'dryrun-state');
try {
  const c = computeCandidate({ siteDir: dir });
  const ids = V.expectedCheckIds();
  process.stdout.write(JSON.stringify({ candidate: c, engineDigest: V.engineDigest(), ids, registry: V.registryDigest(ids), searchDigest: searchDigest(dir), assetsTree: buildManifest(dir).treeSha256 }));
} finally { rmSync(dir, { recursive: true, force: true }); }
`;

// ---- the sandbox
export function createSandbox({ flavour = 'client' } = {}) {
  const root = tempDir('dryrun'), proj = join(root, 'jade-and-ember'), aux = tempDir('dryaux');
  writeFileSync(join(aux, 'helper.mjs'), HELPER);
  const g = (...a) => spawnSync('git', [...GIT, ...a], { cwd: root, encoding: 'utf8' });
  const sb = { root, proj, flavour, spec: loadSpec(), base: null, head: null, parent: null, configCommit: null, state: null, verifyText: null, rebindError: null };
  const p = (rel) => join(proj, rel);
  // the real project, minus everything a release does not read
  cpSync(projectDir, proj, { recursive: true, filter: (src) => { const parts = relative(projectDir, src).split(sep).filter(Boolean); return !parts.some((x) => SKIP_ANY.has(x)) && !(parts.length === 1 && SKIP_TOP.has(parts[0])); } });
  symlinkSync(join(projectDir, 'node_modules'), p('node_modules'));
  mkdirSync(join(root, 'docs'), { recursive: true });
  cpSync(join(repoRoot, LEDGER), join(root, LEDGER));
  for (const f of ['.gitignore']) if (existsSync(join(repoRoot, f))) cpSync(join(repoRoot, f), join(root, f));
  // the real records never travel into the sandbox: it starts with no approval, no evidence, no deployment authorisation and no reviewer
  for (const fam of ['approvals', 'evidence', 'deployments']) { const d = p(`engineering/release/${fam}`); for (const f of existsSync(d) ? readdirSync(d) : []) if (f.endsWith('.json')) rmSync(join(d, f)); rmSync(join(d, 'files'), { recursive: true, force: true }); }
  g('init', '-q');
  g('add', '-A'); g('commit', '-q', '-m', 'synthetic dry run: copy of the demonstration');
  sb.parent = g('rev-parse', 'HEAD').stdout.trim();

  // the synthetic client configuration (the same edits the project's own client fixture uses), then version 1.0.0
  const edit = (name, o) => {
    if (name !== 'client') return;
    if (flavour === 'demo-label') { o.flags.demo = true; o.seo.noindex = true; o.seo.structuredData = false; delete o.seo.business; return; }
    Object.assign(o.seo, { host: 'cloudflare-pages', urlStyle: 'clean', crawlers: { search: 'allow', aiSearch: 'allow', training: 'disallow' } });
  };
  if (flavour !== 'demo') {
    const b = buildClient({ edit, base: 'https://www.jade-and-ember-fixture.com', label: 'dryrun-cfg' });
    if (b.status !== 0) { rmSync(root, { recursive: true, force: true }); rmSync(b.root, { recursive: true, force: true }); throw new Error(`the synthetic client configuration does not build:\n${b.text}`); }
    for (const f of readdirSync(b.cfgDir)) cpSync(join(b.cfgDir, f), p(`config/${f}`));
    rmSync(b.root, { recursive: true, force: true });
  }
  sb.setVersion = (version, channel) => {
    const v = JSON.parse(readFileSync(p('VERSION.json'), 'utf8')); v.version = version; v.channel = channel; writeFileSync(p('VERSION.json'), JSON.stringify(v, null, 2) + '\n');
    const k = JSON.parse(readFileSync(p('package.json'), 'utf8')); k.version = version; writeFileSync(p('package.json'), JSON.stringify(k, null, 2) + '\n');
  };
  if (flavour === 'client') sb.setVersion('1.0.0', 'client-production');
  // the crawler review: a person has to re-read the providers' pages; the sandbox copy says so synthetically
  const cr = JSON.parse(readFileSync(p('engineering/search-crawler-verification.json'), 'utf8'));
  cr.confirmedByPerson = true; cr.dryRunNote = `${SYNTH}: confirmedByPerson was set by the dry-run harness; no person re-read anything.`;
  writeFileSync(p('engineering/search-crawler-verification.json'), JSON.stringify(cr, null, 2));
  // the recorded asset manifest is regenerated for the new bytes, as a reviewed change to a client project would do
  spawnSync(process.execPath, [p('engineering/tools/asset-manifest.mjs'), '--write'], { cwd: proj, encoding: 'utf8' });
  g('add', '-A'); g('commit', '-q', '-m', 'synthetic dry run: configuration');
  sb.configCommit = g('rev-parse', 'HEAD').stdout.trim();

  // ---- running the real tool
  sb.git = (...a) => g(...a);
  sb.tool = (args, o = {}) => { const r = spawnSync(process.execPath, [p('engineering/tools/release.mjs'), ...args], { cwd: proj, encoding: 'utf8', timeout: 180000, ...o }); return { status: r.status, out: (r.stdout || '') + (r.stderr || ''), stdout: r.stdout || '', stderr: r.stderr || '' }; };
  sb.gate = (extra = []) => {
    const r = sb.tool(['gate', ...extra]);
    const reqs = [...r.stdout.matchAll(/^ {2}(ok {2}|FAIL) {2}([\w:-]+): (.*)$/gm)].map((m) => ({ ok: m[1].startsWith('ok'), id: m[2], detail: m[3] }));
    return { ...r, reqs, allowed: /^gate: ALLOWED/m.test(r.stdout), blocked: /^gate: BLOCKED/m.test(r.stdout), deployment: /deployment approved: (true|false)/.exec(r.stdout)?.[1] || null, failing: reqs.filter((x) => !x.ok).map((x) => x.id) };
  };
  sb.audit = (family) => { const r = spawnSync(process.execPath, [p('engineering/tools/release-audit.mjs'), family], { cwd: proj, encoding: 'utf8', timeout: 180000 }); return { status: r.status, out: (r.stdout || '') + (r.stderr || '') }; };
  // what the sandbox's own code computes for the sandbox's own build
  sb.measure = () => {
    const r = spawnSync(process.execPath, [join(aux, 'helper.mjs')], { cwd: proj, encoding: 'utf8', timeout: 180000 });
    if (r.status !== 0) throw new Error(`the sandbox could not measure itself:\n${r.stdout}${r.stderr}`);
    return JSON.parse(r.stdout);
  };

  // ---- the synthetic records, written inside the sandbox only
  const dirOf = (fam) => p(`engineering/release/${fam}`);
  sb.dir = dirOf;
  const version = () => JSON.parse(readFileSync(p('VERSION.json'), 'utf8')).version;
  const channel = () => (flavour === 'client' ? 'client-production' : 'demonstration');
  // a record bound to the sandbox's current candidate artifact; `over` is merged on top (subject and decidedBy are merged too)
  sb.record = (type, over = {}) => {
    const prefix = { 'release-approval': 'REL', 'rights-verification': 'RIGHTS', 'search-review': 'SRCH', 'deployment-authorisation': 'DEP' }[type];
    const host = new URL(JSON.parse(readFileSync(p('config/client.json'), 'utf8')).seo.baseUrl || 'https://x.invalid').hostname;
    const subject = type === 'release-approval' ? { productionHost: host }
      : type === 'search-review' ? { searchDigest: sb.state.searchDigest, reviewed: [...SEARCH_REVIEWED] }
      : type === 'rights-verification' ? { sources: ['none: nothing exists to review (synthetic)'], verifiedOn: TODAY() }
      : { releaseApproval: 'REL-JE-901', targetHost: host };
    const { subject: so, decidedBy: db, ...rest } = over;
    return {
      schema: type === 'deployment-authorisation' ? DEPLOYMENT_SCHEMA : APPROVAL_SCHEMA, id: `${prefix}-JE-901`, type, status: 'approved',
      candidate: sb.state.candidate.digest, channel: channel(), version: version(), subject: { ...subject, ...(so || {}) },
      decidedBy: { ...(type === 'deployment-authorisation' ? PERSONA.deployer : PERSONA.owner), ...(db || {}) },
      decidedAt: `${TODAY()}T09:00:00Z`, rationale: `${SYNTH}. No person decided this.`, ...rest,
    };
  };
  sb.fileOf = (rec) => `${rec.id}.json`;
  sb.put = (rec, fam = rec.type === 'deployment-authorisation' ? 'deployments' : 'approvals', file = null) => { mkdirSync(dirOf(fam), { recursive: true }); writeFileSync(join(dirOf(fam), file || sb.fileOf(rec)), JSON.stringify(rec, null, 2) + '\n'); };
  sb.drop = (name, fam = 'approvals') => rmSync(join(dirOf(fam), name), { force: true });
  sb.read = (name, fam = 'approvals') => JSON.parse(readFileSync(join(dirOf(fam), name), 'utf8'));
  sb.mutate = (name, fn, fam = 'approvals') => { const r = sb.read(name, fam); fn(r); writeFileSync(join(dirOf(fam), name), JSON.stringify(r, null, 2) + '\n'); };
  sb.writeReviewers = (t = reviewerTable()) => writeFileSync(p('engineering/release/reviewers.json'), JSON.stringify(t, null, 2) + '\n');
  // the verification record: the sandbox's real candidate and engine digests and its own list of checks, SYNTHETIC because no check ran
  sb.verifyRecord = () => {
    const s = sb.state;
    const r = buildVerificationRecord({ mode: 'full', results: s.ids.map((id) => ({ id, passed: true, seconds: 0 })), candidate: s.candidate, engine: s.engineDigest, registry: s.registry, commit: sb.head || sb.configCommit, dirty: false, startedAt: `${TODAY()}T08:00:00Z`, finishedAt: `${TODAY()}T08:01:00Z`, env: {} });
    r.environment.platform = `${SYNTH}: no check ran; written by the dry-run harness`;   // the record is closed: the marker lives in a field the verifier writes
    r.seal = sealOf(r);
    return r;
  };
  // overrides are applied to the record; the seal is recomputed unless reseal is false (a hand-edit leaves the old seal)
  sb.writeVerify = (fn = null, { reseal = true } = {}) => {
    const r = sb.verifyRecord();
    if (fn) { const stale = r.seal; fn(r); r.seal = reseal ? sealOf(r) : stale; }
    mkdirSync(p('engineering/.reports'), { recursive: true }); writeFileSync(p('engineering/.reports/verify.json'), JSON.stringify(r, null, 2));
  };
  sb.evDir = () => p(sb.spec.attachmentDir.replace(/\/files$/, ''));
  sb.writeEvidence = () => {
    const dir = sb.evDir(); mkdirSync(dir, { recursive: true });
    for (const f of readdirSync(dir)) if (f.endsWith('.json')) rmSync(join(dir, f));
    rmSync(join(dir, 'files'), { recursive: true, force: true });
    sb.records = new Map();
    for (const id of TARGETS) {
      const { record, files } = personaRecord(id, { commit: sb.configCommit, tree: sb.state.assetsTree, candidate: sb.state.candidate.digest, engine: sb.state.engineDigest, registry: sb.state.registry, checks: sb.state.ids.length });
      const file = `${id}.${TODAY()}.json`;
      sb.records.set(id, { file, record, files });
      writeFileSync(join(dir, file), JSON.stringify(record, null, 2));
      for (const [k, v] of files) { const t = p(k); mkdirSync(join(t, '..'), { recursive: true }); writeFileSync(t, v); }
    }
  };
  sb.editRecord = (id, fn) => { const e = sb.records.get(id); fn(e.record); writeFileSync(join(sb.evDir(), e.file), JSON.stringify(e.record, null, 2)); };
  sb.dropRecord = (id) => { const e = sb.records.get(id); rmSync(join(sb.evDir(), e.file), { force: true }); sb.records.delete(id); };
  sb.edit = (rel, fn) => { const t = p(rel); writeFileSync(t, fn(readFileSync(t, 'utf8'))); };
  sb.json = (rel, fn) => { const t = p(rel); const o = JSON.parse(readFileSync(t, 'utf8')); fn(o); writeFileSync(t, JSON.stringify(o, null, 2) + '\n'); };
  sb.writeLedger = (text) => writeFileSync(join(root, LEDGER), text);
  sb.readLedger = () => readFileSync(join(root, LEDGER), 'utf8');
  const commit = (msg) => { g('add', '-A'); const r = g('commit', '-q', '-m', msg); sb.head = g('rev-parse', 'HEAD').stdout.trim(); return r; };
  sb.commit = commit;

  // (re)write every synthetic record for the sandbox's CURRENT candidate artifact, then commit them. The digest does not depend on them, so this cannot move it.
  sb.rebind = () => {
    sb.state = sb.measure();
    sb.writeReviewers();
    if (flavour === 'client') {
      // (a build without search artifacts, such as a noindex one, has no search digest and so nothing a search review could be bound to)
      for (const t of ['release-approval', 'rights-verification', 'search-review']) { if (t === 'search-review' && !sb.state.searchDigest) { sb.drop('SRCH-JE-901.json'); continue; } sb.put(sb.record(t)); }
      sb.writeEvidence();
    }
    sb.writeVerify();
    commit('synthetic dry run: record the approvals and the evidence');
  };
  // put the sandbox back to the fully green state
  sb.restore = () => {
    writeFileSync(join(root, '.git', 'info', 'exclude'), '');   // (a scenario may have told git to ignore a record)
    g('reset', '-q', '--hard', sb.base); g('clean', '-fdq');
    sb.head = sb.base; sb.state = sb.baseState; sb.rebindError = null;
    mkdirSync(p('engineering/.reports'), { recursive: true }); writeFileSync(p('engineering/.reports/verify.json'), sb.verifyText);
    rmSync(p('release'), { recursive: true, force: true });
    if (flavour === 'client') { sb.records = new Map(); for (const id of TARGETS) { const file = readdirSync(sb.evDir()).find((f) => f.startsWith(`${id}.`) && f.endsWith('.json')); sb.records.set(id, { file, record: JSON.parse(readFileSync(join(sb.evDir(), file), 'utf8')), files: new Map() }); } }
  };
  // a change that is committed (the tree stays clean), after which the synthetic records are re-bound to the new candidate: a single defect remains
  // (a reviewed change to a client project regenerates the recorded asset manifest, so a changed delivered file does not also look like a stale manifest;
  // pass { regen: false } to keep whatever the change wrote there)
  sb.committed = (fn, msg = 'synthetic dry run: change', { regen = true } = {}) => { fn(); if (regen) spawnSync(process.execPath, [p('engineering/tools/asset-manifest.mjs'), '--write'], { cwd: proj, encoding: 'utf8' }); commit(msg); try { sb.rebind(); } catch (e) { sb.rebindError = e.message; } };
  // the same, but the records are NOT re-bound: sign-off for an artifact that no longer exists
  sb.committedUnbound = (fn, msg = 'synthetic dry run: change after sign-off') => { fn(); commit(msg); };
  // a change to the records only (committed): the candidate digest cannot change
  sb.recordsChange = (fn, msg = 'synthetic dry run: change to the records') => { fn(); commit(msg); };
  sb.destroy = () => { rmSync(root, { recursive: true, force: true }); rmSync(aux, { recursive: true, force: true }); };

  sb.head = g('rev-parse', 'HEAD').stdout.trim();
  sb.rebind();
  sb.base = sb.head; sb.baseState = sb.state; sb.verifyText = readFileSync(p('engineering/.reports/verify.json'), 'utf8');
  return sb;
}

export const hashOf = (path) => { try { return sha(readFileSync(path)); } catch { return null; } };
void deep;
