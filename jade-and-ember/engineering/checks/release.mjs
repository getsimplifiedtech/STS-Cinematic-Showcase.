// check:release (ledger ENG-071, ENG-079, ENG-080). The release manifest and the release gate.
//   version     VERSION.json is the one version source: package.json equals it, its channel equals the channel inferred from the configuration,
//               and the footer's baseline version text (decision D-1) names the recorded baseline
//   policy      release/policy.json is complete and only names requirements the gate implements; findings carry a known severity
//   manifest    the manifest for HEAD validates against release-manifest.schema.json (two validators), is deterministic, and agrees with the
//               sources (configuration hashes, asset manifest, framework reference, baseline, approvals, evidence, findings)
//   gate logic  the gate is exercised with invented states: a fully approved client-production build passes; removing ANY single requirement blocks
//               it; a client configuration labelled "demonstration" is refused; a failing, partial, stale, wrong-commit or dirty verification blocks;
//               an open Blocker or Major finding blocks; an approval for another commit or version does not count; evidence for another commit does not count
//   invariant   the committed configuration must be the demonstration unless the gate allows it: an unapproved client-production configuration
//               cannot be committed without this check failing
// The gate never deploys anything. Today the real client-production gate is blocked by missing approvals and evidence, as it should be.
import Ajv from 'ajv/dist/2020.js';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { assembleCandidate } from '../lib/site.mjs';
import { buildManifest } from '../lib/hashed.mjs';
import { buildReleaseManifest, channelOf, collectContext, evaluateGate, loadReleasePolicy } from '../lib/release.mjs';
import { validateSchema } from '../lib/schema.mjs';
import { engDir, isMain, projectDir, readJson } from '../lib/git.mjs';
import { readFileSync } from 'node:fs';

const KNOWN = ['cleanTree', 'verifyPassed', 'noBlockingFindings', 'requiredApprovalsPresent', 'versionConsistent', 'demoStaysNoindex', 'stableVersion', 'releaseApproval', 'rightsVerification', 'noDemoText', 'productionSeoComplete', 'productionDomain', 'searchReadiness', 'evidence:real-device', 'evidence:screen-reader', 'evidence:browser-matrix', 'evidence:ci-run'];
const C = 'a'.repeat(40);

// A fully approved client-production context (invented), used to prove the gate passes when it should and blocks when anything is missing.
export function greenClientContext(over = {}) {
  const base = collectContext({});
  const client = JSON.parse(JSON.stringify(base.client));
  Object.assign(client.flags, { demo: false }); Object.assign(client.seo, { noindex: false, structuredData: true, baseUrl: 'https://www.jade-and-ember-fixture.com', host: 'cloudflare-pages', urlStyle: 'clean', crawlers: { search: 'allow', aiSearch: 'allow', training: 'disallow' }, business: { x: 1 } });
  const version = { name: 'jade-and-ember', version: '1.0.0', baseline: '0.8', channel: 'client-production', previewPackage: 'x.zip' };
  const ev = (type) => ({ file: `${type}.json`, type, commit: C, valid: true });
  const DIGEST = 'f'.repeat(64);
  const decision = `release-approval for the client. channel: client-production; version: 1.0.0; commit: ${C}`;
  return {
    ...base, client, version, pkg: { ...base.pkg, version: '1.0.0' }, channel: 'client-production', findings: [{ id: 'F-1', severity: 'Minor', visual: false, status: 'open' }],
    git: { commit: C, tree: C, branch: 'release', dirty: false, commitDate: '2026-10-10T00:00:00Z' }, verify: { mode: 'full', passed: true, commit: C, dirty: false, assetsTree: 'T', results: [] }, assetsTree: 'T', buildOk: true,
    approvals: [...base.authority.records.requiredApprovals.map((id) => ({ id, date: '2026-10-10', type: 'approval', decision: 'x', concerns: '', limits: '' })), { id: 'REL-JE-001', date: '2026-10-10', type: 'release-approval', decision, concerns: '', limits: '' }, { id: 'SRCH-JE-001', date: '2026-10-10', type: 'search-review', decision: `Reviewed by the owner on 2026-10-10: business facts, structured data, crawler policy. digest: ${DIGEST}`, concerns: '', limits: '' }, { id: 'RIGHTS-JE-001', date: '2026-10-10', type: 'rights-verification', decision: 'Verified by the owner against the sources reviewed (generator terms) on 2026-10-10', concerns: '', limits: '' }],
    evidence: ['real-device', 'screen-reader', 'browser-matrix'].map(ev).concat([ev('ci-run')]), searchDigest: DIGEST, siteHasSearchFiles: true, ...over,
  };
}

