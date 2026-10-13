// The continuous-integration policy of the engineering for everything that is not the one direct workflow check:ci has always judged (G6-7, specification 16, section 10.8):
// the composite action, the reusable workflow, a client caller (and the template it is rendered from), a scheduled caller (and its template), a Dependabot configuration
// (and its template) and the shell scripts the action runs. Pure functions of text: they bind no project, so the renderer (tools/ci/render.mjs) can judge what it writes
// before it writes it. Every function returns a list of problems; an empty list is an acceptance.
//
// What the policy makes impossible, for a client: referring to the framework by anything but a full commit SHA; running anything but the framework's composite action
// after the checkout; asking for a mode that does not exist; adding a step, an environment, a condition, a dependency between jobs or an input; leaving the blocking job
// out or making it non-blocking; widening the permissions; scheduling anything outside a scheduled caller; and naming a second repository's action. None of it is a
// setting of the project's manifest; it is judged from the file the project commits.
import { parse } from 'yaml';

export const FRAMEWORK_REPOSITORY = 'getsimplifiedtech/sts-web-design-framework';
export const ACTION_DIR = '.github/actions/engineering';
export const ACTION_USES = `${FRAMEWORK_REPOSITORY}/${ACTION_DIR}`;
export const LOCAL_ACTION = `./${ACTION_DIR}`;
// The repositories that may carry the framework as a verified snapshot and use the action from that copy (G6-8): the one public demonstration repository, which cannot download the private
// action. The list is code of the engineering, so changing it is a framework change; a private client repository uses the SHA-pinned action and is not on it. check:ci and guard.sh share it.
export const SNAPSHOT_REPOSITORIES = ['getsimplifiedtech/STS-Cinematic-Showcase.'];
export const REUSABLE_USES = './.github/workflows/engineering-verify.yml';
export const SCRIPTS = ['guard', 'materialise', 'install', 'run'];
export const SHA40 = /^[0-9a-f]{40}$/;
const PLAIN_PATH = /^[A-Za-z0-9._][A-Za-z0-9._/-]*$/;
const PLAIN_BRANCH = /^[A-Za-z0-9._][A-Za-z0-9._/-]*$/;

// Texts no CI file of the engineering may contain (the former list of check:ci, applied to every kind of file here).
export const FORBIDDEN_TEXT = [
  [/\bgit\s+push\b/, 'git push'], [/\bgh\s+(pr|release|api|workflow|repo)\b/, 'the gh CLI'], [/\bnpm\s+publish\b/, 'npm publish'], [/\bpages\b.*deploy|deploy-pages|upload-pages|gh-pages|peaceiris/i, 'a Pages deployment'],
  [/\b(aws|gcloud|az|firebase|netlify|vercel|wrangler|flyctl|heroku|kubectl|terraform|docker\s+push)\b/i, 'a cloud or deployment tool'],
  [/\b(anthropic|openai|claude|gemini|mistral|huggingface|hf_|higgsfield|kling)\b/i, 'an AI or generation service'], [/\bcurl\b[^\n|]*\|\s*(ba)?sh/, 'curl piped to a shell'],
  [/\bautomerge|enable-pull-request-automerge|auto-merge|merge-method|\bmerge\s+--\b/i, 'an automatic merge'], [/\bsecrets\./, 'the secrets context'], [/\bGITHUB_TOKEN\b/, 'GITHUB_TOKEN'],
  [/\bpersonal[ -]access[ -]token\b|\bdeploy[ -]key\b|\bssh-key\b|\bgithub[ -]app\b/i, 'a personal access token, deploy key or app credential'],
];
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const withoutComments = (text) => text.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
// A project folder and a branch name are values the client chooses and the policy validates as plain paths; their spelling (a folder called claude-demo) is not a use of a service.
const maskValues = (text) => text.replace(/^(\s*(?:project-dir|directory|branches):).*$/gm, '$1');
export function forbiddenTextProblems(text, where) {
  const cleaned = maskValues(withoutComments(text)), out = [];
  for (const [re, what] of FORBIDDEN_TEXT) if (re.test(cleaned)) out.push(`${where} mentions ${what}`);
  return out;
}

