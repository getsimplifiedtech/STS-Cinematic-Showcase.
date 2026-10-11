// The scenarios of the release readiness dry run (Gate 5 Phase 7, APR-JE-035). Each one damages the fully green synthetic client build in exactly
// one way and runs the REAL release tool (`gate`, `prepare`) in the sandbox. The expectation is written down first:
//   mustFail   requirement ids that have to report FAIL, each with a message that says what is wrong
//   mayFail    requirement ids that legitimately fail as a consequence (a modified file is also a dirty tree, for example)
//   anything else failing is reported as collateral, anything missing from mustFail as a requirement that did NOT block
// A "probe" does not assert; it records what the gate does with something it should arguably refuse, so that a gap is a measured fact.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cpSync } from 'node:fs';
import { createSandbox, SYNTH, TODAY } from './release-dryrun.mjs';
import { verifyPackage } from './release-package.mjs';
import { buildManifest } from './hashed.mjs';
import { unzipTo, zipBuffer } from './zip.mjs';
import { listFiles, tempDir } from './git.mjs';
import { isReservedHost } from '../../src/lib/seo.mjs';
import { assembleCandidate } from './site.mjs';
import { loadReleasePolicy } from './release.mjs';
import { loadPolicy as loadSecurityPolicy, renderHeadersFile } from './security.mjs';
import { createHash } from 'node:crypto';

const sha = (b) => createHash('sha256').update(b).digest('hex');
const ROW = { REL: 'REL-JE-901', RIGHTS: 'RIGHTS-JE-901', SRCH: 'SRCH-JE-901', DEP: 'DEP-JE-901' };
const edRow = (k, fn) => (sb) => sb.writeLedger(sb.readLedger().split('\n').map((l) => (l.startsWith(`| ${ROW[k]} |`) ? fn(l, sb) : l)).join('\n'));
const dropRow = (k) => (sb) => sb.writeLedger(sb.readLedger().split('\n').filter((l) => !l.startsWith(`| ${ROW[k]} |`)).join('\n'));
const dropApr = (id) => (sb) => sb.writeLedger(sb.readLedger().split('\n').filter((l) => !l.startsWith(`| ${id} |`)).join('\n'));
const client = (fn) => (sb) => sb.committed(() => sb.json('config/client.json', fn));
const base = (url) => client((o) => { o.seo.baseUrl = url; });
const evKey = (sb, id) => [...sb.records.get(id).files.keys()][0];

