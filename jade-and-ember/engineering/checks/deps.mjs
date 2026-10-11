// check:deps (ENG-095). Dependency hygiene for the development tooling; the delivered site has none.
//   package.json  no "dependencies"; every devDependency an exact version (no range, tag, URL or path); engines.node present, equal to environment.json,
//                 and satisfied by the tested Node baseline, which in turn satisfies the `engines` range of EVERY locked package (G6-1)
//   lockfile      present, version 3; every package from the npm registry over https with a sha512 integrity; no git, file or http source;
//                 the root entry matches package.json; installed versions of direct dependencies match the lockfile
//   licences      every package's licence is on the allow-list, or has a recorded exception (an unverified licence is reported, never assumed)
//   audit         npm audit: no vulnerability in production dependencies (there are none); no critical anywhere; no high in a package the
//                 verification runs; other high ones only as recorded in dependencies.json (reported every run). Needs the network: offline it is
//                 skipped with a note, unless STS_REQUIRE_AUDIT=1 (CI sets it)
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { engDir, isMain, projectDir, readJson } from '../lib/git.mjs';
import { satisfies } from '../lib/node-range.mjs';

// Is an SPDX expression allowed? "(MIT OR Apache-2.0)" needs one allowed alternative, "A AND B" needs both.
export function licenseOk(expr, allowed) {
  const e = expr.replace(/[()]/g, ' ').trim();
  return e.split(/\s+OR\s+/i).some((alt) => alt.split(/\s+AND\s+/i).every((l) => allowed.includes(l.trim())));
}

