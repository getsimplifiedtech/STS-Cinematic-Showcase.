// Dependency and supply-chain release requirements and the composite SBOM (G6-3, APR-JE-040; decisions D-P6-5 and D-P6-7, findings RG-10 and RG-11).
//
//   composite SBOM   one deterministic CycloneDX 1.5 document with the delivered files (SHA-256), the fonts (licence and notice), the media (rights status), the
//                    tooling tree in development scope, and the environment. No timestamp and no random serial (the serial number is derived from the content), so
//                    the same inputs give the same bytes on any machine: that is what makes it independently reproducible and its digest verifiable.
//   exceptions       dependencies.json: every accepted advisory carries a plan, a review date and an expiry. The expiry is judged at RELEASE time (the gate), not at
//                    development time, so an old exception can never break an ordinary run; and a high or critical advisory can never be excepted for a release.
//   evidence         engineering/supply-chain-verification.json: a history of runs of `npm audit` and `npm audit signatures` on a networked runner, bound to the
//                    lockfile and to the SBOM digest. A record is evidence that a run was made and says what it saw; it does not authenticate who made it (G6-3-SCOPE.md).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJson } from './candidate.mjs';
import { engDir, listFiles, projectDir, readJson } from './git.mjs';
import { project } from './project.mjs';
import { licenceSections } from './media-rights.mjs';

const sha = (b) => createHash('sha256').update(b).digest('hex');
const HEX64 = /^[0-9a-f]{64}$/;
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
// newest first: by date, and for the same date by the number in the id (SCV-2 is newer than SCV-1); an older record never rescues a newer one
const idNum = (r) => Number(/(\d+)$/.exec(r?.id || '')?.[1] || 0);
export const newestFirst = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : idNum(b) - idNum(a));
const days = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
export const SEVERITIES = ['critical', 'high', 'moderate', 'low'];
export const SUPPLY_FILE = 'supply-chain-verification.json';

// Is an SPDX licence expression allowed by the list? Parentheses, AND (binds tighter) and OR are evaluated, `WITH exception` is judged by its licence id, and an expression
// that cannot be parsed is NOT allowed (G6-3 review, F8).
export function licenseOk(expr, allowed) {
  const toks = String(expr).match(/\(|\)|[^\s()]+/g) || [];
  let i = 0;
  const orExpr = () => { let v = andExpr(); while (toks[i]?.toUpperCase() === 'OR') { i++; const r = andExpr(); v = v || r; } return v; };
  const andExpr = () => { let v = atom(); while (toks[i]?.toUpperCase() === 'AND') { i++; const r = atom(); v = v && r; } return v; };
  const atom = () => {
    const t = toks[i++];
    if (t === undefined || t === ')' || /^(AND|OR|WITH)$/i.test(t)) throw new Error('bad expression');
    if (t === '(') { const v = orExpr(); if (toks[i++] !== ')') throw new Error('unclosed'); return v; }
    let ok = allowed.includes(t.replace(/\+$/, '')) || allowed.includes(t);
    if (toks[i]?.toUpperCase() === 'WITH') { i++; if (toks[i++] === undefined) throw new Error('bad exception'); }
    return ok;
  };
  try { const v = orExpr(); return i === toks.length && v; } catch { return false; }
}

// ---- the composite SBOM
const nameOf = (key) => key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
const purlOf = (name, version) => `pkg:npm/${name.startsWith('@') ? name.replace('@', '%40') : name}@${version}`;
const hexOfIntegrity = (i) => { const m = /^sha512-(.+)$/.exec(i || ''); return m ? Buffer.from(m[1], 'base64').toString('hex') : null; };
const prop = (name, value) => ({ name, value: String(value) });