export function policyProblems(policy) {
  const problems = [];
  for (const [ch, def] of Object.entries(policy.channels)) { for (const r of def.requires) if (!KNOWN.includes(r)) problems.push(`policy: channel ${ch} requires "${r}", which the gate does not implement`); if (!def.allows?.length) problems.push(`policy: channel ${ch} allows nothing`); }
  for (const must of ['releaseApproval', 'rightsVerification', 'evidence:real-device', 'evidence:screen-reader', 'evidence:browser-matrix', 'evidence:ci-run', 'stableVersion', 'noBlockingFindings', 'productionDomain', 'searchReadiness', 'productionSeoComplete']) if (!policy.channels['client-production'].requires.includes(must)) problems.push(`policy: client-production must require ${must}`);
  if (!policy.channels.demonstration.requires.includes('demoStaysNoindex')) problems.push('policy: the demonstration must require demoStaysNoindex');
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
    if (!m1.assets.manifestMatches) problems.push('assets.manifest.json does not match the built site (run npm run assets:manifest after a reviewed change)');
    if (m1.configuration.files['config/client.json'] !== sha(readFileSync(join(projectDir, 'config', 'client.json')))) problems.push('manifest configuration hash is wrong');
    if (m1.framework.commit !== readJson(join(engDir, 'authority.json')).framework.commit) problems.push('manifest framework commit differs from authority.json');
    if (m1.baseline.commit !== readJson(join(engDir, 'baseline.json')).commit) problems.push('manifest baseline commit differs from baseline.json');
    if (m1.dependencies.runtimeDependencies !== 0) problems.push('the manifest records runtime dependencies');
    // gate logic with invented states
    const g = (over) => evaluateGate(greenClientContext(over));
    const green = g({});
    if (!green.allowed) problems.push(`the gate blocks a fully approved client-production build: ${green.requirements.filter((r) => !r.ok).map((r) => `${r.id} (${r.detail})`).join('; ')}`);
    const cases = {
      'a missing release approval': { approvals: greenClientContext().approvals.filter((a) => a.type !== 'release-approval') },
      'a release approval for another commit': { approvals: greenClientContext().approvals.map((a) => (a.type === 'release-approval' ? { ...a, decision: a.decision.replace(C, 'b'.repeat(40)) } : a)) },
      'a release approval for another version': { approvals: greenClientContext().approvals.map((a) => (a.type === 'release-approval' ? { ...a, decision: a.decision.replace('1.0.0', '0.9.0') } : a)) },
      'a release approval for the other channel': { approvals: greenClientContext().approvals.map((a) => (a.type === 'release-approval' ? { ...a, decision: a.decision.replace('client-production', 'demonstration') } : a)) },
      'missing rights verification': { approvals: greenClientContext().approvals.filter((a) => a.type !== 'rights-verification') },
      'rights verification that names no source': { approvals: greenClientContext().approvals.map((a) => (a.type === 'rights-verification' ? { ...a, decision: 'ok' } : a)) },
      'a missing required gate approval': { approvals: greenClientContext().approvals.filter((a) => a.id !== 'APR-JE-017') },
      'a dirty working tree': { git: { ...greenClientContext().git, dirty: true } },
      'no verification report': { verify: null },
      'a fast (partial) verification': { verify: { ...greenClientContext().verify, mode: 'fast' } },
      'a failed verification': { verify: { ...greenClientContext().verify, passed: false } },
      'a verification of another commit': { verify: { ...greenClientContext().verify, commit: 'c'.repeat(40) } },
      'a verification of different bytes': { verify: { ...greenClientContext().verify, assetsTree: 'OTHER' } },
      'a verification on a dirty tree': { verify: { ...greenClientContext().verify, dirty: true } },
      'an open Blocker': { findings: [{ id: 'F-9', severity: 'Blocker', visual: false, status: 'open' }] },
      'an open Major': { findings: [{ id: 'F-9', severity: 'Major', visual: false, status: 'open' }] },
      'a finding with an unknown severity': { findings: [{ id: 'F-9', severity: 'Whatever', visual: false, status: 'open' }] },
      'a pre-release version': { version: { ...greenClientContext().version, version: '1.0.0-rc.1' }, pkg: { ...greenClientContext().pkg, version: '1.0.0-rc.1' } },
      'a version file that disagrees with package.json': { pkg: { ...greenClientContext().pkg, version: '1.0.1' } },
      'a client configuration labelled as a demonstration': { version: { ...greenClientContext().version, channel: 'demonstration' } },
      'missing real-device evidence': { evidence: greenClientContext().evidence.filter((e) => e.type !== 'real-device') },
      'missing screen-reader evidence': { evidence: greenClientContext().evidence.filter((e) => e.type !== 'screen-reader') },
      'missing browser-matrix evidence': { evidence: greenClientContext().evidence.filter((e) => e.type !== 'browser-matrix') },
      'CI evidence for another commit': { evidence: greenClientContext().evidence.map((e) => (e.type === 'ci-run' ? { ...e, commit: 'd'.repeat(40) } : e)) },
      'invalid (not successful) evidence': { evidence: greenClientContext().evidence.map((e) => (e.type === 'real-device' ? { ...e, valid: false } : e)) },
      'a client configuration that does not build': { buildOk: false },
      'no search review': { approvals: greenClientContext().approvals.filter((a) => a.type !== 'search-review') },
      'a search review of different search artifacts (digest mismatch)': { searchDigest: '0'.repeat(64) },
      'a search review that does not name the crawler policy': { approvals: greenClientContext().approvals.map((a) => (a.type === 'search-review' ? { ...a, decision: a.decision.replace('crawler policy', 'policy') } : a)) },
      'a search review that does not name the structured data': { approvals: greenClientContext().approvals.map((a) => (a.type === 'search-review' ? { ...a, decision: a.decision.replace('structured data', 'schema') } : a)) },
      'a search review with no reviewer': { approvals: greenClientContext().approvals.map((a) => (a.type === 'search-review' ? { ...a, decision: a.decision.replace('Reviewed by', 'Seen by') } : a)) },
      'no search artifacts to review': { searchDigest: null },
      'a staging domain (pages.dev)': { client: (() => { const c = greenClientContext().client; c.seo.baseUrl = 'https://jade.pages.dev'; return c; })() },
      'an example domain': { client: (() => { const c = greenClientContext().client; c.seo.baseUrl = 'https://jade.example.test'; return c; })() },
      'a vercel.app preview domain': { client: (() => { const c = greenClientContext().client; c.seo.baseUrl = 'https://jade.vercel.app'; return c; })() },
      'no hosting target declared': { client: (() => { const c = greenClientContext().client; delete c.seo.host; return c; })() },
      'a crawler policy that was never decided': { client: (() => { const c = greenClientContext().client; delete c.seo.crawlers; return c; })() },
      'a crawler policy missing the AI search decision': { client: (() => { const c = greenClientContext().client; delete c.seo.crawlers.aiSearch; return c; })() },
      'llms.txt, robots.txt or sitemap.xml missing from the build': { siteHasSearchFiles: false },
      'indexing on without structured data': { client: (() => { const c = greenClientContext().client; c.seo.structuredData = false; return c; })() },
    };
    let blocked = 0;
    for (const [name, over] of Object.entries(cases)) { const r = g(over); if (r.allowed) problems.push(`the gate ALLOWS a client-production build with ${name}`); else blocked++; }
    const demoIdx = evaluateGate(greenClientContext({ channel: 'demonstration', version: { name: 'jade-and-ember', version: '0.9.0-dev', baseline: '0.8', channel: 'demonstration', previewPackage: 'x.zip' }, pkg: { ...greenClientContext().pkg, version: '0.9.0-dev' }, client: (() => { const c = greenClientContext().client; c.flags.demo = true; c.seo.noindex = true; c.seo.structuredData = false; return c; })() }));
    if (!demoIdx.allowed) problems.push(`the gate blocks a fully approved demonstration: ${demoIdx.requirements.filter((r) => !r.ok).map((r) => r.id).join(', ')}`);
    const evilDemo = evaluateGate(greenClientContext({ channel: 'demonstration', client: (() => { const c = greenClientContext().client; c.flags.demo = true; c.seo.noindex = false; return c; })(), version: { name: 'jade-and-ember', version: '0.9.0-dev', baseline: '0.8', channel: 'demonstration', previewPackage: 'x.zip' }, pkg: { ...greenClientContext().pkg, version: '0.9.0-dev' } }));
    if (evilDemo.allowed) problems.push('the gate allows an indexable demonstration (demo flag on, noindex off)');
    notes.push(`version ${ctx.version.version} (${ctx.channel}) consistent with package.json, the configuration and the footer baseline text; policy complete; manifest for ${ctx.git.commit.slice(0, 7)} valid under two validators, deterministic, and consistent with the sources`);
    notes.push(`gate logic: a fully approved client build passes; ${blocked}/${Object.keys(cases).length} single defects each block it; a demonstration passes only while noindex; a client configuration labelled demonstration is refused`);
    // the invariant and the real state
    const real = evaluateGate({ ...ctx, assetsTree: am.treeSha256 });
    if (ctx.channel === 'client-production' && !real.allowed) problems.push(`the committed configuration is a client-production build but the release gate blocks it (${real.requirements.filter((r) => !r.ok).map((r) => r.id).join(', ')}): an unapproved client-production configuration must not be committed`);
    const hypothetical = evaluateGate({ ...ctx, channel: 'client-production', version: { ...ctx.version, channel: 'client-production' }, assetsTree: am.treeSha256 });
    notes.push(`real state: channel ${ctx.channel}; a client-production release would be BLOCKED by ${hypothetical.requirements.filter((r) => !r.ok).length} unmet requirement(s): ${hypothetical.requirements.filter((r) => !r.ok).map((r) => r.id).join(', ')}; no deployment approval exists (${real.deploymentApproved})`);
    return { problems, notes };
  } finally { if (own) rmSync(dir, { recursive: true, force: true }); }
}
import { createHash } from 'node:crypto';
const sha = (b) => createHash('sha256').update(b).digest('hex');

if (isMain(import.meta.url)) {
  const { problems, notes } = await checkRelease();
  notes.forEach((n) => console.log('  ' + n));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:release`);
  process.exit(problems.length ? 1 : 0);
}
