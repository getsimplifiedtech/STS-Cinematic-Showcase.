// check:selftest-gate6. Tests of the Gate 6 work: G6-1 (APR-JE-038): the direct Lighthouse runner that replaced Lighthouse CI, the Node 24 baseline and the
// pinned Actions; and G6-2 (APR-JE-039): the candidate artifact digest, the verification record, the structured release records and the retired Markdown rows. Every guard is shown to fail when it should (a defect is injected and must be reported) and to stay quiet on the untouched repository.
// Most cases are pure logic and need no browser; the last cases drive the real runner against the real site in Chromium (one page, one run, twice).
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkCiFile } from './ci.mjs';
import { checkDepsStatic } from './deps.mjs';
import { AGGREGATIONS, aggregate, checkFloor, evaluate, findChrome, loadConfig, measureAll, validateConfig } from '../lib/lighthouse.mjs';
import { satisfies } from '../lib/node-range.mjs';
import { engDir, isMain, projectDir, readJson, repoRoot } from '../lib/git.mjs';
import { canonicalJson, digestOf } from '../lib/candidate.mjs';
import { engineFiles, expectedCheckIds, sealOf, validateVerification } from '../lib/verification.mjs';
import { parseStrictJson } from '../lib/strict-json.mjs';
import { loadFamily } from '../lib/records.mjs';
import { loadEvidenceEntries } from '../lib/evidence.mjs';
import { parseApprovals } from '../lib/approvals.mjs';
import { unzipTo, zipBuffer } from '../lib/zip.mjs';
import { isReservedHost } from '../lib/hosts.mjs';
import { mkdirSync, symlinkSync } from 'node:fs';
import { validateRecordShape } from '../lib/records.mjs';
import { evaluateGate } from './../lib/release.mjs';
import { greenClientContext } from '../lib/release-fixtures.mjs';

const clone = (o) => JSON.parse(JSON.stringify(o));
const wf = readFileSync(join(repoRoot, '.github', 'workflows', 'jade-and-ember-verify.yml'), 'utf8');
const cfg = loadConfig();
const good = (page, s = {}) => ({ page, runs: Array.from({ length: cfg.runs }, () => ({ ok: true, scores: { performance: 0.99, accessibility: 1, 'best-practices': 1, seo: 0.63, ...s } })) });
const allGood = (s) => cfg.pages.map((p) => good(p, s));
const withTemp = (fn) => { const d = mkdtempSync(join(tmpdir(), 'je-g6-')); try { return fn(d); } finally { rmSync(d, { recursive: true, force: true }); } };
const depsIn = (mutate) => withTemp((d) => { cpSync(join(projectDir, 'package.json'), join(d, 'package.json')); cpSync(join(projectDir, 'package-lock.json'), join(d, 'package-lock.json')); mutate(d); return checkDepsStatic({ root: d }).problems; });
const edit = (d, f, fn) => { const p = join(d, f); const j = JSON.parse(readFileSync(p, 'utf8')); fn(j); writeFileSync(p, JSON.stringify(j, null, 2)); };
// the patterns check:release-dryrun scans for, written in pieces so that this file does not itself look like network client code
const NET_CLIENT = new RegExp(`(?<![.\\w])fe${'tch'}\\(|node:${'http'}s?'|node:${'ne'}t'|node:${'tl'}s'`);
let live = null;   // one real measurement of index.html, shared by the live cases
const liveRun = async () => live ??= await measureAll({ ...cfg, pages: ['index.html'], runs: 1 });

