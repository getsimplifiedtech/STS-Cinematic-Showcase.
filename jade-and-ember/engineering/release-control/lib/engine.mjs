// The release-control engine (G6-3A proof of concept; design in G6-3A-DESIGN.md section 4). One class, one ledger per client. Operations (who may run them: auth.mjs):
//   stage            intake + verify a prepared package, classify the change, store the staged copy, write the review page, record "staged"
//   record-approval  the owner's judgement on a subject (rights, search, external links, domain); the subject digest is read from the stage, never typed
//   approve          the owner releases a staged package: every check is repeated on the stored bytes, the digest is matched by the engine, then deploy and record
//   auto-release     the scheduler releases a ROUTINE staged package if a preauthorisation covers it; never a material one
//   revoke, revoke-approval, freeze, unfreeze, preauth-grant, preauth-revoke, adopt-tooling, review, audit, status
// What this does not do: talk to GitHub, hold a real credential, or deploy anywhere but deploy/<client>/ inside its own folder.
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { RcError, addDays, canonicalJson, checkSlug, inside, iso, randomToken, sha256 } from './util.mjs';
import { clientConfig, openRc, pathsOf, readJsonFile, toolingFingerprint, writeJson } from './state.mjs';
import { authenticate, authorize, denied } from './auth.mjs';
import { Ledger, logDenied } from './ledger.mjs';
import { classifyChange } from './classify.mjs';
import { dirMap, filesDigest, intake, plainTree, treeDigest } from './intake.mjs';
import { deployLocal } from './adapter.mjs';
import { buildView, readDataFiles } from './view.mjs';
import { reviewHtml } from './review.mjs';
import { verifyPackage } from '../../lib/release-package.mjs';

export const SUBJECTS = ['search', 'rights', 'externalLinks', 'domain'];
export const PREAUTH_KINDS = ['identical', 'text-only'];
export const MODES = Object.freeze(['owner', 'auto']);

// ---- what the ledger says now (pure; computed from verified entries only)
export function derive(entries, now) {
  const stages = new Map(), preauths = new Map(), approvals = [], revokedApprovals = new Set();
  let frozen = null, latestStage = null, liveStage = null, ownerBaseline = null, startedOpen = null;
  for (const e of entries) {
    const d = e.data;
    if (e.type === 'staged') { stages.set(d.stageId, { entry: e, released: null, revoked: null }); latestStage = d.stageId; }
    else if (e.type === 'release-started') startedOpen = d.stageId;
    else if (e.type === 'released' || e.type === 'release-failed') { if (startedOpen === d.stageId) startedOpen = null; }
    if (e.type === 'released') { const s = stages.get(d.stageId); if (s) s.released = e; if (d.mode === 'auto' && preauths.has(d.preauth)) preauths.get(d.preauth).used++; }
    else if (e.type === 'revoked') { if (d.kind === 'stage' && stages.has(d.ref)) stages.get(d.ref).revoked = e; if (d.kind === 'approval') revokedApprovals.add(Number(d.ref)); }
    else if (e.type === 'frozen') frozen = e; else if (e.type === 'unfrozen') frozen = null;
    else if (e.type === 'record-approval') approvals.push(e);
    else if (e.type === 'preauth-granted') preauths.set(d.id, { entry: e, revoked: false, used: 0 });
    else if (e.type === 'preauth-revoked' && preauths.has(d.id)) preauths.get(d.id).revoked = true;
  }
  // what is LIVE is the last thing deployed (revoking a release does not take the site down); what a later change is judged against is the last release the OWNER approved,
  // and only while nothing newer that is live has been revoked: automatic releases never become the baseline, so routine drift cannot ratchet
  for (const s of stages.values()) if (s.released && (!liveStage || s.released.seq > liveStage.released.seq)) liveStage = s;
  for (const s of stages.values()) if (s.released && s.released.data.mode === 'owner' && !s.revoked && (!ownerBaseline || s.released.seq > ownerBaseline.released.seq)) ownerBaseline = s;
  const latestReleased = liveStage && !liveStage.revoked ? ownerBaseline : null;
  const status = (id) => { const s = stages.get(id); if (!s) return 'unknown'; if (s.revoked) return 'revoked'; if (s.released) return 'released'; if (id !== latestStage) return 'superseded'; return new Date(s.entry.data.expires) <= now ? 'expired' : 'staged'; };
  const activePreauth = (kind) => [...preauths.entries()].map(([id, p]) => ({ id, ...p })).find((p) => !p.revoked && new Date(p.entry.data.expires) > now && p.used < p.entry.data.max && p.entry.data.kinds.includes(kind)) || null;
  const coverage = (subjects) => SUBJECTS.map((type) => {
    const subject = subjects?.[type] ?? null;
    if (subject === null) return { type, subject, covered: true, by: null, na: true };
    const hit = approvals.find((a) => a.data.type === type && a.data.subject === subject && !revokedApprovals.has(a.seq) && new Date(a.data.validUntil) > now);
    return { type, subject, covered: Boolean(hit), by: hit ? hit.seq : null };
  });
  return { stages, preauths, approvals, frozen, latestStage, latestReleased, liveStage, startedOpen, status, activePreauth, coverage };
}


