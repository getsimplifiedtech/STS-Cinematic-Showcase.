// check:selftest. The checks must fail when they should. Each case damages a COPY of the project (or of the records) in a way a real
// mistake could, runs the relevant check, and requires it to notice. If a check silently stopped working, this fails.
// The baseline branch, the working tree and the committed files are never touched. Options: --quick (skips the slowest browser cases)
import { coreDir, ids, project, projectFolder } from '../lib/project.mjs';
import { record } from '../lib/project-records.mjs';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { checkBaseline } from './baseline.mjs';
import { checkDeterminism } from './determinism.mjs';
import { checkAuthority } from './authority.mjs';
import { checkDelivery } from './delivery.mjs';
import { runRegression } from '../lib/regression.mjs';
import { assembleCandidate, compareSources, loadAllowlist, pagesOf, validateAllowlist } from '../lib/site.mjs';
import { baselineRecord, engDir, exportBaseline, isMain, listFiles, projectDir, repoRoot, tempDir } from '../lib/git.mjs';

const edit = (file, fn) => writeFileSync(file, fn(readFileSync(file, 'utf8')));
// A project that sits inside the engineering's own folder (the generic fixture) imports the engineering by relative path, so its damaged copies are made beside it, in a scratch folder
// of that folder; any other project is copied into the system's temporary folder.
const SCRATCH = projectDir.startsWith(coreDir + sep) ? join(coreDir, '.selftest') : tmpdir();
const scratch = (label) => { mkdirSync(SCRATCH, { recursive: true }); return mkdtempSync(join(SCRATCH, `${label}-`)); };
const copyProject = (dest) => cpSync(projectDir, dest, { recursive: true, filter: (s) => !/node_modules|[\\/]shots$|[\\/]\.reports|[\\/]\.lighthouseci|__pycache__/.test(s) });
const PG = pagesOf(projectDir), pg = (i) => PG[Math.min(i, PG.length - 1)];
const CSSFILE = project.delivery.stylesheet, SCRIPT = project.delivery.sharedFiles.find((f) => f.endsWith('.js'));

