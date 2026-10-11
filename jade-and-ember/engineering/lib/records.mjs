// Structured release records (G6-2, APR-JE-039; design in G6-2-DESIGN.md sections 4, 5 and 10).
//
// Two families live here, each in its own folder with its own audit:
//   approvals    engineering/release/approvals/*.json     release-approval, rights-verification, search-review
//   deployments  engineering/release/deployments/*.json   deployment-authorisation
// (Evidence, the third family, is lib/evidence.mjs.)
//
// A record is a fact about ONE decision with closed fields. The gate never reads prose: the `rationale` is for people. The status algebra:
//   approved / rejected    a decision about a record type for ONE candidate digest
//   revoked                ends an earlier APPROVED record (revocation is final: a new approval is a new record)
//   superseded             ends an earlier approved or rejected record; the replacement decision is its own record
// Unreadable, malformed or unknown records are errors that BLOCK. A negative record (rejected, revoked, superseded) that cannot be authorised blocks
// too (it cannot be told from a real one with a typo); a positive record that cannot be authorised is simply not counted.
//
// What this proves: the records are well formed, bound to the candidate, in force, and made by a NAMED reviewer who the reviewer table authorises.
// What it cannot prove: that the named person made them. That needs a signature or an external attestation (design section 12, owner decision).
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { engDir, readJson } from './git.mjs';
import { parseStrictJson } from './strict-json.mjs';
import { isReservedHost } from './hosts.mjs';

export const APPROVAL_SCHEMA = 'jade-and-ember/approval-record@1';
export const DEPLOYMENT_SCHEMA = 'jade-and-ember/deployment-record@1';
export const REVIEWERS_SCHEMA = 'jade-and-ember/reviewers@1';
export const DEMONSTRATIONS_SCHEMA = 'jade-and-ember/demonstrations@1';
export const STATUSES = ['approved', 'rejected', 'revoked', 'superseded'];
export const NEGATIVE = ['rejected', 'revoked', 'superseded'];
export const TYPES = {
  'release-approval': { prefix: 'REL', family: 'approvals' },
  'rights-verification': { prefix: 'RIGHTS', family: 'approvals' },
  'search-review': { prefix: 'SRCH', family: 'approvals' },
  'deployment-authorisation': { prefix: 'DEP', family: 'deployments' },
};
export const SEARCH_REVIEWED = ['business-facts', 'structured-data', 'crawler-policy'];
const HEX64 = /^[0-9a-f]{64}$/;
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
// a UTC date-time to the second, that is a real instant (2026-02-30 and T24:00:00 are refused, not rolled over)
const isStamp = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(s) && new Date(s).toISOString() === s.replace('Z', '.000Z');
const isStr = (v) => typeof v === 'string';
const text = (s, n) => typeof s === 'string' && s.trim().length >= n;

export const familyDir = (family, eng = engDir) => join(eng, 'release', family);