// the project data the gate relies on, as digests: any change to it between releases is material (the assets manifest follows the delivered bytes, so it is not tracked)
export function trackedOf(data, manifest) {
  const t = { findings: sha256(canonicalJson(manifest?.findings ?? [])) };
  for (const [name, buf] of data) if (name !== 'assets.manifest.json') t[name] = sha256(buf);
  return t;
}
export const dataDigest = (data) => filesDigest(new Map([...data].map(([n, b]) => [n, sha256(b)])));

export class ReleaseControl {
  constructor(dir, { clock = () => new Date(), verify = verifyPackage } = {}) { this.rc = openRc(dir); this.clock = clock; this.verify = verify; }

  // ---- the gate in front of every operation: authenticate, authorise, record a refusal
  guard(token, op, client) {
    const now = this.clock();
    let principal = null;
    try {
      if (client !== null) checkSlug(client);
      principal = authenticate(this.rc, token, now);
      const a = authorize(principal, op, client);
      if (!a.ok) throw denied(a);
      if (client === null && !principal.clients.includes('*')) throw denied({ code: 'forbidden-client', reason: `${principal.id} has no access to every client, which ${op} needs` });
      if (client !== null) clientConfig(this.rc, client);   // (only an authorised principal learns which clients exist)
      return principal;
    } catch (e) {
      if (e instanceof RcError) { try { logDenied(this.rc, { actor: principal && { id: principal.id, role: principal.role }, op, client: client === null ? '*' : client, code: e.code, reason: e.message, ts: iso(now) }); } catch { /* a refusal is still a refusal */ } }
      throw e;
    }
  }
  // the pin covers CODE only (project data travels with each package); it is checked on the tooling folder AND on the very copy a verification runs against
  checkTooling() {
    if (toolingFingerprint(this.rc.config.toolingDir, this.rc.config.dataFiles).digest !== this.rc.config.toolingDigest) throw new RcError('tooling-changed', 'the tooling RC runs is not the tooling the owner adopted (its digest changed): adopt it again after review, or restore it');
  }
  makeView(data) {
    const view = buildView(this.rc.config.toolingDir, data);
    if (toolingFingerprint(view.eng, this.rc.config.dataFiles).digest !== this.rc.config.toolingDigest) { view.dispose(); throw new RcError('tooling-changed', 'the tooling changed while the verification copy was being made'); }
    return view;
  }
  servePySha(view) { try { return sha256(readFileSync(join(view.eng, '..', 'serve.py'))); } catch { throw new RcError('serve-py-missing', 'release control holds no serve.py to compare the package with'); } }   // (from the verified copy; part of the tooling pin)
  // the ledger, verified, with its derived state; throws when the ledger does not verify
  load(client) {
    const L = new Ledger(this.rc, client), v = L.verify();
    if (!v.ok) throw new RcError('ledger-corrupt', `the ledger of ${client} does not verify: ${v.problems[0]}`);
    return { L, v, st: derive(v.entries, this.clock()) };
  }
  stageDir(client, stageId) { return inside(pathsOf(this.rc, client).staged, stageId); }
  append(L, principal, type, data) { return L.append({ type, actor: principal, data, ts: iso(this.clock()) }); }
  need(st, stageId, { allow = ['staged'] } = {}) {
    const s = st.stages.get(stageId);
    if (!s) throw new RcError('unknown-stage', `no stage ${JSON.stringify(String(stageId).slice(0, 60))} for this client`);
    const status = st.status(stageId);
    if (!allow.includes(status)) throw new RcError(`stage-${status}`, `stage ${stageId} is ${status}, so it cannot be used`);
    return s;
  }

