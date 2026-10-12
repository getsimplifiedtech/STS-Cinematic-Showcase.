// Who may do what (G6-3A proof of concept). The coding agent is a principal with NO capability: that is how the proof of concept models "coding-agent credentials
// cannot reach release authorisation or deployment controls". In the real design the boundary is stronger than a table: the agent's GitHub credential cannot even
// see the release-control repository (G6-3A-DESIGN.md, E5), and this table would be the owner's own access to it.
import { RcError, sha256, sameHex } from './util.mjs';

export const CAPS = Object.freeze({
  owner: new Set(['stage', 'review', 'record-approval', 'revoke-approval', 'approve', 'revoke', 'freeze', 'unfreeze', 'preauth-grant', 'preauth-revoke', 'adopt-tooling', 'audit', 'status']),
  scheduler: new Set(['stage', 'review', 'auto-release', 'audit', 'status']),
  agent: new Set(),
});

export function authenticate(rc, token, now) {
  if (typeof token !== 'string' || !token) return null;
  const h = sha256(token);
  const p = rc.credentials.principals.find((x) => sameHex(x.tokenSha256, h));
  if (!p || p.revoked || (p.expires && new Date(p.expires) <= now)) return null;
  return p;
}
export function authorize(principal, op, client) {
  if (!principal) return { ok: false, code: 'unauthenticated', reason: 'no valid credential' };
  const caps = CAPS[principal.role];
  if (!caps || !caps.has(op)) return { ok: false, code: 'forbidden', reason: `the ${principal.role} role may not ${op}` };
  if (client && !(principal.clients.includes('*') || principal.clients.includes(client))) return { ok: false, code: 'forbidden-client', reason: `${principal.id} has no access to client ${client}` };
  return { ok: true };
}
export const denied = (a) => new RcError(a.code, a.reason);
