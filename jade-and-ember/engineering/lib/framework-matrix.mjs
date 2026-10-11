// The framework extraction and migration matrix (Gate 5 Phase 8, APR-JE-036): loading, validation, file classification and the Markdown rendering.
// The matrix (engineering/framework-migration-matrix.json) is an ASSESSMENT. Nothing here extracts, copies or implements framework code.
// Every file of the repository must belong to exactly one component (the longest matching path wins), every reference must resolve, and
// FRAMEWORK-MIGRATION-MATRIX.md must equal what this module generates from the data.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { engDir, readJson, repoRoot } from './git.mjs';

export const MATRIX_JSON = join(engDir, 'framework-migration-matrix.json');
export const MATRIX_MD = join(engDir, 'FRAMEWORK-MIGRATION-MATRIX.md');
const LEVELS = ['none', 'parameterise', 'split', 'redesign', 'rewrite'];
const SPEC = /^(0[1-9]|1[0-5])$/;

export const loadMatrix = () => readJson(MATRIX_JSON);
export const repoFiles = () => execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n').filter(Boolean).sort();

// file -> component by longest matching path (a path ending in "/" is a directory prefix; otherwise an exact file)
export function classify(matrix, files) {
  const rules = matrix.components.flatMap((c) => c.paths.map((p) => ({ p, id: c.id })));
  const byFile = {}, unclassified = [], ambiguous = [];
  for (const f of files) {
    const hits = rules.filter((r) => (r.p.endsWith('/') ? f.startsWith(r.p) : f === r.p));
    if (!hits.length) { unclassified.push(f); continue; }
    const best = Math.max(...hits.map((h) => h.p.length)), top = hits.filter((h) => h.p.length === best);
    if (new Set(top.map((h) => h.id)).size > 1) { ambiguous.push(`${f} -> ${[...new Set(top.map((h) => h.id))].join(', ')}`); continue; }
    byFile[f] = top[0].id;
  }
  const stale = rules.filter((r) => !files.some((f) => (r.p.endsWith('/') ? f.startsWith(r.p) : f === r.p))).map((r) => `${r.id}: ${r.p}`);
  return { byFile, unclassified, ambiguous, stale };
}

// work packages in dependency order (ties by id); null when there is a cycle
export function wpOrder(wps) {
  const done = [], left = [...wps].sort((a, b) => (a.id < b.id ? -1 : 1));
  while (left.length) { const i = left.findIndex((w) => w.dependsOn.every((d) => done.includes(d))); if (i < 0) return null; done.push(left.splice(i, 1)[0].id); }
  return done;
}