  // ---- stage
  stage(token, client, packageDir) {
    const who = this.guard(token, 'stage', client);
    const { L } = this.load(client);
    return L.withLock(() => {
      const { st } = this.load(client);
      if (st.frozen) throw new RcError('frozen', `${client} is frozen: ${st.frozen.data.reason}`);
      this.checkTooling();
      // the scheduler may not push aside a material stage that is waiting for the owner (that would lose the thing the owner was about to look at); the owner may
      if (who.role === 'scheduler' && st.latestStage && st.status(st.latestStage) === 'staged' && st.stages.get(st.latestStage).entry.data.class === 'material') throw new RcError('owner-pending', `a material stage (${st.latestStage}) is waiting for the owner: the scheduler cannot replace it`);
      const p = pathsOf(this.rc, client);
      mkdirSync(p.staged, { recursive: true });
      const tmp = inside(p.staged, `.incoming-${randomToken().slice(0, 12)}`);
      try {
        plainTree(packageDir);
        cpSync(packageDir, join(tmp, 'package'), { recursive: true, dereference: false, verbatimSymlinks: true });   // what is verified is the copy RC holds, not the folder it was given
        const copyDigest = treeDigest(join(tmp, 'package'));   // fixed NOW, from the copy, before anything runs on it
        const pending = () => ({ ok: false, detail: 'pending: release control decides authorisation after staging' });
        const data = readDataFiles(join(tmp, 'package'), this.rc.config.dataFiles);
        const view = this.makeView(data);
        let ix; try { ix = intake({ packageDir: join(tmp, 'package'), tooling: view.eng, hook: pending, siteOut: join(tmp, 'preview'), verify: this.verify, servePySha: this.servePySha(view) }); } finally { view.dispose(); }
        if (treeDigest(join(tmp, 'package')) !== copyDigest) throw new RcError('artifact-mismatch', 'the package copy changed while it was being verified');
        const tracked = trackedOf(data, ix.manifest);
        const others = ix.failing.filter((f) => f !== 'authenticity');
        if (others.length || !ix.manifest || !ix.siteFiles) throw new RcError('verification-failed', `the package does not verify: ${others.join(', ') || 'unreadable package'}`);
        if (ix.manifest.channel !== 'client-production') throw new RcError('wrong-channel', 'release control only handles client-production packages');
        const want = clientConfig(this.rc, client).host;
        if (want && ix.subjects.domain !== want) throw new RcError('wrong-client-host', `this package is for ${ix.subjects.domain}, but ${client} is registered for ${want}: it looks like another client's package`);
        // the change class is judged against what was last released, from RC's own stored copy of it (checked against the ledger)
        const base = st.latestReleased;
        let prev = null, prevSubjects = null, prevTracked = {}, baselineStage = null;
        if (base) {
          baselineStage = base.entry.data.stageId;   // (even if its stored copy cannot be read back: then nothing can be compared and the change is material)
          const bd = this.stageDir(client, base.entry.data.stageId), fj = existsSync(join(bd, 'files.json')) ? readJsonFile(join(bd, 'files.json')) : null;
          let map = null;
          try { if (fj) { map = new Map(Object.keys(fj).map((n) => [n, readFileSync(inside(bd, 'preview', n))])); if (filesDigest(new Map([...map].map(([n, b]) => [n, sha256(b)]))) !== base.released.data.filesSha256) map = null; } } catch { map = null; }
          if (map) { prev = map; prevSubjects = base.released.data.subjects; prevTracked = base.entry.data.tracked || {}; }
        }
        const cls = classifyChange({ prev, next: ix.siteFiles, prevSubjects, nextSubjects: ix.subjects, prevTracked, nextTracked: tracked, policy: this.rc.config.policy || undefined });
        const cov = st.coverage(ix.subjects);
        const fileHashes = new Map([...ix.siteFiles].map(([n, b]) => [n, sha256(b)]));
        const seq = (st.stages.size ? [...st.stages.values()].length : 0) + 1;
        const stageId = `st-${iso(this.clock()).slice(0, 10).replace(/-/g, '')}-${seq}-${ix.zipSha.slice(0, 8)}`;
        const expires = iso(addDays(this.clock(), this.rc.config.expiryDays));
        writeJson(join(tmp, 'files.json'), Object.fromEntries(fileHashes));
        writeFileSync(join(tmp, 'review.html'), reviewHtml({ client, stageId, stage: { version: ix.manifest.version, commit: ix.manifest.source.commit }, checks: ix.checks, cls, coverage: cov, previewRel: 'preview' }));
        writeJson(join(tmp, 'report.json'), { stageId, client, class: cls.class, reasons: cls.reasons, changes: cls.changes, coverage: cov, checks: ix.checks.map((c) => ({ id: c.id, ok: c.ok })) });
        const dest = this.stageDir(client, stageId);
        renameSync(tmp, dest);
        const entry = this.append(L, who, 'staged', { stageId, candidate: ix.manifest.candidate.digest, version: ix.manifest.version, commit: ix.manifest.source.commit, packageSha256: ix.zipSha, packageTreeSha256: copyDigest, filesSha256: filesDigest(fileHashes), dataSha256: dataDigest(data), tracked, toolingDigest: this.rc.config.toolingDigest, class: cls.class, reasons: cls.reasons, subjects: ix.subjects, baselineStage, expires, checks: ix.checks.length });
        return { stageId, class: cls.class, reasons: cls.reasons, coverage: cov, expires, review: join(dest, 'review.html'), seq: entry.seq };
      } finally { rmSync(tmp, { recursive: true, force: true }); }
    });
  }

