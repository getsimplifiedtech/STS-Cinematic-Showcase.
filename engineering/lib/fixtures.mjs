// The project's recipes for test material, reached through the manifest (sts.engineering.json, fixtures) and nowhere by a hard-coded path (G6-5, APR-JE-046).
// clientBuild turns the project's own configuration into an indexable client build in a throwaway folder; the checks that need one (search readiness, HTML and link
// validation of a client build, the hosting rules, the release dry run) ask for it here. A project without the recipe makes those checks not applicable; they never
// fall back to another project's recipe.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { project } from './project.mjs';

const mod = project.fixtures.clientBuild ? await import(pathToFileURL(join(project.root, ...project.fixtures.clientBuild.split('/'))).href) : null;
export const clientBuild = () => {
  if (!mod) throw new Error(`${project.name} declares no client-build recipe (sts.engineering.json, fixtures.clientBuild), which this check needs`);
  return mod;
};
export const buildClient = (options) => clientBuild().buildClient(options);
export const hasClientBuild = Boolean(mod);
// headTag: how the project puts a tag into every page head, for the dry run's social-image scenarios (a project without the recipe makes them not applicable)
const tagMod = project.fixtures.headTag ? await import(pathToFileURL(join(project.root, ...project.fixtures.headTag.split('/'))).href) : null;
export const hasHeadTag = Boolean(tagMod);
export const addHeadTag = (root, tag) => { if (!tagMod) throw new Error(`${project.name} declares no head-tag recipe (sts.engineering.json, fixtures.headTag), which this scenario needs`); return tagMod.addHeadTag(root, tag); };
export const BUSINESS = mod ? mod.BUSINESS : null;