const sameKeys = (o, keys) => isObj(o) && Object.keys(o).sort().join() === [...keys].sort().join();
const parseYaml = (text, where) => { try { const d = parse(text); return isObj(d) ? { doc: d } : { problems: [`${where} is not a YAML mapping`] }; } catch (e) { return { problems: [`${where} is not valid YAML: ${e.message}`] }; } };
const triggersOf = (wf) => wf.on ?? wf.true ?? {};
// YAML 1.1 reads an unquoted `on` as the boolean true; GitHub reads `on`. A file with both could show the policy one and GitHub the other: refuse it.
export const triggerKeyProblems = (wf, where) => (wf.on !== undefined && wf.true !== undefined ? [`${where} has both an "on" and a "true" key; the triggers are ambiguous`] : []);
export const jobShapeProblemsAll = (wf, where) => Object.entries(wf.jobs || {}).filter(([, j]) => !isObj(j)).map(([id]) => `${where}: job "${id}" is not a mapping`);
const triggerNames = (t) => (typeof t === 'string' ? [t] : Array.isArray(t) ? t : Object.keys(t || {}));
const exprOnly = (v) => typeof v === 'string' && /^\$\{\{\s*[A-Za-z0-9_.\-]+\s*\}\}$/.test(v);

// The standards the policy needs, as plain values: { pins: { 'actions/checkout': { sha }, ... }, nodeVersion, jobs: [...], modes: [...], scheduledModes: [...] }.
export function ciContext({ dependencies, environment, jobs }) {
  return { pins: dependencies.actions || {}, nodeVersion: environment.nodeBaseline?.version, jobs: jobs.jobs, modes: jobs.modes, scheduledModes: jobs.scheduled.modes };
}

// ---- the job table: what the reusable workflow, the caller and the scheduled caller must each carry --------------------------------------------------------------
export function jobsTable(wf) {
  return Object.entries(wf.jobs || {}).filter(([, j]) => isObj(j)).map(([id, j]) => ({ id, name: j.name, runsOn: j['runs-on'], timeout: j['timeout-minutes'], informational: j['continue-on-error'] === true, mode: j.steps?.[1]?.with?.mode }));
}
export function tableProblems(table, expected, where) {
  const out = [];
  const want = new Map(expected.map((j) => [j.id, j]));
  for (const t of table) if (!want.has(t.id)) out.push(`${where}: job "${t.id}" is not in ci/jobs.json`);
  for (const w of expected) {
    const t = table.find((x) => x.id === w.id);
    if (!t) { out.push(`${where}: the job "${w.id}" of ci/jobs.json is missing`); continue; }
    for (const [k, v] of [['name', w.name], ['runsOn', w.runsOn], ['timeout', w.timeout], ['informational', w.informational], ['mode', w.mode]]) if (t[k] !== v) out.push(`${where}: job "${w.id}" has ${k} ${JSON.stringify(t[k])}, ci/jobs.json says ${JSON.stringify(v)}`);
  }
  return out;
}

// ---- steps shared by the reusable workflow and the callers ------------------------------------------------------------------------------------------------------------
function checkoutStepProblems(step, ctx, where) {
  const out = [];
  if (!isObj(step)) return [`${where}: the first step is not a mapping`];
  if (!sameKeys(step, ['name', 'uses', 'with'])) out.push(`${where}: the checkout step may carry only a name, uses and with (got ${Object.keys(step).join(', ')})`);
  if (step.uses !== `actions/checkout@${ctx.pins['actions/checkout']?.sha}`) out.push(`${where}: the first step must use exactly actions/checkout@${ctx.pins['actions/checkout']?.sha}, the pinned commit of standards/dependencies.json (got ${step.uses})`);
  if (!sameKeys(step.with, ['fetch-depth', 'persist-credentials']) || step.with['fetch-depth'] !== 0 || step.with['persist-credentials'] !== false) out.push(`${where}: checkout must have exactly fetch-depth: 0 and persist-credentials: false`);
  return out;
}
const baseJobKeys = ['name', 'runs-on', 'timeout-minutes', 'steps'];
function jobShapeProblems(id, job, expected, where) {
  const out = [];
  const allowed = [...baseJobKeys, ...(expected.informational ? ['continue-on-error'] : [])];
  const extra = Object.keys(job).filter((k) => !allowed.includes(k));
  if (extra.length) out.push(`${where}: job "${id}" carries ${extra.join(', ')}, which a job here may not (only ${allowed.join(', ')})`);
  if (expected.informational && job['continue-on-error'] !== true) out.push(`${where}: job "${id}" is informational and must say continue-on-error: true`);
  if (!expected.informational && job['continue-on-error'] !== undefined) out.push(`${where}: the blocking job "${id}" must not say continue-on-error`);
  if (!Array.isArray(job.steps) || job.steps.length !== 2) out.push(`${where}: job "${id}" must have exactly two steps, the checkout and the engineering action`);
  return out;
}