// Every entry of a family folder. The folder holds README.md and `<PREFIX>-JE-nnn.json` record files and NOTHING else: a file the gate does not read is a file
// that could hide a rejection, so any other entry (a backup, a sub-folder, a symlink, a differently cased name) is itself an error that blocks (G6-2 review, F3).
// A record file must be named for its own id and belong to this family. `tracked`: every record file must be committed (a file git ignores or has left out of the
// index is not part of the repository a reviewer sees); the release gate asks for it, the package verifier (which has no repository) does not.
// Returns { file, record } or { file, record: null, parseError }.
export function loadFamily(family, eng = engDir, { tracked = false, dir: where = null } = {}) {
  const dir = where || familyDir(family, eng);
  if (!existsSync(dir)) return [];
  const prefixes = Object.values(TYPES).filter((t) => t.family === family).map((t) => t.prefix);
  const nameRe = new RegExp(`^(${prefixes.join('|')})-JE-\\d{3,}\\.json$`);
  let committed = null;
  if (tracked) {
    const r = spawnSync('git', ['-C', dir, 'ls-files', '-z', '--', '.'], { encoding: 'utf8' });
    committed = r.status === 0 ? new Set(r.stdout.split('\0').filter(Boolean)) : false;
  }
  return readdirSync(dir).sort().flatMap((f) => {
    if (f === 'README.md' || f === '.gitkeep') return [];
    const st = lstatSync(join(dir, f));
    if (!nameRe.test(f) || !st.isFile()) return [{ file: f, record: null, parseError: `unexpected entry in ${family}/: only README.md and ${prefixes.map((x) => `${x}-JE-nnn.json`).join(' / ')} record files are allowed (a symlink, sub-folder, backup or other file is never read, so it is refused)` }];
    if (tracked && (committed === false || !committed.has(f))) return [{ file: f, record: null, parseError: committed === false ? 'cannot confirm that this record is committed (not a git checkout)' : 'this record file is not committed to the repository (untracked, ignored or removed from the index)' }];
    try {
      const record = parseStrictJson(readFileSync(join(dir, f), 'utf8'));
      if (record && typeof record === 'object' && !Array.isArray(record)) {
        if (record.id + '.json' !== f) return [{ file: f, record: null, parseError: `the file name must be the record id (${record.id}.json)` }];
        if (!isStr(record.type) || !Object.hasOwn(TYPES, record.type) || TYPES[record.type].family !== family) return [{ file: f, record: null, parseError: `a ${record.type} record does not belong in ${family}/` }];
      }
      return [{ file: f, record }];
    } catch (e) { return [{ file: f, record: null, parseError: `not valid JSON (${String(e.message).slice(0, 60)})` }]; }
  });
}

// ---- the reviewer table -------------------------------------------------------------------------------------------------------------------------------------
export const loadReviewers = (eng = engDir) => readJson(join(eng, 'release', 'reviewers.json'));

export function validateReviewers(t, { ledgerIds = null } = {}) {
  const p = [], bad = (m) => p.push(m);
  if (!t || typeof t !== 'object' || Array.isArray(t)) return ['the reviewer table is not a JSON object'];
  if (t.schema !== REVIEWERS_SCHEMA) bad(`reviewers.json: schema must be "${REVIEWERS_SCHEMA}"`);
  if (!Array.isArray(t.reviewers)) { bad('reviewers.json: "reviewers" must be a list'); return p; }
  if (t.reviewers.length) {
    if (!/^APR-JE-\d+$/.test(t.establishedBy || '')) bad('reviewers.json: a table with reviewers must name the governance record that established it (establishedBy: APR-JE-nnn)');
    else if (ledgerIds && !ledgerIds.has(t.establishedBy)) bad(`reviewers.json: ${t.establishedBy} is not in the approvals ledger`);
  }
  const ids = new Set();
  for (const r of t.reviewers) {
    const w = `reviewer ${r?.id ?? '?'}`;
    if (!/^R-\d{2,}$/.test(r?.id || '')) bad(`${w}: id must look like R-01`);
    else if (ids.has(r.id)) bad(`${w}: duplicate id`); else ids.add(r.id);
    if (!text(r?.name, 3)) bad(`${w}: name is required`);
    if (!text(r?.role, 2)) bad(`${w}: role is required`);
    for (const k of ['mayApprove', 'mayReject', 'mayRevoke']) {
      if (!Array.isArray(r?.[k])) bad(`${w}: ${k} must be a list`);
      else for (const ty of r[k]) if (!TYPES[ty]) bad(`${w}: ${k} names "${ty}", which is not a record type`);
    }
    if (!isDate(r?.validFrom)) bad(`${w}: validFrom must be a real date`);
    if (r?.validTo !== null && r?.validTo !== undefined && (!isDate(r.validTo) || r.validTo < r.validFrom)) bad(`${w}: validTo must be null or a date on or after validFrom`);
  }
  return p;
}