export function buildCompositeSbom({ siteDir, root = projectDir, eng = engDir, inventory = null, version = null, channel = null } = {}) {
  const lockText = readFileSync(join(root, 'package-lock.json'));
  const lock = JSON.parse(lockText.toString('utf8'));
  const deps = readJson(join(eng, 'dependencies.json'));
  const env = readJson(join(eng, 'environment.json'));
  const authority = readJson(join(eng, 'authority.json'));
  const inv = inventory || readJson(join(eng, 'media-rights-inventory.json'));
  const ver = version || readJson(join(root, 'VERSION.json')).version;
  const invBy = new Map((inv.assets || []).map((a) => [a.path, a]));
  const licText = existsSync(join(siteDir, 'fonts', 'LICENSES.txt')) ? readFileSync(join(siteDir, 'fonts', 'LICENSES.txt'), 'utf8') : '';
  const sections = licenceSections(licText);
  const components = [];
  for (const f of listFiles(siteDir)) {
    if (/^(config|engineering)\//.test(f)) continue;
    const buf = readFileSync(join(siteDir, f));
    const hashes = [{ alg: 'SHA-256', content: sha(buf) }];
    if (f.startsWith('fonts/') && f !== 'fonts/LICENSES.txt') {
      const a = invBy.get(f);
      const sec = a ? sections.find((s) => s.family === a.licenceSection) : null;
      components.push({ type: 'data', 'bom-ref': `delivered:${f}`, name: f, hashes, licenses: [{ license: { id: 'OFL-1.1' } }], ...(sec?.notice ? { copyright: sec.notice } : {}), properties: [prop('sts:scope', 'delivered'), prop('sts:kind', 'font'), prop('sts:rights-status', a?.rights?.status ?? 'not-inventoried')] });
    } else if (f.startsWith('media/') && f !== 'media/PROVENANCE.md') {
      const a = invBy.get(f);
      components.push({ type: 'data', 'bom-ref': `delivered:${f}`, name: f, hashes, properties: [prop('sts:scope', 'delivered'), prop('sts:kind', a?.kind ?? 'media'), prop('sts:origin', a?.origin?.type ?? 'unrecorded'), prop('sts:rights-status', a?.rights?.status ?? 'not-inventoried'), ...(a?.rights?.approval ? [prop('sts:rights-record', a.rights.approval)] : [])] });
    } else components.push({ type: 'file', 'bom-ref': `delivered:${f}`, name: f, hashes, properties: [prop('sts:scope', 'delivered')] });
  }
  const verification = new Set(deps.verificationPackages || []);
  let tooling = 0;
  for (const [key, v] of Object.entries(lock.packages || {})) {
    if (!key) continue;
    const name = v.name || nameOf(key);
    const hex = hexOfIntegrity(v.integrity);
    const lic = typeof v.license === 'string' ? v.license : null;
    components.push({
      type: 'library', 'bom-ref': `tool:${key}`, name, version: v.version, purl: purlOf(name, v.version),
      ...(hex ? { hashes: [{ alg: 'SHA-512', content: hex }] } : {}),
      ...(lic ? { licenses: [/\s(OR|AND)\s/i.test(lic) ? { expression: lic } : { license: { id: lic } }] } : {}),
      scope: 'excluded',
      properties: [prop('sts:scope', 'development'), prop('sts:dev', v.dev === true), ...(verification.has(name) ? [prop('sts:runs-in-verification', true)] : [])],
    });
    tooling++;
  }
  components.sort((a, b) => (a['bom-ref'] < b['bom-ref'] ? -1 : a['bom-ref'] > b['bom-ref'] ? 1 : 0));
  const body = {
    bomFormat: 'CycloneDX', specVersion: '1.5', version: 1,
    metadata: {
      component: { type: 'application', 'bom-ref': project.id, name: project.id, version: ver },
      properties: [
        prop('sts:channel', channel ?? ''), prop('sts:lockfile-sha256', sha(lockText)), prop('sts:node-baseline', env.nodeBaseline?.version ?? ''), prop('sts:npm', env.nodeBaseline?.npm ?? ''),
        prop('sts:playwright', env.playwright ?? ''), prop('sts:framework-commit', authority.framework?.commit ?? ''), prop('sts:tooling-packages', tooling),
        prop('sts:note', 'Deterministic: no timestamp, no random serial. The same inputs give the same bytes; the digest of these bytes is what a release records.'),
      ],
    },
    components,
  };
  const hex = sha(canonicalJson(body));
  return { ...body, serialNumber: `urn:uuid:${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}` };
}

// stable bytes: keys sorted, two-space indent
const sorted = (v) => (Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])])) : v);
export const serialiseSbom = (sbom) => `${JSON.stringify(sorted(sbom), null, 2)}\n`;
export const sbomDigest = (text) => sha(text);