// ---- the composite action ---------------------------------------------------------------------------------------------------------------------------------------------
const ACTION_STEP_ORDER = [['guard', 'run'], ['materialise', 'run'], ['setup-node', 'uses'], ['install', 'run'], ['run', 'run']];
// The only environment each script receives, and the only expression each variable may carry.
const ACTION_ENV = { guard: { MODE: 'inputs.mode', PROJECT_DIR: 'inputs.project-dir', ACTION_REPOSITORY: 'github.action_repository', ACTION_REF: 'github.action_ref' }, materialise: { ACTION_REPOSITORY: 'github.action_repository', ACTION_REF: 'github.action_ref' }, install: { MODE: 'inputs.mode' }, run: { MODE: 'inputs.mode', PROJECT_DIR: 'inputs.project-dir' } };
export function actionProblems(text, ctx) {
  const where = 'the composite action';
  const p = parseYaml(text, where); if (p.problems) return p.problems;
  const a = p.doc, out = [...forbiddenTextProblems(text, where)];
  if (a.runs?.using !== 'composite') out.push(`${where} must be a composite action (runs.using: composite)`);
  if (!sameKeys(a.inputs, ['mode', 'project-dir']) || !a.inputs.mode?.required || !a.inputs['project-dir']?.required) out.push(`${where} must declare exactly the required inputs mode and project-dir`);
  if (a.inputs && Object.values(a.inputs).some((i) => 'default' in (i || {}))) out.push(`${where}: an input with a default could hide a choice; none may have one`);
  if (a.outputs) out.push(`${where} must not declare outputs`);
  const steps = a.runs?.steps || [];
  if (steps.length !== ACTION_STEP_ORDER.length) out.push(`${where} must have exactly ${ACTION_STEP_ORDER.length} steps (guard, materialise, setup-node, install, run), found ${steps.length}`);
  steps.forEach((s, i) => {
    const [what, kind] = ACTION_STEP_ORDER[i] || [];
    const w = `${where}, step ${i + 1}`;
    for (const k of Object.keys(s)) if (!['name', 'uses', 'with', 'run', 'shell', 'env'].includes(k)) out.push(`${w} carries ${k}, which is not allowed (no conditions, no ids, no continue-on-error, no working directory)`);
    if (kind === 'run') {
      if (s.shell !== 'bash') out.push(`${w} must set shell: bash`);
      const m = /^bash "\$GITHUB_ACTION_PATH\/\.\.\/\.\.\/\.\.\/engineering\/tools\/ci\/([a-z-]+)\.sh"$/.exec(String(s.run || '').trim());
      if (!m || m[1] !== what) out.push(`${w} must run exactly the script ${what}.sh of the engineering (got ${JSON.stringify(s.run)})`);
      const allowed = ACTION_ENV[what] || {};
      for (const [k, v] of Object.entries(s.env || {})) if (allowed[k] === undefined || String(v).replace(/\s+/g, '') !== `\${{${allowed[k]}}}`) out.push(`${w}: environment ${k} may only be one of ${Object.entries(allowed).map(([a, b]) => `${a}: \${{ ${b} }}`).join(', ')}`);
    } else if (what === 'setup-node') {
      if (s.uses !== `actions/setup-node@${ctx.pins['actions/setup-node']?.sha}`) out.push(`${w} must use the pinned actions/setup-node ${ctx.pins['actions/setup-node']?.sha}`);
      if (!sameKeys(s.with, ['node-version']) || s.with['node-version'] !== ctx.nodeVersion) out.push(`${w} must set exactly node-version: '${ctx.nodeVersion}' (standards/environment.json)`);
    }
  });
  return out;
}