  // ---- the owner's judgement on one subject; the digest comes from the stage, so nothing is typed
  record(L, who, client, s, stageId, type, { note, basis = null }) {
    if (!SUBJECTS.includes(type)) throw new RcError('bad-subject', `${type} is not a subject (${SUBJECTS.join(', ')})`);
    if (typeof note !== 'string' || note.trim().length < 5) throw new RcError('note-required', 'a note saying what you checked is required');
    if (type === 'rights' && !['licence', 'permission', 'ownership'].includes(basis)) throw new RcError('basis-required', 'rights need a basis: licence, permission or ownership');
    const subject = s.entry.data.subjects[type];
    if (subject === null) throw new RcError('no-subject', `this stage has nothing to approve for ${type}`);
    const days = clientConfig(this.rc, client).maxApprovalAgeDays[type];
    const e = this.append(L, who, 'record-approval', { type, subject, stageId, note: note.trim().slice(0, 500), basis, validUntil: iso(addDays(this.clock(), days)) });
    return { seq: e.seq, type, subject, validUntil: e.data.validUntil };
  }
  recordApproval(token, client, stageId, type, opts = {}) {
    const who = this.guard(token, 'record-approval', client);
    const { L } = this.load(client);
    return L.withLock(() => { const { st } = this.load(client); return this.record(L, who, client, this.need(st, stageId), stageId, type, opts); });
  }

