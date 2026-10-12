// Approved computed-style differences between the v0.8 baseline and the candidate (engineering/approved-style-differences.json).
// A difference is accepted only when: the engine is named by the entry, the element matches, every differing computed property is listed by the
// entry, every listed exact value pair holds, and the element's position and size ("[geometry]") are unchanged.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { engDir, readJson } from './git.mjs';
import { approvalsText } from './approvals.mjs';
import { project } from './project.mjs';

export function loadApprovedStyleDifferences() {
  const list = readJson(join(engDir, 'approved-style-differences.json'));
  const approvals = approvalsText();
  const entries = (list.entries || []).filter((e) => e.approval && new RegExp(`\\|\\s*${e.approval}\\s*\\|`).test(approvals));   // an entry without a recorded approval accepts nothing
  return { entries, errors: (list.entries || []).filter((e) => !entries.includes(e)).map((e) => `approved-style-differences.json entry ${e.id}: no owner approval ${e.approval} is recorded in ${project.governance.approvalsLog}`) };
}

// base, cand: { property: value } of one element in the baseline and in the candidate. Returns the entry id, or null.
export function approvedStyleDifference(approved, engine, base, cand) {
  if (!base || !cand) return null;
  const props = Object.keys(base).filter((k) => base[k] !== cand[k]);
  if (!props.length || props.includes('[geometry]')) return null;
  for (const e of approved.entries) {
    if (!e.engines.includes(engine)) continue;
    if (base['[tag]'] !== e.match.tag || base['[inHoursTable]'] !== String(!!e.match.inHoursTable)) continue;
    if (!props.every((k) => e.properties.includes(k))) continue;
    if (!Object.entries(e.exact || {}).every(([k, [from, to]]) => !props.includes(k) || (base[k] === from && cand[k] === to))) continue;
    return e.id;
  }
  return null;
}