export function validate(matrix, files, approvalsText = '') {
  const p = [];
  const bad = (m) => p.push(m);
  if (matrix.schema !== 'jade-and-ember/framework-migration-matrix@1') bad('schema must be jade-and-ember/framework-migration-matrix@1');
  const ids = matrix.components.map((c) => c.id);
  if (new Set(ids).size !== ids.length) bad('duplicate component ids');
  const wpIds = matrix.workPackages.map((w) => w.id), cls = Object.keys(matrix.classes);
  if (new Set(wpIds).size !== wpIds.length) bad('duplicate work package ids');
  for (const c of matrix.components) {
    for (const k of ['name', 'summary', 'target', 'verify']) if (!String(c[k] || '').trim()) bad(`${c.id}: ${k} is empty`);
    if (!cls.includes(c.class)) bad(`${c.id}: unknown class "${c.class}"`);
    if (!LEVELS.includes(c.redesign?.level)) bad(`${c.id}: redesign.level must be one of ${LEVELS.join(', ')}`);
    if (c.redesign?.level !== 'none' && String(c.redesign?.notes || '').length < 40) bad(`${c.id}: a component that needs ${c.redesign?.level} must say why (redesign.notes)`);
    if (!c.paths?.length) bad(`${c.id}: no paths`);
    for (const d of c.dependsOn) if (!ids.includes(d)) bad(`${c.id}: dependsOn ${d} is not a component`);
    for (const s of c.masterSpecs) if (!SPEC.test(s)) bad(`${c.id}: master spec "${s}" is not 01 to 15`);
    if (!wpIds.includes(c.workPackage)) bad(`${c.id}: work package ${c.workPackage} does not exist`);
    for (const n of c.priorities) if (!(Number.isInteger(n) && n >= 1 && n <= 8)) bad(`${c.id}: priority ${n} is not 1 to 8`);
  }
  for (const w of matrix.workPackages) {
    for (const d of w.dependsOn) if (!wpIds.includes(d)) bad(`${w.id}: dependsOn ${d} is not a work package`);
    for (const b of w.blocks) if (!matrix.releaseBlockers.some((x) => x.id === b)) bad(`${w.id}: blocks ${b}, which is not a release blocker`);
  }
  if (!wpOrder(matrix.workPackages)) bad('work packages contain a dependency cycle');
  for (const pr of matrix.priorities) {
    const w = matrix.workPackages.find((x) => x.id === pr.wp);
    if (!w) bad(`${pr.id}: work package ${pr.wp} does not exist`);
    else if (!w.priorities.includes(Number(pr.id.slice(2)))) bad(`${pr.id}: ${pr.wp} does not list priority ${pr.id.slice(2)}`);
  }
  if (matrix.priorities.length !== 8) bad('the eight Gate 6 priorities must all be recorded');
  const rids = matrix.requirements.map((r) => r.id);
  if (new Set(rids).size !== rids.length) bad('duplicate requirement ids');
  for (const r of matrix.requirements) {
    if (!wpIds.includes(r.workPackage)) bad(`${r.id}: work package ${r.workPackage} does not exist`);
    for (const c of r.components) if (!ids.includes(c)) bad(`${r.id}: component ${c} does not exist`);
    if (!String(r.status).trim()) bad(`${r.id}: no status`);
  }
  for (let i = 1; i <= 14; i++) if (!rids.includes(`RG-${String(i).padStart(2, '0')}`)) bad(`finding RG-${String(i).padStart(2, '0')} is not in the register`);
  // every owner decision in the approvals log is in the register, so a decision cannot be forgotten
  const decided = [...new Set([...approvalsText.matchAll(/\*\*(D-P[3-6]-\d+)\*\*/g)].map((m) => m[1]))];
  for (const d of decided) if (!rids.includes(d)) bad(`decision ${d} is recorded in the approvals log but not in the requirement register`);
  for (const b of matrix.releaseBlockers) if (!String(b.text).trim() || !String(b.resolvedBy).trim()) bad(`${b.id}: incomplete`);
  const k = classify(matrix, files);
  for (const f of k.unclassified) bad(`file not classified: ${f}`);
  for (const f of k.ambiguous) bad(`file claimed by two components: ${f}`);
  for (const s of k.stale) bad(`path matches no file: ${s}`);
  return { problems: p, classification: k };
}

