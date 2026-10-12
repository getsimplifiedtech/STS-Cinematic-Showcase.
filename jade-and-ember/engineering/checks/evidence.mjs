// check:evidence (Gate 5 Phase 2, APR-JE-030). The human-testing paperwork is sound, and nothing can pass off emulation as a person.
//   spec        release/evidence-spec.json is internally consistent: every target's sections exist, the gate names real targets, classes agree with types
//   templates   every target scaffolds an UNFILLED template (no outcome, no signature) that the release gate's validator rejects
//   dry run     a complete, consistent, invented record for every target is accepted by the validator (the paperwork can be satisfied), and the gate is
//               satisfied only when every needed target is present (the gate's single-defect matrix is in check:release; the validator's in check:selftest-evidence)
//   docs        docs/device-testing/ equals what the specification generates (the procedures cannot drift from the templates and the gate)
//   records     the files in release/evidence/ are well-formed; a COMPLETED record is internally consistent against its own build; none is invented here
//   viewport    no page disables the visitor's zoom (an automated part of the zoom procedure; the human part is in the procedures)
// The check never claims that any person tested anything. Today no human evidence has been recorded.
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { assembleCandidate, pagesOf } from '../lib/site.mjs';
import { assessEvidence, coverage, defaultVctx, itemsFor, loadEvidenceEntries, loadSpec, scaffold, validateRecord } from '../lib/evidence.mjs';
import { FIXTURE_COMMIT, FIXTURE_TREE, fixtureEvidenceSet, fixtureRecord, fixtureVctx } from '../lib/evidence-fixtures.mjs';
import { renderAll } from '../lib/evidence-docs.mjs';
import { engDir, isMain, projectDir, repoRoot } from '../lib/git.mjs';
import { project } from '../lib/project.mjs';

export function specProblems(spec) {
  const p = [];
  const gateTypes = Object.keys(spec.gate);
  for (const [id, t] of Object.entries(spec.targets)) {
    if (!gateTypes.includes(t.gateType)) p.push(`target ${id}: gate type "${t.gateType}" is not a gate requirement`);
    for (const c of t.classes) { if (!spec.classes[c]) p.push(`target ${id}: unknown class ${c}`); else if (!spec.classes[c].allowedTypes.includes(t.gateType)) p.push(`target ${id}: class ${c} may not back "${t.gateType}" records`); }
    if (t.gateType !== 'ci-run') {
      for (const s of t.sections) if (!spec.sections[s]) p.push(`target ${id}: unknown section ${s}`);
      if (t.classes.includes('E1')) p.push(`target ${id}: a human target cannot be class E1`);
      if (!t.environment || !t.attachments) p.push(`target ${id}: environment and attachments are required`);
    } else if (t.classes.join() !== 'E1') p.push('the ci-run target must be class E1 only');
  }
  for (const [g, d] of Object.entries(spec.gate)) for (const n of d.needs) for (const t of n.targets) { if (!spec.targets[t]) p.push(`gate ${g}: unknown target ${t}`); else if (spec.targets[t].gateType !== g) p.push(`gate ${g}: target ${t} is a ${spec.targets[t].gateType} record`); }
  for (const [sid, sec] of Object.entries(spec.sections)) {
    const ids = new Set();
    for (const it of sec.items) { if (ids.has(it.id)) p.push(`section ${sid}: duplicate item ${it.id}`); ids.add(it.id); for (const f of (it.pages || [])) if (!spec.pages.includes(f)) p.push(`section ${sid}: item ${it.id} names unknown page ${f}`); }
    if (!['page', 'session'].includes(sec.scope)) p.push(`section ${sid}: scope must be page or session`);
  }
  // every class is defined and the three are distinct in what they allow
  if (JSON.stringify(Object.keys(spec.classes)) !== '["E1","E2","E3"]') p.push('the classes must be exactly E1, E2 and E3');
  if (new Set(Object.values(spec.classes).map((c) => c.mayClaim)).size !== 3) p.push('each class must state its own claim');
  return p;
}