// May this record's author take this action? Returns { ok, why }.
export function authorise(rec, table) {
  const by = rec.decidedBy || {};
  const r = (table.reviewers || []).find((x) => x.id === by.reviewer);
  if (!r) return { ok: false, why: `reviewer "${by.reviewer}" is not in the reviewer table` };
  if (r.name !== by.name) return { ok: false, why: `decidedBy.name "${by.name}" is not the name of reviewer ${r.id}` };
  const day = String(rec.decidedAt).slice(0, 10);
  if (day < r.validFrom || (r.validTo && day > r.validTo)) return { ok: false, why: `reviewer ${r.id} was not authorised on ${day}` };
  const key = rec.status === 'approved' ? 'mayApprove' : rec.status === 'rejected' ? 'mayReject' : 'mayRevoke';
  if (!(r[key] || []).includes(rec.type)) return { ok: false, why: `reviewer ${r.id} may not ${key.slice(3).toLowerCase()} a ${rec.type}` };
  return { ok: true, why: `${r.id} (${r.role})` };
}

// ---- one record, on its own ---------------------------------------------------------------------------------------------------------------------------------
// Structure only: no judgement about the build. Returns [problem].
export function validateRecordShape(r, { today, now = null }) {
  const p = [], bad = (m) => p.push(m);
  if (!r || typeof r !== 'object' || Array.isArray(r)) return ['the record is not a JSON object'];
  const dep = r.type === 'deployment-authorisation';
  if (r.schema !== (dep ? DEPLOYMENT_SCHEMA : APPROVAL_SCHEMA)) bad(`schema must be "${dep ? DEPLOYMENT_SCHEMA : APPROVAL_SCHEMA}"`);
  const ty = isStr(r.type) && Object.hasOwn(TYPES, r.type) ? TYPES[r.type] : null;
  if (!ty) { bad(`type "${r.type}" is not one of: ${Object.keys(TYPES).join(', ')}`); return p; }
  if (!isStr(r.id) || !new RegExp(`^${ty.prefix}-JE-\\d{3,}$`).test(r.id)) bad(`id must look like ${ty.prefix}-JE-001 for a ${r.type}`);
  if (!STATUSES.includes(r.status)) bad(`status must be one of ${STATUSES.join(', ')} (got "${r.status}")`);
  if (!isStr(r.candidate) || !HEX64.test(r.candidate)) bad('candidate must be the 64-hex candidate artifact digest');
  if (!['client-production', 'demonstration'].includes(r.channel)) bad('channel must be client-production or demonstration');
  if (!isStr(r.version) || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(r.version)) bad('version must be x.y.z');
  const by = r.decidedBy || {};
  if (!/^R-\d{2,}$/.test(by.reviewer || '') || !text(by.name, 3)) bad('decidedBy must carry the reviewer id (R-nn) and name');
  if (!isStamp(r.decidedAt)) bad('decidedAt must be a UTC date-time (2026-10-12T09:30:00Z)');
  else if (now ? Date.parse(r.decidedAt) > Date.parse(now) : r.decidedAt.slice(0, 10) > today) bad(`decidedAt ${r.decidedAt} is in the future`);
  if (!text(r.rationale, 10)) bad('rationale must say why (at least 10 characters; it is for people and is never read by the gate)');
  const ends = r.status === 'revoked' || r.status === 'superseded';
  if (ends && (!isStr(r.ends) || !new RegExp(`^${ty.prefix}-JE-\\d{3,}$`).test(r.ends))) bad(`a ${r.status} record must name the record it ends in "ends" (${ty.prefix}-JE-nnn)`);
  if (!ends && r.ends !== undefined) bad('"ends" is only allowed on a revoked or superseded record');
  const s = r.subject;
  if (!s || typeof s !== 'object' || Array.isArray(s)) { bad('subject must be an object'); return p; }
  if (r.status === 'approved') {
    if (r.type === 'release-approval' && !text(s.productionHost, 4)) bad('subject.productionHost must name the authorised production host');
    if (r.type === 'search-review') { if (!HEX64.test(s.searchDigest || '')) bad('subject.searchDigest must be the 64-hex digest of the reviewed search artifacts'); if (!Array.isArray(s.reviewed) || SEARCH_REVIEWED.some((k) => !s.reviewed.includes(k))) bad(`subject.reviewed must list ${SEARCH_REVIEWED.join(', ')}`); }
    if (r.type === 'rights-verification') { if (!Array.isArray(s.sources) || !s.sources.length || s.sources.some((x) => !text(x, 5))) bad('subject.sources must list the sources reviewed'); if (!isDate(s.verifiedOn)) bad('subject.verifiedOn must be a real date'); else if (isStamp(r.decidedAt) && s.verifiedOn > r.decidedAt.slice(0, 10)) bad('subject.verifiedOn is after the decision'); }
    if (dep) { if (!/^REL-JE-\d{3,}$/.test(s.releaseApproval || '')) bad('subject.releaseApproval must name the release approval relied on'); if (!text(s.targetHost, 4)) bad('subject.targetHost must name the host'); }
  }
  return p;
}