// the scripts the action runs
export function scriptProblems(scripts, ctx) {
  const out = [];
  for (const name of SCRIPTS) if (typeof scripts[name] !== 'string') out.push(`tools/ci/${name}.sh is missing`);
  for (const name of Object.keys(scripts)) if (![...SCRIPTS, 'supply-chain-report'].includes(name)) out.push(`tools/ci/${name}.sh is not one of the scripts the action runs (${[...SCRIPTS, 'supply-chain-report'].join(', ')})`);
  for (const [name, text] of Object.entries(scripts)) {
    const where = `tools/ci/${name}.sh`;
    out.push(...forbiddenTextProblems(text, where));
    if (/\beval\b|\bsource\b\s+<|\bbash\s+-c\b|\$\(\s*curl|\bwget\b|\bcurl\b/.test(withoutComments(text))) out.push(`${where} uses eval, a nested shell, curl or wget`);
    for (const line of withoutComments(text).split('\n')) {
      if (/\bnpm\s+(install|i)\b/.test(line) && !/\bnpm\s+ci\b/.test(line)) out.push(`${where}: use npm ci, not: ${line.trim()}`);
      if (/\bnpm ci\b/.test(line) && !(/--ignore-scripts/.test(line) && /--engine-strict/.test(line))) out.push(`${where}: npm ci must use --ignore-scripts and --engine-strict: ${line.trim()}`);
      if (/\bsudo\b/.test(line) && !/sudo apt-get (update|install -y --no-install-recommends ffmpeg)\s*$/.test(line.trim())) out.push(`${where}: sudo is allowed only for apt-get update and the installation of ffmpeg: ${line.trim()}`);
    }
    if (name !== 'supply-chain-report' && !/^set -euo pipefail$/m.test(text)) out.push(`${where} must set -euo pipefail`);
    if (/\|\|\s*(exit\s+0|:|true)\b|^\s*exit\s+0\s*$/m.test(withoutComments(text)) && name !== 'supply-chain-report') out.push(`${where} ignores a failure (|| true, || :, || exit 0 or a bare exit 0)`);
  }
  if (typeof scripts.guard === 'string') {
    const g = scripts.guard;
    const m = /case "\$\{MODE:-\}" in\s*\n\s*([a-z|-]+)\)/.exec(g);
    if (!m || m[1].split('|').sort().join() !== [...ctx.modes].sort().join()) out.push(`tools/ci/guard.sh must accept exactly the modes of ci/jobs.json (${ctx.modes.join(', ')})`);
    const sr = /SNAPSHOT_REPOSITORIES=\(([^)]*)\)/.exec(g);
    if (!sr || [...sr[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]).join() !== SNAPSHOT_REPOSITORIES.join()) out.push('tools/ci/guard.sh must list exactly the snapshot repositories of lib/ci-policy.mjs');
    if (!g.includes(`FRAMEWORK_REPOSITORY="${FRAMEWORK_REPOSITORY}"`)) out.push(`tools/ci/guard.sh must fix the framework repository to ${FRAMEWORK_REPOSITORY}`);
    if (!/\^\[0-9a-f\]\{40\}\$/.test(g)) out.push('tools/ci/guard.sh must require a full 40-hex commit SHA');
    if (!/\[ -f "\$\{GITHUB_WORKSPACE\}\/sts-framework-snapshot\.json" \]/.test(withoutComments(g))) out.push('tools/ci/guard.sh must refuse a local use of the action where no integrity record (sts-framework-snapshot.json) is in the workspace');
    if (!/cd "\$\{GITHUB_ACTION_PATH\}"[^\n]*pwd -P/.test(withoutComments(g)) || !/cd "\$\{GITHUB_WORKSPACE\}\/\.github\/actions\/engineering"[^\n]*pwd -P/.test(withoutComments(g))) out.push('tools/ci/guard.sh must require the local action to be exactly $GITHUB_WORKSPACE/.github/actions/engineering (compared as real paths)');
  }
  if (typeof scripts.run === 'string') {
    const modesRun = [...scripts.run.matchAll(/^\s{2}([a-z-]+)\)/gm)].map((x) => x[1]).filter((x) => x !== '*');
    if (modesRun.sort().join() !== [...ctx.modes].sort().join()) out.push(`tools/ci/run.sh must handle exactly the modes of ci/jobs.json (found ${modesRun.join(', ')})`);
    if (/--skip|--only|\|\|\s*true/.test(withoutComments(scripts.run))) out.push('tools/ci/run.sh must not skip, filter or ignore the failure of a check');
    if (!/if \[ -f "\$\{GITHUB_WORKSPACE\}\/sts-framework-snapshot\.json" \][^\n]*\n\s*node "\$core\/tools\/snapshot\.mjs" verify --repo "\$GITHUB_WORKSPACE"\n\s*fi/.test(withoutComments(scripts.run))) out.push('tools/ci/run.sh must verify the snapshot record (tools/snapshot.mjs verify --repo) before it runs a check, wherever a record is present');
  }
  return out;
}