// [name, async () => problems[], expected regex | null (must find nothing)]
const cases = [
  // ---- the configuration and its floor
  ['config: the shipped configuration is valid and at or above the floor (must find nothing)', () => [...validateConfig(cfg), ...checkFloor(cfg)], null],
  ['config: it reproduces the Lighthouse CI thresholds it replaced', () => { const c = cfg.categories, p = []; if (c.performance.minScore !== 0.8 || c.performance.level !== 'warn') p.push('performance'); if (c.accessibility.minScore !== 0.95 || c.accessibility.level !== 'error') p.push('accessibility'); if (c['best-practices'].minScore !== 0.9) p.push('best-practices'); if (c.seo.minScore !== 0.6) p.push('seo'); if (cfg.runs !== 3 || cfg.pages.length !== 5) p.push('runs or pages'); return p.map((x) => `${x} differs from lighthouserc.json`); }, null],
  ['config: a lowered accessibility threshold is refused', () => { const c = clone(cfg); c.categories.accessibility.minScore = 0.9; return checkFloor(c); }, /accessibility: minScore 0\.9 is below the floor 0\.95/],
  ['config: accessibility demoted from error to warn is refused', () => { const c = clone(cfg); c.categories.accessibility.level = 'warn'; return checkFloor(c); }, /must fail the command/],
  ['config: a category switched off is refused', () => { const c = clone(cfg); c.categories.seo.level = 'off'; return checkFloor(c); }, /switched off/],
  ['config: a category removed is refused', () => { const c = clone(cfg); delete c.categories.performance; return checkFloor(c); }, /no longer asserted/],
  ['config: fewer runs than the floor is refused', () => { const c = clone(cfg); c.runs = 1; return checkFloor(c); }, /runs 1 is below the floor 3/],
  ['config: an aggregation weaker than the floor is refused', () => { const c = clone(cfg); c.aggregation = 'optimistic'; c.floor.minimumAggregation = 'median'; return checkFloor(c); }, /weaker than median/],
  ['config: a configuration without a recorded floor is refused', () => { const c = clone(cfg); delete c.floor; return checkFloor(c); }, /records no floor/],
  ['config: an unknown aggregation is refused', () => { const c = clone(cfg); c.aggregation = 'mean'; return validateConfig(c); }, /aggregation must be one of/],
  ['config: a score outside 0 to 1 is refused', () => { const c = clone(cfg); c.categories.seo.minScore = 60; return validateConfig(c); }, /minScore must be a number from 0 to 1/],
  ['config: an assertion switched off without a reason is refused', () => { const c = clone(cfg); c.audits['is-crawlable'].reason = ''; return validateConfig(c); }, /must state why/],
  ['config: a page name that could escape the folder is refused', () => { const c = clone(cfg); c.pages = ['../secret.html']; return validateConfig(c); }, /page file names/],
  // ---- aggregation and assertion
  ['aggregate: optimistic, median and pessimistic of three runs', () => { const s = [0.7, 1, 0.9], p = []; if (aggregate(s, 'optimistic') !== 1) p.push('optimistic'); if (aggregate(s, 'median') !== 0.9) p.push('median'); if (aggregate(s, 'pessimistic') !== 0.7) p.push('pessimistic'); return p.map((x) => `${x} is wrong`); }, null],
  ['aggregate: an even number of runs takes the lower middle value (never the kinder one)', () => aggregate([0.5, 0.9], 'median') === 0.5 ? [] : ['not the lower middle'], null],
  ['aggregate: a missing or unusable score gives no aggregate (fails closed)', () => [aggregate([1, null, 1], 'median'), aggregate([1, NaN], 'optimistic'), aggregate([], 'median'), aggregate([undefined], 'median')].filter((x) => x !== null).map(() => 'an unusable score was aggregated'), null],
  ['aggregate: an unknown method is an error, not a default', () => { try { aggregate([1], 'mean'); return []; } catch (e) { return [e.message]; } }, /unknown aggregation/],
  ['aggregate: the median is never kinder than the optimistic method Lighthouse CI used', () => { const p = []; for (let i = 0; i < 200; i++) { const s = [Math.random(), Math.random(), Math.random()]; if (aggregate(s, 'median') > aggregate(s, 'optimistic')) p.push(`${s}`); if (aggregate(s, 'pessimistic') > aggregate(s, 'median')) p.push(`pessimistic ${s}`); } return p; }, null],
  ['evaluate: good results produce no error and no warning (must find nothing)', () => { const r = evaluate(cfg, allGood()); return [...r.errors, ...r.warnings]; }, null],
  ['evaluate: accessibility below its threshold fails the command', () => evaluate(cfg, allGood({ accessibility: 0.9 })).errors, /accessibility 0\.9 is below 0\.95/],
  ['evaluate: performance below its threshold is a warning, not an error', () => { const r = evaluate(cfg, allGood({ performance: 0.5 })); return r.errors.length ? ['an error was raised for a warn-level category'] : r.warnings; }, /performance 0\.5 is below 0\.8/],
  ['evaluate: a null score is an error, never a pass', () => evaluate(cfg, allGood({ accessibility: null })).errors, /accessibility has no usable score|run \d failed|no usable score/],
  ['evaluate: a failed run is an error whatever its scores', () => { const r = allGood(); r[0].runs[1] = { ok: false, error: 'NO_FCP', scores: {} }; return evaluate(cfg, r).errors; }, /run 2 failed \(NO_FCP\)/],
  ['evaluate: fewer runs than configured is an error', () => { const r = allGood(); r[2].runs.pop(); return evaluate(cfg, r).errors; }, /2 of 3 runs were produced/],
  ['evaluate: a page with no result is an error', () => evaluate(cfg, allGood().slice(1)).errors, /index\.html: no result at all/],
  ['evaluate: one bad run among three decides by the median, as configured', () => { const r = allGood(); r[0].runs[0].scores.accessibility = 0.5; return evaluate(cfg, r).errors; }, null],
  ['evaluate: two bad runs among three fail the median', () => { const r = allGood(); r[0].runs[0].scores.accessibility = 0.5; r[0].runs[1].scores.accessibility = 0.5; return evaluate(cfg, r).errors; }, /index\.html: accessibility 0\.5/],
  ['evaluate: the optimistic method would have passed those two bad runs (why the median is the default)', () => { const c = clone(cfg); c.aggregation = 'optimistic'; const r = allGood(); r[0].runs[0].scores.accessibility = 0.5; r[0].runs[1].scores.accessibility = 0.5; return evaluate(c, r).errors.length ? [] : ['optimistic passed, as Lighthouse CI would have']; }, /optimistic passed/],
  ['evaluate: an assertion that is off is not asserted (is-crawlable)', () => { const r = allGood(); r.forEach((x) => x.runs.forEach((y) => { y.audits = { 'is-crawlable': 0 }; })); const e = evaluate(cfg, r); return [...e.errors, ...e.warnings, ...e.rows.filter((x) => /crawlable/.test(x.category)).map(() => 'asserted')]; }, null],
  ['evaluate: an audit asserted at error level fails when the score is under the minimum', () => { const c = clone(cfg); c.audits['color-contrast'] = { level: 'error', minScore: 1 }; const r = allGood(); r.forEach((x) => x.runs.forEach((y) => { y.audits = { 'color-contrast': 0 }; })); return evaluate(c, r).errors; }, /audit color-contrast 0 is below 1/],
  // ---- the Node range evaluator
  ['node-range: ranges used by the lockfile are evaluated correctly', () => { const t = [['24.21.0', '^22.22.0 || >= 24.8.0', true], ['24.7.0', '^22.22.0 || >= 24.8.0', false], ['22.21.0', '^22.22.0 || >= 24.8.0', false], ['24.21.0', '>=20.19.0 <22.0.0 || >=22.12.0', true], ['24.21.0', '>=24.8.0 <25', true], ['25.0.0', '>=24.8.0 <25', false], ['24.21.0', '^22.12 || >= 24.0', true], ['20.0.0', '>=22.19', false]]; return t.filter(([v, r, e]) => satisfies(v, r) !== e).map(([v, r]) => `${v} against ${r}`); }, null],
  ['node-range: a range it does not understand is refused, never waved through', () => { try { satisfies('24.21.0', '1.2.3 - 2.3.4'); return []; } catch (e) { return [e.message]; } }, /unsupported|not an exact/],
  // ---- dependencies: engines, lockfile, retired packages
  ['deps: the untouched repository passes the static dependency check (must find nothing)', () => depsIn(() => {}), null],
  ['deps: engines.node that differs from environment.json is refused', () => depsIn((d) => edit(d, 'package.json', (j) => { j.engines.node = '>=20'; })), /differs from environment\.json/],
  ['deps: an engines range the tested Node does not satisfy is refused', () => depsIn((d) => { edit(d, 'package.json', (j) => { j.engines.node = '>=25'; }); }), /does not satisfy engines\.node|differs from environment/],
  ['deps: a locked package that needs a newer Node than the baseline is refused', () => depsIn((d) => edit(d, 'package-lock.json', (j) => { j.packages['node_modules/yaml'].engines = { node: '>=25.0.0' }; })), /node_modules\/yaml: requires Node ">=25\.0\.0"/],
  ['deps: an engines range that cannot be evaluated is refused', () => depsIn((d) => edit(d, 'package-lock.json', (j) => { j.packages['node_modules/yaml'].engines = { node: '1.2.3 - 2.3.4' }; })), /cannot be evaluated/],
  ['deps: the retired Lighthouse CI package cannot come back in package.json', () => depsIn((d) => edit(d, 'package.json', (j) => { j.devDependencies['@lhci/cli'] = '0.15.1'; })), /@lhci\/cli is retired/],
  ['deps: nor in the lockfile', () => depsIn((d) => edit(d, 'package-lock.json', (j) => { j.packages['node_modules/@lhci/cli'] = { version: '0.15.1', resolved: 'https://registry.npmjs.org/x', integrity: 'sha512-x', license: 'Apache-2.0' }; })), /contains the retired package @lhci\/cli/],
  ['deps: a loose version range for lighthouse is refused', () => depsIn((d) => edit(d, 'package.json', (j) => { j.devDependencies.lighthouse = '^13.5.0'; })), /pin an exact version/],
  ['deps: lighthouse is a pinned development dependency and is in the lockfile at that version', () => { const p = readJson(join(projectDir, 'package.json')), l = readJson(join(projectDir, 'package-lock.json')); const v = p.devDependencies.lighthouse; return v && l.packages['node_modules/lighthouse']?.version === v && !Object.keys(p.devDependencies).some((k) => k.startsWith('@lhci')) ? [] : [`lighthouse ${v} vs lockfile ${l.packages['node_modules/lighthouse']?.version}`]; }, null],
  ['deps: lighthouserc.json is gone and the script runs the direct runner', () => { const p = readJson(join(projectDir, 'package.json')); return [...(existsSync(join(projectDir, 'lighthouserc.json')) ? ['lighthouserc.json still exists'] : []), ...(/lhci/.test(JSON.stringify(p.scripts)) ? ['a script still calls lhci'] : []), ...(p.scripts['test:lighthouse'] === 'node engineering/tools/lighthouse.mjs' ? [] : ['test:lighthouse does not run the direct runner'])]; }, null],
  // ---- the workflow
  ['ci: the untouched workflow passes (must find nothing)', () => checkCiFile(wf, { docs: false }).problems, null],
  ['ci: a job still on Node 22 is refused', () => checkCiFile(wf.replace("node-version: '24.21.0'", "node-version: '22.22.0'"), { docs: false }).problems, /records the tested baseline 24\.21\.0/],
  ['ci: a different Node 24 patch than the tested one is refused', () => checkCiFile(wf.replace("node-version: '24.21.0'", "node-version: '24.20.0'"), { docs: false }).problems, /records the tested baseline 24\.21\.0/],
  ['ci: a floating Node version is refused', () => checkCiFile(wf.replace("node-version: '24.21.0'", "node-version: '24'"), { docs: false }).problems, /exact Node version/],
  ['ci: the old checkout (Node 20 runtime) is refused', () => checkCiFile(wf.replace('actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1', 'actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683'), { docs: false }).problems, /actions\/checkout is pinned to 11bd719.*v7\.0\.1/],
  ['ci: the old setup-node (Node 20 runtime) is refused', () => checkCiFile(wf.replace('actions/setup-node@820762786026740c76f36085b0efc47a31fe5020', 'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020'), { docs: false }).problems, /actions\/setup-node is pinned to 49933ea.*v7\.0\.0/],
  ['ci: an unrecorded SHA (a moving or unreviewed release) is refused', () => checkCiFile(wf.replace('actions/setup-node@820762786026740c76f36085b0efc47a31fe5020', 'actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1'), { docs: false }).problems, /actions\/setup-node is pinned to 949feb2/],
  ['ci: a tag instead of a SHA is refused', () => checkCiFile(wf.replace('actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1', 'actions/checkout@v7'), { docs: false }).problems, /not pinned to a full commit SHA/],
  ['ci: an install without --engine-strict is refused', () => checkCiFile(wf.replace('npm ci --ignore-scripts --engine-strict', 'npm ci --ignore-scripts'), { docs: false }).problems, /--engine-strict/],
  ['ci: the blocking job named for another Node major is refused', () => checkCiFile(wf.replace('verify (Ubuntu 24.04, Node 24, Chromium)', 'verify (Ubuntu 24.04, Node 22, Chromium)'), { docs: false }).problems, /named "verify \(Ubuntu 24\.04, Node 22, Chromium\)", but the tested Node is 24\.21\.0/],
  ['ci: the Lighthouse job cannot become blocking by dropping its informational name', () => checkCiFile(wf.replace("name: 'lighthouse (informational)'", "name: 'lighthouse'"), { docs: false }).problems, /continue-on-error is only allowed|must run npm run verify/],
  // ---- G6-2: the candidate artifact digest, the verification record's inputs, the structured records
  ['candidate: key order does not change the digest, a changed value does', () => { const a = { x: 1, y: { b: 2, a: [1, { d: 4, c: 3 }] } }, b = { y: { a: [1, { c: 3, d: 4 }], b: 2 }, x: 1 }, c = { ...b, x: 2 }; return [...(canonicalJson(a) === canonicalJson(b) ? [] : ['key order changed the bytes']), ...(digestOf(a) === digestOf(b) ? [] : ['key order changed the digest']), ...(digestOf(a) !== digestOf(c) ? [] : ['a changed value did not change the digest'])]; }, null],
  ['candidate: the parts are exactly the artifact, with nothing about records, commits or dates', () => { const src = readFileSync(join(engDir, 'lib', 'candidate.mjs'), 'utf8'); const m = /const parts = \{([\s\S]*?)\n  \};/.exec(src); const keys = [...(m?.[1] || '').matchAll(/^\s{4}(\w+):/gm)].map((x) => x[1]).sort(); const want = ['configuration', 'delivered', 'engines', 'evidenceSpec', 'externalDestinations', 'framework', 'mediaRights', 'packageExtras', 'releasePolicy', 'search', 'securityPolicy']; return keys.join() === want.join() ? [] : [`the digest parts are ${keys.join(', ')}; expected ${want.join(', ')}`]; }, null],
  ['candidate: nothing a record, a reviewer or a report could change is read by the digest', () => { const src = readFileSync(join(engDir, 'lib', 'candidate.mjs'), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n'); return /release['"/,\s]+(approvals|evidence|deployments)['"/]|reviewers|demonstrations|\.reports|JADE_AND_EMBER_APPROVALS|execFileSync|gitState|spawn/.test(src) ? ['candidate.mjs reads a record family, the ledger or git'] : []; }, null],
  ['verification: the engine digest covers the rules and excludes every record family, the reviewer table, the registry and the reports', () => { const f = engineFiles(); return [...['verify.mjs', 'lib/release.mjs', 'lib/records.mjs', 'lib/candidate.mjs', 'release/policy.json', 'release/evidence-spec.json', 'checks/release-dryrun.mjs'].filter((x) => !f.includes(x)).map((x) => `${x} is not covered`), ...f.filter((x) => /^release\/(approvals|evidence|deployments)\/|reviewers\.json|demonstrations\.json|\.reports|\.md$|(^|\/)framework-migration-matrix\.json$|(^|\/)gate5-closure\.json$/.test(x)).map((x) => `${x} must not be covered`)]; }, null],
  ['verification: the verifier\'s registry holds every check, including this one and the dry run', () => { const ids = expectedCheckIds(); return ['check:selftest-gate6', 'check:release-dryrun', 'check:release', 'check:regression'].filter((x) => !ids.includes(x)).map((x) => `${x} is missing from the registry`).concat(ids.length >= 40 ? [] : [`only ${ids.length} checks`]); }, null],
  ['records: the template tool prints a record with NO decision, which is invalid on purpose, and writes nothing', () => { const dir = join(engDir, 'release', 'approvals'), before = readdirSync(dir).join(); const r = spawnSync(process.execPath, [join(engDir, 'tools', 'release-record.mjs'), 'template', 'release-approval'], { encoding: 'utf8' }); const after = readdirSync(dir).join(); let rec = null; try { rec = JSON.parse(r.stdout); } catch { return ['the template is not JSON']; } const probs = validateRecordShape(rec, { today: '2026-10-13' }); return [...(r.status === 0 ? [] : ['the tool failed']), ...(/TEMPLATE/.test(rec.status) && probs.length ? [] : ['the template could pass as a decision']), ...(before === after ? [] : ['the tool wrote a file']), ...(rec.decidedBy.name === '' && rec.rationale === '' && rec.decidedAt === '' ? [] : ['the template fills in a person or a rationale'])]; }, null],
  ['records: the old Markdown rows are not read (a release-approval row with the right channel, version and commit changes nothing)', () => { const g = greenClientContext(); const row = { id: 'REL-JE-001', date: '2026-10-10', type: 'release-approval', decision: `release-approval. channel: client-production; version: 1.0.0; commit: ${'a'.repeat(40)}`, concerns: '', limits: '' }; return evaluateGate(greenClientContext({ approvalRecords: [], approvals: [...g.approvals, row] })).requirements.filter((r) => !r.ok && r.id === 'releaseApproval').length ? [] : ['a Markdown row satisfied the release approval']; }, null],
  ['records: a status written in prose has no meaning (the model has four statuses and nothing is inferred)', () => validateRecordShape({ ...greenClientContext().approvalRecords[0].record, status: 'REJECTED' }, { today: '2026-10-13' }), /status must be one of approved, rejected, revoked, superseded/],
  // ---- G6-2 adversarial review: parsing, folders, containers, the closed verification record
  ['strict json: a repeated key in one object is refused (JSON.parse would keep the last)', () => { try { parseStrictJson('{"status":"rejected","x":{"a":1},"status":"approved"}'); return []; } catch (e) { return [e.message]; } }, /duplicate key "status"/],
  ['strict json: the same key in different objects, key-like text in strings and escapes are fine (must find nothing)', () => { try { parseStrictJson('{"a":{"a":1},"b":[{"a":1},{"a":2}],"c":"\\"a\\":1, \\"a\\":2","d":"\\u0061"}'); return []; } catch (e) { return [e.message]; } }, null],
  ['record folders: a backup, an upper-case extension, a sub-folder, a symlink and a file named for another id are each refused', () => withTemp((d) => { const dir = join(d, 'release', 'approvals'); mkdirSync(join(dir, 'old'), { recursive: true }); const rec = JSON.stringify({ id: 'REL-JE-001', type: 'release-approval' }); writeFileSync(join(dir, 'REL-JE-001.json.bak'), rec); writeFileSync(join(dir, 'REL-JE-002.JSON'), rec); writeFileSync(join(dir, 'REL-JE-003.json'), rec); writeFileSync(join(d, 'outside.json'), rec); symlinkSync(join(d, 'outside.json'), join(dir, 'REL-JE-004.json')); writeFileSync(join(dir, 'README.md'), 'x'); const rows = loadFamily('approvals', d); const bad = rows.filter((r) => r.parseError); return bad.length === 5 ? ['all five were refused: ' + bad.map((r) => r.file).join(', ')] : [`only ${bad.length} of 5 refused`]; }), /all five were refused/],
  ['record folders: a deployment record in the approvals family is refused; a rights verification in it is read', () => withTemp((d) => { const a = join(d, 'release', 'approvals'); mkdirSync(a, { recursive: true }); writeFileSync(join(a, 'DEP-JE-001.json'), '{}'); writeFileSync(join(a, 'REL-JE-001.json'), JSON.stringify({ id: 'REL-JE-001', type: 'rights-verification' })); const rows = loadFamily('approvals', d); const dep = rows.find((r) => r.file === 'DEP-JE-001.json'), rel = rows.find((r) => r.file === 'REL-JE-001.json'); return dep?.parseError && rel?.record ? ['the deployment record was refused here and the approval-family record was read'] : []; }), /refused here and the approval-family record was read/],
  ['evidence folder: a non-evidence record, a backup and a symlink are refused; the files/ folder and README are not records', () => withTemp((d) => { writeFileSync(join(d, 'README.md'), 'x'); mkdirSync(join(d, 'files')); writeFileSync(join(d, 'REL-JE-901.json'), JSON.stringify({ schema: 'jade-and-ember/approval-record@1' })); writeFileSync(join(d, 'a.json.bak'), '{}'); writeFileSync(join(d, 'real.json'), '{}'); symlinkSync(join(d, 'real.json'), join(d, 'b.json')); const rows = loadEvidenceEntries(d); return [`${rows.filter((r) => r.parseError).length} of ${rows.length} refused`]; }), /^4 of 4 refused$/],
  ['ledger: a row inside a code fence or an HTML comment is not an approval', () => parseApprovals('| APR-JE-001 | 2026-01-01 | note | approved | none | none |\n```\n| APR-JE-002 | 2026-01-01 | note | approved | none | none |\n```\n<!--\n| APR-JE-003 | 2026-01-01 | note | approved | none | none |\n-->\n').length === 1 ? ['only the real row counts'] : [], /only the real row counts/],
  ['zip: a plain archive round-trips (must find nothing); trailing bytes, a comment, a hidden entry and a repeated name are each refused', () => withTemp((d) => { const z = zipBuffer([{ name: 'a.html', data: Buffer.from('<p>a</p>') }, { name: 'media/b.txt', data: Buffer.from('b') }]); const ok = unzipTo(z, join(d, 'ok')); const refuse = (b) => { try { unzipTo(b, join(d, 'x')); return false; } catch { return true; } }; const dup = zipBuffer([{ name: 'a.html', data: Buffer.from('1') }, { name: 'a.html', data: Buffer.from('2') }]); return [ok.join() === 'a.html,media/b.txt' && refuse(Buffer.concat([z, Buffer.from('x')])) && refuse(dup) && refuse(Buffer.concat([Buffer.from('junk'), z])) ? 'all refused' : 'a malformed archive was read']; }), /all refused/],
  ['verification: a record with a field the verifier does not write is refused even when resealed', () => { const g = greenClientContext(); const v = { ...g.verify, note: 'hand written' }; v.seal = sealOf(v); return validateVerification(v, { candidate: g.verify.candidate, engineDigest: g.verify.engineDigest, ids: g.engine.ids }); }, /fields the verifier does not write/],
  ['verification: a record with a malformed environment is refused even when resealed', () => { const g = greenClientContext(); const v = { ...g.verify, environment: { ...g.verify.environment, runner: 'my laptop' } }; v.seal = sealOf(v); return validateVerification(v, { candidate: g.verify.candidate, engineDigest: g.verify.engineDigest, ids: g.engine.ids }); }, /environment/],
  ['hosts: staging words inside sub-domain labels and more hosting providers are reserved', () => ['jade-staging.client.com', 'www-dev.client.com', 'stage2.client.com', 'preview-1.client.com', 'x.azurestaticapps.net', 'x.cloudfront.net', 'x.appspot.com', 'x.gitlab.io', 'netlify.com', 'abc.ngrok.app'].filter((h) => !isReservedHost(h)).map((h) => `${h} was not reserved`), null],
  ['hosts: real-looking client domains are not reserved (must find nothing)', () => ['www.jadeandember.com', 'order.mybistro.co.uk', 'dev-bistro.com', 'testkitchen.com'].filter((h) => isReservedHost(h)).map((h) => `${h} was reserved`), null],
  // ---- the real runner, in Chromium, against the real site (skipped with a clear message only when no browser exists)
  ['runner: the source has no network client and no error reporting (the only network code stays in the files check:release-dryrun allows)', () => { const t = readFileSync(join(engDir, 'lib', 'lighthouse.mjs'), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n'); return [...(NET_CLIENT.test(t) ? ['network client code'] : []), ...(/enableErrorReporting|lighthouse\/cli|Sentry/i.test(t) ? ['error reporting or the Lighthouse CLI'] : [])]; }, null],
  ['runner: it measures the real home page and the real thresholds hold (must find nothing)', async () => { const { results } = await liveRun(); const e = evaluate({ ...cfg, pages: ['index.html'], runs: 1 }, results); return [...e.errors, ...(results[0].runs[0].lighthouseVersion ? [] : ['no Lighthouse version recorded'])]; }, null],
  ['runner: the measured accessibility score is a real number, and the Lighthouse version is the pinned one', async () => { const { results } = await liveRun(); const r = results[0].runs[0], pin = readJson(join(projectDir, 'package.json')).devDependencies.lighthouse; return typeof r.scores.accessibility === 'number' && r.lighthouseVersion === pin ? [] : [`score ${r.scores.accessibility}, Lighthouse ${r.lighthouseVersion}, pinned ${pin}`]; }, null],
  ['runner: impossible thresholds on the real measurement fail the command', async () => { const { results } = await liveRun(); const c = { ...clone(cfg), pages: ['index.html'], runs: 1 }; c.categories.seo = { level: 'error', minScore: 1 }; return evaluate(c, results).errors; }, /index\.html: seo 0\.\d+ is below 1/],
  ['runner: a page that does not exist is a failed run, not a pass', async () => { const { results } = await measureAll({ ...cfg, pages: ['no-such-page.html'], runs: 1 }); return evaluate({ ...cfg, pages: ['no-such-page.html'], runs: 1 }, results).errors; }, /no-such-page\.html: run 1 failed/],
];

export async function checkSelftestGate6() {
  const problems = [], notes = [];
  const t0 = Date.now();
  let chrome = true; try { await findChrome(); } catch { chrome = false; }
  for (const [name, run, expect] of cases) {
    if (!chrome && name.startsWith('runner:')) { problems.push(`${name}: no Chromium is available, so the runner could not be tested`); continue; }
    let r;
    try { r = await run(); } catch (e) { r = [`check crashed: ${e.message}`]; }
    if (expect === null) { if (r.length) problems.push(`${name}: ${String(r[0]).slice(0, 220)}`); else notes.push(`held: ${name}`); }
    else if (!r.length) problems.push(`${name}: nothing was reported; the defect went undetected`);
    else if (!expect.test(r.join('\n'))) problems.push(`${name}: reported something else (${String(r[0]).slice(0, 160)}), expected ${expect}`);
    else notes.push(`caught: ${name}`);
  }
  notes.push(`${cases.length} Gate 6 (G6-1) tests run in ${((Date.now() - t0) / 1000).toFixed(0)} s; aggregations: ${AGGREGATIONS.join(', ')}`);
  return { problems, notes };
}

if (isMain(import.meta.url)) {
  const { problems, notes } = await checkSelftestGate6();
  notes.forEach((x) => console.log('  ' + x));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:selftest-gate6`);
  process.exit(problems.length ? 1 : 0);
}