  // ---- release (the owner: approve; the scheduler: autoRelease). Everything is repeated on the stored bytes.
  release(token, client, stageId, mode, opts = {}) {
    if (!MODES.includes(mode)) throw new RcError('bad-mode', `a release is made by the owner or automatically, not ${JSON.stringify(String(mode).slice(0, 20))}`);
    const op = mode === 'owner' ? 'approve' : 'auto-release';
    const who = this.guard(token, op, client);
    const { L } = this.load(client);
    return L.withLock(() => {
      const { st } = this.load(client);
      if (st.frozen) throw new RcError('frozen', `${client} is frozen: ${st.frozen.data.reason}`);
      this.checkTooling();
      const s = this.need(st, stageId), d = s.entry.data, dir = this.stageDir(client, stageId);
      // 1. the staged artifact is the staged artifact (any file of the package, and the preview the owner looked at)
      if (!existsSync(join(dir, 'package')) || treeDigest(join(dir, 'package')) !== d.packageTreeSha256) throw new RcError('artifact-mismatch', 'the stored package is not the package that was staged (a file changed)');
      if (d.toolingDigest !== this.rc.config.toolingDigest) throw new RcError('tooling-mismatch', 'the stage was made with other tooling than RC runs now');
      if (d.baselineStage !== (st.latestReleased?.entry.data.stageId ?? null)) throw new RcError('stale-baseline', 'the approved baseline changed since this stage was made (a release was approved or revoked): stage again');
      // 2. who decides: the owner (material or not), or a preauthorisation (routine only)
      let preauth = null;
      if (mode === 'auto') {
        if (d.class === 'material') throw new RcError('needs-owner', 'a material change is never released automatically');
        if (st.liveStage?.revoked) throw new RcError('live-revoked', 'what is live was revoked: only the owner can release until they have approved a release');
        if (!st.latestReleased) throw new RcError('needs-owner', 'nothing the owner approved is live: only the owner can release');
        preauth = st.activePreauth(d.class);
        if (!preauth) throw new RcError('no-preauth', `no preauthorisation in force covers a ${d.class} release`);
      }
      let cov = st.coverage(d.subjects);
      if (cov.some((c) => !c.covered) && mode === 'owner' && opts.note) {
        // the one-command path: the owner affirms every open subject of THIS stage with one note (each is still recorded separately, bound to the content they read)
        const open = cov.filter((x) => !x.covered);
        const named = Array.isArray(opts.subjects) ? opts.subjects : [];
        if (open.length !== named.length || !open.every((c) => named.includes(c.type))) throw new RcError('subjects-unconfirmed', `to approve in one step, name exactly the subjects you are approving: ${open.map((c) => c.type).join(', ')} (you named: ${named.join(', ') || 'none'})`);
        if (typeof opts.note !== 'string' || opts.note.trim().length < 5) throw new RcError('note-required', 'a note saying what you checked is required');
        if (open.some((c) => c.type === 'rights') && !['licence', 'permission', 'ownership'].includes(opts.basis)) throw new RcError('basis-required', 'rights need a basis: licence, permission or ownership');   // (nothing is recorded unless every open subject can be)
        for (const c of open) this.record(L, who, client, s, stageId, c.type, { note: opts.note, basis: opts.basis ?? null });
        cov = derive(L.verify().entries, this.clock()).coverage(d.subjects);
      }
      if (cov.some((c) => !c.covered)) throw new RcError('subjects-not-recorded', `still to be recorded by the owner: ${cov.filter((c) => !c.covered).map((c) => c.type).join(', ')}`);
      // 3. the existing package verifier, repeated on the stored bytes; RC's authenticity decision is the single thing that differs from staging
      const manifestCandidate = () => { try { return JSON.parse(readFileSync(join(dir, 'package', 'release-manifest.json'), 'utf8')).candidate.digest; } catch { return null; } };
      const hook = ({ packageDir }) => {
        const zip = readFileSync(join(packageDir, JSON.parse(readFileSync(join(packageDir, 'release-manifest.json'), 'utf8')).package.name));
        if (sha256(zip) !== d.packageSha256 || manifestCandidate() !== d.candidate) return { ok: false, detail: 'the package under judgement is not the staged artifact' };
        return { ok: true, detail: mode === 'owner' ? `released by the owner (${who.id}) for staged candidate ${d.candidate.slice(0, 12)}…, matched by RC` : `released by preauthorisation ${preauth.id} (${d.class}) for staged candidate ${d.candidate.slice(0, 12)}…` };
      };
      const data = readDataFiles(join(dir, 'package'), this.rc.config.dataFiles);
      if (dataDigest(data) !== d.dataSha256) throw new RcError('artifact-mismatch', 'the project data that travelled with the package is not the staged data');
      const view = this.makeView(data);
      let ix; try { ix = intake({ packageDir: join(dir, 'package'), tooling: view.eng, hook, siteOut: inside(dir, '.release-check'), verify: this.verify, servePySha: this.servePySha(view) }); } finally { view.dispose(); }
      try {
        if (ix.failing.length || !ix.siteFiles) throw new RcError('verification-failed', `the staged package no longer verifies: ${ix.failing.join(', ') || 'unreadable'}`);
        const fileHashes = new Map([...ix.siteFiles].map(([n, b]) => [n, sha256(b)]));
        if (filesDigest(fileHashes) !== d.filesSha256) throw new RcError('artifact-mismatch', 'the delivered files are not the staged files');
        if (filesDigest(dirMap(inside(dir, 'preview'))) !== filesDigest(dirMap(inside(dir, '.release-check')))) throw new RcError('preview-mismatch', 'the preview the owner looked at is not the package being released');
        // 4. deploy exactly the delivered files (not START-HERE.txt or serve.py) and match what landed
        const outDir = inside(dir, '.release-out'); rmSync(outDir, { recursive: true, force: true }); mkdirSync(outDir, { recursive: true });
        for (const n of fileHashes.keys()) { mkdirSync(join(outDir, n, '..'), { recursive: true }); writeFileSync(join(outDir, n), ix.siteFiles.get(n)); }
        if (mode === 'owner') this.append(L, who, 'approved', { stageId, candidate: d.candidate, packageSha256: d.packageSha256, class: d.class });
        this.append(L, who, 'release-started', { stageId, mode, preauth: preauth ? preauth.id : null });   // written BEFORE the deployment, so an interrupted release is visible in the ledger
        let dep;
        try { dep = deployLocal(this.rc, client, outDir, stageId); } catch (e) { this.append(L, who, 'release-failed', { stageId, code: e.code || 'deploy', reason: String(e.message).slice(0, 160) }); throw e; }
        if (dep.digest !== filesDigest(dirMap(outDir))) { this.append(L, who, 'release-failed', { stageId, code: 'deployed-mismatch', reason: 'the deployed files differ from the staged files' }); throw new RcError('deployed-mismatch', 'the deployed files differ from the staged files'); }
        const e = this.append(L, who, 'released', { stageId, mode, preauth: preauth ? preauth.id : null, class: d.class, candidate: d.candidate, packageSha256: d.packageSha256, filesSha256: d.filesSha256, subjects: d.subjects, deployedDigest: dep.digest, target: dep.target });
        return { stageId, mode, class: d.class, target: dep.target, deployedDigest: dep.digest, seq: e.seq };
      } finally { rmSync(inside(dir, '.release-check'), { recursive: true, force: true }); rmSync(inside(dir, '.release-out'), { recursive: true, force: true }); }
    });
  }
  approve(token, client, stageId, opts = {}) { return this.release(token, client, stageId, 'owner', opts); }
  autoRelease(token, client, stageId) { return this.release(token, client, stageId, 'auto'); }
  // the scheduled routine: stage the new package; release it only if it is routine and a preauthorisation covers it, otherwise leave it for the owner
  runScheduled(token, client, packageDir) {
    const s = this.stage(token, client, packageDir);
    if (s.class === 'material') return { outcome: 'needs-owner', stage: s };
    try { return { outcome: 'released-auto', stage: s, release: this.autoRelease(token, client, s.stageId) }; }
    catch (e) { if (['no-preauth', 'subjects-not-recorded'].includes(e.code)) return { outcome: 'needs-owner', stage: s, why: e.code }; throw e; }
  }

