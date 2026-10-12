// Invented release states for the TESTS of the release gate (check:release, check:selftest-gate4, check:selftest-gate6). Nothing here is ever written to a
// release folder and nothing is a decision of anyone: the reviewers, records, runs and digests are made up, and every rationale says so.
import { APPROVAL_SCHEMA, DEPLOYMENT_SCHEMA, DEMONSTRATIONS_SCHEMA, REVIEWERS_SCHEMA, SEARCH_REVIEWED } from './records.mjs';
import { buildVerificationRecord, registryDigest } from './verification.mjs';
import { collectContext } from './release.mjs';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { deliveredMediaDigest, rightsClearance } from './media-rights.mjs';
import { socialImageStatus } from './social.mjs';
import { registryDigest as destinationsDigestOf } from './external.mjs';
import { FIXTURE_CANDIDATE, FIXTURE_ENGINE, FIXTURE_IDS, FIXTURE_TREE, fixtureEvidenceSet, fixtureVctx } from './evidence-fixtures.mjs';

export const FX_COMMIT = 'a'.repeat(40);
export const FX_SEARCH = 'f'.repeat(64);
export const FX_HOST = 'www.jade-and-ember-fixture.com';
export const FX_CONFIG = 'c'.repeat(64);
export const FX_IDS = FIXTURE_IDS;
const NOTE = 'INVENTED FIXTURE for the tests: no person decided this.';
const TYPES_ALL = ['release-approval', 'rights-verification', 'search-review', 'external-links-review'];

export const fxReviewers = (over = {}) => ({
  schema: REVIEWERS_SCHEMA, establishedBy: 'APR-JE-017',
  reviewers: [
    { id: 'R-01', name: 'Fixture Owner', role: 'owner (invented)', mayApprove: TYPES_ALL, mayReject: TYPES_ALL, mayRevoke: [...TYPES_ALL, 'deployment-authorisation'], validFrom: '2026-01-01', validTo: null },
    { id: 'R-02', name: 'Fixture Rights Reviewer', role: 'rights reviewer (invented)', mayApprove: ['rights-verification'], mayReject: ['rights-verification'], mayRevoke: [], validFrom: '2026-01-01', validTo: null },
    { id: 'R-03', name: 'Fixture Deployer', role: 'deployment authoriser (invented)', mayApprove: ['deployment-authorisation'], mayReject: ['deployment-authorisation'], mayRevoke: ['deployment-authorisation'], validFrom: '2026-01-01', validTo: null },
  ],
  ...over,
});

const PREFIX = { 'release-approval': 'REL', 'rights-verification': 'RIGHTS', 'search-review': 'SRCH', 'external-links-review': 'EXTL', 'deployment-authorisation': 'DEP' };
// one record; `over` is merged on top (the subject is merged too)
export function fxRecord(type, over = {}, { candidate = FIXTURE_CANDIDATE, n = 1, channel = 'client-production', version = '1.0.0' } = {}) {
  const subject = type === 'release-approval' ? { productionHost: FX_HOST }
    : type === 'search-review' ? { searchDigest: FX_SEARCH, reviewed: [...SEARCH_REVIEWED] }
    : type === 'rights-verification' ? { sources: ['the generator terms of service (invented)'], verifiedOn: '2026-10-10', inventory: fxSite().mediaDigest, basis: 'licence' }
    : type === 'external-links-review' ? { destinationsDigest: fxSite().ext.digest, verification: 'EXTV-1', opened: true }
    : { releaseApproval: 'REL-JE-001', targetHost: FX_HOST };
  const { subject: so, decidedBy: db, ...rest } = over;
  return {
    schema: type === 'deployment-authorisation' ? DEPLOYMENT_SCHEMA : APPROVAL_SCHEMA, id: `${PREFIX[type]}-JE-${String(n).padStart(3, '0')}`, type, status: 'approved',
    candidate, channel, version, subject: { ...subject, ...(so || {}) },
    decidedBy: { reviewer: type === 'deployment-authorisation' ? 'R-03' : 'R-01', name: type === 'deployment-authorisation' ? 'Fixture Deployer' : 'Fixture Owner', ...(db || {}) },
    decidedAt: '2026-10-11T10:00:00Z', rationale: NOTE, ...rest,
  };
}
export const fxEntry = (rec, file = null) => ({ file: file || `${rec.id}.json`, record: rec });
export const fxApprovals = (o = {}) => TYPES_ALL.map((t) => fxEntry(fxRecord(t, {}, o)));

