// node engineering/tools/release-record.mjs template <release-approval|rights-verification|search-review|external-links-review|deployment-authorisation> [--out <file>]
// Prints (or writes) a TEMPLATE for a release record with the facts of the current build filled in (candidate digest, channel, version, the production host,
// the search digest) and NO DECISION: the status, the reviewer, the time and the rationale are the authorised person's to write. A template is invalid on
// purpose (its status is a placeholder), so it can never be mistaken for, or turn into, an approval by accident. This tool never writes an approval.
import { existsSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { assembleCandidate } from '../lib/site.mjs';
import { engDir, projectDir } from '../lib/git.mjs';
import { attachBuild, collectContext } from '../lib/release.mjs';
import { APPROVAL_SCHEMA, DEPLOYMENT_SCHEMA, RIGHTS_BASES, SEARCH_REVIEWED, TYPES } from '../lib/records.mjs';

const [cmd, type] = process.argv.slice(2);
const i = process.argv.indexOf('--out');
if (cmd !== 'template' || !TYPES[type]) { console.error(`usage: release-record.mjs template <${Object.keys(TYPES).join('|')}> [--out <file>]`); process.exit(2); }
const dir = assembleCandidate(projectDir, 'record');
try {
  const ctx = attachBuild(collectContext(), dir);
  const host = (() => { try { return new URL(ctx.client.seo.baseUrl).hostname; } catch { return ''; } })();
  const fam = join(engDir, 'release', TYPES[type].family);
  const next = 1 + Math.max(0, ...(existsSync(fam) ? readdirSync(fam).map((f) => Number((new RegExp(`^${TYPES[type].prefix}-JE-(\\d+)`).exec(f) || [])[1] || 0)) : [0]));
  const id = `${TYPES[type].prefix}-JE-${String(next).padStart(3, '0')}`;
  const subject = type === 'release-approval' ? { productionHost: host }
    : type === 'search-review' ? { searchDigest: ctx.searchDigest || '', reviewed: [] }
    : type === 'rights-verification' ? { sources: [], verifiedOn: '', inventory: ctx.mediaDigest, basis: '' }
    : type === 'external-links-review' ? { destinationsDigest: ctx.ext.digest, verification: '', opened: false }
    : { releaseApproval: '', targetHost: host };
  const rec = {
    schema: type === 'deployment-authorisation' ? DEPLOYMENT_SCHEMA : APPROVAL_SCHEMA, id, type,
    status: `<TEMPLATE: write approved, rejected, revoked or superseded>`,
    candidate: ctx.candidate.digest, channel: ctx.channel, version: ctx.version.version, subject,
    decidedBy: { reviewer: '', name: '' }, decidedAt: '', rationale: '',
  };
  const note = type === 'search-review' ? `reviewed must list ${SEARCH_REVIEWED.join(', ')} once a person has reviewed them`
    : type === 'rights-verification' ? `basis must be one of ${RIGHTS_BASES.join(', ')} (authorised use is enough; ownership is not required) once a person has read the dated provider terms; inventory is the digest of the delivered media and fonts`
    : type === 'external-links-review' ? `verification must name the EXTV record relied on and opened must be true only once a person has opened every destination (${ctx.ext.destinations.length} destination(s))` : '';
  const out = JSON.stringify(rec, null, 2) + '\n';
  if (i > -1) { writeFileSync(resolve(process.argv[i + 1]), out); console.log(`wrote the template ${process.argv[i + 1]} (invalid until an authorised person completes it)${note ? `; ${note}` : ''}`); } else { process.stdout.write(out); if (note) console.error(note); }
} finally { rmSync(dir, { recursive: true, force: true }); }
void join;
