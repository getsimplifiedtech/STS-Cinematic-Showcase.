// node engineering/tools/supply-chain.mjs record [--write] [--runner person --note "where and by whom"] [--run <url>]      (npm run supply:record)
// Runs `npm audit --json` and `npm audit signatures` against the installed tree (both need the registry) and prints a supply-chain verification record for this lockfile and
// this build's composite SBOM. With --write it appends the record to engineering/supply-chain-verification.json (history; nothing is overwritten).
//   Who is named as the runner is not guessed: inside GitHub Actions it is `github-actions`; anywhere else the person running it must say so (--runner person --note ...);
//   when the registry cannot be reached the record is a `sandbox` record, which the release gate never counts. A record is evidence of a run, not proof of who made it.
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { assembleCandidate } from '../lib/site.mjs';
import { engDir, projectDir } from '../lib/git.mjs';
import { attachBuild, collectContext } from '../lib/release.mjs';
import { SUPPLY_FILE, SEVERITIES, supplyRecordProblems } from '../lib/supply.mjs';

const arg = (n) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null; };
const flag = (n) => process.argv.includes(n);
if (process.argv[2] !== 'record') { console.error('usage: supply-chain.mjs record [--write] [--runner person --note "text"] [--run <url>]'); process.exit(2); }

const npm = (args) => spawnSync('npm', args, { cwd: projectDir, encoding: 'utf8', timeout: 180000, maxBuffer: 1 << 26, shell: process.platform === 'win32' });
const ghsa = (url) => (/(GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4})/i.exec(url || '') || [])[1] || null;

// -> { reached, advisories[], unparsed[] }. Every advisory npm reports must be recorded: a vulnerable package whose advisories carry no GHSA id (or whose count disagrees
// with npm's own totals) is reported as UNPARSED and the tool refuses to write a record, so nothing is dropped silently.
function audit() {
  const r = npm(['audit', '--json']);
  let j = null; try { j = JSON.parse(r.stdout); } catch { /* unreachable */ }
  if (!j || j.error || !j.metadata) return { reached: false, advisories: [], unparsed: [] };
  const seen = new Map(), unparsed = [];
  for (const [name, v] of Object.entries(j.vulnerabilities || {})) {
    const direct = (v.via || []).filter((via) => via && typeof via === 'object');
    for (const via of direct) {
      const id = ghsa(via.url);
      if (id) seen.set(`${via.name}|${id.toLowerCase()}`, { package: via.name, severity: via.severity, advisory: id.toUpperCase() });
      else unparsed.push(`${name}: an advisory with no GHSA id (${via.url || via.title || 'no url'})`);
    }
    if (!direct.length && !(v.via || []).some((x) => typeof x === 'string' && j.vulnerabilities[x])) unparsed.push(`${name}: reported vulnerable with no advisory to record`);
  }
  const reportedTotal = j.metadata?.vulnerabilities?.total;
  if (Number.isInteger(reportedTotal) && reportedTotal !== Object.keys(j.vulnerabilities || {}).length) unparsed.push(`npm reports ${reportedTotal} vulnerable packages but lists ${Object.keys(j.vulnerabilities || {}).length}`);
  return { reached: true, advisories: [...seen.values()].sort((a, b) => (a.package + a.advisory < b.package + b.advisory ? -1 : 1)), unparsed };
}
function signatures() {
  const r = npm(['audit', 'signatures']);
  const out = `${r.stdout}\n${r.stderr}`;
  const num = (re) => { const m = re.exec(out); return m ? Number(m[1]) : 0; };
  const total = num(/audited (\d+) packages?/i);
  if (!total) return { reached: false, total: 0, verified: 0, failed: 0, missing: 0 };
  return { reached: true, total, verified: num(/(\d+) packages? have verified registry signatures/i), failed: num(/(\d+) packages? have invalid registry signatures/i), missing: num(/(\d+) packages? have missing registry signatures/i) };
}

const dir = assembleCandidate(projectDir, 'supply');
try {
  const ctx = attachBuild(collectContext(), dir);
  const a = audit(), s = signatures();
  const reached = a.reached && s.reached;
  if (a.unparsed.length) { console.error(`REFUSED: npm audit reported something this tool cannot record faithfully:\n  ${a.unparsed.join('\n  ')}\nNothing was written; record it by hand after review, or fix the tool.`); process.exit(1); }
  const e = process.env;
  const inActions = e.GITHUB_ACTIONS === 'true' && Boolean(e.GITHUB_RUN_ID && e.GITHUB_REPOSITORY && e.GITHUB_SHA);   // (still self-reported: an environment variable is not proof)
  let kind = 'sandbox', description = 'a run with no registry access: npm audit and npm audit signatures could not be answered, so nothing is recorded as verified';
  if (reached) {
    if (inActions) { kind = 'github-actions'; description = `GitHub Actions run ${e.GITHUB_RUN_ID} of ${e.GITHUB_REPOSITORY} at ${e.GITHUB_SHA.slice(0, 7)} with outbound network, as reported by its environment variables (not authenticated); npm audit and npm audit signatures answered by the registry`; }
    else if (arg('--runner') === 'person' && (arg('--note') || '').trim().length >= 10) { kind = 'person'; description = arg('--note'); }
    else { console.error('The registry answered, but who ran this is not guessed: pass --runner person --note "where and by whom" (inside GitHub Actions the runner is recorded automatically).'); process.exit(2); }
  }
  const count = Object.fromEntries(SEVERITIES.map((k) => [k, a.advisories.filter((x) => x.severity === k).length]));
  const record = {
    id: 'SCV-0', date: new Date().toISOString().slice(0, 10),
    runner: { kind, description, ...(inActions && process.env.GITHUB_RUN_ID ? { run: `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` } : arg('--run') ? { run: arg('--run') } : {}) },
    lockfileSha256: ctx.lock.sha256, sbomSha256: ctx.sbomSha256,
    audit: { total: a.advisories.length, ...count, advisories: a.advisories },
    signatures: reached ? { total: s.total, verified: s.verified, failed: s.failed, missing: s.missing } : { total: ctx.lock.packages, verified: 0, failed: 0, missing: ctx.lock.packages },
  };
  const path = join(engDir, SUPPLY_FILE);
  const file = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { records: [] };
  record.id = `SCV-${file.records.length + 1}`;
  const problems = supplyRecordProblems({ file: { records: [record] }, today: record.date });
  console.log(JSON.stringify(record, null, 2));
  console.error(`\n${reached ? 'networked run' : 'NO REGISTRY ACCESS: a sandbox record'}; ${a.advisories.length} advisories; ${record.signatures.verified} of ${record.signatures.total} registry signatures verified; SBOM ${ctx.sbomSha256.slice(0, 12)}…${problems.length ? `\nTHE RECORD IS NOT VALID: ${problems[0]}` : ''}`);
  if (flag('--write')) {
    if (problems.length) { console.error('not written'); process.exit(1); }
    file.records.push(record);
    writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);
    console.error(`appended ${record.id} to engineering/${SUPPLY_FILE}`);
  }
} finally { rmSync(dir, { recursive: true, force: true }); }
