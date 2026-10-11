// Release evidence for what automation cannot do (Gate 5 Phase 2, APR-JE-030).
// One specification (release/evidence-spec.json) drives three things: the human procedures (docs/device-testing, generated), the scaffolded evidence
// records, and the release gate's validation. The gate accepts a record only when it is complete, consistent, bound to the build being released and
// classified honestly:
//   E1  automated / emulated        only a CI run; it can never satisfy a human requirement
//   E2  a person, desktop browser   browser-matrix and desktop screen-reader records
//   E3  a person, physical device   phone and tablet records, and the mobile screen readers
// What the gate CAN reject: anything incomplete, inconsistent, mislabelled, unbound or unverifiable. What it CANNOT do: prove that a person really did
// the work. That stays with the named, attesting person and the owner's release approval; the documents say so.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, posix } from 'node:path';
import { spawnSync } from 'node:child_process';
import { engDir, readJson, repoRoot } from './git.mjs';

export const loadSpec = () => readJson(join(engDir, 'release', 'evidence-spec.json'));
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const HEX40 = /^[0-9a-f]{40}$/, HEX64 = /^[0-9a-f]{64}$/;
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const nonEmpty = (s, n = 1) => typeof s === 'string' && s.trim().length >= n;

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// The items a target asks for: { session: [item], pages: { file: [item] } }
export function itemsFor(spec, targetId) {
  const t = spec.targets[targetId];
  const out = { session: [], pages: Object.fromEntries(spec.pages.map((p) => [p, []])) };
  for (const sid of t.sections) {
    const sec = spec.sections[sid];
    for (const it of sec.items) {
      const withSection = { ...it, section: sid };
      if (sec.scope === 'session') out.session.push(withSection);
      else for (const p of (it.pages || sec.pages || spec.pages)) if (out.pages[p]) out.pages[p].push(withSection);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// A template: every outcome field empty. It never fills a result.
export function scaffold(spec, targetId, { commit = '', assetsTree = '' } = {}) {
  const t = spec.targets[targetId];
  if (!t) throw new Error(`unknown target "${targetId}"; known: ${Object.keys(spec.targets).join(', ')}`);
  if (t.gateType === 'ci-run') return { schema: spec.recordSchema, status: 'template', type: 'ci-run', target: targetId, class: 'E1', build: { commit, assetsTree }, date: '', by: '', url: '', conclusion: null, summary: '' };
  const items = itemsFor(spec, targetId);
  const blank = () => ({ outcome: null, note: '' });
  return {
    schema: spec.recordSchema, status: 'template',
    guidance: [`Procedure: docs/device-testing/${targetId}.md. Fill this record yourself after doing the test; leave nothing empty. Set "status" to "completed" only when every field is filled.`, 'Outcomes are "pass", "fail" or "not-applicable" (the last only where the item allows it, with a note of at least 15 characters). Every "fail" needs a finding for that page.', 'Attach evidence under engineering/release/evidence/files/ and record its SHA-256 (npm run evidence:hash -- <file>).', `Classification: ${t.classes.join(' or ')}. ${t.classes.includes('E3') ? 'A physical phone or tablet only; emulators, simulators and device farms do not count.' : 'A real desktop browser on a real computer; emulation does not count.'}`],
    type: t.gateType, target: targetId, class: t.classes.length === 1 ? t.classes[0] : '',
    build: { commit, assetsTree, package: '' },
    date: '', tester: { name: '', role: '' },
    environment: { device: { kind: '', make: '', model: '', emulated: null }, os: { name: '', version: '' }, browser: { name: '', version: '' }, screenReader: t.environment.screenReaders ? { name: '', version: '' } : null, settings: '' },
    results: { session: Object.fromEntries(items.session.map((i) => [i.id, blank()])), pages: Object.fromEntries(Object.entries(items.pages).filter(([, l]) => l.length).map(([p, l]) => [p, Object.fromEntries(l.map((i) => [i.id, blank()]))])) },
    findings: [], attachments: [], conclusion: null,
    attestation: { statement: '', signedBy: '', date: '' },
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Git and file access, replaceable in tests.
const git = (args) => spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
export const realGit = {
  isCommit: (c) => HEX40.test(c) && git(['cat-file', '-e', `${c}^{commit}`]).status === 0,
  isAncestor: (a, b) => git(['merge-base', '--is-ancestor', a, b]).status === 0,
  commitDate: (c) => git(['show', '-s', '--format=%cs', c]).stdout.trim(),
};
export const realFs = { exists: (p) => existsSync(join(repoRoot, 'jade-and-ember', p)), read: (p) => readFileSync(join(repoRoot, 'jade-and-ember', p)) };

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Validates ONE record. vctx: { spec, releaseCommit, assetsTree, git, fs, today, allowFixture }.
// Returns { problems: [string], success: boolean }. success = valid AND the outcome is a pass with no open Blocker or Major finding.
export function validateRecord(r, vctx) {
  const { spec } = vctx;
  const problems = [];
  const bad = (m) => problems.push(m);
  if (!r || typeof r !== 'object' || Array.isArray(r)) return { problems: ['the record is not a JSON object'], success: false };
  if (r.schema !== spec.recordSchema) bad(`schema must be "${spec.recordSchema}"`);
  const target = spec.targets[r.target];
  if (!target) { bad(`target "${r.target}" is not one of: ${Object.keys(spec.targets).join(', ')}`); return { problems, success: false }; }
  if (r.type !== target.gateType) bad(`type "${r.type}" does not match target ${r.target}, which is a "${target.gateType}" record`);
  const cls = spec.classes[r.class];
  if (!cls) bad(`class must be E1, E2 or E3 (got "${r.class}")`);
  else {
    if (!target.classes.includes(r.class)) bad(`class ${r.class} is wrong for target ${r.target}: it permits ${target.classes.join(' or ')}`);
    if (!cls.allowedTypes.includes(r.type)) bad(`class ${r.class} (${cls.name}) can never back a "${r.type}" record: it allows ${cls.allowedTypes.join(', ')}`);
  }
  if (r.status === 'template') { bad('this is an unfilled template: no result has been recorded'); return { problems, success: false }; }
  if (r.status !== 'completed') bad('status must be "completed"');

  // binding to the build
  const b = r.build || {};
  if (!HEX40.test(b.commit || '')) bad('build.commit must be a 40-hex commit');
  else if (!vctx.git.isCommit(b.commit)) bad(`build.commit ${b.commit.slice(0, 7)} is not a commit of this repository`);
  else if (r.type === 'ci-run' ? b.commit !== vctx.releaseCommit : !(b.commit === vctx.releaseCommit || vctx.git.isAncestor(b.commit, vctx.releaseCommit))) bad(`build.commit ${b.commit.slice(0, 7)} is not ${r.type === 'ci-run' ? '' : 'the release commit or an ancestor of '}the release commit ${String(vctx.releaseCommit).slice(0, 7)}`);
  if (r.type !== 'ci-run') {
    if (!HEX64.test(b.assetsTree || '')) bad('build.assetsTree must be the 64-hex tree hash of the delivered files that was tested');
    else if (!vctx.assetsTree) bad('the release build\'s delivered-file hash is unknown, so the record cannot be bound to it');
    else if (b.assetsTree !== vctx.assetsTree) bad('build.assetsTree differs from the delivered files of the release build: this evidence is for different bytes');
  }
  // date
  if (!isDate(r.date)) bad('date must be a real YYYY-MM-DD date');
  else {
    if (r.date > vctx.today) bad(`date ${r.date} is in the future`);
    const cd = HEX40.test(b.commit || '') && vctx.git.isCommit(b.commit) ? vctx.git.commitDate(b.commit) : null;
    if (cd && r.date < cd) bad(`date ${r.date} is before the commit it claims to test (${cd})`);
  }

  if (r.type === 'ci-run') {
    if (!nonEmpty(r.by, 2)) bad('by must name who recorded the run');
    if (!/^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/actions\/runs\/\d+/.test(r.url || '')) bad('url must be the https GitHub Actions run URL');
    if (r.conclusion !== 'success') bad('conclusion must be "success" for a CI run to count');
    if (!nonEmpty(r.summary, 10)) bad('summary must say what was run and the outcome');
    return { problems, success: problems.length === 0 && r.conclusion === 'success' };
  }

  // the person
  const tester = r.tester || {};
  if (!nonEmpty(tester.name, 3)) bad('tester.name must name the person who did the test');
  else if (!vctx.allowFixture && new RegExp(spec.nonPersonTester, 'i').test(`${tester.name} ${tester.role || ''}`)) bad(`tester "${tester.name}" does not look like a person: a human must do and sign this test`);
  if (!nonEmpty(tester.role, 2)) bad('tester.role must say who they are (for example "QA tester", "owner")');

  // the environment
  const env = r.environment || {}, dev = env.device || {}, os = env.os || {}, br = env.browser || {}, sr = env.screenReader;
  const te = target.environment;
  if (!te.deviceKinds.includes(dev.kind)) bad(`environment.device.kind "${dev.kind}" does not fit ${r.target}: expected ${te.deviceKinds.join(' or ')}`);
  if (dev.emulated !== false) bad('environment.device.emulated must be the boolean false (emulated or simulated devices are never E2 or E3 evidence)');
  if (r.class === 'E3') { if (!nonEmpty(dev.make, 2) || !nonEmpty(dev.model, 2)) bad('an E3 record needs environment.device.make and model (for example Apple, iPhone 15)'); }
  else if (!nonEmpty(dev.make, 2)) bad('environment.device.make is required (the computer\'s maker)');
  if (!te.osNames.some((n) => n.toLowerCase() === String(os.name).toLowerCase())) bad(`environment.os.name "${os.name}" does not fit ${r.target}: expected ${te.osNames.join(' or ')}`);
  if (!/^\d[0-9A-Za-z.\- ()]*$/.test(os.version || '')) bad('environment.os.version must be a version number (for example 17.4.1)');
  if (!te.browserNames.some((n) => n.toLowerCase() === String(br.name).toLowerCase())) bad(`environment.browser.name "${br.name}" does not fit ${r.target}: expected ${te.browserNames.join(' or ')}`);
  if (!/^\d+(\.\d+)*$/.test(br.version || '')) bad('environment.browser.version must be a version number (for example 123.0.6312.86)');
  if (te.screenReaders) {
    if (!sr || !te.screenReaders.some((n) => n.toLowerCase() === String(sr.name).toLowerCase())) bad(`environment.screenReader.name must be ${te.screenReaders.join(' or ')}`);
    else if (!/^\d[0-9A-Za-z.\- ()]*$/.test(sr.version || '')) bad('environment.screenReader.version must be a version number');
  } else if (sr) bad(`environment.screenReader must be null for ${r.target}`);
  if (!vctx.allowFixture && new RegExp(spec.emulationIndicators, 'i').test(JSON.stringify({ dev: { ...dev, emulated: undefined }, os, br, sr, settings: env.settings || '', package: b.package || '' }))) bad('the environment mentions emulation, simulation, DevTools, headless or a device farm: that is E1 evidence, not E2 or E3');

  // the outcomes
  const items = itemsFor(spec, r.target);
  const res = r.results || {};
  const outcomes = [];
  const check = (where, it, v) => {
    if (!v || typeof v !== 'object' || v.outcome === null || v.outcome === undefined || v.outcome === '') { bad(`incomplete: ${where} ${it.id} has no outcome`); return; }
    if (!spec.outcomes.includes(v.outcome)) { bad(`${where} ${it.id}: outcome "${v.outcome}" is not one of ${spec.outcomes.join(', ')}`); return; }
    if (v.outcome === 'not-applicable') {
      if (!it.naAllowed) bad(`${where} ${it.id}: this item cannot be marked not-applicable`);
      else if (!nonEmpty(v.note, spec.notApplicableMinNoteLength)) bad(`${where} ${it.id}: not-applicable needs a note of at least ${spec.notApplicableMinNoteLength} characters saying why`);
    } else if (it.needsNote && !nonEmpty(v.note, spec.needsNoteMinLength)) bad(`${where} ${it.id}: a note is required (what you saw)`);
    outcomes.push({ where, id: it.id, outcome: v.outcome });
  };
  const known = new Set();
  for (const it of items.session) { known.add(`session/${it.id}`); check('session', it, (res.session || {})[it.id]); }
  for (const [p, list] of Object.entries(items.pages)) {
    if (!list.length) continue;
    if (!res.pages || !res.pages[p]) { bad(`incomplete: no results for page ${p}`); continue; }
    for (const it of list) { known.add(`${p}/${it.id}`); check(p, it, res.pages[p][it.id]); }
  }
  for (const id of Object.keys(res.session || {})) if (!known.has(`session/${id}`)) bad(`results.session.${id} is not an item of ${r.target}`);
  for (const [p, o] of Object.entries(res.pages || {})) for (const id of Object.keys(o || {})) if (!known.has(`${p}/${id}`)) bad(`results.pages.${p}.${id} is not an item of ${r.target}`);

  // findings
  const findings = Array.isArray(r.findings) ? r.findings : (bad('findings must be a list (empty if none)'), []);
  for (const f of findings) {
    if (!nonEmpty(f.id, 2)) bad('every finding needs an id');
    if (![...spec.pages, 'session'].includes(f.page)) bad(`finding ${f.id}: page must be one of the five pages or "session"`);
    if (!spec.severities.includes(f.severity)) bad(`finding ${f.id}: severity must be ${spec.severities.join(', ')}`);
    if (!spec.findingStatuses.includes(f.status)) bad(`finding ${f.id}: status must be ${spec.findingStatuses.join(', ')}`);
    if (!nonEmpty(f.description, 10)) bad(`finding ${f.id}: describe what you saw (at least 10 characters)`);
  }
  const fails = outcomes.filter((o) => o.outcome === 'fail');
  for (const f of fails) if (!findings.some((x) => x.page === (f.where === 'session' ? 'session' : f.where))) bad(`${f.where} ${f.id} failed but no finding is recorded for ${f.where === 'session' ? 'the session' : f.where}`);
  // the conclusion
  if (!['success', 'failure'].includes(r.conclusion)) bad('conclusion must be "success" or "failure" (a partial or empty conclusion is incomplete)');
  else if ((r.conclusion === 'success') === (fails.length > 0)) bad(`conclusion "${r.conclusion}" contradicts the outcomes (${fails.length} fail)`);
  const openSerious = findings.filter((f) => f.status === 'open' && ['Blocker', 'Major'].includes(f.severity));

  // attachments
  const att = Array.isArray(r.attachments) ? r.attachments : (bad('attachments must be a list'), []);
  const seen = new Set();
  let local = 0;
  for (const a of att) {
    const w = `attachment ${a.path || a.url || '?'}`;
    if (!target.attachments.kinds.includes(a.kind)) bad(`${w}: kind must be ${target.attachments.kinds.join(', ')}`);
    if (!nonEmpty(a.description, 5)) bad(`${w}: describe what it shows`);
    if (!HEX64.test(a.sha256 || '')) bad(`${w}: sha256 must be the 64-hex hash of the file`);
    else if (seen.has(a.sha256)) bad(`${w}: the same file is attached twice`); else seen.add(a.sha256);
    if (Boolean(a.path) === Boolean(a.url)) bad(`${w}: give exactly one of path or url`);
    else if (a.path) {
      const n = posix.normalize(String(a.path));
      if (n.startsWith('..') || n.startsWith('/') || String(a.path).includes('\\') || n !== a.path) bad(`${w}: path must be relative to ${spec.attachmentDir}/ and stay inside it`);
      else if (!vctx.fs.exists(`${spec.attachmentDir}/${a.path}`)) bad(`${w}: the file does not exist in ${spec.attachmentDir}/`);
      else if (sha256(vctx.fs.read(`${spec.attachmentDir}/${a.path}`)) !== a.sha256) bad(`${w}: the file does not match its recorded sha256`);
      else local++;
    } else if (!/^https:\/\/\S+$/.test(a.url)) bad(`${w}: url must be https`);
  }
  if (att.length < target.attachments.minimum) bad(`at least ${target.attachments.minimum} attachments are required (${target.attachments.required})`);
  if (local < target.attachments.minimumLocal) bad(`at least ${target.attachments.minimumLocal} attachment must be a local file under ${spec.attachmentDir}/ with a verified sha256`);

  // the signature
  const at = r.attestation || {};
  if (at.statement !== spec.attestation) bad(`attestation.statement must be exactly: "${spec.attestation}"`);
  if (at.signedBy !== tester.name) bad('attestation.signedBy must equal tester.name');
  if (!isDate(at.date)) bad('attestation.date must be a real date');
  else if ((isDate(r.date) && at.date < r.date) || at.date > vctx.today) bad('attestation.date must not be before the test date or in the future');

  return { problems, success: problems.length === 0 && r.conclusion === 'success' && fails.length === 0 && openSerious.length === 0 };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Every record of a folder, with the cross-record checks. entries: [{ file, record?, parseError? }].
export function assessEvidence(entries, vctx) {
  const out = entries.map((e) => {
    if (e.parseError || !e.record) return { file: e.file, type: 'unreadable', target: null, class: null, commit: '', valid: false, success: false, problems: [e.parseError || 'the file is not readable JSON'], hashes: [] };
    const v = validateRecord(e.record, vctx);
    const r = e.record;
    return { file: e.file, type: r.type || 'unknown', target: r.target || null, class: r.class || null, commit: r.build?.commit || r.commit || '', valid: v.problems.length === 0, success: v.success, problems: v.problems, hashes: (r.attachments || []).map((a) => a.sha256).filter(Boolean) };
  });
  const owner = new Map();
  for (const e of out) for (const h of e.hashes) {
    if (owner.has(h) && owner.get(h) !== e.file) { e.problems.push(`an attachment is reused from ${owner.get(h)}: one file cannot be evidence for two records`); e.valid = false; e.success = false; }
    else owner.set(h, e.file);
  }
  return out;
}

// Does the set of assessed records meet one gate type? Returns { ok, detail }.
export function coverage(spec, gateType, assessed) {
  const g = spec.gate[gateType];
  const good = assessed.filter((e) => e.type === gateType && e.valid && e.success);
  const parts = g.needs.map((n) => { const hit = good.find((e) => n.targets.includes(e.target)); return { n, hit }; });
  const missing = parts.filter((p) => !p.hit).map((p) => p.n.label);
  const cls = [...new Set(g.needs.flatMap((n) => n.targets.map((t) => spec.targets[t].classes[0])))].join('/');
  return { ok: missing.length === 0, detail: missing.length ? `missing ${cls} evidence for ${missing.join(', ')} (valid, successful records in engineering/release/evidence/: ${good.length})` : parts.map((p) => `${p.n.label}: ${p.hit.file}`).join('; ') };
}

// Folder reading for the real gate.
export function loadEvidenceEntries(dir = join(engDir, 'release', 'evidence')) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => {
    try { return { file: f, record: JSON.parse(readFileSync(join(dir, f), 'utf8')) }; } catch (e) { return { file: f, record: null, parseError: `not valid JSON (${e.message.slice(0, 60)})` }; }
  });
}
export const defaultVctx = (over = {}) => ({ spec: loadSpec(), releaseCommit: '', assetsTree: '', git: realGit, fs: realFs, today: new Date().toISOString().slice(0, 10), allowFixture: false, ...over });
