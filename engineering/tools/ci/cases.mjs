// The adversarial cases of the G6-7 automation (specification 16, section 10.8), shared by the generic-fixture self-test (check:selftest-generic) and the caller-layout simulation
// (tools/ci/simulate-caller.mjs). Each case is [name, mutate(text) -> text | env changes, expected message]: a client's workflow or the guard's environment is damaged one way and the
// policy must refuse it, naming why. Nothing here weakens a check: a case that is NOT refused is a failure of the self-test.
export const SHA_A = 'a'.repeat(40);

// Mutations of a RENDERED caller. Each returns the damaged text.
export const callerCases = [
  ['the framework named by a tag', (t) => t.replaceAll(SHA_A, 'v1'), /full 40-hex commit SHA, never a branch or a tag/],
  ['the framework named by a branch', (t) => t.replaceAll(SHA_A, 'main'), /full 40-hex commit SHA/],
  ['the framework named by a short SHA', (t) => t.replaceAll(SHA_A, 'aaaaaaa'), /full 40-hex commit SHA/],
  ['two jobs naming two different framework revisions', (t) => t.replace(SHA_A, 'b'.repeat(40)), /every job must name the same framework SHA/],
  ['another repository\'s action in place of the framework\'s', (t) => t.replaceAll('getsimplifiedtech/sts-web-design-framework/', 'someone-else/engineering-copy/'), /must use getsimplifiedtech\/sts-web-design-framework\/\.github\/actions\/engineering@/],
  ['the local action path (a copy of the action in the client\'s own repository)', (t) => t.replaceAll(`getsimplifiedtech/sts-web-design-framework/.github/actions/engineering@${SHA_A}`, './.github/actions/engineering'), /must use getsimplifiedtech\/sts-web-design-framework/],
  ['the blocking verification made non-blocking', (t) => t.replace('    name: verify (Ubuntu 24.04, Node 24, Chromium)\n    runs-on: ubuntu-24.04\n', '    name: verify (Ubuntu 24.04, Node 24, Chromium)\n    runs-on: ubuntu-24.04\n    continue-on-error: true\n'), /blocking job "verify" must not say continue-on-error|carries continue-on-error/],
  ['the blocking verification asked to run in the fast mode only', (t) => t.replace('mode: verify', 'mode: fast'), /job "verify" has mode "fast"|mode must be verify/],
  ['the blocking verification removed', (t) => t.replace(/  verify:\n[\s\S]*?\n\n  portability-smoke:/, '  portability-smoke:'), /the job "verify" of ci\/jobs\.json is missing/],
  ['a mode that does not exist (a skip)', (t) => t.replace('mode: verify', 'mode: skip'), /mode must be verify/],
  ['a step of the client\'s own that could skip or replace a check', (t) => t.replace('      - name: Verify (all checks, self-tests)\n', '      - name: Tidy\n        run: echo tidy\n      - name: Verify (all checks, self-tests)\n'), /exactly two steps/],
  ['the action step followed by a step that hides its failure', (t) => t.replace("          project-dir: 'site'\n\n  portability-smoke:", "          project-dir: 'site'\n      - run: exit 0\n        if: always()\n\n  portability-smoke:"), /exactly two steps/],
  ['a condition on the verification step', (t) => t.replace('      - name: Verify (all checks, self-tests)\n', '      - name: Verify (all checks, self-tests)\n        if: github.event_name == \'push\'\n'), /carry only a name, uses and with/],
  ['an environment variable on the verification step', (t) => t.replace('      - name: Verify (all checks, self-tests)\n', '      - name: Verify (all checks, self-tests)\n        env:\n          STS_SKIP: "1"\n'), /carry only a name, uses and with/],
  ['an extra input handed to the action', (t) => t.replace("          mode: verify\n", "          mode: verify\n          skip: check:secrets\n"), /takes exactly mode and project-dir/],
  ['a dependency between jobs', (t) => t.replace('  portability-smoke:\n', '  portability-smoke:\n    needs: verify\n'), /carries needs/],
  ['an environment (deployment secrets) on a job', (t) => t.replace('  portability-smoke:\n', '  portability-smoke:\n    environment: production\n'), /carries environment/],
  ['write permission at the top of the workflow', (t) => t.replace('permissions:\n  contents: read\n', 'permissions:\n  contents: write\n'), /top-level permissions must be exactly/],
  ['a permission on a job', (t) => t.replace('  portability-smoke:\n', '  portability-smoke:\n    permissions:\n      contents: write\n'), /carries permissions/],
  ['a trigger that runs with the base repository\'s privileges', (t) => t.replace('  pull_request:\n', '  pull_request_target:\n'), /trigger pull_request_target is not allowed|must run on pull_request/],
  ['a schedule in a caller', (t) => t.replace('  workflow_dispatch:\n', "  workflow_dispatch:\n  schedule:\n    - cron: '0 * * * *'\n"), /trigger schedule is not allowed/],
  ['a push trigger on the main branch', (t) => t.replace("branches: ['development']", "branches: ['main']"), /not main, master or a pattern/],
  ['a push trigger on every branch', (t) => t.replace("branches: ['development']", "branches: ['**']"), /not main, master or a pattern/],
  ['a project folder that climbs out of the repository', (t) => t.replaceAll("project-dir: 'site'", "project-dir: '../other'"), /project-dir must be a plain relative path/],
  ['a project folder that differs between jobs', (t) => t.replace("project-dir: 'site'", "project-dir: 'other'"), /every job must name the same project-dir/],
  ['a top-level environment block', (t) => t.replace('jobs:\n', 'env:\n  STS_SKIP: "1"\n\njobs:\n'), /carries a top-level env/],
  ['a secret read', (t) => t.replace("          mode: verify\n", "          mode: verify\n          token: ${{ secrets.NPM_TOKEN }}\n"), /the secrets context|takes exactly mode and project-dir/],
  ['the checkout without its pinned commit', (t) => t.replaceAll('actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1', 'actions/checkout@v4'), /the first step must use exactly actions\/checkout@/],
  ['the checkout keeping credentials', (t) => t.replaceAll('persist-credentials: false', 'persist-credentials: true'), /exactly fetch-depth: 0 and persist-credentials: false/],
  ['a shallow checkout', (t) => t.replaceAll('fetch-depth: 0', 'fetch-depth: 1'), /exactly fetch-depth: 0 and persist-credentials: false/],
  ['a job with a timeout changed', (t) => t.replace('timeout-minutes: 40', 'timeout-minutes: 360'), /timeout/],
  ['a job on a floating runner image', (t) => t.replace('runs-on: ubuntu-24.04\n    timeout-minutes: 40', 'runs-on: ubuntu-latest\n    timeout-minutes: 40'), /runsOn/],
  ['a job that the table does not know', (t) => `${t}\n  deploy:\n    name: deploy\n    runs-on: ubuntu-24.04\n    timeout-minutes: 5\n    steps: []\n`, /job "deploy" is not in ci\/jobs\.json/],
];

