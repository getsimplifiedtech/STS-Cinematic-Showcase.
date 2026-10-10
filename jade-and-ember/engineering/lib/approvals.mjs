// Reads the approval log (docs/JADE_AND_EMBER_APPROVALS.md, section A table) into records, and finds the release approvals the gate needs.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from './git.mjs';

// Returns [{ id, date, type, decision, concerns, limits }]
export function parseApprovals(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    if (!/^\|\s*APR-JE-\d+\s*\|/.test(line) && !/^\|\s*(REL|DEP|RIGHTS)-JE-\d+\s*\|/.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 6) continue;
    rows.push({ id: cells[0], date: cells[1], type: cells[2], decision: cells[3], concerns: cells[4], limits: cells[5] });
  }
  return rows;
}
export const loadApprovals = (root = repoRoot) => parseApprovals(readFileSync(join(root, 'docs', 'JADE_AND_EMBER_APPROVALS.md'), 'utf8'));

// An approval of a kind ("release-approval", "deployment-approval") for exactly this channel, version and commit.
export function findApproval(rows, kind, { channel, version, commit }) {
  return rows.find((r) => r.type.toLowerCase().includes(kind)
    && new RegExp(`channel:\\s*\`?${channel}\`?`).test(r.decision)
    && (kind === 'deployment-approval' || new RegExp(`version:\\s*\`?${version.replace(/[.+-]/g, '\\$&')}\`?(?![\\w.-])`).test(r.decision))
    && new RegExp(`commit:\\s*\`?${commit}\`?`).test(r.decision)) || null;
}
export const findRightsVerification = (rows) => rows.find((r) => r.type.toLowerCase().includes('rights-verification') && /verified by/i.test(r.decision) && /sources?/i.test(r.decision) && /\d{4}-\d{2}-\d{2}/.test(r.decision)) || null;