export async function checkSelftest({ quick = false } = {}) {
  const problems = [], notes = [];
  const expect = (cond, msg) => { if (!cond) problems.push(msg); };
  const cleanup = [];
  const tmp = (label) => { const d = scratch(label); cleanup.push(d); return d; };
  try {
    // ---- baseline check: wrong record, tampered checksums (a project with a baseline)
    if (project.baseline) {
      const rec = baselineRecord();
      expect(checkBaseline({ record: { ...rec, commit: '0'.repeat(40) } }).problems.length > 0, 'baseline: a wrong commit in the record must fail');
      expect(checkBaseline({ record: { ...rec, projectTree: '1'.repeat(40) } }).problems.length > 0, 'baseline: a wrong tree in the record must fail');
      expect(checkBaseline({ record: { ...rec, previewPackage: { ...rec.previewPackage, sha256: 'a'.repeat(64) } } }).problems.length > 0, 'baseline: a wrong package checksum must fail');
      const rr = tmp('records'); cpSync(join(repoRoot, rec.recordsDir), join(rr, rec.recordsDir), { recursive: true });
      edit(join(rr, rec.recordsDir, rec.sourceTreeChecksums.file), (t) => t.replace(/^[0-9a-f]/, (c) => (c === 'a' ? 'b' : 'a')));
      expect(checkBaseline({ recordsRoot: rr }).problems.some((p) => /checksum mismatch/.test(p)), 'baseline: a tampered checksum list must fail');
      notes.push('baseline: wrong commit, wrong tree, wrong package hash and a tampered checksum are all refused');
    } else notes.push('not run: the baseline cases (the project declares no baseline)');

    // ---- determinism: a random value in the output, a stale committed page (a project with a builder)
    if (project.delivery.build) {
      const c1 = tmp('det1'); copyProject(c1);
      const src = project.delivery.sourceRoots.flatMap((r) => listFiles(join(c1, r)).length || !existsSync(join(c1, r)) ? listFiles(join(c1, r)).map((f) => join(c1, r, f)) : [join(c1, r)]).find((f) => /\.mjs$/.test(f) && /<meta charset|<head>/.test(readFileSync(f, 'utf8')));
      expect(Boolean(src), 'determinism: no build source with a head template was found to damage');
      if (src) edit(src, (t) => (t.includes('<head>\\n') ? t.replace('<head>\\n', '<head>\\n<!-- ${Math.random()} -->\\n') : t.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<!-- ${Math.random()} -->')));
      const r1 = checkDeterminism({ root: c1 });
      expect(r1.problems.some((p) => /two builds differ/.test(p)) && r1.problems.some((p) => /uses a clock, random/.test(p)), `determinism: a random value in the output must be caught (got: ${r1.problems.join(' | ').slice(0, 200)})`);
      const c2 = tmp('det2'); copyProject(c2);
      edit(join(c2, pg(0)), (t) => t.replace('</html>', '<!-- hand edit --></html>'));
      expect(checkDeterminism({ root: c2 }).problems.some((p) => /committed pages differ/.test(p)), 'determinism: a hand-edited committed page must be caught');
      notes.push('determinism: a random value in the output and a hand-edited page are caught');
    } else notes.push('not run: the determinism cases (the project declares no builder)');

    // ---- authority: altered hash, retired skill used as authority, missing approval
    {
      const auth = record(project.creativeAuthority.record);
      const refPath = auth.records.frameworkReference, readme = auth.mustState.find((m) => /README/i.test(m.path)).path, doc = auth.records.requiredApprovals.length ? auth.mustState.find((m) => m.path !== readme)?.path ?? readme : readme;
      const mk = () => {
        const r = tmp('auth'); execFileSync('git', ['init', '-q'], { cwd: r });
        cpSync(join(repoRoot, projectFolder), join(r, projectFolder), { recursive: true, filter: (s) => !/node_modules|[\\/]\.git$|[\\/]shots$|[\\/]\.reports/.test(s) });
        for (const f of new Set([project.governance.approvalsLog, auth.records.approvals, refPath, readme, doc, ...auth.mustState.map((m) => m.path), ...(auth.retired?.allowedFiles || [])].filter(Boolean))) if (!existsSync(join(r, f))) { mkdirSync(join(r, f, '..'), { recursive: true }); cpSync(join(repoRoot, f), join(r, f), { recursive: true }); }
        return r;
      };
      const skillPrefix = auth.creativeAuthority.skillSha256.slice(0, 16);
      const untouched = checkAuthority({ root: mk(), framework: null });
      expect(untouched.problems.length === 0, `authority: an untouched copy of the records must pass (${untouched.problems.join(' | ').slice(0, 300)})`);
      let r = mk(); edit(join(r, refPath), (t) => t.replace(skillPrefix, `${skillPrefix[0] === 'e' ? 'f' : 'e'}${skillPrefix.slice(1)}`));
      expect(checkAuthority({ root: r, framework: null }).problems.some((p) => /skill SHA-256/.test(p)), 'authority: a changed skill hash in the reference must be caught');
      r = mk(); edit(join(r, readme), (t) => t + '\nFollow the STS Premium Web Design skill for palette and layout.\n');
      expect(checkAuthority({ root: r, framework: null }).problems.some((p) => /not an allowed historical document/.test(p)), 'authority: the retired skill named as authority in the README must be caught');
      const afOf = (root) => join(root, projectFolder, ...project.engDir.slice(project.root.length + 1).split(sep).filter(Boolean), project.creativeAuthority.record);
      r = mk(); const af = afOf(r); const aj = JSON.parse(readFileSync(af, 'utf8')); aj.retired = { ...(aj.retired || {}), allowedFiles: [...((aj.retired || {}).allowedFiles || []), doc] }; writeFileSync(af, JSON.stringify(aj, null, 2));
      edit(join(r, doc), (t) => t + '\n'.repeat(30) + 'Apply STS Premium Web Design to the palette.\n' + '\n'.repeat(30));
      expect(checkAuthority({ root: r, framework: null }).problems.some((p) => /without a marker/.test(p)), 'authority: an unmarked mention in an allowed document must be caught');
      const missing = auth.records.requiredApprovals.includes(ids.approval(19)) ? ids.approval(19) : auth.records.requiredApprovals[0];
      r = mk(); edit(join(r, project.governance.approvalsLog), (t) => t.split('\n').filter((l) => !l.startsWith(`| ${missing}`)).join('\n'));
      expect(checkAuthority({ root: r, framework: null }).problems.some((p) => new RegExp(missing).test(p)), 'authority: a missing approval record must be caught');
      r = mk(); edit(afOf(r), (t) => t.replace('"modifiedByThisProject": false', '"modifiedByThisProject": true'));
      expect(checkAuthority({ root: r, framework: null }).problems.some((p) => /must not be modified/.test(p)), 'authority: a record claiming the framework was modified must be caught');
      notes.push('authority: a changed hash, the retired skill as authority (README or unmarked), a missing approval and a framework-modified flag are caught');
    }

    // ---- delivery: an absolute reference, a missing file, a module import, a stray delivered file
    {
      const mk = () => { const c = assembleCandidate(projectDir, 'delivery'); cleanup.push(c); return c; };
      expect(checkDelivery({ root: mk() }).problems.length === 0, 'delivery: an untouched candidate must pass');
      let c = mk(); edit(join(c, pg(0)), (t) => t.replace(`href="${CSSFILE}"`, `href="/${CSSFILE}"`));
      expect(checkDelivery({ root: c }).problems.some((p) => /absolute/.test(p)), 'delivery: an absolute path to the stylesheet must be caught');
      c = mk(); edit(join(c, pg(1)), (t) => t.replace(`src="${SCRIPT}"`, 'src="script-v2.js"'));
      expect(checkDelivery({ root: c }).problems.some((p) => /not a delivered file/.test(p)), 'delivery: a reference to a missing script must be caught');
      c = mk(); edit(join(c, SCRIPT), (t) => `import { x } from './lib.mjs';\n${t}`);
      expect(checkDelivery({ root: c }).problems.some((p) => /module system/.test(p)), 'delivery: a module import in a delivered script must be caught');
      if (project.baseline) {
        c = mk(); mkdirSync(join(c, 'media'), { recursive: true }); writeFileSync(join(c, 'media', 'extra.webp'), 'x');
        expect(checkDelivery({ root: c }).problems.some((p) => /preview package/.test(p)), 'delivery: an extra delivered file must be caught');
        notes.push('delivery: an absolute path, a missing file, a module import and an unexpected delivered file are caught');
      } else notes.push('delivery: an absolute path, a missing file and a module import are caught (an unexpected delivered file needs a baseline to compare with: not run)');
    }

    if (project.baseline) {
      // ---- allowlist rules (no browser)
      {
        const appr = readFileSync(project.governance.approvalsPath, 'utf8');
        const ok = { id: 'X-1', file: pg(0), reason: 'r', workPackage: 'WP5', visual: false, normalize: [{ find: 'a', replace: 'b' }] };
        expect(validateAllowlist({ entries: [ok] }, appr).length === 0, 'allowlist: a complete non-visual entry must be accepted');
        expect(validateAllowlist({ entries: [{ ...ok, visual: true }] }, appr).length > 0, 'allowlist: a visual entry without an owner approval must be refused');
        expect(validateAllowlist({ entries: [{ ...ok, visual: true, approval: `${ids.approval(999)}` }] }, appr).length > 0, 'allowlist: a visual entry naming an approval that does not exist must be refused');
        expect(validateAllowlist({ entries: [{ ...ok, normalize: [] }] }, appr).length > 0, 'allowlist: an entry without normalisation rules must be refused');
        const b = exportBaseline('selftest-base'); cleanup.push(join(b, '..'));
        const c = assembleCandidate(projectDir, 'selftest-allow'); cleanup.push(c);
        edit(join(c, pg(0)), (t) => t.replace(CSSFILE, `${CSSFILE.replace(/\.css$/, '')}.abc123.css`));
        const real = loadAllowlist().entries;   // the approved differences of the real tree are part of the starting state
        const none = compareSources(b, c, { entries: real });
        const permitted = compareSources(b, c, { entries: [...real, { ...ok, normalize: [{ find: '\\.abc123\\.css', replace: '.css' }] }] });
        const insufficient = compareSources(b, c, { entries: [...real, { ...ok, normalize: [{ find: 'nothing-matches', replace: 'x' }] }] });
        expect(none.problems.length === 1, 'allowlist: an unlisted difference must be a problem');
        expect(permitted.problems.length === 0 && permitted.allowed.length === real.length + 1, 'allowlist: a difference fully explained by a listed rule must be allowed and reported');
        expect(insufficient.problems.length === 1, 'allowlist: a rule that does not explain the difference must not allow it');
        notes.push('allowlist: incomplete or unapproved visual entries are refused; only fully explained differences are allowed and reported');
      }

      // ---- the regression harness against mutated candidates (browser). These cases are generic; the cases that damage one project's own controls stay with that project.
      const base = exportBaseline('selftest-regression'); cleanup.push(join(base, '..'));
      const reportDir = join(engDir, '.reports', 'selftest');
      const run = async (name, mutate, only, subset) => {
        const cand = assembleCandidate(projectDir, 'mutant'); cleanup.push(cand);
        mutate(cand);
        const s = await runRegression({ baselineRoot: base, candidateRoot: cand, reportDir: join(reportDir, name), only, subset });
        return Object.fromEntries(Object.entries(s.layers).map(([k, v]) => [k, v.problems.length]));
      };
      const small = { pages: [pg(0), pg(1)], viewports: ['desktop-1440', 'mobile-390'], states: false, scenarios: /^hero: desktop with motion/ };
      const ALL = ['source', 'text', 'structure', 'styles', 'pixels', 'behaviour'];
      const cases = [
        ['one added character of visible text', (d) => edit(join(d, pg(0)), (t) => t.replace(/(<h1[^>]*>[\s\S]*?)(<\/h1>)/, '$1!$2')), ['source', 'text', 'structure'], ['behaviour']],
        ['a demonstration config value changed', (d) => edit(join(d, 'config', 'client.json'), (t) => t.replace(/("display": ")([^"]*)"/, '$1$2 "')), ['source'], []],
      ];
      for (const [name, mutate, mustFire, mustPass] of quick ? cases.slice(0, 1) : cases) {
        const r = await run(name.replace(/\W+/g, '-'), mutate, ALL.filter((l) => l !== 'behaviour' || mustFire.includes('behaviour') || mustPass.includes('behaviour')), small);
        for (const l of mustFire) expect(r[l] > 0, `regression: "${name}" must be caught by the ${l} layer (${JSON.stringify(r)})`);
        for (const l of mustPass) expect(r[l] === 0, `regression: "${name}" should not trip the ${l} layer (${JSON.stringify(r)})`);
        notes.push(`regression: "${name}" caught by ${mustFire.join(', ')}${mustPass.length ? `; ${mustPass.join(', ')} unaffected` : ''}`);
      }
    } else notes.push('not run: the allowlist and regression-harness cases (the project declares no baseline)');
  } finally { cleanup.forEach((d) => { try { rmSync(d, { recursive: true, force: true }); } catch { /* temp folder already gone */ } }); if (SCRATCH !== tmpdir()) { try { rmdirSync(SCRATCH); } catch { /* not empty or gone */ } } }
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
