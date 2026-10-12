// check:html. Every page the build produces is valid HTML5 and passes html-validate's recommended, document and accessibility rule sets
// (htmlvalidate.json), for the demonstration and for an indexable client build (which adds the JSON-LD block). Element nesting, attributes,
// duplicate ids, unclosed or misplaced tags, required alt text, labels, landmarks and ARIA usage are all covered by those rules. Any rule
// switched off must have a recorded reason. html-validate is a development tool; nothing of it is delivered.
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { HtmlValidate } from 'html-validate';
import { assembleCandidate, pagesOf } from '../lib/site.mjs';
import { buildClient, hasClientBuild } from '../lib/fixtures.mjs';
import { isMain, projectDir, readJson, standard } from '../lib/git.mjs';
import { reconcile } from '../lib/findings.mjs';

export async function validateHtml(files, label, cfg = readJson(standard('htmlvalidate.json'))) {
  const problems = [];
  for (const [rule, v] of Object.entries(cfg.rules)) if (v === 'off' && !cfg.disabled[rule]) problems.push(`rule ${rule} is switched off without a recorded reason`);
  const hv = new HtmlValidate({ extends: cfg.extends, rules: cfg.rules });
  let messages = 0;
  for (const [name, html] of files) {
    const r = await hv.validateString(html, name);
    for (const res of r.results) for (const m of res.messages) { messages++; problems.push(`${label} ${name}:${m.line}:${m.column} ${m.ruleId}: ${m.message}`); }
  }
  return { problems, count: files.length, messages };
}

// Rules switched off because they would need a visible change are still measured, so the known finding (F-G4-01) cannot go stale or get worse.
export async function probeTelWrapping(files) {
  const hv = new HtmlValidate({ root: true, extends: [], rules: { 'tel-non-breaking': 'error' } });
  let n = 0;
  for (const [name, html] of files) for (const res of (await hv.validateString(html, name)).results) n += res.messages.length;
  return n;
}

export async function checkHtml({ root = null } = {}) {
  const own = !root;
  const dir = root || assembleCandidate(projectDir, 'html');
  const cleanup = [];
  try {
    const cfg = readJson(standard('htmlvalidate.json'));
    const demo = await validateHtml(pagesOf(dir).map((f) => [f, readFileSync(join(dir, f), 'utf8')]), 'demonstration');
    const fx = hasClientBuild ? buildClient({}) : null;
    if (fx) cleanup.push(fx.root);
    const client = !fx ? { problems: [], count: 0 } : fx.status === 0 ? await validateHtml(pagesOf(fx.dir).map((f) => [f, readFileSync(join(fx.dir, f), 'utf8')]), 'client build') : { problems: [`the client fixture failed to build: ${fx.text.slice(0, 200)}`], count: 0 };
    const tel = await probeTelWrapping(pagesOf(dir).map((f) => [f, readFileSync(join(dir, f), 'utf8')]));
    const known = reconcile('html', tel ? [{ key: 'html:tel-non-breaking', detail: `${tel} phone number(s) can wrap across lines (html-validate tel-non-breaking)`, value: tel }] : []);
    return { problems: [...demo.problems, ...client.problems, ...known.problems], notes: [...known.notes, `${demo.count} demonstration pages and ${client.count} client-build pages pass html-validate (${cfg.extends.join(', ')}); ${Object.keys(cfg.disabled).length} rules switched off, each with a recorded reason`] };
  } finally { cleanup.forEach((d) => rmSync(d, { recursive: true, force: true })); if (own) rmSync(dir, { recursive: true, force: true }); }
}

if (isMain(import.meta.url)) {
  const t0 = Date.now();
  const { problems, notes } = await checkHtml();
  notes.forEach((n) => console.log('  ' + n));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:html (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  process.exit(problems.length ? 1 : 0);
}
