// check:baseline. The frozen v0.8 baseline is intact and every other check can trust it.
//   1. the baseline branch (local or origin's) resolves to the recorded commit
//   2. that commit has the recorded repository and project trees
//   3. all recorded source checksums match the files at that commit
//   4. the preview package matches its recorded SHA-256 and size
// Fails closed: if the branch is missing the check says how to fetch it. Run: node engineering/checks/baseline.mjs
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { baselineRecord, git, gitBuffer, isMain, repoRoot, resolveBaseline, sha256 } from '../lib/git.mjs';

// Overrides exist only so the self-test can prove the check fails on a wrong record or tampered checksums.
export function checkBaseline({ record = baselineRecord(), recordsRoot = repoRoot } = {}) {
  const rec = record;
  const problems = [], notes = [];
  const { ref, commit } = resolveBaseline(rec);
  if (!commit) {
    problems.push(`baseline branch "${rec.branch}" not found. Fetch it: git fetch origin ${rec.branch}:refs/remotes/origin/${rec.branch}`);
    return { problems, notes };
  }
  notes.push(`${ref.replace('refs/', '')} -> ${commit}`);
  if (commit !== rec.commit) problems.push(`baseline branch is at ${commit}, expected ${rec.commit}. The baseline must never move`);
  // Verify the recorded commit itself, whatever the branch says.
  try {
    const tree = git(['rev-parse', `${rec.commit}^{tree}`]);
    const sub = git(['rev-parse', `${rec.commit}:${rec.projectPath}`]);
    if (tree !== rec.repositoryTree) problems.push(`repository tree ${tree} != recorded ${rec.repositoryTree}`);
    if (sub !== rec.projectTree) problems.push(`project tree ${sub} != recorded ${rec.projectTree}`);
    if (!problems.length) notes.push(`trees match (repository ${tree.slice(0, 7)}, project ${sub.slice(0, 7)})`);
  } catch (e) { problems.push(`recorded commit ${rec.commit} is not available locally (${String(e.message).split('\n')[0]})`); return { problems, notes }; }

  const sums = readFileSync(join(recordsRoot, rec.recordsDir, rec.sourceTreeChecksums.file), 'utf8').split('\n').filter(Boolean);
  let ok = 0;
  for (const line of sums) {
    const m = /^([0-9a-f]{64}) {2}(.+)$/.exec(line);
    if (!m) { problems.push(`unreadable checksum line: ${line}`); continue; }
    let data;
    try { data = gitBuffer(['show', `${rec.commit}:${m[2]}`]); } catch { problems.push(`missing at the baseline commit: ${m[2]}`); continue; }
    if (sha256(data) === m[1]) ok++; else problems.push(`checksum mismatch: ${m[2]}`);
  }
  if (sums.length !== rec.sourceTreeChecksums.files) problems.push(`checksum list has ${sums.length} entries, expected ${rec.sourceTreeChecksums.files}`);
  const tracked = git(['ls-tree', '-r', '--name-only', rec.commit, rec.projectPath]).split('\n').filter(Boolean);
  const listed = new Set(sums.map((l) => l.slice(66)));
  for (const f of tracked) if (!listed.has(f)) problems.push(`file at the baseline commit has no recorded checksum: ${f}`);
  notes.push(`${ok}/${sums.length} source checksums match`);

  const zip = join(recordsRoot, rec.recordsDir, rec.previewPackage.file);
  if (!existsSync(zip)) problems.push(`preview package missing: ${rec.recordsDir}/${rec.previewPackage.file}`);
  else {
    const buf = readFileSync(zip);
    if (sha256(buf) !== rec.previewPackage.sha256) problems.push('preview package SHA-256 does not match the record');
    else if (statSync(zip).size !== rec.previewPackage.bytes) problems.push('preview package size does not match the record');
    else notes.push(`preview package ${rec.previewPackage.sha256.slice(0, 12)}... matches`);
  }
  return { problems, notes };
}

if (isMain(import.meta.url)) {
  const { problems, notes } = checkBaseline();
  notes.forEach((n) => console.log('  ' + n));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:baseline`);
  process.exit(problems.length ? 1 : 0);
}
