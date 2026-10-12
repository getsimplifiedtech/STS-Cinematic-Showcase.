// Small shared helpers of the release-control proof of concept (G6-3A, APR-JE-043). Everything here is local and synthetic: nothing talks to GitHub or to a host.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { resolve, sep } from 'node:path';
export { canonicalJson } from '../../lib/candidate.mjs';

export const sha256 = (b) => createHash('sha256').update(b).digest('hex');
export const hmac = (key, text) => createHmac('sha256', key).update(text).digest('hex');
export const randomToken = () => randomBytes(32).toString('hex');
export const sameHex = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

// every refusal is an RcError with a stable code, so callers and tests can tell WHY an operation was refused
export class RcError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

// a client is named by a short lowercase slug; it becomes a folder name and a ledger name, so nothing else is accepted (no dots, slashes, case tricks, reserved names)
export const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
export const RESERVED = new Set(['con', 'prn', 'aux', 'nul', 'null', 'undefined', 'config', 'ledger', 'staged', 'deploy', 'vault']);
export function checkSlug(s) {
  if (typeof s !== 'string' || !SLUG.test(s) || RESERVED.has(s)) throw new RcError('bad-client', `${JSON.stringify(String(s).slice(0, 40))} is not a client name (lowercase letters, digits and hyphens, 1 to 40 characters)`);
  return s;
}
// a path built from the RC folder must stay inside it
export function inside(root, ...parts) {
  const r = resolve(root), p = resolve(r, ...parts);
  if (p !== r && !p.startsWith(r + sep)) throw new RcError('path-escape', 'a path left the release-control folder');
  return p;
}
export const iso = (d) => d.toISOString();
export const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
