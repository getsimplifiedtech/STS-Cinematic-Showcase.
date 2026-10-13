// The release manifest and the release gate. The gate is a pure function of a context object, so every rule can be tested with invented states.
// A build is classified by its configuration (channelOf), never by a label: a client configuration cannot be released as a "demonstration".
//
// Release model v2 (G6-2, APR-JE-039; G6-2-DESIGN.md): everything the gate relies on is bound to the CANDIDATE ARTIFACT DIGEST (lib/candidate.mjs), not to the
// HEAD commit, so recording an approval or a CI result cannot invalidate itself. Approvals are structured records with closed statuses (lib/records.mjs); the
// gate never searches prose. The verification record (lib/verification.mjs) must be complete and sealed. Approvals, evidence and deployment authorisation are
// three separate record families and none can satisfy another's requirement.
import { assessEvidence, coverage, defaultVctx, loadEvidenceEntries, loadSpec as loadEvidenceSpec } from './evidence.mjs';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { baselineRecord, engDir, projectDir, readJson, repoRoot, sha256 } from './git.mjs';
import { project, schemaId } from './project.mjs';
import { loadApprovals } from './approvals.mjs';
import { isReservedHost } from './hosts.mjs';
import { buildManifest } from './hashed.mjs';
import { crawlerReviewGaps } from './search.mjs';
import { buildCsp, loadPolicy as loadSecurityPolicy, inlineItems, robotsHeaders, securityHeaders } from './security.mjs';
import { computeCandidate, configurationDigest, channelOf as channelOfConfig } from './candidate.mjs';
import { searchDigest, searchFilesPresent } from './search-digest.mjs';
import { hostAuthorisation, loadDemonstrations, loadFamily, loadReviewers, resolve, validateDemonstrations, validateReviewers } from './records.mjs';
import { engineDigest, expectedCheckIds, registryDigest, validateVerification } from './verification.mjs';
import { deliveredDestinations, externalLinksGate } from './external-gate.mjs';
import { deliveredMediaDigest, rightsClearance } from './media-rights.mjs';
import { SUPPLY_FILE, buildCompositeSbom, sbomProblems, sbomDigest, serialiseSbom, supplyStatus } from './supply.mjs';
import { socialImageStatus } from './social.mjs';
import { verifyAuthenticity } from './authenticity.mjs';
import { checkCi } from '../checks/ci.mjs';
import { checkDepsStatic } from '../checks/deps.mjs';

export const loadReleasePolicy = () => policy('release/policy');
export { searchDigest, searchFilesPresent };
const sha = (s) => createHash('sha256').update(s).digest('hex');
const git = (args, cwd = repoRoot) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

export const channelOf = channelOfConfig;
import { DEMONSTRATION_STATEMENT } from './candidate.mjs';
import { record, hasRecord } from './project-records.mjs';
import { policy } from './policy.mjs';
export { DEMONSTRATION_STATEMENT };

export function gitState(cwd = repoRoot) {
  const commit = git(['rev-parse', 'HEAD'], cwd);
  return { commit, tree: git(['rev-parse', 'HEAD^{tree}'], cwd), branch: git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd), dirty: git(['status', '--porcelain'], cwd) !== '', commitDate: git(['show', '-s', '--format=%cI', 'HEAD'], cwd) };
}

// Evidence records: files in engineering/release/evidence/*.json, read here and judged by lib/evidence.mjs against the build being released.
// ctx.evidence is the raw list [{ file, record }]; assessedEvidence(ctx) says which of them count.
export const loadEvidence = (dir) => loadEvidenceEntries(dir, { tracked: true });
export function assessedEvidence(ctx) {
  return assessEvidence(ctx.evidence || [], defaultVctx({ releaseCommit: ctx.git.commit, assetsTree: ctx.assetsTree, candidate: ctx.candidate?.digest || '', verification: ctx.engine ? { engineDigest: ctx.engine.engineDigest, registryDigest: ctx.engine.registryDigest, total: ctx.engine.ids.length } : null, ...(ctx.evidenceVctx || {}) }));
}

// The retired Markdown rows: release-approval, rights-verification, search-review and deployment-approval rows in the approvals ledger are no longer read.
export const RETIRED_ROW = /release-approval|rights-verification|search-review|deployment-approval/i;