// Structural and content checks of an SBOM against what it must describe. delivered: Map path -> sha256 of the files that are delivered.
export function sbomProblems(sbom, { delivered = null, lockfileSha256 = null } = {}) {
  const p = [];
  if (!sbom || sbom.bomFormat !== 'CycloneDX' || sbom.specVersion !== '1.5') return ['not a CycloneDX 1.5 document'];
  if (!/^urn:uuid:[0-9a-f-]{36}$/.test(sbom.serialNumber || '')) p.push('serialNumber is not a urn:uuid');
  if (!Array.isArray(sbom.components) || !sbom.components.length) return [...p, 'no components'];
  if (sbom.metadata?.timestamp !== undefined) p.push('a timestamp makes the document differ on every run: it must be absent');
  const props = Object.fromEntries((sbom.metadata?.properties || []).map((x) => [x.name, x.value]));
  if (lockfileSha256 && props['sts:lockfile-sha256'] !== lockfileSha256) p.push('it describes another lockfile than the candidate');
  const refs = new Set();
  for (const c of sbom.components) { if (refs.has(c['bom-ref'])) p.push(`${c['bom-ref']} is listed twice`); refs.add(c['bom-ref']); }
  if (delivered) {
    const listed = new Map(sbom.components.filter((c) => /^delivered:/.test(c['bom-ref'])).map((c) => [c.name, c.hashes?.[0]?.content]));
    for (const [f, h] of delivered) if (listed.get(f) !== h) p.push(`${f}: ${listed.has(f) ? 'the SBOM records another hash' : 'is delivered but not in the SBOM'}`);
    for (const f of listed.keys()) if (!delivered.has(f)) p.push(`${f}: is in the SBOM but not delivered`);
  }
  for (const c of sbom.components.filter((x) => x.type === 'library')) if (!c.licenses?.length) p.push(`${c.name}@${c.version}: no licence recorded`);
  return p;
}

// ---- exceptions (dependencies.json, acceptedAdvisories.packages)
export function exceptionProblems(deps, today) {
  const p = [];
  for (const e of deps.acceptedAdvisories?.packages || []) {
    if (typeof e === 'string') { p.push(`accepted advisory "${e}" is a bare name: a release needs { name, severity, advisory, reason, reviewed, expires, plan }`); continue; }
    const w = `accepted advisory ${e.name}${e.advisory ? ` (${e.advisory})` : ''}`;
    if (!e.name || !/^GHSA-[0-9a-z-]+$/i.test(e.advisory || '')) p.push(`${w}: name and an advisory id (GHSA-…) are required`);
    if (!['moderate', 'low'].includes(e.severity)) p.push(`${w}: severity "${e.severity}" can never be excepted for a release (only moderate and low; a high or critical advisory is fixed or removed)`);
    if (!e.reason || String(e.reason).trim().length < 15) p.push(`${w}: a reason is required`);
    if (!e.plan || !['upgrade', 'replace', 'remove', 'wait'].includes(e.plan)) p.push(`${w}: plan must be upgrade, replace, remove or wait`);
    if (!isDate(e.reviewed) || !isDate(e.expires)) p.push(`${w}: reviewed and expires must be real dates`);
    else if (e.expires < today) p.push(`${w}: the exception expired on ${e.expires}; a person reviews it again`);
    else if (e.reviewed > today) p.push(`${w}: reviewed is in the future`);
    else if (days(e.reviewed, e.expires) > 90) p.push(`${w}: an exception runs for at most 90 days (reviewed ${e.reviewed}, expires ${e.expires})`);
  }
  return p;
}

// ---- the supply-chain verification history
export function supplyRecordProblems({ file, today }) {
  const p = [];
  if (!file || !Array.isArray(file.records)) return [`${SUPPLY_FILE} has no records list`];
  const ids = new Set();
  for (const r of file.records) {
    const w = `supply-chain record ${r && r.id}`;
    if (!r || !/^SCV-\d+$/.test(r.id || '')) { p.push(`${w}: id must look like SCV-1`); continue; }
    if (ids.has(r.id)) p.push(`${w}: listed twice`);
    ids.add(r.id);
    if (!isDate(r.date)) p.push(`${w}: date must be a real date`); else if (r.date > today) p.push(`${w}: date ${r.date} is in the future`);
    if (!r.runner || !['sandbox', 'github-actions', 'person'].includes(r.runner.kind)) p.push(`${w}: runner.kind must be sandbox, github-actions or person`);
    if (!r.runner || typeof r.runner.description !== 'string' || r.runner.description.trim().length < 10) p.push(`${w}: runner.description must say where the run happened and whether it had a network`);
    if (!HEX64.test(r.lockfileSha256 || '')) p.push(`${w}: lockfileSha256 must be 64 hex`);
    if (!HEX64.test(r.sbomSha256 || '')) p.push(`${w}: sbomSha256 must be 64 hex`);
    const a = r.audit || {};
    const counted = SEVERITIES.reduce((n, k) => n + (Number.isInteger(a[k]) && a[k] >= 0 ? a[k] : NaN), 0);
    if (!Number.isInteger(a.total) || a.total < 0 || counted !== a.total) p.push(`${w}: audit.total must equal critical + high + moderate + low, each a count of zero or more`);
    if (!Array.isArray(a.advisories) || a.advisories.length !== a.total) p.push(`${w}: audit.advisories must list each of the ${a.total} advisories`);
    else {
      const keys = new Set();
      for (const x of a.advisories) {
        if (!x || !x.package || !SEVERITIES.includes(x.severity) || !/^GHSA-/i.test(x.advisory || '')) { p.push(`${w}: an advisory entry needs package, severity and a GHSA id`); continue; }
        const k = `${x.package}|${x.advisory.toLowerCase()}`; if (keys.has(k)) p.push(`${w}: ${x.package} ${x.advisory} is listed twice`); keys.add(k);
      }
      for (const k of SEVERITIES) if (Number.isInteger(a[k]) && a.advisories.filter((x) => x && x.severity === k).length !== a[k]) p.push(`${w}: audit.${k} says ${a[k]} but the list has ${a.advisories.filter((x) => x && x.severity === k).length}`);
    }
    const s = r.signatures || {};
    for (const k of ['total', 'verified', 'failed', 'missing']) if (!Number.isInteger(s[k]) || s[k] < 0) p.push(`${w}: signatures.${k} must be a count`);
    if (r.runner?.kind === 'sandbox' && (s.verified || 0) > 0) p.push(`${w}: a sandbox run cannot have verified registry signatures (no network)`);
  }
  return p;
}