// ---- a family against the build ----------------------------------------------------------------------------------------------------------------------------
// ctx: { candidate (digest), channel, version, table (reviewers), today, baseHost, searchDigest }
// Returns { met, detail, errors[], inForce[], rows[] } for ONE record type.
export function resolve(entries, type, ctx) {
  const rows = [], errors = [];
  const mine = [], shaped = [], seenIds = new Map();
  for (const e of entries) {
    if (e.parseError || !e.record) { errors.push(`${e.file}: ${e.parseError || 'not readable'}`); rows.push({ file: e.file, id: null, state: `invalid: ${e.parseError || 'not readable'}` }); continue; }
    const r = e.record;
    const shape = validateRecordShape(r, ctx);
    if (shape.length) {
      // a malformed record of unknown type cannot be told from a decision about this one: it blocks, whatever it was meant to be
      errors.push(`${e.file}: ${shape[0]}`); rows.push({ file: e.file, id: r?.id ?? null, state: `invalid: ${shape.join('; ')}` }); continue;
    }
    if (seenIds.has(r.id)) { errors.push(`${e.file}: the id ${r.id} is used by more than one record (${seenIds.get(r.id)}): ids are unique, an ending names exactly one record`); rows.push({ file: e.file, id: r.id, state: `invalid: duplicate id (also ${seenIds.get(r.id)})` }); continue; }
    seenIds.set(r.id, e.file);
    shaped.push(r);
    if (r.type !== type) continue;   // a valid record of another type: counted by that type's resolution
    const base = { file: e.file, id: r.id, status: r.status, by: r.decidedBy.name, at: r.decidedAt };
    if (r.candidate !== ctx.candidate || r.channel !== ctx.channel || r.version !== ctx.version) { rows.push({ ...base, state: `history: another ${r.candidate !== ctx.candidate ? 'candidate' : r.channel !== ctx.channel ? 'channel' : 'version'}` }); continue; }
    const auth = authorise(r, ctx.table);
    if (!auth.ok) {
      rows.push({ ...base, state: `not counted: ${auth.why}` });
      if (NEGATIVE.includes(r.status)) errors.push(`${e.file}: an unauthorised ${r.status} record for this candidate (${auth.why}): resolve it (fix the reviewer table or remove the record)`);
      continue;
    }
    mine.push({ ...base, r, authorisedAs: auth.why });
  }
  // both records of a duplicated id are invalid (the first one was read before the second was seen)
  const dups = new Set(rows.filter((x) => x.state?.startsWith('invalid: duplicate id')).map((x) => x.id));
  for (const id of dups) { for (const m of [...mine]) if (m.id === id) { mine.splice(mine.indexOf(m), 1); rows.push({ file: m.file, id, state: 'invalid: duplicate id' }); } }
  // an ending that names a record of another candidate, channel or version is a mistake we cannot tell from an attempt: it blocks (fail closed)
  for (const r of shaped) {
    if (r.status !== 'revoked' && r.status !== 'superseded') continue;
    const t = shaped.find((x) => x.id === r.ends && x !== r);
    if (t && (t.candidate !== r.candidate || t.channel !== r.channel || t.version !== r.version)) errors.push(`${r.id}: ${r.status} record ends ${r.ends}, which was recorded for a different candidate, channel or version; record the ending against the same candidate`);
  }
  const byId = new Map(mine.map((m) => [m.id, m]));
  const ended = new Map();
  for (const m of mine) {
    if (m.status !== 'revoked' && m.status !== 'superseded') continue;
    const t = byId.get(m.r.ends);
    if (!t) { errors.push(`${m.file}: ${m.status} record ends ${m.r.ends}, which is not a ${type} for this candidate`); m.state = 'invalid: ends nothing'; continue; }
    if (t.status === 'revoked' || t.status === 'superseded') { errors.push(`${m.file}: ${m.r.ends} is itself a ${t.status} record; revocation is final, record a new decision instead`); m.state = 'invalid: ends an ending'; continue; }
    if (m.status === 'revoked' && t.status !== 'approved') { errors.push(`${m.file}: a revocation can end only an approval; ${t.id} is ${t.status} (use a superseded record)`); m.state = 'invalid: revokes a non-approval'; continue; }
    if (Date.parse(m.at) < Date.parse(t.at)) { errors.push(`${m.file}: ${m.status} record is dated before the decision it ends`); m.state = 'invalid: dated before its target'; continue; }
    if (m.status === 'superseded' && t.status === 'rejected' && !authorise({ ...m.r, status: 'rejected' }, ctx.table).ok) { errors.push(`${m.file}: ${m.r.decidedBy.reviewer} may supersede an approval but is not authorised to reject a ${type}, so cannot lift ${t.id}, a rejection (a veto is lifted only by someone who could have cast it)`); m.state = 'invalid: may not lift a rejection'; continue; }
    if (ended.has(t.id)) { errors.push(`${m.file}: ${t.id} is already ended by ${ended.get(t.id)}`); m.state = 'invalid: already ended'; continue; }
    ended.set(t.id, m.id); m.state = `in force: ends ${t.id}`;
  }
  const inForce = [];
  for (const m of mine) {
    if (m.status === 'revoked' || m.status === 'superseded') { rows.push({ file: m.file, id: m.id, status: m.status, by: m.by, at: m.at, state: m.state || 'in force' }); continue; }
    if (ended.has(m.id)) { rows.push({ file: m.file, id: m.id, status: m.status, by: m.by, at: m.at, state: `${m.status === 'approved' ? 'ended' : 'superseded'} by ${ended.get(m.id)}` }); continue; }
    let subject = [];
    if (m.status === 'approved') subject = subjectProblems(type, m.r.subject, ctx);
    rows.push({ file: m.file, id: m.id, status: m.status, by: m.by, at: m.at, state: subject.length ? `not counted: ${subject[0]}` : `in force (${m.authorisedAs})`, subject: subject.length ? subject : undefined });
    if (!subject.length || m.status === 'rejected') inForce.push(m);
  }
  const approved = inForce.filter((m) => m.status === 'approved'), rejected = inForce.filter((m) => m.status === 'rejected');
  const notCounted = rows.filter((r) => r.state.startsWith('not counted')).length;
  let detail;
  if (rejected.length) detail = `${type} rejected by ${rejected.map((m) => `${m.id} (${m.by})`).join(', ')}; supersede the rejection before approving`;
  else if (approved.length) detail = `${approved.map((m) => `${m.id} (${m.by}, ${m.at.slice(0, 10)})`).join(', ')}`;
  else detail = `no in-force ${type} for candidate ${ctx.candidate.slice(0, 12)}…${notCounted ? ` (${notCounted} record(s) not counted: ${rows.filter((r) => r.state.startsWith('not counted')).map((r) => `${r.id}: ${r.state.slice(13)}`).join('; ')})` : ' (no record exists)'}`;
  return { met: !rejected.length && approved.length > 0, detail, errors, inForce, rows, approved, rejected };
}

