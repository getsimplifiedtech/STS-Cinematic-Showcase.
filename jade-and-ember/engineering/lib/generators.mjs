// The project's build-time generators, reached through the manifest (sts.engineering.json, generators) and nowhere by a hard-coded path. The search and structured-data
// generator, the crawler policy and the configuration loader belong to the framework in the end (R-02, G6-6); until then each project keeps its own copy and the checks
// that validate against them load whatever the manifest names. A generator the project does not declare is null here and a check that needs it says so.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { project } from './project.mjs';

const load = async (name) => (project.generators[name] ? import(pathToFileURL(join(project.root, ...project.generators[name].split('/'))).href) : null);
export const generators = Object.freeze({ seo: await load('seo'), crawlers: await load('crawlers'), config: await load('config') });

export function generator(name) {
  const g = generators[name];
  if (!g) throw new Error(`${project.name} declares no "${name}" generator (sts.engineering.json, generators.${name}), which this check needs`);
  return g;
}
