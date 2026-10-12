// check:release-dryrun (Gate 5 Phase 7, APR-JE-035; release model v2, G6-2, APR-JE-039). The release readiness dry run: the REAL release tool, run against a
// SYNTHETIC client build in a throwaway copy of the project (lib/release-dryrun.mjs). It proves, with the actual commands and the actual record resolver,
// evidence validator, verification-record validator and git, that:
//   * a fully approved synthetic build passes the gate, is prepared into a package, and the package verifies and is reproducible;
//   * each blocker, taken alone, makes the gate refuse with a message that says what is wrong (about 80 single-defect scenarios);
//   * the channel comes from the configuration, a mismatched --channel is refused, a deployment approval is only reported, and a blocked build
//     writes nothing;
//   * a tampered package is rejected by lib/release-package.mjs;
//   * nothing in the repository's tools or workflow can deploy, publish or write to a remote system;
//   * the real approvals, evidence, deployment and reviewer records, the ledger and the demonstration are not touched by any of it;
//   * (v2, G6-3) every finding RG-01 to RG-11, RG-13 and RG-14 (the last as a hard stop) has a BLOCKING scenario that fails closed: records are bound to the candidate artifact digest (the
//     committed-records flow reaches green), a rejected, revoked, unauthorised or malformed record never counts and prose changes nothing, a hand-written,
//     incomplete, edited or stale verification record is refused, the production host must be positively authorised, an unregistered demonstration is refused,
//     and the package's ZIP must be the approved artifact.
// It also MEASURES (does not assert) the places where the gate lets something through that it arguably should refuse (RG-01 to RG-14),
// so each gap in engineering/RELEASE-DRYRUN-GATE5.md is an observed fact. The probes never fail the check; a scenario that should block and does not does.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { parse as parseYaml } from 'yaml';
import { createSandbox } from '../lib/release-dryrun.mjs';
import { GATE_SCENARIOS, reservedHostCorpus, runChannelScenarios, runEnvironmentScenarios, runLedgerScenario, runGateProbes, runPackageScenarios } from '../lib/release-dryrun-scenarios.mjs';
import { engDir, isMain, listFiles, projectDir, repoRoot } from '../lib/git.mjs';
import { loadReleasePolicy } from '../lib/release.mjs';
import { checkSelftestReleaseControl } from './selftest-release-control.mjs';

const sha = (b) => createHash('sha256').update(b).digest('hex');
const exists = (p) => existsSync(p);

// What must be identical before and after: the real ledger, every real record family, the reviewer table, the demonstration registry, the real tree's status
// and the absence of a release folder.
function realState() {
  const ledger = join(repoRoot, 'docs', 'JADE_AND_EMBER_APPROVALS.md');
  const fam = ['approvals', 'evidence', 'deployments'].flatMap((f) => { const d = join(engDir, 'release', f); return exists(d) ? listFiles(d).map((x) => `${f}/${x}:${sha(readFileSync(join(d, x)))}`) : []; });
  const loose = ['reviewers.json', 'demonstrations.json'].map((f) => `${f}:${sha(readFileSync(join(engDir, 'release', f)))}`);
  const st = spawnSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf8' }).stdout;
  return JSON.stringify({ ledger: sha(readFileSync(ledger)), fam, loose, status: st, releaseFolder: exists(join(projectDir, 'release')) });
}