// What a record claims about the build it approves, where that has no requirement of its own. (A release approval's production host is judged by the gate's
// productionHostAuthorised requirement, see hostAuthorisation below.) Returns [problem].
function subjectProblems(type, s, ctx) {
  const p = [];
  if (type === 'search-review' && s.searchDigest !== ctx.searchDigest) p.push('it reviewed other search artifacts than this build generates');
  return p;
}

// Positive production-domain authorisation (design section 8): an in-force release approval must name exactly the host the build is for, and that host must
// not be a reserved, example, local, IP or preview/staging address. Returns { ok, detail }.
export function hostAuthorisation(release, baseHost) {
  if (!baseHost) return { ok: false, detail: 'the build declares no production host (seo.baseUrl)' };
  if (isReservedHost(baseHost)) return { ok: false, detail: `${baseHost} is a reserved, example, local or preview/staging address` };
  const hit = release.approved.find((m) => String(m.r.subject.productionHost).toLowerCase() === baseHost.toLowerCase());
  if (hit) return { ok: true, detail: `${hit.id} authorises ${baseHost}` };
  const named = release.approved.map((m) => m.r.subject.productionHost).join(', ');
  return { ok: false, detail: release.approved.length ? `the in-force release approval authorises ${named}, the build is for ${baseHost}` : `no in-force release approval names ${baseHost}` };
}