export function fxVerify(over = {}, { candidate = FIXTURE_CANDIDATE, ids = FX_IDS } = {}) {
  return { ...buildVerificationRecord({ mode: 'full', results: ids.map((id) => ({ id, passed: true, seconds: 1 })), candidate: { digest: candidate, channel: 'client-production', version: '1.0.0' }, engine: FIXTURE_ENGINE, registry: registryDigest(ids), commit: FX_COMMIT, dirty: false, startedAt: '2026-10-12T08:00:00Z', finishedAt: '2026-10-12T08:20:00Z', env: {} }), ...over };
}
// a verification record with the right seal after the given edit (a forger who recomputes the seal)
export function fxVerifyEdited(edit) { const v = fxVerify(); edit(v); return v; }


// ---- G6-3 fixtures: an invented delivered folder (a few media files, one font with its licence text), its rights inventory, an external destination, a
// supply-chain history. Built once in a temporary folder; nothing here describes a real asset, run or decision.
const sha = (b) => createHash('sha256').update(b).digest('hex');
let SITE = null;
export function fxSite() {
  if (SITE) return SITE;
  const dir = mkdtempSync(join(tmpdir(), 'je-fx-site-'));
  mkdirSync(join(dir, 'media')); mkdirSync(join(dir, 'fonts'));
  const files = { 'media/hero.webp': 'INVENTED IMAGE BYTES', 'media/loop.mp4': 'INVENTED VIDEO BYTES', 'fonts/serif.woff2': 'wOF2 INVENTED FONT BYTES', 'fonts/LICENSES.txt': '===== fixture-serif (SIL Open Font License 1.1) =====\nCopyright 2024 The Fixture Serif Project Authors\n\nThis Font Software is licensed under the SIL Open Font License, Version 1.1.\n\nSIL OPEN FONT LICENSE Version 1.1 - 26 February 2007\n' };
  for (const [f, t] of Object.entries(files)) writeFileSync(join(dir, f), t);
  writeFileSync(join(dir, 'index.html'), '<!doctype html><html><head><title>fixture</title></head><body><p>fixture</p></body></html>');
  const asset = (path, kind, extra) => ({ path, kind, description: `invented ${kind}`, bytes: Buffer.byteLength(files[path]), sha256: sha(files[path]), useNow: 'INVENTED: used for the fixture only.', clientUse: 'INVENTED: reuse needs the recorded rights verification.', ...extra });
  const gen = { origin: { type: 'ai-generated', service: 'an invented generator', generatedOn: '2026-10-01' }, termsToVerify: ['T-FX-TOS'] };
  const inventory = {
    terms: [{ id: 'T-FX-TOS', party: 'Invented', title: 'Invented terms', url: 'https://terms.fixture.example.test/', establishes: 'INVENTED: who may use an image generated through the invented service.', status: 'reviewed', reviewedOn: '2026-10-10', reviewedBy: 'Fixture Rights Reviewer' }, { id: 'T-FX-OFL', party: 'Invented', title: 'Invented OFL', url: 'https://openfontlicense.org/', establishes: 'INVENTED: that the shipped text is the OFL 1.1 text.', status: 'reviewed', reviewedOn: '2026-10-10', reviewedBy: 'Fixture Rights Reviewer' }],
    assets: [
      asset('media/hero.webp', 'image', { ...gen, rights: { status: 'verified', approval: 'RIGHTS-JE-001', established: ['INVENTED fixture'], notEstablished: [] } }),
      asset('media/loop.mp4', 'video', { ...gen, rights: { status: 'verified', approval: 'RIGHTS-JE-001', established: ['INVENTED fixture'], notEstablished: [] } }),
      asset('fonts/serif.woff2', 'font', { licenceSection: 'fixture-serif', origin: { type: 'open-font', licence: 'SIL Open Font License 1.1', recordedIn: 'fonts/LICENSES.txt' }, termsToVerify: ['T-FX-OFL'], rights: { status: 'licence-text-shipped', established: ['INVENTED fixture'], notEstablished: [] } }),
    ],
  };
  const destinations = [{ kind: 'link', url: 'https://order.jade-and-ember-fixture.com/', files: ['index.html'], count: 1 }];
  const ext = { destinations, digest: destinationsDigestOf({ destinations }) };
  SITE = { dir, files, inventory, ext, mediaDigest: deliveredMediaDigest(dir) };
  return SITE;
}
// a copy of the fixture site with another index.html (for the social-image cases)
const VARIANTS = new Map();
export function fxSiteWithIndex(html) {
  if (VARIANTS.has(html)) return VARIANTS.get(html);
  const base = fxSite(), dir = mkdtempSync(join(tmpdir(), 'je-fx-var-'));
  mkdirSync(join(dir, 'media')); mkdirSync(join(dir, 'fonts'));
  for (const [f, t] of Object.entries(base.files)) writeFileSync(join(dir, f), t);
  writeFileSync(join(dir, 'index.html'), html);
  VARIANTS.set(html, dir);
  return dir;
}
const FX_LOCK = { sha256: 'd'.repeat(64), packages: 3 };
const FX_SBOM = 'e'.repeat(64);
export const FX_LOCK_INFO = () => ({ ...FX_LOCK });
export const fxExternalHistory = (over = {}) => ({ records: [{ id: 'EXTV-1', date: '2026-10-10', runner: { kind: 'github-actions', description: 'INVENTED FIXTURE: a networked runner that never ran', run: 'https://github.com/example/example/actions/runs/1' }, registryDigest: fxSite().ext.digest, results: [{ url: 'https://order.jade-and-ember-fixture.com/', kind: 'link', class: 'verified', finalUrl: 'https://order.jade-and-ember-fixture.com/', finalStatus: 200, chain: [{ url: 'https://order.jade-and-ember-fixture.com/', status: 200, method: 'HEAD' }], attempts: 1, detail: 'answered directly' }], ...over }] });
export const fxSupplyHistory = (over = {}) => ({ records: [{ id: 'SCV-1', date: '2026-10-10', runner: { kind: 'github-actions', description: 'INVENTED FIXTURE: a networked runner that never ran' }, lockfileSha256: FX_LOCK.sha256, sbomSha256: FX_SBOM, audit: { total: 0, critical: 0, high: 0, moderate: 0, low: 0, advisories: [] }, signatures: { total: 3, verified: 3, failed: 0, missing: 0 }, ...over }] });