// Environments for guard.sh. `base` is a valid remote use; each case changes it and expects the guard to refuse with a message.
export const guardCases = [
  ['a branch instead of a commit SHA', { ACTION_REF: 'main' }, /full 40-character commit SHA/],
  ['a tag instead of a commit SHA', { ACTION_REF: 'v1.0.0' }, /full 40-character commit SHA/],
  ['an abbreviated commit SHA', { ACTION_REF: 'abcdef1' }, /full 40-character commit SHA/],
  ['an upper-case SHA', { ACTION_REF: 'A'.repeat(40) }, /full 40-character commit SHA/],
  ['another repository\'s copy of the action', { ACTION_REPOSITORY: 'someone-else/sts-web-design-framework' }, /not from getsimplifiedtech\/sts-web-design-framework/],
  ['an unknown mode', { MODE: 'skip' }, /unknown mode/],
  ['a mode with a shell metacharacter', { MODE: 'verify;id' }, /unknown mode/],
  ['an empty mode', { MODE: '' }, /unknown mode/],
  ['a project folder that climbs out', { PROJECT_DIR: '../other' }, /plain characters|must not contain/],
  ['a project folder with an empty segment', { PROJECT_DIR: 'a//b' }, /must not contain/],
  ['an absolute project folder', { PROJECT_DIR: '/etc' }, /relative path of plain characters/],
  ['a project folder with a space and a semicolon', { PROJECT_DIR: 'site; id' }, /relative path of plain characters/],
  ['a project folder that holds no manifest', { PROJECT_DIR: 'nowhere' }, /no sts\.engineering\.json/],
  ['a local use of the action from a client repository', { LOCAL: '1', GITHUB_REPOSITORY: 'getsimplifiedtech/some-client' }, /allowed only inside getsimplifiedtech\/sts-web-design-framework/],
];

// Mutations of the DIRECT-style reference workflow (fixtures/ci/direct-workflow.yml): ways of softening the blocking verification that the direct rules must refuse.
export const directCases = [
  ['the verify command made to ignore failure', (t) => t.replace('        run: npm run verify\n', '        run: npm run verify || true\n'), /ignores or backgrounds a failure|must run npm run verify/],
  ['the verify command replaced by an echo of it', (t) => t.replace('        run: npm run verify\n', '        run: echo npm run verify\n'), /must run npm run verify/],
  ['the verify command put in the background', (t) => t.replace('        run: npm run verify\n', '        run: npm run verify &\n'), /ignores or backgrounds a failure|must run npm run verify/],
  ['the verify command followed by another command on the line', (t) => t.replace('        run: npm run verify\n', '        run: npm run verify; true\n'), /must run npm run verify|ignores or backgrounds/],
  ['a step that may fail silently', (t) => t.replace('        run: npm run verify\n', '        run: npm run verify\n        continue-on-error: true\n'), /a step carries continue-on-error/],
  ['a condition on the verify step', (t) => t.replace('        run: npm run verify\n', '        if: false\n        run: npm run verify\n'), /a step has a condition/],
  ['a condition on the blocking job', (t) => t.replace('    timeout-minutes: 40\n', '    timeout-minutes: 40\n    if: false\n'), /has a condition/],
  ['the blocking job deleted', (t) => t.replace(/  verify:\n[\s\S]*?\n(?=  portability-smoke:)/, ''), /no blocking job/],
  ['the blocking job renamed informational and allowed to fail', (t) => t.replace('name: verify (Ubuntu 24.04, Node 24, Chromium)', 'name: verify (informational)').replace('    timeout-minutes: 40\n', '    timeout-minutes: 40\n    continue-on-error: true\n'), /no blocking job|must state its Node major/],
  ['a trigger written twice (on and the YAML 1.1 reading of on)', (t) => t.replace('\non:\n', '\ntrue:\n  workflow_dispatch:\non:\n'), /both an "on" and a "true" key/],
];
