// The single-defect cases of check:release and check:selftest-gate4 for release model v2 (G6-2): each is an override of the fully approved invented context
// (lib/release-fixtures.mjs). `blocked()` must each make the gate refuse; `allowed()` are things that must NOT block (they prove the gate reads fields, not prose);
// `demonstrationBlocked()` are demonstration defects. Functions, so every call builds fresh objects.
import { fxEntry, fxExternalHistory, fxRecord, fxReviewers, fxSite, fxSiteWithIndex, fxSupplyHistory, fxVerify, fxVerifyEdited, FX_CONFIG, FX_IDS, FX_HOST, greenClientContext } from './release-fixtures.mjs';
import { FIXTURE_CANDIDATE, FIXTURE_ENGINE } from './evidence-fixtures.mjs';
import { sealOf } from './verification.mjs';

const clone = (o) => JSON.parse(JSON.stringify(o));
const G = () => greenClientContext();
const withoutType = (t) => G().approvalRecords.filter((e) => e.record.type !== t);
const editType = (t, fn) => G().approvalRecords.map((e) => (e.record.type === t ? { ...e, record: (() => { const r = clone(e.record); fn(r); return r; })() } : e));
const plus = (...recs) => [...G().approvalRecords, ...recs.map((r) => fxEntry(r))];
const reseal = (v) => { v.seal = sealOf(v); return v; };
const mutateEv = (target, fn) => G().evidence.map((e) => (e.record.target === target ? (() => { const r = clone(e.record); fn(r); return { ...e, record: r }; })() : e));
const cfg = (fn) => { const c = G().client; fn(c); return c; };
const OTHER = '0'.repeat(64);
import { registryDigest as destinationsDigestOf } from './external.mjs';
const require_digest = (pairs) => destinationsDigestOf({ destinations: pairs.map(([kind, url]) => ({ kind, url })) });
const rec = (type, over, o) => fxRecord(type, over, o);
const hist = (fn) => { const h = fxExternalHistory(); fn(h.records[0]); return h; };
const sup = (fn) => { const h = fxSupplyHistory(); fn(h.records[0]); return h; };
const inv = (fn) => { const i = clone(fxSite().inventory); fn(i); return i; };
const exc = (over = {}) => ({ name: 'left-pad', severity: 'moderate', advisory: 'GHSA-aaaa-bbbb-cccc', reason: 'INVENTED: development-only, no exposure', reviewed: '2026-10-01', expires: '2026-12-01', plan: 'upgrade', ...over });
const advisory = (over = {}) => ({ package: 'left-pad', severity: 'moderate', advisory: 'GHSA-aaaa-bbbb-cccc', ...over });
const withAdvisory = (a, o = {}) => sup((r) => { r.audit.advisories = [a]; r.audit.total = 1; r.audit[a.severity] = 1; Object.assign(r, o); });
const depsWith = (...packages) => ({ ...G().deps, acceptedAdvisories: { ...G().deps.acceptedAdvisories, packages } });
const page = (head) => `<!doctype html><html><head><title>fixture</title>${head}</head><body><p>fixture</p></body></html>`;

