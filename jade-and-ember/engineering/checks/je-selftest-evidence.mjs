// check:selftest-evidence (Gate 5 Phase 2, APR-JE-030). The evidence validator, the scaffolding command, the generated procedures and the viewport check
// are shown to REJECT every way of getting human-testing evidence wrong: incomplete, fabricated, mismatched, wrongly classified, unbound, unverifiable.
// Every case starts from an invented, complete, valid record (lib/evidence-fixtures.mjs: nothing here is evidence of anything) and breaks one thing.
// (The gate's own single-defect matrix, which now includes evidence cases, is in check:release.)
import { coreDir } from '../lib/project.mjs';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { assessEvidence, coverage, loadSpec, scaffold, validateRecord } from '../lib/evidence.mjs';
import { renderAll } from '../lib/evidence-docs.mjs';
import { FIXTURE_COMMIT, FIXTURE_TREE, fixtureEvidenceSet, fixtureRecord, fixtureVctx } from '../lib/evidence-fixtures.mjs';
import { assembleCandidate } from '../lib/site.mjs';
import { viewportProblems } from './evidence.mjs';
import { engDir, isMain, projectDir } from '../lib/git.mjs';

const spec = loadSpec();
// problems for a record of `target` after `mutate(record, files)`; vover replaces parts of the context
const run = (target, mutate = () => {}, vover = {}) => { const { record, files } = fixtureRecord(target); mutate(record, files); return validateRecord(record, fixtureVctx(files, vover)).problems; };
const page = (r, p = 'index.html') => r.results.pages[p];
const SESSION_FIRST = (r) => Object.values(r.results.session)[0];
const sr = 'sr-nvda-firefox';