// The viewport meta tag of every page must leave zoom to the visitor.
export function viewportProblems(dir) {
  const p = [];
  for (const f of pagesOf(dir)) {
    const html = readFileSync(join(dir, f), 'utf8');
    const m = html.match(/<meta\s+name=["']viewport["']\s+content=["']([^"']*)["']/i);
    if (!m) { p.push(`${f}: no viewport meta tag`); continue; }
    const c = m[1].toLowerCase().replace(/\s+/g, '');
    if (/user-scalable=(no|0)/.test(c)) p.push(`${f}: the viewport tag disables zoom (user-scalable)`);
    const mx = c.match(/maximum-scale=([\d.]+)/);
    if (mx && Number(mx[1]) < 5) p.push(`${f}: the viewport tag limits zoom (maximum-scale=${mx[1]})`);
  }
  return p;
}

export async function checkEvidence({ root = null } = {}) {
  const own = !root;
  const dir = root || assembleCandidate(projectDir, 'evidence-check');
  const problems = [], notes = [];
  try {
    const spec = loadSpec();
    problems.push(...specProblems(spec).map((x) => `spec: ${x}`));
    const targets = Object.keys(spec.targets);
    // templates and the dry run
    let rejected = 0, accepted = 0, items = 0;
    for (const id of targets) {
      const tpl = scaffold(spec, id, { commit: FIXTURE_COMMIT, assetsTree: FIXTURE_TREE });
      const v = validateRecord(tpl, fixtureVctx());
      if (!v.problems.length) problems.push(`template ${id}: the validator ACCEPTS an unfilled template`); else rejected++;
      const json = JSON.stringify(tpl);
      if (/"outcome":"(pass|fail|not-applicable)"|"conclusion":"(success|failure)"/.test(json)) problems.push(`template ${id}: the scaffold filled in a result`);
      if (tpl.attestation && (tpl.attestation.statement || tpl.attestation.signedBy)) problems.push(`template ${id}: the scaffold signed the record`);
      if (tpl.status !== 'template') problems.push(`template ${id}: status must be "template"`);
      if (spec.targets[id].gateType !== 'ci-run') { const it = itemsFor(spec, id); items += it.session.length + Object.values(it.pages).reduce((n, l) => n + l.length, 0); }
      const f = fixtureRecord(id);
      const w = validateRecord(f.record, fixtureVctx(f.files));
      if (w.problems.length || !w.success) problems.push(`dry run ${id}: a complete record is rejected: ${w.problems.slice(0, 3).join('; ')}`); else accepted++;
    }
    notes.push(`evidence specification: ${targets.length} targets (${Object.entries(spec.classes).map(([c]) => `${c}: ${targets.filter((t) => spec.targets[t].classes.includes(c)).length}`).join(', ')}), ${Object.keys(spec.sections).length} sections, ${items} checklist answers across the templates`);
    notes.push(`templates: ${rejected}/${targets.length} unfilled templates are rejected by the validator and none contains a result or a signature; dry run: ${accepted}/${targets.length} complete invented records are accepted`);
    // the gate against the invented set
    const fx = fixtureEvidenceSet(), vctx = fixtureVctx(fx.files);
    const assessed = assessEvidence(fx.entries, vctx);
    for (const g of Object.keys(spec.gate)) { const c = coverage(spec, g, assessed); if (!c.ok) problems.push(`dry run: the gate requirement ${g} is not met by a complete set of invented records (${c.detail})`); }
    const partial = assessEvidence(fx.entries.filter((e) => e.record.target !== 'android-chrome'), vctx);
    if (coverage(spec, 'real-device', partial).ok) problems.push('dry run: the gate accepts real-device evidence without an Android phone');
    notes.push('dry run: a complete invented set satisfies every evidence requirement of the gate, and removing a required target breaks it (the full single-defect matrix is in check:release and check:selftest-evidence)');
    // docs
    const docs = renderAll(spec), docsDir = join(repoRoot, 'docs', 'device-testing');
    for (const [k, v] of Object.entries(docs)) { const f = join(docsDir, k); if (!existsSync(f)) problems.push(`docs/device-testing/${k} is missing (run npm run evidence:docs)`); else if (readFileSync(f, 'utf8') !== (v.endsWith('\n') ? v : v + '\n')) problems.push(`docs/device-testing/${k} differs from the specification (run npm run evidence:docs)`); }
    const have = existsSync(docsDir) ? [...readdirSync(docsDir).filter((f) => f.endsWith('.md')), ...(existsSync(join(docsDir, 'procedures')) ? readdirSync(join(docsDir, 'procedures')).map((f) => `procedures/${f}`) : [])] : [];
    for (const f of have) if (!(f in docs)) problems.push(`docs/device-testing/${f} is not generated from the specification`);
    if (!existsSync(join(repoRoot, project.governance.documents.deviceTestProtocol))) problems.push(`${project.governance.documents.deviceTestProtocol} is missing`);
    notes.push(`procedures: ${Object.keys(docs).length} generated documents in docs/device-testing/ equal the specification (${targets.length} per-target procedures, 3 cross-cutting procedures, the inventory), plus the protocol`);
    // the records on file
    const entries = loadEvidenceEntries();
    let templates = 0, completed = 0;
    for (const e of entries) {
      if (!e.record) { problems.push(`release/evidence/${e.file}: ${e.parseError}`); continue; }
      if (e.record.status === 'template') { templates++; continue; }
      completed++;
      const v = validateRecord(e.record, defaultVctx({ releaseCommit: e.record.build?.commit || '', assetsTree: e.record.build?.assetsTree || '' }));
      for (const x of v.problems) problems.push(`release/evidence/${e.file}: ${x}`);
    }
    notes.push(entries.length ? `records on file: ${entries.length} (${templates} unfilled templates, ${completed} completed; completed records are checked against their own build; the gate judges them against the release build)` : 'records on file: none. No physical-device, screen-reader or desktop-Safari evidence has been recorded: the gate\'s human requirements stay unmet');
    // viewport
    const vp = viewportProblems(dir);
    problems.push(...vp);
    if (!vp.length) notes.push(`viewport: all ${pagesOf(dir).length} pages leave zoom to the visitor (no user-scalable=no, no maximum-scale below 5)`);
    return { problems, notes };
  } finally { if (own) rmSync(dir, { recursive: true, force: true }); }
}

if (isMain(import.meta.url)) {
  const t0 = Date.now();
  const { problems, notes } = await checkEvidence();
  notes.forEach((n) => console.log('  ' + n));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:evidence (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  process.exit(problems.length ? 1 : 0);
}
