// The candidate artifact digest (G6-2, APR-JE-039; design in G6-2-DESIGN.md section 3). One SHA-256 over a canonical list of what a release IS:
// the delivered files, the configuration, the search artifacts, the release and security policies, the evidence specification, the media-rights
// inventory, the external-destination registry, the framework pin and the toolchain versions.
//
// What it deliberately does NOT contain: approvals, evidence records, CI records, the reviewer table, the verification report, the Markdown
// ledger, documents, and anything about git (commit, branch, date, cleanliness). Recording a decision about the artifact therefore cannot change
// the artifact's identity, which is what made the old "name the HEAD commit" binding impossible to satisfy (RG-01).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { engDir, projectDir, readJson } from './git.mjs';
import { recordFrom } from './project-records.mjs';
import { project, schemaId } from './project.mjs';
import { buildManifest } from './hashed.mjs';
import { searchDigest } from './search-digest.mjs';
import { buildCsp, loadPolicy as loadSecurityPolicy } from './security.mjs';
import { policyFile, policyIn } from './policy.mjs';

export const CANDIDATE_SCHEMA = schemaId('candidate@1');
export const sha = (b) => createHash('sha256').update(b).digest('hex');

// JSON with sorted keys and no whitespace: the same value always gives the same bytes.
export function canonicalJson(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(',')}}`;
}
export const digestOf = (obj) => sha(canonicalJson(obj));

// The channel comes from the configuration, never from a label.
export const channelOf = (client) => (client.flags.demo === true && client.seo.noindex === true ? 'demonstration' : 'client-production');

const fileSha = (p) => sha(readFileSync(p));
// a file the release depends on that is missing is a NULL part, never a crash: the digest still computes and the requirement that relies on it fails with a reason (G6-3, RG-02)
const fileShaOrNull = (p) => (existsSync(p) ? sha(readFileSync(p)) : null);

export const DEMONSTRATION_STATEMENT = 'FICTIONAL DEMONSTRATION: a design showcase by Simplified Tech Solutions. It is not a client site, is not indexable, and is not approved for public deployment or for client production.';

// START-HERE.txt in the delivered ZIP. It names the source commit and the candidate digest, which are not known until the release is prepared, so the candidate covers
// its TEMPLATE (the text with those two values as placeholders) and the package verifier regenerates the exact bytes and compares them (G6-2 review, F1).
export const START_HERE_PLACEHOLDERS = { commit: '<source commit>', candidate: '<candidate digest>' };
export const startHereText = ({ version, channel, commit, candidate }) => `${project.name} ${version} (${channel})\nSource commit ${commit}\n\nOpen index.html in a browser: double-click it. Nothing else is needed.\nOptional: python3 serve.py  (then http://localhost:8766/) to serve it with video seeking.\n\n${channel === 'demonstration' ? `${DEMONSTRATION_STATEMENT}\n` : ''}Candidate artifact digest ${candidate}\nVerify: sha256sum -c SHA256SUMS.txt (next to this package) and compare release-manifest.json.\n`;
export const startHereTemplateSha = (version, channel) => sha(startHereText({ version, channel, ...START_HERE_PLACEHOLDERS }));

// The configuration part: the hash of every config/*.json, as the release manifest has always listed them.
export function configurationDigest(root = projectDir) {
  const dir = join(root, 'config');
  const files = {};
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) files[`config/${f}`] = fileSha(join(dir, f));
  return { files, treeSha256: sha(Object.entries(files).map(([k, v]) => `${v}  ${k}`).join('\n') + '\n') };
}

// siteDir: the assembled delivered site. root: the project folder (configuration, VERSION.json, lockfile). eng: the engineering folder.
export function computeCandidate({ siteDir, root = projectDir, eng = engDir, channel = null, version = null } = {}) {
  const client = readJson(join(root, 'config', 'client.json'));
  const ch = channel || channelOf(client);
  const ver = version || readJson(join(root, 'VERSION.json')).version;
  const authority = recordFrom(eng, 'authority.json');
  const env = policyIn('environment', eng);
  const pol = loadSecurityPolicy();
  const parts = {
    delivered: buildManifest(siteDir).treeSha256,
    configuration: configurationDigest(root).treeSha256,
    search: ch === 'demonstration' ? null : searchDigest(siteDir),
    releasePolicy: fileSha(policyFile('release/policy', eng)),
    evidenceSpec: fileSha(join(eng, 'release', 'evidence-spec.json')),
    securityPolicy: { file: fileSha(policyFile('security', eng)), csp: sha(buildCsp(siteDir, pol)) },
    mediaRights: fileShaOrNull(join(eng, 'media-rights-inventory.json')),
    externalDestinations: fileShaOrNull(join(eng, 'external-destinations.json')),
    dependencyPolicy: fileShaOrNull(policyFile('dependencies', eng)),
    framework: { commit: authority.framework.commit, skillSha256: authority.creativeAuthority.skillSha256, licenseSha256: authority.creativeAuthority.licenseSha256 },
    // the two files the ZIP carries besides the delivered site: serve.py (run by the recipient) and the text that tells them to run it
    packageExtras: { servePy: fileSha(join(root, 'serve.py')), startHereTemplate: startHereTemplateSha(ver, ch) },
    engines: { node: env.nodeBaseline.version, npm: env.nodeBaseline.npm, playwright: env.playwright, lockfileSha256: fileSha(join(root, 'package-lock.json')) },
  };
  return fromParts(ch, ver, parts);
}

// The digest of a stated list of parts (the package verifier takes the parts it cannot recompute from the manifest).
export function fromParts(channel, version, parts) {
  const body = { schema: CANDIDATE_SCHEMA, channel, version, parts };
  return { ...body, digest: digestOf(body) };
}
