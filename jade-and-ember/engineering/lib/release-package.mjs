// Verifies a PREPARED release package the way a person receiving it would (Gate 5 Phase 7, APR-JE-035): the folder written by
// `npm run release:prepare` holds a ZIP, release-manifest.json, SHA256SUMS.txt and host/. Nothing here trusts the package: every claim in the
// manifest is recomputed from the ZIP's own bytes. A pass means the package is internally consistent and was released by the gate; it is NOT a
// signature (the checksums sit beside the files they protect, so someone who can rewrite the package can rewrite them too).
import Ajv from 'ajv/dist/2020.js';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { engDir, readJson, tempDir } from './git.mjs';
import { SHARED } from './site.mjs';
import { buildManifest } from './hashed.mjs';
import { validateSchema } from './schema.mjs';
import { unzipTo } from './zip.mjs';
import { searchDigest } from './release.mjs';
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
  const required = ['release-manifest.json', 'SHA256SUMS.txt', 'host/_headers', 'host/nginx.conf', 'host/htaccess'];
  const missing = required.filter((n) => !have(n));
  add('files', zips.length === 1 && !missing.length, zips.length !== 1 ? `expected exactly one ZIP, found ${zips.length}` : missing.length ? `missing ${missing.join(', ')}` : `${zips[0]}, release-manifest.json, SHA256SUMS.txt, host/ (3 files)`);
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
  if (m.channel === 'client-production') add('approvals-recorded', Boolean(m.approvals.releaseApproval && m.approvals.rightsVerification) && m.evidence.length > 0 && m.evidence.every((e) => e.valid), `release approval ${m.approvals.releaseApproval}, rights verification ${m.approvals.rightsVerification}, ${m.evidence.length} evidence record(s), ${m.evidence.filter((e) => !e.valid).length} invalid`);
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
    const start = entries.includes('START-HERE.txt') ? readFileSync(join(site, 'START-HERE.txt'), 'utf8') : '';
    const fict = /FICTIONAL demonstration/.test(start);
    add('channel-text', m.channel === 'demonstration' ? fict : !fict && start.includes(m.source.commit), m.channel === 'demonstration' ? (fict ? 'START-HERE.txt says it is a fictional demonstration' : 'a demonstration package must say it is fictional') : fict ? 'a client package that calls itself a fictional demonstration' : start.includes(m.source.commit) ? 'START-HERE.txt names the source commit' : 'START-HERE.txt does not name the manifest\'s source commit');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  return { ok: checks.every((c) => c.ok), checks };
}