const cases = [
  // ---- the control: complete records are accepted
  ...Object.keys(spec.targets).map((t) => [`accepted: a complete invented ${t} record`, () => run(t), null]),
  ['accepted: a test that failed, with its finding, is a valid record (it just does not count)', () => run('iphone-safari', (r) => { page(r).loads.outcome = 'fail'; r.conclusion = 'failure'; r.findings.push({ id: 'DEV-1', page: 'index.html', severity: 'Minor', description: 'the page did not finish loading', status: 'open' }); }), null],
  ['accepted: a not-applicable answer with a reason where the item allows it', () => run('iphone-safari', (r) => { r.results.session['low-power-data'] = { outcome: 'not-applicable', note: 'Low Power Mode is not available on this model.' }; }), null],

  // ---- incomplete / template
  ['an unfilled template', () => run('iphone-safari', (r) => { r.status = 'template'; }), /unfilled template/],
  ['a status that is neither template nor completed', () => run('iphone-safari', (r) => { r.status = 'draft'; }), /status must be/],
  ['an outcome left empty', () => run('iphone-safari', (r) => { page(r, 'menu.html').links.outcome = null; }), /incomplete: menu.html links has no outcome/],
  ['an outcome that is not pass, fail or not-applicable', () => run('iphone-safari', (r) => { page(r).loads.outcome = 'maybe'; }), /outcome "maybe"/],
  ['a session answer left empty', () => run('android-chrome', (r) => { SESSION_FIRST(r).outcome = ''; }), /incomplete: session/],
  ['a whole page missing', () => run('iphone-safari', (r) => { delete r.results.pages['visit-us.html']; }), /no results for page visit-us.html/],
  ['a checklist item missing for a page', () => run('desktop-chrome', (r) => { delete page(r, 'our-story.html')['tab-reaches-all']; }), /our-story.html tab-reaches-all has no outcome/],
  ['an answer for an item that does not exist', () => run('iphone-safari', (r) => { page(r)['made-up-item'] = { outcome: 'pass', note: '' }; }), /not an item of iphone-safari/],
  ['not-applicable on an item that does not allow it', () => run('iphone-safari', (r) => { page(r).loads = { outcome: 'not-applicable', note: 'did not feel like testing this' }; }), /cannot be marked not-applicable/],
  ['not-applicable without a real reason', () => run('iphone-safari', (r) => { r.results.session['low-power-data'] = { outcome: 'not-applicable', note: 'n/a' }; }), /needs a note of at least 15/],
  ['a required note left empty (what the hero showed)', () => run('iphone-safari', (r) => { r.results.session['poster-or-clip'].note = ''; }), /a note is required/],
  ['a conclusion that is empty', () => run('iphone-safari', (r) => { r.conclusion = null; }), /conclusion must be/],
  ['a partial conclusion', () => run('iphone-safari', (r) => { r.conclusion = 'partial'; }), /conclusion must be/],
  ['a success claimed although a result failed', () => run('iphone-safari', (r) => { page(r).loads.outcome = 'fail'; r.findings.push({ id: 'X-1', page: 'index.html', severity: 'Minor', description: 'it did not load', status: 'open' }); }), /contradicts the outcomes/],
  ['a failure with no finding recorded for that page', () => run('iphone-safari', (r) => { page(r, 'menu.html').links.outcome = 'fail'; r.conclusion = 'failure'; }), /no finding is recorded for menu.html/],
  ['a finding with an unknown severity', () => run('iphone-safari', (r) => { r.findings.push({ id: 'X-1', page: 'index.html', severity: 'Whatever', description: 'something looked wrong', status: 'open' }); }), /severity must be/],
  ['a finding for a page that does not exist', () => run('iphone-safari', (r) => { r.findings.push({ id: 'X-1', page: 'about.html', severity: 'Minor', description: 'something looked wrong', status: 'open' }); }), /page must be one of/],
  ['a finding with no description', () => run('iphone-safari', (r) => { r.findings.push({ id: 'X-1', page: 'index.html', severity: 'Minor', description: 'bad', status: 'open' }); }), /describe what you saw/],

  // ---- classification (E1 / E2 / E3)
  ['E2 claimed for a physical-device target', () => run('iphone-safari', (r) => { r.class = 'E2'; }), /class E2 is wrong for target iphone-safari/],
  ['E1 (emulation) claimed for a physical device', () => run('iphone-safari', (r) => { r.class = 'E1'; }), /class E1 \(Browser emulation\) can never back a "real-device"/],
  ['E3 claimed for a desktop browser target', () => run('desktop-chrome', (r) => { r.class = 'E3'; }), /class E3 is wrong for target desktop-chrome/],
  ['no class at all', () => run('iphone-safari', (r) => { delete r.class; }), /class must be E1, E2 or E3/],
  ['an E2 class on a TalkBack (physical-device) record', () => run('sr-talkback-android-chrome', (r) => { r.class = 'E2'; }), /class E2 is wrong for target sr-talkback/],
  ['an E2 class on an iOS VoiceOver record', () => run('sr-voiceover-ios-safari', (r) => { r.class = 'E2'; }), /class E2 is wrong for target/],
  ['an E3 class on an NVDA (desktop) record', () => run(sr, (r) => { r.class = 'E3'; }), /class E3 is wrong for target/],
  ['a record type that does not match its target', () => run('iphone-safari', (r) => { r.type = 'screen-reader'; }), /does not match target iphone-safari/],
  ['an unknown target', () => run('iphone-safari', (r) => { r.target = 'iphone-chrome'; }), /not one of/],
  ['the device marked as emulated', () => run('iphone-safari', (r) => { r.environment.device.emulated = true; }), /emulated must be the boolean false/],
  ['the emulated flag left out', () => run('iphone-safari', (r) => { delete r.environment.device.emulated; }), /emulated must be the boolean false/],
  ['an iOS Simulator named in the settings', () => run('iphone-safari', (r) => { r.environment.settings = 'iOS Simulator in Xcode'; }, { }), /mentions emulation, simulation/],
  ['a device farm named as the device', () => run('iphone-safari', (r) => { r.environment.device.model = 'iPhone 15 on BrowserStack'; }), /mentions emulation, simulation/],
  ['DevTools device mode named as the browser setup', () => run('android-chrome', (r) => { r.environment.settings = 'Chrome DevTools responsive design mode'; }), /mentions emulation, simulation/],
  ['a headless browser named', () => run('desktop-firefox', (r) => { r.environment.browser.name = 'Firefox'; r.environment.settings = 'headless'; }), /mentions emulation, simulation/],
  ['a Playwright run named', () => run('desktop-chrome', (r) => { r.build.package = 'Playwright run'; }), /mentions emulation, simulation/],
  ['a physical-device record with no model', () => run('iphone-safari', (r) => { r.environment.device.model = ''; }), /needs environment.device.make and model/],
  ['a phone target recorded on a desktop computer', () => run('iphone-safari', (r) => { r.environment.device.kind = 'desktop'; }), /device.kind "desktop" does not fit/],
  ['a desktop target recorded on a phone', () => run('desktop-chrome', (r) => { r.environment.device.kind = 'phone'; }), /device.kind "phone" does not fit/],

  // ---- mismatched environment
  ['an iPhone record naming Android', () => run('iphone-safari', (r) => { r.environment.os.name = 'Android'; }), /os.name "Android" does not fit/],
  ['an iPhone record naming Chrome', () => run('iphone-safari', (r) => { r.environment.browser.name = 'Chrome'; }), /browser.name "Chrome" does not fit/],
  ['an Android record naming Safari', () => run('android-chrome', (r) => { r.environment.browser.name = 'Safari'; }), /browser.name "Safari" does not fit/],
  ['desktop Safari recorded on Windows', () => run('desktop-safari', (r) => { r.environment.os.name = 'Windows'; }), /os.name "Windows" does not fit/],
  ['an NVDA record on macOS', () => run(sr, (r) => { r.environment.os.name = 'macOS'; }), /os.name "macOS" does not fit/],
  ['an operating-system version that is not a version', () => run('iphone-safari', (r) => { r.environment.os.version = 'latest'; }), /os.version must be a version number/],
  ['a browser version that is not a version', () => run('iphone-safari', (r) => { r.environment.browser.version = 'latest'; }), /browser.version must be a version number/],
  ['a screen-reader record with no screen reader', () => run(sr, (r) => { r.environment.screenReader = null; }), /screenReader.name must be NVDA/],
  ['the wrong screen reader for the target', () => run(sr, (r) => { r.environment.screenReader.name = 'VoiceOver'; }), /screenReader.name must be NVDA/],
  ['a screen-reader version that is not a version', () => run(sr, (r) => { r.environment.screenReader.version = 'recent'; }), /screenReader.version must be a version/],
  ['a screen reader named on a record that is not a screen-reader target', () => run('iphone-safari', (r) => { r.environment.screenReader = { name: 'VoiceOver', version: '17' }; }), /screenReader must be null/],

  // ---- the person
  ['no tester name', () => run('iphone-safari', (r) => { r.tester.name = ''; }), /tester.name must name the person/],
  ['a tester that is an AI assistant', () => run('iphone-safari', (r) => { r.tester.name = 'Claude'; r.attestation.signedBy = 'Claude'; }), /does not look like a person/],
  ['a tester that is a test tool', () => run('iphone-safari', (r) => { r.tester.name = 'Playwright runner'; r.attestation.signedBy = 'Playwright runner'; }), /does not look like a person/],
  ['a placeholder tester', () => run('iphone-safari', (r) => { r.tester.name = 'TBD'; r.attestation.signedBy = 'TBD'; }), /tester.name must name|does not look like a person/],
  ['no tester role', () => run('iphone-safari', (r) => { r.tester.role = ''; }), /tester.role/],
  ['no signed statement', () => run('iphone-safari', (r) => { r.attestation.statement = ''; }), /attestation.statement must be exactly/],
  ['a statement that was reworded', () => run('iphone-safari', (r) => { r.attestation.statement = 'I tested this.'; }), /attestation.statement must be exactly/],
  ['signed by someone other than the tester', () => run('iphone-safari', (r) => { r.attestation.signedBy = 'Someone Else'; }), /signedBy must equal tester.name/],
  ['a signature dated before the test', () => run('iphone-safari', (r) => { r.attestation.date = '2026-10-01'; }), /attestation.date must not be before/],
  ['a signature dated in the future', () => run('iphone-safari', (r) => { r.attestation.date = '2027-01-01'; }), /attestation.date must not be before the test date or in the future/],

  // ---- binding to the build and the date
  ['a commit that does not exist', () => run('iphone-safari', (r) => { r.build.commit = 'd'.repeat(40); }), /is not a commit of this repository/],
  ['a commit that is not the release commit or an ancestor of it', () => run('iphone-safari', (r) => { r.build.commit = 'c'.repeat(40); }, { git: { ...fixtureVctx().git, isAncestor: () => false } }), /not the release commit or an earlier commit/],
  ['a commit that is not 40 hex', () => run('iphone-safari', (r) => { r.build.commit = 'abc123'; }), /40-hex commit/],
  ['evidence for different delivered bytes', () => run('iphone-safari', (r) => { r.build.assetsTree = 'e'.repeat(64); }), /different bytes/],
  ['no delivered-files hash', () => run('iphone-safari', (r) => { delete r.build.assetsTree; }), /assetsTree must be the 64-hex/],
  ['a release build whose delivered bytes are unknown', () => run('iphone-safari', () => {}, { assetsTree: '' }), /cannot be bound to it/],
  ['a test date in the future', () => run('iphone-safari', (r) => { r.date = '2027-01-01'; r.attestation.date = '2027-01-01'; }), /is in the future/],
  ['a test date before the commit it claims to test', () => run('iphone-safari', (r) => { r.date = '2026-09-01'; r.attestation.date = '2026-09-02'; }), /before the commit it claims to test/],
  ['a date that is not a real date', () => run('iphone-safari', (r) => { r.date = '2026-02-30'; }), /real YYYY-MM-DD date/],

  // ---- attachments
  ['too few attachments', () => run('iphone-safari', (r) => { r.attachments = r.attachments.slice(0, 1); }), /at least 3 attachments/],
  ['no attachments', () => run('desktop-chrome', (r) => { r.attachments = []; }), /at least 2 attachments/],
  ['an attachment whose file does not match its hash', () => run('iphone-safari', (r) => { r.attachments[0].sha256 = '1'.repeat(64); }), /does not match its recorded sha256/],
  ['an attachment whose file does not exist', () => run('iphone-safari', (r) => { r.attachments[0].path = 'not-there.png'; }), /file does not exist/],
  ['an attachment path that escapes the evidence folder', () => run('iphone-safari', (r) => { r.attachments[0].path = '../../secret.png'; }), /stay inside/],
  ['an absolute attachment path', () => run('iphone-safari', (r) => { r.attachments[0].path = '/etc/passwd'; }), /stay inside/],
  ['an attachment of a kind the target does not accept', () => run('iphone-safari', (r) => { r.attachments[0].kind = 'spreadsheet'; }), /kind must be/],
  ['the same file attached twice', () => run('iphone-safari', (r) => { r.attachments[1] = { ...r.attachments[0] }; }), /attached twice/],
  ['an attachment URL that is not https', () => run('iphone-safari', (r) => { r.attachments[2] = { kind: 'screenshot', description: 'a screenshot', url: 'http://example.com/a.png', sha256: '2'.repeat(64) }; }), /url must be https/],
  ['only remote attachments (nothing verifiable)', () => run('iphone-safari', (r) => { r.attachments = r.attachments.map((a, i) => ({ kind: 'screenshot', description: 'a screenshot', url: `https://example.com/${i}.png`, sha256: String(i + 3).repeat(64) })); }), /at least 1 attachment must be a local file/],
  ['an attachment with neither a path nor a URL', () => run('iphone-safari', (r) => { delete r.attachments[0].path; }), /exactly one of path or url/],

  // ---- the CI record
  ['a CI run offered as a human class (E2)', () => run('ci-run', (r) => { r.class = 'E2'; }), /class E2 is wrong for target ci-run/],
  ['a CI run on a commit that is not the release commit or an ancestor', () => run('ci-run', (r) => { r.build.commit = 'c'.repeat(40); }, { git: { ...fixtureVctx().git, isAncestor: () => false } }), /not the release commit or an earlier commit/],
  ['a CI run for another candidate artifact (G6-2: the binding is the digest, not HEAD)', () => run('ci-run', (r) => { r.build.candidate = '1'.repeat(64); r.verification.candidate = '1'.repeat(64); }), /build\.candidate differs/],
  ['a CI run whose summary names another candidate', () => run('ci-run', (r) => { r.verification.candidate = '1'.repeat(64); }), /verification\.candidate must equal build\.candidate/],
  ['a CI run made by other verification code', () => run('ci-run', (r) => { r.verification.engineDigest = '1'.repeat(64); }), /verification\.engineDigest is not the digest of this verification code/],
  ['a CI run of another set of checks', () => run('ci-run', (r) => { r.verification.registryDigest = '1'.repeat(64); }), /verification\.registryDigest/],
  ['a CI run that reports fewer checks than the verifier defines', () => run('ci-run', (r) => { r.verification.checks = { total: 12, passed: 12 }; }), /all 40 checks passed/],
  ['a CI run with a failing check', () => run('ci-run', (r) => { r.verification.checks.passed = 39; }), /all 40 checks passed/],
  ['a CI "run" on a person\'s machine', () => run('ci-run', (r) => { r.verification.runner = 'local'; }), /must be "github-actions"/],
  ['a CI run id that is not the URL\'s run', () => run('ci-run', (r) => { r.verification.runId = '999999'; }), /does not match the run URL/],
  ['a CI run with no run id', () => run('ci-run', (r) => { r.verification.runId = ''; }), /numeric GitHub Actions run id/],
  ['a CI run with a malformed seal', () => run('ci-run', (r) => { r.verification.seal = 'abc'; }), /verification\.seal/],
  ['a CI run with no verification summary at all', () => run('ci-run', (r) => { delete r.verification; }), /verification\.candidate must equal build\.candidate/],
  ['a CI run when the release build has no verification expectation', () => run('ci-run', () => {}, { verification: null }), /no verification expectation/],
  ['evidence for another candidate artifact', () => run('iphone-safari', (r) => { r.build.candidate = '1'.repeat(64); }), /build\.candidate differs/],
  ['evidence with no candidate digest', () => run('iphone-safari', (r) => { delete r.build.candidate; }), /build\.candidate must be the 64-hex/],
  ['a release build whose candidate digest is unknown', () => run('iphone-safari', () => {}, { candidate: '' }), /candidate artifact digest is unknown/],
  ['a CI run that did not succeed', () => run('ci-run', (r) => { r.conclusion = 'failure'; }), /conclusion must be "success"/],
  ['a CI run with no run URL', () => run('ci-run', (r) => { r.url = 'https://example.com/run/1'; }), /GitHub Actions run URL/],
  ['a CI run with no summary', () => run('ci-run', (r) => { r.summary = 'ok'; }), /summary must say/],
  ['a real-device record that claims to be a CI run (E1 as a device)', () => run('iphone-safari', (r) => { r.type = 'ci-run'; r.target = 'ci-run'; r.class = 'E1'; }), /./],
];

