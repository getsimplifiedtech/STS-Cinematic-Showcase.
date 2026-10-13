// The project's industry adapter, reached through the manifest (sts.engineering.json, industry) and nowhere by name (G6-5, APR-JE-046; D-P4-2). An adapter lives in
// adapters/industry/<id>/ with an adapter.json (the checks it adds) and an index.mjs (what it knows: the schema.org types of its business and the fields only that
// business has). The base engineering asks it and never names an industry. A project with no adapter (industry: null) gets null here and the checks that need one say so.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { coreDir, project } from './project.mjs';

// Every project uses one adapter (specification 16, 7.1): the one its manifest names, or the generic local-business adapter when it names none.
export const industryId = project.industry ?? 'local-business';
export const industry = await import(pathToFileURL(join(coreDir, 'adapters', 'industry', industryId, 'index.mjs')).href);

export const requireIndustry = () => industry;