// Everything the gate and the manifest need, gathered from the working tree unless overridden (tests override).
export function collectContext(o = {}) {
  const root = o.root || projectDir;
  const configDir = o.configDir || join(root, 'config');
  const client = readJson(join(configDir, 'client.json'));
  const version = o.version || readJson(join(root, 'VERSION.json'));
  const pkg = o.pkg || readJson(join(root, 'package.json'));
  const authority = o.authority || record(project.creativeAuthority.record);
  const baseline = o.baseline || (project.baseline ? baselineRecord() : null);
  const findings = o.findings || record('findings.json').findings;
  const approvals = o.approvals || loadApprovals();
  const channel = channelOf(client);
  const files = {};
  for (const f of readdirSync(configDir).filter((x) => x.endsWith('.json')).sort()) files[`config/${f}`] = sha256(readFileSync(join(configDir, f)));
  const ids = o.expectedIds || expectedCheckIds();
  return {
    root, channel, client, version, pkg, authority, baseline, findings, approvals, files,
    git: o.git || gitState(), verify: o.verify === undefined ? loadVerifyReport() : o.verify,
    engine: o.engine || { engineDigest: engineDigest(), ids, registryDigest: registryDigest(ids) },
    approvalRecords: o.approvalRecords || loadFamily('approvals', engDir, { tracked: true }), deploymentRecords: o.deploymentRecords || loadFamily('deployments', engDir, { tracked: true }),
    reviewers: o.reviewers || loadReviewers(), demonstrations: o.demonstrations || loadDemonstrations(),
    today: o.today || new Date().toISOString().slice(0, 10), now: o.now || (o.today ? null : new Date().toISOString()),
    assets: o.assets, buildOk: o.buildOk ?? true, siteDir: o.siteDir || null,
    evidence: o.evidence || loadEvidence(), assetsManifestMatches: o.assetsManifestMatches ?? true,
    crawlerRecord: o.crawlerRecord === undefined ? record('search-crawler-verification.json') : o.crawlerRecord,
    // G6-3: the facts the supply-chain, external-link, rights and runtime requirements judge (all overridable by tests)
    externalHistory: o.externalHistory === undefined ? (hasRecord('external-links-verification.json') ? record('external-links-verification.json') : null) : o.externalHistory,
    supplyHistory: o.supplyHistory === undefined ? (existsSync(join(engDir, SUPPLY_FILE)) ? readJson(join(engDir, SUPPLY_FILE)) : { records: [] }) : o.supplyHistory,
    deps: o.deps || policy('dependencies'),
    inventory: o.inventory || record('media-rights-inventory.json'),
    lock: o.lock || (() => { const t = readFileSync(join(root, 'package-lock.json')); return { sha256: sha256(t), packages: Object.keys(JSON.parse(t.toString('utf8')).packages || {}).filter(Boolean).length }; })(),
    dependencyPolicyProblems: o.dependencyPolicyProblems || checkDepsStatic({ root }).problems,
    runtimeProblems: o.runtimeProblems || checkCi({ docs: false }).problems,   // the gate judges the workflows folder exactly as check:ci does (the same function, G6-7)
    policyExtras: o.policyExtras || null,
  };
}

// The context plus everything that depends on the assembled site: the delivered tree, the search artifacts, the recorded asset manifest and the candidate.
export function attachBuild(ctx, siteDir) {
  const am = buildManifest(siteDir);
  const recorded = hasRecord('assets.manifest.json') ? record('assets.manifest.json') : null;
  return {
    ...ctx, siteDir, assetsTree: am.treeSha256, searchDigest: searchDigest(siteDir), siteHasSearchFiles: ctx.channel === 'demonstration' ? undefined : searchFilesPresent(siteDir),
    assetsManifestMatches: recorded ? recorded.treeSha256 === am.treeSha256 : false,
    candidate: computeCandidate({ siteDir, root: ctx.root, channel: ctx.channel, version: ctx.version.version }),
    // G6-3: what the build delivers, derived from the built files (never from a registry anyone can edit)
    ext: deliveredDestinations(siteDir, { baseUrl: ctx.client.seo.baseUrl }), mediaDigest: deliveredMediaDigest(siteDir),
    ...(() => {
      const sbom = buildCompositeSbom({ siteDir, root: ctx.root, inventory: ctx.inventory, version: ctx.version.version, channel: ctx.channel });
      const text = serialiseSbom(sbom);
      return { sbomText: text, sbomSha256: sbomDigest(text), sbomProblems: sbomProblems(sbom, { lockfileSha256: ctx.lock.sha256 }) };
    })(),
    rightsCheck: (rightsIds) => rightsClearance({ inventory: ctx.inventory, siteDir, rightsIds, findingIds: ctx.findings.map((f) => f.id), blockingFindings: loadReleasePolicy().rights?.blockingFindings || [] }),
    socialCheck: (rightsIds) => socialImageStatus({ siteDir, inventory: ctx.inventory, rightsIds, baseUrl: ctx.client.seo.baseUrl }),
  };
}

