// The release manifest and the release gate. The gate is a pure function of a context object, so every rule can be tested with invented states.
// A build is classified by its configuration (channelOf), never by a label: a client configuration cannot be released as a "demonstration".
import { assessEvidence, coverage, defaultVctx, loadEvidenceEntries, loadSpec as loadEvidenceSpec } from './evidence.mjs';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { engDir, projectDir, readJson, repoRoot, sha256 } from './git.mjs';
import { findApproval, findRightsVerification, findSearchReview, loadApprovals } from './approvals.mjs';
import { isReservedHost } from '../../src/lib/seo.mjs';
import { buildManifest } from './hashed.mjs';
import { crawlerReviewGaps } from './search.mjs';
import { buildCsp, loadPolicy as loadSecurityPolicy, inlineItems, robotsHeaders, securityHeaders } from './security.mjs';

export const loadReleasePolicy = () => readJson(join(engDir, 'release', 'policy.json'));
const sha = (s) => createHash('sha256').update(s).digest('hex');
const git = (args, cwd = repoRoot) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

// A fingerprint of exactly what search engines and AI readers will be given: sitemap.xml, robots.txt, llms.txt and the Home page JSON-LD.
// The human search review is bound to it, so changing any fact, URL or crawler rule invalidates the review.
export function searchDigest(siteDir) {
  const part = (name, text) => `${name}\n${text.length}\n${text}\n`;
  const read = (f) => { try { return readFileSync(join(siteDir, f), 'utf8'); } catch { return null; } };
  const sitemap = read('sitemap.xml');
  if (sitemap === null) return null;
  const ld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(read('index.html') || '');
  return sha(part('sitemap.xml', sitemap) + part('robots.txt', read('robots.txt') || '') + part('llms.txt', read('llms.txt') || '') + part('json-ld', ld ? ld[1] : ''));
}
export const searchFilesPresent = (siteDir) => ['sitemap.xml', 'robots.txt', 'llms.txt'].every((f) => existsSync(join(siteDir, f)));

export const channelOf = (client) => (client.flags.demo === true && client.seo.noindex === true ? 'demonstration' : 'client-production');

export function gitState(cwd = repoRoot) {
  const commit = git(['rev-parse', 'HEAD'], cwd);
  return { commit, tree: git(['rev-parse', 'HEAD^{tree}'], cwd), branch: git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd), dirty: git(['status', '--porcelain'], cwd) !== '', commitDate: git(['show', '-s', '--format=%cI', 'HEAD'], cwd) };
}

// Evidence records: files in engineering/release/evidence/*.json, read here and judged by lib/evidence.mjs against the build being released.
// ctx.evidence is the raw list [{ file, record }]; assessedEvidence(ctx) says which of them count.
export const loadEvidence = (dir) => loadEvidenceEntries(dir);
export function assessedEvidence(ctx) {
  return assessEvidence(ctx.evidence || [], defaultVctx({ releaseCommit: ctx.git.commit, assetsTree: ctx.assetsTree, ...(ctx.evidenceVctx || {}) }));
}

// Everything the gate and the manifest need, gathered from the working tree unless overridden (tests override).
export function collectContext(o = {}) {
  const root = o.root || projectDir;
  const configDir = o.configDir || join(root, 'config');
  const client = readJson(join(configDir, 'client.json'));
  const version = o.version || readJson(join(root, 'VERSION.json'));
  const pkg = o.pkg || readJson(join(root, 'package.json'));
  const authority = o.authority || readJson(join(engDir, 'authority.json'));
  const baseline = o.baseline || readJson(join(engDir, 'baseline.json'));
  const findings = o.findings || readJson(join(engDir, 'findings.json')).findings;
  const approvals = o.approvals || loadApprovals();
  const channel = channelOf(client);
  const files = {};
  for (const f of readdirSync(configDir).filter((x) => x.endsWith('.json')).sort()) files[`config/${f}`] = sha256(readFileSync(join(configDir, f)));
  return {
    root, channel, client, version, pkg, authority, baseline, findings, approvals, files,
    git: o.git || gitState(), verify: o.verify === undefined ? loadVerifyReport() : o.verify,
    assets: o.assets, buildOk: o.buildOk ?? true, siteDir: o.siteDir || null,
    evidence: o.evidence || loadEvidence(), assetsManifestMatches: o.assetsManifestMatches ?? true,
    crawlerRecord: o.crawlerRecord === undefined ? readJson(join(engDir, 'search-crawler-verification.json')) : o.crawlerRecord,
  };
}

