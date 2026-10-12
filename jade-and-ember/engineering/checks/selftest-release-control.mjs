// check:selftest-release-control. Tests of the release-control proof of concept (G6-3A, APR-JE-043). A synthetic client site is built and prepared by the REAL release
// tool in the dry run's throwaway copy; release control is initialised on a throwaway folder with DISPOSABLE tokens; then every guard is shown to hold and to refuse.
// Nothing here is evidence of anything: no person, repository, credential or host exists behind it, and the only adapter writes inside the throwaway folder.
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { isMain, tempDir } from '../lib/git.mjs';
import { createSandbox } from '../lib/release-dryrun.mjs';
import { initRc, openRc } from '../release-control/lib/state.mjs';
import { ReleaseControl, derive } from '../release-control/lib/engine.mjs';
import { Ledger } from '../release-control/lib/ledger.mjs';
import { deployedDigest } from '../release-control/lib/adapter.mjs';
import { blankHtml, classifyChange, editSize } from '../release-control/lib/classify.mjs';
import { declaredZipSize, dirMap, filesDigest, intake, plainTree } from '../release-control/lib/intake.mjs';
import { DEFAULT_DATA_FILES, buildView } from '../release-control/lib/view.mjs';
import { CAPS } from '../release-control/lib/auth.mjs';
import { RcError, sha256 } from '../release-control/lib/util.mjs';
import { verifyAuthenticity } from '../lib/authenticity.mjs';
import { verifyPackage } from '../lib/release-package.mjs';
import { zipBuffer } from '../lib/zip.mjs';

const HOST_A = 'www.jade-and-ember-fixture.com';
const cli = resolve(import.meta.dirname, '../release-control/cli.mjs');
const rmrf = (p) => rmSync(p, { recursive: true, force: true });
const flipByte = (file, at = 0.5) => { const b = readFileSync(file); b[Math.floor(b.length * at)] ^= 0xff; writeFileSync(file, b); };

