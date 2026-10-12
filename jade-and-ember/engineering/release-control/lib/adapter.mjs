// The only deployment adapter of the proof of concept: a LOCAL DIRECTORY inside the release-control folder (G6-3A, APR-JE-043). It cannot reach a host. It stands in for
// a hosting adapter (G6-4) in one respect that matters to the tests: it needs the client's OWN deploy token, so a release of one client cannot be written to another.
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { RcError, inside, sameHex, sha256 } from './util.mjs';
import { clientConfig, pathsOf } from './state.mjs';
import { buildManifest } from '../../lib/hashed.mjs';

export function deployLocal(rc, client, siteDir, stageId) {
  const cfg = clientConfig(rc, client), p = pathsOf(rc, client);
  const token = existsSync(p.vault) ? readFileSync(p.vault, 'utf8').trim() : '';
  if (!token || !sameHex(sha256(token), cfg.deployTokenSha256)) throw new RcError('deploy-credential', `the deploy credential of ${client} is missing or does not match`);
  const next = inside(p.deploy, `.next-${stageId.replace(/[^a-z0-9-]/gi, '')}`), live = inside(p.deploy, 'current'), prev = inside(p.deploy, '.prev');
  rmSync(next, { recursive: true, force: true }); rmSync(prev, { recursive: true, force: true });
  mkdirSync(p.deploy, { recursive: true });
  cpSync(siteDir, next, { recursive: true });
  if (existsSync(live)) renameSync(live, prev);
  renameSync(next, live);
  const digest = buildManifest(live).treeSha256;
  return { digest, target: `deploy/${client}/current` };
}
export const deployedDigest = (rc, client) => { const live = inside(pathsOf(rc, client).deploy, 'current'); return existsSync(live) ? buildManifest(live).treeSha256 : null; };
