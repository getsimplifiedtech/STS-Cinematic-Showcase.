// check:supports (APR-JE-029, finding F-G5-04). The approved correction for the WebKit text-spacing overlap in the Visit hours table is a single
//   @supports (hanging-punctuation:first) { .hours th { white-space: normal; min-width: max-content } }
// rule. It is meant to apply ONLY in engines that support hanging-punctuation (WebKit). This check keeps that true over time, in every engine:
//   probe     CSS.supports('hanging-punctuation', 'first') in the running engine equals the recorded expectation (engine-features.json)
//   effect    the rule applies exactly where the probe is true: .hours th is white-space:normal with min-width:max-content there, and keeps the original
//             white-space:nowrap everywhere else (so the normal rendering of Chromium and Firefox cannot change unnoticed)
//   present   the rule is in the delivered stylesheet, byte for byte
// If an engine changes its answer (a new browser build, a new Playwright pin) the check fails and says what now applies where.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { withSite } from '../lib/runtime.mjs';
import { engDir, isMain, readJson } from '../lib/git.mjs';

export async function checkSupports({ root = null, browserName = 'chromium', features = readJson(join(engDir, 'engine-features.json')).features } = {}) {
  const problems = [], notes = [];
  await withSite(async ({ newPage, root: dir, version }) => {
    const css = readFileSync(join(dir, 'styles.css'), 'utf8');
    for (const f of features) {
      const tag = `${f.id} in ${browserName} ${version}`;
      if (!css.includes(f.rule)) problems.push(`${f.id}: the approved rule is missing from the delivered styles.css (${f.rule})`);
      const want = f.expected[browserName];
      if (want === undefined) { problems.push(`${tag}: no expectation is recorded for ${browserName} in engine-features.json`); continue; }
      const { page, close } = await newPage({ viewport: { width: 1440, height: 900 } }, f.appliesTo.page);
      const r = await page.evaluate(({ p, v, sel }) => { const th = document.querySelector(sel); const cs = getComputedStyle(th); return { supported: CSS.supports(p, v), whiteSpace: cs.whiteSpace, minWidth: cs.minWidth, textWrapMode: cs.getPropertyValue('text-wrap-mode') }; }, { p: f.probe.property, v: f.probe.value, sel: f.appliesTo.selector });
      await close();
      if (r.supported !== want) problems.push(`${tag}: CSS.supports(${f.probe.property}, ${f.probe.value}) is ${r.supported} but ${want} is recorded: the approved rule now ${r.supported ? 'APPLIES in' : 'STOPS applying in'} this engine. Review the F-G5-04 correction and the normal-appearance comparison against v0.8, then update engine-features.json`);
      const wraps = r.whiteSpace !== 'nowrap';
      if (wraps !== r.supported) problems.push(`${tag}: ${f.appliesTo.selector} has white-space ${r.whiteSpace} (min-width ${r.minWidth}) but the probe says the rule ${r.supported ? 'applies' : 'does not apply'}`);
      else if (r.supported && !/max-content/.test(r.minWidth)) problems.push(`${tag}: the rule applies but min-width is ${r.minWidth}, not max-content`);
      else notes.push(`${tag}: the rule ${r.supported ? `applies (white-space ${r.whiteSpace}, min-width ${r.minWidth})` : 'does not apply (white-space nowrap, as in v0.8)'}`);
    }
  }, { root, browserName, pages: ['visit-us.html'] });
  return { problems, notes };
}

if (isMain(import.meta.url)) {
  const t0 = Date.now();
  const { problems, notes } = await checkSupports({ browserName: process.argv.includes('--engine') ? process.argv[process.argv.indexOf('--engine') + 1] : 'chromium' });
  notes.forEach((n) => console.log('  ' + n));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:supports (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  process.exit(problems.length ? 1 : 0);
}
