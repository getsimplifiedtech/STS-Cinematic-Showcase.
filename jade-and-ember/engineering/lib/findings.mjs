// Known findings: defects in the frozen v0.8 baseline that a check detects but that cannot be corrected without a visible change.
// Gate 2 rule: document the defect and the proposed correction, then stop for owner approval. Until a finding is approved and fixed the
// check reports it as KNOWN (a note, not a failure) and fails on anything NEW, anything WORSE, and any registry entry that no longer occurs
// (so the register cannot go stale). Entries live in engineering/findings.json.
import { join } from 'node:path';
import { engDir, readJson } from './git.mjs';

export const loadFindings = () => readJson(join(engDir, 'findings.json')).findings;

// The engine a check is running in (Gate 5). A finding may name the engines it was observed in (`engines`); outside them it is not expected to occur
// (so it cannot go "stale" in an engine that never showed it) and, if it does occur there, it is NEW and fails until a person records it.
let ENGINE = 'chromium';
export const setEngine = (name) => { ENGINE = name; };
export const currentEngine = () => ENGINE;
export const appliesHere = (f) => !f.engines || f.engines.includes(ENGINE);

// measured: [{ key, detail, value? }]. A key is stable text such as "keyboard:menu.html:focus-visible:.jump a".
// known:    entries of findings.json whose `check` equals checkId (default: loaded from the register).
// Returns { problems, notes }.
export function reconcile(checkId, measured, known = loadFindings().filter((f) => f.check === checkId && appliesHere(f))) {
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