  // ---- owner controls
  revoke(token, client, ref, reason) {
    const who = this.guard(token, 'revoke', client);
    const { L } = this.load(client);
    return L.withLock(() => {
      const { st } = this.load(client);
      if (typeof reason !== 'string' || reason.trim().length < 3) throw new RcError('reason-required', 'a reason is required');
      if (!st.stages.has(ref)) throw new RcError('unknown-stage', `no stage ${JSON.stringify(String(ref).slice(0, 60))} for this client`);
      const s = st.stages.get(ref);
      if (s.revoked) throw new RcError('already-revoked', 'already revoked');
      const e = this.append(L, who, 'revoked', { kind: 'stage', ref, reason: reason.trim().slice(0, 300), wasReleased: Boolean(s.released) });
      return { seq: e.seq, ref };
    }, { urgent: true });
  }
  revokeApproval(token, client, seq, reason) {
    const who = this.guard(token, 'revoke-approval', client);
    const { L } = this.load(client);
    return L.withLock(() => {
      const { st } = this.load(client);
      if (typeof reason !== 'string' || reason.trim().length < 3) throw new RcError('reason-required', 'a reason is required');
      if (!st.approvals.some((a) => a.seq === Number(seq))) throw new RcError('unknown-approval', `no recorded approval ${seq}`);
      const e = this.append(L, who, 'revoked', { kind: 'approval', ref: Number(seq), reason: reason.trim().slice(0, 300) });
      return { seq: e.seq, ref: Number(seq) };
    }, { urgent: true });
  }
  freeze(token, client, reason, on = true) {
    const who = this.guard(token, on ? 'freeze' : 'unfreeze', client);
    const { L } = this.load(client);
    return L.withLock(() => {
      const { st } = this.load(client);
      if (typeof reason !== 'string' || reason.trim().length < 3) throw new RcError('reason-required', 'a reason is required');
      if (on === Boolean(st.frozen)) throw new RcError(on ? 'already-frozen' : 'not-frozen', on ? 'already frozen' : 'not frozen');
      return { seq: this.append(L, who, on ? 'frozen' : 'unfrozen', { reason: reason.trim().slice(0, 300) }).seq };
    }, { urgent: true });
  }
  preauthGrant(token, client, { kinds, days, max }) {
    const who = this.guard(token, 'preauth-grant', client);
    const { L } = this.load(client);
    return L.withLock(() => {
      this.load(client);
      if (!Array.isArray(kinds) || !kinds.length || kinds.some((k) => !PREAUTH_KINDS.includes(k))) throw new RcError('bad-preauth', `kinds must be some of ${PREAUTH_KINDS.join(', ')}`);
      if (!Number.isInteger(days) || days < 1 || days > 90 || !Number.isInteger(max) || max < 1 || max > 100) throw new RcError('bad-preauth', 'days must be 1 to 90 and max 1 to 100');
      const id = `pa-${L.entries().length + 1}`;
      this.append(L, who, 'preauth-granted', { id, kinds, expires: iso(addDays(this.clock(), days)), max });
      return { id, kinds, days, max };
    });
  }
  preauthRevoke(token, client, id) {
    const who = this.guard(token, 'preauth-revoke', client);
    const { L } = this.load(client);
    return L.withLock(() => {
      const { st } = this.load(client);
      if (!st.preauths.has(id)) throw new RcError('unknown-preauth', 'no such preauthorisation');
      this.append(L, who, 'preauth-revoked', { id });
      return { id };
    }, { urgent: true });
  }
  // The owner adopts the tooling as it is now, after reviewing which files differ from what they adopted before. It touches every client (the tooling is shared), so it needs
  // the owner's access to every client, checks every ledger first, and writes the pin only after every ledger says so (a half-done adoption leaves the old pin: fail closed).
  adoptTooling(token) {
    const who = this.guard(token, 'adopt-tooling', null);
    const clients = Object.keys(this.rc.config.clients);
    const loaded = clients.map((c) => ({ c, ...this.load(c) }));   // every ledger must verify before anything is written
    const now = toolingFingerprint(this.rc.config.toolingDir, this.rc.config.dataFiles);
    const was = this.rc.config.toolingFiles || {};
    const changed = [...new Set([...Object.keys(was), ...Object.keys(now.files)])].filter((f) => was[f] !== now.files[f]).sort();
    const from = this.rc.config.toolingDigest;
    for (const { c, L } of loaded) L.withLock(() => this.append(L, who, 'tooling-adopted', { from, to: now.digest, changedFiles: changed.slice(0, 200), changedCount: changed.length }));
    this.rc.config = { ...this.rc.config, toolingDigest: now.digest, toolingFiles: now.files };
    writeJson(join(this.rc.dir, 'config.json'), this.rc.config);
    return { from, to: now.digest, changed };
  }

