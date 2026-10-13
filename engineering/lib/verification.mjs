// The verification record (G6-2, APR-JE-039; design in G6-2-DESIGN.md section 7). `npm run verify` writes it; the release gate judges it; a CI run summarises it
// in an evidence record. It replaces the old report whose only gate-relevant fields were { mode, passed, commit, dirty, assetsTree }, which anyone could write by hand.
//
// A record is bound to the CANDIDATE artifact digest (not to a commit), carries the digest of the verifying code (engineDigest), lists EVERY check the
// verifier defines (registryDigest) with its result, and is sealed. The seal is a SHA-256 of the other fields: it makes a hand-edit or an incomplete record
// detectable and a complete forgery deliberate work. It is not a secret and not a signature: see the design, section 7 (residual) and section 12.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { canonicalJson, sha } from './candidate.mjs';
import { coreDir, loadProject, project, schemaId } from './project.mjs';
import { registryIds } from './registry.mjs';

export const VERIFY_SCHEMA = schemaId('verification@1');

// Everything that decides what a check does or what the gate judges, as POSIX paths: the engineering folder's .mjs and .json (labelled relative to it), and the
// code those checks import or run outside it (project/ and repo/ labels; the engineering folder holds no folder of those names): the build, the shared source libraries (configuration, search, crawler policy), the browser
// test helpers, the server script, package.json, the CI workflows and the composite actions (and, in the engineering folder, the shell scripts the action runs). NOT code: the record families, the reviewer table, the demonstration registry, the reports,
// the evidence folders, the governance ledgers and documents (recording or reviewing a release must not invalidate a verification).
// Exclusions are EXACT paths, not names matched at any depth (a folder that happened to be called `files` could otherwise hide code; G6-2 review, F6).
// 'fixtures' holds the framework's own projects (the generic fixture): a project is not part of the engine, its engine files are the ones its manifest names (engine.projectFolders, engine.projectFiles).
const EXCLUDE_PATH = new Set(['.reports', 'node_modules', 'fixtures', 'evidence', 'g6-1-evidence', 'g6-2-evidence', 'release/approvals', 'release/evidence', 'release/deployments', 'release/reviewers.json', 'release/demonstrations.json', 'framework-migration-matrix.json', 'gate5-closure.json', 'external-links-verification.json', 'supply-chain-verification.json']);
// The project an engineering folder serves: the running one, or the one named by `root` (a throwaway copy of both), or the one that contains the folder (a project that carries its own engineering).
const projectOf = (eng, root) => (root ? loadProject(root) : eng === coreDir ? project : loadProject(join(eng, '..')));
export function engineFiles(eng = coreDir, projectRoot = null) {
  const out = [];
  const walk = (base, rel, label, exclude = null) => {
    const d = rel ? join(base, rel) : base;
    for (const name of readdirSync(d).sort()) {
      const r = rel ? `${rel}/${name}` : name, p = join(base, r);
      if (exclude?.has(r)) continue;
      if (statSync(p).isDirectory()) { if (name !== '__pycache__') walk(base, r, label, exclude); continue; }
      if (/\.(mjs|json|py|ya?ml|sh)$/.test(name)) out.push(`${label}${r}`);
    }
  };
  walk(eng, '', '', EXCLUDE_PATH);
  const proj = projectOf(eng, projectRoot), root = proj.root, repo = proj.repoRoot;   // the project that owns this engineering folder (a throwaway copy has its own)
  // The project's own overlays of the standards (an overlay is part of the rule set the gate judges by) and its evidence specification: always covered, whichever layout the project has
  // (a file the walk above already reached is not counted twice).
  const abs = (f) => (f.startsWith('project/') ? join(root, f.slice(8)) : f.startsWith('repo/') ? join(repo, f.slice(5)) : join(eng, f));
  const seen = new Set(out.map(abs));
  const stdDir = join(eng, 'standards');
  const stdFiles = existsSync(stdDir) ? (function names(d, rel = '') { return readdirSync(d).sort().flatMap((n) => (statSync(join(d, n)).isDirectory() ? names(join(d, n), `${rel}${n}/`) : n.endsWith('.json') ? [`${rel}${n}`] : [])); })(stdDir) : [];
  for (const rel of [...stdFiles, 'release/evidence-spec.json']) {
    const f = join(proj.engDir, ...rel.split('/'));
    if (existsSync(f) && !seen.has(f)) { out.push(`project/${relative(root, f).split(sep).join('/')}`); seen.add(f); }
  }
  for (const sub of proj.engine.projectFolders) if (existsSync(join(root, sub))) walk(root, sub, 'project/');
  for (const f of proj.engine.projectFiles) if (existsSync(join(root, f))) out.push(`project/${f}`);
  if (existsSync(join(repo, '.github', 'workflows'))) walk(repo, '.github/workflows', 'repo/');
  if (existsSync(join(repo, '.github', 'actions'))) walk(repo, '.github/actions', 'repo/');   // G6-7: the composite action decides how the engineering is run
  return [...new Set(out)].sort();
}
const pathOf = (eng, f, projectRoot = null) => { const proj = projectOf(eng, projectRoot); return f.startsWith('project/') ? join(proj.root, f.slice(8)) : f.startsWith('repo/') ? join(proj.repoRoot, f.slice(5)) : join(eng, f); };
export function engineDigest(eng = coreDir, projectRoot = null) {
  return sha(engineFiles(eng, projectRoot).map((f) => `${sha(readFileSync(pathOf(eng, f, projectRoot)))}  ${f}`).join('\n') + '\n');
}

