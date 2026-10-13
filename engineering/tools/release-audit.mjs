// node engineering/tools/release-audit.mjs [approvals|evidence|deployments|verification|all]     (npm run release:audit -- approvals)
// Read-only audit of the release record families (G6-2, APR-JE-039; design section 10). Each family is independent: it is judged by its own validator against
// the candidate artifact digest of the build in the working tree, and the audit says, for every file, whether it is IN FORCE and why not if it is not.
// It writes nothing, decides nothing and deploys nothing. Exit 1 when a record is unreadable or malformed (a gate-blocking error), otherwise 0.
import { rmSync } from 'node:fs';
import { assembleCandidate } from '../lib/site.mjs';
import { projectDir } from '../lib/git.mjs';
import { assessedEvidence, attachBuild, collectContext } from '../lib/release.mjs';
import { auditFamily, loadFamily, validateReviewers } from '../lib/records.mjs';
import { validateVerification } from '../lib/verification.mjs';
import { coverage } from '../lib/evidence.mjs';
import { loadSpec } from '../lib/evidence.mjs';

const which = process.argv[2] || 'all';
const dir = assembleCandidate(projectDir, 'audit');
let bad = 0;
try {
  const ctx = attachBuild(collectContext(), dir);
  const cand = ctx.candidate.digest;
  console.log(`candidate artifact digest ${cand}\nchannel ${ctx.channel}, version ${ctx.version.version}; commit ${ctx.git.commit.slice(0, 7)}${ctx.git.dirty ? ' (dirty)' : ''}`);
  const baseHost = (() => { try { return new URL(ctx.client.seo.baseUrl).hostname; } catch { return null; } })();
  const rctx = { candidate: cand, channel: ctx.channel, version: ctx.version.version, table: ctx.reviewers, today: ctx.today, now: ctx.now, baseHost, searchDigest: ctx.searchDigest, mediaDigest: ctx.mediaDigest, destinationsDigest: ctx.ext.digest };
  const reviewerProblems = validateReviewers(ctx.reviewers, { ledgerIds: new Set(ctx.approvals.map((a) => a.id)) });
  console.log(`\nreviewer table: ${ctx.reviewers.reviewers.length} reviewer(s)${reviewerProblems.length ? ` -- PROBLEMS: ${reviewerProblems.join('; ')}` : ''}`);
  bad += reviewerProblems.length;
  for (const family of ['approvals', 'deployments']) {
    if (which !== 'all' && which !== family) continue;
    const a = auditFamily(family, rctx);
    console.log(`\n== ${family}: ${a.count} record file(s) in engineering/release/${family}/`);
    for (const t of a.types) {
      console.log(`  ${t.type}: ${t.met ? 'SATISFIED' : 'not satisfied'} — ${t.detail}`);
      t.errors.forEach((e) => { console.log(`    ERROR (blocks the gate): ${e}`); bad++; });
    }
    for (const r of a.files) console.log(`    ${r.file.padEnd(34)} ${String(r.id ?? '?').padEnd(12)} ${String(r.status ?? '').padEnd(10)} ${r.state}`);
  }
  if (which === 'all' || which === 'evidence') {
    const spec = loadSpec(), assessed = assessedEvidence(ctx);
    console.log(`\n== evidence: ${assessed.length} record file(s) in engineering/release/evidence/`);
    for (const e of assessed) console.log(`    ${e.file.padEnd(40)} ${String(e.type).padEnd(14)} ${e.valid ? (e.success ? 'valid, successful' : 'valid, not a success') : `INVALID: ${e.problems[0]}`}`);
    for (const t of ['real-device', 'screen-reader', 'browser-matrix', 'ci-run']) { const c = coverage(spec, t, assessed); console.log(`  ${t}: ${c.ok ? 'SATISFIED' : 'not satisfied'} — ${c.detail}`); }
  }
  if (which === 'all' || which === 'verification') {
    const p = validateVerification(ctx.verify, { candidate: cand, engineDigest: ctx.engine.engineDigest, ids: ctx.engine.ids });
    console.log(`\n== verification (engineering/.reports/verify.json): ${p.length ? 'NOT VALID FOR THIS BUILD' : 'valid for this build'}`);
    p.forEach((x) => console.log(`    - ${x}`));
    if (!p.length) console.log(`    full run of ${ctx.engine.ids.length} checks, seal ${ctx.verify.seal}, ${ctx.verify.environment.runner}${ctx.verify.environment.runId ? ` run ${ctx.verify.environment.runId}` : ''}`);
  }
  console.log(`\naudit: ${bad ? `${bad} blocking error(s)` : 'no unreadable or malformed record'} (read only; nothing was changed or deployed). This proves binding and consistency, not who made a record (G6-2-DESIGN.md section 12).`);
} finally { rmSync(dir, { recursive: true, force: true }); }
process.exit(bad ? 1 : 0);
void loadFamily;