  // ---- reading
  review(token, client, stageId) {
    this.guard(token, 'review', client);
    const { st } = this.load(client);
    const s = this.need(st, stageId, { allow: ['staged', 'superseded', 'expired', 'released', 'revoked'] });
    const dir = this.stageDir(client, stageId);
    return { stageId, status: st.status(stageId), class: s.entry.data.class, reasons: s.entry.data.reasons, coverage: st.coverage(s.entry.data.subjects), page: join(dir, 'review.html') };
  }
  audit(token, client) {
    this.guard(token, 'audit', client);
    const L = new Ledger(this.rc, client), v = L.verify();
    return { ok: v.ok, problems: v.problems, timeline: v.entries.map((e) => `${e.seq}  ${e.ts}  ${e.type}  by ${e.actor.id}${e.data.stageId ? `  ${e.data.stageId}` : ''}${e.data.class ? `  [${e.data.class}]` : ''}`) };
  }
  status(token, client) {
    this.guard(token, 'status', client);
    const { st } = this.load(client);
    return { frozen: st.frozen ? st.frozen.data.reason : null, latestStage: st.latestStage, stageStatus: st.latestStage ? st.status(st.latestStage) : null,
      live: st.liveStage ? st.liveStage.entry.data.stageId : null, liveRevoked: Boolean(st.liveStage?.revoked), approvedBaseline: st.latestReleased ? st.latestReleased.entry.data.stageId : null, interrupted: st.startedOpen, preauths: [...st.preauths.entries()].map(([id, p]) => ({ id, kinds: p.entry.data.kinds, used: p.used, max: p.entry.data.max, revoked: p.revoked })) };
  }
}
