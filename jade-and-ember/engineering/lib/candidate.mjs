// The candidate artifact digest (G6-2, APR-JE-039; design in G6-2-DESIGN.md section 3). One SHA-256 over a canonical list of what a release IS:
// the delivered files, the configuration, the search artifacts, the release and security policies, the evidence specification, the media-rights
// inventory, the external-destination registry, the framework pin and the toolchain versions.
//
// What it deliberately does NOT contain: approvals, evidence records, CI records, the reviewer table, the verification report, the Markdown
// ledger, documents, and anything about git (commit, branch, date, cleanliness). Recording a decision about the artifact therefore cannot change
// the artifact's identity, which is what made the old "name the HEAD commit" binding impossible to satisfy (RG-01).
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { engDir, projectDir, readJson } from './git.mjs';
import { buildManifest } from './hashed.mjs';
import { searchDigest } from './search-digest.mjs';
import { buildCsp, loadPolicy as loadSecurityPolicy } from './security.mjs';

export const CANDIDATE_SCHEMA = 'jade-and-ember/candidate@1';
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
  const authority = readJson(join(eng, 'authority.json'));
  const env = readJson(join(eng, 'environment.json'));
  const pol = loadSecurityPolicy();
  const parts = {
    delivered: buildManifest(siteDir).treeSha256,
    configuration: configurationDigest(root).treeSha256,
    search: ch === 'demonstration' ? null : searchDigest(siteDir),
    releasePolicy: fileSha(join(eng, 'release', 'policy.json')),
    evidenceSpec: fileSha(join(eng, 'release', 'evidence-spec.json')),
    securityPolicy: { file: fileSha(join(eng, 'security.json')), csp: sha(buildCsp(siteDir, pol)) },
    mediaRights: fileSha(join(eng, 'media-rights-inventory.json')),
    externalDestinations: fileSha(join(eng, 'external-destinations.json')),
    framework: { commit: authority.framework.commit, skillSha256: authority.creativeAuthority.skillSha256, licenseSha256: authority.creativeAuthority.licenseSha256 },
    engines: { node: env.nodeBaseline.version, npm: env.nodeBaseline.npm, playwright: env.playwright, lockfileSha256: fileSha(join(root, 'package-lock.json')) },
  };
  return fromParts(ch, ver, parts);
}

// The digest of a stated list of parts (the package verifier takes the parts it cannot recompute from the manifest).
export function fromParts(channel, version, parts) {
  const body = { schema: CANDIDATE_SCHEMA, channel, version, parts };
  return { ...body, digest: digestOf(body) };
}