export function loadVerifyReport() {
  const p = join(engDir, '.reports', 'verify.json');
  return existsSync(p) ? readJson(p) : null;
}

// The gate. Returns { channel, allowed, requirements: [{ id, ok, detail }], deploymentApproved }.
export function evaluateGate(ctx, policy = loadReleasePolicy()) {
  const channel = ctx.channel;
  const need = policy.channels[channel].requires;
  const out = [];
  const add = (id, ok, detail) => out.push({ id, ok: Boolean(ok), detail });
  const required = ctx.authority.records.requiredApprovals;
  const have = new Set(ctx.approvals.map((a) => a.id));
  const missing = required.filter((r) => !have.has(r));
  const ver = ctx.version.version, c = ctx.git.commit;
  const blocking = ctx.findings.filter((f) => policy.blockingSeverities.includes(f.severity));
  const badSeverity = ctx.findings.filter((f) => !policy.severities.includes(f.severity));
  const evSpec = loadEvidenceSpec(), assessed = assessedEvidence(ctx);
  const rel = findApproval(ctx.approvals, 'release-approval', { channel, version: ver, commit: c });
  const rights = findRightsVerification(ctx.approvals);
  const demoText = ctx.buildOk;
  const seoOk = channel !== 'client-production' || (ctx.client.seo.noindex === false && ctx.client.seo.structuredData === true && Boolean(ctx.client.seo.business) && ctx.buildOk && ctx.siteHasSearchFiles !== false);
  const sd = ctx.client.seo;
  let baseHost = null; try { baseHost = new URL(sd.baseUrl).hostname; } catch { /* reported below */ }
  const review = findSearchReview(ctx.approvals, ctx.searchDigest);
  const crawlersExplicit = sd.crawlers && ['search', 'aiSearch', 'training'].every((k) => sd.crawlers[k] === 'allow' || sd.crawlers[k] === 'disallow');
  const searchGaps = [!sd.host && 'seo.host is not declared (cloudflare-pages, vercel or static)', !crawlersExplicit && 'seo.crawlers does not state a decision for search, aiSearch and training', ctx.siteHasSearchFiles === false && 'sitemap.xml, robots.txt or llms.txt is missing from the built site', !ctx.searchDigest && 'there are no search artifacts to review', ctx.searchDigest && !review && 'no search-review record for the current search artifacts (npm run release:search-digest prints the digest to review)', ...crawlerReviewGaps({ record: ctx.crawlerRecord, today: ctx.today })].filter(Boolean);
  const checks = {
    cleanTree: [!ctx.git.dirty, ctx.git.dirty ? 'the working tree has uncommitted changes' : 'clean'],
    verifyPassed: [ctx.verify && ctx.verify.passed === true && ctx.verify.mode === 'full' && ctx.verify.commit === c && ctx.verify.dirty === false && (!ctx.assetsTree || ctx.verify.assetsTree === ctx.assetsTree), !ctx.verify ? 'no verification report: run npm run verify' : `report: mode ${ctx.verify.mode}, passed ${ctx.verify.passed}, commit ${String(ctx.verify.commit).slice(0, 7)} against ${c.slice(0, 7)}${ctx.verify.dirty ? ', run on a dirty tree' : ''}`],
    noBlockingFindings: [!blocking.length && !badSeverity.length, blocking.length ? `open ${blocking.map((f) => `${f.id} (${f.severity})`).join(', ')}` : badSeverity.length ? `findings with an unknown severity: ${badSeverity.map((f) => f.id).join(', ')}` : `${ctx.findings.length} open finding(s), none Blocker or Major`],
    requiredApprovalsPresent: [!missing.length, missing.length ? `missing approval records ${missing.join(', ')}` : `${required.length} required records present`],
    versionConsistent: [ctx.version.version === ctx.pkg.version && ctx.version.channel === channel && /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(ver), `VERSION.json ${ctx.version.version} (${ctx.version.channel}), package.json ${ctx.pkg.version}, configuration channel ${channel}`],
    demoStaysNoindex: [!(ctx.client.flags.demo === true && ctx.client.seo.noindex === false), 'the fictional demonstration must stay noindex'],
    stableVersion: [!/-/.test(ver), /-/.test(ver) ? `${ver} is a pre-release; a client production release needs a plain x.y.z version` : `${ver} is a stable version`],
    releaseApproval: [rel, rel ? `${rel.id}` : `no release-approval record for channel ${channel}, version ${ver}, commit ${c.slice(0, 7)}`],
    rightsVerification: [rights, rights ? `${rights.id}` : 'no rights-verification record: the generated media rights are unverified (docs/JADE_AND_EMBER_MEDIA_RIGHTS_POLICY.md)'],
    noDemoText: [demoText && ctx.client.flags.demo === false, ctx.client.flags.demo ? 'flags.demo is on' : demoText ? 'the client configuration builds with no demonstration text' : 'the client configuration does not validate'],
    productionDomain: [baseHost && !isReservedHost(baseHost), baseHost ? (isReservedHost(baseHost) ? `${baseHost} is a reserved, example, local or preview/staging address, not the approved production domain` : `${baseHost}`) : 'seo.baseUrl is not set'],
    searchReadiness: [!searchGaps.length, searchGaps.length ? searchGaps.join('; ') : `${review.id}: facts, structured data and crawler policy reviewed for these search artifacts`],
    productionSeoComplete: [seoOk, seoOk ? 'canonical, sitemap, robots and structured data are configured' : 'indexable canonical URLs, sitemap, robots and structured data are not all configured'],
    ...Object.fromEntries(['real-device', 'screen-reader', 'browser-matrix', 'ci-run'].map((t) => { const cv = coverage(evSpec, t, assessed); return [`evidence:${t}`, [cv.ok, cv.detail]]; })),
  };
  for (const id of need) { const [ok, detail] = checks[id] || [false, 'unknown requirement']; add(id, ok, detail); }
  // a client configuration labelled demonstration is always refused
  if (channel === 'client-production' && ctx.version.channel === 'demonstration') add('labelMatchesConfiguration', false, 'VERSION.json calls this a demonstration but the configuration is a client production build');
  return { channel, allowed: out.every((r) => r.ok), requirements: out, deploymentApproved: Boolean(findApproval(ctx.approvals, 'deployment-approval', { channel, version: ver, commit: c })) };
}