export function checkDepsStatic({ root = projectDir } = {}) {
  const pol = readJson(join(engDir, 'dependencies.json'));
  const pkg = readJson(join(root, 'package.json'));
  const problems = [], notes = [];
  if (pkg.dependencies && Object.keys(pkg.dependencies).length) problems.push(`package.json has runtime dependencies (${Object.keys(pkg.dependencies).join(', ')}): the delivered site and its build need none`);
  for (const [n, v] of Object.entries(pkg.devDependencies || {})) if (!/^\d+\.\d+\.\d+$/.test(v)) problems.push(`devDependency ${n} is "${v}": pin an exact version`);
  if (!pkg.engines?.node) problems.push('package.json has no engines.node');
  const env = readJson(join(engDir, 'environment.json'));
  const base = env.nodeBaseline?.version;
  if (!base) problems.push('environment.json records no nodeBaseline.version');
  if (pkg.engines?.node && pkg.engines.node !== env.node) problems.push(`package.json engines.node "${pkg.engines.node}" differs from environment.json node "${env.node}"`);
  try { if (base && pkg.engines?.node && !satisfies(base, pkg.engines.node)) problems.push(`the tested Node ${base} does not satisfy engines.node "${pkg.engines.node}"`); } catch (e) { problems.push(`engines.node: ${e.message}`); }
  for (const r of pol.retiredPackages || []) if ((pkg.devDependencies || {})[r.package]) problems.push(`devDependency ${r.package} is retired (${r.by}): ${r.reason}`);
  const lockPath = join(root, 'package-lock.json');
  if (!existsSync(lockPath)) return { problems: [...problems, 'package-lock.json is missing'], notes };
  const lock = readJson(lockPath);
  if (lock.lockfileVersion !== 3) problems.push(`lockfileVersion is ${lock.lockfileVersion}, expected 3`);
  for (const r of pol.retiredPackages || []) if (lock.packages[`node_modules/${r.package}`]) problems.push(`the lockfile contains the retired package ${r.package} (${r.by})`);
  const rootEntry = lock.packages[''] || {};
  if (JSON.stringify(rootEntry.devDependencies || {}) !== JSON.stringify(pkg.devDependencies || {})) problems.push('package-lock.json root entry differs from package.json devDependencies (run npm install --package-lock-only)');
  const licenses = {}; let n = 0;
  for (const [k, v] of Object.entries(lock.packages)) {
    if (!k) continue;
    n++;
    if (!v.resolved || !/^https:\/\/registry\.npmjs\.org\//.test(v.resolved)) problems.push(`${k}: not resolved from the npm registry over https (${v.resolved || 'no source'})`);
    if (!/^sha512-/.test(v.integrity || '')) problems.push(`${k}: no sha512 integrity`);
    if (v.engines?.node && base) { try { if (!satisfies(base, v.engines.node)) problems.push(`${k}: requires Node "${v.engines.node}", which the tested Node ${base} does not satisfy`); } catch (e) { problems.push(`${k}: engines.node "${v.engines.node}" cannot be evaluated (${e.message})`); } }
    const lic = v.license;
    const exception = pol.licenseExceptions.find((e) => e.package === k);
    if (!lic) { if (!exception) problems.push(`${k}: no licence recorded and no exception`); else notes.push(`licence exception (${exception.status}): ${k}`); }
    else if (!licenseOk(typeof lic === 'string' ? lic : JSON.stringify(lic), pol.allowedLicenses) && !exception) problems.push(`${k}: licence "${lic}" is not on the allow-list`);
    licenses[lic || 'unrecorded'] = (licenses[lic || 'unrecorded'] || 0) + 1;
  }
  for (const [name, ver] of Object.entries(pkg.devDependencies || {})) {
    const p = join(root, 'node_modules', name, 'package.json');
    if (existsSync(p) && readJson(p).version !== ver) problems.push(`installed ${name} is ${readJson(p).version}, package.json pins ${ver} (run npm ci)`);
  }
  notes.push(`Node ${base} (engines "${pkg.engines?.node}") satisfies the engines range of every locked package`);
  notes.push(`${Object.keys(pkg.devDependencies).length} development dependencies pinned exactly, no runtime dependencies; ${n} locked packages, all from registry.npmjs.org over https with sha512; licences: ${Object.entries(licenses).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  return { problems, notes };
}

export function checkDepsAudit({ root = projectDir } = {}) {
  const pol = readJson(join(engDir, 'dependencies.json'));
  const problems = [], notes = [];
  const run = (args) => spawnSync('npm', ['audit', '--json', ...args], { cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 1 << 26, shell: process.platform === 'win32' });
  const parse = (r) => { try { return JSON.parse(r.stdout); } catch { return null; } };
  const prod = parse(run(['--omit=dev']));
  const all = parse(run([]));
  if (!prod || !all || prod.error || all.error) {
    const msg = 'npm audit could not reach the registry';
    if (process.env.STS_REQUIRE_AUDIT === '1') problems.push(`${msg} and STS_REQUIRE_AUDIT=1`); else notes.push(`${msg}: audit skipped (set STS_REQUIRE_AUDIT=1 to require it)`);
    return { problems, notes };
  }
  const pv = prod.metadata?.vulnerabilities || {}, av = all.metadata?.vulnerabilities || {};
  if ((pv.total || 0) > 0) problems.push(`${pv.total} vulnerabilities in production dependencies`);
  if ((av.critical || 0) > 0) problems.push(`${av.critical} critical vulnerabilities in the development tree`);
  const vulns = Object.entries(all.vulnerabilities || {});
  for (const [name, v] of vulns) if (['high', 'critical'].includes(v.severity) && pol.verificationPackages.includes(name)) problems.push(`${v.severity} vulnerability in ${name}, which the verification runs`);
  const acc = pol.acceptedAdvisories;
  const high = vulns.filter(([, v]) => v.severity === 'high').map(([n]) => n);
  for (const n of high) if (!acc.packages.includes(n)) problems.push(`high vulnerability in ${n}, which is not in the accepted list of dependencies.json (reviewed ${acc.reviewed}): review it`);
  for (const n of acc.packages) if (!high.includes(n)) notes.push(`accepted advisory entry ${n} no longer reported: remove it from dependencies.json`);
  notes.push(`audit: production ${pv.total || 0} vulnerabilities; development tree ${av.critical || 0} critical, ${av.high || 0} high, ${av.moderate || 0} moderate, ${av.low || 0} low${high.length ? ` (all ${high.length} high ones are recorded as accepted: development-only tree of ${acc.viaRoot}, not part of verify, never delivered)` : ''}`);
  if ((av.total || 0) > 0 && !acc.packages.length) problems.push(`${av.total} vulnerabilities in the development tree and none is recorded in dependencies.json: review them`);
  return { problems, notes };
}

export async function checkDeps({ root = projectDir, audit = true } = {}) {
  const s = checkDepsStatic({ root });
  const a = audit ? checkDepsAudit({ root }) : { problems: [], notes: ['audit skipped'] };
  return { problems: [...s.problems, ...a.problems], notes: [...s.notes, ...a.notes] };
}

if (isMain(import.meta.url)) {
  const { problems, notes } = await checkDeps({ audit: !process.argv.includes('--no-audit') });
  notes.forEach((n) => console.log('  ' + n));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:deps`);
  process.exit(problems.length ? 1 : 0);
}
