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
import { coreDir, project } from './project.mjs';
import { SHARED } from './site.mjs';
import { buildManifest } from './hashed.mjs';
import { validateSchema } from './schema.mjs';
import { unzipTo } from './zip.mjs';
import { DEMONSTRATION_STATEMENT, searchDigest } from './release.mjs';
import { fromParts, startHereText, startHereTemplateSha } from './candidate.mjs';
import { hostAuthorisation, loadFamily, resolve, validateDemonstrations, validateReviewers } from './records.mjs';
import { assessEvidence, coverage, defaultVctx, loadEvidenceEntries, loadSpec as loadEvidenceSpec } from './evidence.mjs';
import { engineDigest, expectedCheckIds, registryDigest, validateVerification } from './verification.mjs';
import { isReservedHost } from './hosts.mjs';
import { parseStrictJson } from './strict-json.mjs';
import { deliveredDestinations, externalLinksGate } from './external-gate.mjs';
import { deliveredMediaDigest, rightsClearance } from './media-rights.mjs';
import { sbomProblems, supplyStatus } from './supply.mjs';
import { socialImageStatus } from './social.mjs';
import { verifyAuthenticity } from './authenticity.mjs';
import { buildCsp, loadPolicy, renderApache, renderHeadersFile, renderNginx } from './security.mjs';
import { record } from './project-records.mjs';
import { policyFile, policyIn, releaseManifestSchema } from './policy.mjs';

const sha = (b) => createHash('sha256').update(b).digest('hex');
const SEARCH = ['sitemap.xml', 'robots.txt', 'llms.txt'];

