// Verifies a PREPARED release package the way a person receiving it would (Gate 5 Phase 7, APR-JE-035; release model v2, G6-2, APR-JE-039): the folder written by
// `npm run release:prepare` holds a ZIP, release-manifest.json, SHA256SUMS.txt and host/. Nothing here trusts the package: every claim in the
// manifest is recomputed from the ZIP's own bytes. A pass means the package is internally consistent and was released by the gate; it is NOT a
// signature (the checksums sit beside the files they protect, so someone who can rewrite the package can rewrite them too).
// v2 adds the binding the approvals rely on: the candidate artifact digest is recomputed from the ZIP's own bytes and the manifest's other parts, and the approval,
// evidence and reviewer records that travel in records/ are re-judged against it with the same code the gate uses, so an approval for a different artifact,
// a revoked or rejected approval, or a package whose ZIP is not the approved artifact fails.
import Ajv from 'ajv/dist/2020.js';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { engDir, readJson, tempDir } from './git.mjs';
import { SHARED } from './site.mjs';
import { buildManifest } from './hashed.mjs';
import { validateSchema } from './schema.mjs';
import { unzipTo } from './zip.mjs';
import { DEMONSTRATION_STATEMENT, searchDigest } from './release.mjs';
import { fromParts } from './candidate.mjs';
import { hostAuthorisation, resolve, validateDemonstrations, validateReviewers } from './records.mjs';
import { assessEvidence, coverage, defaultVctx, loadSpec as loadEvidenceSpec } from './evidence.mjs';
import { sealOf } from './verification.mjs';
import { buildCsp, loadPolicy, renderApache, renderHeadersFile, renderNginx } from './security.mjs';

const sha = (b) => createHash('sha256').update(b).digest('hex');
const SEARCH = ['sitemap.xml', 'robots.txt', 'llms.txt'];