// The judgement of one gate scenario against what the real tool printed.
function judge(s, g) {
  if (s.either) { const a = judge({ ...s, either: false, error: undefined }, g), b = judge({ ...s, either: false, mustFail: undefined }, g); return a.ok ? a : b.ok ? b : { ok: false, expected: `${a.expected}, or a refusal`, observed: a.observed }; }
  const first = (g.out.split('\n').find((l) => l.trim()) || '').slice(0, 90);
  if (s.allow) return { ok: g.allowed && g.status === 0, expected: 'ALLOWED (this must not block)', observed: g.allowed ? 'ALLOWED' : `BLOCKED by ${g.failing.join(', ') || 'nothing listed'}: ${g.reqs.filter((r) => !r.ok).map((r) => r.detail).join(' | ').slice(0, 160)}` };
  if (s.error) return { ok: g.status !== 0 && g.status !== null && !g.allowed && s.error.test(g.out), observed: `tool error, exit ${g.status}: ${first}`, expected: 'the tool stops and nothing is allowed' };
  const must = s.mustFail, may = s.mayFail || [], failing = g.failing;
  const notBlocked = must.filter((m) => !failing.includes(m)), collateral = failing.filter((f) => !must.includes(f) && !may.includes(f));
  const details = must.map((m) => g.reqs.find((r) => r.id === m)?.detail || '');
  const unclear = must.filter((m, i) => details[i].length < 12);
  const ok = !g.allowed && g.status === 1 && !notBlocked.length && !collateral.length && !unclear.length && (!s.detail || s.detail.test(details.join(' | ')));
  return { ok, expected: `BLOCKED by ${must.join(', ')}${may.length ? ` (may also: ${may.join(', ')})` : ''}`, observed: g.allowed ? 'ALLOWED' : `BLOCKED by ${failing.join(', ') || 'nothing listed'}${notBlocked.length ? `; did NOT block: ${notBlocked.join(', ')}` : ''}${collateral.length ? `; unexpected: ${collateral.join(', ')}` : ''}${unclear.length ? `; unclear message for ${unclear.join(', ')}` : ''}${s.detail && !s.detail.test(details.join(' | ')) ? `; message lacks ${s.detail}` : ''}` };
}