// ---- single-defect scenarios against `gate` -------------------------------------------------------------------------------------------------
export const GATE_SCENARIOS = [
  // approvals and the ledger
  { g: 'approvals', t: 'no release approval', apply: dropRow('REL'), mustFail: ['releaseApproval'], detail: /no release-approval record/ },
  { g: 'approvals', t: 'a release approval naming another commit', apply: edRow('REL', (l, sb) => l.replace(sb.head, 'b'.repeat(40))), mustFail: ['releaseApproval'] },
  { g: 'approvals', t: 'a release approval naming a shortened commit (7 hex)', apply: edRow('REL', (l, sb) => l.replace(sb.head, sb.head.slice(0, 7))), mustFail: ['releaseApproval'] },
  { g: 'approvals', t: 'a release approval for another version', apply: edRow('REL', (l) => l.replace('version: 1.0.0', 'version: 0.9.0')), mustFail: ['releaseApproval'] },
  { g: 'approvals', t: 'a release approval for the demonstration channel', apply: edRow('REL', (l) => l.replace('channel: client-production', 'channel: demonstration')), mustFail: ['releaseApproval'] },
  { g: 'approvals', t: 'a release approval row with a cell missing (5 cells)', apply: edRow('REL', (l) => l.replace(/ none \|$/, '')), mustFail: ['releaseApproval'] },
  { g: 'approvals', t: 'no rights verification', apply: dropRow('RIGHTS'), mustFail: ['rightsVerification'], detail: /rights-verification/ },
  { g: 'approvals', t: 'a rights verification that names no source', apply: edRow('RIGHTS', (l) => l.replace(' sources reviewed: none, nothing exists to review;', '')), mustFail: ['rightsVerification'] },
  { g: 'approvals', t: 'a rights verification with no date', apply: edRow('RIGHTS', (l) => l.replace(/\d{4}-\d{2}-\d{2}/g, 'today')), mustFail: ['rightsVerification'] },
  { g: 'approvals', t: 'a required gate approval (APR-JE-017) missing from the log', apply: dropApr('APR-JE-017'), mustFail: ['requiredApprovalsPresent'], detail: /APR-JE-017/ },
  { g: 'approvals', t: 'no search review', apply: dropRow('SRCH'), mustFail: ['searchReadiness'], detail: /search-review/ },
  { g: 'approvals', t: 'a search review for other search artifacts (digest altered)', apply: edRow('SRCH', (l) => l.replace(/([0-9a-f])(\s*\|[^|]*\|[^|]*\|)$/, (m, c, rest) => `${c === '0' ? '1' : '0'}${rest}`)), mustFail: ['searchReadiness'] },
  { g: 'approvals', t: 'a search review with no reviewer', apply: edRow('SRCH', (l) => l.replace('Reviewed by', 'Seen by')), mustFail: ['searchReadiness'] },
  { g: 'approvals', t: 'a search review that does not name the crawler policy', apply: edRow('SRCH', (l) => l.replace(', crawler policy', '')), mustFail: ['searchReadiness'] },
  { g: 'approvals', t: 'a search review that does not name the structured data', apply: edRow('SRCH', (l) => l.replace(', structured data', '')), mustFail: ['searchReadiness'] },
  // verification report, working tree and sign-off for different bytes
  { g: 'verification', t: 'no verification report', apply: (sb) => rmSync(join(sb.proj, 'engineering/.reports/verify.json')), mustFail: ['verifyPassed'], detail: /run npm run verify/ },
  { g: 'verification', t: 'a fast (partial) verification', apply: (sb) => sb.writeVerify({ mode: 'fast' }), mustFail: ['verifyPassed'] },
  { g: 'verification', t: 'a failed verification', apply: (sb) => sb.writeVerify({ passed: false }), mustFail: ['verifyPassed'] },
  { g: 'verification', t: 'a verification of another commit', apply: (sb) => sb.writeVerify({ commit: 'c'.repeat(40) }), mustFail: ['verifyPassed'] },
  { g: 'verification', t: 'a verification of different bytes (assets tree differs)', apply: (sb) => sb.writeVerify({ assetsTree: 'f'.repeat(64) }), mustFail: ['verifyPassed'] },
  { g: 'verification', t: 'a verification run on a dirty tree', apply: (sb) => sb.writeVerify({ dirty: true }), mustFail: ['verifyPassed'] },
  { g: 'verification', t: 'a corrupt verification report (not JSON)', apply: (sb) => writeFileSync(join(sb.proj, 'engineering/.reports/verify.json'), '{'), error: /./ },
  { g: 'tree', t: 'an untracked file in the working tree', apply: (sb) => writeFileSync(join(sb.proj, 'stray.txt'), 'x'), mustFail: ['cleanTree'], detail: /uncommitted/ },
  { g: 'tree', t: 'an uncommitted edit to a delivered file after testing', apply: (sb) => sb.edit('styles.css', (s) => `${s}\n/* edited after sign-off */\n`), mustFail: ['cleanTree', 'verifyPassed', 'evidence:real-device', 'evidence:screen-reader', 'evidence:browser-matrix'] },
  { g: 'tree', t: 'a committed edit to a delivered file after sign-off (nothing re-recorded)', apply: (sb) => sb.committedUnbound(() => sb.edit('styles.css', (s) => `${s}\n/* edited after sign-off */\n`)), mustFail: ['verifyPassed', 'releaseApproval', 'evidence:real-device', 'evidence:screen-reader', 'evidence:browser-matrix', 'evidence:ci-run'] },
  // version, findings and configuration (committed, with the synthetic records re-bound, so the single defect stays single)
  { g: 'configuration', t: 'an open Blocker finding', apply: (sb) => sb.committed(() => sb.json('engineering/findings.json', (o) => o.findings.push({ id: 'F-DRY-1', check: 'dry-run', key: 'dry-run:blocker', severity: 'Blocker', visual: false, status: 'open', description: 'synthetic' }))), mustFail: ['noBlockingFindings'], detail: /F-DRY-1/ },
  { g: 'configuration', t: 'an open Major finding', apply: (sb) => sb.committed(() => sb.json('engineering/findings.json', (o) => o.findings.push({ id: 'F-DRY-2', check: 'dry-run', key: 'dry-run:major', severity: 'Major', visual: false, status: 'open', description: 'synthetic' }))), mustFail: ['noBlockingFindings'] },
  { g: 'configuration', t: 'a finding with an unknown severity', apply: (sb) => sb.committed(() => sb.json('engineering/findings.json', (o) => o.findings.push({ id: 'F-DRY-3', check: 'dry-run', key: 'dry-run:sev', severity: 'Whatever', visual: false, status: 'open', description: 'synthetic' }))), mustFail: ['noBlockingFindings'], detail: /unknown severity/ },
  { g: 'configuration', t: 'a pre-release version (1.0.0-rc.1)', apply: (sb) => sb.committed(() => sb.setVersion('1.0.0-rc.1', 'client-production')), mustFail: ['stableVersion'], detail: /pre-release/ },
  { g: 'configuration', t: 'VERSION.json and package.json disagree', apply: (sb) => sb.committed(() => sb.json('package.json', (o) => { o.version = '1.0.1'; })), mustFail: ['versionConsistent'] },
  { g: 'configuration', t: 'a client configuration labelled as a demonstration', apply: (sb) => sb.committed(() => sb.setVersion('1.0.0', 'demonstration')), mustFail: ['versionConsistent', 'labelMatchesConfiguration'] },
  { g: 'configuration', t: 'the demonstration flag left on in an indexable build (the build itself refuses)', apply: (sb) => sb.committedUnbound(() => sb.json('config/client.json', (o) => { o.flags.demo = true; })), error: /must stay noindex|candidate build failed/, covers: ['noDemoText'] },
  { g: 'configuration', t: 'indexing switched off but structured data left on (the build itself refuses)', apply: (sb) => sb.committedUnbound(() => sb.json('config/client.json', (o) => { o.seo.noindex = true; })), error: /structuredData|candidate build failed/ },
  { g: 'configuration', t: 'indexing switched off (noindex true, no structured data)', apply: client((o) => { o.seo.noindex = true; o.seo.structuredData = false; }), mustFail: ['productionSeoComplete', 'searchReadiness'] },
  { g: 'configuration', t: 'structured data switched off', apply: client((o) => { o.seo.structuredData = false; }), mustFail: ['productionSeoComplete'], mayFail: ['searchReadiness'] },
  { g: 'configuration', t: 'a staging domain (pages.dev)', apply: base('https://jade-and-ember.pages.dev'), mustFail: ['productionDomain'], detail: /reserved|preview|staging/ },
  { g: 'configuration', t: 'a reserved example domain (.test)', apply: base('https://jade.example.test'), mustFail: ['productionDomain'] },
  { g: 'configuration', t: 'a staging label in the host name (staging.)', apply: base('https://staging.jade-and-ember-fixture.com'), mustFail: ['productionDomain'] },
  { g: 'configuration', t: 'a local address (https://localhost): the build refuses, or the gate does', apply: base('https://localhost'), mustFail: ['productionDomain'], error: /localhost|candidate build failed/, either: true },
  { g: 'configuration', t: 'an IP address (https://192.0.2.10): the build refuses, or the gate does', apply: base('https://192.0.2.10'), mustFail: ['productionDomain'], error: /candidate build failed|IP/, either: true },
  { g: 'configuration', t: 'the demonstration copy (sample address, phone, "fictional" wording) put back into an indexable build (the build itself refuses)', apply: (sb) => sb.committedUnbound(() => writeFileSync(join(sb.proj, 'config/copy.json'), sb.git('show', `${sb.parent}:jade-and-ember/config/copy.json`).stdout)), error: /demonstration text|marked sample|candidate build failed/ },
  { g: 'configuration', t: 'no hosting target declared (seo.host)', apply: client((o) => { delete o.seo.host; }), mustFail: ['searchReadiness'], detail: /seo\.host/ },
  { g: 'configuration', t: 'a crawler policy never decided (seo.crawlers)', apply: client((o) => { delete o.seo.crawlers; }), mustFail: ['searchReadiness'], detail: /crawlers/ },
  { g: 'configuration', t: 'a crawler policy missing the AI-search decision', apply: client((o) => { delete o.seo.crawlers.aiSearch; }), mustFail: ['searchReadiness'] },
  { g: 'configuration', t: 'crawler identities no person has re-read (confirmedByPerson false)', apply: (sb) => sb.committed(() => sb.json('engineering/search-crawler-verification.json', (o) => { o.confirmedByPerson = false; })), mustFail: ['searchReadiness'], detail: /re-read/ },
  { g: 'configuration', t: 'a crawler review older than its age limit', apply: (sb) => sb.committed(() => sb.json('engineering/search-crawler-verification.json', (o) => { o.verifiedOn = '2025-01-01'; for (const a of o.agents || []) a.verifiedOn = '2025-01-01'; })), mustFail: ['searchReadiness'], detail: /days old/ },
  { g: 'configuration', t: 'the crawler verification record deleted', apply: (sb) => sb.committedUnbound(() => rmSync(join(sb.proj, 'engineering/search-crawler-verification.json'))), error: /search-crawler-verification|ENOENT/ },
  { g: 'configuration', t: 'a configuration that does not build', apply: (sb) => sb.committedUnbound(() => sb.json('config/site.json', (o) => { delete o.pages; })), error: /candidate build failed|pages/ },
  // evidence: each record removed on its own, then each way of getting one wrong
  ...[['iphone-safari', 'real-device'], ['android-chrome', 'real-device'], ['sr-nvda-firefox', 'screen-reader'], ['sr-voiceover-macos-safari', 'screen-reader'], ['sr-talkback-android-chrome', 'screen-reader'], ['desktop-chrome', 'browser-matrix'], ['desktop-firefox', 'browser-matrix'], ['desktop-safari', 'browser-matrix'], ['ci-run', 'ci-run']]
    .map(([id, type]) => ({ g: 'evidence', t: `no ${id} record`, apply: (sb) => sb.dropRecord(id), mustFail: [`evidence:${type}`] })),
  { g: 'evidence', t: 'emulation offered as a physical device (E1 claimed as E3)', apply: (sb) => sb.editRecord('iphone-safari', (r) => { r.environment.device.emulated = true; }), mustFail: ['evidence:real-device'] },
  { g: 'evidence', t: 'a desktop record offered as a physical device (E2 claimed as E3)', apply: (sb) => sb.editRecord('iphone-safari', (r) => { r.class = 'E2'; }), mustFail: ['evidence:real-device'] },
  { g: 'evidence', t: 'a physical-device record for different bytes (assets tree differs)', apply: (sb) => sb.editRecord('android-chrome', (r) => { r.build.assetsTree = 'e'.repeat(64); }), mustFail: ['evidence:real-device'] },
  { g: 'evidence', t: 'a record for a commit that does not exist', apply: (sb) => sb.editRecord('iphone-safari', (r) => { r.build.commit = 'd'.repeat(40); }), mustFail: ['evidence:real-device'] },
  { g: 'evidence', t: 'an unfilled template', apply: (sb) => sb.editRecord('desktop-chrome', (r) => { r.status = 'template'; }), mustFail: ['evidence:browser-matrix'] },
  { g: 'evidence', t: 'an incomplete record (a result left empty)', apply: (sb) => sb.editRecord('sr-nvda-firefox', (r) => { r.results.pages['visit-us.html']['sr-headings'].outcome = null; }), mustFail: ['evidence:screen-reader'] },
  { g: 'evidence', t: 'a record signed by no one', apply: (sb) => sb.editRecord('sr-voiceover-macos-safari', (r) => { r.attestation.signedBy = ''; }), mustFail: ['evidence:screen-reader'] },
  { g: 'evidence', t: 'a tester that is a tool (Playwright Bot)', apply: (sb) => sb.editRecord('desktop-firefox', (r) => { r.tester.name = 'Playwright Bot'; }), mustFail: ['evidence:browser-matrix'] },
  { g: 'evidence', t: 'a record dated in the future', apply: (sb) => sb.editRecord('desktop-safari', (r) => { r.date = '2099-01-01'; r.attestation.date = '2099-01-01'; }), mustFail: ['evidence:browser-matrix'] },
  { g: 'evidence', t: 'a real-device record whose test failed', apply: (sb) => sb.editRecord('iphone-safari', (r) => { r.results.pages['index.html'].loads.outcome = 'fail'; r.conclusion = 'failure'; r.findings.push({ id: 'DEV-1', page: 'index.html', severity: 'Minor', description: 'the page did not load', status: 'open' }); }), mustFail: ['evidence:real-device'] },
  { g: 'evidence', t: 'an attachment that is not on disk', apply: (sb) => rmSync(join(sb.proj, evKey(sb, 'iphone-safari'))), mustFail: ['evidence:real-device'] },
  { g: 'evidence', t: 'an attachment whose bytes changed after it was hashed', apply: (sb) => writeFileSync(join(sb.proj, evKey(sb, 'android-chrome')), 'replaced'), mustFail: ['evidence:real-device'] },
  { g: 'evidence', t: 'one attachment reused by two records', apply: (sb) => sb.editRecord('android-chrome', (r) => { r.attachments[0] = { ...sb.records.get('iphone-safari').record.attachments[0] }; }), mustFail: ['evidence:real-device'] },
  { g: 'evidence', t: 'a record file that is not valid JSON', apply: (sb) => writeFileSync(join(sb.evDir(), sb.records.get('desktop-chrome').file), '{ nope'), mustFail: ['evidence:browser-matrix'] },
  { g: 'evidence', t: 'a CI record for another commit (the parent)', apply: (sb) => sb.editRecord('ci-run', (r) => { r.build.commit = sb.parent; }), mustFail: ['evidence:ci-run'] },
  { g: 'evidence', t: 'a CI record whose run did not succeed', apply: (sb) => sb.editRecord('ci-run', (r) => { r.conclusion = 'failure'; }), mustFail: ['evidence:ci-run'] },
  { g: 'evidence', t: 'a CI record with no GitHub run URL', apply: (sb) => sb.editRecord('ci-run', (r) => { r.url = 'https://example.test/run/1'; }), mustFail: ['evidence:ci-run'] },
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
  // deployment approval is information only
  sb.writeLedger(`${sb.readLedger()}| ${ROW.DEP} | ${TODAY()} | deployment-approval | ${SYNTH}. channel: client-production; commit: ${sb.head} | none | none |\n`);
  let g = sb.gate(['--channel', 'client-production']);
  add('a deployment approval for the exact commit is reported, and the tool still only prints', g.allowed && g.deployment === 'true' && /nothing here deploys/.test(g.out), `allowed ${g.allowed}, deployment approved ${g.deployment}`);
  sb.restore();
  sb.writeLedger(`${sb.readLedger().split('\n').filter((l) => !l.startsWith(`| ${ROW.REL} |`)).join('\n')}| ${ROW.DEP} | ${TODAY()} | deployment-approval | ${SYNTH}. channel: client-production; commit: ${sb.head} | none | none |\n`);
  g = sb.gate(['--channel', 'client-production']);
  add('a deployment approval does not unblock a build that is missing its release approval', !g.allowed && g.failing.join() === 'releaseApproval' && g.deployment === 'true', `failing ${g.failing.join(', ')}; deployment approved ${g.deployment}`);
  sb.restore();
  // prepare while blocked writes nothing
  sb.dropRecord('iphone-safari');
  r = sb.tool(['prepare']);
  add('prepare on a blocked build exits 1, says NOT PREPARED and writes no release folder', r.status === 1 && /NOT PREPARED/.test(r.out) && !existsSync(join(sb.proj, 'release')), `exit ${r.status}; release folder exists: ${existsSync(join(sb.proj, 'release'))}`);
  sb.restore();
  return rows;
}