// Returns { ok, checks: [{ id, ok, detail }] } . dir: the release/ folder.
export function verifyPackage(dir) {
  const checks = [];
  const add = (id, ok, detail) => checks.push({ id, ok: Boolean(ok), detail });
  const read = (n) => readFileSync(join(dir, n));
  const have = (n) => existsSync(join(dir, n));
  const zips = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.zip')) : [];
  const required = ['release-manifest.json', 'SHA256SUMS.txt', 'host/_headers', 'host/nginx.conf', 'host/htaccess', 'records/reviewers.json', 'records/demonstrations.json', 'records/verification.json'];
  const missing = required.filter((n) => !have(n));
  add('files', zips.length === 1 && !missing.length, zips.length !== 1 ? `expected exactly one ZIP, found ${zips.length}` : missing.length ? `missing ${missing.join(', ')}` : `${zips[0]}, release-manifest.json, SHA256SUMS.txt, host/ (3 files), records/`);
  if (zips.length !== 1 || missing.length) return { ok: false, checks };
  const zipName = zips[0], zip = read(zipName);

  // 1. SHA256SUMS lists exactly the manifest and the ZIP, and both hashes are right
  const lines = read('SHA256SUMS.txt').toString('utf8').split('\n').filter(Boolean);
  const listed = {}; let formatOk = true;
  for (const l of lines) { const m = /^([0-9a-f]{64})  (\S+)$/.exec(l); if (!m) { formatOk = false; continue; } listed[m[2]] = m[1]; }
  const wanted = ['release-manifest.json', zipName].sort();
  const names = Object.keys(listed).sort();
  const wrong = wanted.filter((n) => listed[n] && listed[n] !== sha(read(n)));
  add('checksums', formatOk && names.join() === wanted.join() && !wrong.length, !formatOk ? 'a line of SHA256SUMS.txt is malformed' : names.join() !== wanted.join() ? `SHA256SUMS.txt lists ${names.join(', ') || 'nothing'}; expected ${wanted.join(', ')}` : wrong.length ? `hash mismatch: ${wrong.join(', ')}` : 'both hashes match');

  // 2. the manifest is valid and says what the ZIP is
  let m = null;
  try { m = JSON.parse(read('release-manifest.json').toString('utf8')); } catch (e) { add('manifest', false, `not valid JSON (${e.message.slice(0, 60)})`); return { ok: false, checks }; }
  const schema = readJson(join(engDir, 'release', 'release-manifest.schema.json'));
  const errs = validateSchema(m, schema, 'manifest');
  const ajv = new Ajv({ strict: true, allErrors: true });
  const ajvOk = ajv.compile(schema)(m);
  add('manifest', !errs.length && ajvOk, errs.length ? `schema: ${errs[0]}` : !ajvOk ? 'invalid under Ajv' : `valid under two validators; ${m.channel} ${m.version}`);
  if (errs.length || !ajvOk) return { ok: false, checks };
  const pk = m.package || {};
  add('package-binding', pk.name === zipName && pk.bytes === zip.length && pk.sha256 === sha(zip), pk.name !== zipName ? `manifest names ${pk.name}, the file is ${zipName}` : pk.bytes !== zip.length ? `manifest says ${pk.bytes} bytes, the ZIP has ${zip.length}` : pk.sha256 !== sha(zip) ? 'the ZIP is not the file the manifest describes (SHA-256 differs)' : `${zipName}, ${zip.length} bytes, SHA-256 matches the manifest`);

  // 3. the manifest records a gate that allowed this build (a manifest can be printed for a blocked build; such a package must never ship)
  const gate = m.gate || {};
  const failing = (gate.requirements || []).filter((r) => !r.ok).map((r) => r.id);
  add('gate-recorded', gate.allowed === true && !failing.length && gate.channel === m.channel && m.source.dirty === false && m.qa.verified === true && !m.approvals.missing.length, gate.allowed !== true ? 'the manifest records a BLOCKED gate' : failing.length ? `unmet requirements recorded: ${failing.join(', ')}` : gate.channel !== m.channel ? 'gate channel differs from the build channel' : m.source.dirty ? 'built from a dirty tree' : !m.qa.verified ? 'the full verification is not recorded as passed for this commit' : m.approvals.missing.length ? `required approvals missing: ${m.approvals.missing.join(', ')}` : `allowed by the gate; clean tree; full verification recorded for ${m.source.commit.slice(0, 7)}; ${m.approvals.required.length} required records present`);
  // (the approvals, evidence and reviewer records are re-judged below, once the candidate digest has been recomputed from the ZIP)
  const expectName = m.channel === 'client-production' ? `jade-and-ember-${m.version}-site.zip` : null;
  add('package-name', expectName ? zipName === expectName : /\.zip$/.test(zipName), expectName ? (zipName === expectName ? zipName : `${zipName} should be ${expectName} for a client production release`) : zipName);

  // 4. unpack (CRC checked, unsafe paths refused) and recompute everything the manifest claims
  const tmp = tempDir('pkg'), site = join(tmp, 'site');
  try {
    mkdirSync(site, { recursive: true });
    let entries;
    try { entries = unzipTo(zip, site); } catch (e) { add('zip', false, e.message); return { ok: false, checks }; }
    const pages = entries.filter((n) => /^[^/]+\.html$/.test(n));
    const allowed = (n) => pages.includes(n) || SHARED.includes(n) || /^fonts\/[^/]+$/.test(n) || /^media\/[^/]+$/.test(n) || SEARCH.includes(n) || n === 'START-HERE.txt' || n === 'serve.py';
    const stray = entries.filter((n) => !allowed(n));
    const hasSearch = SEARCH.filter((n) => entries.includes(n));
    add('zip-contents', !stray.length && (m.channel === 'client-production' ? hasSearch.length === 3 : hasSearch.length === 0), stray.length ? `files that do not belong in a delivered site: ${stray.slice(0, 5).join(', ')}` : m.channel === 'client-production' ? (hasSearch.length === 3 ? `${entries.length} files, search files present` : `a client production package must carry ${SEARCH.join(', ')}`) : (hasSearch.length ? 'a demonstration package must not carry search files' : `${entries.length} files, no search files (demonstration)`));
    let am;
    try { am = buildManifest(site); } catch (e) { add('asset-tree', false, `the ZIP does not hold a complete delivered site (${String(e.message).split(',')[0].replace(/'\/.*\//, "'")})`); return { ok: false, checks }; }
    add('asset-tree', am.treeSha256 === m.assets.treeSha256 && am.fileCount === m.assets.fileCount && am.totalBytes === m.assets.totalBytes && m.assets.manifestMatches === true, am.treeSha256 !== m.assets.treeSha256 ? 'the delivered files hash to a different tree than the manifest records (the ZIP is not what was verified)' : am.fileCount !== m.assets.fileCount || am.totalBytes !== m.assets.totalBytes ? 'file count or size differs' : !m.assets.manifestMatches ? 'the recorded asset manifest did not match at release time' : `${am.fileCount} files, ${am.totalBytes} bytes, tree ${am.treeSha256.slice(0, 12)}…`);
    const dig = m.channel === 'client-production' ? searchDigest(site) : null;
    add('search-digest', m.channel === 'client-production' ? dig === m.search.artifactsDigest : m.search.artifactsDigest === null, m.channel === 'client-production' ? (dig === m.search.artifactsDigest ? `${String(dig).slice(0, 12)}… equals the reviewed digest` : 'the search files in the ZIP are not the ones the manifest records') : 'no search artifacts, as a demonstration should have');
    const pol = loadPolicy(), csp = buildCsp(site, pol), cspS = buildCsp(site, pol, { https: true });
    const hosts = { '_headers': renderHeadersFile(site, pol, { https: true }), 'nginx.conf': renderNginx(site, pol, { https: true }), htaccess: renderApache(site, pol, { https: true }) };
    const same = Object.entries(hosts).filter(([f, t]) => read(`host/${f}`).toString('utf8') !== t).map(([f]) => f);
    add('security', sha(csp) === m.security.cspSha256 && !same.length && read('host/_headers').toString('utf8').includes(cspS), sha(csp) !== m.security.cspSha256 ? 'the Content Security Policy for the delivered pages differs from the manifest' : same.length ? `host/${same.join(', host/')} differs from what the delivered pages require` : `CSP ${m.security.cspSha256.slice(0, 12)}… and the three host files match the pages`);
    // ---- release model v2: the approved artifact is the delivered artifact (G6-2)
    const parts = { ...m.candidate.parts, delivered: am.treeSha256, search: m.channel === 'client-production' ? dig : null, securityPolicy: { ...m.candidate.parts.securityPolicy, csp: sha(csp) } };
    const cd = fromParts(m.channel, m.version, parts);
    add('candidate-digest', cd.digest === m.candidate.digest && m.candidate.parts.delivered === am.treeSha256, cd.digest !== m.candidate.digest ? 'the artifact in the ZIP is not the candidate artifact the manifest names: the recomputed digest differs (the ZIP was changed, or the manifest was)' : m.candidate.parts.delivered !== am.treeSha256 ? 'the manifest\'s delivered-file part is not the ZIP\'s tree' : `${cd.digest.slice(0, 16)}… recomputed from the ZIP's bytes and the manifest's parts`);
    const readJ = (n) => { try { return JSON.parse(read(n).toString('utf8')); } catch { return null; } };
    const family = (f) => { const d = join(dir, 'records', f); return existsSync(d) ? readdirSync(d).filter((x) => x.endsWith('.json')).sort().map((x) => { try { return { file: x, record: JSON.parse(readFileSync(join(d, x), 'utf8')) }; } catch (e) { return { file: x, record: null, parseError: 'not valid JSON' }; } }) : []; };
    const listed = (f) => (m.records[f] || []).map((x) => `${x.file}:${x.sha256}`).sort().join('|');
    const actual = (f) => family(f).map((x) => `${x.file}:${sha(readFileSync(join(dir, 'records', f, x.file)))}`).sort().join('|');
    const sameRecords = ['approvals', 'evidence', 'deployments'].every((f) => listed(f) === actual(f)) && sha(read('records/reviewers.json')) === m.records.reviewers.sha256 && sha(read('records/demonstrations.json')) === m.records.demonstrations.sha256;
    add('records-embedded', sameRecords, sameRecords ? `${m.records.approvals.length} approval, ${m.records.evidence.length} evidence and ${m.records.deployments.length} deployment record file(s), the reviewer table and the demonstration registry match the manifest` : 'the records in the package are not the ones the manifest lists (added, removed or edited)');
    const vr = readJ('records/verification.json');
    const vOk = vr && vr.schema === 'jade-and-ember/verification@1' && vr.seal === sealOf(vr) && vr.candidate === m.candidate.digest && vr.mode === 'full' && vr.passed === true && Array.isArray(vr.checks) && vr.checks.length > 0 && vr.checks.every((c) => c.passed === true) && vr.seal === m.qa.report?.seal && vr.engineDigest === m.qa.report?.engineDigest;
    add('verification-record', Boolean(vOk), vOk ? `a sealed full verification of ${vr.checks.length} checks for this candidate (${vr.environment?.runner})` : 'the verification record in the package is missing, edited, incomplete, failing, for another candidate, or not the one the manifest names');
    const table = readJ('records/reviewers.json'), reg = readJ('records/demonstrations.json');
    if (m.channel === 'client-production') {
      const baseHost = (() => { try { return new URL(m.configuration.baseUrl).hostname; } catch { return null; } })();
      const rctx = { candidate: m.candidate.digest, channel: m.channel, version: m.version, table: table || { reviewers: [] }, today: new Date().toISOString().slice(0, 10), baseHost, searchDigest: m.search.artifactsDigest };
      const ap = family('approvals'), rel = resolve(ap, 'release-approval', rctx), rights = resolve(ap, 'rights-verification', rctx), rev = resolve(ap, 'search-review', rctx), dep = resolve(family('deployments'), 'deployment-authorisation', rctx);
      const host = hostAuthorisation(rel, baseHost);
      const errs = [...new Set([...rel.errors, ...rights.errors, ...rev.errors, ...dep.errors, ...validateReviewers(table)])];
      add('approvals-recorded', rel.met && host.ok && rights.met && rev.met && !errs.length, !rel.met ? `no in-force release approval for this candidate in the package (${rel.detail})` : !host.ok ? host.detail : !rights.met ? `no in-force rights verification (${rights.detail})` : !rev.met ? `no in-force search review (${rev.detail})` : errs.length ? `record errors: ${errs.slice(0, 2).join('; ')}` : `release approval ${rel.approved.map((x) => x.id).join(', ')} (${host.detail}), rights verification ${rights.approved.map((x) => x.id).join(', ')}, search review ${rev.approved.map((x) => x.id).join(', ')}, all in force for ${m.candidate.digest.slice(0, 12)}…`);
      const ev = assessEvidence(family('evidence'), defaultVctx({ releaseCommit: m.source.commit, assetsTree: m.assets.treeSha256, candidate: m.candidate.digest, verification: m.qa.report ? { engineDigest: m.qa.report.engineDigest, registryDigest: m.qa.report.registryDigest, total: m.qa.report.checks.length } : null, git: { isCommit: (c) => /^[0-9a-f]{40}$/.test(c), isAncestor: () => true, commitDate: () => '1970-01-01' }, fs: { exists: (p) => existsSync(join(dir, 'records', 'evidence', 'files', p.replace(/^.*\/files\//, ''))), read: (p) => readFileSync(join(dir, 'records', 'evidence', 'files', p.replace(/^.*\/files\//, ''))) } }));
      const spec = loadEvidenceSpec(), covered = ['real-device', 'screen-reader', 'browser-matrix', 'ci-run'].map((t) => [t, coverage(spec, t, ev)]);
      add('evidence-recorded', covered.every(([, c]) => c.ok), covered.every(([, c]) => c.ok) ? `${ev.length} evidence record(s) bound to this candidate cover real devices, screen readers, browsers and CI` : `evidence not satisfied for ${covered.filter(([, c]) => !c.ok).map(([t]) => t).join(', ')}`);
    }
    // ---- channel separation (G6-2, RG-13): the marker is in the manifest and the package text, never in a page
    const regOk = reg && !validateDemonstrations(reg).length ? (reg.registered || []).find((d) => d.configurationDigest === m.candidate.parts.configuration) : null;
    if (m.channel === 'demonstration') add('demonstration-marker', Boolean(m.demonstration && m.demonstration.fictional === true && m.demonstration.statement === DEMONSTRATION_STATEMENT && regOk && m.demonstration.registeredAs === regOk.id && (m.search.baseUrlReserved === true || !m.configuration.baseUrl)), m.demonstration ? (regOk ? (m.search.baseUrlReserved === true || !m.configuration.baseUrl ? `${regOk.id}: the registered fictional demonstration, with the marker and no production domain` : 'a demonstration that declares a production-looking domain') : 'this configuration is not a registered demonstration (client-style content cannot be packaged as one)') : 'a demonstration package must carry the demonstration marker in its manifest');
    else add('demonstration-marker', m.demonstration === null, m.demonstration === null ? 'a client package carries no demonstration marker' : 'a client package that carries the demonstration marker');
    const start = entries.includes('START-HERE.txt') ? readFileSync(join(site, 'START-HERE.txt'), 'utf8') : '';
    const fict = start.includes(DEMONSTRATION_STATEMENT);
    add('channel-text', m.channel === 'demonstration' ? fict : !fict && start.includes(m.source.commit), m.channel === 'demonstration' ? (fict ? 'START-HERE.txt carries the demonstration statement' : 'a demonstration package must carry the demonstration statement in START-HERE.txt') : fict ? 'a client package that calls itself a fictional demonstration' : start.includes(m.source.commit) ? 'START-HERE.txt names the source commit' : 'START-HERE.txt does not name the manifest\'s source commit');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  return { ok: checks.every((c) => c.ok), checks };
}
