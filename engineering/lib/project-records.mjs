// Project records (specification 16, sections 3.4 and 5.2). A record describes one project: authority pin, tokens, budgets, findings, rights inventory, reviewers and so on. It lives in
// the project's engineering folder and nowhere else: the framework never supplies a default and a record never falls back to another project. A check that needs one and does not find
// it fails with a message that names the record (MissingRecordError), it does not crash on a missing file.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { engRel, project } from './project.mjs';

export class MissingRecordError extends Error {}

export const recordPath = (...parts) => join(project.engDir, ...parts);
export const hasRecord = (...parts) => existsSync(recordPath(...parts));
export function record(...parts) {
  const p = recordPath(...parts);
  if (!existsSync(p)) throw new MissingRecordError(`the project record ${engRel}/${parts.join('/')} is missing: ${project.name} must supply it for this check (the framework supplies no default for a project record)`);
  return JSON.parse(readFileSync(p, 'utf8'));
}
// the same, from an engineering folder other than the bound project's (a sandbox copy, a candidate being assembled): a record that is not there is still the project's gap, said clearly
export function recordFrom(eng, ...parts) {
  const p = join(eng, ...parts);
  if (!existsSync(p)) throw new MissingRecordError(`the project record ${parts.join('/')} is missing from ${eng}: ${project.name} must supply it for this check (the framework supplies no default for a project record)`);
  return JSON.parse(readFileSync(p, 'utf8'));
}
export function recordText(...parts) {
  const p = recordPath(...parts);
  if (!existsSync(p)) throw new MissingRecordError(`the project record ${engRel}/${parts.join('/')} is missing: ${project.name} must supply it for this check`);
  return readFileSync(p, 'utf8');
}
