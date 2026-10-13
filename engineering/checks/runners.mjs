// Binds each check of the base engineering to the function that runs it (G6-5, APR-JE-046). WHICH checks exist, in what order, in which engines and what each needs
// is the registry's business (checks.json, lib/registry.mjs): this file only knows how to call them. An entry that comes from an industry adapter or from the project
// manifest is imported where it says it lives, so a project adds a check without this file changing.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { coreDir, project } from '../lib/project.mjs';
import { unmetNeeds } from '../lib/registry.mjs';
import { MissingRecordError } from '../lib/project-records.mjs';
import { PolicyError } from '../lib/policy.mjs';
import { FindingsError } from '../lib/findings.mjs';


// Each check is imported when it is run, so a project pays for (and depends on the records of) only the checks it runs.
// ctx: { fast, browserName, strictEnv, framework }
export const CORE = {
  'check:baseline': async (ctx) => (await import('./baseline.mjs')).checkBaseline(),
  'check:determinism': async (ctx) => (await import('./determinism.mjs')).checkDeterminism(),
  'check:delivery': async (ctx) => (await import('./delivery.mjs')).checkDelivery(),
  'check:project': async (ctx) => (await import('./project.mjs')).checkProject(),
  'check:extraction': async (ctx) => (await import('./extraction.mjs')).checkExtraction(),
  'check:authority': async (ctx) => (await import('./authority.mjs')).checkAuthority({ framework: ctx.framework }),
  'check:media': async (ctx) => (await import('./media.mjs')).checkMedia({ browser: !ctx.fast, browserName: ctx.browserName }),
  'check:tokens': async (ctx) => (await import('./tokens.mjs')).checkTokens(),
  'check:secrets': async (ctx) => (await import('./secrets.mjs')).checkSecrets(),
  'check:deps': async (ctx) => (await import('./deps.mjs')).checkDeps(),
  'check:ci': async (ctx) => (await import('./ci.mjs')).checkCi(),
  'check:html': async (ctx) => (await import('./html.mjs')).checkHtml(),
  'check:links': async (ctx) => (await import('./links.mjs')).checkLinks(),
  'check:seo': async (ctx) => (await import('./seo.mjs')).checkSeo({ browser: !ctx.fast, browserName: ctx.browserName }),
  'check:release': async (ctx) => (await import('./release.mjs')).checkRelease(),
  'check:evidence': async (ctx) => (await import('./evidence.mjs')).checkEvidence(),
  'check:hosting': async (ctx) => (await import('./hosting.mjs')).checkHosting(),
  'check:privacy': async (ctx) => (await import('./privacy.mjs')).checkPrivacy({ browser: !ctx.fast, browserName: ctx.browserName }),
  'check:security': async (ctx) => (await import('./security.mjs')).checkSecurity({ browser: !ctx.fast, browserName: ctx.browserName }),
  'check:assets': async (ctx) => (await import('./assets.mjs')).checkAssets({ browser: !ctx.fast, browserName: ctx.browserName }),
  'check:budgets': async (ctx) => (await import('./budgets.mjs')).checkBudgets({ browser: !ctx.fast, browserName: ctx.browserName }),
  'check:keyboard': async (ctx) => (await import('./keyboard.mjs')).checkKeyboard({ browserName: ctx.browserName }),
  'check:reflow': async (ctx) => (await import('./reflow.mjs')).checkReflow({ browserName: ctx.browserName }),
  'check:forced-colors': async (ctx) => (await import('./forced-colors.mjs')).checkForcedColors({ browserName: ctx.browserName }),
  'check:a11y-tree': async (ctx) => (await import('./a11y-tree.mjs')).checkA11yTree({ browserName: ctx.browserName }),
  'check:order': async (ctx) => (await import('./order.mjs')).checkOrder({ browserName: ctx.browserName }),
  'check:phone': async (ctx) => (await import('./phone.mjs')).checkPhone({ browserName: ctx.browserName }),
  'check:portability': async (ctx) => (await import('./portability.mjs')).checkPortability({ browserName: ctx.browserName }),
  'check:release-dryrun': async (ctx) => (await import('./release-dryrun.mjs')).checkReleaseDryRun(),
  'check:regression': async (ctx) => (await import('./regression.mjs')).checkRegression({ browserName: ctx.browserName, strictEnv: ctx.strictEnv }),
  'check:selftest': async (ctx) => (await import('./selftest.mjs')).checkSelftest(),
  'check:selftest-gate2': async (ctx) => (await import('./selftest-gate2.mjs')).checkSelftestGate2(),
  'check:selftest-gate3': async (ctx) => (await import('./selftest-gate3.mjs')).checkSelftestGate3(),
  'check:selftest-gate5': async (ctx) => (await import('./selftest-gate5.mjs')).checkSelftestGate5(),
  'check:selftest-gate6': async (ctx) => (await import('./selftest-gate6.mjs')).checkSelftestGate6(),
  'check:selftest-generic': async (ctx) => (await import('./selftest-generic.mjs')).checkSelftestGeneric(),
  'check:selftest-evidence': async (ctx) => (await import('./selftest-evidence.mjs')).checkSelftestEvidence(),
  'check:selftest-gate4': async (ctx) => (await import('./selftest-gate4.mjs')).checkSelftestGate4(),
};

// Runs one registry entry. A need the project does not meet makes the check not applicable: it says so in its notes and does not pass or fail anything.
export async function runEntry(e, ctx) {
  try { return await invoke(e, ctx); } catch (x) {
    // a record the project does not supply, or a policy overlay the standard refuses, is a finding about the project, not a crash of the engineering
    if (x instanceof MissingRecordError || x instanceof PolicyError || x instanceof FindingsError) return { problems: [x.message], notes: [] };
    throw x;
  }
}
async function invoke(e, ctx) {
  const unmet = unmetNeeds(e, project.manifest);
  if (unmet.length) return { problems: [], notes: [`not applicable to ${project.name}: it needs ${unmet.join(', ')}, which the project does not declare`], notApplicable: unmet };
  if (e.owner === 'core') {
    if (!CORE[e.id]) throw new Error(`${e.id} is in checks.json but has no runner in checks/runners.mjs`);
    return CORE[e.id](ctx);
  }
  const base = e.owner === 'industry' ? coreDir : project.root;
  const mod = await import(pathToFileURL(join(base, ...e.module.split('/'))).href);
  if (typeof mod[e.export] !== 'function') throw new Error(`${e.id}: ${e.module} exports no function ${e.export}`);
  return e.browser ? mod[e.export]({ browserName: ctx.browserName }) : mod[e.export]();
}

