// Invented release states for the TESTS of the release gate (check:release, check:selftest-gate4, check:selftest-gate6). Nothing here is ever written to a
// release folder and nothing is a decision of anyone: the reviewers, records, runs and digests are made up, and every rationale says so.
import { APPROVAL_SCHEMA, DEPLOYMENT_SCHEMA, DEMONSTRATIONS_SCHEMA, REVIEWERS_SCHEMA, SEARCH_REVIEWED } from './records.mjs';
import { buildVerificationRecord, registryDigest } from './verification.mjs';
import { collectContext } from './release.mjs';
import { FIXTURE_CANDIDATE, FIXTURE_ENGINE, FIXTURE_IDS, FIXTURE_TREE, fixtureEvidenceSet, fixtureVctx } from './evidence-fixtures.mjs';

export const FX_COMMIT = 'a'.repeat(40);
export const FX_SEARCH = 'f'.repeat(64);
export const FX_HOST = 'www.jade-and-ember-fixture.com';
export const FX_CONFIG = 'c'.repeat(64);
export const FX_IDS = FIXTURE_IDS;
const NOTE = 'INVENTED FIXTURE for the tests: no person decided this.';
const TYPES_ALL = ['release-approval', 'rights-verification', 'search-review'];

export const fxReviewers = (over = {}) => ({
  schema: REVIEWERS_SCHEMA, establishedBy: 'APR-JE-017',
  reviewers: [
    { id: 'R-01', name: 'Fixture Owner', role: 'owner (invented)', mayApprove: TYPES_ALL, mayReject: TYPES_ALL, mayRevoke: [...TYPES_ALL, 'deployment-authorisation'], validFrom: '2026-01-01', validTo: null },
    { id: 'R-02', name: 'Fixture Rights Reviewer', role: 'rights reviewer (invented)', mayApprove: ['rights-verification'], mayReject: ['rights-verification'], mayRevoke: [], validFrom: '2026-01-01', validTo: null },
    { id: 'R-03', name: 'Fixture Deployer', role: 'deployment authoriser (invented)', mayApprove: ['deployment-authorisation'], mayReject: ['deployment-authorisation'], mayRevoke: ['deployment-authorisation'], validFrom: '2026-01-01', validTo: null },
  ],
  ...over,
});

const PREFIX = { 'release-approval': 'REL', 'rights-verification': 'RIGHTS', 'search-review': 'SRCH', 'deployment-authorisation': 'DEP' };
// one record; `over` is merged on top (the subject is merged too)
export function fxRecord(type, over = {}, { candidate = FIXTURE_CANDIDATE, n = 1, channel = 'client-production', version = '1.0.0' } = {}) {
  const subject = type === 'release-approval' ? { productionHost: FX_HOST }
    : type === 'search-review' ? { searchDigest: FX_SEARCH, reviewed: [...SEARCH_REVIEWED] }
    : type === 'rights-verification' ? { sources: ['the generator terms of service (invented)'], verifiedOn: '2026-10-10' }
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
