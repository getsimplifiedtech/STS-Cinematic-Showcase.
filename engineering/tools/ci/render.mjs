// Renders a client's workflow from the framework's template (G6-7, specification 16, section 10.8):
//   node tools/ci/render.mjs <caller|snapshot-caller|scheduled|dependabot> --sha <40-hex> --project-dir <path> [--branch <name>] [--out <file>]
// The placeholders are {{FRAMEWORK_SHA}}, {{PROJECT_DIR}} and {{DEVELOPMENT_BRANCH}}. The framework revision is a full commit SHA and nothing else; the project folder is a plain
// relative path; the branch is one plain branch name, never main, master or a pattern. The rendered file is judged by the same policy check:ci applies to a client's committed file,
// and nothing is written if it does not pass. Nothing is fetched and nothing is changed outside the output file.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { coreDir } from '../../lib/project.mjs';
import { policy } from '../../lib/policy.mjs';
import { callerProblems, ciContext, dependabotProblems, SHA40 } from '../../lib/ci-policy.mjs';
import { readJson, isMain } from '../../lib/git.mjs';

const TEMPLATES = { caller: 'caller.yml', 'snapshot-caller': 'snapshot-caller.yml', scheduled: 'scheduled.yml', dependabot: 'dependabot.yml' };
const PLAIN = /^[A-Za-z0-9._][A-Za-z0-9._/-]*$/;

export function render(kind, { sha, projectDir, branch }, { ctx = null } = {}) {
  if (!TEMPLATES[kind]) throw new Error(`unknown kind "${kind}" (caller, snapshot-caller, scheduled or dependabot)`);
  if (kind !== 'dependabot' && kind !== 'snapshot-caller' && !SHA40.test(sha || '')) throw new Error('--sha must be a full 40-character lower-case commit SHA (a branch or a tag is refused)');
  if (!PLAIN.test(projectDir || '') || /(^|\/)\.\.(\/|$)|\/\//.test(projectDir)) throw new Error('--project-dir must be a plain relative path without ".." or empty segments');
  if ((kind === 'caller' || kind === 'snapshot-caller') && (!PLAIN.test(branch || '') || /^(main|master)$/.test(branch) || branch.includes('*'))) throw new Error('--branch must be one plain development branch name, not main, master or a pattern');
  let text = readFileSync(join(coreDir, 'ci', 'templates', TEMPLATES[kind]), 'utf8');
  text = text.replaceAll('{{FRAMEWORK_SHA}}', sha || '').replaceAll('{{PROJECT_DIR}}', projectDir).replaceAll('{{DEVELOPMENT_BRANCH}}', branch || '');
  if (/\{\{[A-Z_]+\}\}/.test(text)) throw new Error('a placeholder was left unfilled in the rendered file');
  const c = ctx || ciContext({ dependencies: policy('dependencies'), environment: policy('environment'), jobs: readJson(join(coreDir, 'ci', 'jobs.json')) });
  const problems = kind === 'dependabot' ? dependabotProblems(text) : kind === 'snapshot-caller' ? callerProblems(text, c, { kind: 'caller', snapshot: true }).problems : callerProblems(text, c, { kind }).problems;
  if (problems.length) throw new Error(`the rendered ${kind} does not pass the CI policy:\n  - ${problems.join('\n  - ')}`);
  return text;
}

if (isMain(import.meta.url)) {
  const [kind, ...rest] = process.argv.slice(2), a = {};
  for (let i = 0; i < rest.length; i += 2) a[rest[i].replace(/^--/, '')] = rest[i + 1];
  try {
    const text = render(kind, { sha: a.sha, projectDir: a['project-dir'], branch: a.branch });
    if (a.out) writeFileSync(a.out, text); else process.stdout.write(text);
  } catch (e) { console.error(`render: ${e.message}`); process.exit(1); }
}
