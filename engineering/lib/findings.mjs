// Known findings: defects in the frozen v0.8 baseline that a check detects but that cannot be corrected without a visible change.
// Gate 2 rule: document the defect and the proposed correction, then stop for owner approval. Until a finding is approved and fixed the
// check reports it as KNOWN (a note, not a failure) and fails on anything NEW, anything WORSE, and any registry entry that no longer occurs
// (so the register cannot go stale). Entries live in engineering/findings.json.
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { engDir, readJson } from './git.mjs';
import { coreDir, project } from './project.mjs';
import { loadEntries } from './registry.mjs';
import { record } from './project-records.mjs';

export const SEVERITIES_ALLOWED = ['Info', 'Minor'];
// The rules for a known finding (specification 16, 5.3). `waivable` is the set of checks (registry ids) a finding may name; approvalsText is the project's approvals ledger.
export function findingsProblems(findings, { waivable, approvalsText = '', never = {} }) {
  const p = [], seen = new Set();
  if (!Array.isArray(findings)) return ['findings.json has no findings list'];
  for (const f of findings) {
    const w = `finding ${f && f.id}`;
    if (!f || typeof f !== 'object') { p.push('a finding is not an object'); continue; }
    if (typeof f.id !== 'string' || !f.id) p.push(`${w}: it has no id`);
    else if (seen.has(f.id)) p.push(`${w}: listed twice`);
    seen.add(f.id);
    if (!waivable.includes(`check:${f.check}`)) p.push(`${w}: check "${f.check}" is not one a finding may name (the registry marks it not waivable); fix the defect instead`);
    if (typeof f.key === 'string' && (never[`check:${f.check}`] || []).some((re) => new RegExp(re).test(f.key))) p.push(`${w}: the measurement ${f.key} is one the registry never lets a finding excuse (${f.check}); fix the defect`);
    if (typeof f.key !== 'string' || !f.key.startsWith(`${f.check}:`)) p.push(`${w}: key must be the exact measurement key, starting "${f.check}:"`);
    if (!SEVERITIES_ALLOWED.includes(f.severity)) p.push(`${w}: severity "${f.severity}" is not Info or Minor; a worse defect is never a finding, it fails`);
    const st = String(f.status || '');
    const cited = /^(accepted|closed) \(([A-Z]+-[A-Z]+-\d+)\)/.exec(st);
    if (!/^open\b/.test(st) && !cited) p.push(`${w}: status must be "open" or "accepted (<approval id>)"`);
    else if (cited && !new RegExp(`\\|\\s*${cited[2]}\\s*\\|`).test(approvalsText)) p.push(`${w}: it cites ${cited[2]}, which is not a row of the approvals ledger`);
    if (f.maxValue !== undefined && !Number.isFinite(f.maxValue)) p.push(`${w}: maxValue must be a number`);
  }
  return p;
}
export class FindingsError extends Error {}
export function loadFindings() {
  const list = record('findings.json').findings;
  const entries = loadEntries({ coreRoot: coreDir, manifest: project.manifest });
  const text = existsSync(project.governance.approvalsPath) ? readFileSync(project.governance.approvalsPath, 'utf8') : '';
  const problems = findingsProblems(list, { waivable: entries.filter((e) => e.waivable).map((e) => e.id), approvalsText: text, never: Object.fromEntries(entries.filter((e) => e.neverWaivable).map((e) => [e.id, e.neverWaivable])) });
  if (problems.length) throw new FindingsError(`findings.json is not acceptable: ${problems.join('; ')}`);
  return list;
}

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
    if (m.value !== undefined && f.maxValue === undefined) problems.push(`${m.key}: a measured value (${m.value}) needs a recorded limit (maxValue) in the finding ${f.id}: ${m.detail}`);
    else if (f.maxValue !== undefined && m.value !== undefined && m.value > f.maxValue) problems.push(`${m.key}: worse than the known finding ${f.id} (${m.value} against the recorded ${f.maxValue}): ${m.detail}`);
    else notes.push(`known finding ${f.id} (${f.status}): ${m.key}${m.value !== undefined && f.maxValue !== undefined ? ` [measured ${m.value}, recorded limit ${f.maxValue}]` : ''}`);
  }
  for (const f of known) if (!seen.has(f.key)) problems.push(`known finding ${f.id} no longer occurs (${f.key}): remove it from engineering/findings.json, or fix the check`);
  return { problems, notes };
}
