// check:ci. The GitHub Actions workflow keeps its promises (decision D-4, APR-JE-022): read-only, minimal permissions, no deployment, no merge,
// no secrets, no AI or paid service, reproducible. The workflow is parsed as YAML and checked structurally; CI.md must document the runner.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { engDir, isMain, projectDir, readJson, repoRoot } from '../lib/git.mjs';

const FORBIDDEN_TEXT = [
  [/\bgit\s+push\b/, 'git push'], [/\bgh\s+(pr|release|api|workflow|repo)\b/, 'the gh CLI'], [/\bnpm\s+publish\b/, 'npm publish'], [/\bpages\b.*deploy|deploy-pages|upload-pages|gh-pages|peaceiris/i, 'a Pages deployment'],
  [/\b(aws|gcloud|az|firebase|netlify|vercel|wrangler|flyctl|heroku|kubectl|terraform|docker\s+push)\b/i, 'a cloud or deployment tool'],
  [/\b(anthropic|openai|claude|gemini|mistral|huggingface|hf_|higgsfield|kling)\b/i, 'an AI or generation service'], [/\bcurl\b[^\n|]*\|\s*(ba)?sh/, 'curl piped to a shell'],
  [/\bautomerge|enable-pull-request-automerge|auto-merge|merge-method|\bmerge\s+--\b/i, 'an automatic merge'], [/\bsecrets\./, 'the secrets context'], [/\bGITHUB_TOKEN\b/, 'GITHUB_TOKEN'],
];
const SHA = /^[0-9a-f]{40}$/;

export function checkCiFile(text, { docs = true } = {}) {
  const problems = [], notes = [];
  const bad = (m) => problems.push(m);
  let wf;
  try { wf = parse(text); } catch (e) { return { problems: [`the workflow is not valid YAML: ${e.message}`], notes }; }
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
  for (const [id, job] of Object.entries(jobs)) {
    if (job.permissions && JSON.stringify(job.permissions) !== JSON.stringify({ contents: 'read' })) bad(`job ${id} widens permissions (${JSON.stringify(job.permissions)})`);
    if (!job['timeout-minutes'] || job['timeout-minutes'] > 60) bad(`job ${id} needs a timeout-minutes of at most 60`);
    const runsFull = (job.steps || []).some((x) => /npm run verify\b/.test(x.run || '') && !/verify:fast/.test(x.run || ''));
    const informational = job['continue-on-error'] === true && /informational/i.test(job.name || '') && !runsFull;   // only a named, fast-checks-only job may be allowed to fail
    const runsOn = JSON.stringify(job['runs-on']);
    if (!informational && /latest/.test(runsOn)) bad(`blocking job ${id} runs on a floating image (${runsOn}); pin the runner version`);
    if (!informational && job['continue-on-error'] !== undefined) bad(`job ${id}: continue-on-error is only allowed on a job named "(informational)" that runs the fast checks only`);
    if (job.environment) bad(`job ${id} uses an environment (environments carry deployment secrets)`);
    for (const step of job.steps || []) {
      steps++;
      if (step.uses) {
        uses++;
        const [name, ref] = step.uses.split('@');
        if (!SHA.test(ref || '')) bad(`${step.uses} is not pinned to a full commit SHA`);
        if (!['actions/checkout', 'actions/setup-node'].includes(name)) bad(`action ${name} is not on the allowed list (actions/checkout, actions/setup-node)`);
        if (name === 'actions/checkout' && step.with?.['persist-credentials'] !== false) bad('checkout must set persist-credentials: false');
        if (name === 'actions/checkout' && step.with?.['fetch-depth'] !== 0) bad('checkout must fetch the full history (fetch-depth: 0): the baseline branch is needed');
        if (name === 'actions/setup-node' && !/^\d+\.\d+\.\d+$/.test(String(step.with?.['node-version'] || ''))) bad('setup-node must pin an exact Node version');
      }
      if (step.run) {
        if (/\$\{\{/.test(step.run)) bad(`a run script contains an expression (script injection risk): ${step.run.slice(0, 50)}`);
        for (const line of step.run.split('\n')) if (/\bnpm\s+(install|i)\b/.test(line) && !/npm\s+(ci)\b/.test(line)) bad(`use npm ci (lockfile), not: ${line.trim()}`);
        if (/\bnpm ci\b/.test(step.run) && !/--ignore-scripts/.test(step.run)) bad('npm ci must use --ignore-scripts');
      }
      if (step.env && Object.keys(step.env).some((k) => /key|token|secret|password/i.test(k))) bad(`a step sets a credential-like environment variable: ${Object.keys(step.env).join(', ')}`);
    }
    if (!informational && !(job.steps || []).some((s) => /npm run verify\b/.test(s.run || '') && !/verify:fast/.test(s.run || ''))) bad(`blocking job ${id} must run npm run verify`);
  }
  for (const [re, what] of FORBIDDEN_TEXT) { const cleaned = text.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n'); if (re.test(cleaned)) bad(`the workflow mentions ${what}`); }
  if (docs) {
    const ci = existsSync(join(engDir, 'CI.md')) ? readFileSync(join(engDir, 'CI.md'), 'utf8') : '';
    for (const need of ['Runner requirements', 'Node', 'Chromium', 'ffmpeg', 'fetch-depth', 'read-only', 'ubuntu-24.04']) if (!ci.includes(need)) bad(`CI.md does not document "${need}"`);
    const pkg = readJson(join(projectDir, 'package.json'));
    for (const s of JSON.stringify(wf).matchAll(/npm run ([a-z:-]+)/g)) if (!pkg.scripts[s[1]]) bad(`the workflow runs "npm run ${s[1]}", which is not a package script`);
  }
  notes.push(`workflow: ${Object.keys(jobs).length} jobs, ${steps} steps, ${uses} actions all pinned to commit SHAs; permissions contents: read; no secrets, deployment, merge, publish, cloud or AI service; npm ci --ignore-scripts; timeouts set; documented in CI.md`);
  return { problems, notes };
}

export function checkCi({ file = join(repoRoot, '.github', 'workflows', 'jade-and-ember-verify.yml') } = {}) {
  if (!existsSync(file)) return { problems: ['the workflow file .github/workflows/jade-and-ember-verify.yml is missing'], notes: [] };
  return checkCiFile(readFileSync(file, 'utf8'));
}

if (isMain(import.meta.url)) {
  const { problems, notes } = checkCi();
  notes.forEach((n) => console.log('  ' + n));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:ci`);
  process.exit(problems.length ? 1 : 0);
}
