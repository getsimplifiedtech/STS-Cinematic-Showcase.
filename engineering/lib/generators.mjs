// The project's build-time generators, reached through the manifest (sts.engineering.json, generators) and nowhere by a hard-coded path. The search and structured-data
// generator, the crawler policy and the configuration loader belong to the framework in the end (R-02, G6-6); until then each project keeps its own copy and the checks
// that validate against them load whatever the manifest names. A generator the project does not declare is null here and a check that needs it says so.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { project } from './project.mjs';

// A project names its own generator in the manifest; one that names none uses the engineering's own (engineering/generators/).
import { coreDir } from './project.mjs';
const load = async (name) => import(pathToFileURL(project.generators[name] ? join(project.root, ...project.generators[name].split('/')) : join(coreDir, 'generators', `${name}.mjs`)).href);
export const generators = Object.freeze({ seo: await load('seo'), crawlers: await load('crawlers'), config: await load('config') });

// A module may take what it needs from a generator when it is imported (const { publicUrl } = generator('seo')). A project without that generator still imports the module;
// what it took is a stand-in that refuses, with the manifest's name for the problem, the moment a check calls it or reads from it.
const refusal = (name) => `${project.name} declares no "${name}" generator (sts.engineering.json, generators.${name}), which this check needs`;
const absent = (name) => {
  const stop = () => { throw new Error(refusal(name)); };
  const stub = new Proxy(function absentGenerator() {}, { apply: stop, construct: stop, get: (t, k) => (typeof k === 'symbol' ? undefined : stop()) });
  return new Proxy({}, { get: (t, k) => (typeof k === 'symbol' || k === 'then' ? undefined : stub) });
};
export function generator(name) {
  return generators[name] || absent(name);
}
