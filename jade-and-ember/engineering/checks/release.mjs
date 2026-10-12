// check:release (ledger ENG-071, ENG-079, ENG-080; release model v2, G6-2, APR-JE-039). The release manifest and the release gate.
//   version     VERSION.json is the one version source: package.json equals it, its channel equals the channel inferred from the configuration,
//               and the footer's baseline version text (decision D-1) names the recorded baseline
//   policy      release/policy.json is complete and only names requirements the gate implements; findings carry a known severity
//   manifest    the manifest for HEAD validates against release-manifest.schema.json (two validators), is deterministic, and agrees with the
//               sources (candidate digest, configuration hashes, asset manifest, framework reference, baseline, approvals, evidence, findings)
//   gate logic  the gate is exercised with invented states (lib/release-fixtures.mjs): a fully approved client-production build passes; removing ANY single
//               requirement blocks it; structured approval records are judged by their closed fields only (a rejected, revoked, superseded, unauthorised,
//               malformed or other-candidate record never counts, and prose in a rationale changes nothing); the verification record must be complete,
//               sealed and for this candidate; a client configuration labelled "demonstration" and an unregistered demonstration are refused
//   invariant   the committed configuration must be the demonstration unless the gate allows it: an unapproved client-production configuration
//               cannot be committed without this check failing
//   retired     rows of the old Markdown format (release-approval, rights-verification, search-review, deployment-approval) are no longer read; one in the ledger is reported
// The gate never deploys anything. Today the real client-production gate is blocked by missing approvals and evidence, as it should be.
import Ajv from 'ajv/dist/2020.js';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { assembleCandidate } from '../lib/site.mjs';
import { buildManifest } from '../lib/hashed.mjs';
import { RETIRED_ROW, attachBuild, buildReleaseManifest, collectContext, evaluateGate, loadReleasePolicy } from '../lib/release.mjs';
import { validateSchema } from '../lib/schema.mjs';
import { engDir, isMain, projectDir, readJson } from '../lib/git.mjs';
import { readFileSync } from 'node:fs';
import { greenClientContext, greenDemoContext } from '../lib/release-fixtures.mjs';
import { EXPECTED_DETAIL, EXPECTED_REASON, RELEASE_CASES } from '../lib/release-cases.mjs';
import { createHash } from 'node:crypto';

export { greenClientContext, greenDemoContext };
const sha = (b) => createHash('sha256').update(b).digest('hex');

export const KNOWN = ['cleanTree', 'verifyPassed', 'noBlockingFindings', 'requiredApprovalsPresent', 'versionConsistent', 'demoStaysNoindex', 'demonstrationRegistered', 'demonstrationNoProductionDomain', 'assetManifestCurrent', 'stableVersion', 'recordsValid', 'releaseApproval', 'productionHostAuthorised', 'rightsVerification', 'noDemoText', 'productionSeoComplete', 'productionDomain', 'searchReadiness', 'evidence:real-device', 'evidence:screen-reader', 'evidence:browser-matrix', 'evidence:ci-run', 'externalLinks', 'externalLinksReview', 'mediaRightsInventory', 'socialImageRights', 'dependencyPolicy', 'dependencySecurity', 'sbomVerified', 'supportedRuntimes', 'authenticity'];

export function policyProblems(policy) {
  const problems = [];
  for (const [ch, def] of Object.entries(policy.channels)) { for (const r of def.requires) if (!KNOWN.includes(r)) problems.push(`policy: channel ${ch} requires "${r}", which the gate does not implement`); if (!def.allows?.length) problems.push(`policy: channel ${ch} allows nothing`); }
  for (const must of ['releaseApproval', 'productionHostAuthorised', 'recordsValid', 'rightsVerification', 'evidence:real-device', 'evidence:screen-reader', 'evidence:browser-matrix', 'evidence:ci-run', 'verifyPassed', 'stableVersion', 'noBlockingFindings', 'productionDomain', 'searchReadiness', 'productionSeoComplete', 'assetManifestCurrent', 'externalLinks', 'externalLinksReview', 'mediaRightsInventory', 'socialImageRights', 'dependencyPolicy', 'dependencySecurity', 'sbomVerified', 'supportedRuntimes', 'authenticity']) if (!policy.channels['client-production'].requires.includes(must)) problems.push(`policy: client-production must require ${must}`);
  for (const must of ['demoStaysNoindex', 'demonstrationRegistered', 'demonstrationNoProductionDomain', 'verifyPassed', 'assetManifestCurrent']) if (!policy.channels.demonstration.requires.includes(must)) problems.push(`policy: the demonstration must require ${must}`);
  return problems;
}

