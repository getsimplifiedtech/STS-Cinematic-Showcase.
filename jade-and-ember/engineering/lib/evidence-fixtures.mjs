// Invented, in-memory evidence for the TESTS of the evidence tooling and the release gate. Nothing here is ever written to engineering/release/evidence/,
// and nothing here is evidence of anything: the people, devices and files do not exist. The records exist so that the validator can be shown to
// accept a complete record and to reject every way of getting one wrong.
import { createHash } from 'node:crypto';
import { loadSpec, scaffold } from './evidence.mjs';
import { registryDigest } from './verification.mjs';

export const FIXTURE_COMMIT = 'a'.repeat(40);
export const FIXTURE_TREE = 'b'.repeat(64);
export const FIXTURE_CANDIDATE = 'd'.repeat(64);
export const FIXTURE_ENGINE = 'e'.repeat(64);
export const FIXTURE_CHECKS = 40;
export const FIXTURE_IDS = Array.from({ length: FIXTURE_CHECKS }, (_, i) => `check:fixture-${String(i).padStart(2, '0')}`);
export const FIXTURE_REGISTRY = registryDigest(FIXTURE_IDS);
const sha = (b) => createHash('sha256').update(b).digest('hex');

const ENV = {
  'iphone-safari': { device: { kind: 'phone', make: 'Apple', model: 'iPhone 15', emulated: false }, os: { name: 'iOS', version: '17.4.1' }, browser: { name: 'Safari', version: '17.4.1' } },
  'android-chrome': { device: { kind: 'phone', make: 'Google', model: 'Pixel 8', emulated: false }, os: { name: 'Android', version: '14' }, browser: { name: 'Chrome', version: '123.0.6312.86' } },
  'ipad-safari': { device: { kind: 'tablet', make: 'Apple', model: 'iPad Air', emulated: false }, os: { name: 'iPadOS', version: '17.4' }, browser: { name: 'Safari', version: '17.4' } },
  'desktop-chrome': { device: { kind: 'laptop', make: 'Dell', model: 'XPS 13', emulated: false }, os: { name: 'Windows', version: '11 23H2' }, browser: { name: 'Chrome', version: '123.0.6312.86' } },
  'desktop-firefox': { device: { kind: 'desktop', make: 'Lenovo', model: 'ThinkCentre', emulated: false }, os: { name: 'Linux', version: '6.5' }, browser: { name: 'Firefox', version: '124.0' } },
  'desktop-safari': { device: { kind: 'laptop', make: 'Apple', model: 'MacBook Air', emulated: false }, os: { name: 'macOS', version: '14.4' }, browser: { name: 'Safari', version: '17.4' } },
  'sr-nvda-firefox': { device: { kind: 'laptop', make: 'Dell', model: 'XPS 13', emulated: false }, os: { name: 'Windows', version: '11 23H2' }, browser: { name: 'Firefox', version: '124.0' }, screenReader: { name: 'NVDA', version: '2023.3.4' } },
  'sr-nvda-chrome': { device: { kind: 'laptop', make: 'Dell', model: 'XPS 13', emulated: false }, os: { name: 'Windows', version: '11 23H2' }, browser: { name: 'Chrome', version: '123.0.6312.86' }, screenReader: { name: 'NVDA', version: '2023.3.4' } },
  'sr-voiceover-macos-safari': { device: { kind: 'laptop', make: 'Apple', model: 'MacBook Air', emulated: false }, os: { name: 'macOS', version: '14.4' }, browser: { name: 'Safari', version: '17.4' }, screenReader: { name: 'VoiceOver', version: '14.4' } },
  'sr-voiceover-ios-safari': { device: { kind: 'phone', make: 'Apple', model: 'iPhone 15', emulated: false }, os: { name: 'iOS', version: '17.4.1' }, browser: { name: 'Safari', version: '17.4.1' }, screenReader: { name: 'VoiceOver', version: '17.4.1' } },
  'sr-talkback-android-chrome': { device: { kind: 'phone', make: 'Google', model: 'Pixel 8', emulated: false }, os: { name: 'Android', version: '14' }, browser: { name: 'Chrome', version: '123.0.6312.86' }, screenReader: { name: 'TalkBack', version: '14.1' } },
};