// Rows for the audit command, for any type of one family.
export function auditFamily(family, ctx, eng = engDir) {
  const entries = loadFamily(family, eng);
  const types = Object.entries(TYPES).filter(([, v]) => v.family === family).map(([k]) => k);
  const out = types.map((t) => ({ type: t, ...resolve(entries, t, ctx) }));
  // files that no type resolution mentions (invalid ones appear under every type; show each file once)
  const seen = new Map();
  for (const o of out) for (const r of o.rows) seen.set(`${r.file}`, seen.has(r.file) && r.state.startsWith('history') ? seen.get(r.file) : r);
  return { types: out, files: [...seen.values()].sort((a, b) => a.file.localeCompare(b.file)), count: entries.length };
}

// ---- demonstrations ---------------------------------------------------------------------------------------------------------------------------------------
export const loadDemonstrations = (eng = engDir) => readJson(join(eng, 'release', 'demonstrations.json'));
export function validateDemonstrations(d) {
  const p = [];
  if (!d || d.schema !== DEMONSTRATIONS_SCHEMA || !Array.isArray(d.registered)) return [`demonstrations.json: schema must be "${DEMONSTRATIONS_SCHEMA}" with a "registered" list`];
  for (const e of d.registered) {
    if (!/^DEMO-JE-\d{3,}$/.test(e.id || '')) p.push(`demonstration ${e.id}: id must look like DEMO-JE-001`);
    if (!HEX64.test(e.configurationDigest || '')) p.push(`demonstration ${e.id}: configurationDigest must be 64 hex`);
    if (!/^APR-JE-\d+$/.test(e.registeredBy || '')) p.push(`demonstration ${e.id}: registeredBy must name the governance record`);
    if (!text(e.description, 10)) p.push(`demonstration ${e.id}: describe what is registered`);
  }
  return p;
}

// Rights verifications that stand (approved and not ended by a revocation or a replacement), whatever the candidate: the static media check uses them to
// see that an asset marked `verified` names a record that exists. The release gate itself binds rights to the candidate (resolve()).
export function standingRightsRecords(eng = engDir) {
  const valid = loadFamily('approvals', eng).filter((e) => e.record && !validateRecordShape(e.record, { today: '9999-12-31' }).length).map((e) => e.record).filter((r) => r.type === 'rights-verification');
  const ended = new Set(valid.filter((r) => r.status === 'revoked' || r.status === 'superseded').map((r) => r.ends));
  return valid.filter((r) => r.status === 'approved' && !ended.has(r.id)).map((r) => ({ id: r.id, type: 'rights-verification' }));
}