// For the G6-3 cases: the requirement(s) that must be the reason (a case blocked only by something unrelated would prove nothing)
const X = (ids, names) => Object.fromEntries(names.map((n) => [n, ids]));
export const EXPECTED_REASON = {
  ...X(['externalLinks'], ['no external-links verification record', 'an external-links verification for another destination list', 'an external-links verification from a sandbox run', 'an external-links verification older than its limit', 'a clickable link the site refused (blocked)', 'a clickable link that is gone (unavailable)', 'a clickable link that could not be reached (inconclusive)', 'a verified link through an http hop', 'a verification record with no result for a destination', 'a clickable link that is not https', 'a clickable link to a reserved host', 'a clickable link to a staging host']),
  ...X(['externalLinksReview'], ['a missing external-links review', 'an external-links review of another destination list', 'an external-links review that relies on another verification record', 'an external-links review that did not open the destinations', 'an external-links review that was rejected', 'an external-links review revoked by an authorised reviewer', 'an external-links review for another candidate']),
  ...X(['rightsVerification'], ['a rights verification of other media (inventory digest differs)', 'a rights verification with no inventory digest', 'a rights verification with a basis the model does not know']),
  ...X(['mediaRightsInventory'], ['an image still unverified in the inventory', 'an inventory approval naming a record that does not exist', 'the rights verification revoked after the inventory was written (the inventory still says verified)', 'the rights verification rejected after the inventory was written', 'provider terms nobody has reviewed', 'the Noto Serif SC notice finding (F-G5-05) still open', 'the media provenance finding (F-G2-01) only accepted, not resolved', 'a font that is not described as licence-text-shipped', 'a rights verification of other media (inventory digest differs)']),
  ...X(['socialImageRights'], ['a social image hosted on another site', 'a social image that is not a delivered file', 'a social image that is delivered but not in the rights inventory', 'a twitter card image that is not rights-verified', 'a JSON-LD image hosted elsewhere']),
  ...X(['dependencySecurity'], ['no supply-chain verification', 'a supply-chain verification for another lockfile', 'a supply-chain verification from a sandbox run', 'an old supply-chain verification', 'a high advisory', 'a critical advisory', 'a moderate advisory with no exception', 'a moderate advisory whose exception expired', 'an exception without a plan', 'an exception that runs for more than 90 days', 'an exception written as a bare package name', 'a supply-chain record whose advisory count does not add up', 'registry signatures that failed', 'registry signatures that cover fewer packages than the lockfile']),
  ...X(['sbomVerified'], ['an SBOM digest different from the one the build regenerates', 'an SBOM that records a library with no licence']),
  ...X(['dependencyPolicy'], ['a dependency policy violation (a loose version range)']),
  ...X(['supportedRuntimes'], ['a workflow on an unsupported Node']),
  ...X(['authenticity'], ['authenticated authorisation and provenance (not implemented)']),
};
export const RELEASE_CASES = {
  blocked: () => ({
    // ---- approvals as structured records (RG-04 to RG-07)
    'a missing release approval': { approvalRecords: withoutType('release-approval') },
    'a release approval for another candidate artifact': { approvalRecords: editType('release-approval', (r) => { r.candidate = OTHER; }) },
    'a release approval for another version': { approvalRecords: editType('release-approval', (r) => { r.version = '0.9.0'; }) },
    'a release approval for the other channel': { approvalRecords: editType('release-approval', (r) => { r.channel = 'demonstration'; }) },
    'a release approval whose status is rejected': { approvalRecords: editType('release-approval', (r) => { r.status = 'rejected'; }) },
    'a release approval and a later rejection (both in force)': { approvalRecords: plus(rec('release-approval', { status: 'rejected', decidedAt: '2026-10-11T12:00:00Z' }, { n: 2 })) },
    'a release approval revoked by an authorised reviewer': { approvalRecords: plus(rec('release-approval', { status: 'revoked', ends: 'REL-JE-001', decidedAt: '2026-10-11T12:00:00Z' }, { n: 2 })) },
    'a release approval superseded without a replacement': { approvalRecords: plus(rec('release-approval', { status: 'superseded', ends: 'REL-JE-001', decidedAt: '2026-10-11T12:00:00Z' }, { n: 2 })) },
    'a release approval by a reviewer who is not in the table': { approvalRecords: editType('release-approval', (r) => { r.decidedBy = { reviewer: 'R-09', name: 'Nobody' }; }) },
    'a release approval by a reviewer who may not approve it (rights reviewer)': { approvalRecords: editType('release-approval', (r) => { r.decidedBy = { reviewer: 'R-02', name: 'Fixture Rights Reviewer' }; }) },
    'a release approval signed with the wrong name for a valid reviewer id': { approvalRecords: editType('release-approval', (r) => { r.decidedBy.name = 'Someone Else'; }) },
    'a release approval decided before the reviewer was authorised': { approvalRecords: editType('release-approval', (r) => { r.decidedAt = '2025-12-31T10:00:00Z'; }) },
    'a release approval decided after the reviewer\'s authorisation ended': { reviewers: (() => { const t = fxReviewers(); t.reviewers[0].validTo = '2026-10-01'; return t; })() },
    'an empty reviewer table': { reviewers: fxReviewers({ establishedBy: null, reviewers: [] }) },
    'a reviewer table with a duplicate id': { reviewers: (() => { const t = fxReviewers(); t.reviewers.push({ ...t.reviewers[0] }); return t; })() },
    'a reviewer table established by a governance record that does not exist': { reviewers: fxReviewers({ establishedBy: 'APR-JE-999' }) },
    'an approval dated in the future': { approvalRecords: editType('release-approval', (r) => { r.decidedAt = '2026-12-31T10:00:00Z'; }) },
    'a record with a status the model does not know': { approvalRecords: editType('release-approval', (r) => { r.status = 'pending'; }) },
    'a record with the status spelled in prose': { approvalRecords: editType('release-approval', (r) => { r.status = 'approved (REVOKED)'; }) },
    'a record of an unknown type': { approvalRecords: plus({ ...rec('release-approval'), type: 'something-else', id: 'REL-JE-009' }) },
    'a record file that is not valid JSON': { approvalRecords: [...G().approvalRecords, { file: 'broken.json', record: null, parseError: 'not valid JSON (Unexpected token)' }] },
    'a release approval that carries no production host': { approvalRecords: editType('release-approval', (r) => { delete r.subject.productionHost; }) },
    'a release approval for a different production host': { approvalRecords: editType('release-approval', (r) => { r.subject.productionHost = 'www.other-restaurant.com'; }) },
    'a release approval for a reserved host (example.test)': { approvalRecords: editType('release-approval', (r) => { r.subject.productionHost = 'jade.example.test'; }), client: cfg((c) => { c.seo.baseUrl = 'https://jade.example.test'; }) },
    'an unauthorised revocation (the approval stays, the record blocks)': { approvalRecords: plus(rec('release-approval', { status: 'revoked', ends: 'REL-JE-001', decidedBy: { reviewer: 'R-02', name: 'Fixture Rights Reviewer' }, decidedAt: '2026-10-11T12:00:00Z' }, { n: 2 })) },
    'an unauthorised rejection': { approvalRecords: plus(rec('release-approval', { status: 'rejected', decidedBy: { reviewer: 'R-09', name: 'Nobody' }, decidedAt: '2026-10-11T12:00:00Z' }, { n: 2 })) },
    'a revocation that ends a record that does not exist': { approvalRecords: plus(rec('release-approval', { status: 'revoked', ends: 'REL-JE-077', decidedAt: '2026-10-11T12:00:00Z' }, { n: 2 })) },
    'a revocation that ends an approval of another candidate': { approvalRecords: plus(rec('release-approval', { status: 'revoked', ends: 'REL-JE-001', decidedAt: '2026-10-11T12:00:00Z' }, { n: 2, candidate: OTHER })) },
    'a revocation dated before the approval it ends': { approvalRecords: plus(rec('release-approval', { status: 'revoked', ends: 'REL-JE-001', decidedAt: '2026-10-10T08:00:00Z' }, { n: 2 })) },
    'a revocation of a revocation': { approvalRecords: plus(rec('release-approval', { status: 'revoked', ends: 'REL-JE-001', decidedAt: '2026-10-11T12:00:00Z' }, { n: 2 }), rec('release-approval', { status: 'revoked', ends: 'REL-JE-002', decidedAt: '2026-10-11T13:00:00Z' }, { n: 3 }), rec('release-approval', { decidedAt: '2026-10-11T14:00:00Z' }, { n: 4 })).filter((e) => e.record.id !== 'REL-JE-001') },
    'a revocation without an ends field': { approvalRecords: plus((() => { const r = rec('release-approval', { status: 'revoked', decidedAt: '2026-10-11T12:00:00Z' }, { n: 2 }); return r; })()) },
    'a missing rights verification': { approvalRecords: withoutType('rights-verification') },
    'a rights verification that names no source': { approvalRecords: editType('rights-verification', (r) => { r.subject.sources = []; }) },
    'a rights verification with no date': { approvalRecords: editType('rights-verification', (r) => { r.subject.verifiedOn = 'today'; }) },
    'a rights verification that was rejected (not verified)': { approvalRecords: editType('rights-verification', (r) => { r.status = 'rejected'; }) },
    'a rights verification for another candidate': { approvalRecords: editType('rights-verification', (r) => { r.candidate = OTHER; }) },
    'a missing search review': { approvalRecords: withoutType('search-review') },
    'a search review that was rejected (not reviewed)': { approvalRecords: editType('search-review', (r) => { r.status = 'rejected'; }) },
    'a search review of different search artifacts (digest mismatch)': { approvalRecords: editType('search-review', (r) => { r.subject.searchDigest = '0'.repeat(64); }) },
    'a search review that does not list the crawler policy': { approvalRecords: editType('search-review', (r) => { r.subject.reviewed = ['business-facts', 'structured-data']; }) },
    'a search review that does not list the structured data': { approvalRecords: editType('search-review', (r) => { r.subject.reviewed = ['business-facts', 'crawler-policy']; }) },
    'a search review for another candidate': { approvalRecords: editType('search-review', (r) => { r.candidate = OTHER; }) },
    'no search artifacts to review': { searchDigest: null },
    'a missing required gate approval (APR-JE-017)': { approvals: G().approvals.filter((a) => a.id !== 'APR-JE-017') },
    // ---- the tree, the verification record (RG-08), findings
    'a dirty working tree': { git: { ...G().git, dirty: true } },
    'no verification record': { verify: null },
    'the old verification report format, written by hand': { verify: { mode: 'full', passed: true, commit: 'a'.repeat(40), dirty: false, assetsTree: 'b'.repeat(64), results: [] } },
    'a verification record with a broken seal (edited by hand)': { verify: fxVerifyEdited((v) => { v.passed = true; v.checks[0].seconds = 99; }) },
    'a verification record missing a check, with the seal recomputed': { verify: (() => { const v = fxVerify(); v.checks.pop(); return reseal(v); })() },
    'a verification record with an extra check, seal recomputed': { verify: (() => { const v = fxVerify(); v.checks.push({ id: 'check:made-up', passed: true, seconds: 1 }); return reseal(v); })() },
    'a verification record that lists a check twice, seal recomputed': { verify: (() => { const v = fxVerify(); v.checks.push({ ...v.checks[0] }); return reseal(v); })() },
    'a verification record with a failing check, seal recomputed': { verify: (() => { const v = fxVerify(); v.checks[3].passed = false; return reseal(v); })() },
    'a verification record that says passed but lists a failing check': { verify: (() => { const v = fxVerify(); v.checks[3].passed = false; v.passed = true; return reseal(v); })() },
    'a verification record of a fast (partial) run': { verify: (() => { const v = fxVerify(); v.mode = 'fast'; return reseal(v); })() },
    'a verification record for another candidate artifact': { verify: fxVerify({}, { candidate: OTHER }) },
    'a verification record made by other verification code (engine digest differs)': { verify: (() => { const v = fxVerify(); v.engineDigest = 'a'.repeat(64); return reseal(v); })() },
    'a verification record run on a dirty tree': { verify: (() => { const v = fxVerify(); v.source.dirty = true; return reseal(v); })() },
    'a verification record whose registry digest is not the verifier\'s': { verify: (() => { const v = fxVerify(); v.registryDigest = 'a'.repeat(64); return reseal(v); })() },
    'a verification record of the right candidate but with the checks of an older, smaller verifier': { engine: { ...G().engine, ids: [...FX_IDS, 'check:newly-added'] } },
    'an open Blocker': { findings: [{ id: 'F-9', severity: 'Blocker', visual: false, status: 'open' }] },
    'an open Major': { findings: [{ id: 'F-9', severity: 'Major', visual: false, status: 'open' }] },
    'a finding with an unknown severity': { findings: [{ id: 'F-9', severity: 'Whatever', visual: false, status: 'open' }] },
    'a stale recorded asset manifest': { assetsManifestMatches: false },
    // ---- version and configuration
    'a pre-release version': { version: { ...G().version, version: '1.0.0-rc.1' }, pkg: { ...G().pkg, version: '1.0.0-rc.1' } },
    'a version file that disagrees with package.json': { pkg: { ...G().pkg, version: '1.0.1' } },
    'a client configuration labelled as a demonstration': { version: { ...G().version, channel: 'demonstration' } },
    'a client configuration that does not build': { buildOk: false },
    // ---- evidence (each old defect still blocks; the binding is now the candidate artifact)
    'missing real-device evidence': { evidence: G().evidence.filter((e) => e.type !== 'real-device') },
    'missing screen-reader evidence': { evidence: G().evidence.filter((e) => e.type !== 'screen-reader') },
    'missing browser-matrix evidence': { evidence: G().evidence.filter((e) => e.type !== 'browser-matrix') },
    'missing CI evidence': { evidence: G().evidence.filter((e) => e.type !== 'ci-run') },
    'CI evidence for another candidate artifact': { evidence: mutateEv('ci-run', (r) => { r.build.candidate = OTHER; r.verification.candidate = OTHER; }) },
    'CI evidence whose verification summary names another candidate': { evidence: mutateEv('ci-run', (r) => { r.verification.candidate = OTHER; }) },
    'CI evidence made by other verification code': { evidence: mutateEv('ci-run', (r) => { r.verification.engineDigest = 'a'.repeat(64); }) },
    'CI evidence for another set of checks (registry digest)': { evidence: mutateEv('ci-run', (r) => { r.verification.registryDigest = 'a'.repeat(64); }) },
    'CI evidence that reports fewer checks than the verifier defines': { evidence: mutateEv('ci-run', (r) => { r.verification.checks = { total: 39, passed: 39 }; }) },
    'CI evidence with a failing check': { evidence: mutateEv('ci-run', (r) => { r.verification.checks.passed = 39; }) },
    'CI evidence from a run on a person\'s machine': { evidence: mutateEv('ci-run', (r) => { r.verification.runner = 'local'; }) },
    'CI evidence whose run id is not the URL\'s run': { evidence: mutateEv('ci-run', (r) => { r.verification.runId = '999999'; }) },
    'CI evidence with no verification summary': { evidence: mutateEv('ci-run', (r) => { delete r.verification; }) },
    'CI evidence with a malformed seal': { evidence: mutateEv('ci-run', (r) => { r.verification.seal = 'abc'; }) },
    'CI evidence for a commit that is not the release commit or an ancestor': { evidence: mutateEv('ci-run', (r) => { r.build.commit = 'c'.repeat(40).replace(/c/g, 'd'); }) },
    'a CI run that did not succeed': { evidence: mutateEv('ci-run', (r) => { r.conclusion = 'failure'; }) },
    'no Android phone (only an iPhone)': { evidence: G().evidence.filter((e) => e.record.target !== 'android-chrome') },
    'no iPhone (only an Android phone)': { evidence: G().evidence.filter((e) => e.record.target !== 'iphone-safari') },
    'no TalkBack pass': { evidence: G().evidence.filter((e) => e.record.target !== 'sr-talkback-android-chrome') },
    'no VoiceOver pass': { evidence: G().evidence.filter((e) => !e.record.target.startsWith('sr-voiceover')) },
    'no NVDA pass': { evidence: G().evidence.filter((e) => !e.record.target.startsWith('sr-nvda')) },
    'no desktop Safari pass': { evidence: G().evidence.filter((e) => e.record.target !== 'desktop-safari') },
    'a real-device record whose test failed': { evidence: mutateEv('iphone-safari', (r) => { r.results.pages['index.html'].loads.outcome = 'fail'; r.conclusion = 'failure'; r.findings.push({ id: 'DEV-1', page: 'index.html', severity: 'Minor', description: 'the page did not load', status: 'open' }); }) },
    'a failed test of the same device recorded beside the passing one': { evidence: [...G().evidence, (() => { const e = G().evidence.find((x) => x.record.target === 'iphone-safari'); const r = clone(e.record); r.conclusion = 'failure'; r.attachments = []; return { ...e, file: 'iphone-b.json', record: r }; })()] },
    'an evidence entry that cannot be read': { evidence: [...G().evidence, { file: 'broken.json', record: null, parseError: 'not valid JSON', type: 'unreadable' }] },
    'a CI record for a run of another repository': { evidence: mutateEv('ci-run', (r) => { r.url = 'https://github.com/someone-else/other/actions/runs/123456'; }) },
    'emulation offered as a physical device (E1 claimed as E3)': { evidence: mutateEv('iphone-safari', (r) => { r.environment.device.emulated = true; }) },
    'a desktop record offered as a physical device (E2 claimed as E3)': { evidence: mutateEv('iphone-safari', (r) => { r.class = 'E2'; }) },
    'a physical-device record for a different artifact (candidate differs)': { evidence: mutateEv('android-chrome', (r) => { r.build.candidate = OTHER; }) },
    'a physical-device record for different delivered files (assets differ)': { evidence: mutateEv('android-chrome', (r) => { r.build.assetsTree = 'e'.repeat(64); }) },
    'a record with no candidate at all': { evidence: mutateEv('iphone-safari', (r) => { delete r.build.candidate; }) },
    'an unfilled template': { evidence: mutateEv('desktop-chrome', (r) => { r.status = 'template'; }) },
    'an incomplete record (a result left empty)': { evidence: mutateEv('sr-nvda-firefox', (r) => { r.results.pages['visit-us.html']['sr-headings'].outcome = null; }) },
    'a record signed by no one': { evidence: mutateEv('sr-voiceover-macos-safari', (r) => { r.attestation.signedBy = ''; }) },
    // ---- G6-3: external links (D-P5-1, RG-02)
    'no external-links verification record': { externalHistory: { records: [] } },
    'an external-links verification for another destination list': { externalHistory: hist((r) => { r.registryDigest = OTHER; }) },
    'an external-links verification from a sandbox run': { externalHistory: hist((r) => { r.runner = { kind: 'sandbox', description: 'INVENTED: a run with no network at all' }; }) },
    'an external-links verification older than its limit': { externalHistory: hist((r) => { r.date = '2026-08-01'; }) },
    'a clickable link the site refused (blocked)': { externalHistory: hist((r) => { Object.assign(r.results[0], { class: 'blocked', finalStatus: 403 }); }) },
    'a clickable link that is gone (unavailable)': { externalHistory: hist((r) => { Object.assign(r.results[0], { class: 'unavailable', finalStatus: 404 }); }) },
    'a clickable link that could not be reached (inconclusive)': { externalHistory: hist((r) => { Object.assign(r.results[0], { class: 'inconclusive', finalStatus: null, chain: [] }); }) },
    'a verified link through an http hop': { externalHistory: hist((r) => { r.results[0].chain = [{ url: 'http://order.jade-and-ember-fixture.com/', status: 301, method: 'HEAD' }, ...r.results[0].chain]; }) },
    'a verification record with no result for a destination': { externalHistory: hist((r) => { r.results = [{ ...r.results[0], url: 'https://elsewhere.jade-and-ember-fixture.com/' }]; }) },
    'a clickable link that is not https': { ext: (() => { const e = clone(fxSite().ext); e.destinations[0].url = 'http://order.jade-and-ember-fixture.com/'; return e; })() },
    'a clickable link to a reserved host': { ext: (() => { const e = clone(fxSite().ext); e.destinations[0].url = 'https://order.jade-and-ember-fixture.test/'; return e; })() },
    'a clickable link to a staging host': { ext: (() => { const e = clone(fxSite().ext); e.destinations[0].url = 'https://stage2.jade-and-ember-fixture.com/'; return e; })() },
    'a missing external-links review': { approvalRecords: withoutType('external-links-review') },
    'an external-links review of another destination list': { approvalRecords: editType('external-links-review', (r) => { r.subject.destinationsDigest = OTHER; }) },
    'an external-links review that relies on another verification record': { approvalRecords: editType('external-links-review', (r) => { r.subject.verification = 'EXTV-9'; }) },
    'an external-links review that did not open the destinations': { approvalRecords: editType('external-links-review', (r) => { r.subject.opened = false; }) },
    'an external-links review that was rejected': { approvalRecords: editType('external-links-review', (r) => { r.status = 'rejected'; }) },
    'an external-links review revoked by an authorised reviewer': { approvalRecords: plus(rec('external-links-review', { status: 'revoked', ends: 'EXTL-JE-001', decidedAt: '2026-10-11T12:00:00Z' }, { n: 2 })) },
    'an external-links review for another candidate': { approvalRecords: editType('external-links-review', (r) => { r.candidate = OTHER; }) },
    // ---- G6-3: media rights bound to the delivered media (D-P5-4, RG-03)
    'a rights verification of other media (inventory digest differs)': { approvalRecords: editType('rights-verification', (r) => { r.subject.inventory = OTHER; }) },
    'a rights verification with no inventory digest': { approvalRecords: editType('rights-verification', (r) => { delete r.subject.inventory; }) },
    'a rights verification with a basis the model does not know': { approvalRecords: editType('rights-verification', (r) => { r.subject.basis = 'it seemed fine'; }) },
    'an image still unverified in the inventory': { inventory: inv((i) => { i.assets[0].rights = { status: 'unverified', established: ['x'], notEstablished: ['the licence'] }; }) },
    'an inventory approval naming a record that does not exist': { inventory: inv((i) => { i.assets[0].rights.approval = 'RIGHTS-JE-777'; }) },
    'the rights verification revoked after the inventory was written (the inventory still says verified)': { approvalRecords: plus(rec('rights-verification', { status: 'revoked', ends: 'RIGHTS-JE-001', decidedAt: '2026-10-11T12:00:00Z' }, { n: 2 })) },
    'the rights verification rejected after the inventory was written': { approvalRecords: plus(rec('rights-verification', { status: 'rejected', decidedAt: '2026-10-11T12:00:00Z' }, { n: 2 })) },
    'provider terms nobody has reviewed': { inventory: inv((i) => { i.terms[0].status = 'not-reviewed'; delete i.terms[0].reviewedOn; delete i.terms[0].reviewedBy; }) },
    'the Noto Serif SC notice finding (F-G5-05) still open': { findings: [{ id: 'F-G5-05', severity: 'Minor', visual: false, status: 'open: awaits the owner' }] },
    'the media provenance finding (F-G2-01) only accepted, not resolved': { findings: [{ id: 'F-G2-01', severity: 'Minor', visual: false, status: 'accepted' }] },
    'a font that is not described as licence-text-shipped': { inventory: inv((i) => { i.assets[2].rights.status = 'unverified'; }) },
    // ---- G6-3: social-preview images (D-P4-3)
    'a social image hosted on another site': { socialSiteDir: fxSiteWithIndex(page('<meta property="og:image" content="https://cdn.elsewhere.com/share.jpg">')) },
    'a social image that is not a delivered file': { socialSiteDir: fxSiteWithIndex(page('<meta property="og:image" content="media/not-there.jpg">')) },
    'a social image that is delivered but not in the rights inventory': { inventory: inv((i) => { i.assets = i.assets.filter((a) => a.path !== 'media/hero.webp'); }), socialSiteDir: fxSiteWithIndex(page('<meta property="og:image" content="media/hero.webp">')) },
    'a twitter card image that is not rights-verified': { inventory: inv((i) => { i.assets[0].rights.status = 'unverified'; }), socialSiteDir: fxSiteWithIndex(page('<meta name="twitter:image" content="media/hero.webp">')) },
    'a JSON-LD image hosted elsewhere': { socialSiteDir: fxSiteWithIndex(page('<script type="application/ld+json">{"@type":"Restaurant","image":"https://cdn.elsewhere.com/a.jpg"}</script>')) },
    // ---- G6-3: dependency and supply-chain requirements (D-P6-5, D-P6-7, RG-10, RG-11)
    'no supply-chain verification': { supplyHistory: { records: [] } },
    'a supply-chain verification for another lockfile': { supplyHistory: sup((r) => { r.lockfileSha256 = OTHER; }) },
    'a supply-chain verification from a sandbox run': { supplyHistory: sup((r) => { r.runner = { kind: 'sandbox', description: 'INVENTED: a run with no network at all' }; r.signatures = { total: 3, verified: 0, failed: 0, missing: 3 }; }) },
    'an old supply-chain verification': { supplyHistory: sup((r) => { r.date = '2026-08-01'; }) },
    'a high advisory': { supplyHistory: withAdvisory(advisory({ severity: 'high' })), deps: depsWith(exc({ severity: 'high' })) },
    'a critical advisory': { supplyHistory: withAdvisory(advisory({ severity: 'critical' })) },
    'a moderate advisory with no exception': { supplyHistory: withAdvisory(advisory()) },
    'a moderate advisory whose exception expired': { supplyHistory: withAdvisory(advisory()), deps: depsWith(exc({ expires: '2026-10-01' })) },
    'an exception without a plan': { supplyHistory: withAdvisory(advisory()), deps: depsWith(exc({ plan: 'hope' })) },
    'an exception that runs for more than 90 days': { supplyHistory: withAdvisory(advisory()), deps: depsWith(exc({ reviewed: '2026-10-01', expires: '2027-06-01' })) },
    'an exception written as a bare package name': { supplyHistory: withAdvisory(advisory()), deps: depsWith('left-pad') },
    'a supply-chain record whose advisory count does not add up': { supplyHistory: sup((r) => { r.audit.total = 2; }) },
    'registry signatures that failed': { supplyHistory: sup((r) => { r.signatures = { total: 3, verified: 2, failed: 1, missing: 0 }; }) },
    'registry signatures that cover fewer packages than the lockfile': { supplyHistory: sup((r) => { r.signatures = { total: 2, verified: 2, failed: 0, missing: 0 }; }) },
    'an SBOM digest different from the one the build regenerates': { supplyHistory: sup((r) => { r.sbomSha256 = OTHER; }) },
    'an SBOM that records a library with no licence': { sbomProblems: ['left-pad@1.0.0: no licence recorded'] },
    'a dependency policy violation (a loose version range)': { dependencyPolicyProblems: ['devDependency x is "^1.0.0": pin an exact version'] },
    'a workflow on an unsupported Node': { runtimeProblems: ['a job still on Node 22 is refused'] },
    // ---- G6-3: authenticity (D-G62-2, RG-14): the real verifier is a hard stop
    'authenticated authorisation and provenance (not implemented)': { authenticityVerifier: undefined },
    // ---- search, domain and configuration
    'a staging domain (pages.dev)': { client: cfg((c) => { c.seo.baseUrl = 'https://jade.pages.dev'; }) },
    'an example domain': { client: cfg((c) => { c.seo.baseUrl = 'https://jade.example.test'; }) },
    'a vercel.app preview domain': { client: cfg((c) => { c.seo.baseUrl = 'https://jade.vercel.app'; }) },
    'a production host the approval does not name (baseUrl changed after approval)': { client: cfg((c) => { c.seo.baseUrl = 'https://www.changed-after-approval.com'; }) },
    'no hosting target declared': { client: cfg((c) => { delete c.seo.host; }) },
    'a crawler policy that was never decided': { client: cfg((c) => { delete c.seo.crawlers; }) },
    'a crawler policy missing the AI search decision': { client: cfg((c) => { delete c.seo.crawlers.aiSearch; }) },
    'llms.txt, robots.txt or sitemap.xml missing from the build': { siteHasSearchFiles: false },
    'crawler identities that no person has re-read against the providers': { crawlerRecord: { ...G().crawlerRecord, confirmedByPerson: false } },
    'a crawler review older than its age limit': { today: '2027-06-01' },
    'no crawler verification record': { crawlerRecord: null },
    'indexing on without structured data': { client: cfg((c) => { c.seo.structuredData = false; }) },
  }),
  // things that must NOT block: the gate reads closed fields, not prose, and history is history
  allowed: () => ({
    'the word REJECTED in the rationale of an approved record': { approvalRecords: editType('release-approval', (r) => { r.rationale = 'The owner did NOT reject this release and has not revoked the approval (the words REJECTED and REVOKED are only prose).'; }) },
    'a revoked-looking type text in a rationale of the rights verification': { approvalRecords: editType('rights-verification', (r) => { r.rationale = 'NOT verified is what an earlier draft said; this record is the verification (prose only).'; }) },
    'an old approval for another candidate kept as history': { approvalRecords: plus(rec('release-approval', { status: 'rejected', decidedAt: '2026-09-01T10:00:00Z' }, { n: 2, candidate: OTHER })) },
    'a rejected record for another channel kept as history': { approvalRecords: plus(rec('release-approval', { status: 'rejected', decidedAt: '2026-09-01T10:00:00Z' }, { n: 2, channel: 'demonstration' })) },
    'a revoked approval followed by a NEW approval record': { approvalRecords: plus(rec('release-approval', { status: 'revoked', ends: 'REL-JE-001', decidedAt: '2026-10-11T12:00:00Z' }, { n: 2 }), rec('release-approval', { decidedAt: '2026-10-11T13:00:00Z' }, { n: 3 })) },
    'a rejection that an authorised reviewer superseded, then approved again': { approvalRecords: plus(rec('release-approval', { status: 'rejected', decidedAt: '2026-10-11T11:00:00Z' }, { n: 2 }), rec('release-approval', { status: 'superseded', ends: 'REL-JE-002', decidedAt: '2026-10-11T12:00:00Z' }, { n: 3 })) },
    'two valid approvals of the same release by two reviewers': { approvalRecords: plus(rec('release-approval', { decidedBy: { reviewer: 'R-01', name: 'Fixture Owner' }, decidedAt: '2026-10-11T12:00:00Z' }, { n: 2 })) },
    'an unauthorised POSITIVE record (not counted, harmless)': { approvalRecords: plus(rec('release-approval', { decidedBy: { reviewer: 'R-09', name: 'Nobody' } }, { n: 2 })) },
    'an unrelated deployment authorisation record': { deploymentRecords: [fxEntry(rec('deployment-authorisation', {}))] },
    'a printed mention accepted by name in the external-links review': (() => {
      const e = clone(fxSite().ext); e.destinations.push({ kind: 'mention', url: 'https://mentioned.jade-and-ember-fixture.com/', files: ['fonts/LICENSES.txt'], count: 1 });
      e.digest = (() => { const d = e.destinations.map((x) => [x.kind, x.url]).sort(); return require_digest(d); })();
      const h = fxExternalHistory(); h.records[0].registryDigest = e.digest; h.records[0].results.push({ url: 'https://mentioned.jade-and-ember-fixture.com/', kind: 'mention', class: 'inconclusive', finalUrl: null, finalStatus: null, chain: [], attempts: 2, detail: 'no DNS answer' });
      const recs = G().approvalRecords.map((x) => (x.record.type === 'external-links-review' ? { ...x, record: { ...clone(x.record), subject: { destinationsDigest: e.digest, verification: 'EXTV-1', opened: true, accepted: [{ url: 'https://mentioned.jade-and-ember-fixture.com/', reason: 'INVENTED: the owner opened it by hand' }] } } } : x));
      return { ext: e, externalHistory: h, approvalRecords: recs };
    })(),
    'a moderate advisory with a current, planned exception': { supplyHistory: withAdvisory(advisory()), deps: depsWith(exc()) },
    'a social image that is a delivered, inventoried, rights-verified file': { socialSiteDir: fxSiteWithIndex(page('<meta property="og:image" content="media/hero.webp">')) },
    'a rejected external-links review for an older candidate kept as history': { approvalRecords: plus(rec('external-links-review', { status: 'rejected', decidedAt: '2026-09-01T10:00:00Z' }, { n: 2, candidate: OTHER })) },
    'a rights verification superseded by a new one that covers the same media': { approvalRecords: plus(rec('rights-verification', { status: 'superseded', ends: 'RIGHTS-JE-001', decidedAt: '2026-10-11T12:00:00Z' }, { n: 2 }), rec('rights-verification', { decidedAt: '2026-10-11T13:00:00Z' }, { n: 3 })), inventory: inv((i) => { for (const a of i.assets) if (a.rights.approval) a.rights.approval = 'RIGHTS-JE-003'; }) },
    'a CI summary with a seal different from the local record (they are different runs)': { evidence: mutateEv('ci-run', (r) => { r.verification.seal = 'e'.repeat(64); }) },
    'the HEAD commit differing from every recorded commit (records are bound to the artifact, not to HEAD)': { git: { ...G().git, commit: 'a'.repeat(40), tree: 'f'.repeat(40) } },
  }),
  demonstrationBlocked: () => ({
    'client-style content labelled as a demonstration (its configuration is not registered)': { demonstrations: { schema: 'jade-and-ember/demonstrations@1', registered: [] } },
    'a registry entry for a different configuration': { demonstrations: { schema: 'jade-and-ember/demonstrations@1', registered: [{ id: 'DEMO-JE-001', configurationDigest: OTHER, registeredBy: 'APR-JE-039', description: 'INVENTED FIXTURE: another configuration.' }] } },
    'a malformed demonstration registry': { demonstrations: { schema: 'jade-and-ember/demonstrations@1', registered: [{ id: 'demo', configurationDigest: 'x' }] } },
    'a demonstration that declares a production domain': { client: (() => { const c = greenClientContext().client; c.flags.demo = true; c.seo.noindex = true; c.seo.baseUrl = `https://${FX_HOST}`; return c; })() },
    'an indexable demonstration (demo flag on, noindex off)': { client: (() => { const c = greenClientContext().client; c.flags.demo = true; c.seo.noindex = false; return c; })() },
    'a demonstration with a stale recorded asset manifest': { assetsManifestMatches: false },
    'a demonstration whose verification record is for another candidate': { verify: fxVerify({}, { candidate: OTHER }) },
    'a demonstration whose verification record was made by other code': { verify: (() => { const v = fxVerify(); v.engineDigest = 'a'.repeat(64); return reseal(v); })() },
  }),
};
void FIXTURE_CANDIDATE; void FIXTURE_ENGINE; void FX_CONFIG;