// A complete, consistent record for a target, and the in-memory files it points at. over: field overrides applied by the caller afterwards.
export function fixtureRecord(targetId, { commit = FIXTURE_COMMIT, tree = FIXTURE_TREE, candidate = FIXTURE_CANDIDATE, engine = FIXTURE_ENGINE, registry = FIXTURE_REGISTRY, checks = FIXTURE_CHECKS, date = '2026-10-12', tag = '' } = {}) {
  const spec = loadSpec();
  const t = spec.targets[targetId];
  const files = new Map();
  if (t.gateType === 'ci-run') return { record: { ...scaffold(spec, 'ci-run', { commit, candidate }), status: 'completed', date, by: 'Repository owner', url: `https://github.com/${spec.ciRepository}/actions/runs/123456`, conclusion: 'success', summary: 'verify workflow: all four jobs passed', verification: { candidate, engineDigest: engine, registryDigest: registry, checks: { total: checks, passed: checks }, seal: '9'.repeat(64), runner: 'github-actions', runId: '123456', node: 'v24.21.0' } }, files };
  const r = scaffold(spec, targetId, { commit, assetsTree: tree, candidate });
  delete r.guidance;
  r.status = 'completed'; r.build.package = 'preview package built from the commit'; r.date = date;
  r.tester = { name: 'Alex Rivera', role: 'QA tester' };
  r.environment = { ...JSON.parse(JSON.stringify(ENV[targetId])), settings: 'defaults' };
  if (!r.environment.screenReader) r.environment.screenReader = null;
  const fill = (o) => { for (const [k, v] of Object.entries(o)) { v.outcome = 'pass'; v.note = /poster|clip|h264|mp4/i.test(k) ? 'Saw the poster, no motion.' : 'Looked fine.'; } };
  fill(r.results.session); for (const p of Object.values(r.results.pages)) fill(p);
  r.conclusion = 'success';
  r.attachments = Array.from({ length: t.attachments.minimum }, (_, i) => {
    const bytes = Buffer.from(`fixture ${targetId} ${tag} ${i}`);
    const path = `${targetId}${tag}-${i}.png`;
    files.set(`${spec.attachmentDir}/${path}`, bytes);
    return { kind: t.attachments.kinds[0], description: `screenshot number ${i + 1}`, path, sha256: sha(bytes) };
  });
  r.attestation = { statement: spec.attestation, signedBy: 'Alex Rivera', date };
  return { record: r, files };
}

// The context the validator needs, with a git and a file system that exist only in memory.
export function fixtureVctx(files = new Map(), over = {}) {
  return {
    spec: loadSpec(), releaseCommit: FIXTURE_COMMIT, assetsTree: FIXTURE_TREE, candidate: FIXTURE_CANDIDATE, verification: { engineDigest: FIXTURE_ENGINE, registryDigest: FIXTURE_REGISTRY, total: FIXTURE_CHECKS }, today: '2026-10-13', allowFixture: false,
    git: { isCommit: (c) => [FIXTURE_COMMIT, 'c'.repeat(40)].includes(c), isAncestor: (a, b) => a === 'c'.repeat(40) && b === FIXTURE_COMMIT, commitDate: () => '2026-10-01' },
    fs: { exists: (p) => files.has(p), read: (p) => files.get(p) },
    ...over,
  };
}

// Records and files for every target the gate needs, as gate entries: [{ file, record }] plus the shared in-memory file map.
export function fixtureEvidenceSet(targets = null) {
  const spec = loadSpec();
  const all = targets || Object.values(spec.gate).flatMap((g) => g.needs.flatMap((n) => n.targets.slice(0, 1)));
  const files = new Map(), entries = [];
  for (const t of all) { const f = fixtureRecord(t); for (const [k, v] of f.files) files.set(k, v); entries.push({ file: `${t}.2026-10-12.json`, record: f.record }); }
  return { entries, files };
}
