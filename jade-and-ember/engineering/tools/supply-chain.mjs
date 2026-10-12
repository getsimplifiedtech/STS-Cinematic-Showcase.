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

// -> { reached, advisories[] }
function audit() {
  const r = npm(['audit', '--json']);
  let j = null; try { j = JSON.parse(r.stdout); } catch { /* unreachable */ }
  if (!j || j.error || !j.metadata) return { reached: false, advisories: [] };
  const seen = new Map();
  for (const v of Object.values(j.vulnerabilities || {})) for (const via of v.via || []) if (via && typeof via === 'object') {
    const id = ghsa(via.url);
    if (id) seen.set(`${via.name}|${id.toLowerCase()}`, { package: via.name, severity: via.severity, advisory: id.toUpperCase() });
  }
  return { reached: true, advisories: [...seen.values()].sort((a, b) => (a.package + a.advisory < b.package + b.advisory ? -1 : 1)) };
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
  const inActions = process.env.GITHUB_ACTIONS === 'true';
  let kind = 'sandbox', description = 'a run with no registry access: npm audit and npm audit signatures could not be answered, so nothing is recorded as verified';
  if (reached) {
    if (inActions) { kind = 'github-actions'; description = 'GitHub-hosted runner with outbound network; npm audit and npm audit signatures answered by the registry'; }
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