// ---- cases that need more than the validator
const more = [];
const add = (name, fn, expect) => more.push([name, fn, expect]);
add('an open Blocker finding stops a record from counting (it stays well-formed)', () => { const { record, files } = fixtureRecord('iphone-safari'); record.findings.push({ id: 'B-1', page: 'index.html', severity: 'Blocker', description: 'the page cannot be read at all', status: 'open' }); const v = validateRecord(record, fixtureVctx(files)); return v.problems.length ? v.problems : (v.success ? [] : ['not counted']); }, /not counted/);
add('an open Major finding stops a record from counting', () => { const { record, files } = fixtureRecord('desktop-safari'); record.findings.push({ id: 'M-1', page: 'visit-us.html', severity: 'Major', description: 'the hours cannot be read', status: 'open' }); const v = validateRecord(record, fixtureVctx(files)); return v.success ? [] : ['not counted']; }, /not counted/);
add('a Minor open finding does not stop a record from counting', () => { const { record, files } = fixtureRecord('desktop-safari'); record.findings.push({ id: 'm-1', page: 'visit-us.html', severity: 'Minor', description: 'a small spacing oddity', status: 'open' }); const v = validateRecord(record, fixtureVctx(files)); return v.success ? [] : ['not counted']; }, null);
add('a failed test is well-formed but does not count', () => { const { record, files } = fixtureRecord('iphone-safari'); page(record).loads.outcome = 'fail'; record.conclusion = 'failure'; record.findings.push({ id: 'F-1', page: 'index.html', severity: 'Minor', description: 'the page did not load', status: 'open' }); const v = validateRecord(record, fixtureVctx(files)); return v.problems.length ? v.problems : (v.success ? [] : ['not counted']); }, /not counted/);
add('a fixture tester name is refused when fixtures are not allowed, and accepted only by the tests', () => { const { record, files } = fixtureRecord('iphone-safari'); record.tester.name = 'SELFTEST FIXTURE'; record.attestation.signedBy = 'SELFTEST FIXTURE'; const a = validateRecord(record, fixtureVctx(files)).problems, b = validateRecord(record, fixtureVctx(files, { allowFixture: true })).problems; return a.length && !b.length ? ['refused, and accepted only with allowFixture'] : []; }, /refused/);
add('one attachment reused across two records is rejected', () => { const a = fixtureRecord('iphone-safari'), b = fixtureRecord('android-chrome'); b.record.attachments[0] = { ...a.record.attachments[0] }; const files = new Map([...a.files, ...b.files]); const out = assessEvidence([{ file: 'a.json', record: a.record }, { file: 'b.json', record: b.record }], fixtureVctx(files)); return out.flatMap((e) => e.problems); }, /reused from a.json|does not match its recorded sha256/);
add('an unreadable evidence file never counts', () => assessEvidence([{ file: 'x.json', record: null, parseError: 'not valid JSON' }], fixtureVctx()).flatMap((e) => e.problems), /not valid JSON/);
add('the gate is unmet when one of the needed targets is missing (each in turn)', () => {
  const { entries, files } = fixtureEvidenceSet(); const vctx = fixtureVctx(files); const out = [];
  for (const [g, d] of Object.entries(spec.gate)) for (const n of d.needs) { const rest = assessEvidence(entries.filter((e) => !n.targets.includes(e.record.target)), vctx); if (coverage(spec, g, rest).ok) out.push(`${g} is met without ${n.label}`); }
  return out;
}, null);
add('the gate is met by the complete set', () => { const { entries, files } = fixtureEvidenceSet(); const a = assessEvidence(entries, fixtureVctx(files)); return Object.keys(spec.gate).filter((g) => !coverage(spec, g, a).ok).map((g) => `${g} unmet`); }, null);
add('human evidence cannot be satisfied by an E1 record: a CI run does not cover the device requirement', () => { const { entries, files } = fixtureEvidenceSet(['ci-run']); const a = assessEvidence(entries, fixtureVctx(files)); return coverage(spec, 'real-device', a).ok || coverage(spec, 'screen-reader', a).ok || coverage(spec, 'browser-matrix', a).ok ? ['an E1 record satisfied a human requirement'] : ['not satisfied']; }, /not satisfied/);
add('desktop evidence (E2) does not satisfy the physical-device requirement (E3)', () => { const { entries, files } = fixtureEvidenceSet(['desktop-chrome', 'desktop-firefox', 'desktop-safari']); const a = assessEvidence(entries, fixtureVctx(files)); return coverage(spec, 'real-device', a).ok ? ['E2 satisfied E3'] : ['not satisfied']; }, /not satisfied/);
add('the scaffold of every target is unfilled: no outcome, no signature, status template', () => Object.keys(spec.targets).flatMap((t) => { const j = JSON.stringify(scaffold(spec, t, { commit: FIXTURE_COMMIT, assetsTree: FIXTURE_TREE })); return /"outcome":"(pass|fail|not-applicable)"|"conclusion":"(success|failure)"|"signedBy":"[^"]/.test(j) || !/"status":"template"/.test(j) ? [`${t} was pre-filled`] : []; }), null);
add('the specification names a class that is not E1, E2 or E3', () => { const s = JSON.parse(JSON.stringify(spec)); s.targets['iphone-safari'].classes = ['E4']; return validateRecord(fixtureRecord('iphone-safari').record, fixtureVctx(new Map(), { spec: s })).problems; }, /./);