// Every check id the verifier defines (a full run must contain all of them), read from the check registry (checks.json, the project's industry adapter and its manifest)
// so a check added later is expected automatically.
export const expectedCheckIds = (eng = coreDir, projectRoot = null) => registryIds({ coreRoot: eng, manifest: projectOf(eng, projectRoot).manifest });
export const registryDigest = (ids) => sha(canonicalJson([...ids].sort()));

export const sealOf = (rec) => { const { seal, ...rest } = rec; return sha(canonicalJson(rest)); };

export function buildVerificationRecord({ mode, results, candidate, engine, registry, commit, dirty, startedAt, finishedAt, env = process.env }) {
  const rec = {
    schema: VERIFY_SCHEMA, mode, passed: results.every((r) => r.passed),
    candidate: candidate.digest, channel: candidate.channel, version: candidate.version,
    engineDigest: engine, registryDigest: registry,
    source: { commit, dirty },
    checks: results.map((r) => ({ id: r.id, passed: r.passed, seconds: r.seconds })),
    // a check the project cannot run (it lacks what the check needs) is not a pass: it is listed here, only when there is one, and a release record cannot carry one
    ...(results.some((r) => r.notApplicable) ? { notApplicable: results.filter((r) => r.notApplicable).map((r) => r.id) } : {}),
    environment: { node: process.version, platform: process.platform, runner: env.GITHUB_ACTIONS === 'true' ? 'github-actions' : 'local', runId: env.GITHUB_ACTIONS === 'true' ? String(env.GITHUB_RUN_ID || '') : null },
    startedAt, finishedAt,
  };
  rec.seal = sealOf(rec);
  return rec;
}

// Returns [problem]. expect: { candidate, engineDigest, ids }.
export function validateVerification(rec, expect) {
  const p = [], bad = (m) => p.push(m);
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return ['no verification record: run npm run verify'];
  if (rec.schema !== VERIFY_SCHEMA) return [`not a verification record (schema ${JSON.stringify(rec.schema)}): the old report format is not accepted, run npm run verify`];
  // a closed record: no field the verifier did not write (the seal would cover it, so a stray field is a sign of a hand-built record; G6-2 review, F10)
  const KEYS = ['schema', 'mode', 'passed', 'candidate', 'channel', 'version', 'engineDigest', 'registryDigest', 'source', 'checks', 'notApplicable', 'environment', 'startedAt', 'finishedAt', 'seal'];
  const extraKeys = Object.keys(rec).filter((k) => !KEYS.includes(k));
  if (extraKeys.length) bad(`it carries fields the verifier does not write (${extraKeys.join(', ')})`);
  const env = rec.environment || {};
  if (typeof env.node !== 'string' || typeof env.platform !== 'string' || !['local', 'github-actions'].includes(env.runner) || (env.runner === 'github-actions' ? !/^\d{6,}$/.test(String(env.runId || '')) : env.runId !== null)) bad('environment (node, platform, runner, runId) is missing or malformed');
  if (Object.keys(rec.source || {}).some((k) => !['commit', 'dirty'].includes(k)) || !/^[0-9a-f]{40}$/.test(rec.source?.commit || '')) bad('source must be { commit (40 hex), dirty }');
  if (rec.seal !== sealOf(rec)) bad('the seal does not match the record: it was edited, or not written by npm run verify');
  if (rec.mode !== 'full') bad(`mode is ${rec.mode}: only a full run counts`);
  if (rec.passed !== true) bad('the run did not pass');
  if (rec.candidate !== expect.candidate) bad('it verified a different candidate artifact (the digest differs): run npm run verify on this build');
  if (rec.engineDigest !== expect.engineDigest) bad('it was made by different verification code (engineDigest differs): run npm run verify again');
  if (rec.source?.dirty !== false) bad('it was run on a working tree with uncommitted changes');
  const checks = Array.isArray(rec.checks) ? rec.checks : [];
  if (checks.some((c) => !c || typeof c.id !== 'string' || typeof c.passed !== 'boolean' || Object.keys(c).some((k) => !['id', 'passed', 'seconds'].includes(k)))) bad('a check entry is not { id, passed, seconds }');
  const ids = checks.map((c) => c.id);
  const missing = expect.ids.filter((i) => !ids.includes(i)), extra = ids.filter((i) => !expect.ids.includes(i));
  if (missing.length) bad(`incomplete: ${missing.length} check(s) the verifier defines are missing (${missing.slice(0, 4).join(', ')}${missing.length > 4 ? ', …' : ''})`);
  if (extra.length) bad(`it lists checks the verifier does not define (${extra.slice(0, 3).join(', ')})`);
  if (new Set(ids).size !== ids.length) bad('a check is listed twice');
  if (rec.notApplicable !== undefined) bad(`checks that were not applicable to the project, so not run: ${Array.isArray(rec.notApplicable) ? rec.notApplicable.slice(0, 4).join(', ') : '(malformed)'}; a release record needs every check to apply`);
  const failing = checks.filter((c) => c.passed !== true).map((c) => c.id);
  if (failing.length) bad(`failing checks: ${failing.slice(0, 4).join(', ')}`);
  if (rec.registryDigest !== registryDigest(expect.ids)) bad('registryDigest is not the digest of the checks the verifier defines');
  return p;
}

// The summary a CI-run evidence record carries (and a person copies from the job log).
export const summaryOf = (rec) => ({ candidate: rec.candidate, engineDigest: rec.engineDigest, registryDigest: rec.registryDigest, checks: { total: rec.checks.length, passed: rec.checks.filter((c) => c.passed).length }, seal: rec.seal, runner: rec.environment.runner, runId: rec.environment.runId, node: rec.environment.node });
