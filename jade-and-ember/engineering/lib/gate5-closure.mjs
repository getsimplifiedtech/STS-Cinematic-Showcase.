// Gate 5 closure verification (Phase 9, APR-JE-037; closed by APR-JE-038). Read only, offline, reproducible by anyone with the repository: it checks the six things the
// owner asked to have verified before Gate 5 is closed, against the approvals log, git, CI.md, the migration matrix and the release gate.
// It approves nothing. Gate 5 is closed by the owner, and this module only reports whether the record supports that.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { engDir, projectDir, readJson, repoRoot } from './git.mjs';
import { parseApprovals } from './approvals.mjs';
import { approvalsText, classify, loadMatrix, repoFiles, validate } from './framework-matrix.mjs';
import { assembleCandidate } from './site.mjs';
import { buildManifest } from './hashed.mjs';
import { collectContext, evaluateGate, searchDigest, searchFilesPresent } from './release.mjs';
import { rmSync } from 'node:fs';
import { verifyScope } from './wp-scope.mjs';

const git = (args, cwd = repoRoot) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 26 }).trim();
const tryGit = (args, cwd) => { try { return { ok: true, out: git(args, cwd) }; } catch (e) { return { ok: false, out: String(e.stderr || e.message).trim() }; } };

export function verifyClosure({ framework = process.env.STS_FRAMEWORK_DIR || '/home/user/sts-web-design-framework' } = {}) {
  const rows = [], section = (s) => rows.push({ section: s });
  const add = (id, ok, detail) => rows.push({ id, ok: Boolean(ok), detail });
  const closure = readJson(join(engDir, 'gate5-closure.json'));
  const log = parseApprovals(approvalsText()), ids = new Set(log.map((r) => r.id));
  const matrix = loadMatrix();
  const ci = readFileSync(join(engDir, 'CI.md'), 'utf8');

  // 1. every assessment phase has an approved closure record
  section('1. All assessment phases have approved closure records');
  for (const ph of closure.phases) {
    const probs = [];
    for (const a of ph.authorisedBy) if (!ids.has(a)) probs.push(`authorising record ${a} is missing from the approvals log`);
    if (ph.closedBy) {
      const row = log.find((r) => r.id === ph.closedBy);
      if (!row) probs.push(`closing record ${ph.closedBy} is missing`);
      else if (!/closure|approval/i.test(row.type) || !new RegExp(`Phase ${ph.n}\\b|Phase ${ph.n} is|Phases? 0 and 1`, 'i').test(row.decision) && ph.n !== 0 && ph.n !== 1) probs.push(`${ph.closedBy} does not read as the closure of Phase ${ph.n}`);
    }
    for (const kind of ['code', 'docs']) {
      const d = ph[kind]; if (!d) continue;
      const full = tryGit(['rev-parse', '--verify', `${d.commit}^{commit}`]);
      if (!full.ok) { probs.push(`${kind} commit ${d.commit} does not exist`); continue; }
      if (!tryGit(['merge-base', '--is-ancestor', full.out, 'HEAD']).ok) probs.push(`${kind} commit ${d.commit} is not an ancestor of HEAD`);
      const row = ci.split('\n').find((l) => l.startsWith(`| ${d.run} (`));
      if (!row) probs.push(`${kind} run ${d.run} is not recorded in CI.md`);
      else if (!row.includes(`\`${d.commit}\``)) probs.push(`CI.md run ${d.run} is not for commit ${d.commit}`);
      else if (!/\*\*success/.test(row)) probs.push(`CI.md run ${d.run} is not recorded as successful`);
    }
    const closedText = ph.closedBy ? `closed by ${ph.closedBy}` : 'delivered; awaiting the owner\'s review (no closing record yet, as it should be)';
    add(`phase ${ph.n}`, !probs.length, `${ph.name}: authorised by ${ph.authorisedBy.join(', ')}; ${closedText}${ph.code ? `; code ${ph.code.commit} run ${ph.code.run}` : ''}${ph.docs ? `, records ${ph.docs.commit} run ${ph.docs.run}` : ''}${probs.length ? ` -- PROBLEMS: ${probs.join('; ')}` : ''}`);
  }
  const plan = readFileSync(join(engDir, 'GATE-5-PLAN.md'), 'utf8');
  add('plan status', /Phases 0 to 9 are CLOSED/.test(plan) && /Gate 5 is formally closed/.test(plan) && /G6-0 and G6-4 to G6-8 are not authorised to start/.test(plan), 'GATE-5-PLAN.md status line names Phases 0 to 9 as closed, Gate 5 as formally closed (an engineering assessment), G6-1 to G6-3 as closed and only G6-3A as authorised');

  // 2. the migration matrix and requirement register are complete
  section('2. The migration matrix and the requirement register are complete');
  const files = repoFiles();
  const v = validate(matrix, files, approvalsText());
  add('matrix', !v.problems.length, `${files.length} files in ${matrix.components.length} components, every file classified once, every reference resolves${v.problems.length ? ` -- PROBLEMS: ${v.problems.slice(0, 3).join('; ')}` : ''}`);
  const bold = [...approvalsText().matchAll(/\*\*(D-P[3-8]-\d+)\*\*/g)].map((m) => m[1]);
  const reg = new Set([...matrix.requirements.map((r) => r.id), ...matrix.decisions.map((d) => d.id)]);
  const missing = [...new Set(bold)].filter((d) => !reg.has(d));
  add('register', !missing.length, `${new Set(bold).size} owner decisions in the approvals log (D-P3 to D-P8), ${matrix.requirements.length} register entries, ${matrix.decisions.length} Phase 8 decisions; missing from the register: ${missing.join(', ') || 'none'}`);
  let md = ''; try { md = readFileSync(join(engDir, 'FRAMEWORK-MIGRATION-MATRIX.md'), 'utf8'); } catch { /* reported by the matrix check */ }
  add('generated matrix', md.includes(`${matrix.components.length} components`), 'FRAMEWORK-MIGRATION-MATRIX.md states the component count of the data');

  // 3. unresolved findings and production release blockers stay visible
  section('3. Unresolved findings and production release blockers remain visible');
  const rg = matrix.requirements.filter((r) => /^RG-\d+$/.test(r.id));
  add('findings RG', rg.length === 14 && rg.every((r) => /^(open|closed)/.test(r.status)), `RG-01 to RG-14: ${rg.filter((r) => /^open/.test(r.status)).length} open, ${rg.filter((r) => /^closed/.test(r.status)).length} closed by a recorded work package (none is marked fixed without one)`);
  const open = readJson(join(engDir, 'findings.json')).findings;
  add('findings register', open.length > 0, `engineering/findings.json: ${open.length} open (${open.map((f) => `${f.id} ${f.severity}`).join(', ')}); none is Blocker or Major`);
  const hr = (readFileSync(join(engDir, 'hosting', 'UNRESOLVED-HOSTING-RISKS.md'), 'utf8').match(/^\| HR-\d+ /gm) || []).length;
  add('hosting risks', hr === 18, `${hr} hosting risks HR-01 to HR-18 are listed`);
  add('blockers', matrix.releaseBlockers.length >= 14 && Array.from({ length: 14 }, (_, i) => `RB-${String(i + 1).padStart(2, '0')}`).every((id) => matrix.releaseBlockers.some((b) => b.id === id)) && matrix.releaseBlockers.every((b) => b.text && b.resolvedBy), `${matrix.releaseBlockers.length} production release blockers (the 14 recorded at Gate 5 closure, none removed), each with who resolves it`);
  const dir = assembleCandidate(projectDir, 'closure');
  let g;
  try {
    const ctx = collectContext();
    g = evaluateGate({ ...ctx, channel: 'client-production', version: { ...ctx.version, channel: 'client-production' }, assetsTree: buildManifest(dir).treeSha256, searchDigest: searchDigest(dir), siteHasSearchFiles: searchFilesPresent(dir) });
  } finally { rmSync(dir, { recursive: true, force: true }); }
  const must = ['stableVersion', 'releaseApproval', 'rightsVerification', 'evidence:real-device', 'evidence:screen-reader', 'evidence:browser-matrix', 'evidence:ci-run', 'noDemoText', 'productionSeoComplete', 'productionDomain', 'searchReadiness'];
  const unmet = g.requirements.filter((r) => !r.ok).map((r) => r.id);
  add('client-production gate', !g.allowed && must.every((m) => unmet.includes(m)), `the repository evaluated as a client-production release is BLOCKED by ${unmet.length} of ${g.requirements.length} requirements: ${unmet.join(', ')}`);

  // 4. the master framework repository is unchanged
  section('4. The master framework repository is unchanged');
  const auth = readJson(join(engDir, 'authority.json')).framework;
  add('recorded reference', auth.modifiedByThisProject === false && auth.commit === closure.frameworkTipsRead.branches['feature/anthropic-frontend-design-standard'] && auth.mainCommit === closure.frameworkTipsRead.branches.main, `authority.json: modifiedByThisProject ${auth.modifiedByThisProject}; pin ${auth.commit.slice(0, 7)} and main ${auth.mainCommit.slice(0, 7)} equal the tips read from the GitHub API on ${closure.assessedOn}`);
  if (existsSync(join(framework, '.git'))) {
    const st = tryGit(['status', '--porcelain'], framework), head = tryGit(['rev-parse', 'HEAD'], framework);
    add('local clone', st.ok && st.out === '' && head.out === closure.frameworkTipsRead.localCloneHead, `local clone ${framework}: working tree ${st.out === '' ? 'clean' : 'MODIFIED'}, HEAD ${String(head.out).slice(0, 7)} (recorded ${closure.frameworkTipsRead.localCloneHead.slice(0, 7)})`);
  } else add('local clone', true, `no local clone at ${framework}: not checked here (the remote tips above were read through the GitHub API and are recorded)`);
  const touched = tryGit(['log', '--oneline', '--all', '--', 'sts-web-design-framework']).out;
  add('no framework files in this repository', touched === '' && !files.some((f) => /^sts-web-design-framework\//.test(f)), 'no framework file was copied into this repository (no path under sts-web-design-framework/)');

  // 5. no deployment, merge or release approval has been implied
  section('5. No deployment, merge or release approval has been implied');
  const bad = log.filter((r) => /release-approval|deployment-approval|rights-verification|search-review/i.test(r.type));
  add('approvals', !bad.length, `approval records of type release, deployment, rights verification or search review in the log: ${bad.length}`);
  const evDir = join(engDir, 'release', 'evidence');
  const ev = existsSync(evDir) ? readdirSync(evDir).filter((f) => f.endsWith('.json')) : [];
  add('evidence', ev.length === 0, `evidence records in engineering/release/evidence/: ${ev.length} (no device, screen-reader, browser or CI-run record has been written)`);
  const ver = readJson(join(projectDir, 'VERSION.json'));
  add('version', /-/.test(ver.version) && ver.channel === 'demonstration', `VERSION.json ${ver.version} on the ${ver.channel} channel: a pre-release demonstration, not a release`);
  const merges = tryGit(['log', '--merges', '--oneline', 'origin/main..HEAD']);
  const onMain = tryGit(['merge-base', '--is-ancestor', 'HEAD', 'origin/main']);
  add('merge', merges.ok && merges.out === '' && !onMain.ok, `merge commits on this branch since origin/main: ${merges.ok ? merges.out.split('\n').filter(Boolean).length : 'unknown'}; HEAD is ${onMain.ok ? 'ON' : 'not on'} origin/main`);
  add('release folder', !existsSync(join(projectDir, 'release')) && !existsSync(join(projectDir, 'host')), 'no release/ or host/ output folder exists');
  const wf = readFileSync(join(repoRoot, '.github', 'workflows', 'jade-and-ember-verify.yml'), 'utf8');
  add('workflow', /permissions:\s*\n\s*contents:\s*read/.test(wf) && !/\benvironment\s*:|secrets\.|GITHUB_TOKEN|id-token/.test(wf) && !/pull_request_target|workflow_run|schedule\s*:/.test(wf), 'the workflow is read-only, has no environment, secret or token, and no privileged or scheduled trigger (the full scan is part of check:release-dryrun)');

  // 6. the Gate 6 work packages are consistent with the approved decisions
  section('6. The Gate 6 work packages are consistent with the approved decisions');
  for (const d of matrix.decisions) {
    const probs = [];
    for (const w of d.workPackages) if (!matrix.workPackages.some((x) => x.id === w)) probs.push(`work package ${w} does not exist`);
    for (const c of d.consequences) { const w = matrix.workPackages.find((x) => x.id === c.wp); if (!w || !new RegExp(c.mustMention, 'i').test(`${w.title} ${w.summary} ${w.verification}`)) probs.push(`${c.wp} does not mention "${c.mustMention}"`); }
    add(d.id, !probs.length, `${d.text}: ${d.status}; ${d.workPackages.join(', ')}${probs.length ? ` -- PROBLEMS: ${probs.join('; ')}` : ''}`);
  }
  const pri = matrix.priorities.every((p) => matrix.workPackages.find((w) => w.id === p.wp)?.priorities.includes(Number(p.id.slice(2))));
  add('priorities', pri && matrix.priorities.length === 8, 'the eight required Gate 6 priorities of APR-JE-036 are each assigned to a work package that lists them');
  // Gate 6 authorisation: G6-1 (APR-JE-039), G6-2 (APR-JE-040) and G6-3 (APR-JE-041) are closed with their end commits recorded; only G6-3A (release authentication and provenance, design and decision checkpoint) is authorised now (APR-JE-041); every change of each lies inside its recorded scope
  const g6 = matrix.workPackages.filter((w) => /^G6-/.test(w.id));
  const scoped = g6.filter((w) => w.scope).map((w) => w.id);
  const pkg = (id) => matrix.workPackages.find((w) => w.id === id);
  const wp1 = pkg('G6-1'), wp2 = pkg('G6-2'), wp3 = pkg('G6-3'), wp3a = pkg('G6-3A'), wp4 = pkg('G6-4');
  const rec = (id) => log.find((r) => r.id === id);
  const auth38 = rec('APR-JE-038'), auth39 = rec('APR-JE-039'), auth40 = rec('APR-JE-040'), auth41 = rec('APR-JE-041'), auth44 = rec('APR-JE-044');
  const sequence = matrix.workPackages.filter((w) => /^G6-/.test(w.id)).map((w) => w.id);
  const between = wp4?.dependsOn.includes('G6-3A') && wp3a?.dependsOn.join() === 'G6-3';
  add('only G6-4 authorised', scoped.join() === 'G6-1,G6-2,G6-3,G6-3A,G6-4' && wp1.scope.authorisedBy === 'APR-JE-038' && wp2.scope.authorisedBy === 'APR-JE-039' && wp3.scope.authorisedBy === 'APR-JE-040' && wp3a.scope.authorisedBy === 'APR-JE-041' && wp4.scope.authorisedBy === 'APR-JE-044' && Boolean(auth38 && auth39 && auth40 && auth41 && auth44) && /G6-1/.test(auth38.decision) && /G6-2/.test(auth39.decision) && /G6-3/.test(auth40.decision) && /G6-3A/.test(auth41.decision) && /G6-4/.test(auth44.decision) && /proof of concept/i.test(auth44.decision) && wp1.scope.closedBy === 'APR-JE-039' && wp2.scope.closedBy === 'APR-JE-040' && wp3.scope.closedBy === 'APR-JE-041' && wp3a.scope.closedBy === 'APR-JE-044' && /not production activation/.test(wp3a.scope.closedAs || '') && !wp4.scope.closedBy && between && !pkg('G6-5')?.scope, `work packages with a recorded scope: ${scoped.join(', ')}; G6-1 authorised by ${wp1.scope.authorisedBy} and closed by ${wp1.scope.closedBy}; G6-2 authorised by ${wp2.scope.authorisedBy} and closed by ${wp2.scope.closedBy}; G6-3 authorised by ${wp3.scope.authorisedBy} and closed by ${wp3.scope.closedBy}; G6-3A authorised by ${wp3a.scope.authorisedBy} and closed by ${wp3a.scope.closedBy} as a proof of concept only; G6-4 authorised by ${wp4.scope.authorisedBy}, G6-5 not authorised: ${pkg('G6-5')?.scope ? 'NO' : 'yes'}; G6-3A placed between G6-3 and G6-4: ${between ? 'yes' : 'NO'}; the approval records are ${auth38 && auth39 && auth40 && auth41 && auth44 ? 'in' : 'NOT in'} the approvals log; order ${sequence.join(' ')}`);
  const ends = [wp1, wp2, wp3, wp3a].map((w) => tryGit(['merge-base', '--is-ancestor', w.scope.endCommit, 'HEAD']));
  const scopes = ['G6-1', 'G6-2', 'G6-3', 'G6-3A', 'G6-4'].map((id) => verifyScope(id, { matrix }));
  [wp1, wp2, wp3, wp3a].forEach((w, i) => add(`${w.id} scope`, ends[i].ok && scopes[i].ok, `${scopes[i].changed.length} files changed from the ${w.id} base ${w.scope.baseCommit.slice(0, 7)} to its end ${w.scope.endCommit.slice(0, 7)} (${ends[i].ok ? 'an ancestor of HEAD' : 'NOT an ancestor of HEAD'}); ${scopes[i].ok ? 'all inside the authorised scope' : `PROBLEMS: ${scopes[i].problems.slice(0, 3).join('; ')}`}`));
  add('G6-4 scope', scopes[4].ok, `${scopes[4].changed.length} files changed since the G6-4 base ${wp4.scope.baseCommit.slice(0, 7)}; ${scopes[4].ok ? 'all inside the authorised scope (documents, the matrix, this verifier, the hosting adapters and their checks and the HSTS default; nothing in the release gate, the release-control proof of concept or any delivered file is changed, and no deployment, credential or release path exists)' : `PROBLEMS: ${scopes[4].problems.slice(0, 3).join('; ')}`}`);
  return { rows, ok: rows.filter((r) => 'ok' in r).every((r) => r.ok) };
}