export async function checkRelease({ root = null } = {}) {
  const own = !root;
  const dir = root || assembleCandidate(projectDir, 'release-check');
  const problems = [], notes = [];
  try {
    const policy = loadReleasePolicy();
    const ctx = collectContext({});
    // version
    if (ctx.version.version !== ctx.pkg.version) problems.push(`VERSION.json (${ctx.version.version}) and package.json (${ctx.pkg.version}) differ`);
    if (ctx.version.channel !== ctx.channel) problems.push(`VERSION.json channel "${ctx.version.channel}" differs from the channel inferred from the configuration, "${ctx.channel}"`);
    const site = readJson(join(projectDir, 'config', 'site.json'));
    if (ctx.client.flags.demo && !new RegExp(`v${ctx.version.baseline.replace('.', '\\.')}\\b`).test(site.demo.stamp)) problems.push(`the footer stamp must name the recorded baseline v${ctx.version.baseline} (decision D-1)`);
    // policy
    problems.push(...policyProblems(policy));
    for (const f of ctx.findings) if (!policy.severities.includes(f.severity)) problems.push(`finding ${f.id} has unknown severity "${f.severity}"`);
    // the retired Markdown rows
    const retired = ctx.approvals.filter((a) => RETIRED_ROW.test(a.type));
    if (retired.length) problems.push(`the approvals ledger holds ${retired.length} row(s) of a retired type (${retired.map((a) => a.id).join(', ')}): release approvals, rights verifications, search reviews and deployment approvals are structured records in engineering/release/ now and these rows are not read`);
    // manifest
    const m1 = buildReleaseManifest(ctx, { siteDir: dir }), m2 = buildReleaseManifest(ctx, { siteDir: dir });
    if (JSON.stringify(m1) !== JSON.stringify(m2)) problems.push('the release manifest is not deterministic');
    const schema = readJson(join(engDir, 'release', 'release-manifest.schema.json'));
    const ours = validateSchema(m1, schema, 'manifest');
    ours.forEach((e) => problems.push(`manifest does not fit its schema: ${e}`));
    const ajv = new Ajv({ strict: true, allErrors: true }); const ok = ajv.compile(schema)(m1);
    if (!ok) problems.push('manifest is invalid under Ajv');
    const am = buildManifest(dir);
    if (m1.assets.treeSha256 !== am.treeSha256) problems.push('manifest asset tree differs from the built site');
    if (m1.candidate.parts.delivered !== am.treeSha256) problems.push('the candidate digest does not cover the delivered files');
    if (!m1.assets.manifestMatches) problems.push('assets.manifest.json does not match the built site (run npm run assets:manifest after a reviewed change)');
    if (m1.configuration.files['config/client.json'] !== sha(readFileSync(join(projectDir, 'config', 'client.json')))) problems.push('manifest configuration hash is wrong');
    if (m1.framework.commit !== readJson(join(engDir, 'authority.json')).framework.commit) problems.push('manifest framework commit differs from authority.json');
    if (m1.baseline.commit !== readJson(join(engDir, 'baseline.json')).commit) problems.push('manifest baseline commit differs from baseline.json');
    if (m1.dependencies.runtimeDependencies !== 0) problems.push('the manifest records runtime dependencies');
    // gate logic with invented states
    const green = evaluateGate(greenClientContext());
    if (!green.allowed) problems.push(`the gate blocks a fully approved client-production build: ${green.requirements.filter((r) => !r.ok).map((r) => `${r.id} (${r.detail})`).join('; ')}`);
    let blocked = 0;
    for (const [name, over] of Object.entries(RELEASE_CASES.blocked())) { const r = evaluateGate(greenClientContext(over)); if (r.allowed) problems.push(`the gate ALLOWS a client-production build with ${name}`); else { blocked++; const want = EXPECTED_REASON[name]; const failing = r.requirements.filter((x) => !x.ok).map((x) => x.id); const det = EXPECTED_DETAIL[name]; if (det && !det.test(r.requirements.filter((x) => !x.ok).map((x) => x.detail).join(' | '))) problems.push(`the gate blocks ${name} but the reason does not say what is wrong (expected ${det})`);
          if (want && !want.every((w) => failing.includes(w))) problems.push(`the gate blocks ${name} but not for the right reason: expected ${want.join(', ')} to fail, got ${failing.join(', ')}`); } }
    let allowedOk = 0;
    for (const [name, over] of Object.entries(RELEASE_CASES.allowed())) { const r = evaluateGate(greenClientContext(over)); if (!r.allowed) problems.push(`the gate BLOCKS a client-production build with ${name} (it must not): ${r.requirements.filter((x) => !x.ok).map((x) => `${x.id} (${x.detail})`).join('; ')}`); else allowedOk++; }
    const demoOk = evaluateGate(greenDemoContext());
    if (!demoOk.allowed) problems.push(`the gate blocks a fully registered demonstration: ${demoOk.requirements.filter((r) => !r.ok).map((r) => `${r.id} (${r.detail})`).join('; ')}`);
    let demoBlocked = 0;
    for (const [name, over] of Object.entries(RELEASE_CASES.demonstrationBlocked())) { const r = evaluateGate(greenDemoContext(over)); if (r.allowed) problems.push(`the gate ALLOWS a demonstration with ${name}`); else demoBlocked++; }
    notes.push(`version ${ctx.version.version} (${ctx.channel}) consistent with package.json, the configuration and the footer baseline text; policy complete; manifest for ${ctx.git.commit.slice(0, 7)} (candidate ${m1.candidate.digest.slice(0, 12)}…) valid under two validators, deterministic, and consistent with the sources`);
    notes.push(`gate logic: a fully approved client build passes; ${blocked}/${Object.keys(RELEASE_CASES.blocked()).length} single defects each block it; ${allowedOk}/${Object.keys(RELEASE_CASES.allowed()).length} things that must NOT block (prose in a rationale, history, a re-approval after a revocation) do not; a registered demonstration passes and ${demoBlocked}/${Object.keys(RELEASE_CASES.demonstrationBlocked()).length} demonstration defects block it; a client configuration labelled demonstration is refused`);
    // the invariant and the real state
    const att = attachBuild(ctx, dir);
    const real = evaluateGate(att);
    if (ctx.channel === 'client-production' && !real.allowed) problems.push(`the committed configuration is a client-production build but the release gate blocks it (${real.requirements.filter((r) => !r.ok).map((r) => r.id).join(', ')}): an unapproved client-production configuration must not be committed`);
    const hypothetical = evaluateGate({ ...att, channel: 'client-production', version: { ...ctx.version, channel: 'client-production' } });
    notes.push(`real state: channel ${ctx.channel}; a client-production release would be BLOCKED by ${hypothetical.requirements.filter((r) => !r.ok).length} unmet requirement(s): ${hypothetical.requirements.filter((r) => !r.ok).map((r) => r.id).join(', ')}; no deployment authorisation exists (${real.deploymentApproved})`);
    return { problems, notes };
  } finally { if (own) rmSync(dir, { recursive: true, force: true }); }
}

if (isMain(import.meta.url)) {
  const { problems, notes } = await checkRelease();
  notes.forEach((n) => console.log('  ' + n));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:release`);
  process.exit(problems.length ? 1 : 0);
}