export function buildReleaseManifest(ctx, { siteDir, qaReport = ctx.verify, packageInfo = null } = {}) {
  const sdig = searchDigest(siteDir), sfiles = ctx.channel === 'demonstration' ? undefined : searchFilesPresent(siteDir);
  const gate = evaluateGate({ ...ctx, assetsTree: buildManifest(siteDir).treeSha256, searchDigest: sdig, siteHasSearchFiles: sfiles });
  const am = buildManifest(siteDir);
  const required = ctx.authority.records.requiredApprovals;
  const have = ctx.approvals;
  const lock = readFileSync(join(ctx.root, 'package-lock.json'));
  const deps = readJson(join(engDir, 'dependencies.json'));
  const policy = loadSecurityPolicy();
  const items = inlineItems(siteDir);
  const csp = buildCsp(siteDir, policy);
  const c = ctx.git.commit;
  const rel = findApproval(have, 'release-approval', { channel: ctx.channel, version: ctx.version.version, commit: c });
  const rights = findRightsVerification(have), dep = findApproval(have, 'deployment-approval', { channel: ctx.channel, version: ctx.version.version, commit: c });
  const recorded = existsSync(join(engDir, 'assets.manifest.json')) ? readJson(join(engDir, 'assets.manifest.json')) : null;
  return {
    schema: 'jade-and-ember/release-manifest@1', project: ctx.version.name, version: ctx.version.version, channel: ctx.channel,
    source: { commit: c, branch: ctx.git.branch, tree: ctx.git.tree, dirty: ctx.git.dirty, commitDate: ctx.git.commitDate },
    baseline: { branch: ctx.baseline.branch, commit: ctx.baseline.commit, projectTree: ctx.baseline.projectTree },
    framework: { repository: ctx.authority.framework.repository, branch: ctx.authority.framework.branch, commit: ctx.authority.framework.commit, release: ctx.authority.framework.release, skillSha256: ctx.authority.creativeAuthority.skillSha256, licenseSha256: ctx.authority.creativeAuthority.licenseSha256, modifiedByThisProject: ctx.authority.framework.modifiedByThisProject },
    configuration: { files: ctx.files, treeSha256: sha(Object.entries(ctx.files).map(([k, v]) => `${v}  ${k}`).join('\n') + '\n'), flags: { demo: ctx.client.flags.demo, heroVideo: ctx.client.flags.heroVideo, noindex: ctx.client.seo.noindex, structuredData: ctx.client.seo.structuredData }, orderingLive: typeof ctx.client.ordering.url === 'string', baseUrl: ctx.client.seo.baseUrl },
    assets: { treeSha256: am.treeSha256, fileCount: am.fileCount, totalBytes: am.totalBytes, manifestMatches: recorded ? recorded.treeSha256 === am.treeSha256 : false },
    search: { artifactsDigest: sdig, files: ['sitemap.xml', 'robots.txt', 'llms.txt'].filter((f) => existsSync(join(siteDir, f))), host: ctx.client.seo.host ?? null, urlStyle: ctx.client.seo.urlStyle ?? 'extension', crawlers: ctx.client.seo.crawlers ?? null, baseUrlReserved: (() => { try { return isReservedHost(new URL(ctx.client.seo.baseUrl).hostname); } catch { return null; } })(), crawlerReview: ctx.crawlerRecord ? { verifiedOn: ctx.crawlerRecord.verifiedOn, confirmedByPerson: ctx.crawlerRecord.confirmedByPerson === true, maxAgeDays: ctx.crawlerRecord.maxAgeDays, agents: (ctx.crawlerRecord.agents || []).length } : null, noindexHeader: Object.keys(robotsHeaders(siteDir)).length > 0 },
    security: { cspSha256: sha(csp), headers: Object.keys(securityHeaders(siteDir, policy)).sort(), inlineScriptHashes: items.scripts.length, inlineStyleHashes: items.styles.length },
    qa: { verified: Boolean(qaReport && qaReport.passed && qaReport.mode === 'full' && qaReport.commit === c && qaReport.dirty === false), report: qaReport ? { mode: qaReport.mode, passed: qaReport.passed, commit: qaReport.commit ?? null, checks: qaReport.results.map((r) => ({ id: r.id, status: r.passed ? 'pass' : 'fail' })) } : null },
    approvals: { required: [...required].sort(), present: have.filter((a) => required.includes(a.id) || /release|rights|deployment|search/i.test(a.type)).map((a) => ({ id: a.id, date: a.date, type: a.type })), missing: required.filter((r) => !have.some((a) => a.id === r)), releaseApproval: rel?.id || null, rightsVerification: rights?.id || null, deploymentApproval: dep?.id || null },
    evidence: assessedEvidence({ ...ctx, assetsTree: am.treeSha256 }).map((e) => ({ file: e.file, type: e.type, commit: e.commit, valid: e.valid, success: e.success, class: e.class, target: e.target })),
    findings: ctx.findings.map((f) => ({ id: f.id, severity: f.severity, visual: f.visual, status: String(f.status).slice(0, 80) })),
    dependencies: { lockfileSha256: sha256(lock), runtimeDependencies: Object.keys(ctx.pkg.dependencies || {}).length, acceptedAdvisoryPackages: deps.acceptedAdvisories.packages.length },
    gate: { channel: gate.channel, allowed: gate.allowed, deploymentApproved: gate.deploymentApproved, requirements: gate.requirements },
    package: packageInfo,
  };
}