// Returns { ok, checks: [{ id, ok, detail }] } . dir: the release/ folder.
// opts.authenticity: a replacement verifier, for the dry run's throwaway copy only; the command line never passes one (lib/authenticity.mjs is a hard stop)
// eng: the project's engineering folder (its records and overlays); core: the engineering's own code; projectRoot: the project that owns them when it is not the running one (a throwaway copy)
export function verifyPackage(dir, { eng = engDir, core = coreDir, projectRoot = null, authenticity = verifyAuthenticity } = {}) {
  const checks = [];
  const add = (id, ok, detail) => checks.push({ id, ok: Boolean(ok), detail });
  const read = (n) => readFileSync(join(dir, n));
  const have = (n) => existsSync(join(dir, n));
  const zips = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.zip')) : [];
  const required = ['release-manifest.json', 'SHA256SUMS.txt', 'host/_headers', 'host/nginx.conf', 'host/htaccess', 'records/reviewers.json', 'records/demonstrations.json', 'records/verification.json', 'sbom.cdx.json', 'records/external-links-verification.json', 'records/supply-chain-verification.json', 'records/dependencies.json', 'records/media-rights-inventory.json'];
  const missing = required.filter((n) => !have(n));
  add('files', zips.length === 1 && !missing.length, zips.length !== 1 ? `expected exactly one ZIP, found ${zips.length}` : missing.length ? `missing ${missing.join(', ')}` : `${zips[0]}, release-manifest.json, SHA256SUMS.txt, host/ (3 files), records/`);
  if (zips.length !== 1 || missing.length) return { ok: false, checks };
  const zipName = zips[0], zip = read(zipName);

  // 1. SHA256SUMS lists exactly the manifest and the ZIP, and both hashes are right
  const lines = read('SHA256SUMS.txt').toString('utf8').split('\n').filter(Boolean);
  const listed = {}; let formatOk = true;
  for (const l of lines) { const m = /^([0-9a-f]{64})  (\S+)$/.exec(l); if (!m) { formatOk = false; continue; } listed[m[2]] = m[1]; }
  const wanted = ['release-manifest.json', zipName, 'sbom.cdx.json'].sort();
  const names = Object.keys(listed).sort();
  const wrong = wanted.filter((n) => listed[n] && listed[n] !== sha(read(n)));
  add('checksums', formatOk && names.join() === wanted.join() && !wrong.length, !formatOk ? 'a line of SHA256SUMS.txt is malformed' : names.join() !== wanted.join() ? `SHA256SUMS.txt lists ${names.join(', ') || 'nothing'}; expected ${wanted.join(', ')}` : wrong.length ? `hash mismatch: ${wrong.join(', ')}` : 'all three hashes match');

  // 2. the manifest is valid and says what the ZIP is
  let m = null;
  try { m = JSON.parse(read('release-manifest.json').toString('utf8')); } catch (e) { add('manifest', false, `not valid JSON (${e.message.slice(0, 60)})`); return { ok: false, checks }; }
  const schema = releaseManifestSchema();
  const errs = validateSchema(m, schema, 'manifest');
  const ajv = new Ajv({ strict: true, allErrors: true });
  const ajvOk = ajv.compile(schema)(m);
  add('manifest', !errs.length && ajvOk, errs.length ? `schema: ${errs[0]}` : !ajvOk ? 'invalid under Ajv' : `valid under two validators; ${m.channel} ${m.version}`);
  if (errs.length || !ajvOk) return { ok: false, checks };
  const pk = m.package || {};
  add('package-binding', pk.name === zipName && pk.bytes === zip.length && pk.sha256 === sha(zip), pk.name !== zipName ? `manifest names ${pk.name}, the file is ${zipName}` : pk.bytes !== zip.length ? `manifest says ${pk.bytes} bytes, the ZIP has ${zip.length}` : pk.sha256 !== sha(zip) ? 'the ZIP is not the file the manifest describes (SHA-256 differs)' : `${zipName}, ${zip.length} bytes, SHA-256 matches the manifest`);

  // 3. the manifest records a gate that allowed this build (a manifest can be printed for a blocked build; such a package must never ship). The requirement list
  // must be the policy's own list for the channel: a manifest that lists fewer requirements than the policy asks for is not a record of the gate (G6-2 review, F4a).
  const gate = m.gate || {};
  const policy = policyIn('release/policy', eng, { core });
  const needed = policy.channels[m.channel]?.requires || [];
  const listedIds = (gate.requirements || []).map((r) => r.id);
  const unlisted = needed.filter((r) => !listedIds.includes(r));
  const failing = (gate.requirements || []).filter((r) => !r.ok).map((r) => r.id);
  const blocking = (m.findings || []).filter((f) => policy.blockingSeverities.includes(f.severity));
  const prerelease = m.channel === 'client-production' && /-/.test(m.version);
  add('gate-recorded', gate.allowed === true && !failing.length && !unlisted.length && gate.channel === m.channel && m.source.dirty === false && m.qa.verified === true && !m.approvals.missing.length && !blocking.length && !prerelease, gate.allowed !== true ? 'the manifest records a BLOCKED gate' : unlisted.length ? `the recorded gate does not list the policy's requirements for a ${m.channel} release (${unlisted.join(', ')})` : failing.length ? `unmet requirements recorded: ${failing.join(', ')}` : gate.channel !== m.channel ? 'gate channel differs from the build channel' : m.source.dirty ? 'built from a dirty tree' : !m.qa.verified ? 'the full verification is not recorded as passed for this commit' : m.approvals.missing.length ? `required approvals missing: ${m.approvals.missing.join(', ')}` : blocking.length ? `open Blocker or Major finding(s): ${blocking.map((f) => f.id).join(', ')}` : prerelease ? `${m.version} is a pre-release, not a client production version` : `allowed by the gate (all ${needed.length} requirements of the policy listed and met); clean tree; full verification recorded for ${m.source.commit.slice(0, 7)}; ${m.approvals.required.length} required records present`);
  // (the approvals, evidence and reviewer records are re-judged below, once the candidate digest has been recomputed from the ZIP)
  const expectName = m.channel === 'client-production' ? `${project.id}-${m.version}-site.zip` : null;
  add('package-name', expectName ? zipName === expectName : /^[A-Za-z0-9._-]+\.zip$/.test(zipName), expectName ? (zipName === expectName ? zipName : `${zipName} should be ${expectName} for a client production release`) : zipName);

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
    // the two files besides the delivered site are part of the candidate: serve.py is run by the recipient, START-HERE.txt tells them to (G6-2 review, F1)
    const ex = m.candidate.parts.packageExtras || {};
    const startOk = entries.includes('START-HERE.txt') && readFileSync(join(site, 'START-HERE.txt'), 'utf8') === startHereText({ version: m.version, channel: m.channel, commit: m.source.commit, candidate: m.candidate.digest });
    const serveOk = entries.includes('serve.py') && sha(readFileSync(join(site, 'serve.py'))) === ex.servePy;
    add('package-extras', startOk && serveOk && ex.startHereTemplate === startHereTemplateSha(m.version, m.channel), !serveOk ? 'serve.py in the ZIP is not the file the candidate digest covers' : !startOk ? 'START-HERE.txt is not the text this release generates for this commit and candidate (it was changed)' : ex.startHereTemplate !== startHereTemplateSha(m.version, m.channel) ? 'the START-HERE.txt template the candidate covers differs from this verifier\'s' : 'serve.py is the file the candidate covers and START-HERE.txt is exactly the generated text');
    let am;
    try { am = buildManifest(site); } catch (e) { add('asset-tree', false, `the ZIP does not hold a complete delivered site (${String(e.message).split(',')[0].replace(/'\/.*\//, "'")})`); return { ok: false, checks }; }
    add('asset-tree', am.treeSha256 === m.assets.treeSha256 && am.fileCount === m.assets.fileCount && am.totalBytes === m.assets.totalBytes && m.assets.manifestMatches === true, am.treeSha256 !== m.assets.treeSha256 ? 'the delivered files hash to a different tree than the manifest records (the ZIP is not what was verified)' : am.fileCount !== m.assets.fileCount || am.totalBytes !== m.assets.totalBytes ? 'file count or size differs' : !m.assets.manifestMatches ? 'the recorded asset manifest did not match at release time' : `${am.fileCount} files, ${am.totalBytes} bytes, tree ${am.treeSha256.slice(0, 12)}…`);
    const dig = m.channel === 'client-production' ? searchDigest(site) : null;
    add('search-digest', m.channel === 'client-production' ? dig === m.search.artifactsDigest : m.search.artifactsDigest === null, m.channel === 'client-production' ? (dig === m.search.artifactsDigest ? `${String(dig).slice(0, 12)}… equals the reviewed digest` : 'the search files in the ZIP are not the ones the manifest records') : 'no search artifacts, as a demonstration should have');
    let csp = '';
    try {
      const pol = loadPolicy(); csp = buildCsp(site, pol); const cspS = buildCsp(site, pol, { https: true });
      const hosts = { '_headers': renderHeadersFile(site, pol, { https: true }), 'nginx.conf': renderNginx(site, pol, { https: true }), htaccess: renderApache(site, pol, { https: true }) };
      const same = Object.entries(hosts).filter(([f, t]) => read(`host/${f}`).toString('utf8') !== t).map(([f]) => f);
      add('security', sha(csp) === m.security.cspSha256 && !same.length && read('host/_headers').toString('utf8').includes(cspS), sha(csp) !== m.security.cspSha256 ? 'the Content Security Policy for the delivered pages differs from the manifest' : same.length ? `host/${same.join(', host/')} differs from what the delivered pages require` : `CSP ${m.security.cspSha256.slice(0, 12)}… and the three host files match the pages`);
    } catch (e) { add('security', false, `the delivered pages cannot be given security headers: ${String(e.message).slice(0, 140)}`); }
    // ---- release model v2: the approved artifact is the delivered artifact (G6-2)
    const parts = { ...m.candidate.parts, delivered: am.treeSha256, search: m.channel === 'client-production' ? dig : null, securityPolicy: { ...m.candidate.parts.securityPolicy, csp: sha(csp) } };
    const cd = fromParts(m.channel, m.version, parts);
    add('candidate-digest', cd.digest === m.candidate.digest && m.candidate.parts.delivered === am.treeSha256, cd.digest !== m.candidate.digest ? 'the artifact in the ZIP is not the candidate artifact the manifest names: the recomputed digest differs (the ZIP was changed, or the manifest was)' : m.candidate.parts.delivered !== am.treeSha256 ? 'the manifest\'s delivered-file part is not the ZIP\'s tree' : `${cd.digest.slice(0, 16)}… recomputed from the ZIP's bytes and the manifest's parts`);
    const readJ = (n) => { try { return parseStrictJson(read(n).toString('utf8')); } catch { return null; } };
    const family = (f) => (f === 'evidence' ? loadEvidenceEntries(join(dir, 'records', 'evidence')) : loadFamily(f, eng, { dir: join(dir, 'records', f) }));
    const listed = (f) => (m.records[f] || []).map((x) => `${x.file}:${x.sha256}`).sort().join('|');
    const actual = (f) => family(f).map((x) => `${x.file}:${sha(readFileSync(join(dir, 'records', f, x.file)))}`).sort().join('|');
    const sameRecords = ['approvals', 'evidence', 'deployments'].every((f) => listed(f) === actual(f)) && sha(read('records/reviewers.json')) === m.records.reviewers.sha256 && sha(read('records/demonstrations.json')) === m.records.demonstrations.sha256 && sha(read('records/external-links-verification.json')) === m.records.externalLinksHistory.sha256 && sha(read('records/supply-chain-verification.json')) === m.records.supplyChainHistory.sha256 && sha(read('records/dependencies.json')) === m.candidate.parts.dependencyPolicy && sha(read('records/media-rights-inventory.json')) === m.candidate.parts.mediaRights;
    add('records-embedded', sameRecords, sameRecords ? `${m.records.approvals.length} approval, ${m.records.evidence.length} evidence and ${m.records.deployments.length} deployment record file(s), the reviewer table, the demonstration registry, the two verification histories, the dependency register and the rights inventory match the manifest (or the candidate)` : 'the records in the package are not the ones the manifest lists (added, removed or edited)');
    // G6-3: the composite SBOM travels with the package; it must be the file the manifest names, describe exactly the delivered files, and the lockfile the candidate covers
    const sbomText = read('sbom.cdx.json').toString('utf8');
    let sbomObj = null; try { sbomObj = JSON.parse(sbomText); } catch { /* reported */ }
    const deliveredMap = new Map(entries.filter((n) => n !== 'START-HERE.txt' && n !== 'serve.py').map((n) => [n, sha(readFileSync(join(site, n)))]));
    const sbomProbs = sbomObj ? sbomProblems(sbomObj, { delivered: deliveredMap, lockfileSha256: m.candidate.parts.engines.lockfileSha256 }) : ['sbom.cdx.json is not valid JSON'];
    if (sha(sbomText) !== m.supplyChain.sbom.sha256 || Buffer.byteLength(sbomText) !== m.supplyChain.sbom.bytes) sbomProbs.unshift('it is not the SBOM the manifest names (hash or size differs)');
    add('sbom', !sbomProbs.length, sbomProbs.length ? `the composite SBOM: ${sbomProbs[0]}` : `${sbomObj.components.length} components: every delivered file with its hash, the tooling tree in development scope, the lockfile the candidate covers`);
    // the rules the package was judged by are this repository's: the policy, the evidence specification, the security policy, the reviewer table and the
    // demonstration registry. Verify a package with the checkout at the commit it names; a package judged by other rules is refused, not trusted (F4d).
    const pp = m.candidate.parts, ours = { releasePolicy: sha(readFileSync(policyFile('release/policy', eng, core))), evidenceSpec: sha(readFileSync(join(eng, 'release', 'evidence-spec.json'))), securityFile: sha(readFileSync(policyFile('security', eng, core))) };
    const ruleDiff = [pp.releasePolicy !== ours.releasePolicy && 'release policy', pp.evidenceSpec !== ours.evidenceSpec && 'evidence specification', pp.securityPolicy.file !== ours.securityFile && 'security policy', sha(read('records/reviewers.json')) !== sha(readFileSync(join(eng, 'release', 'reviewers.json'))) && 'reviewer table', sha(read('records/demonstrations.json')) !== sha(readFileSync(join(eng, 'release', 'demonstrations.json'))) && 'demonstration registry'].filter(Boolean);
    add('rules-match-repository', !ruleDiff.length, ruleDiff.length ? `the package was judged by a different ${ruleDiff.join(', ')} than this checkout holds: verify it with the repository at the commit it names (${m.source.commit.slice(0, 7)})` : 'policy, evidence specification, security policy, reviewer table and demonstration registry are this checkout\'s');
    const vr = readJ('records/verification.json');
    const vProblems = vr ? validateVerification(vr, { candidate: m.candidate.digest, engineDigest: engineDigest(core, projectRoot), ids: expectedCheckIds(core, projectRoot) }) : ['records/verification.json is missing or not valid JSON'];
    if (vr && !vProblems.length && (vr.seal !== m.qa.report?.seal || vr.engineDigest !== m.qa.report?.engineDigest || vr.registryDigest !== m.qa.report?.registryDigest || (m.qa.report?.checks || []).length !== vr.checks.length)) vProblems.push('it is not the verification record the manifest summarises');
    add('verification-record', !vProblems.length, vProblems.length ? `the verification record in the package is not a complete, sealed, passing record for this candidate made by this checkout's verification code: ${vProblems[0]}` : `a sealed full verification of ${vr.checks.length} checks, complete against the verifier's own check list, for this candidate (${vr.environment?.runner})`);
    const table = readJ('records/reviewers.json'), reg = readJ('records/demonstrations.json');
    // the host the build is for is read from the delivered pages (canonical links and the sitemap), never from the manifest alone (F4c)
    const hostsInZip = () => {
      const set = new Set();
      for (const pg of pages) for (const mm of readFileSync(join(site, pg), 'utf8').matchAll(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/g)) { try { set.add(new URL(mm[1]).hostname.toLowerCase()); } catch { set.add('?'); } }
      if (entries.includes('sitemap.xml')) for (const mm of readFileSync(join(site, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)) { try { set.add(new URL(mm[1]).hostname.toLowerCase()); } catch { set.add('?'); } }
      return [...set];
    };
    if (m.channel === 'client-production') {
      const zipHosts = hostsInZip();
      const baseHost = zipHosts.length === 1 && zipHosts[0] !== '?' ? zipHosts[0] : null;
      const claimed = (() => { try { return new URL(m.configuration.baseUrl).hostname.toLowerCase(); } catch { return null; } })();
      add('production-host', baseHost && baseHost === claimed, !baseHost ? `the delivered pages and sitemap name ${zipHosts.length ? `several hosts (${zipHosts.join(', ')})` : 'no canonical host'}; a client package names exactly one` : baseHost !== claimed ? `the pages are for ${baseHost}, the manifest says ${claimed}` : `${baseHost}: the host the pages, the sitemap and the manifest all name`);
      const ext = deliveredDestinations(site, { baseUrl: m.configuration.baseUrl }), mediaDigest = deliveredMediaDigest(site);
      const rctx = { candidate: m.candidate.digest, channel: m.channel, version: m.version, table: table || { reviewers: [] }, today: new Date().toISOString().slice(0, 10), now: new Date().toISOString(), baseHost, searchDigest: m.search.artifactsDigest, mediaDigest, destinationsDigest: ext.digest };
      const ap = family('approvals'), rel = resolve(ap, 'release-approval', rctx), rights = resolve(ap, 'rights-verification', rctx), rev = resolve(ap, 'search-review', rctx), extl = resolve(ap, 'external-links-review', rctx), dep = resolve(family('deployments'), 'deployment-authorisation', rctx);
      const host = hostAuthorisation(rel, baseHost);
      const errs = [...new Set([...rel.errors, ...rights.errors, ...rev.errors, ...extl.errors, ...dep.errors, ...validateReviewers(table)])];
      add('approvals-recorded', rel.met && host.ok && rights.met && rev.met && !errs.length, !rel.met ? `no in-force release approval for this candidate in the package (${rel.detail})` : !host.ok ? host.detail : !rights.met ? `no in-force rights verification (${rights.detail})` : !rev.met ? `no in-force search review (${rev.detail})` : errs.length ? `record errors: ${errs.slice(0, 2).join('; ')}` : `release approval ${rel.approved.map((x) => x.id).join(', ')} (${host.detail}), rights verification ${rights.approved.map((x) => x.id).join(', ')}, search review ${rev.approved.map((x) => x.id).join(', ')}, all in force for ${m.candidate.digest.slice(0, 12)}…`);
      const ev = assessEvidence(family('evidence'), defaultVctx({ releaseCommit: m.source.commit, assetsTree: m.assets.treeSha256, candidate: m.candidate.digest, verification: { engineDigest: engineDigest(core, projectRoot), registryDigest: registryDigest(expectedCheckIds(core, projectRoot)), total: expectedCheckIds(core, projectRoot).length }, git: { isCommit: (c) => /^[0-9a-f]{40}$/.test(c), isAncestor: () => true, commitDate: () => '1970-01-01' }, fs: { exists: (p) => existsSync(join(dir, 'records', 'evidence', 'files', p.replace(/^.*\/files\//, ''))), read: (p) => readFileSync(join(dir, 'records', 'evidence', 'files', p.replace(/^.*\/files\//, ''))) } }));
      const spec = loadEvidenceSpec(), covered = ['real-device', 'screen-reader', 'browser-matrix', 'ci-run'].map((t) => [t, coverage(spec, t, ev)]);
      add('evidence-recorded', covered.every(([, c]) => c.ok), covered.every(([, c]) => c.ok) ? `${ev.length} evidence record(s) bound to this candidate cover real devices, screen readers, browsers and CI` : `evidence not satisfied for ${covered.filter(([, c]) => !c.ok).map(([t, c]) => `${t} (${c.detail.slice(0, 90)})`).join('; ')}`);
      // ---- G6-3 requirements, re-judged from the package itself (the histories and registers travel in records/)
      // freshness is judged at the instant the package was released, not when it is checked: a good package must not expire in the hands of the person who received it (G6-3 review, F7)
      const released = Number.isNaN(Date.parse(m.source.commitDate)) ? new Date() : new Date(m.source.commitDate), today = released.toISOString().slice(0, 10), polic = policyIn('release/policy', eng, { core });
      const eg = externalLinksGate({ ext, history: readJ('records/external-links-verification.json'), today, maxAgeDays: polic.externalLinks?.maxAgeDays ?? 30, review: extl });
      const egOk = eg.ok && (ext.destinations.length === 0 || (extl.met && Boolean(eg.record) && extl.approved.some((x) => x.r.subject.verification === eg.record.id)));
      add('external-links', egOk, eg.ok ? (egOk ? eg.detail : 'no in-force external-links review relies on the verification record') : eg.detail);
      const rightsIds = rights.rejected.length ? [] : rights.approved.map((x) => x.id);
      const inventory = readJ('records/media-rights-inventory.json');
      const rc = inventory ? rightsClearance({ inventory, siteDir: site, rightsIds, findingIds: m.findings.map((f) => f.id), blockingFindings: polic.rights?.blockingFindings || [] }) : { ok: false, detail: 'the rights inventory in the package cannot be read' };
      add('rights-inventory', rc.ok, rc.detail);
      const sc = inventory ? socialImageStatus({ siteDir: site, inventory, rightsIds, baseUrl: m.configuration.baseUrl }) : { ok: false, detail: 'no inventory' };
      add('social-images', sc.ok, sc.detail);
      const toolingN = Number((sbomObj?.metadata?.properties || []).find((x) => x.name === 'sts:tooling-packages')?.value);
      const sup = supplyStatus({ history: readJ('records/supply-chain-verification.json'), lockfileSha256: m.candidate.parts.engines.lockfileSha256, sbomSha256: sha(sbomText), lockPackages: toolingN, deps: readJ('records/dependencies.json') || { acceptedAdvisories: { packages: [] } }, today, maxAgeDays: polic.supplyChain?.maxAgeDays ?? 30 });
      add('supply-chain', sup.dependencySecurity.ok && sup.sbom.ok, sup.dependencySecurity.ok ? sup.sbom.detail : sup.dependencySecurity.detail);
      const au = authenticity({ packageDir: dir, manifest: m });
      add('authenticity', au.ok, au.detail);
    } else {
      // a demonstration is the fictional showcase and nothing else: every page says noindex, none points a search engine at a real host, and no host is a production one
      const bad = pages.filter((pg) => { const t = readFileSync(join(site, pg), 'utf8'); return !/<meta[^>]+name="robots"[^>]+content="[^"]*noindex/.test(t); });
      const hosts = hostsInZip().filter((h) => h === '?' || !isReservedHost(h));
      add('demonstration-pages', pages.length > 0 && !bad.length && !hosts.length, bad.length ? `pages without a noindex robots tag: ${bad.slice(0, 3).join(', ')}` : hosts.length ? `the pages name a production-looking host (${hosts.join(', ')})` : `${pages.length} pages, every one noindex, none naming a production host`);
    }
    // ---- channel separation (G6-2, RG-13): the marker is in the manifest and the package text, never in a page
    const regOk = reg && !validateDemonstrations(reg, { ledgerIds: null }).length ? (reg.registered || []).find((d) => d.configurationDigest === m.candidate.parts.configuration) : null;
    if (m.channel === 'demonstration') add('demonstration-marker', Boolean(m.demonstration && m.demonstration.fictional === true && m.demonstration.statement === DEMONSTRATION_STATEMENT && regOk && m.demonstration.registeredAs === regOk.id && (m.search.baseUrlReserved === true || !m.configuration.baseUrl)), m.demonstration ? (regOk ? (m.search.baseUrlReserved === true || !m.configuration.baseUrl ? `${regOk.id}: the registered fictional demonstration, with the marker and no production domain` : 'a demonstration that declares a production-looking domain') : 'this configuration is not a registered demonstration (client-style content cannot be packaged as one)') : 'a demonstration package must carry the demonstration marker in its manifest');
    else add('demonstration-marker', m.demonstration === null, m.demonstration === null ? 'a client package carries no demonstration marker' : 'a client package that carries the demonstration marker');
    const start = entries.includes('START-HERE.txt') ? readFileSync(join(site, 'START-HERE.txt'), 'utf8') : '';
    const fict = start.includes(DEMONSTRATION_STATEMENT);
    add('channel-text', m.channel === 'demonstration' ? fict : !fict && start.includes(m.source.commit), m.channel === 'demonstration' ? (fict ? 'START-HERE.txt carries the demonstration statement' : 'a demonstration package must carry the demonstration statement in START-HERE.txt') : fict ? 'a client package that calls itself a fictional demonstration' : start.includes(m.source.commit) ? 'START-HERE.txt names the source commit' : 'START-HERE.txt does not name the manifest\'s source commit');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  return { ok: checks.every((c) => c.ok), checks };
}