// ---- the reusable workflow ----------------------------------------------------------------------------------------------------------------------------------------
export function reusableProblems(text, ctx) {
  const where = 'the reusable workflow';
  const p = parseYaml(text, where); if (p.problems) return p.problems;
  const wf = p.doc, out = [...forbiddenTextProblems(text, where)];
  for (const k of Object.keys(wf)) if (!['name', 'on', 'true', 'permissions', 'jobs'].includes(k)) out.push(`${where} carries a top-level ${k}, which it may not`);
  out.push(...triggerKeyProblems(wf, where), ...jobShapeProblemsAll(wf, where));
  const trig = triggersOf(wf);
  if (!sameKeys(trig, ['workflow_call'])) out.push(`${where} must be triggered by workflow_call and by nothing else (got ${triggerNames(trig).join(', ')})`);
  const wc = trig.workflow_call || {};
  if (!sameKeys(wc, ['inputs']) || !sameKeys(wc.inputs, ['project-dir']) || wc.inputs['project-dir'].type !== 'string' || wc.inputs['project-dir'].required !== true) out.push(`${where} must take exactly one input, the required string project-dir, and declare no secrets`);
  if (JSON.stringify(wf.permissions) !== JSON.stringify({ contents: 'read' })) out.push(`${where}: top-level permissions must be exactly { contents: read }`);
  out.push(...tableProblems(jobsTable(wf), ctx.jobs, where));
  for (const [id, job] of Object.entries(wf.jobs || {})) {
    const exp = ctx.jobs.find((j) => j.id === id); if (!exp || !isObj(job)) continue;
    out.push(...jobShapeProblems(id, job, exp, where));
    const [co, act] = job.steps || [];
    out.push(...checkoutStepProblems(co, ctx, `${where}, job ${id}`));
    if (!isObj(act) || !sameKeys(act, ['name', 'uses', 'with']) || act.uses !== LOCAL_ACTION) out.push(`${where}, job ${id}: the second step must use ${LOCAL_ACTION} and carry only a name, uses and with`);
    else if (!sameKeys(act.with, ['mode', 'project-dir']) || act.with['project-dir'] !== '${{ inputs.project-dir }}') out.push(`${where}, job ${id}: the action takes exactly mode and project-dir: \${{ inputs.project-dir }}`);
  }
  return out;
}