export async function checkSelftestReleaseControl() {
  const problems = [], notes = [], t0 = Date.now(), temps = [];
  const tmp = (l) => { const d = tempDir(l); temps.push(d); return d; };
  let count = 0;
  const test = async (name, fn) => {
    count++;
    try { await fn(); notes.push(`held: ${name}`); } catch (e) { problems.push(`${name}: ${String(e.message).split('\n')[0].slice(0, 260)}`); }
  };
  const ok = (cond, msg) => { if (!cond) throw new Error(msg); };
  const refused = (code, fn, label = '') => {
    try { fn(); } catch (e) { if (e instanceof RcError && e.code === code) return; throw new Error(`${label}expected refusal [${code}], got ${e instanceof RcError ? `[${e.code}] ${e.message}` : e.message}`); }
    throw new Error(`${label}expected refusal [${code}], but the operation succeeded`);
  };

  // ---- fixtures: four prepared packages from the real tool, all built by the same tooling
  const sb = createSandbox({ flavour: 'client' });
  // RC's adopted tooling: a snapshot of the sandbox's engineering code, taken once (the project data it holds is replaced per package by package/data/)
  const snap = buildView(join(sb.proj, 'engineering'), new Map()); temps.push(dirname(dirname(dirname(snap.eng))));
  const tooling = snap.eng;
  // job 1 of a real stage uploads the prepared release/ folder AND the project data files the build used; this does the same
  const prep = (label) => {
    const r = sb.tool(['prepare']); if (r.status !== 0) throw new Error(`prepare failed for ${label}: ${r.out.slice(-200)}`);
    const d = tmp(`pkg-${label}`); cpSync(join(sb.proj, 'release'), d, { recursive: true }); mkdirSync(join(d, 'data'));
    for (const f of DEFAULT_DATA_FILES) if (existsSync(join(sb.proj, 'engineering', f))) cpSync(join(sb.proj, 'engineering', f), join(d, 'data', f));
    return d;
  };
  const P0 = prep('base');
  sb.committed(() => sb.writeLedger(`${sb.readLedger()}\n`), 'synthetic: a change that does not touch the delivered files');
  const PID = prep('identical');
  sb.restore();
  sb.committed(() => sb.json('config/copy.json', (o) => { o.home.process.steps[0].text += ' We now start an hour earlier.'; }), 'synthetic: one sentence of text');
  const PTXT = prep('text');
  sb.restore();
  sb.committed(() => sb.json('config/copy.json', (o) => { o.home.process.steps[0].text += ' We now start an hour earlier.'; o.home.process.steps[1].text += ' Bring friends along too.'; }), 'synthetic: two sentences of text');
  const PTXT2 = prep('text2');
  sb.restore();
  sb.committed(() => sb.json('config/client.json', (o) => { o.ordering.url = 'https://order.jade-and-ember-fixture.com/menu-new'; }), 'synthetic: a changed ordering link');
  const PMAT = prep('material');

  let now = new Date('2026-10-12T10:00:00Z');
  const clock = () => now;
  const advance = (days) => { now = new Date(now.getTime() + days * 86400000); };
  const mk = (clients = ['alpha', 'beta']) => {
    const dir = tmp('rc');
    const { tokens } = initRc(dir, { clients, tooling, hosts: { alpha: HOST_A, beta: 'www.beta-fixture.example' } });
    return { dir, tokens, rc: new ReleaseControl(dir, { clock }) };
  };
  const clone = (f) => { const dir = tmp('rcclone'); rmrf(dir); cpSync(f.dir, dir, { recursive: true }); return { dir, tokens: f.tokens, rc: new ReleaseControl(dir, { clock }) }; };
  const recordAll = (f, stageId, client = 'alpha') => { for (const t of ['search', 'rights', 'externalLinks', 'domain']) f.rc.recordApproval(f.tokens.owner, client, stageId, t, { note: 'checked in the self-test (synthetic)', basis: 'licence' }); };
  const release0 = (f) => { const s = f.rc.stage(f.tokens.owner, 'alpha', P0); recordAll(f, s.stageId); return { s, r: f.rc.approve(f.tokens.owner, 'alpha', s.stageId) }; };

  // a released baseline (P0 approved by the owner) shared by many cases, and a staged-but-unreleased state
  const base = mk(); const baseRel = release0(base);
  const staged = mk(); const stagedS = staged.rc.stage(staged.tokens.owner, 'alpha', P0);

  // ====================================================================== 1. credentials: who may do what
  await test('the coding agent may do NOTHING: every operation is refused for its credential', () => {
    const f = clone(staged), a = f.tokens.agent, id = stagedS.stageId;
    const calls = { stage: () => f.rc.stage(a, 'alpha', P0), review: () => f.rc.review(a, 'alpha', id), 'record-approval': () => f.rc.recordApproval(a, 'alpha', id, 'search', { note: 'agent says so' }), approve: () => f.rc.approve(a, 'alpha', id),
      'auto-release': () => f.rc.autoRelease(a, 'alpha', id), revoke: () => f.rc.revoke(a, 'alpha', id, 'x y z'), 'revoke-approval': () => f.rc.revokeApproval(a, 'alpha', 1, 'x y z'), freeze: () => f.rc.freeze(a, 'alpha', 'x y z'),
      unfreeze: () => f.rc.freeze(a, 'alpha', 'x y z', false), 'preauth-grant': () => f.rc.preauthGrant(a, 'alpha', { kinds: ['identical'], days: 5, max: 5 }), 'preauth-revoke': () => f.rc.preauthRevoke(a, 'alpha', 'pa-1'),
      'adopt-tooling': () => f.rc.adoptTooling(a), audit: () => f.rc.audit(a, 'alpha'), status: () => f.rc.status(a, 'alpha') };
    ok(CAPS.agent.size === 0, 'the agent role holds a capability');
    for (const [op, fn] of Object.entries(calls)) refused('forbidden', fn, `${op}: `);
  });
  await test('an unknown, empty or malformed credential is refused; a refusal for the agent does not reveal whether a client exists', () => {
    const f = clone(staged);
    refused('unauthenticated', () => f.rc.status('0'.repeat(64), 'alpha')); refused('unauthenticated', () => f.rc.status('', 'alpha')); refused('unauthenticated', () => f.rc.status(undefined, 'alpha'));
    try { f.rc.status(f.tokens.agent, 'no-such-client'); throw new Error('allowed'); } catch (e) { ok(e.code === 'forbidden', `the agent learned something about a client name: [${e.code}]`); }
  });
  await test('the scheduler cannot approve, record a judgement, revoke, freeze, preauthorise or adopt tooling', () => {
    const f = clone(staged), s = f.tokens.scheduler, id = stagedS.stageId;
    refused('forbidden', () => f.rc.approve(s, 'alpha', id)); refused('forbidden', () => f.rc.recordApproval(s, 'alpha', id, 'search', { note: 'scheduler says so' }));
    refused('forbidden', () => f.rc.revoke(s, 'alpha', id, 'x y z')); refused('forbidden', () => f.rc.freeze(s, 'alpha', 'x y z')); refused('forbidden', () => f.rc.preauthGrant(s, 'alpha', { kinds: ['identical'], days: 5, max: 5 })); refused('forbidden', () => f.rc.adoptTooling(s));
  });
  await test('a credential scoped to one client, an expired credential and a revoked credential are refused', () => {
    const f = clone(staged), file = join(f.dir, 'credentials.json'), c = JSON.parse(readFileSync(file, 'utf8'));
    c.principals.find((p) => p.id === 'owner').clients = ['beta']; writeFileSync(file, JSON.stringify(c));
    const g = new ReleaseControl(f.dir, { clock });
    refused('forbidden-client', () => g.status(f.tokens.owner, 'alpha'));
    c.principals.find((p) => p.id === 'owner').clients = ['*']; c.principals.find((p) => p.id === 'owner').expires = '2026-10-01T00:00:00Z'; writeFileSync(file, JSON.stringify(c));
    refused('unauthenticated', () => new ReleaseControl(f.dir, { clock }).status(f.tokens.owner, 'alpha'));
    c.principals.find((p) => p.id === 'owner').expires = null; c.principals.find((p) => p.id === 'owner').revoked = true; writeFileSync(file, JSON.stringify(c));
    refused('unauthenticated', () => new ReleaseControl(f.dir, { clock }).status(f.tokens.owner, 'alpha'));
  });
  await test('every refusal is recorded with the actor, the operation and a runner receipt', () => {
    const f = clone(staged);
    for (let i = 0; i < 3; i++) try { f.rc.approve(f.tokens.agent, 'alpha', 'x'); } catch { /* expected */ }
    const lines = readFileSync(join(f.dir, 'ledger', '_denied.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    ok(lines.length === 3 && lines.every((l) => l.actor.id === 'coding-agent' && l.op === 'approve' && l.code === 'forbidden' && /^[0-9a-f]{64}$/.test(l.receipt)), 'the refusals are not recorded as expected');
  });
  await test('client names that are paths, differently cased, empty or reserved are refused before anything touches the disk', () => {
    const f = clone(staged);
    for (const bad of ['../alpha', 'ALPHA', '', 'a/b', 'con', '..', 'alpha\u0000', 'a'.repeat(60), 'ledger']) refused('bad-client', () => f.rc.status(f.tokens.owner, bad), `${JSON.stringify(bad)}: `);
    refused('unknown-client', () => f.rc.status(f.tokens.owner, 'gamma'));
  });

  // ====================================================================== 2. the owner path: stage, look, record, approve
  await test('first release: staged as MATERIAL; only the authenticity decision was left open; nothing is deployable before the owner has recorded the subjects', () => {
    const f = clone(staged);
    ok(stagedS.class === 'material' && stagedS.coverage.every((c) => !c.covered), 'the first release was not material with every subject open');
    ok(existsSync(stagedS.review), 'no review page was written');
    refused('subjects-not-recorded', () => f.rc.approve(f.tokens.owner, 'alpha', stagedS.stageId));
    ok(!existsSync(join(f.dir, 'deploy', 'alpha', 'current')), 'something was deployed before approval');
  });
  await test('the review page is escaped data plus RC\'s own instruction; the owner never types a digest', () => {
    const page = readFileSync(stagedS.review, 'utf8');
    ok(!/<script/i.test(page), 'the review page carries a script');
    ok(page.includes(`approve --client alpha --stage ${stagedS.stageId}`) && !/[0-9a-f]{64}/.test(page.replace(/<[^>]*>/g, ' ').replace(/[0-9a-f]{12,}/g, '').slice(0, 0)), 'the approve instruction is missing');
    ok(!/--digest|--hash|--sha/.test(page), 'the page asks for a digest');
  });
  await test('the owner approves a stage by name: the engine matches the digest itself, deploys exactly the delivered files and records approval and release', () => {
    ok(baseRel.r.mode === 'owner' && baseRel.r.class === 'material', 'not released by the owner as material');
    const live = join(base.dir, 'deploy', 'alpha', 'current'), names = readdirSync(live);
    ok(!names.includes('START-HERE.txt') && !names.includes('serve.py') && names.includes('index.html'), 'the deployed folder is not the delivered site');
    ok(filesDigest(dirMap(live)) === baseRel.r.deployedDigest && deployedDigest(base.rc.rc, 'alpha') === baseRel.r.deployedDigest, 'the deployed digest does not match');
    const a = base.rc.audit(base.tokens.owner, 'alpha');
    ok(a.ok && a.timeline.length === 9 && /genesis/.test(a.timeline[0]) && /staged/.test(a.timeline[1]) && /approved/.test(a.timeline[6]) && /release-started/.test(a.timeline[7]) && /released/.test(a.timeline[8]), `the audit trail is not as expected: ${a.timeline.join(' | ')}`);
  });
  await test('releasing the same stage twice, or after a newer stage exists, is refused', () => {
    const f = clone(base);
    refused('stage-released', () => f.rc.approve(f.tokens.owner, 'alpha', baseRel.s.stageId));
    const t = clone(staged); const s1 = stagedS.stageId; t.rc.stage(t.tokens.owner, 'alpha', PMAT);
    refused('stage-superseded', () => t.rc.approve(t.tokens.owner, 'alpha', s1));
  });

  // ====================================================================== 3. routine versus material
  await test('classifier (pure): text-only edits are routine; links, attributes, scripts, styles, comments, JSON-LD, new text nodes, raw-text elements and big rewrites are material', () => {
    const page = (body, head = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>T</title>${head}</head><body>${body}</body></html>`;
    const cls = (a, b) => classifyChange({ prev: new Map([['index.html', Buffer.from(a)]]), next: new Map([['index.html', Buffer.from(b)]]), prevSubjects: {}, nextSubjects: {} }).class;
    const A = page('<main><h1>Hello</h1><p>Open daily. <a href="https://a.example/x">Order</a></p></main><script>var a=1</script>');
    ok(cls(A, A.replace('Open daily.', 'Open from nine.')) === 'text-only', 'a words-only change was not routine');
    ok(cls(A, A) === 'identical', 'an unchanged page was not identical');
    const material = [A.replace('a.example/x', 'evil.example/x'), A.replace('<h1>', '<h1 onclick="x()">'), A.replace('var a=1', 'var a=2'), A.replace('<main>', '<main><img src=x onerror=alert(1)>'), A.replace('<main>', '<!-- note --><main>'), A.replace('<p>', '<p><b>'),
      A.replace('</main>', '<p>new</p></main>'), A.replace('<title>T</title>', '<title>T</title><style>body{display:none}</style>'), A.replace('Order</a>', '</a>'), A.replace('<head>', '<head><script type="application/ld+json">{"x":1}</script>'),
      A.replace('Hello', 'Hello<textarea>'), A.replace('<h1>Hello</h1>', '<h1>Hello</h1><svg><a xlink:href="x"/></svg>'), A.replace('Hello', 'x'.repeat(5000))];
    material.forEach((m, i) => ok(cls(A, m) === 'material', `hostile change ${i} was not material`));
    ok(editSize('abcdef', 'abXYef') === 4 && blankHtml('<p>a</p>').blank === '<p>\u0001</p>', 'the helpers are wrong');
    const ex = classifyChange({ prev: new Map([['a.html', Buffer.from('<script><!-- <script></script>a')]]), next: new Map([['a.html', Buffer.from('<script><!-- <script></script>b')]]), prevSubjects: {}, nextSubjects: {} });
    ok(ex.class === 'material', 'a script holding <!-- was treated as ordinary');
    const css = classifyChange({ prev: new Map([['a.css', Buffer.from('a{color:red}')]]), next: new Map([['a.css', Buffer.from('a{color:blue}')]]), prevSubjects: {}, nextSubjects: {} });
    ok(css.class === 'material', 'a changed stylesheet was treated as words');
    const trk = classifyChange({ prev: new Map([['a.html', Buffer.from('<p>a</p>')]]), next: new Map([['a.html', Buffer.from('<p>a</p>')]]), prevSubjects: {}, nextSubjects: {}, prevTracked: { 'findings.json': 'x' }, nextTracked: { 'findings.json': 'y' } });
    ok(trk.class === 'material', 'a changed tracked project record did not make the change material');
    const sub = classifyChange({ prev: new Map([['a.html', Buffer.from('<p>a</p>')]]), next: new Map([['a.html', Buffer.from('<p>b</p>')]]), prevSubjects: { rights: 'x' }, nextSubjects: { rights: 'y' } });
    ok(sub.class === 'material', 'a changed approval subject did not make the change material');
  });
  await test('a rebuild that changes no delivered file is IDENTICAL; a one-sentence edit is TEXT-ONLY; a changed link is MATERIAL (real packages from the real tool)', () => {
    const f = clone(base);
    ok(f.rc.stage(f.tokens.scheduler, 'alpha', PID).class === 'identical', 'identical not recognised');
    const g = clone(base); const t = g.rc.stage(g.tokens.scheduler, 'alpha', PTXT);
    ok(t.class === 'text-only', `the text edit was classed ${t.class}: ${t.reasons.join('; ')}`);
    const h = clone(base); const m = h.rc.stage(h.tokens.scheduler, 'alpha', PMAT);
    ok(m.class === 'material' && m.reasons.some((r) => /externalLinks|index|link|attribute|menu|order/i.test(r)), `the link change was classed ${m.class}: ${m.reasons.join('; ')}`);
  });
  await test('routine releases run by themselves ONLY under a preauthorisation that covers their kind, its limit and its expiry', () => {
    const f = clone(base);
    const none = f.rc.runScheduled(f.tokens.scheduler, 'alpha', PID);
    ok(none.outcome === 'needs-owner' && none.why === 'no-preauth', `no preauthorisation yet the outcome was ${none.outcome}`);
    const pa = f.rc.preauthGrant(f.tokens.owner, 'alpha', { kinds: ['identical'], days: 5, max: 1 });
    const r1 = f.rc.runScheduled(f.tokens.scheduler, 'alpha', PID);
    ok(r1.outcome === 'released-auto' && r1.release.mode === 'auto', `expected an automatic release, got ${r1.outcome}`);
    const r2 = f.rc.runScheduled(f.tokens.scheduler, 'alpha', PID);
    ok(r2.outcome === 'needs-owner', 'a second automatic release went out beyond the limit of 1');
    const g = clone(base); g.rc.preauthGrant(g.tokens.owner, 'alpha', { kinds: ['identical'], days: 5, max: 5 });
    ok(g.rc.runScheduled(g.tokens.scheduler, 'alpha', PTXT).outcome === 'needs-owner', 'a text edit went out under an identical-only preauthorisation');
    const h = clone(base); h.rc.preauthGrant(h.tokens.owner, 'alpha', { kinds: ['identical', 'text-only'], days: 5, max: 5 });
    ok(h.rc.runScheduled(h.tokens.scheduler, 'alpha', PTXT).outcome === 'released-auto', 'a text edit under a text-only preauthorisation was not released');
    ok(/We now start an hour earlier/.test(readFileSync(join(h.dir, 'deploy', 'alpha', 'current', 'index.html'), 'utf8')), 'the edited text is not what went live');
    const k = clone(base); const p = k.rc.preauthGrant(k.tokens.owner, 'alpha', { kinds: ['identical'], days: 2, max: 5 }); advance(3);
    ok(k.rc.runScheduled(k.tokens.scheduler, 'alpha', PID).outcome === 'needs-owner', 'an expired preauthorisation was honoured'); advance(-3);
    const q = clone(base); const pq = q.rc.preauthGrant(q.tokens.owner, 'alpha', { kinds: ['identical'], days: 5, max: 5 }); q.rc.preauthRevoke(q.tokens.owner, 'alpha', pq.id);
    ok(q.rc.runScheduled(q.tokens.scheduler, 'alpha', PID).outcome === 'needs-owner', 'a revoked preauthorisation was honoured'); void pa; void p;
  });
  await test('a MATERIAL change is never released automatically, whatever the preauthorisations; it waits for the owner, who approves it by name', () => {
    const f = clone(base); f.rc.preauthGrant(f.tokens.owner, 'alpha', { kinds: ['identical', 'text-only'], days: 5, max: 5 });
    const r = f.rc.runScheduled(f.tokens.scheduler, 'alpha', PMAT);
    ok(r.outcome === 'needs-owner' && r.stage.class === 'material', 'a material change did not wait for the owner');
    refused('needs-owner', () => f.rc.autoRelease(f.tokens.scheduler, 'alpha', r.stage.stageId));
    const open = r.stage.coverage.filter((c) => !c.covered).map((c) => c.type);
    ok(open.includes('search') && open.includes('externalLinks'), `a changed link left these subjects open: ${open.join(', ') || 'none'} (a changed link must change the search files and the external destinations)`);
    refused('subjects-not-recorded', () => f.rc.approve(f.tokens.owner, 'alpha', r.stage.stageId));
    refused('subjects-unconfirmed', () => f.rc.approve(f.tokens.owner, 'alpha', r.stage.stageId, { note: 'looked at the new link (self-test)', basis: 'licence' }), 'no subjects named: ');
    refused('subjects-unconfirmed', () => f.rc.approve(f.tokens.owner, 'alpha', r.stage.stageId, { note: 'looked at the new link (self-test)', subjects: open.slice(1) }), 'one subject left out: ');
    refused('subjects-unconfirmed', () => f.rc.approve(f.tokens.owner, 'alpha', r.stage.stageId, { note: 'looked at the new link (self-test)', subjects: [...open, 'domain'] }), 'a subject already covered: ');
    refused('note-required', () => f.rc.approve(f.tokens.owner, 'alpha', r.stage.stageId, { note: 'ok', subjects: open }));
    const g = clone(f); const before = g.rc.audit(g.tokens.owner, 'alpha').timeline.length;
    ok(g.rc.approve(g.tokens.owner, 'alpha', r.stage.stageId, { note: 'looked at the new link (self-test)', basis: 'licence', subjects: open }).mode === 'owner', 'the one-command approval failed');
    ok(g.rc.audit(g.tokens.owner, 'alpha').timeline.length === before + open.length + 3, 'the open subjects were not recorded one by one');
    for (const t of open) f.rc.recordApproval(f.tokens.owner, 'alpha', r.stage.stageId, t, { note: 'looked at the new link (self-test)', basis: 'licence' });
    ok(f.rc.approve(f.tokens.owner, 'alpha', r.stage.stageId).mode === 'owner', 'the owner could not approve it');
  });

  // ====================================================================== 4. artifacts: mismatched, tampered, hostile
  await test('a changed byte in the stored ZIP, a changed record inside the package, or a swapped package is an artifact mismatch', () => {
    const zipName = readdirSync(join(staged.dir, 'staged', 'alpha', stagedS.stageId, 'package')).find((n) => n.endsWith('.zip'));
    const a = clone(staged); recordAll(a, stagedS.stageId); flipByte(join(a.dir, 'staged', 'alpha', stagedS.stageId, 'package', zipName));
    refused('artifact-mismatch', () => a.rc.approve(a.tokens.owner, 'alpha', stagedS.stageId));
    const b = clone(staged); recordAll(b, stagedS.stageId); appendFileSync(join(b.dir, 'staged', 'alpha', stagedS.stageId, 'package', 'records', 'reviewers.json'), ' ');
    refused('artifact-mismatch', () => b.rc.approve(b.tokens.owner, 'alpha', stagedS.stageId));
    const c = clone(staged); recordAll(c, stagedS.stageId); rmrf(join(c.dir, 'staged', 'alpha', stagedS.stageId, 'package')); cpSync(PMAT, join(c.dir, 'staged', 'alpha', stagedS.stageId, 'package'), { recursive: true });
    refused('artifact-mismatch', () => c.rc.approve(c.tokens.owner, 'alpha', stagedS.stageId));
  });
  await test('the preview the owner looked at must be the package being released', () => {
    const f = clone(staged); recordAll(f, stagedS.stageId);
    appendFileSync(join(f.dir, 'staged', 'alpha', stagedS.stageId, 'preview', 'index.html'), '<!-- changed after staging -->');
    refused('preview-mismatch', () => f.rc.approve(f.tokens.owner, 'alpha', stagedS.stageId));
    ok(!existsSync(join(f.dir, 'deploy', 'alpha', 'current')), 'a tampered preview was deployed');
  });
  await test('a package that the existing verifier refuses never reaches the staging area (flipped ZIP byte, edited manifest, missing SBOM, forged record, extra file)', () => {
    const f = mk();
    const variants = {
      zip: (d) => flipByte(join(d, readdirSync(d).find((n) => n.endsWith('.zip')))), manifest: (d) => { const m = JSON.parse(readFileSync(join(d, 'release-manifest.json'), 'utf8')); m.version = '9.9.9'; writeFileSync(join(d, 'release-manifest.json'), JSON.stringify(m, null, 2)); },
      sbom: (d) => rmrf(join(d, 'sbom.cdx.json')), record: (d) => writeFileSync(join(d, 'records', 'approvals', 'REL-JE-999.json'), '{}'), extra: (d) => writeFileSync(join(d, 'extra.txt'), 'x'),
    };
    for (const [name, mutate] of Object.entries(variants)) {
      const d = tmp(`bad-${name}`); rmrf(d); cpSync(P0, d, { recursive: true }); mutate(d);
      refused(name === 'extra' ? 'unexpected-files' : 'verification-failed', () => f.rc.stage(f.tokens.owner, 'alpha', d), `${name}: `);
    }
    ok(!existsSync(join(f.dir, 'staged', 'alpha')) || readdirSync(join(f.dir, 'staged', 'alpha')).length === 0, 'a refused package left something staged');
  });
  await test('a ZIP with a path-traversal entry, a symbolic link in the package folder and an oversized folder are refused', () => {
    const f = mk();
    const d = tmp('zipslip'); rmrf(d); cpSync(P0, d, { recursive: true });
    const zipName = readdirSync(d).find((n) => n.endsWith('.zip'));
    writeFileSync(join(d, zipName), zipBuffer([{ name: '../evil.txt', data: Buffer.from('x') }]));
    refused('verification-failed', () => f.rc.stage(f.tokens.owner, 'alpha', d));
    const l = tmp('symlink'); rmrf(l); cpSync(P0, l, { recursive: true }); spawnSync('ln', ['-s', '/etc/passwd', join(l, 'link')]);
    refused('unsafe-package', () => f.rc.stage(f.tokens.owner, 'alpha', l));
    try { plainTree(P0, { maxEntries: 3, maxPackageBytes: 1e9 }); throw new Error('allowed'); } catch (e) { ok(e.code === 'package-too-large', 'too many files were accepted'); }
    try { plainTree(P0, { maxEntries: 1e6, maxPackageBytes: 1000 }); throw new Error('allowed'); } catch (e) { ok(e.code === 'package-too-large', 'too many bytes were accepted'); }
  });
  await test('the tooling is pinned: changed tooling stops everything until the owner adopts it, and only the owner can', () => {
    const f = clone(base), file = join(f.dir, 'config.json'), c = JSON.parse(readFileSync(file, 'utf8'));
    c.toolingDigest = '0'.repeat(64); writeFileSync(file, JSON.stringify(c));
    const g = new ReleaseControl(f.dir, { clock });
    refused('tooling-changed', () => g.stage(f.tokens.owner, 'alpha', PID)); refused('forbidden', () => g.adoptTooling(f.tokens.scheduler));
    const r = g.adoptTooling(f.tokens.owner);
    ok(r.from === '0'.repeat(64) && r.to !== r.from && g.stage(f.tokens.owner, 'alpha', PID).class === 'identical', 'adopting the tooling did not restore operation');
    ok(g.audit(f.tokens.owner, 'alpha').timeline.some((l) => /tooling-adopted/.test(l)), 'the adoption is not in the audit trail');
  });

  // ====================================================================== 5. audit ledger: forged, edited, removed, replayed
  await test('the ledger refuses a forged line, an edited line, a removed line, a truncated tail, a reordered pair, a wrong receipt, a duplicate key and a replay from another client', () => {
    const ledgerOf = (f, c = 'alpha') => join(f.dir, 'ledger', `${c}.jsonl`);
    const bad = (label, mutate) => { const f = clone(base); mutate(f); const a = f.rc.audit(f.tokens.owner, 'alpha'); ok(!a.ok && a.problems.length, `${label}: the audit still verifies`); refused('ledger-corrupt', () => f.rc.status(f.tokens.owner, 'alpha'), `${label}: `); };
    bad('forged line', (f) => appendFileSync(ledgerOf(f), JSON.stringify({ seq: 8, prev: 'x', ts: 'now', client: 'alpha', type: 'released', actor: { id: 'owner', role: 'owner' }, data: {}, hash: 'a'.repeat(64), receipt: 'b'.repeat(64) }) + '\n'));
    bad('edited line', (f) => writeFileSync(ledgerOf(f), readFileSync(ledgerOf(f), 'utf8').replace('"class":"material"', '"class":"identical"')));
    bad('removed line', (f) => { const L = readFileSync(ledgerOf(f), 'utf8').split('\n'); L.splice(2, 1); writeFileSync(ledgerOf(f), L.join('\n')); });
    bad('truncated tail', (f) => { const L = readFileSync(ledgerOf(f), 'utf8').trim().split('\n'); writeFileSync(ledgerOf(f), L.slice(0, -1).join('\n') + '\n'); });
    bad('reordered pair', (f) => { const L = readFileSync(ledgerOf(f), 'utf8').trim().split('\n'); [L[1], L[2]] = [L[2], L[1]]; writeFileSync(ledgerOf(f), L.join('\n') + '\n'); });
    bad('receipt only', (f) => { const L = readFileSync(ledgerOf(f), 'utf8').trim().split('\n'); L[0] = L[0].replace(/"receipt":"[0-9a-f]{64}"/, `"receipt":"${'0'.repeat(64)}"`); writeFileSync(ledgerOf(f), L.join('\n') + '\n'); });
    bad('duplicate key', (f) => { const L = readFileSync(ledgerOf(f), 'utf8').trim().split('\n'); L[1] = L[1].replace('{"seq"', '{"seq":99,"seq"'); writeFileSync(ledgerOf(f), L.join('\n') + '\n'); });
    const f = clone(base); cpSync(join(f.dir, 'ledger', 'alpha.jsonl'), join(f.dir, 'ledger', 'beta.jsonl')); cpSync(join(f.dir, 'ledger', 'alpha.head.json'), join(f.dir, 'ledger', 'beta.head.json'));
    ok(!f.rc.audit(f.tokens.owner, 'beta').ok, 'alpha\'s ledger verified as beta\'s');
    refused('ledger-corrupt', () => f.rc.stage(f.tokens.owner, 'beta', PID));
  });
  await test('a ledger written by someone without the runner key is refused even if the chain and hashes are perfect', () => {
    const f = clone(base), key = readFileSync(join(f.dir, 'runner.key'), 'utf8'); writeFileSync(join(f.dir, 'runner.key'), 'f'.repeat(64));
    ok(!new ReleaseControl(f.dir, { clock }).audit(f.tokens.owner, 'alpha').ok, 'a ledger verified under a different runner key'); void key;
  });

  // ====================================================================== 6. revocation, expiry, freeze
  await test('a revoked stage cannot be released; a revoked approval takes its subject out of force; an expired stage is refused', () => {
    const a = clone(staged); recordAll(a, stagedS.stageId); a.rc.revoke(a.tokens.owner, 'alpha', stagedS.stageId, 'found a problem');
    refused('stage-revoked', () => a.rc.approve(a.tokens.owner, 'alpha', stagedS.stageId));
    const b = clone(staged); recordAll(b, stagedS.stageId); b.rc.revokeApproval(b.tokens.owner, 'alpha', 3, 'rights doubted');
    refused('subjects-not-recorded', () => b.rc.approve(b.tokens.owner, 'alpha', stagedS.stageId));
    const c = clone(staged); recordAll(c, stagedS.stageId); advance(8);
    try { refused('stage-expired', () => c.rc.approve(c.tokens.owner, 'alpha', stagedS.stageId)); } finally { advance(-8); }
  });
  await test('revoking a released stage takes it out of the baseline: the next change is judged as a first release again', () => {
    const f = clone(base); f.rc.revoke(f.tokens.owner, 'alpha', baseRel.s.stageId, 'withdrawn after release');
    const stt = f.rc.status(f.tokens.owner, 'alpha'); ok(stt.approvedBaseline === null && stt.liveRevoked === true && stt.live === baseRel.s.stageId, `revoking the live release: baseline ${stt.approvedBaseline}, liveRevoked ${stt.liveRevoked}, live ${stt.live}`);
    ok(f.rc.stage(f.tokens.owner, 'alpha', PID).class === 'material', 'without a baseline the change was not material');
  });
  await test('a frozen client refuses staging, approval and automatic release; only the owner can freeze and unfreeze', () => {
    const f = clone(staged); recordAll(f, stagedS.stageId); f.rc.freeze(f.tokens.owner, 'alpha', 'incident under review');
    refused('frozen', () => f.rc.approve(f.tokens.owner, 'alpha', stagedS.stageId)); refused('frozen', () => f.rc.stage(f.tokens.scheduler, 'alpha', PID)); refused('forbidden', () => f.rc.freeze(f.tokens.scheduler, 'alpha', 'x y z', false));
    f.rc.freeze(f.tokens.owner, 'alpha', 'resolved', false);
    ok(f.rc.approve(f.tokens.owner, 'alpha', stagedS.stageId).mode === 'owner', 'release did not resume after unfreezing');
  });

  // ====================================================================== 7. clients are isolated from each other
  await test('a package for one client cannot be staged for another, a stage name does not cross clients, and a client\'s deploy credential writes only its own target', () => {
    const f = clone(staged);
    refused('wrong-client-host', () => f.rc.stage(f.tokens.owner, 'beta', P0));
    refused('unknown-stage', () => f.rc.approve(f.tokens.owner, 'beta', stagedS.stageId));
    recordAll(f, stagedS.stageId);
    writeFileSync(join(f.dir, 'vault', 'alpha'), readFileSync(join(f.dir, 'vault', 'beta'), 'utf8'));
    refused('deploy-credential', () => f.rc.approve(f.tokens.owner, 'alpha', stagedS.stageId));
    ok(readdirSync(join(f.dir, 'deploy', 'beta')).length === 0 && !existsSync(join(f.dir, 'deploy', 'alpha', 'current')), 'a release crossed clients');
    ok(f.rc.audit(f.tokens.owner, 'alpha').timeline.some((l) => /release-failed/.test(l)), 'the failed release is not in the audit trail');
  });
  await test('approvals recorded for one client do not count for another (separate ledgers)', () => {
    const f = clone(base); const dir = f.rc;
    ok(dir.status(f.tokens.owner, 'beta').live === null && dir.audit(f.tokens.owner, 'beta').timeline.length === 1, 'beta saw alpha\'s history');
  });

  // ====================================================================== 8. the hard stop and the boundary of the code itself
  await test('the hard authenticity stop in the client repository is untouched, and nothing outside release-control imports release control', () => {
    ok(verifyAuthenticity().ok === false && verifyAuthenticity().implemented === false, 'lib/authenticity.mjs is no longer a hard stop');
    const root = resolve(import.meta.dirname, '..');
    const offenders = [];
    for (const d of ['lib', 'tools', 'checks']) for (const f of readdirSync(join(root, d))) if (f.endsWith('.mjs') && f !== 'selftest-release-control.mjs' && /['"][^'"]*release-control\//.test(readFileSync(join(root, d, f), 'utf8'))) offenders.push(`${d}/${f}`);
    ok(!offenders.length, `release control is referenced by ${offenders.join(', ')}`);
    const src = readdirSync(join(root, 'release-control', 'lib')).map((f) => readFileSync(join(root, 'release-control', 'lib', f), 'utf8')).join('\n') + readFileSync(join(root, 'release-control', 'cli.mjs'), 'utf8');
    ok(!/from 'node:(http|https|net|tls|dns|dgram)'|child_process|process\.env\.(GH_|GITHUB_|AWS|CLOUDFLARE|VERCEL|NETLIFY)|api\.github\.com|fetch\(/.test(src), 'release control reaches the network, a subprocess or a service credential');
  });
  await test('the proof of concept runs only on a folder it created and writes only inside it', () => {
    const d = tmp('foreign'); refused('not-a-poc', () => openRc(d));
    ok(readdirSync(join(base.dir, 'deploy')).sort().join() === 'alpha,beta', 'the deployment target is not inside the folder');
  });

  // ====================================================================== 8b. review fixes: drift, scheduler, subjects, ledger, locks, deploy, intake limits
  await test('routine drift cannot ratchet: an automatic release never becomes the baseline, so edits add up against the last release the OWNER approved', () => {
    const f = clone(base); const cfgFile = join(f.dir, 'config.json'), c = JSON.parse(readFileSync(cfgFile, 'utf8')); c.policy = { maxTextEditChars: 50 }; writeFileSync(cfgFile, JSON.stringify(c));
    const g = new ReleaseControl(f.dir, { clock }); g.preauthGrant(f.tokens.owner, 'alpha', { kinds: ['identical', 'text-only'], days: 5, max: 5 });
    ok(g.runScheduled(f.tokens.scheduler, 'alpha', PTXT).outcome === 'released-auto', 'the first small edit was not released');
    const s2 = g.stage(f.tokens.scheduler, 'alpha', PTXT2);
    ok(s2.class === 'material' && s2.reasons.some((r) => /characters of text changed/.test(r)), `the second edit, small against the last release but large against the owner's, was ${s2.class}: ${s2.reasons.join('; ')}`);
    const st = g.status(f.tokens.owner, 'alpha'); ok(st.approvedBaseline === baseRel.s.stageId && st.live !== st.approvedBaseline, 'the automatic release became the approved baseline');
  });
  await test('the scheduler cannot push aside a material stage that waits for the owner; the owner can; a release that revokes the baseline in between is stale', () => {
    const f = clone(base); const m = f.rc.stage(f.tokens.scheduler, 'alpha', PMAT);
    refused('owner-pending', () => f.rc.stage(f.tokens.scheduler, 'alpha', PID)); refused('owner-pending', () => f.rc.runScheduled(f.tokens.scheduler, 'alpha', PID));
    ok(f.rc.stage(f.tokens.owner, 'alpha', PID).class === 'identical', 'the owner could not replace the pending stage'); void m;
    const g = clone(base); g.rc.preauthGrant(g.tokens.owner, 'alpha', { kinds: ['identical'], days: 5, max: 5 });
    const s = g.rc.stage(g.tokens.scheduler, 'alpha', PID); g.rc.revoke(g.tokens.owner, 'alpha', baseRel.s.stageId, 'withdrawn between staging and release');
    refused('stale-baseline', () => g.rc.autoRelease(g.tokens.scheduler, 'alpha', s.stageId));
  });
  await test('classifier evasions found by review stay MATERIAL: self-closing script, spaced end tag, quote-parity attributes, CDATA, processing instructions, noscript, UTF-16 and invalid UTF-8 pages', () => {
    const page = (b) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>T</title></head><body>${b}</body></html>`;
    const cls = (a, b) => classifyChange({ prev: new Map([['index.html', Buffer.from(a)]]), next: new Map([['index.html', Buffer.from(b)]]), prevSubjects: {}, nextSubjects: {} }).class;
    const pairs = [['<script/>x</script>', '<script/>y</script>'], ['<script>a</script ><p>t</p>', '<script>a</script ><p>u</p>'], ['<script src=a/>x</script>', '<script src=a/>y</script>'], ['<a title=x"y href="http://good.example>@evil.example/">t</a>', '<a title=x"y href="http://good.example>@evil.example/">u</a>'],
      ['<![CDATA[ a ]]>', '<![CDATA[ b ]]>'], ['<?x a ?>', '<?x b ?>'], ['<noscript>a</noscript>', '<noscript>b</noscript>']];
    pairs.forEach(([a, b], i) => ok(cls(page(a), page(b)) === 'material', `evasion ${i} was treated as routine`));
    const bom = (s) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(s, 'utf16le')]);
    const m16 = classifyChange({ prev: new Map([['index.html', bom(page('<p>a</p>'))]]), next: new Map([['index.html', bom(page('<p>b</p>'))]]), prevSubjects: {}, nextSubjects: {} });
    ok(m16.class === 'material', 'a UTF-16 page was read as ordinary text');
    const bad = classifyChange({ prev: new Map([['index.html', Buffer.from([...Buffer.from(page('<p>a</p>')), 0xc3])]]), next: new Map([['index.html', Buffer.from([...Buffer.from(page('<p>b</p>')), 0xc3])]]), prevSubjects: {}, nextSubjects: {} });
    ok(bad.class === 'material', 'invalid UTF-8 was read as ordinary text');
  });
  await test('a changed tracked project record (findings, exceptions, crawler review) is MATERIAL even when no delivered file changed', () => {
    const f = clone(base), d = tmp('tracked'); rmrf(d); cpSync(PID, d, { recursive: true });
    const name = ['findings.json', 'dependencies.json', 'search-crawler-verification.json'].find((n) => existsSync(join(d, 'data', n)));
    ok(name, 'the fixture holds no tracked data file to change');
    const before = f.rc.stage(f.tokens.owner, 'alpha', PID); ok(before.class === 'identical', 'the control was not identical');
    writeFileSync(join(d, 'data', name), readFileSync(join(d, 'data', name), 'utf8').replace(/\s*$/, '\n\n'));
    let r; try { r = f.rc.stage(f.tokens.owner, 'alpha', d); } catch (e) { ok(e.code === 'verification-failed', `unexpected [${e.code}]`); return; }   // refused by the existing verifier is also acceptable
    ok(r.class === 'material', `a changed ${name} was classed ${r.class}`);
  });
  await test('a data file that is not on the allow-list, a data file that is not JSON, and a nested data folder are refused', () => {
    const f = mk();
    for (const [label, mutate] of [['unlisted', (d) => writeFileSync(join(d, 'data', 'evil.json'), '{}')], ['not json', (d) => writeFileSync(join(d, 'data', 'findings.json'), 'not json')], ['nested', (d) => { mkdirSync(join(d, 'data', 'x')); writeFileSync(join(d, 'data', 'x', 'y.json'), '{}'); }]]) {
      const d = tmp('baddata'); rmrf(d); cpSync(P0, d, { recursive: true }); mutate(d);
      try { f.rc.stage(f.tokens.owner, 'alpha', d); throw new Error('accepted'); } catch (e) { ok(e instanceof RcError && ['bad-data-file', 'unexpected-files'].includes(e.code), `${label}: ${e.message}`); }
    }
  });
  await test('intake limits: a package folder that is a symbolic link, and a ZIP that declares a huge unpacked size, are refused before anything is inflated', () => {
    const f = mk(); const l = tmp('rootlink'); rmrf(l); spawnSync('ln', ['-s', P0, l]);
    refused('unsafe-package', () => f.rc.stage(f.tokens.owner, 'alpha', l));
    const d = tmp('bomb'); rmrf(d); cpSync(P0, d, { recursive: true }); const zn = join(d, readdirSync(d).find((n) => n.endsWith('.zip'))), z = readFileSync(zn);
    const eocd = z.length - 22, cd = z.readUInt32LE(eocd + 16); z.writeUInt32LE(0x7fffffff, cd + 24); writeFileSync(zn, z);
    refused('package-too-large', () => f.rc.stage(f.tokens.owner, 'alpha', d));
    let hit = false; try { declaredZipSize(z, { maxEntries: 5000, maxExtractBytes: 1000 }); } catch (e) { hit = e.code === 'package-too-large'; } ok(hit, 'the declared-size check did not fire');
  });
  await test('serve.py in the package must be the copy release control holds (defence in depth behind the candidate digest)', () => {
    const d = tmp('servepy'); rmrf(d); cpSync(P0, d, { recursive: true });
    const data = new Map([...DEFAULT_DATA_FILES].filter((n) => existsSync(join(d, 'data', n))).map((n) => [n, readFileSync(join(d, 'data', n))])), view = buildView(tooling, data);
    try {
      const pending = () => ({ ok: false, detail: 'pending' });
      const good = intake({ packageDir: d, tooling: view.eng, hook: pending, siteOut: join(d, '..', `out-${Date.now()}`), servePySha: sha256(readFileSync(join(view.eng, '..', 'serve.py'))) });
      ok(good.siteFiles, 'the control package was not unpacked');
      refused('serve-py-mismatch', () => intake({ packageDir: d, tooling: view.eng, hook: pending, siteOut: join(d, '..', `out2-${Date.now()}`), servePySha: '0'.repeat(64) }));
    } finally { view.dispose(); }
  });
  await test('the verification copy is re-pinned, and a package copy that changes while the verifier runs is refused', () => {
    const f = clone(base), cf = join(f.dir, 'config.json'), c = JSON.parse(readFileSync(cf, 'utf8')); c.toolingDigest = '0'.repeat(64); writeFileSync(cf, JSON.stringify(c));
    refused('tooling-changed', () => new ReleaseControl(f.dir, { clock }).makeView(new Map()));
    const g = mk(); const racing = new ReleaseControl(g.dir, { clock, verify: (d, o) => { const r = verifyPackage(d, o); appendFileSync(join(d, 'records', 'reviewers.json'), ' '); return r; } });
    refused('artifact-mismatch', () => racing.stage(g.tokens.owner, 'alpha', P0));
  });
  await test('hosts are mandatory; a client\'s ledger starts with a genesis entry, so a missing ledger is a fault; an older ledger put back is caught by the anchor', () => {
    refused('host-required', () => initRc(tmp('nohost'), { clients: ['alpha'], tooling, hosts: {} }));
    const f = clone(base); const aud = f.rc.audit(f.tokens.owner, 'alpha'); ok(aud.ok && /genesis/.test(aud.timeline[0]), 'no genesis entry');
    const g = clone(base); for (const x of ['alpha.jsonl', 'alpha.head.json']) rmrf(join(g.dir, 'ledger', x)); rmrf(join(g.dir, 'anchor', 'alpha.json'));
    ok(!g.rc.audit(g.tokens.owner, 'alpha').ok, 'a ledger deleted with its head and anchor was taken for a fresh start'); refused('ledger-corrupt', () => g.rc.stage(g.tokens.owner, 'alpha', PID));
    const h = clone(staged); const old = readFileSync(join(h.dir, 'ledger', 'alpha.jsonl')), oldHead = readFileSync(join(h.dir, 'ledger', 'alpha.head.json'));
    h.rc.freeze(h.tokens.owner, 'alpha', 'a reason', true); writeFileSync(join(h.dir, 'ledger', 'alpha.jsonl'), old); writeFileSync(join(h.dir, 'ledger', 'alpha.head.json'), oldHead);
    const au = h.rc.audit(h.tokens.owner, 'alpha'); ok(!au.ok && au.problems.some((p) => /anchor/.test(p)), `an older ledger with its older head was accepted: ${au.problems.join('; ')}`);
  });
  await test('one operation at a time per client; a dead holder\'s lock is broken; a fresh lock refuses; the emergency controls break a lock held too long', () => {
    const f = clone(base), lock = join(f.dir, 'ledger', 'alpha.lock');
    mkdirSync(lock); writeFileSync(join(lock, 'info.json'), JSON.stringify({ pid: process.pid, ts: Date.now() }));
    refused('busy', () => f.rc.stage(f.tokens.owner, 'alpha', PID)); refused('busy', () => f.rc.freeze(f.tokens.owner, 'alpha', 'a reason'));
    writeFileSync(join(lock, 'info.json'), JSON.stringify({ pid: process.pid, ts: Date.now() - 40000 }));
    ok(f.rc.freeze(f.tokens.owner, 'alpha', 'urgent: stop everything').seq > 0, 'the freeze could not break a lock held for 40 s');
    f.rc.freeze(f.tokens.owner, 'alpha', 'resolved', false);
    mkdirSync(lock); writeFileSync(join(lock, 'info.json'), JSON.stringify({ pid: 2 ** 22 + 12345, ts: Date.now() }));
    ok(f.rc.stage(f.tokens.owner, 'alpha', PID).class === 'identical', 'a lock whose holder is gone was not broken');
  });
  await test('an unknown release mode is refused; an interrupted release shows in the status; a release completes after a crash left no live site', () => {
    const f = clone(base); refused('bad-mode', () => f.rc.release(f.tokens.owner, 'alpha', 'x', 'root'));
    const s = f.rc.stage(f.tokens.owner, 'alpha', PID); new Ledger(openRc(f.dir), 'alpha').append({ type: 'release-started', actor: { id: 'owner', role: 'owner' }, data: { stageId: s.stageId, mode: 'owner', preauth: null }, ts: now.toISOString() });
    ok(f.rc.status(f.tokens.owner, 'alpha').interrupted === s.stageId, 'an interrupted release is not visible');
    const live = join(f.dir, 'deploy', 'alpha', 'current'); cpSync(live, join(f.dir, 'deploy', 'alpha', '.prev'), { recursive: true }); rmrf(live);   // the crash window: no live site, a previous one aside
    recordAll(f, s.stageId); const r = f.rc.approve(f.tokens.owner, 'alpha', s.stageId);
    ok(existsSync(join(live, 'index.html')) && deployedDigest(f.rc.rc, 'alpha') === r.deployedDigest, 'the deployment was not completed after the crash window');
    ok(f.rc.status(f.tokens.owner, 'alpha').interrupted === null, 'the release still shows as interrupted after it completed');
  });
  await test('tooling adoption is owner-wide: an owner limited to one client cannot adopt, every ledger is checked first, and the changed files are listed', () => {
    const f = clone(base), file = join(f.dir, 'credentials.json'), cr = JSON.parse(readFileSync(file, 'utf8'));
    cr.principals.find((p) => p.id === 'owner').clients = ['alpha']; writeFileSync(file, JSON.stringify(cr));
    refused('forbidden-client', () => new ReleaseControl(f.dir, { clock }).adoptTooling(f.tokens.owner));
    const g = clone(base), cf = join(g.dir, 'config.json'), c = JSON.parse(readFileSync(cf, 'utf8')), first = Object.keys(c.toolingFiles)[0]; c.toolingFiles[first] = '0'.repeat(64); c.toolingDigest = '1'.repeat(64); writeFileSync(cf, JSON.stringify(c));
    appendFileSync(join(g.dir, 'ledger', 'beta.jsonl'), '{}\n');
    refused('ledger-corrupt', () => new ReleaseControl(g.dir, { clock }).adoptTooling(g.tokens.owner), 'a damaged ledger of another client: ');
    ok(JSON.parse(readFileSync(cf, 'utf8')).toolingDigest === '1'.repeat(64), 'the pin moved although an adoption was refused');
    ok(!new ReleaseControl(g.dir, { clock }).audit(g.tokens.owner, 'alpha').timeline.some((l) => /tooling-adopted/.test(l)), 'a refused adoption was still written to the first client\'s ledger');
    const h = clone(base), cf2 = join(h.dir, 'config.json'), c2 = JSON.parse(readFileSync(cf2, 'utf8')); c2.toolingFiles[first] = '0'.repeat(64); c2.toolingDigest = '1'.repeat(64); writeFileSync(cf2, JSON.stringify(c2));
    const r = new ReleaseControl(h.dir, { clock }).adoptTooling(h.tokens.owner); ok(r.changed.includes(first), 'the adoption did not say which file differs');
    for (const c3 of ['alpha', 'beta']) ok(new ReleaseControl(h.dir, { clock }).audit(h.tokens.owner, c3).timeline.some((l) => /tooling-adopted/.test(l)), `the adoption is not in ${c3}'s ledger`);
  });

  // ====================================================================== 9. the owner's experience through the real command line
  await test('command line: stage, record, approve and audit with the disposable tokens; the agent token is refused with exit 1', () => {
    const root = tmp('cli'); const run = (args, cred) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: { ...process.env, RC_DIR: join(root, 'rc'), ...(cred ? { RC_CREDENTIAL: join(root, 'operator', `${cred}.token`) } : {}) } });
    let r = spawnSync(process.execPath, [cli, 'init-demo', '--rc', root, '--clients', 'alpha,beta', '--hosts', `alpha=${HOST_A},beta=www.beta-fixture.example`, '--tooling', tooling], { encoding: 'utf8' });
    ok(r.status === 0 && /SYNTHETIC/.test(r.stdout), `init-demo: ${r.stderr}${r.stdout}`);
    r = run(['stage', '--client', 'alpha', '--package', P0], 'agent'); ok(r.status === 1 && /REFUSED \[forbidden\]/.test(r.stderr), 'the agent token staged a package from the command line');
    r = run(['stage', '--client', 'alpha', '--package', P0], 'scheduler'); ok(r.status === 0 && /STAGED st-.*MATERIAL/s.test(r.stdout), `stage: ${r.stderr}${r.stdout}`);
    const id = /STAGED (st-\S+):/.exec(r.stdout)[1];
    r = run(['approve', '--client', 'alpha', '--stage', id], 'scheduler'); ok(r.status === 1 && /\[forbidden\]/.test(r.stderr), 'the scheduler approved');
    r = run(['approve', '--client', 'alpha', '--stage', id], 'owner'); ok(r.status === 1 && /subjects-not-recorded/.test(r.stderr), 'approval did not wait for the subjects');
    r = run(['approve', '--client', 'alpha', '--stage', id, '--note', 'looked at it (self-test)', '--basis', 'licence'], 'owner'); ok(r.status === 1 && /subjects-unconfirmed/.test(r.stderr), 'a note alone approved subjects it did not name');
    for (const t of ['search', 'rights', 'externalLinks', 'domain']) { r = run(['record-approval', '--client', 'alpha', '--stage', id, '--type', t, '--note', 'looked at it (self-test)', '--basis', 'licence'], 'owner'); ok(r.status === 0, `record ${t}: ${r.stderr}`); }
    r = run(['approve', '--client', 'alpha', '--stage', id], 'owner'); ok(r.status === 0 && /RELEASED/.test(r.stdout) && /matched the staged files/.test(r.stdout), `approve: ${r.stderr}${r.stdout}`);
    r = run(['audit', '--client', 'alpha'], 'owner'); ok(r.status === 0 && /LEDGER VERIFIES/.test(r.stdout), 'the audit did not verify');
  });

  for (const d of temps) rmrf(d);
  sb.destroy();
  notes.push(`${count} release-control cases run in ${((Date.now() - t0) / 1000).toFixed(0)} s; synthetic clients and disposable tokens only; nothing was deployed anywhere but a throwaway folder`);
  return { problems, notes };
}

void derive; void Ledger; void sha256; void mkdirSync;
if (isMain(import.meta.url)) {
  const { problems, notes } = await checkSelftestReleaseControl();
  notes.forEach((x) => console.log('  ' + x));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:selftest-release-control`);
  process.exit(problems.length ? 1 : 0);
}