export function loadVerifyReport() {
  const p = join(engDir, '.reports', 'verify.json');
  return existsSync(p) ? readJson(p) : null;
}

// The gate. Returns { channel, allowed, requirements: [{ id, ok, detail }], deploymentApproved, records }.
export function evaluateGate(ctx, policy = loadReleasePolicy()) {
  const channel = ctx.channel;
  const need = policy.channels[channel].requires;
  const out = [];
  const add = (id, ok, detail) => out.push({ id, ok: Boolean(ok), detail });
  const required = ctx.authority.records.requiredApprovals;
  const have = new Set(ctx.approvals.map((a) => a.id));
  const missing = required.filter((r) => !have.has(r));
  const ver = ctx.version.version;
  const cand = ctx.candidate?.digest || '';
  const blocking = ctx.findings.filter((f) => policy.blockingSeverities.includes(f.severity));
  const badSeverity = ctx.findings.filter((f) => !policy.severities.includes(f.severity));
  const evSpec = loadEvidenceSpec(), assessed = assessedEvidence(ctx);
  const demoText = ctx.buildOk;
  const seoOk = channel !== 'client-production' || (ctx.client.seo.noindex === false && ctx.client.seo.structuredData === true && Boolean(ctx.client.seo.business) && ctx.buildOk && ctx.siteHasSearchFiles !== false);
  const sd = ctx.client.seo;
  let baseHost = null; try { baseHost = new URL(sd.baseUrl).hostname; } catch { /* reported below */ }
  const today = ctx.today || new Date().toISOString().slice(0, 10);
  const rctx = { candidate: cand, channel, version: ver, table: ctx.reviewers, today, now: ctx.now || null, baseHost, searchDigest: ctx.searchDigest, mediaDigest: ctx.mediaDigest ?? null, destinationsDigest: ctx.ext?.digest ?? null };
  const arec = ctx.approvalRecords || [];
  const rel = resolve(arec, 'release-approval', rctx), rights = resolve(arec, 'rights-verification', rctx), review = resolve(arec, 'search-review', rctx), extl = resolve(arec, 'external-links-review', rctx);
  const hostOk = hostAuthorisation(rel, baseHost);
  const depRes = resolve(ctx.deploymentRecords || [], 'deployment-authorisation', rctx);
  const reviewerProblems = validateReviewers(ctx.reviewers, { ledgerIds: have });
  const recordErrors = [...new Set([...rel.errors, ...rights.errors, ...review.errors, ...extl.errors, ...depRes.errors])];
  const demoProblems = validateDemonstrations(ctx.demonstrations, { ledgerIds: have });
  const registered = (ctx.demonstrations?.registered || []).find((d) => d.configurationDigest === ctx.candidate?.parts?.configuration);
  const crawlersExplicit = sd.crawlers && ['search', 'aiSearch', 'training'].every((k) => sd.crawlers[k] === 'allow' || sd.crawlers[k] === 'disallow');
  const searchGaps = [!sd.host && 'seo.host is not declared (cloudflare-pages, vercel or static)', !crawlersExplicit && 'seo.crawlers does not state a decision for search, aiSearch and training', ctx.siteHasSearchFiles === false && 'sitemap.xml, robots.txt or llms.txt is missing from the built site', !ctx.searchDigest && 'there are no search artifacts to review', ctx.searchDigest && !review.met && `no in-force search review for the current search artifacts (${review.detail})`, ...crawlerReviewGaps({ record: ctx.crawlerRecord, today: ctx.today })].filter(Boolean);
  const vProblems = !cand ? ['the candidate artifact digest is unknown'] : validateVerification(ctx.verify, { candidate: cand, engineDigest: ctx.engine.engineDigest, ids: ctx.engine.ids });
  const hostLc = String(baseHost).toLowerCase();
  const deployOk = depRes.met && rel.met && depRes.approved.some((m) => rel.approved.some((a) => a.id === m.r.subject.releaseApproval) && String(m.r.subject.targetHost).toLowerCase() === hostLc);
  // G6-3 requirements (client production)
  const rightsIds = rights.rejected.length ? [] : rights.approved.map((m) => m.id);   // a rejection in force un-verifies everything: negation-proof
  const extStatus = ctx.ext ? externalLinksGate({ ext: ctx.ext, history: ctx.externalHistory, today, maxAgeDays: policy.externalLinks?.maxAgeDays ?? 30, review: extl }) : { ok: false, detail: 'the destination list of this build is unknown', record: null };
  const extReviewOk = Boolean(ctx.ext) && (ctx.ext.destinations.length === 0 || (extl.met && Boolean(extStatus.record) && extl.approved.some((m) => m.r.subject.verification === extStatus.record.id)));
  const rightsStatus = ctx.rightsCheck ? ctx.rightsCheck(rightsIds) : { ok: false, detail: 'the rights of the delivered media were not assessed' };
  const socialStatus = ctx.socialCheck ? ctx.socialCheck(rightsIds) : { ok: false, detail: 'the social-preview images were not assessed' };
  const supply = ctx.sbomSha256 && ctx.lock ? supplyStatus({ history: ctx.supplyHistory, lockfileSha256: ctx.lock.sha256, sbomSha256: ctx.sbomSha256, lockPackages: ctx.lock.packages, deps: ctx.deps, today, maxAgeDays: policy.supplyChain?.maxAgeDays ?? 30 }) : { dependencySecurity: { ok: false, detail: 'the lockfile or the SBOM is unknown' }, sbom: { ok: false, detail: 'the SBOM could not be built' } };
  const sbomOk = supply.sbom.ok && !(ctx.sbomProblems || ['unknown']).length;
  const authenticity = (ctx.authenticityVerifier || verifyAuthenticity)(ctx);   // (only tests set authenticityVerifier; the release tool never does)
  const checks = {
    cleanTree: [!ctx.git.dirty, ctx.git.dirty ? 'the working tree has uncommitted changes' : 'clean'],
    verifyPassed: [!vProblems.length, vProblems.length ? vProblems.join('; ') : `a full, sealed verification of ${ctx.engine.ids.length} checks for candidate ${cand.slice(0, 12)}…, made by the current verification code (${String(ctx.verify.environment?.runner)})`],
    noBlockingFindings: [!blocking.length && !badSeverity.length, blocking.length ? `open ${blocking.map((f) => `${f.id} (${f.severity})`).join(', ')}` : badSeverity.length ? `findings with an unknown severity: ${badSeverity.map((f) => f.id).join(', ')}` : `${ctx.findings.length} open finding(s), none Blocker or Major`],
    requiredApprovalsPresent: [!missing.length, missing.length ? `missing approval records ${missing.join(', ')}` : `${required.length} required records present`],
    versionConsistent: [ctx.version.version === ctx.pkg.version && ctx.version.channel === channel && /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(ver), `VERSION.json ${ctx.version.version} (${ctx.version.channel}), package.json ${ctx.pkg.version}, configuration channel ${channel}`],
    demoStaysNoindex: [!(ctx.client.flags.demo === true && ctx.client.seo.noindex === false), 'the fictional demonstration must stay noindex'],
    demonstrationRegistered: [Boolean(registered) && !demoProblems.length, demoProblems.length ? demoProblems.join('; ') : registered ? `${registered.id}: this configuration is the registered fictional demonstration` : 'this configuration is not a registered demonstration: client-style content cannot be released as a demonstration (release/demonstrations.json)'],
    demonstrationNoProductionDomain: [!baseHost || isReservedHost(baseHost), baseHost ? (isReservedHost(baseHost) ? `${baseHost} is reserved, as a demonstration should have` : `a demonstration declares the production-looking host ${baseHost}`) : 'no production host is declared'],
    assetManifestCurrent: [ctx.assetsManifestMatches !== false, ctx.assetsManifestMatches === false ? 'engineering/assets.manifest.json does not match the built site (run npm run assets:manifest after a reviewed change)' : 'the recorded asset manifest matches the built site'],
    stableVersion: [!/-/.test(ver), /-/.test(ver) ? `${ver} is a pre-release; a client production release needs a plain x.y.z version` : `${ver} is a stable version`],
    recordsValid: [!recordErrors.length && !reviewerProblems.length, [...reviewerProblems, ...recordErrors].slice(0, 4).join('; ') || 'every approval and deployment record is readable and well formed; the reviewer table is valid'],
    releaseApproval: [rel.met && Boolean(cand), cand ? rel.detail : 'the candidate artifact digest is unknown'],
    productionHostAuthorised: [rel.met && hostOk.ok, rel.met ? hostOk.detail : `no in-force release approval, so no host is authorised (${hostOk.detail})`],
    rightsVerification: [rights.met && Boolean(cand), cand ? (rights.met ? rights.detail : `${rights.detail}; the generated media rights are unverified (${project.governance.documents.mediaRightsPolicy})`) : 'the candidate artifact digest is unknown'],
    noDemoText: [demoText && ctx.client.flags.demo === false, ctx.client.flags.demo ? 'flags.demo is on' : demoText ? 'the client configuration builds with no demonstration text' : 'the client configuration does not validate'],
    productionDomain: [baseHost && !isReservedHost(baseHost), baseHost ? (isReservedHost(baseHost) ? `${baseHost} is a reserved, example, local or preview/staging address, not the approved production domain` : `${baseHost}`) : 'seo.baseUrl is not set'],
    searchReadiness: [!searchGaps.length, searchGaps.length ? searchGaps.join('; ') : `${review.approved.map((m) => m.id).join(', ')}: facts, structured data and crawler policy reviewed for these search artifacts`],
    productionSeoComplete: [seoOk, seoOk ? 'canonical, sitemap, robots and structured data are configured' : 'indexable canonical URLs, sitemap, robots and structured data are not all configured'],
    externalLinks: [extStatus.ok, extStatus.detail],
    externalLinksReview: [extReviewOk, !ctx.ext ? 'the destination list is unknown' : ctx.ext.destinations.length === 0 ? 'no external destination: nothing to review' : extReviewOk ? `${extl.approved.map((m) => m.id).join(', ')} reviewed the destination list ${ctx.ext.digest.slice(0, 12)}… against ${extStatus.record?.id}` : extl.met && extStatus.record ? `no in-force external-links review relies on ${extStatus.record.id}` : `no in-force external-links review for this destination list (${extl.detail})`],
    mediaRightsInventory: [rightsStatus.ok, rightsStatus.detail],
    socialImageRights: [socialStatus.ok, socialStatus.detail],
    dependencySecurity: [supply.dependencySecurity.ok, supply.dependencySecurity.detail],
    sbomVerified: [sbomOk, !supply.sbom.ok ? supply.sbom.detail : (ctx.sbomProblems || ['unknown']).length ? `the SBOM is incomplete: ${(ctx.sbomProblems || ['unknown'])[0]}` : supply.sbom.detail],
    dependencyPolicy: [!(ctx.dependencyPolicyProblems || ['unknown']).length, (ctx.dependencyPolicyProblems || ['unknown']).length ? (ctx.dependencyPolicyProblems || ['unknown']).slice(0, 2).join('; ') : 'pins, lockfile integrity, licences and engines satisfy the dependency policy'],
    supportedRuntimes: [!(ctx.runtimeProblems || ['unknown']).length, (ctx.runtimeProblems || ['unknown']).length ? (ctx.runtimeProblems || ['unknown']).slice(0, 2).join('; ') : 'the workflow uses the supported Node and the pinned Node 24 Actions'],
    authenticity: [authenticity.ok, authenticity.detail],
    ...Object.fromEntries(['real-device', 'screen-reader', 'browser-matrix', 'ci-run'].map((t) => { const cv = coverage(evSpec, t, assessed); return [`evidence:${t}`, [cv.ok, cv.detail]]; })),
  };
  // authenticity is not a policy choice: a client-production release is judged by it whatever the policy file lists (G6-3 review, F1)
  const judged = channel === 'client-production' && !need.includes('authenticity') ? [...need, 'authenticity'] : need;
  for (const id of judged) { const [ok, detail] = checks[id] || [false, 'unknown requirement']; add(id, ok, detail); }
  // a client configuration labelled demonstration is always refused
  if (channel === 'client-production' && ctx.version.channel === 'demonstration') add('labelMatchesConfiguration', false, 'VERSION.json calls this a demonstration but the configuration is a client production build');
  return { channel, allowed: out.every((r) => r.ok), requirements: out, deploymentApproved: Boolean(deployOk), records: { release: rel, rights, review, externalLinks: extl, deployment: depRes }, supplyRecordId: supply.dependencySecurity.record?.id ?? null };
}

