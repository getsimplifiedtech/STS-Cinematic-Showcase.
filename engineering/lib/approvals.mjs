// Reads the approval log (the file named by the project manifest, governance.approvalsLog, section A table): the governance record of the project (its approval ids, for example APR-JE-nnn). Release decisions are not kept here.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from './git.mjs';
import { project } from './project.mjs';

const escRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const ROW_APPROVAL = new RegExp(`^\\|\\s*${escRe(project.governance.approvalIdPrefix)}-\\d+\\s*\\|`);
const ROW_RECORD = new RegExp(`^\\|\\s*(REL|DEP|RIGHTS|SRCH)-${escRe(project.governance.recordIdSuffix)}-\\d+\\s*\\|`);

// Returns [{ id, date, type, decision, concerns, limits }]
export function parseApprovals(text) {
  const rows = [];
  // a row inside a code fence or an HTML comment is not a row of the table (it is an example or a retraction a reader does not see as a decision)
  let fenced = false, commented = false;
  for (const line of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    if (commented) { if (line.includes('-->')) commented = false; continue; }
    if (line.includes('<!--') && !line.includes('-->')) { commented = true; continue; }
    if (/<!--.*-->/.test(line) && !/^\|/.test(line)) continue;
    if (!ROW_APPROVAL.test(line) && !ROW_RECORD.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 6) continue;
    rows.push({ id: cells[0], date: cells[1], type: cells[2], decision: cells[3], concerns: cells[4], limits: cells[5] });
  }
  return rows;
}
export const approvalsText = (root = repoRoot) => readFileSync(root === repoRoot ? project.governance.approvalsPath : join(root, project.governance.approvalsLog), 'utf8');
export const loadApprovals = (root = repoRoot) => parseApprovals(approvalsText(root));

// RETIRED (G6-2, APR-JE-039): release approvals, rights verifications, search reviews and deployment approvals were found here by matching English keywords in a
// Markdown row, so a row saying REJECTED, "NOT verified" or "(REVOKED)" still counted (RG-04 to RG-07), and they had to name the HEAD commit (RG-01). They are
// structured records now (lib/records.mjs, engineering/release/approvals/) and these rows are not read by the gate. check:release reports any that remain.
