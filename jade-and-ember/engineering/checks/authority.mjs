// check:authority. Design authority and framework reference are recorded, consistent, and not contradicted anywhere.
//   1. authority.json is well formed; every pinned commit and hash also appears in the written reference
//   2. the approval record holds the required approvals
//   3. required statements of authority are present
//   4. the retired STS Premium Web Design skill appears only in allowed historical documents, each mention near a marker such as "retired"
//      or "historical", and never in code, configuration, styles, pages or tests
//   5. optionally, against a local checkout of the framework (--framework <dir> or STS_FRAMEWORK_DIR): the pinned commit exists, the
//      Frontend Design skill and licence hash to the recorded values, and the retired skill is a deprecation redirect there
// Never modifies the framework: it only reads it. Run: node engineering/checks/authority.mjs [--framework <dir>]
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { engDir, git, isMain, readJson, repoRoot, sha256 } from '../lib/git.mjs';

const WINDOW = 6;   // a mention must have a marker within this many lines

export function checkAuthority({ root = repoRoot, framework = process.env.STS_FRAMEWORK_DIR } = {}) {
  const problems = [], notes = [];
  const auth = readJson(join(root, 'jade-and-ember', 'engineering', 'authority.json'));
  const read = (rel) => (existsSync(join(root, rel)) ? readFileSync(join(root, rel), 'utf8') : null);

  // 1. record shape and agreement with the written reference
  const hex = (v, n) => typeof v === 'string' && new RegExp(`^[0-9a-f]{${n}}$`).test(v);
  const ca = auth.creativeAuthority, fw = auth.framework;
  if (!hex(ca.skillSha256, 64) || !hex(ca.licenseSha256, 64)) problems.push('authority.json: skill and licence hashes must be 64 hex characters');
  if (!hex(fw.commit, 40) || !hex(fw.mainCommit, 40)) problems.push('authority.json: framework commits must be 40 hex characters (a branch name or short SHA is not an exact reference)');
  if (fw.modifiedByThisProject !== false) problems.push('authority.json: the framework repository must not be modified by this project (modifiedByThisProject must be false)');
  const ref = read(auth.records.frameworkReference);
  if (ref === null) problems.push(`missing ${auth.records.frameworkReference}`);
  else {
    for (const [what, value] of [['framework commit', fw.commit], ['framework main commit', fw.mainCommit], ['skill SHA-256', ca.skillSha256], ['licence SHA-256', ca.licenseSha256], ['framework repository', fw.repository], ['framework branch', fw.branch], ['skill path', ca.skillPath]]) {
      if (!ref.includes(value)) problems.push(`${auth.records.frameworkReference} does not contain the ${what} recorded in authority.json (${value.slice(0, 12)}...)`);
    }
    if (!problems.length) notes.push('authority.json and the framework reference agree (commit, hashes, repository, branch, skill path)');
  }

  // 2. approvals
  const appr = read(auth.records.approvals) || '';
  const missing = auth.records.requiredApprovals.filter((id) => !new RegExp(`\\|\\s*${id}\\s*\\|`).test(appr));
  if (missing.length) problems.push(`approval records missing: ${missing.join(', ')}`);
  else notes.push(`required approval records present (${auth.records.requiredApprovals.join(', ')})`);

  // 3. required statements
  for (const m of auth.mustState) {
    const text = read(m.path);
    if (text === null) problems.push(`missing ${m.path} (${m.why})`);
    else if (!text.includes(m.text)) problems.push(`${m.path} must state "${m.text}" (${m.why})`);
  }

  // 4. the retired skill is history only
  const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 }).split('\0').filter(Boolean);
  const textFile = /\.(md|mjs|js|json|css|html|txt|py|yml|yaml)$/i;
  const re = new RegExp(auth.retired.patterns.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i');
  const marker = new RegExp(auth.retired.markers.join('|'), 'i');
  const allowed = new Set(auth.retired.allowedFiles);
  let mentions = 0, scanned = 0;
  for (const f of files) {
    if (!textFile.test(f) || /(^|\/)node_modules\//.test(f) || /\.zip$/i.test(f) || !existsSync(join(root, f))) continue;
    scanned++;
    const lines = readFileSync(join(root, f), 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (!re.test(line)) return;
      mentions++;
      if (!allowed.has(f)) { problems.push(`${f}:${i + 1} mentions the retired STS Premium Web Design skill but is not an allowed historical document`); return; }
      const near = lines.slice(Math.max(0, i - WINDOW), i + WINDOW + 1).join('\n');
      if (!marker.test(near)) problems.push(`${f}:${i + 1} mentions the retired skill without a marker such as "retired" or "historical" within ${WINDOW} lines`);
    });
  }
  notes.push(`${scanned} text files scanned; ${mentions} mentions of the retired skill, all in allowed historical documents next to a marker`);

  // 5. the framework checkout (read only)
  if (framework) {
    const before = problems.length;
    const fg = (args) => execFileSync('git', ['-C', framework, ...args], { encoding: 'utf8', maxBuffer: 1 << 26 }).trim();
    const blob = (path) => execFileSync('git', ['-C', framework, 'show', `${fw.commit}:${path}`], { maxBuffer: 1 << 26 });
    try {
      if (fg(['cat-file', '-t', fw.commit]) !== 'commit') throw new Error('not a commit');
      if (sha256(blob(ca.skillPath)) !== ca.skillSha256) problems.push(`framework @ ${fw.commit.slice(0, 7)}: ${ca.skillPath} does not hash to the recorded value`);
      if (sha256(blob(ca.licensePath)) !== ca.licenseSha256) problems.push(`framework @ ${fw.commit.slice(0, 7)}: ${ca.licensePath} does not hash to the recorded value`);
      if (!/name:\s*frontend-design/.test(blob(ca.skillPath).toString('utf8'))) problems.push('framework skill front matter does not name "frontend-design"');
      const old = blob('.claude/skills/sts-premium-web-design/SKILL.md').toString('utf8');
      if (!/deprecat|retired|superseded|redirect/i.test(old)) problems.push('framework: the retired skill is not marked deprecated at the pinned commit');
      try { fg(['cat-file', '-e', fw.mainCommit]); } catch { problems.push(`framework main commit ${fw.mainCommit.slice(0, 7)} not found in the checkout`); }
      if (problems.length === before) notes.push(`verified against the framework checkout at ${fw.commit.slice(0, 7)}: skill and licence hashes match; retired skill is a deprecation redirect`);
    } catch (e) { problems.push(`framework checkout ${framework} cannot confirm commit ${fw.commit}: ${String(e.message).split('\n')[0]}`); }
  } else notes.push('framework checkout not provided (--framework <dir> or STS_FRAMEWORK_DIR): the pinned commit and hashes were checked against the written record only');
  return { problems, notes };
}

if (isMain(import.meta.url)) {
  const i = process.argv.indexOf('--framework');
  const { problems, notes } = checkAuthority(i > -1 ? { framework: process.argv[i + 1] } : {});
  notes.forEach((n) => console.log('  ' + n));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:authority`);
  process.exit(problems.length ? 1 : 0);
}
