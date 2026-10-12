// The release-control state folder and its configuration (G6-3A proof of concept). Layout:
//   config.json        clients (allow-list), expiry, the pinned tooling digest, the adapter (only "local-directory" exists)
//   credentials.json   who may do what: role, SHA-256 of a disposable token, clients, expiry, revoked flag (never a token)
//   runner.key         the secret of the RC "runner": it signs ledger receipts. In the real design this is the Actions run, which only RC's own workflows can be.
//   vault/<client>     the per-client deploy token the adapter needs (disposable here; a hosting token in a real RC)
//   ledger/<client>.jsonl, ledger/_denied.jsonl    hash-chained audit records
//   staged/<client>/<stage>/   the staged package, the extracted preview, the report
//   deploy/<client>/   the synthetic deployment target
// SYNTHETIC-POC.json marks the folder as a proof of concept: the engine refuses to run without it and the only adapter writes inside deploy/.
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { readFileSync as rf } from 'node:fs';
import { RcError, canonicalJson, checkSlug, inside, randomToken, sha256 } from './util.mjs';
import { engineFiles } from '../../lib/verification.mjs';
import { Ledger } from './ledger.mjs';
import { DEFAULT_DATA_FILES } from './view.mjs';

export const MARKER = 'SYNTHETIC-POC.json';
export const LIMITS = Object.freeze({ maxPackageBytes: 200 * 1024 * 1024, maxEntries: 5000, maxExtractBytes: 300 * 1024 * 1024 });

// The tooling pin: the digest of RC's adopted CODE (every engineering file except the declared project-data files, which change with every release and travel with the package).
// Returns { digest, files } so an adoption can say exactly which files differ.
export function toolingFingerprint(tooling, dataFiles) {
  const files = {};
  for (const f of engineFiles(tooling)) {
    if (dataFiles.includes(f)) continue;
    const p = f.startsWith('project/') ? join(tooling, '..', f.slice(8)) : f.startsWith('repo/') ? join(tooling, '..', '..', f.slice(5)) : join(tooling, f);
    files[f] = sha256(rf(p));
  }
  return { digest: sha256(canonicalJson(files)), files };
}

export function writeJson(path, obj) {
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n', { mode: 0o600 });
  renameSync(tmp, path);
}
export const readJsonFile = (path) => JSON.parse(readFileSync(path, 'utf8'));

// Creates a throwaway RC folder. Returns the DISPOSABLE tokens once; they are written nowhere inside the RC folder (only their hashes are).
export function initRc(dir, { clients, tooling, expiryDays = 7, hosts = {}, policy = null }) {
  if (existsSync(join(dir, MARKER)) || existsSync(join(dir, 'config.json'))) throw new RcError('already-initialised', 'this folder already holds a release-control state');
  for (const c of clients) { checkSlug(c); if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(hosts[c] || '')) throw new RcError('host-required', `client ${c} needs its production host (a client's package is only accepted for its own host)`); }
  for (const d of ['', 'ledger', 'staged', 'deploy', 'vault']) mkdirSync(join(dir, d), { recursive: true, mode: 0o700 });
  const tokens = { owner: randomToken(), scheduler: randomToken(), agent: randomToken() };
  const clientTokens = {};
  const fp = toolingFingerprint(tooling, [...DEFAULT_DATA_FILES]);
  const cfg = { schema: 'sts/release-control-config@poc1', adapter: 'local-directory', expiryDays, toolingDigest: fp.digest, toolingFiles: fp.files, toolingDir: tooling, dataFiles: [...DEFAULT_DATA_FILES], policy, clients: {} };
  for (const c of clients) {
    clientTokens[c] = randomToken();
    writeFileSync(join(dir, 'vault', c), clientTokens[c], { mode: 0o600 });
    mkdirSync(join(dir, 'deploy', c), { recursive: true });
    cfg.clients[c] = { host: hosts[c], deployTokenSha256: sha256(clientTokens[c]), maxApprovalAgeDays: { rights: 365, search: 90, externalLinks: 30, domain: 365 } };
  }
  writeJson(join(dir, 'config.json'), cfg);
  writeJson(join(dir, 'credentials.json'), { schema: 'sts/release-control-credentials@poc1', principals: [
    { id: 'owner', role: 'owner', tokenSha256: sha256(tokens.owner), clients: ['*'], expires: null, revoked: false },
    { id: 'scheduler', role: 'scheduler', tokenSha256: sha256(tokens.scheduler), clients: ['*'], expires: null, revoked: false },
    { id: 'coding-agent', role: 'agent', tokenSha256: sha256(tokens.agent), clients: [], expires: null, revoked: false },
  ] });
  writeFileSync(join(dir, 'runner.key'), randomToken(), { mode: 0o600 });
  writeJson(join(dir, MARKER), { note: 'SYNTHETIC PROOF OF CONCEPT: disposable credentials, synthetic clients, a local-directory adapter. Not a production release-control repository.', createdBy: 'G6-3A / APR-JE-043' });
  try { chmodSync(dir, 0o700); } catch { /* best effort on platforms without modes */ }
  // every client's ledger starts with a signed genesis entry, so a missing ledger is a fault and not a fresh start
  const rc = { dir, config: cfg, runnerKey: rf(join(dir, 'runner.key'), 'utf8').trim() };
  for (const c of clients) new Ledger(rc, c).append({ type: 'genesis', actor: { id: 'init', role: 'system' }, data: { note: 'SYNTHETIC release-control proof of concept' }, ts: new Date().toISOString(), genesis: true });
  return { tokens, clientTokens };
}

export function openRc(dir) {
  if (!existsSync(join(dir, MARKER))) throw new RcError('not-a-poc', `${MARKER} is missing: this proof of concept only runs on a folder it created`);
  const config = readJsonFile(join(dir, 'config.json'));
  if (config.adapter !== 'local-directory') throw new RcError('bad-adapter', 'the only adapter of the proof of concept is local-directory');
  return { dir, config, runnerKey: readFileSync(join(dir, 'runner.key'), 'utf8').trim(), credentials: readJsonFile(join(dir, 'credentials.json')) };
}
export const clientConfig = (rc, client) => { const c = rc.config.clients[checkSlug(client)]; if (!c) throw new RcError('unknown-client', `${client} is not in the release-control allow-list`); return c; };
export const pathsOf = (rc, client) => ({
  ledger: inside(rc.dir, 'ledger', `${client}.jsonl`), head: inside(rc.dir, 'ledger', `${client}.head.json`), lock: inside(rc.dir, 'ledger', `${client}.lock`),
  staged: inside(rc.dir, 'staged', client), deploy: inside(rc.dir, 'deploy', client), vault: inside(rc.dir, 'vault', client),
});
