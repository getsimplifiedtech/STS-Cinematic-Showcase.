// The project's industry adapter, reached through the manifest (sts.engineering.json, industry) and nowhere by name (G6-5, APR-JE-046; D-P4-2). An adapter lives in
// adapters/industry/<id>/ with an adapter.json (the checks it adds) and an index.mjs (what it knows: the schema.org types of its business and the fields only that
// business has). The base engineering asks it and never names an industry. A project with no adapter (industry: null) gets null here and the checks that need one say so.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { coreDir, project } from './project.mjs';

export const industry = project.industry ? await import(pathToFileURL(join(coreDir, 'adapters', 'industry', project.industry, 'index.mjs')).href) : null;

export function requireIndustry() {
  if (!industry) throw new Error(`${project.name} declares no industry adapter (sts.engineering.json, industry), which this check needs`);
  return industry;
}