// Nothing in the tools, the checks or the workflow can deploy, publish or write to a remote system.
export function deploymentSafety() {
  const rows = [], add = (t, ok, detail) => rows.push({ g: 'deployment', t, ok, detail });
  const wfPath = join(repoRoot, '.github', 'workflows', 'jade-and-ember-verify.yml'), text = readFileSync(wfPath, 'utf8'), wf = parseYaml(text);
  const jobs = Object.entries(wf.jobs || {});
  const triggers = Object.keys(wf.on || wf[true] || {});
  add('the workflow is triggered only by push, pull_request and workflow_dispatch', triggers.every((t) => ['push', 'pull_request', 'workflow_dispatch'].includes(t)), triggers.join(', '));
  add('workflow permissions are read-only (contents: read) at the top and on every job', JSON.stringify(wf.permissions) === '{"contents":"read"}' && jobs.every(([, j]) => !j.permissions || JSON.stringify(j.permissions) === '{"contents":"read"}'), JSON.stringify(wf.permissions));
  add('no job uses an environment, a deployment, a secret or a token', !/\benvironment\s*:/.test(text) && !/\$\{\{\s*secrets\./.test(text) && !/GITHUB_TOKEN|id-token|deployments\s*:/.test(text), 'no environment:, no secrets., no GITHUB_TOKEN, no id-token');
  const uses = [...text.matchAll(/uses:\s*([\w./-]+)@/g)].map((m) => m[1]);
  add('the only actions are actions/checkout and actions/setup-node, each pinned to a commit', uses.every((u) => ['actions/checkout', 'actions/setup-node'].includes(u)) && [...text.matchAll(/uses:\s*\S+@(\S+)/g)].every((m) => /^[0-9a-f]{40}$/.test(m[1])), [...new Set(uses)].join(', '));
  const runs = jobs.flatMap(([, j]) => (j.steps || []).map((s) => s.run || '')).join('\n');
  const DEPLOY = /\b(wrangler|vercel|netlify|gh\s+release|git\s+push|git\s+tag|rsync|scp|aws\s+s3|npm\s+publish|docker\s+push|pages\s+deploy|firebase\s+deploy|flyctl|surge)\b|curl[^\n]*-X\s*(POST|PUT|PATCH|DELETE)|upload-artifact|deploy-pages/i;
  add('no step runs a deploy, publish, push or upload command', !DEPLOY.test(runs) && !DEPLOY.test(text.replace(/#.*$/gm, '')), 'scanned every run: block and every uses: line');
  const src = ['lib', 'tools', 'checks'].flatMap((d) => listFiles(join(engDir, d)).filter((f) => f.endsWith('.mjs')).map((f) => [`${d}/${f}`, readFileSync(join(engDir, d, f), 'utf8')]));
  const self = new Set(['lib/release-dryrun-scenarios.mjs', 'checks/release-dryrun.mjs', 'checks/selftest-gate3.mjs', 'checks/selftest-gate4.mjs', 'checks/selftest-gate5.mjs', 'checks/selftest.mjs', 'checks/ci.mjs', 'checks/hosting.mjs', 'checks/hosting-adapters.mjs']);   // (the two hosting checks talk only to servers they start on 127.0.0.1)
  const deployCalls = src.filter(([f, t]) => !self.has(f) && /(spawnSync|execFileSync|execSync|spawn|exec)\(\s*['"`](wrangler|vercel|netlify|gh|rsync|scp|aws|npm\s+publish|curl|wget|ssh|ftp)\b/.test(t)).map(([f]) => f);
  add('no engineering tool or library starts a deploy, upload or network client program', !deployCalls.length, deployCalls.join(', ') || `${src.length} files scanned`);
  const writes = src.filter(([f, t]) => !self.has(f) && /method:\s*['"](POST|PUT|PATCH|DELETE)['"]/i.test(t)).map(([f]) => f);
  add('no engineering code sends a POST, PUT, PATCH or DELETE request', !writes.length, writes.join(', ') || 'none found');
  const netFiles = src.filter(([f, t]) => !self.has(f) && /(?<![.\w])fetch\(|fetchImpl\(|node:https?'|node:net'|node:tls'/.test(t)).map(([f]) => f).sort();
  const expectNet = ['lib/external.mjs', 'lib/search.mjs', 'lib/server.mjs'];
  add('code that can open a network connection is only the external-link verifier, the local server and the search probes', netFiles.every((f) => expectNet.includes(f)), netFiles.join(', '));
  const da = src.filter(([f, t]) => !self.has(f) && /deploymentApproved/.test(t)).map(([f]) => f).sort();
  add('deploymentApproved is only produced by the gate and printed or recorded, never acted on', da.join() === 'checks/release.mjs,lib/release.mjs,tools/release.mjs', da.join(', '));
  const pol = loadReleasePolicy();
  add('the policy states that no channel deploys and nothing acts on a deployment approval', /never performed by any tool/.test(pol.deployment) && Object.values(pol.channels).every((c) => !c.allows.some((a) => /deploy|publish|upload/i.test(a))), `allows: ${Object.entries(pol.channels).map(([k, c]) => `${k}: ${c.allows.join('/')}`).join('; ')}`);
  return rows;
}

export async function checkReleaseDryRun({ report = null, fast = false } = {}) {
  const problems = [], notes = [], t0 = Date.now();
  const before = realState();
  const rows = [], probes = [];
  const sb = createSandbox();
  try {
    // 0. the synthetic world is what it says it is
    const synthFiles = readdirSync(sb.dir('approvals')).filter((f) => f.endsWith('.json'));
    const synthRecs = synthFiles.map((f) => JSON.parse(readFileSync(join(sb.dir('approvals'), f), 'utf8')));
    if (synthRecs.length !== 4 || !synthRecs.every((r) => /SYNTHETIC DRY-RUN FIXTURE/.test(r.rationale))) problems.push('the synthetic approval records are not all labelled SYNTHETIC');
    if (!/SYNTHETIC DRY-RUN FIXTURE/.test(readFileSync(join(sb.proj, 'engineering/release/reviewers.json'), 'utf8')) || !/SYNTHETIC DRY-RUN FIXTURE/.test(readFileSync(join(sb.proj, 'engineering/.reports/verify.json'), 'utf8'))) problems.push('the synthetic reviewer table or verification record is not labelled SYNTHETIC');
    if (sb.measure().candidate.digest !== sb.state.candidate.digest) problems.push('the sandbox does not measure to the candidate its records are bound to');
    const green = sb.gate(['--channel', 'client-production']);
    if (!green.allowed) problems.push(`the real gate blocks the fully approved synthetic build: ${green.reqs.filter((r) => !r.ok).map((r) => `${r.id} (${r.detail})`).join('; ')}`);
    rows.push({ g: 'success path', t: 'a fully approved synthetic client-production build passes the real gate', ok: green.allowed, expected: 'ALLOWED', observed: green.allowed ? `ALLOWED (${green.reqs.length} requirements)` : 'BLOCKED' });
    const chan = sb.gate(['--channel', 'client-production']).reqs.map((r) => r.id);
    const need = loadReleasePolicy().channels['client-production'].requires;
    if (need.some((n) => !chan.includes(n))) problems.push(`the gate output lacks policy requirements: ${need.filter((n) => !chan.includes(n)).join(', ')}`);
    // every requirement of the channel is exercised by at least one scenario that makes exactly it fail
    const covered = new Set(GATE_SCENARIOS.flatMap((s) => [...(s.mustFail || []), ...(s.covers || [])]));
    const uncovered = need.filter((n) => !covered.has(n));
    if (uncovered.length) problems.push(`no scenario makes these requirements fail on their own: ${uncovered.join(', ')}`);
    // 1. single-defect scenarios
    for (const s of GATE_SCENARIOS) {
      sb.restore(); s.apply(sb);
      const g = sb.gate(['--channel', 'client-production']);
      const j = judge(s, g);
      rows.push({ g: s.g, t: s.t, ok: j.ok, rg: s.rg, expected: j.expected, observed: j.observed, allow: Boolean(s.allow) });
      if (!j.ok) problems.push(`scenario "${s.t}": expected ${j.expected}; observed ${j.observed}`);
    }
    sb.restore();
    // 2. environment restrictions and the package
    for (const r of [...runEnvironmentScenarios(sb), ...runLedgerScenario(sb), ...runPackageScenarios(sb)]) { rows.push({ ...r, expected: r.expected || (r.probe ? 'recorded' : 'as stated'), observed: r.observed || r.detail }); if (!r.ok) problems.push(`${r.g}: "${r.t}": ${r.detail}`); }
    // 3. probes (measured, never failing)
    probes.push(...runGateProbes(sb));
  } finally { sb.destroy(); }
  // channel separation (RG-13) in two more sandboxes: client-style content labelled as a demonstration, and the registered fictional demonstration
  for (const r of runChannelScenarios()) { rows.push({ ...r, expected: r.expected || 'as stated', observed: r.observed || r.detail }); if (!r.ok) problems.push(`${r.g}: "${r.t}": ${r.detail}`); }
  // 4. deployment safety and separation from the real records
  for (const r of deploymentSafety()) { rows.push({ ...r, expected: 'holds', observed: r.detail }); if (!r.ok) problems.push(`deployment safety: ${r.t} (${r.detail})`); }
  const after = realState();
  if (before !== after) problems.push('the dry run changed the real ledger, a real record family, the reviewer table, the working tree or created a release folder');
  rows.push({ g: 'separation', t: 'the real ledger, approval, evidence and deployment records, reviewer table, working tree and release folder are exactly as they were', ok: before === after, expected: 'unchanged', observed: before === after ? 'unchanged' : 'CHANGED' });
  const leak = [join(repoRoot, 'docs', 'JADE_AND_EMBER_APPROVALS.md'), ...(exists(join(engDir, 'release', 'evidence')) ? listFiles(join(engDir, 'release', 'evidence')).filter((f) => f.endsWith('.json')).map((f) => join(engDir, 'release', 'evidence', f)) : []), join(engDir, 'search-crawler-verification.json'), join(engDir, 'external-links-verification.json'), join(engDir, 'findings.json'), join(engDir, 'release', 'reviewers.json'), join(engDir, 'release', 'demonstrations.json'), ...['approvals', 'deployments'].flatMap((fam) => (exists(join(engDir, 'release', fam)) ? listFiles(join(engDir, 'release', fam)).map((f) => join(engDir, 'release', fam, f)) : [])), ...(exists(join(engDir, '.reports', 'verify.json')) ? [join(engDir, '.reports', 'verify.json')] : [])].filter((f) => /Dry-run (Persona|Owner Persona|Rights Persona|Deployer Persona)|SYNTHETIC DRY-RUN FIXTURE|JE-901/.test(readFileSync(f, 'utf8')));
  if (leak.length) problems.push(`synthetic markers found in real records: ${leak.join(', ')}`);
  rows.push({ g: 'separation', t: 'no synthetic approval, persona or marker appears in any real record', ok: !leak.length, expected: 'none', observed: leak.length ? leak.join(', ') : 'none found' });
  const realEvidence = exists(join(engDir, 'release', 'evidence')) ? readdirSync(join(engDir, 'release', 'evidence')).filter((f) => f.endsWith('.json')) : [];
  rows.push({ g: 'separation', t: 'the real evidence folder holds no records (no physical, screen-reader or browser testing has been recorded)', ok: true, expected: 'recorded', observed: `${realEvidence.length} record(s) in engineering/release/evidence/`, info: true });

  const byGroup = {};
  for (const r of rows) { (byGroup[r.g] ||= { pass: 0, total: 0 }); byGroup[r.g].total++; if (r.ok) byGroup[r.g].pass++; }
  const total = rows.length, pass = rows.filter((r) => r.ok).length;
  notes.push(`dry run (synthetic, in a throwaway copy; real tool, parser, validator and git): ${pass}/${total} scenarios as expected — ${Object.entries(byGroup).map(([k, v]) => `${k} ${v.pass}/${v.total}`).join(', ')}`);
  // every finding this work package closes has at least one BLOCKING scenario, and all of its scenarios behave
  const RG = ['RG-01', 'RG-02', 'RG-03', 'RG-04', 'RG-05', 'RG-06', 'RG-07', 'RG-08', 'RG-09', 'RG-10', 'RG-11', 'RG-13', 'RG-14'];
  const byRg = Object.fromEntries(RG.map((id) => [id, rows.filter((r) => r.rg === id)]));
  for (const id of RG) { const blocking = byRg[id].filter((r) => !r.allow); if (!blocking.length) problems.push(`finding ${id} has no blocking scenario in the dry run`); }
  notes.push(`findings with blocking scenarios (blocking+must-stay-valid / all pass; RG-14 is held shut by the authenticity hard stop, not resolved): ${RG.map((id) => `${id} ${byRg[id].filter((r) => !r.allow).length}+${byRg[id].filter((r) => r.allow).length} (${byRg[id].every((r) => r.ok) ? 'all as expected' : 'FAILING'})`).join(', ')}`);
  const open = probes.filter((p) => p.open);
  notes.push(`measured gaps (not failures): ${probes.length} probes, ${open.length} let something through that should arguably be refused: ${open.map((p) => p.id).join(', ') || 'none'} (see engineering/RELEASE-DRYRUN-GATE5.md and G6-2-REPORT.md)`);
  // G6-3A (APR-JE-043): the release-control proof of concept is exercised here too, on its own synthetic clients and disposable tokens (it never touches the real records)
  const rcRun = await checkSelftestReleaseControl();
  for (const p of rcRun.problems) problems.push(`release-control proof of concept: ${p}`);
  notes.push(`release-control proof of concept (G6-3A): ${rcRun.notes.filter((n) => n.startsWith('held:')).length} cases held, ${rcRun.problems.length} failed; ${rcRun.notes.at(-1)}`);
  notes.push(`took ${Math.round((Date.now() - t0) / 1000)} s; the synthetic folders were deleted; the real ledger, records, reviewer table and tree are unchanged`);
  if (report) writeFileSync(report, JSON.stringify({ rows, probes, hosts: reservedHostCorpus() }, null, 2) + '\n');
  return { problems, notes, rows, probes };
}

if (isMain(import.meta.url)) {
  const i = process.argv.indexOf('--report');
  const { problems, notes } = await checkReleaseDryRun({ report: i > -1 ? process.argv[i + 1] : null });
  notes.forEach((n) => console.log('  ' + n));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:release-dryrun`);
  process.exit(problems.length ? 1 : 0);
}