// (a file that is absent hashes as an empty file, so a manifest can still be printed; the requirement that needs the file fails with a reason)
const fileHash = (path) => sha256(existsSync(path) ? readFileSync(path) : Buffer.alloc(0));
const externalRecordId = (ctx) => externalLinksGate({ ext: ctx.ext, history: ctx.externalHistory, today: ctx.today, maxAgeDays: loadReleasePolicy().externalLinks?.maxAgeDays ?? 30, review: { approved: [] } }).record?.id ?? null;
export function buildReleaseManifest(ctx0, { siteDir, qaReport = ctx0.verify, packageInfo = null } = {}) {
  const ctx = attachBuild(ctx0, siteDir);
  const sdig = ctx.searchDigest;
  const gate = evaluateGate(ctx);
  const am = buildManifest(siteDir);
  const required = ctx.authority.records.requiredApprovals;
  const have = ctx.approvals;
  const lock = readFileSync(join(ctx.root, 'package-lock.json'));
  const deps = policy('dependencies');
  const secPolicy = loadSecurityPolicy();
  const items = inlineItems(siteDir);
  const csp = buildCsp(siteDir, secPolicy);
  const c = ctx.git.commit;
  const recorded = hasRecord('assets.manifest.json') ? record('assets.manifest.json') : null;
  const cfg = configurationDigest(ctx.root);
  const vp = qaReport ? validateVerification(qaReport, { candidate: ctx.candidate.digest, engineDigest: ctx.engine.engineDigest, ids: ctx.engine.ids }) : ['no report'];
  const inForce = (r) => r.approved.map((m) => m.id);
  const embedded = (family) => (family === 'evidence' ? loadEvidenceEntries() : loadFamily(family)).filter((e) => !e.parseError).map((e) => ({ file: e.file, sha256: sha256(readFileSync(join(engDir, 'release', family, e.file))) }));
  const registered = (ctx.demonstrations?.registered || []).find((d) => d.configurationDigest === ctx.candidate.parts.configuration);
  return {
    schema: schemaId('release-manifest@2'), project: ctx.version.name, version: ctx.version.version, channel: ctx.channel,
    candidate: { schema: ctx.candidate.schema, digest: ctx.candidate.digest, parts: ctx.candidate.parts },
    source: { commit: c, branch: ctx.git.branch, tree: ctx.git.tree, dirty: ctx.git.dirty, commitDate: ctx.git.commitDate },
    baseline: ctx.baseline ? { branch: ctx.baseline.branch, commit: ctx.baseline.commit, projectTree: ctx.baseline.projectTree } : null,
    framework: { repository: ctx.authority.framework.repository, branch: ctx.authority.framework.branch, commit: ctx.authority.framework.commit, release: ctx.authority.framework.release, skillSha256: ctx.authority.creativeAuthority.skillSha256, licenseSha256: ctx.authority.creativeAuthority.licenseSha256, modifiedByThisProject: ctx.authority.framework.modifiedByThisProject },
    configuration: { files: ctx.files, treeSha256: cfg.treeSha256, flags: { demo: ctx.client.flags.demo, heroVideo: ctx.client.flags.heroVideo, noindex: ctx.client.seo.noindex, structuredData: ctx.client.seo.structuredData }, orderingLive: typeof ctx.client.ordering?.url === 'string', baseUrl: ctx.client.seo.baseUrl },
    demonstration: ctx.channel === 'demonstration' ? { fictional: true, statement: DEMONSTRATION_STATEMENT, registeredAs: registered ? registered.id : null } : null,
    assets: { treeSha256: am.treeSha256, fileCount: am.fileCount, totalBytes: am.totalBytes, manifestMatches: recorded ? recorded.treeSha256 === am.treeSha256 : false },
    search: { artifactsDigest: sdig, files: ['sitemap.xml', 'robots.txt', 'llms.txt'].filter((f) => existsSync(join(siteDir, f))), host: ctx.client.seo.host ?? null, urlStyle: ctx.client.seo.urlStyle ?? 'extension', crawlers: ctx.client.seo.crawlers ?? null, baseUrlReserved: (() => { try { return isReservedHost(new URL(ctx.client.seo.baseUrl).hostname); } catch { return null; } })(), crawlerReview: ctx.crawlerRecord ? { verifiedOn: ctx.crawlerRecord.verifiedOn, confirmedByPerson: ctx.crawlerRecord.confirmedByPerson === true, maxAgeDays: ctx.crawlerRecord.maxAgeDays, agents: (ctx.crawlerRecord.agents || []).length } : null, noindexHeader: Object.keys(robotsHeaders(siteDir)).length > 0 },
    security: { cspSha256: sha(csp), headers: Object.keys(securityHeaders(siteDir, secPolicy)).sort(), inlineScriptHashes: items.scripts.length, inlineStyleHashes: items.styles.length },
    qa: { verified: Boolean(qaReport) && !vp.length && ctx.git.dirty === false, report: qaReport && qaReport.schema ? { schema: qaReport.schema, mode: qaReport.mode, passed: qaReport.passed, candidate: qaReport.candidate, engineDigest: qaReport.engineDigest, registryDigest: qaReport.registryDigest, seal: qaReport.seal, checks: qaReport.checks.map((r) => ({ id: r.id, status: r.passed ? 'pass' : 'fail' })) } : null },
    approvals: { required: [...required].sort(), present: have.filter((a) => required.includes(a.id)).map((a) => ({ id: a.id, date: a.date, type: a.type })), missing: required.filter((r) => !have.some((a) => a.id === r)), releaseApproval: inForce(gate.records.release)[0] || null, rightsVerification: inForce(gate.records.rights)[0] || null, searchReview: inForce(gate.records.review)[0] || null, deploymentAuthorisation: gate.deploymentApproved ? inForce(gate.records.deployment)[0] || null : null },
    records: { approvals: embedded('approvals'), evidence: embedded('evidence'), deployments: embedded('deployments'), reviewers: { sha256: sha256(readFileSync(join(engDir, 'release', 'reviewers.json'))) }, demonstrations: { sha256: sha256(readFileSync(join(engDir, 'release', 'demonstrations.json'))) }, externalLinksHistory: { sha256: fileHash(join(engDir, 'external-links-verification.json')) }, supplyChainHistory: { sha256: fileHash(join(engDir, SUPPLY_FILE)) } },
    evidence: assessedEvidence(ctx).map((e) => ({ file: e.file, type: e.type, commit: e.commit, valid: e.valid, success: e.success, class: e.class, target: e.target })),
    findings: ctx.findings.map((f) => ({ id: f.id, severity: f.severity, visual: f.visual, status: String(f.status).slice(0, 80) })),
    externalLinks: { destinationsDigest: ctx.ext.digest, destinations: ctx.ext.destinations.length, verificationRecord: externalRecordId(ctx), reviewRecords: gate.records.externalLinks.approved.map((m) => m.id) },
    mediaRights: { deliveredDigest: ctx.mediaDigest, verificationRecords: inForce(gate.records.rights) },
    supplyChain: { lockfileSha256: ctx.lock.sha256, verificationRecord: gate.supplyRecordId ?? null, sbom: { name: 'sbom.cdx.json', sha256: ctx.sbomSha256, bytes: Buffer.byteLength(ctx.sbomText) } },
    authenticity: { implemented: verifyAuthenticity(ctx).implemented, detail: verifyAuthenticity(ctx).detail },
    dependencies: { lockfileSha256: sha256(lock), runtimeDependencies: Object.keys(ctx.pkg.dependencies || {}).length, acceptedAdvisoryPackages: deps.acceptedAdvisories.packages.length },
    gate: { channel: gate.channel, allowed: gate.allowed, deploymentApproved: gate.deploymentApproved, requirements: gate.requirements },
    package: packageInfo,
  };
}