// A fully approved client-production context (invented), used to prove the gate passes when it should and blocks when anything is missing.
export function greenClientContext(over = {}) {
  const base = collectContext({});
  const client = JSON.parse(JSON.stringify(base.client));
  Object.assign(client.flags, { demo: false }); Object.assign(client.seo, { noindex: false, structuredData: true, baseUrl: `https://${FX_HOST}`, host: 'cloudflare-pages', urlStyle: 'clean', crawlers: { search: 'allow', aiSearch: 'allow', training: 'disallow' }, business: { x: 1 } });
  const version = { name: 'jade-and-ember', version: '1.0.0', baseline: '0.8', channel: 'client-production', previewPackage: 'x.zip' };
  const fx = fixtureEvidenceSet(), fv = fixtureVctx(fx.files);   // invented, in-memory records that satisfy the evidence rules; see lib/evidence-fixtures.mjs
  return {
    ...base, client, version, pkg: { ...base.pkg, version: '1.0.0' }, channel: 'client-production', findings: [{ id: 'F-1', severity: 'Minor', visual: false, status: 'open' }],
    git: { commit: FX_COMMIT, tree: FX_COMMIT, branch: 'release', dirty: false, commitDate: '2026-10-10T00:00:00Z' },
    candidate: { schema: 'jade-and-ember/candidate@1', channel: 'client-production', version: '1.0.0', digest: FIXTURE_CANDIDATE, parts: { configuration: FX_CONFIG } },
    engine: { engineDigest: FIXTURE_ENGINE, ids: FX_IDS, registryDigest: registryDigest(FX_IDS) },
    verify: fxVerify(), assetsTree: FIXTURE_TREE, buildOk: true, assetsManifestMatches: true,
    approvals: base.authority.records.requiredApprovals.map((id) => ({ id, date: '2026-10-10', type: 'approval', decision: 'x', concerns: '', limits: '' })),
    reviewers: fxReviewers(), approvalRecords: fxApprovals(), deploymentRecords: [],
    demonstrations: { schema: DEMONSTRATIONS_SCHEMA, registered: [] },
    ext: fxSite().ext, mediaDigest: fxSite().mediaDigest, externalHistory: fxExternalHistory(), supplyHistory: fxSupplyHistory(), lock: FX_LOCK, sbomSha256: FX_SBOM, sbomText: '{}\n', sbomProblems: [],
    deps: { ...base.deps, acceptedAdvisories: { ...base.deps.acceptedAdvisories, packages: [] } }, inventory: fxSite().inventory, dependencyPolicyProblems: [], runtimeProblems: [],
    // (non-arrow functions: `this` is the context the gate evaluates, so a case that overrides the inventory or the findings is seen by the real clearance code)
    rightsCheck: function (ids) { return rightsClearance({ inventory: this.inventory, siteDir: this.rightsSiteDir || fxSite().dir, rightsIds: ids, findingIds: this.findings.map((f) => f.id), blockingFindings: ['F-G2-01', 'F-G5-05'] }); },
    socialCheck: function (ids) { return socialImageStatus({ siteDir: this.socialSiteDir || fxSite().dir, inventory: this.inventory, rightsIds: ids, baseUrl: `https://${FX_HOST}` }); },
    authenticityVerifier: () => ({ ok: true, implemented: true, detail: 'INVENTED FIXTURE: authenticity stands in for a verifier that does not exist yet' }),
    evidence: fx.entries.map((e) => ({ ...e, type: e.record.type })), evidenceVctx: { git: fv.git, fs: fv.fs, today: fv.today }, searchDigest: FX_SEARCH, siteHasSearchFiles: true, crawlerRecord: { ...base.crawlerRecord, confirmedByPerson: true }, today: '2026-10-12', ...over,
  };
}

// A fully registered demonstration (invented configuration digest).
export function greenDemoContext(over = {}) {
  const g = greenClientContext();
  const client = JSON.parse(JSON.stringify(g.client));
  client.flags.demo = true; client.seo.noindex = true; client.seo.structuredData = false; delete client.seo.baseUrl;
  return greenClientContext({
    channel: 'demonstration', client,
    version: { name: 'jade-and-ember', version: '0.9.0-dev', baseline: '0.8', channel: 'demonstration', previewPackage: 'x.zip' }, pkg: { ...g.pkg, version: '0.9.0-dev' },
    candidate: { ...g.candidate, channel: 'demonstration', version: '0.9.0-dev' },
    demonstrations: { schema: DEMONSTRATIONS_SCHEMA, registered: [{ id: 'DEMO-JE-001', configurationDigest: FX_CONFIG, registeredBy: 'APR-JE-039', description: 'INVENTED FIXTURE: a registered fictional demonstration.' }] },
    approvalRecords: [], evidence: [], verify: fxVerify({}, { candidate: FIXTURE_CANDIDATE }), ...over,
  });
}
