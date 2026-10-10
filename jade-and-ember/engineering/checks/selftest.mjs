// check:selftest. The checks must fail when they should. Each case damages a COPY of the project (or of the records) in a way a real
// mistake could, runs the relevant check, and requires it to notice. If a check silently stopped working, this fails.
// The baseline branch, the working tree and the committed files are never touched. Options: --quick (skips the slowest browser cases)
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { checkBaseline } from './baseline.mjs';
import { checkDeterminism } from './determinism.mjs';
import { checkAuthority } from './authority.mjs';
import { checkDelivery } from './delivery.mjs';
import { runRegression } from '../lib/regression.mjs';
import { assembleCandidate, compareSources, validateAllowlist } from '../lib/site.mjs';
import { baselineRecord, engDir, exportBaseline, isMain, projectDir, repoRoot, tempDir } from '../lib/git.mjs';

const edit = (file, fn) => writeFileSync(file, fn(readFileSync(file, 'utf8')));
const copyProject = (dest) => cpSync(projectDir, dest, { recursive: true, filter: (s) => !/node_modules|[\\/]shots$|[\\/]\.reports|[\\/]\.lighthouseci|__pycache__/.test(s) });

export async function checkSelftest({ quick = false } = {}) {
  const problems = [], notes = [];
  const expect = (cond, msg) => { if (!cond) problems.push(msg); };
  const cleanup = [];
  const tmp = (label) => { const d = tempDir(label); cleanup.push(d); return d; };
  try {
    // ---- baseline check: wrong record, tampered checksums
    {
      const rec = baselineRecord();
      expect(checkBaseline({ record: { ...rec, commit: '0'.repeat(40) } }).problems.length > 0, 'baseline: a wrong commit in the record must fail');
      expect(checkBaseline({ record: { ...rec, projectTree: '1'.repeat(40) } }).problems.length > 0, 'baseline: a wrong tree in the record must fail');
      expect(checkBaseline({ record: { ...rec, previewPackage: { ...rec.previewPackage, sha256: 'a'.repeat(64) } } }).problems.length > 0, 'baseline: a wrong package checksum must fail');
      const rr = tmp('records'); cpSync(join(repoRoot, rec.recordsDir), join(rr, rec.recordsDir), { recursive: true });
      edit(join(rr, rec.recordsDir, rec.sourceTreeChecksums.file), (t) => t.replace(/^[0-9a-f]/, (c) => (c === 'a' ? 'b' : 'a')));
      expect(checkBaseline({ recordsRoot: rr }).problems.some((p) => /checksum mismatch/.test(p)), 'baseline: a tampered checksum list must fail');
      notes.push('baseline: wrong commit, wrong tree, wrong package hash and a tampered checksum are all refused');
    }

    // ---- determinism: a random value in the output, a stale committed page
    {
      const c1 = tmp('det1'); copyProject(c1);
      edit(join(c1, 'src', 'components', 'document.mjs'), (t) => t.replace('<head>\\n', '<head>\\n<!-- ${Math.random()} -->\\n'));
      const r1 = checkDeterminism({ root: c1 });
      expect(r1.problems.some((p) => /two builds differ/.test(p)) && r1.problems.some((p) => /uses a clock, random/.test(p)), `determinism: a random value in the output must be caught (got: ${r1.problems.join(' | ').slice(0, 200)})`);
      const c2 = tmp('det2'); copyProject(c2);
      edit(join(c2, 'index.html'), (t) => t.replace('</html>', '<!-- hand edit --></html>'));
      expect(checkDeterminism({ root: c2 }).problems.some((p) => /committed pages differ/.test(p)), 'determinism: a hand-edited committed page must be caught');
      notes.push('determinism: a random value in the output and a hand-edited page are caught');
    }

    // ---- authority: altered hash, retired skill used as authority, missing approval
    {
      const mk = () => {
        const r = tmp('auth'); execFileSync('git', ['init', '-q'], { cwd: r });
        for (const f of ['docs', 'baselines', 'jade-and-ember/README.md', 'jade-and-ember/QA.md', 'jade-and-ember/engineering/authority.json', 'jade-and-ember/engineering/checks/authority.mjs', 'jade-and-ember/engineering/checks/selftest.mjs']) {
          mkdirSync(join(r, f, '..'), { recursive: true }); cpSync(join(repoRoot, f), join(r, f), { recursive: true });
        }
        return r;
      };
      expect(checkAuthority({ root: mk(), framework: null }).problems.length === 0, 'authority: an untouched copy of the records must pass');
      let r = mk(); edit(join(r, 'docs/JADE_AND_EMBER_FRAMEWORK_REFERENCE.md'), (t) => t.replace('d91970639e9f5c37', 'e91970639e9f5c37'));
      expect(checkAuthority({ root: r, framework: null }).problems.some((p) => /skill SHA-256/.test(p)), 'authority: a changed skill hash in the reference must be caught');
      r = mk(); edit(join(r, 'jade-and-ember/README.md'), (t) => t + '\nFollow the STS Premium Web Design skill for palette and layout.\n');
      expect(checkAuthority({ root: r, framework: null }).problems.some((p) => /not an allowed historical document/.test(p)), 'authority: the retired skill named as authority in the README must be caught');
      r = mk(); edit(join(r, 'docs/JADE_AND_EMBER_V0.9_IMPLEMENTATION_PLAN.md'), (t) => t + '\n'.repeat(30) + 'Apply STS Premium Web Design to the palette.\n' + '\n'.repeat(30));
      expect(checkAuthority({ root: r, framework: null }).problems.some((p) => /without a marker/.test(p)), 'authority: an unmarked mention in an allowed document must be caught');
      r = mk(); edit(join(r, 'docs/JADE_AND_EMBER_APPROVALS.md'), (t) => t.split('\n').filter((l) => !l.startsWith('| APR-JE-019')).join('\n'));
      expect(checkAuthority({ root: r, framework: null }).problems.some((p) => /APR-JE-019/.test(p)), 'authority: a missing approval record must be caught');
      r = mk(); edit(join(r, 'jade-and-ember/engineering/authority.json'), (t) => t.replace('"modifiedByThisProject": false', '"modifiedByThisProject": true'));
      expect(checkAuthority({ root: r, framework: null }).problems.some((p) => /must not be modified/.test(p)), 'authority: a record claiming the framework was modified must be caught');
      notes.push('authority: a changed hash, the retired skill as authority (README or unmarked), a missing approval and a framework-modified flag are caught');
    }

    // ---- delivery: an absolute reference, a missing file, a module import, a stray delivered file
    {
      const mk = () => { const c = assembleCandidate(projectDir, 'delivery'); cleanup.push(c); return c; };
      expect(checkDelivery({ root: mk() }).problems.length === 0, 'delivery: an untouched candidate must pass');
      let c = mk(); edit(join(c, 'index.html'), (t) => t.replace('href="styles.css"', 'href="/styles.css"'));
      expect(checkDelivery({ root: c }).problems.some((p) => /absolute/.test(p)), 'delivery: an absolute path to the stylesheet must be caught');
      c = mk(); edit(join(c, 'menu.html'), (t) => t.replace('src="menu.js"', 'src="menu-v2.js"'));
      expect(checkDelivery({ root: c }).problems.some((p) => /not a delivered file/.test(p)), 'delivery: a reference to a missing script must be caught');
      c = mk(); edit(join(c, 'site.js'), (t) => `import { x } from './lib.mjs';\n${t}`);
      expect(checkDelivery({ root: c }).problems.some((p) => /module system/.test(p)), 'delivery: a module import in a delivered script must be caught');
      c = mk(); writeFileSync(join(c, 'media', 'extra.webp'), 'x');
      expect(checkDelivery({ root: c }).problems.some((p) => /not in the v0.8 preview package/.test(p)), 'delivery: an extra delivered file must be caught');
      notes.push('delivery: an absolute path, a missing file, a module import and an unexpected delivered file are caught');
    }

    // ---- allowlist rules (no browser)
    {
      const appr = readFileSync(join(repoRoot, 'docs', 'JADE_AND_EMBER_APPROVALS.md'), 'utf8');
      const ok = { id: 'X-1', file: 'index.html', reason: 'r', workPackage: 'WP5', visual: false, normalize: [{ find: 'a', replace: 'b' }] };
      expect(validateAllowlist({ entries: [ok] }, appr).length === 0, 'allowlist: a complete non-visual entry must be accepted');
      expect(validateAllowlist({ entries: [{ ...ok, visual: true }] }, appr).length > 0, 'allowlist: a visual entry without an owner approval must be refused');
      expect(validateAllowlist({ entries: [{ ...ok, visual: true, approval: 'APR-JE-999' }] }, appr).length > 0, 'allowlist: a visual entry naming an approval that does not exist must be refused');
      expect(validateAllowlist({ entries: [{ ...ok, normalize: [] }] }, appr).length > 0, 'allowlist: an entry without normalisation rules must be refused');
      const b = exportBaseline('selftest-base'); cleanup.push(join(b, '..'));
      const c = assembleCandidate(projectDir, 'selftest-allow'); cleanup.push(c);
      edit(join(c, 'index.html'), (t) => t.replace('styles.css', 'styles.abc123.css'));
      const none = compareSources(b, c, { entries: [] });
      const permitted = compareSources(b, c, { entries: [{ ...ok, normalize: [{ find: 'styles\\.abc123\\.css', replace: 'styles.css' }] }] });
      const insufficient = compareSources(b, c, { entries: [{ ...ok, normalize: [{ find: 'nothing-matches', replace: 'x' }] }] });
      expect(none.problems.length === 1, 'allowlist: an unlisted difference must be a problem');
      expect(permitted.problems.length === 0 && permitted.allowed.length === 1, 'allowlist: a difference fully explained by a listed rule must be allowed and reported');
      expect(insufficient.problems.length === 1, 'allowlist: a rule that does not explain the difference must not allow it');
      notes.push('allowlist: incomplete or unapproved visual entries are refused; only fully explained differences are allowed and reported');
    }

    // ---- the regression harness against mutated candidates (browser)
    const base = exportBaseline('selftest-regression'); cleanup.push(join(base, '..'));
    const reportDir = join(engDir, '.reports', 'selftest');
    const run = async (name, mutate, only, subset) => {
      const cand = assembleCandidate(projectDir, 'mutant'); cleanup.push(cand);
      mutate(cand);
      const s = await runRegression({ baselineRoot: base, candidateRoot: cand, reportDir: join(reportDir, name), only, subset });
      return Object.fromEntries(Object.entries(s.layers).map(([k, v]) => [k, v.problems.length]));
    };
    const small = { pages: ['index.html', 'menu.html'], viewports: ['desktop-1440', 'mobile-390'], states: false, scenarios: /^hero: desktop with motion/ };
    const ALL = ['source', 'text', 'structure', 'styles', 'pixels', 'behaviour'];
    const cases = [
      ['one added character of visible text', (d) => edit(join(d, 'index.html'), (t) => t.replace(/(<h1[^>]*>[\s\S]*?)(<\/h1>)/, '$1!$2')), ['source', 'text', 'structure'], ['behaviour']],
      ['a 2 px change to the brand seal width', (d) => edit(join(d, 'styles.css'), (t) => t.replace('.seal{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;width:32px', '.seal{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;width:34px')), ['source', 'styles', 'pixels'], ['text', 'structure']],
      ['a one-step change to the ember colour', (d) => edit(join(d, 'styles.css'), (t) => t.replace('--ember:#f08a3c', '--ember:#f08a3d')), ['source', 'styles'], ['text', 'structure', 'behaviour']],
      ['the Pause control label changed in hero.js', (d) => edit(join(d, 'hero.js'), (t) => t.replace('Pause motion', 'Pause video')), ['source', 'behaviour'], ['text', 'structure', 'styles', 'pixels']],
      ['a font file replaced', (d) => { const f = join(d, 'fonts', 'karla-latin-400-normal.woff2'); const b = readFileSync(f); b[b.length - 5] ^= 0xff; writeFileSync(f, b); }, ['source'], ['text', 'structure']],
      ['a demonstration config value changed', (d) => edit(join(d, 'config', 'client.json'), (t) => t.replace('(555) 010-0188', '(555) 010-0189')), ['source'], []],
    ];
    for (const [name, mutate, mustFire, mustPass] of quick ? cases.slice(0, 1) : cases) {
      const r = await run(name.replace(/\W+/g, '-'), mutate, ALL.filter((l) => l !== 'behaviour' || mustFire.includes('behaviour') || mustPass.includes('behaviour')), small);
      for (const l of mustFire) expect(r[l] > 0, `regression: "${name}" must be caught by the ${l} layer (${JSON.stringify(r)})`);
      for (const l of mustPass) expect(r[l] === 0, `regression: "${name}" should not trip the ${l} layer (${JSON.stringify(r)})`);
      notes.push(`regression: "${name}" caught by ${mustFire.join(', ')}${mustPass.length ? `; ${mustPass.join(', ')} unaffected` : ''}`);
    }
  } finally { cleanup.forEach((d) => { try { rmSync(d, { recursive: true, force: true }); } catch { /* temp folder already gone */ } }); }
  return { problems, notes };
}

if (isMain(import.meta.url)) {
  const t0 = Date.now();
  const { problems, notes } = await checkSelftest({ quick: process.argv.includes('--quick') });
  notes.forEach((n) => console.log('  ' + n));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:selftest (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  process.exit(problems.length ? 1 : 0);
}