// The ledger problem: recording the approval and the CI run in the repository, as the process describes, cannot satisfy the gate.
export function runLedgerScenario(sb) {
  sb.restore();
  sb.recordInTree();
  sb.writeVerify({ commit: sb.head });
  const g = sb.gate(['--channel', 'client-production']);
  const fail = g.failing.join(', ');
  const row = { g: 'ledger', t: 'the approval and the CI record committed to the repository (the documented flow): the gate can never pass', ok: !g.allowed && g.failing.includes('releaseApproval') && g.failing.includes('evidence:ci-run') && g.failing.length === 2, expected: 'RECORDED: BLOCKED by releaseApproval and evidence:ci-run', observed: g.allowed ? 'ALLOWED' : `BLOCKED by ${fail || 'nothing listed'}`, finding: 'RG-01', detail: g.reqs.filter((r) => !r.ok).map((r) => `${r.id}: ${r.detail}`).join(' | ') };
  sb.restore();
  return [row];
}

// ---- the prepared package: integrity, reproducibility, tampering ----------------------------------------------------------------------------
const copyDir = (from) => { const to = tempDir('pkgcopy'); cpSync(from, to, { recursive: true }); return to; };
export function runPackageScenarios(sb) {
  const rows = [], add = (t, ok, detail, extra = {}) => rows.push({ g: 'package', t, ok, detail, ...extra });
  sb.restore();
  const r1 = sb.tool(['prepare']);
  const rel = join(sb.proj, 'release');
  if (r1.status !== 0) { add('prepare on the fully green synthetic build', false, `exit ${r1.status}: ${r1.out.slice(-200)}`); return rows; }
  const v = verifyPackage(rel);
  add('prepare on the fully green synthetic build writes a package that verifies', v.ok, v.checks.map((c) => `${c.ok ? 'ok' : 'FAIL'} ${c.id}`).join(', '));
  const snap = (d) => listFiles(d).map((f) => `${sha(readFileSync(join(d, f)))}  ${f}`).join('\n');
  const first = snap(rel);
  rmSync(rel, { recursive: true, force: true });
  const r2 = sb.tool(['prepare']);
  add('preparing the same commit twice gives byte-identical files (reproducible)', r2.status === 0 && snap(rel) === first, `${listFiles(rel).length} files compared`);
  const good = copyDir(rel);
  const run = (t, fn, mustFail) => {
    const d = copyDir(good);
    try { fn(d); const res = verifyPackage(d); const failing = res.checks.filter((c) => !c.ok).map((c) => c.id); add(t, mustFail.every((m) => failing.includes(m)) && !res.ok, `failing: ${failing.join(', ') || 'none'}${failing.length ? ` — ${res.checks.find((c) => !c.ok).detail.slice(0, 110)}` : ''}`); } finally { rmSync(d, { recursive: true, force: true }); }
  };
  const zipName = () => listFiles(good).find((f) => f.endsWith('.zip'));
  const rd = (d, n) => readFileSync(join(d, n)), wr = (d, n, b) => writeFileSync(join(d, n), b);
  const sums = (d) => { const z = listFiles(d).find((f) => f.endsWith('.zip')); wr(d, 'SHA256SUMS.txt', ['release-manifest.json', z].map((n) => `${sha(rd(d, n))}  ${n}`).join('\n') + '\n'); };
  run('one byte of the ZIP flipped', (d) => { const b = Buffer.from(rd(d, zipName())); b[Math.floor(b.length / 2)] ^= 1; wr(d, zipName(), b); }, ['checksums', 'package-binding']);
  run('the manifest edited (version changed)', (d) => wr(d, 'release-manifest.json', rd(d, 'release-manifest.json').toString().replace('"version": "1.0.0"', '"version": "1.0.1"')), ['checksums']);
  run('a line deleted from SHA256SUMS.txt', (d) => wr(d, 'SHA256SUMS.txt', rd(d, 'SHA256SUMS.txt').toString().split('\n')[0] + '\n'), ['checksums']);
  run('SHA256SUMS.txt lists an extra file', (d) => wr(d, 'SHA256SUMS.txt', rd(d, 'SHA256SUMS.txt') + `${'a'.repeat(64)}  extra.bin\n`), ['checksums']);
  run('host/_headers weakened (the CSP removed) — not covered by SHA256SUMS', (d) => wr(d, 'host/_headers', rd(d, 'host/_headers').toString().replace(/Content-Security-Policy: .*\n/, '')), ['security']);
  run('host/nginx.conf edited', (d) => wr(d, 'host/nginx.conf', rd(d, 'host/nginx.conf') + '\n# edited\n'), ['security']);
  run('a host file missing', (d) => rmSync(join(d, 'host/htaccess')), ['files']);
  run('the ZIP replaced by another valid ZIP, checksums updated, manifest not', (d) => { wr(d, zipName(), zipBuffer([{ name: 'index.html', data: Buffer.from('<p>other</p>') }])); sums(d); }, ['package-binding']);
  run('the manifest says the gate BLOCKED this build', (d) => { const m = JSON.parse(rd(d, 'release-manifest.json')); m.gate.allowed = false; m.gate.requirements[0].ok = false; wr(d, 'release-manifest.json', JSON.stringify(m, null, 2) + '\n'); sums(d); }, ['gate-recorded']);
  run('the manifest records a dirty source tree', (d) => { const m = JSON.parse(rd(d, 'release-manifest.json')); m.source.dirty = true; wr(d, 'release-manifest.json', JSON.stringify(m, null, 2) + '\n'); sums(d); }, ['gate-recorded']);
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
  run('a script added to the ZIP; manifest package hash and checksums updated (asset tree not)', (d) => { const { site, z2 } = rezip(d, (s) => writeFileSync(join(s, 'site.js'), `${readFileSync(join(s, 'site.js'), 'utf8')}\nfetch('https://evil.example/');`)); rmSync(site, { recursive: true, force: true }); const m = JSON.parse(rd(d, 'release-manifest.json')); m.package.bytes = z2.length; m.package.sha256 = sha(z2); wr(d, 'release-manifest.json', JSON.stringify(m, null, 2) + '\n'); sums(d); }, ['asset-tree']);
  run('a file that does not belong in a delivered site (config/client.json) added', (d) => { const { site, z2 } = rezip(d, (s) => { mkdirSync(join(s, 'config'), { recursive: true }); writeFileSync(join(s, 'config/client.json'), '{}'); }); rmSync(site, { recursive: true, force: true }); const m = JSON.parse(rd(d, 'release-manifest.json')); m.package.bytes = z2.length; m.package.sha256 = sha(z2); wr(d, 'release-manifest.json', JSON.stringify(m, null, 2) + '\n'); sums(d); }, ['zip-contents']);
  run('a ZIP entry that escapes the folder (../evil)', (d) => { wr(d, zipName(), zipBuffer([{ name: '../evil', data: Buffer.from('x') }])); const m = JSON.parse(rd(d, 'release-manifest.json')); m.package.bytes = rd(d, zipName()).length; m.package.sha256 = sha(rd(d, zipName())); wr(d, 'release-manifest.json', JSON.stringify(m, null, 2) + '\n'); sums(d); }, ['zip']);
  // a probe: a complete, self-consistent forgery
  const d = copyDir(good);
  try {
    const { site, z2 } = rezip(d, (s) => writeFileSync(join(s, 'site.js'), `${readFileSync(join(s, 'site.js'), 'utf8')}\n/* forged */`));
    const am = buildManifest(site); rmSync(site, { recursive: true, force: true });
    const m = JSON.parse(rd(d, 'release-manifest.json'));
    Object.assign(m.package, { bytes: z2.length, sha256: sha(z2) }); Object.assign(m.assets, { treeSha256: am.treeSha256, fileCount: am.fileCount, totalBytes: am.totalBytes });
    wr(d, 'release-manifest.json', JSON.stringify(m, null, 2) + '\n'); sums(d);
    const res = verifyPackage(d);
    add('PROBE: a delivered file changed AND the manifest, package hash and checksums rewritten to match', true, res.ok ? 'verifies: the checks prove consistency, not authorship (no signature, no independent copy of the hashes)' : `rejected by ${res.checks.filter((c) => !c.ok).map((c) => c.id).join(', ')}`, { probe: true, finding: 'RG-14', observed: res.ok ? 'passes' : 'rejected' });
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
  probe('RG-02', 'no external-link verification of any kind (registry and record deleted)', 'blocked once D-P5-1 is implemented', () => { sb.committed(() => { rmSync(join(sb.proj, 'engineering/external-links-verification.json'), { force: true }); rmSync(join(sb.proj, 'engineering/external-destinations.json'), { force: true }); }); const g = gate(); return { observed: verdict(g), open: g.allowed }; });
  probe('RG-03', 'a rights-verification row while the media inventory lists no asset as verified', 'blocked once D-P5-4 binds the row to the inventory', () => {
    const inv = JSON.parse(readFileSync(join(sb.proj, 'engineering/media-rights-inventory.json'), 'utf8'));
    const count = {}; for (const a of inv.assets) count[a.rights.status] = (count[a.rights.status] || 0) + 1;
    const g = gate(); return { observed: verdict(g), open: g.allowed, detail: `inventory: ${inv.assets.length} assets (${Object.entries(count).map(([k, v]) => `${v} ${k}`).join(', ')}); the row names no asset and no digest` };
  });
  probe('RG-04', 'a release approval row that says the release was REJECTED (it still carries channel, version and commit)', 'blocked: a rejection is not an approval', () => { edRow('REL', (l) => l.replace(`${SYNTH}.`, `The owner REJECTED this release and revoked the approval. ${SYNTH}.`))(sb); const g = gate(); return { observed: verdict(g), open: g.allowed }; });
  probe('RG-05', 'a rights-verification row that says "NOT verified by"', 'blocked: a negative is not a verification', () => { edRow('RIGHTS', (l) => l.replace('Verified by', 'NOT verified by'))(sb); const g = gate(); return { observed: verdict(g), open: g.allowed }; });
  probe('RG-06', 'a release-approval row whose Type column says "release-approval (REVOKED)"', 'blocked: a revoked approval is not an approval', () => { edRow('REL', (l) => l.replace('| release-approval |', '| release-approval (REVOKED) |'))(sb); const g = gate(); return { observed: verdict(g), open: g.allowed }; });
  probe('RG-07', 'a search-review row that says "NOT reviewed by"', 'blocked: a negative is not a review', () => { edRow('SRCH', (l) => l.replace('Reviewed by', 'NOT reviewed by'))(sb); const g = gate(); return { observed: verdict(g), open: g.allowed }; });
  probe('RG-08', 'a verification report with no check results at all (hand-written)', 'blocked: a report no tool wrote', () => { sb.writeVerify({ results: [] }); const g = gate(); return { observed: verdict(g), open: g.allowed }; });
  probe('RG-09', 'the recorded asset manifest left from another build (assets.manifest.json stale)', 'blocked, or at least refused when the package is verified', () => { sb.committed(() => writeFileSync(join(sb.proj, 'engineering/assets.manifest.json'), sb.git('show', `${sb.parent}:jade-and-ember/engineering/assets.manifest.json`).stdout)); const g = gate(); const p = sb.tool(['prepare']); const v = p.status === 0 ? verifyPackage(join(sb.proj, 'release')) : null; return { observed: `${verdict(g)}; prepare exit ${p.status}; package verification ${v ? (v.ok ? 'passes' : `FAILS (${v.checks.filter((c) => !c.ok).map((c) => c.id).join(', ')})`) : 'not run'}`, open: g.allowed }; });
  probe('RG-10', 'a dependency advisory that no one has accepted (the gate relies on a full verification report existing)', 'blocked by a security requirement', () => { sb.committed(() => sb.json('engineering/dependencies.json', (o) => { o.acceptedAdvisories.packages = []; })); const g = gate(); return { observed: verdict(g), open: g.allowed, detail: 'the accepted-advisory list was emptied; the gate does not look at it' }; });
  probe('RG-11', 'no SBOM, no provenance check, no pinned-action or Node-runtime check', 'blocked once D-P6-5 and D-P6-2 are implemented', () => { const g = gate(); return { observed: verdict(g), open: g.allowed, detail: 'no such requirement exists in release/policy.json' }; });
  probe('RG-12', 'no real-404 requirement and no HSTS default among the release requirements', 'blocked once D-P3-1 and D-P3-4 are implemented', () => {
    const dir = assembleCandidate(sb.proj, 'dryrun-hosting');
    try {
      const pol = loadSecurityPolicy(), headers = renderHeadersFile(dir, pol, { https: true });
      const g = gate();
      return { observed: verdict(g), open: g.allowed, detail: `the built site has a 404.html: ${existsSync(join(dir, '404.html'))}; the generated _headers contains includeSubDomains: ${/includeSubDomains/.test(headers)}; ${loadReleasePolicy().channels['client-production'].requires.filter((r) => /404|hsts|headers|hosting/i.test(r)).length} requirement(s) mention a 404, HSTS or hosting` };
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  return out;
}

// ---- other sandboxes -------------------------------------------------------------------------------------------------------------------------
export function runFlavourProbes() {
  const out = [];
  {
    const sb = createSandbox({ flavour: 'demo-label' });
    try {
      const g = sb.gate(['--channel', 'demonstration']);
      const p = sb.tool(['prepare']);
      const v = p.status === 0 ? verifyPackage(join(sb.proj, 'release')) : null;
      out.push({ id: 'RG-13', t: 'client-style content labelled as a demonstration (demo flag on, noindex on)', expectation: 'the demonstration channel is deliberately light; it must stay noindex and say it is fictional', observed: `${g.allowed ? 'ALLOWED' : `BLOCKED by ${g.failing.join(', ')}`}; prepare exit ${p.status}; package verification ${v ? (v.ok ? 'passes' : 'FAILS') : 'not run'}`, open: g.allowed, detail: `the demonstration gate has ${g.reqs.length} requirements and none asks whether the content is fictional` });
    } finally { sb.destroy(); }
  }
  return out;
}

// reserved-host corpus: which free preview, staging and default domains the heuristic does and does not recognise
export function reservedHostCorpus() {
  const hosts = ['jade.pages.dev', 'jade.vercel.app', 'jade.netlify.app', 'jade.workers.dev', 'jade.github.io', 'jade.web.app', 'jade.onrender.com', 'jade.fly.dev', 'staging.jade.com', 'jade.example.com', 'jade.test', 'localhost', '10.0.0.5',
    'jade.netlify.com', 'jade.azurestaticapps.net', 'jade.cloudfront.net', 'jade.s3-website-us-east-1.amazonaws.com', 'jade.appspot.com', 'jade.repl.co', 'jade.wixsite.com', 'jade.webflow.io', 'jade.framer.website', 'jade.lovable.app', 'jade.up.railway.app', 'jade.deno.dev', 'jade.pythonanywhere.com', 'jade-and-ember.com'];
  return hosts.map((h) => ({ host: h, flagged: isReservedHost(h) }));
}
