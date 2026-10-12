// Binds each check of the base engineering to the function that runs it (G6-5, APR-JE-046). WHICH checks exist, in what order, in which engines and what each needs
// is the registry's business (checks.json, lib/registry.mjs): this file only knows how to call them. An entry that comes from an industry adapter or from the project
// manifest is imported where it says it lives, so a project adds a check without this file changing.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { coreDir, project } from '../lib/project.mjs';
import { unmetNeeds } from '../lib/registry.mjs';

import { checkBaseline } from './baseline.mjs';
import { checkDeterminism } from './determinism.mjs';
import { checkAuthority } from './authority.mjs';
import { checkDelivery } from './delivery.mjs';
import { checkMedia } from './media.mjs';
import { checkBudgets } from './budgets.mjs';
import { checkKeyboard } from './keyboard.mjs';
import { checkReflow } from './reflow.mjs';
import { checkForcedColors } from './forced-colors.mjs';
import { checkA11yTree } from './a11y-tree.mjs';
import { checkOrder } from './order.mjs';
import { checkSelftestGate2 } from './selftest-gate2.mjs';
import { checkSecurity } from './security.mjs';
import { checkPrivacy } from './privacy.mjs';
import { checkDeps } from './deps.mjs';
import { checkSecrets } from './secrets.mjs';
import { checkTokens } from './tokens.mjs';
import { checkAssets } from './assets.mjs';
import { checkPortability } from './portability.mjs';
import { checkCi } from './ci.mjs';
import { checkHtml } from './html.mjs';
import { checkLinks } from './links.mjs';
import { checkSeo } from './seo.mjs';
import { checkRelease } from './release.mjs';
import { checkReleaseDryRun } from './release-dryrun.mjs';
import { checkHosting } from './hosting.mjs';
import { checkSelftestGate4 } from './selftest-gate4.mjs';
import { checkPhone } from './phone.mjs';
import { checkEvidence } from './evidence.mjs';
import { checkSelftestEvidence } from './selftest-evidence.mjs';
import { checkSelftestGate5 } from './selftest-gate5.mjs';
import { checkSelftestGate6 } from './selftest-gate6.mjs';
import { checkSelftestGate3 } from './selftest-gate3.mjs';
import { checkRegression } from './regression.mjs';
import { checkSelftest } from './selftest.mjs';

// ctx: { fast, browserName, strictEnv, framework }
export const CORE = {
  'check:baseline': (ctx) => checkBaseline(),
  'check:determinism': (ctx) => checkDeterminism(),
  'check:delivery': (ctx) => checkDelivery(),
  'check:authority': (ctx) => checkAuthority({ framework: ctx.framework }),
  'check:media': (ctx) => checkMedia({ browser: !ctx.fast, browserName: ctx.browserName }),
  'check:tokens': (ctx) => checkTokens(),
  'check:secrets': (ctx) => checkSecrets(),
  'check:deps': (ctx) => checkDeps(),
  'check:ci': (ctx) => checkCi(),
  'check:html': (ctx) => checkHtml(),
  'check:links': (ctx) => checkLinks(),
  'check:seo': (ctx) => checkSeo({ browser: !ctx.fast, browserName: ctx.browserName }),
  'check:release': (ctx) => checkRelease(),
  'check:evidence': (ctx) => checkEvidence(),
  'check:hosting': (ctx) => checkHosting(),
  'check:privacy': (ctx) => checkPrivacy({ browser: !ctx.fast, browserName: ctx.browserName }),
  'check:security': (ctx) => checkSecurity({ browser: !ctx.fast, browserName: ctx.browserName }),
  'check:assets': (ctx) => checkAssets({ browser: !ctx.fast, browserName: ctx.browserName }),
  'check:budgets': (ctx) => checkBudgets({ browser: !ctx.fast, browserName: ctx.browserName }),
  'check:keyboard': (ctx) => checkKeyboard({ browserName: ctx.browserName }),
  'check:reflow': (ctx) => checkReflow({ browserName: ctx.browserName }),
  'check:forced-colors': (ctx) => checkForcedColors({ browserName: ctx.browserName }),
  'check:a11y-tree': (ctx) => checkA11yTree({ browserName: ctx.browserName }),
  'check:order': (ctx) => checkOrder({ browserName: ctx.browserName }),
  'check:phone': (ctx) => checkPhone({ browserName: ctx.browserName }),
  'check:portability': (ctx) => checkPortability({ browserName: ctx.browserName }),
  'check:release-dryrun': (ctx) => checkReleaseDryRun(),
  'check:regression': (ctx) => checkRegression({ browserName: ctx.browserName, strictEnv: ctx.strictEnv }),
  'check:selftest': (ctx) => checkSelftest(),
  'check:selftest-gate2': (ctx) => checkSelftestGate2(),
  'check:selftest-gate3': (ctx) => checkSelftestGate3(),
  'check:selftest-gate5': (ctx) => checkSelftestGate5(),
  'check:selftest-gate6': (ctx) => checkSelftestGate6(),
  'check:selftest-evidence': (ctx) => checkSelftestEvidence(),
  'check:selftest-gate4': (ctx) => checkSelftestGate4(),
};

// Runs one registry entry. A need the project does not meet makes the check not applicable: it says so in its notes and does not pass or fail anything.
export async function runEntry(e, ctx) {
  const unmet = unmetNeeds(e, project.manifest);
  if (unmet.length) return { problems: [], notes: [`not applicable to ${project.name}: it needs ${unmet.join(', ')}, which the project does not declare`] };
  if (e.owner === 'core') {
    if (!CORE[e.id]) throw new Error(`${e.id} is in checks.json but has no runner in checks/runners.mjs`);
    return CORE[e.id](ctx);
  }
  const base = e.owner === 'industry' ? coreDir : project.root;
  const mod = await import(pathToFileURL(join(base, ...e.module.split('/'))).href);
  if (typeof mod[e.export] !== 'function') throw new Error(`${e.id}: ${e.module} exports no function ${e.export}`);
  return e.browser ? mod[e.export]({ browserName: ctx.browserName }) : mod[e.export]();
}

