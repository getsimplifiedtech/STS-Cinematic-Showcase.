// check:ci. The GitHub Actions workflow keeps its promises (decision D-4, APR-JE-022): read-only, minimal permissions, no deployment, no merge,
// no secrets, no AI or paid service, reproducible. The workflow is parsed as YAML and checked structurally; CI.md must document the runner.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { parse } from 'yaml';
import { engDir, isMain, projectDir, readJson, repoRoot } from '../lib/git.mjs';
import { coreDir, project, workflowPath } from '../lib/project.mjs';
import { satisfies } from '../lib/node-range.mjs';
import { policy } from '../lib/policy.mjs';
import { directStyleAllowed, exceptionsFor, repositoryIdentity } from '../lib/ci-exceptions.mjs';
import { SNAPSHOT_RECORD, verifyRepo } from '../tools/snapshot.mjs';
import { PROTECTED_SHA256 } from './extraction.mjs';
import { ACTION_DIR, ACTION_USES, LOCAL_ACTION, SNAPSHOT_REPOSITORIES, FORBIDDEN_TEXT, FRAMEWORK_REPOSITORY, SHA40 as SHA, actionProblems, jobShapeProblemsAll, triggerKeyProblems, callerProblems, ciContext, dependabotProblems, localCallProblems, otherWorkflowProblems, reusableProblems, scriptProblems } from '../lib/ci-policy.mjs';

// G6-7 (specification 16, section 10.8): the policy judges four kinds of workflow file, never fewer. A DIRECT workflow runs the verification itself (the rules below, unchanged). A CALLER (a client's)
// names the framework's composite action by a full commit SHA and carries nothing else (lib/ci-policy.mjs). The framework's own workflow CALLS its reusable workflow and may add direct jobs.
// A SCHEDULED caller is the inert template rendered. Any other workflow file must be declared, with its SHA-256 and the properties it was reviewed for, or it fails.
const sha256 = (t) => createHash('sha256').update(t).digest('hex');
const loadCtx = () => ciContext({ dependencies: policy('dependencies'), environment: policy('environment'), jobs: readJson(join(coreDir, 'ci', 'jobs.json')) });

function docProblems(extra = []) {
  const ci = existsSync(join(engDir, 'CI.md')) ? readFileSync(join(engDir, 'CI.md'), 'utf8') : '';
  return ['Runner requirements', 'Node', 'Chromium', 'ffmpeg', 'fetch-depth', 'read-only', 'ubuntu-24.04', ...extra].filter((need) => !ci.includes(need)).map((need) => `CI.md does not document "${need}"`);
}

