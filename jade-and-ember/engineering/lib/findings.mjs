// Known findings: defects in the frozen v0.8 baseline that a check detects but that cannot be corrected without a visible change.
// Gate 2 rule: document the defect and the proposed correction, then stop for owner approval. Until a finding is approved and fixed the
// check reports it as KNOWN (a note, not a failure) and fails on anything NEW, anything WORSE, and any registry entry that no longer occurs
// (so the register cannot go stale). Entries live in engineering/findings.json.
import { join } from 'node:path';
import { engDir, readJson } from './git.mjs';

export const loadFindings = () => readJson(join(engDir, 'findings.json')).findings;

// measured: [{ key, detail, value? }]. A key is stable text such as "keyboard:menu.html:focus-visible:.jump a".
// known:    entries of findings.json whose `check` equals checkId (default: loaded from the register).
// Returns { problems, notes }.
export function reconcile(checkId, measured, known = loadFindings().filter((f) => f.check === checkId)) {
  const problems = [], notes = [];
  const byKey = new Map(known.map((f) => [f.key, f]));
  const seen = new Set();
  for (const m of measured) {
    const f = byKey.get(m.key);
    if (!f) { problems.push(`${m.key}: ${m.detail}`); continue; }
    seen.add(m.key);
    if (f.maxValue !== undefined && m.value !== undefined && m.value > f.maxValue) problems.push(`${m.key}: worse than the known finding ${f.id} (${m.value} against the recorded ${f.maxValue}): ${m.detail}`);
    else notes.push(`known finding ${f.id} (${f.status}): ${m.key}`);
  }
  for (const f of known) if (!seen.has(f.key)) problems.push(`known finding ${f.id} no longer occurs (${f.key}): remove it from engineering/findings.json, or fix the check`);
  return { problems, notes };
}