// ---- the scaffolding command (a real process, a temporary folder, no build needed: commit and tree are given)
const tool = join(coreDir, 'tools', 'evidence.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'evidence-selftest-'));
const cli = (...a) => spawnSync(process.execPath, [tool, ...a], { cwd: projectDir, encoding: 'utf8' });
add('evidence:new writes an unfilled template and refuses to overwrite one', () => {
  const a = cli('new', 'iphone-safari', '--dir', tmp, '--commit', FIXTURE_COMMIT, '--tree', FIXTURE_TREE), b = cli('new', 'iphone-safari', '--dir', tmp, '--commit', FIXTURE_COMMIT, '--tree', FIXTURE_TREE);
  const files = readdirSync(tmp);
  if (a.status !== 0 || b.status !== 0 || files.length !== 2) return [`two runs wrote ${files.length} file(s) (exit ${a.status}, ${b.status})`];
  const rec = JSON.parse(readFileSync(join(tmp, files[0]), 'utf8'));
  return rec.status === 'template' && rec.conclusion === null && rec.attestation.signedBy === '' && JSON.stringify(rec.results).indexOf('"pass"') < 0 ? ['the template is unfilled and a second run kept the first'] : ['the scaffold was filled in'];
}, /unfilled and a second run kept/);
add('evidence:new refuses an unknown target', () => { const r = cli('new', 'iphone-chrome', '--dir', tmp); return r.status === 2 ? ['refused'] : [`exit ${r.status}`]; }, /refused/);
add('evidence:validate rejects an unfilled template', () => { const f = readdirSync(tmp)[0]; const r = cli('validate', join(tmp, f), '--release-commit', FIXTURE_COMMIT); return r.status === 1 && /unfilled template/.test(r.stderr) ? ['rejected'] : [`exit ${r.status}: ${r.stderr.slice(0, 80)}`]; }, /rejected/);
add('evidence:hash prints the SHA-256 of a file', () => { writeFileSync(join(tmp, 'x.txt'), 'abc'); const r = cli('hash', join(tmp, 'x.txt')); return r.stdout.startsWith('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad') ? ['hashed'] : [r.stdout]; }, /hashed/);

// ---- the generated procedures cannot drift
add('a change to the specification changes the generated procedure (so a stale document is detected)', () => { const s = JSON.parse(JSON.stringify(spec)); s.sections['page-basics'].items[0].text = 'CHANGED TEXT'; return renderAll(s)['iphone-safari.md'] !== renderAll(spec)['iphone-safari.md'] ? ['differs'] : []; }, /differs/);
add('every procedure states its class and that emulation does not count', () => Object.keys(spec.targets).filter((t) => spec.targets[t].gateType !== 'ci-run').flatMap((t) => { const d = renderAll(spec)[`${t}.md`]; return new RegExp(`Evidence class ${spec.targets[t].classes.join(' or ')}`).test(d) && /(not|never) /.test(d) && /Emulat|emulat/.test(d) ? [] : [`${t}: the class or the emulation rule is missing`]; }), null);

// ---- the automated viewport check
const siteWith = (viewport) => { const d = assembleCandidate(projectDir, 'viewport-selftest'); const p = join(d, 'index.html'); const t = readFileSync(p, 'utf8'); writeFileSync(p, t.replace(/<meta name="viewport"[^>]*>/, viewport)); return d; };
for (const [name, tag, expect] of [
  ['a viewport tag that disables zoom (user-scalable=no)', '<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">', /disables zoom/],
  ['a viewport tag that disables zoom (user-scalable=0)', '<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=0">', /disables zoom/],
  ['a viewport tag that limits zoom (maximum-scale=1)', '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">', /limits zoom/],
  ['a page with no viewport tag', '', /no viewport meta tag/],
  ['a viewport tag that leaves zoom alone', '<meta name="viewport" content="width=device-width,initial-scale=1">', null],
]) add(`viewport: ${name}`, () => { const d = siteWith(tag); try { return viewportProblems(d); } finally { rmSync(d, { recursive: true, force: true }); } }, expect);

export async function checkSelftestEvidence() {
  const problems = [], notes = [];
  const t0 = Date.now();
  let accepted = 0, caught = 0;
  try {
    for (const [name, run0, expect] of [...cases, ...more]) {
      let r;
      try { r = await run0(); } catch (e) { r = [`check crashed: ${e.message}`]; }
      if (expect === null) { if (r.length) problems.push(`${name}: ${r[0].slice(0, 200)}`); else accepted++; }
      else if (!r.length) problems.push(`${name}: nothing was reported; the defect went undetected`);
      else if (!expect.test(r.join('\n'))) problems.push(`${name}: reported something else (${r[0].slice(0, 160)}), expected ${expect}`);
      else caught++;
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  notes.push(`${caught} ways of getting evidence wrong are rejected, each for the right reason; ${accepted} correct cases are accepted (${cases.length + more.length} cases, ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  return { problems, notes };
}

if (isMain(import.meta.url)) {
  const { problems, notes } = await checkSelftestEvidence();
  notes.forEach((n) => console.log('  ' + n));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:selftest-evidence`);
  process.exit(problems.length ? 1 : 0);
}
void cpSync; void mkdirSync;