// What the history says about this build. lockPackages: number of packages in the lockfile (the signature count must cover them all).
// Returns { dependencySecurity: { ok, detail, record }, sbom: { ok, detail } }.
export function supplyStatus({ history, lockfileSha256, sbomSha256, lockPackages, deps, today, maxAgeDays = 30 }) {
  const none = (detail) => ({ ok: false, detail, record: null });
  let dependencySecurity, sbom;
  const mine = (history?.records || []).filter((r) => r && r.lockfileSha256 === lockfileSha256).sort(newestFirst);
  if (!mine.length) { dependencySecurity = none(`no supply-chain verification covers this lockfile (${String(lockfileSha256).slice(0, 12)}…): run npm run supply:record on a networked runner`); sbom = { ok: false, detail: 'no supply-chain verification covers this lockfile, so no SBOM digest was recorded' }; return { dependencySecurity, sbom }; }
  const r = mine[0];
  const probs = supplyRecordProblems({ file: { records: [r] }, today });
  if (probs.length) return { dependencySecurity: none(`${r.id} is not a well-formed record: ${probs[0]}`), sbom: { ok: false, detail: `${r.id} is not a well-formed record` } };
  const why = [];
  if (!['github-actions', 'person'].includes(r.runner.kind)) why.push(`${r.id} was made by a "${r.runner.kind}" run, which had no network and never counts`);
  const age = days(r.date, today);
  if (age > maxAgeDays) why.push(`${r.id} is ${age} days old (limit ${maxAgeDays})`);
  const exc = new Map((deps.acceptedAdvisories?.packages || []).filter((e) => typeof e === 'object').map((e) => [`${e.name}|${String(e.advisory).toLowerCase()}`, e]));
  const expired = exceptionProblems(deps, today);
  for (const x of r.audit.advisories) {
    if (['high', 'critical'].includes(x.severity)) { why.push(`${x.package} has a ${x.severity} advisory (${x.advisory}); none may remain at a client release`); continue; }
    const ex = exc.get(`${x.package}|${x.advisory.toLowerCase()}`);
    if (!ex) why.push(`${x.package}: ${x.severity} advisory ${x.advisory} has no exception in dependencies.json`);
    else if (ex.severity !== x.severity) why.push(`${x.package}: the exception for ${x.advisory} says ${ex.severity}, the advisory is ${x.severity}`);
  }
  if (r.audit.advisories.length) why.push(...expired);
  if (r.signatures.failed || r.signatures.missing) why.push(`registry signatures: ${r.signatures.failed} failed, ${r.signatures.missing} missing`);
  if (r.signatures.verified !== r.signatures.total || r.signatures.total !== lockPackages) why.push(`registry signatures cover ${r.signatures.verified} of ${r.signatures.total} packages, the lockfile has ${lockPackages}`);
  dependencySecurity = why.length ? { ok: false, detail: [...new Set(why)].slice(0, 3).join('; '), record: r } : { ok: true, detail: `${r.id} (${r.date}, ${r.runner.kind}): ${r.audit.total} advisories, ${r.signatures.verified} of ${r.signatures.total} registry signatures verified`, record: r };
  sbom = r.sbomSha256 === sbomSha256 ? { ok: true, detail: `${r.id} recorded the SBOM digest ${sbomSha256.slice(0, 12)}…, which regenerates identically from this build` } : { ok: false, detail: `${r.id} recorded SBOM digest ${r.sbomSha256.slice(0, 12)}…, this build regenerates ${String(sbomSha256).slice(0, 12)}…: the record is for other files, a different lockfile state or an older generator` };
  return { dependencySecurity, sbom };
}
