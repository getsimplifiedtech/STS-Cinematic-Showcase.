// check:extraction (specification 16, 10.2 and 9.3). The files the engineering took from its source project are byte-identical to it, or carry a change-ledger entry for the bytes
// they have now (tools/verify-extraction.mjs); and the production authenticity hard stop (lib/authenticity.mjs) still has the exact bytes it was extracted with. The second
// statement is made twice, on purpose: the manifest records the hash, and so does this module, so that changing the file needs a visible edit of verifying code as well as a
// matching edit of a data file; the engine digest covers both, and a reviewer sees both in the diff. (It cannot stop a person who edits everything; it makes that visible.)
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { coreDir } from '../lib/project.mjs';
import { isMain } from '../lib/git.mjs';
import { PROTECTED_SHA256, SNAPSHOT_RECORD, verifyRepo } from '../tools/snapshot.mjs';
import { repositoryIdentity } from '../lib/ci-exceptions.mjs';
import { SNAPSHOT_REPOSITORIES } from '../lib/ci-policy.mjs';

// The pin lives in tools/snapshot.mjs (the verifier cannot be run without it) and is re-exported here, where the framework mode compares the file against it too.
export { PROTECTED_SHA256 };

// Two modes, one question: are the files of the engineering exactly what they claim to be?
//  * framework mode (the framework repository): the extraction manifest and its change ledger (tools/verify-extraction.mjs);
//  * snapshot mode (a consumer repository that carries a public snapshot, G6-8, specification 16 section 10.9): the integrity record beside the engineering
//    (sts-framework-snapshot.json) and every file against it (tools/snapshot.mjs). The private ledger is not part of a snapshot.
// A repository that is listed as a snapshot consumer (lib/ci-policy.mjs) must carry the record: deleting it fails the check instead of switching to framework mode, where a
// hand-made manifest and ledger tool could pass. (A copy whose identity cannot be told is judged by whichever files it has.)
export async function checkExtraction({ core = coreDir, identity = repositoryIdentity() } = {}) {
  const problems = [], notes = [];
  const base = join(core, '..');
  const manifestPath = join(core, 'EXTRACTION-MANIFEST.json');
  if (identity && SNAPSHOT_REPOSITORIES.includes(identity) && !existsSync(join(base, SNAPSHOT_RECORD))) return { problems: [`${SNAPSHOT_RECORD} is missing: ${identity} carries the framework as a verified snapshot and must keep its integrity record beside the engineering`], notes };
  if (existsSync(join(base, SNAPSHOT_RECORD))) {
    const r = verifyRepo(base, { protectedHashes: PROTECTED_SHA256 });
    problems.push(...r.problems);
    notes.push(...r.notes);
    if (existsSync(manifestPath)) problems.push('EXTRACTION-MANIFEST.json is present beside a snapshot record: a snapshot never carries the private ledger');
    return { problems, notes };
  }
  if (!existsSync(manifestPath)) return { problems: ['neither EXTRACTION-MANIFEST.json (framework) nor sts-framework-snapshot.json (snapshot consumer) is present beside the engineering'], notes };
  const { verifyExtraction, verifyFrameworkExceptions } = await import('../tools/verify-extraction.mjs');
  const r = verifyExtraction({ manifestPath, base });
  problems.push(...r.problems);
  problems.push(...verifyFrameworkExceptions({ file: join(core, 'ci', 'exceptions.json') }).problems);
  const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
  for (const [file, want] of Object.entries(PROTECTED_SHA256)) {
    const p = join(base, file);
    if (!existsSync(p)) { problems.push(`${file}: the protected file is missing`); continue; }
    const got = createHash('sha256').update(readFileSync(p)).digest('hex');
    if (got !== want) problems.push(`${file}: differs from the bytes pinned in checks/extraction.mjs (${got.slice(0, 12)} against ${want.slice(0, 12)})`);
    if (!(m.protected || []).includes(file)) problems.push(`${file}: is not listed as protected in the extraction manifest`);
  }
  if (!problems.length) notes.push(`extraction from ${r.commit.slice(0, 7)}: ${r.total} files, ${r.identical} identical to their source, ${r.changed} changed with a ledger entry, ${r.removed} removed with a ledger entry; the production hard stop is byte-identical to its pinned hash`);
  return { problems, notes };
}

if (isMain(import.meta.url)) {
  const { problems, notes } = await checkExtraction();
  notes.forEach((n) => console.log('  ' + n));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:extraction`);
  process.exit(problems.length ? 1 : 0);
}