// ---- a caller (client), a scheduled caller, and the templates they are rendered from -----------------------------------------------------------------------------
// kind: 'caller' | 'scheduled'; template: placeholders {{FRAMEWORK_SHA}}, {{PROJECT_DIR}}, {{DEVELOPMENT_BRANCH}} instead of values.
// `snapshot: true` judges the caller of a public consumer (G6-8): it uses the verified local copy of the framework's action, ./.github/actions/engineering, instead of a private action it
// could not download. Everything else about it is the same.
export function callerProblems(text, ctx, { kind = 'caller', template = false, snapshot = false } = {}) {
  const where = `${template ? 'the ' : 'the client '}${snapshot ? 'snapshot ' : ''}${kind} ${template ? 'template' : 'workflow'}`;
  const p = parseYaml(text, where); if (p.problems) return { problems: p.problems, facts: {} };
  const wf = p.doc, out = [...forbiddenTextProblems(text, where)], facts = {};
  for (const k of Object.keys(wf)) if (!['name', 'on', 'true', 'permissions', 'concurrency', 'jobs'].includes(k)) out.push(`${where} carries a top-level ${k}, which a caller may not (no env, defaults or run-name)`);
  out.push(...triggerKeyProblems(wf, where), ...jobShapeProblemsAll(wf, where));
  const trig = triggersOf(wf), names = triggerNames(trig);
  if (kind === 'caller') {
    for (const t of names) if (!['push', 'pull_request', 'workflow_dispatch'].includes(t)) out.push(`${where}: trigger ${t} is not allowed (a caller runs on push to the development branch, on pull requests and by hand)`);
    for (const need of ['push', 'pull_request']) if (!names.includes(need)) out.push(`${where} must run on ${need}`);
    if (trig.push) {
      const br = trig.push.branches;
      if (!sameKeys(trig.push, ['branches']) || !Array.isArray(br) || br.length !== 1) out.push(`${where}: push must name exactly one development branch and nothing else`);
      else if (!(template ? br[0] === '{{DEVELOPMENT_BRANCH}}' : PLAIN_BRANCH.test(br[0]) && !/^(main|master)$/i.test(br[0]) && !/^refs\//.test(br[0]) && !br[0].includes('*') && !br[0].includes('..') && !br[0].endsWith('.lock') && !br[0].endsWith('/'))) out.push(`${where}: push must name one plain development branch, not main, master or a pattern (got ${JSON.stringify(br)})`);
    }
    if (trig.pull_request && Object.keys(trig.pull_request || {}).length) out.push(`${where}: pull_request takes no filter`);
  } else {
    for (const t of names) if (!['schedule', 'workflow_dispatch'].includes(t)) out.push(`${where}: trigger ${t} is not allowed in a scheduled caller`);
    const sched = trig.schedule;
    if (!Array.isArray(sched) || sched.length !== 1) out.push(`${where} must carry exactly one schedule entry`);
    else for (const s of sched) {
      if (!sameKeys(s, ['cron'])) { out.push(`${where}: a schedule entry carries only a cron`); continue; }
      const f = String(s.cron).trim().split(/\s+/);
      if (f.length !== 5 || !/^\d+$/.test(f[0]) || !/^\d+$/.test(f[1])) out.push(`${where}: the cron "${s.cron}" must name a fixed minute and hour (at most one run a day)`);
    }
  }
  if (JSON.stringify(wf.permissions) !== JSON.stringify({ contents: 'read' })) out.push(`${where}: top-level permissions must be exactly { contents: read }`);
  if (wf.concurrency !== undefined && !(sameKeys(wf.concurrency, ['group', 'cancel-in-progress']) && String(wf.concurrency.group) === (kind === 'caller' ? 'sts-verify-${{ github.ref }}' : 'sts-scheduled-${{ github.ref }}') && wf.concurrency['cancel-in-progress'] === true)) out.push(`${where}: concurrency may only be the group sts-verify-\${{ github.ref }} (sts-scheduled-... in a scheduled caller) with cancel-in-progress: true`);
  const expected = kind === 'caller' ? ctx.jobs : ctx.jobs.filter((j) => ctx.scheduledModes.includes(j.mode));
  out.push(...tableProblems(jobsTable(wf), expected, where));
  if (kind === 'caller' && !Object.values(wf.jobs || {}).some((j) => isObj(j) && j['continue-on-error'] === undefined && j.steps?.[1]?.with?.mode === 'verify')) out.push(`${where} must carry the blocking job that runs the whole verification (mode verify)`);
  const shas = new Set(), dirs = new Set();
  for (const [id, job] of Object.entries(wf.jobs || {})) {
    const exp = expected.find((j) => j.id === id); if (!exp || !isObj(job)) continue;
    out.push(...jobShapeProblems(id, job, exp, where));
    const [co, act] = job.steps || [];
    out.push(...checkoutStepProblems(co, ctx, `${where}, job ${id}`));
    if (!isObj(act) || !sameKeys(act, ['name', 'uses', 'with'])) { out.push(`${where}, job ${id}: the second step must use the engineering action and carry only a name, uses and with`); continue; }
    if (snapshot) {
      if (act.uses !== LOCAL_ACTION) { out.push(`${where}, job ${id}: the second step must use ${LOCAL_ACTION}, the verified copy of the framework's action in this repository (got ${act.uses})`); continue; }
    } else {
      const m = /^([^@]+)@(.+)$/.exec(String(act.uses));
      if (!m || m[1] !== ACTION_USES) { out.push(`${where}, job ${id}: the second step must use ${ACTION_USES}@<full commit SHA> (got ${act.uses})`); continue; }
      if (template ? m[2] !== '{{FRAMEWORK_SHA}}' : !SHA40.test(m[2])) out.push(`${where}, job ${id}: the framework must be named by a ${template ? 'placeholder {{FRAMEWORK_SHA}}' : 'full 40-hex commit SHA, never a branch or a tag'} (got ${m[2]})`);
      else shas.add(m[2]);
    }
    if (!sameKeys(act.with, ['mode', 'project-dir'])) out.push(`${where}, job ${id}: the action takes exactly mode and project-dir`);
    else {
      if (act.with.mode !== exp.mode) out.push(`${where}, job ${id}: mode must be ${exp.mode} (ci/jobs.json), not ${JSON.stringify(act.with.mode)}`);
      const pd = act.with['project-dir'];
      if (template ? pd !== '{{PROJECT_DIR}}' : !(typeof pd === 'string' && PLAIN_PATH.test(pd) && !/(^|\/)\.\.(\/|$)|\/\//.test(pd))) out.push(`${where}, job ${id}: project-dir must be ${template ? 'the placeholder {{PROJECT_DIR}}' : 'a plain relative path'} (got ${JSON.stringify(pd)})`);
      else dirs.add(pd);
    }
  }
  if (shas.size > 1) out.push(`${where}: every job must name the same framework SHA (found ${[...shas].join(', ')})`);
  if (dirs.size > 1) out.push(`${where}: every job must name the same project-dir (found ${[...dirs].join(', ')})`);
  facts.sha = shas.size === 1 ? [...shas][0] : null; facts.snapshot = snapshot; facts.projectDir = dirs.size === 1 ? [...dirs][0] : null;
  return { problems: out, facts };
}

// ---- the framework's own caller of its reusable workflow (the workflow of the framework repository) -----------------------------------------------------------------
// The jobs that call the reusable workflow are judged here; every other job is judged by the direct-workflow rules of check:ci.
export function localCallProblems(job, id, where) {
  const out = [];
  if (job.uses !== REUSABLE_USES) out.push(`${where}: job ${id} may call only ${REUSABLE_USES} (got ${job.uses})`);
  const extra = Object.keys(job).filter((k) => !['name', 'uses', 'with'].includes(k));
  if (extra.length) out.push(`${where}: job ${id} calls a reusable workflow and may carry only a name, uses and with (got ${extra.join(', ')})`);
  if (!sameKeys(job.with, ['project-dir']) || typeof job.with['project-dir'] !== 'string' || !PLAIN_PATH.test(job.with['project-dir']) || /(^|\/)\.\.(\/|$)/.test(job.with['project-dir'])) out.push(`${where}: job ${id} passes exactly one input, a plain project-dir`);
  return out;
}

// ---- Dependabot ---------------------------------------------------------------------------------------------------------------------------------------------------------
export function dependabotProblems(text, { template = false } = {}) {
  const where = `the Dependabot ${template ? 'template' : 'configuration'}`;
  const p = parseYaml(text, where); if (p.problems) return p.problems;
  const d = p.doc, out = [...forbiddenTextProblems(text, where)];
  if (d.version !== 2) out.push(`${where} must be version 2`);
  for (const k of Object.keys(d)) if (!['version', 'updates'].includes(k)) out.push(`${where} carries a top-level ${k} (registries and multi-ecosystem groups give access to other places and are not allowed)`);
  const ups = d.updates;
  if (!Array.isArray(ups) || !ups.length) return [...out, `${where} lists no update`];
  const seen = new Set();
  for (const u of ups) {
    const w = `${where}, ${u['package-ecosystem']}`;
    if (!['github-actions', 'npm'].includes(u['package-ecosystem'])) out.push(`${w}: the ecosystem must be github-actions or npm`);
    if (seen.has(u['package-ecosystem'])) out.push(`${w} is listed twice`);
    seen.add(u['package-ecosystem']);
    for (const k of Object.keys(u)) if (!['package-ecosystem', 'directory', 'schedule', 'open-pull-requests-limit', 'labels', 'commit-message'].includes(k)) out.push(`${w} carries ${k}, which is not allowed (no ignore, no allow, no registries, no reviewers, no target branch: a reviewed template only)`);
    const dir = String(u.directory ?? '');
    if (u['package-ecosystem'] === 'github-actions' && dir !== '/') out.push(`${w}: directory must be /`);
    if (u['package-ecosystem'] === 'npm' && !(template ? dir === '/{{PROJECT_DIR}}' : /^\/[A-Za-z0-9._/-]*$/.test(dir) && !/\.\./.test(dir))) out.push(`${w}: directory must be ${template ? '/{{PROJECT_DIR}}' : 'a plain absolute path inside the repository'} (got ${dir})`);
    if (!sameKeys(u.schedule, ['interval']) || !['weekly', 'monthly'].includes(u.schedule.interval)) out.push(`${w}: the schedule is exactly interval: weekly or monthly`);
    if (!Number.isInteger(u['open-pull-requests-limit']) || u['open-pull-requests-limit'] < 1 || u['open-pull-requests-limit'] > 5) out.push(`${w}: open-pull-requests-limit must be 1 to 5`);
    if (!Array.isArray(u.labels) || !u.labels.includes('owner-review')) out.push(`${w}: pull requests must carry the label owner-review (a person reviews every update)`);
  }
  return out;
}

// ---- the other workflows of the framework repository -------------------------------------------------------------------------------------------------------------
// A workflow that is not part of the engineering's CI may exist only if the framework's own project record declares it, by file name and SHA-256, with its reason and
// the properties it was reviewed for. Any change to the file, or a file that is not declared, is a failure. `declared` entries come from the framework's own ci/exceptions.json (never from a project's manifest: a project cannot excuse a workflow for itself).
export function otherWorkflowProblems(files, declared, sha256) {
  const out = [], notes = [];
  const byFile = new Map((declared || []).map((d) => [d.file, d]));
  for (const [file, text] of Object.entries(files)) {
    const d = byFile.get(file);
    if (!d) { out.push(`other workflow file(s) in .github/workflows/: ${file} is not declared in the framework's ci/exceptions.json; the CI policy judges only the engineering's own workflows (declare it deliberately, with its SHA-256 and its reason, in a work package that authorises it)`); continue; }
    if (sha256(text) !== d.sha256) { out.push(`other workflow ${file} has changed since it was reviewed (SHA-256 ${sha256(text).slice(0, 12)}…, declared ${String(d.sha256).slice(0, 12)}…): review it again and update the declaration`); continue; }
    const p = parseYaml(String(text), `other workflow ${file}`);
    if (p.problems) { out.push(...p.problems); continue; }
    const wf = p.doc, r = d.reviewed || {};
    if (wf.on !== undefined && wf.true !== undefined) { out.push(`other workflow ${file} has both an "on" and a "true" key`); continue; }
    const trig = triggerNames(triggersOf(wf)).sort();
    if (JSON.stringify(trig) !== JSON.stringify([...(r.triggers || [])].sort())) out.push(`other workflow ${file}: triggers ${trig.join(', ')} differ from the reviewed ${(r.triggers || []).join(', ')}`);
    if (JSON.stringify(wf.permissions) !== JSON.stringify(r.permissions)) out.push(`other workflow ${file}: permissions ${JSON.stringify(wf.permissions)} differ from the reviewed ${JSON.stringify(r.permissions)}`);
    if (JSON.stringify(Object.keys(wf.jobs || {}).sort()) !== JSON.stringify([...(r.jobs || [])].sort())) out.push(`other workflow ${file}: jobs differ from the reviewed ${(r.jobs || []).join(', ')}`);
    notes.push(`declared exception ${file}: ${d.reason.split('. ')[0]} (SHA-256 ${d.sha256.slice(0, 12)}…)`);
  }
  for (const d of declared || []) if (!(d.file in files)) notes.push(`declared exception ${d.file} is not in this tree (it lives on another branch); nothing to judge here`);
  return { problems: out, notes };
}