export function checkCiFile(text, { docs = true, ctx = null, framework = false, direct = true, snapshot = false } = {}) {
  const problems = [], notes = [];
  const bad = (m) => problems.push(m);
  let wf;
  try { wf = parse(text); } catch (e) { return { problems: [`the workflow is not valid YAML: ${e.message}`], notes }; }
  if (!wf || typeof wf !== 'object' || Array.isArray(wf)) return { problems: ['the workflow is not a YAML mapping'], notes };
  // a CALLER (a client's workflow): the whole judgement is the caller policy; no step of the client's is judged by the direct rules because it has no step of its own
  const isCaller = Object.values(wf.jobs || {}).some((j) => (j?.steps || []).some((x) => String(x?.uses || '').startsWith(`${ACTION_USES}@`)));
  if (isCaller) {
    const r = callerProblems(text, ctx || loadCtx(), { kind: 'caller' });
    if (docs) problems.push(...docProblems(['composite action', 'full commit SHA']));
    notes.push(`caller workflow: every job names the framework's composite action by commit ${r.facts.sha ? r.facts.sha.slice(0, 12) + '…' : '(none)'} for project ${r.facts.projectDir ?? '(none)'}; no step of its own; permissions contents: read`);
    return { problems: [...r.problems, ...problems], notes };
  }
  // a SNAPSHOT caller (the one public consumer, G6-8): the same seven jobs through the verified local copy of the action
  if (Object.values(wf.jobs || {}).some((j) => (j?.steps || []).some((x) => x?.uses === LOCAL_ACTION))) {
    if (!snapshot) return { problems: [`the workflow uses ${LOCAL_ACTION}, the local copy of the framework's action; that is accepted only in a repository on the snapshot list that carries a verified snapshot (${SNAPSHOT_RECORD}), not in this one`], notes };
    const r = callerProblems(text, ctx || loadCtx(), { kind: 'caller', snapshot: true });
    if (docs) problems.push(...docProblems(['composite action', 'snapshot']));
    notes.push(`snapshot caller workflow: every job runs the verified local copy of the framework's composite action for project ${r.facts.projectDir ?? '(none)'}; no step of its own; permissions contents: read`);
    return { problems: [...r.problems, ...problems], notes };
  }
  problems.push(...triggerKeyProblems(wf, 'the workflow'), ...jobShapeProblemsAll(wf, 'the workflow'));
  if (!direct && !Object.values(wf.jobs || {}).some((j) => j && j.uses !== undefined)) bad('this repository must use the caller workflow rendered from the framework\'s template (jobs that use the composite action by commit SHA); a workflow with its own jobs is accepted only in the framework repository (ci/exceptions.json, which a consumer\'s snapshot does not carry); a public consumer uses the snapshot caller workflow rendered from the framework\'s template');
  const triggers = wf.on || wf.true || {};
  const trig = typeof triggers === 'string' ? [triggers] : Array.isArray(triggers) ? triggers : Object.keys(triggers);
  for (const t of ['pull_request_target', 'workflow_run', 'issue_comment', 'repository_dispatch', 'release', 'schedule']) if (trig.includes(t)) bad(`trigger ${t} is not allowed (privilege or surprise)`);
  const push = triggers.push;
  if (push) { const br = push.branches; if (!Array.isArray(br) || !br.length || br.some((b) => /[*]/.test(b) || b === 'main')) bad(`push must name the v0.9 development branch only (got ${JSON.stringify(br)})`); }
  const perms = wf.permissions;
  if (!perms || JSON.stringify(perms) !== JSON.stringify({ contents: 'read' })) bad(`top-level permissions must be exactly { contents: read } (got ${JSON.stringify(perms)})`);
  const jobs = wf.jobs || {};
  if (!Object.keys(jobs).length) bad('no jobs');
  let steps = 0, uses = 0;
  const nodeVersions = new Set();
  const pins = policy('dependencies').actions || {};
  const baseline = policy('environment').nodeBaseline || {};
  const engines = readJson(join(projectDir, 'package.json')).engines?.node || '';
  const calls = Object.entries(jobs).filter(([, j]) => j && j.uses !== undefined).map(([id]) => id);
  if (calls.length && !framework) bad('a job calls a reusable workflow, which only the framework repository\'s own workflow may do (a client uses the composite action by commit SHA)');
  let blocking = 0;
  for (const [id, job] of Object.entries(jobs)) {
    if (!job || typeof job !== 'object') continue;
    if (job.uses !== undefined) { problems.push(...localCallProblems(job, id, 'the workflow')); steps++; uses++; blocking++; continue; }
    if (job.if !== undefined) bad(`job ${id} has a condition (if); a job here always runs`);
    if (job.permissions && JSON.stringify(job.permissions) !== JSON.stringify({ contents: 'read' })) bad(`job ${id} widens permissions (${JSON.stringify(job.permissions)})`);
    if (!job['timeout-minutes'] || job['timeout-minutes'] > 60) bad(`job ${id} needs a timeout-minutes of at most 60`);
    const runsFull = (job.steps || []).some((x) => /npm run verify\b/.test(x.run || '') && !/verify:fast/.test(x.run || ''));
    const informational = job['continue-on-error'] === true && /informational/i.test(job.name || '') && !runsFull;   // only a named, fast-checks-only job may be allowed to fail
    const runsOn = JSON.stringify(job['runs-on']);
    const nameMajor = /\bNode (\d+)\b/.exec(job.name || '');
    if (nameMajor && baseline.version && nameMajor[1] !== baseline.version.split('.')[0]) bad(`job ${id} is named "${job.name}", but the tested Node is ${baseline.version}`);
    if (!informational && !nameMajor) bad(`blocking job ${id} must state its Node major in its name (for example "Node ${String(baseline.version).split('.')[0]}")`);
    if (!informational && /latest/.test(runsOn)) bad(`blocking job ${id} runs on a floating image (${runsOn}); pin the runner version`);
    if (!informational && job['continue-on-error'] !== undefined) bad(`job ${id}: continue-on-error is only allowed on a job named "(informational)" that runs the fast checks or the cross-browser runner only`);
    // a job that runs the cross-browser runner for an engine must install that engine (otherwise it would fail for the wrong reason, or pass nothing)
    for (const step of job.steps || []) {
      const m = /(?:engineering\/)?cross-browser\.mjs\s+--engine\s+(\w+)/.exec(step.run || '');
      if (m && !(job.steps || []).some((x) => new RegExp(`playwright install[^\\n]*\\b${m[1]}\\b`).test(x.run || ''))) bad(`job ${id} runs the ${m[1]} cross-browser runner but does not install ${m[1]} (npx playwright install --with-deps ${m[1]})`);
    }
    if (job.environment) bad(`job ${id} uses an environment (environments carry deployment secrets)`);
    for (const step of job.steps || []) {
      if (!step || typeof step !== 'object') { bad(`job ${id} has a step that is not a mapping`); continue; }
      steps++;
      if (step.if !== undefined) bad(`job ${id}: a step has a condition (if: ${String(step.if).slice(0, 30)}); steps here always run`);
      if (step['continue-on-error'] !== undefined) bad(`job ${id}: a step carries continue-on-error; only a whole informational job may be allowed to fail`);
      if (step.uses) {
        uses++;
        const [name, ref] = step.uses.split('@');
        if (!SHA.test(ref || '')) bad(`${step.uses} is not pinned to a full commit SHA`);
        else if (pins[name] && pins[name].sha !== ref) bad(`${name} is pinned to ${ref}, but dependencies.json records the verified Node 24 release ${pins[name].version} (${pins[name].sha})`);
        if (!['actions/checkout', 'actions/setup-node'].includes(name)) bad(`action ${name} is not on the allowed list (actions/checkout, actions/setup-node)`);
        if (name === 'actions/checkout' && step.with?.['persist-credentials'] !== false) bad('checkout must set persist-credentials: false');
        if (name === 'actions/checkout' && step.with?.['fetch-depth'] !== 0) bad('checkout must fetch the full history (fetch-depth: 0): the baseline branch is needed');
        if (name === 'actions/setup-node') {
          const nv = String(step.with?.['node-version'] || '');
          if (!/^\d+\.\d+\.\d+$/.test(nv)) bad('setup-node must pin an exact Node version');
          else {
            nodeVersions.add(nv);
            // G6-1: the one tested baseline. environment.json records it; package.json engines must accept it; every job must use it.
            if (nv !== baseline.version) bad(`setup-node pins Node ${nv}, but environment.json records the tested baseline ${baseline.version}`);
            try { if (!satisfies(nv, engines)) bad(`setup-node pins Node ${nv}, which package.json engines.node "${engines}" does not accept`); } catch (e) { bad(`engines.node cannot be evaluated: ${e.message}`); }
          }
        }
      }
      if (step.run) {
        if (/\$\{\{/.test(step.run)) bad(`a run script contains an expression (script injection risk): ${step.run.slice(0, 50)}`);
        for (const line of step.run.split('\n')) if (/\bnpm\s+(install|i)\b/.test(line) && !/npm\s+(ci)\b/.test(line)) bad(`use npm ci (lockfile), not: ${line.trim()}`);
        if (/\bnpm ci\b/.test(step.run) && !/--ignore-scripts/.test(step.run)) bad('npm ci must use --ignore-scripts');
        if (/\bnpm ci\b/.test(step.run) && !/--engine-strict/.test(step.run)) bad('npm ci must use --engine-strict (a package that does not support the pinned Node must fail the install, not warn)');
      }
      if (step.env && Object.keys(step.env).some((k) => /key|token|secret|password/i.test(k))) bad(`a step sets a credential-like environment variable: ${Object.keys(step.env).join(', ')}`);
    }
    // a blocking job runs the whole verification; beside a call of the reusable workflow (which runs it in its own blocking job) a job may instead run the caller-layout simulation
    // a blocking job runs the verification as a step whose whole command is `npm run verify` (nothing before or after it on the line, no ||, no &), or, beside a call of the
    // reusable workflow, the caller-layout simulation as exactly its command
    const simulates = calls.length > 0 && (job.steps || []).some((s) => /^node tools\/ci\/simulate-caller\.mjs( --snapshot)?( --install)?$/.test(String(s?.run || '').trim()));
    if (!informational) {
      blocking++;
      if (!simulates && !(job.steps || []).some((s) => String(s?.run || '').trim() === 'npm run verify')) bad(`blocking job ${id} must run npm run verify (the step's whole command, nothing else on the line)`);
      for (const s of job.steps || []) if (s?.run && /\|\||(^|[^&])&(?!&)\s*$|;\s*$/m.test(String(s.run))) bad(`blocking job ${id}: a step's command ignores or backgrounds a failure (||, a trailing & or ;): ${String(s.run).trim().slice(0, 60)}`);
    }
  }
  for (const [re, what] of FORBIDDEN_TEXT) { const cleaned = text.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n'); if (re.test(cleaned)) bad(`the workflow mentions ${what}`); }
  if (docs) {
    problems.push(...docProblems(calls.length ? ['composite action', 'full commit SHA'] : []));
    const pkg = readJson(join(projectDir, 'package.json'));
    for (const s of JSON.stringify(wf).matchAll(/npm run ([a-z:-]+)/g)) if (!pkg.scripts[s[1]]) bad(`the workflow runs "npm run ${s[1]}", which is not a package script`);
  }
  for (const [name, p] of Object.entries(pins)) if (name.includes('/') && p.runtime !== 'node24') bad(`${name} is recorded with runtime ${p.runtime}, not node24`);
  if (!blocking) bad('the workflow has no blocking job: at least one job must run the whole verification and be allowed to fail the run');
  if (framework && !calls.length) bad('the framework repository\'s workflow must call the reusable workflow (the same jobs a client\'s caller runs); it calls none');
  notes.push(`workflow: ${Object.keys(jobs).length} jobs${calls.length ? ` (${calls.length} calling the reusable workflow)` : ''}, ${steps} steps, ${uses} actions all pinned to commit SHAs; Node ${[...nodeVersions].join(', ')} in every job (tested baseline ${baseline.version}); permissions contents: read; no secrets, deployment, merge, publish, cloud or AI service; npm ci --ignore-scripts; timeouts set; documented in CI.md`);
  return { problems, notes };
}

export { directStyleAllowed, exceptionsFor, repositoryIdentity };

// The workflow files of a folder other than the judged one: the scheduled caller, the reusable workflow, the declared exceptions; anything else is a finding.
// `read(name)` returns the file's bytes; shared by check:ci and the release gate so that both judge a folder the same way.
export function otherWorkflowsProblems(names, read, mainFile, ci = project.ci, ctx = null, exceptions = exceptionsFor(repositoryIdentity())) {
  const problems = [], declared = {};
  const fw = ci.framework;
  for (const f of names) {
    if (f === mainFile) continue;
    if (ci.scheduled && f === ci.scheduled) { const r = callerProblems(String(read(f)), ctx || loadCtx(), { kind: 'scheduled' }); problems.push(...r.problems); continue; }
    if (fw && f === fw.reusable) { problems.push(...reusableProblems(String(read(f)), ctx || loadCtx())); continue; }
    declared[f] = read(f);
  }
  const r = otherWorkflowProblems(declared, exceptions, sha256);
  problems.push(...r.problems);
  return { problems, notes: r.notes };
}

// Whether this repository may use the framework as a verified snapshot: it is on the list (or its identity cannot be told, a scratch copy), it carries the record, and the record verifies.
export function snapshotStatus(repoRoot, identity) {
  if (!existsSync(join(repoRoot, SNAPSHOT_RECORD))) return { ok: false, present: false, problems: [] };
  const problems = [];
  if (identity && !SNAPSHOT_REPOSITORIES.includes(identity)) problems.push(`${SNAPSHOT_RECORD}: ${identity} is not a repository that may carry the framework as a snapshot (${SNAPSHOT_REPOSITORIES.join(', ')}); a private repository uses the SHA-pinned action`);
  const v = verifyRepo(repoRoot, { protectedHashes: PROTECTED_SHA256 });
  problems.push(...v.problems.map((x) => `snapshot: ${x}`));
  return { ok: !problems.length, present: true, problems, notes: v.notes };
}

export function checkCi({ file = workflowPath(), p = project, docs = true } = {}) {
  if (!existsSync(file)) return { problems: [`the workflow file .github/workflows/${p.ci.workflow} is missing`], notes: [] };
  const identity = repositoryIdentity(p.repoRoot);
  const isFramework = identity === FRAMEWORK_REPOSITORY;
  let fw = p.ci.framework;
  const extra = [];
  // ci.framework names the framework repository's own files; a manifest is the project's to write, so it is honoured only in the framework repository and only for the fixed names
  if (fw && identity && !isFramework) { extra.push(`ci.framework is for the framework repository (${FRAMEWORK_REPOSITORY}); this repository is ${identity}`); fw = null; }
  if (fw && (fw.action !== ACTION_DIR || fw.reusable !== 'engineering-verify.yml' || fw.scripts !== 'engineering/tools/ci')) { extra.push(`ci.framework must name the fixed paths (${ACTION_DIR}, engineering-verify.yml, engineering/tools/ci)`); fw = null; }
  const text = readFileSync(file, 'utf8');
  const ctx = (fw || p.ci.scheduled || /uses:\s*\S*engineering(@|\s*$)/m.test(text)) ? loadCtx() : null;
  // a verified snapshot of the framework beside the project, in a repository the engineering lists for it (G6-8)
  const snap = snapshotStatus(p.repoRoot, identity);
  const r = checkCiFile(text, { docs, ctx, framework: !!fw, direct: directStyleAllowed(identity), snapshot: snap.ok });
  r.problems.push(...snap.problems);
  r.problems.push(...extra);
  const dir = dirname(file), names = existsSync(dir) ? readdirSync(dir).filter((f) => /\.ya?ml$/i.test(f)).sort() : [];
  const o = otherWorkflowsProblems(names, (f) => readFileSync(join(dir, f)), basename(file), { ...p.ci, framework: fw || undefined }, ctx, exceptionsFor(identity));
  r.problems.push(...o.problems); r.notes.push(...o.notes);
  if (p.ci.scheduled) r.notes.push(`scheduled caller ${p.ci.scheduled}: judged (defined, not activated; no live-site mode)`);
  for (const f of ['dependabot.yml', 'dependabot.yaml']) { const q = join(p.repoRoot, '.github', f); if (existsSync(q)) { r.problems.push(...dependabotProblems(readFileSync(q, 'utf8'))); r.notes.push(`${f}: judged`); } }
  // composite actions of the repository: only the framework's own, and only in the framework repository, whatever the manifest says
  const actionsDir = join(p.repoRoot, '.github', 'actions');
  if (existsSync(actionsDir)) {
    const c = ctx || loadCtx();
    for (const name of readdirSync(actionsDir)) {
      if (name !== 'engineering') { r.problems.push(`.github/actions/${name}: an action of this repository's own; the CI policy judges only the framework's composite action`); continue; }
      if (identity && !isFramework && !snap.ok) { r.problems.push(`.github/actions/engineering: a copy of the framework's action in ${identity}; a client uses the framework's action by commit SHA and carries none (only a repository with a verified snapshot, on the snapshot list, carries the copy)`); continue; }
      const q = join(actionsDir, name, 'action.yml');
      r.problems.push(...(existsSync(q) ? actionProblems(readFileSync(q, 'utf8'), c) : ['.github/actions/engineering has no action.yml']));
    }
  }
  if (fw) {
    const rel = (x) => join(p.repoRoot, ...x.split('/'));
    const read = (x) => (existsSync(rel(x)) ? readFileSync(rel(x), 'utf8') : null);
    const c = ctx;
    if (read(`${fw.action}/action.yml`) === null) r.problems.push('the composite action is missing');
    const scripts = {};
    if (existsSync(rel(fw.scripts))) for (const f of readdirSync(rel(fw.scripts)).filter((x) => /\.[a-z]+$/.test(x) && !x.endsWith('.mjs'))) { if (f.endsWith('.sh')) scripts[f.replace(/\.sh$/, '')] = readFileSync(join(rel(fw.scripts), f), 'utf8'); else r.problems.push(`tools/ci/${f}: only the action's .sh scripts and the .mjs tools may live in tools/ci`); }
    r.problems.push(...scriptProblems(scripts, c));
    const t = fw.templates;
    for (const kind of ['caller', 'scheduled']) { const x = read(t[kind]); r.problems.push(...(x === null ? [`the ${kind} template is missing`] : callerProblems(x, c, { kind, template: true }).problems)); }
    const dep = read(t.dependabot); r.problems.push(...(dep === null ? ['the Dependabot template is missing'] : dependabotProblems(dep, { template: true })));
    r.notes.push(`framework automation: composite action, ${Object.keys(scripts).length} scripts, reusable workflow, caller / scheduled / Dependabot templates judged against ci/jobs.json (${c.jobs.length} jobs, ${c.modes.length} modes; scheduled: ${c.scheduledModes.join(', ')})`);
  }
  return r;
}

if (isMain(import.meta.url)) {
  const { problems, notes } = checkCi();
  notes.forEach((n) => console.log('  ' + n));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:ci`);
  process.exit(problems.length ? 1 : 0);
}