const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
// file lists, compressed per directory
function locations(files) {
  const by = {};
  for (const f of files) (by[dirname(f)] ||= []).push(f.slice(dirname(f).length + 1));
  return Object.entries(by).sort(([a], [b]) => (a < b ? -1 : 1)).map(([d, names]) => (names.length > 6 ? `\`${d}/\` (${names.length} files)` : `\`${d}/\` ${names.map((n) => `\`${n}\``).join(', ')}`)).join('<br>');
}

export function render(matrix, classification) {
  const order = wpOrder(matrix.workPackages), pos = (id) => order.indexOf(id) + 1;
  const files = {}; for (const [f, id] of Object.entries(classification.byFile)) (files[id] ||= []).push(f);
  const out = [];
  out.push('# Framework extraction and migration matrix (Gate 5 Phase 8, `APR-JE-036`)', '');
  out.push('**Generated** by `node engineering/tools/framework-matrix.mjs --write` from `engineering/framework-migration-matrix.json`; `check:framework-matrix` fails if this file differs from the data or if any file of the repository is not classified. **An assessment: nothing was extracted, copied or implemented, and the framework repository was not modified.** Target locations and the order are architectural recommendations; the file lists, counts and references are verified facts.', '');
  out.push(`Framework reference: \`${matrix.frameworkReference.repository}\` pinned at \`${matrix.frameworkReference.pinnedCommit}\` (main \`${matrix.frameworkReference.mainCommit}\`); architecture specifications ${matrix.frameworkReference.architectureSpecs}.`, '');
  out.push(`**${matrix.components.length} components, ${Object.keys(classification.byFile).length} files, ${matrix.workPackages.length} work packages, ${matrix.requirements.length} registered requirements and findings, ${matrix.releaseBlockers.length} release blockers.**`, '');
  out.push('## 1. Classes', '', '| Class | Meaning |', '|---|---|', ...Object.entries(matrix.classes).map(([k, v]) => `| \`${k}\` | ${esc(v)} |`), '');
  out.push('## 2. Components', '', 'Order = position of the owning work package in the dependency order (section 3). Redesign level: none, parameterise (values move to the manifest), split (part moves elsewhere), redesign (the design changes), rewrite.', '');
  for (const cl of Object.keys(matrix.classes)) {
    const cs = matrix.components.filter((c) => c.class === cl);
    if (!cs.length) continue;
    out.push(`### ${cl}`, '', '| ID | Component | Source locations | Target (recommended) | Depends on | Redesign | Verification criteria | Master specs | Order |', '|---|---|---|---|---|---|---|---|---|');
    for (const c of cs) out.push(`| ${c.id} | **${esc(c.name)}**<br>${esc(c.summary)} | ${locations((files[c.id] || []).sort())} | ${esc(c.target)} | ${esc([...c.dependsOn, ...c.external].join(', ') || 'none')} | **${c.redesign.level}**${c.redesign.notes ? `: ${esc(c.redesign.notes)}` : ''} | ${esc(c.verify)} | ${c.masterSpecs.join(', ') || 'none'} | ${c.workPackage} (${pos(c.workPackage)}) |`);
    out.push('');
  }
  out.push('## 3. Work packages in dependency order', '', '| # | Package | Depends on | Priorities | Framework repo change | Size | Release blockers it clears | Verification |', '|---|---|---|---|---|---|---|---|');
  for (const id of order) { const w = matrix.workPackages.find((x) => x.id === id); out.push(`| ${pos(id)} | **${w.id} ${esc(w.title)}**<br>${esc(w.summary)} | ${w.dependsOn.join(', ') || 'none'} | ${w.priorities.join(', ') || '-'} | ${w.frameworkRepoChange ? '**yes: needs explicit owner approval**' : 'no'} | ${w.size} | ${w.blocks.join(', ') || '-'} | ${esc(w.verification)} |`); }
  out.push('', '## 4. The eight required Gate 6 priorities (APR-JE-036; required, not implemented)', '', '| ID | Priority | Work package |', '|---|---|---|', ...matrix.priorities.map((x) => `| ${x.id} | ${esc(x.text)} | ${x.wp} |`), '');
  out.push('## 5. Approved requirements and findings not yet implemented (register)', '', '| ID | From | Summary | Status | Work package | Components |', '|---|---|---|---|---|---|', ...matrix.requirements.map((r) => `| ${r.id} | ${r.source} | ${esc(r.summary)} | ${esc(r.status)} | ${r.workPackage} | ${r.components.join(', ') || '-'} |`), '');
  out.push('## 6. Release blockers for a client-production release', '', '| ID | Kind | Blocker | Resolved by |', '|---|---|---|---|', ...matrix.releaseBlockers.map((b) => `| ${b.id} | ${b.kind} | ${esc(b.text)} | ${esc(b.resolvedBy)} |`), '');
  return out.join('\n') + '\n';
}

export const approvalsText = () => readFileSync(join(repoRoot, 'docs', 'JADE_AND_EMBER_APPROVALS.md'), 'utf8');
