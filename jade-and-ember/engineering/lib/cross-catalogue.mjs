// Classification of every check in `npm run verify` for the cross-browser runner (Gate 5, Phase 1). The runner prints a matrix that lists ALL checks for
// the engine it ran in, so nothing is skipped silently: a check is either run in the engine, or marked not applicable with the reason, and
// check:selftest-gate5 fails if a check exists in verify.mjs that is not classified here.
//   engine         browser-driven: runs in Chromium (the main job), Firefox and WebKit, with the same assertions
//   static         no browser involved (files, git, records): identical in every engine, run once in the Chromium job
//   chromium-only  cannot be run in the other engines; the reason is stated and the gap is reported, not hidden
export const SCOPE = {
  'check:baseline': ['static', 'compares git records and checksums of the frozen v0.8 baseline; no browser'],
  'check:schema': ['static', 'validates configuration against JSON Schemas and the build refusing bad input; no browser'],
  'check:determinism': ['static', 'two builds are byte-identical; no browser'],
  'check:delivery': ['static', 'the delivered file set and its references; no browser'],
  'check:authority': ['static', 'design-authority and framework-reference records; no browser'],
  'check:contracts': ['static', 'component and page-renderer contracts; no browser'],
  'check:media': ['engine', ''],
  'check:tokens': ['static', 'design tokens read from the stylesheet text; no browser'],
  'check:secrets': ['static', 'credential scan of the tree and history; no browser'],
  'check:deps': ['static', 'dependency pins, lockfile, licences, npm audit; no browser'],
  'check:ci': ['static', 'structure and safety rules of the GitHub Actions workflow; no browser'],
  'check:html': ['static', 'HTML validation of the built pages; no browser'],
  'check:links': ['static', 'internal link resolution over the built files; no browser'],
  'check:seo': ['engine', ''],
  'check:release': ['static', 'release manifest and gate logic; no browser'],
  'check:framework-matrix': ['static', 'extraction matrix completeness over the repository files; no browser'],
  'check:release-dryrun': ['static', 'release dry run: the real release tool against a synthetic build in a throwaway copy; no browser'],
  'check:evidence': ['static', 'human-testing procedures, templates and evidence rules, and the viewport tag; no browser'],
  'check:hosting': ['static', 'static-folder and generated-header rules; no browser'],
  'check:privacy': ['engine', ''],
  'check:security': ['engine', ''],
  'check:d11': ['engine', ''],
  'check:supports': ['engine', ''],
  'check:assets': ['engine', ''],
  'check:budgets': ['chromium-only', 'the runtime budgets use Chromium DevTools protocol CPU and network throttling and the Event Timing, Largest Contentful Paint and long-task APIs, which Firefox and WebKit do not provide; the static page-weight part runs in the Chromium job. Performance in the other engines is not measured by automation.'],
  'check:keyboard': ['engine', ''],
  'check:reflow': ['engine', ''],
  'check:forced-colors': ['engine', ''],
  'check:a11y-tree': ['engine', ''],
  'check:order': ['engine', ''],
  'check:phone': ['engine', ''],
  'check:portability': ['engine', ''],
  'check:regression': ['engine', ''],
  'check:selftest': ['chromium-only', 'mutation tests of the Gate 1 checks; they damage copies and run the Chromium-verified checks, so they prove the checks, not the engine'],
  'check:selftest-gate2': ['chromium-only', 'negative tests of the Gate 2 checks; they run in the Chromium job'],
  'check:selftest-gate3': ['chromium-only', 'negative tests of the Gate 3 checks; they run in the Chromium job'],
  'check:selftest-gate4': ['chromium-only', 'negative tests of the Gate 4 checks; they run in the Chromium job'],
  'check:selftest-gate5': ['chromium-only', 'tests of the cross-browser harness itself; they run in the Chromium job'],
  'check:selftest-evidence': ['chromium-only', 'negative tests of the evidence validator and scaffolding; they need no browser and run in the Chromium job'],
};
export const engineChecks = () => Object.entries(SCOPE).filter(([, [s]]) => s === 'engine').map(([id]) => id);

// Renders the matrix for one engine. `results` maps a check id to { state: 'pass'|'fail'|'n/a', detail } for the checks that were run or found not applicable.
export function renderMatrix(engine, results) {
  const rows = [];
  for (const [id, [scope, reason]] of Object.entries(SCOPE)) {
    const r = results[id];
    if (scope === 'engine') rows.push(`  ${(r ? r.state === 'pass' ? 'PASS' : r.state === 'fail' ? 'FAIL' : 'N/A ' : 'MISSING').padEnd(8)}${id.padEnd(22)}${r ? r.detail || '' : 'the runner did not report this check: that is a defect in the runner'}`);
    else rows.push(`  ${'N/A'.padEnd(8)}${id.padEnd(22)}${scope === 'static' ? 'engine-independent, run in the Chromium job: ' : engine === 'chromium' ? 'runs in the main Chromium job, not in this runner: ' : 'NOT RUN in ' + engine + ': '}${reason}`);
  }
  return rows;
}
