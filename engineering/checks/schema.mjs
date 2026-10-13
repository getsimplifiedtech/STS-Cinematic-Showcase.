// check:schema. The configuration schemas are valid, the configuration fits them, and the build refuses what they forbid.
//   1. each schema is valid JSON Schema (Ajv, strict mode) and uses only keywords the build's dependency-free validator supports
//   2. the real configuration passes both validators
//   3. a corpus of broken and acceptable edits gets the same verdict from both validators (so the small validator cannot silently under-check)
//   4. the build fails with a path-qualified message and writes nothing when a file breaks its schema
// Ajv is a development tool; the build itself does not need it. Run: node engineering/checks/schema.mjs
import Ajv from 'ajv/dist/2020.js';
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { CONFIG_FILES, loadSchema } from '../lib/config-schema.mjs';
import { validateSchema } from '../lib/schema.mjs';
import { isMain, projectDir, readJson, tempDir } from '../lib/git.mjs';

const clone = (o) => JSON.parse(JSON.stringify(o));

// [name, file, edit(data), expectedValid]. Every entry is a realistic mistake (or a legitimate variation) in a client's configuration.
const CORPUS = [
  ['typo in a key (brand.nmae)', 'client', (d) => { d.brand.nmae = 'x'; }, false],
  ['missing brand.name', 'client', (d) => { delete d.brand.name; }, false],
  ['phone as a number', 'client', (d) => { d.contact.phone.display = 5550100188; }, false],
  ['phone href without tel:', 'client', (d) => { d.contact.phone.href = '555'; }, false],
  ['http ordering URL', 'client', (d) => { d.ordering.url = 'http://insecure.example.com'; }, false],
  ['https ordering URL', 'client', (d) => { d.ordering.url = 'https://order.example.test/jade'; }, true],
  ['headerCta not allowed', 'client', (d) => { d.ordering.headerCta = 'popup'; }, false],
  ['noindex as a string', 'client', (d) => { d.seo.noindex = 'true'; }, false],
  ['theme colour without #', 'client', (d) => { d.seo.themeColor = '12302a'; }, false],
  ['flags.demo missing', 'client', (d) => { delete d.flags.demo; }, false],
  ['unknown top-level section', 'client', (d) => { d.analytics = { id: 'G-1' }; }, false],
  ['hours with no rows', 'client', (d) => { d.hours.rows = []; }, false],
  ['seal with three characters', 'client', (d) => { d.brand.seal = ['a', 'b', 'c']; }, false],
  ['email set to a valid address', 'client', (d) => { d.contact.email = 'hello@jade.example.test'; }, true],
  ['heat 7', 'menu', (d) => { d.categories[0].items[0].heat = 7; }, false],
  ['price as text', 'menu', (d) => { d.categories[0].items[0].price = '12'; }, false],
  ['price zero', 'menu', (d) => { d.categories[0].items[0].price = 0; }, false],
  ['category id with capitals', 'menu', (d) => { d.categories[0].id = 'Starters'; }, false],
  ['dish with no name', 'menu', (d) => { delete d.categories[0].items[0].name; }, false],
  ['signature image outside media/', 'menu', (d) => { d.categories[3].items[0].signature.image = '../x.webp'; }, false],
  ['signature alt text too short', 'menu', (d) => { d.categories[3].items[0].signature.alt = 'x'; }, false],
  ['signature removed from a dish', 'menu', (d) => { for (const c of d.categories) for (const i of c.items) if (i.signature) { delete i.signature; return; } }, true],
  ['unknown dish property', 'menu', (d) => { d.categories[0].items[0].calories = 400; }, false],
  ['four pages', 'site', (d) => { d.pages.pop(); }, false],
  ['unknown page id', 'site', (d) => { d.pages[0].id = 'blog'; }, false],
  ['page file with a path', 'site', (d) => { d.pages[1].file = 'a/menu.html'; }, false],
  ['credit link not https', 'site', (d) => { d.credit.href = 'http://x.test'; }, false],
  ['demo text emptied for a client build', 'site', (d) => { for (const k of Object.keys(d.demo)) d.demo[k] = ''; }, true],
  ['demo.stamp removed', 'site', (d) => { delete d.demo.stamp; }, false],
  ['hero headline with one line', 'copy', (d) => { d.home.hero.headline = ['One line']; }, false],
  ['hero image width as text', 'copy', (d) => { d.home.hero.image.width = '1920'; }, false],
  ['hero focus without percent', 'copy', (d) => { d.home.hero.image.focusDesktop = '56 50'; }, false],
  ['hero image outside media/', 'copy', (d) => { d.home.hero.image.desktop = 'https://x.test/a.webp'; }, false],
  ['hero alt too short', 'copy', (d) => { d.home.hero.image.alt = 'wok'; }, false],
  ['meta description too short', 'copy', (d) => { d.menu.meta.description = 'short'; }, false],
  ['link to an unknown page', 'copy', (d) => { d.home.hero.primaryCta.page = 'blog'; }, false],
  ['only two story chapters', 'copy', (d) => { d.story.chapters.length = 2; }, false],
  ['story chapter without paragraphs', 'copy', (d) => { d.story.chapters[0].paragraphs = []; }, false],
  ['five order steps', 'copy', (d) => { d.order.steps.push({ name: 'a', text: 'b' }, { name: 'c', text: 'd' }); }, false],
  ['order step link removed', 'copy', (d) => { delete d.order.steps[0].link; }, true],
  ['typo in a nested key (orderBand.headng)', 'copy', (d) => { d.menu.orderBand.headng = 'x'; }, false],
  ['decorative band as a string', 'copy', (d) => { d.menu.band.decorative = 'yes'; }, false],
  ['empty heading', 'copy', (d) => { d.visit.h1 = ''; }, false],
];

export function checkSchema() {
  const problems = [], notes = [];
  const ajv = new Ajv({ strict: true, allErrors: true });
  const schemas = {};
  for (const name of CONFIG_FILES) {
    schemas[name] = loadSchema(name);
    try { ajv.validateSchema(schemas[name], true); } catch (e) { problems.push(`${name}.schema.json is not a valid JSON Schema: ${e.message}`); }
    try { ajv.addSchema(schemas[name], name); } catch (e) { problems.push(`${name}.schema.json cannot be compiled by Ajv: ${e.message}`); }
  }
  if (problems.length) return { problems, notes };
  notes.push(`${CONFIG_FILES.length} schemas are valid JSON Schema 2020-12 (Ajv strict mode)`);

  const verdict = (name, data) => {
    let ours;
    try { ours = validateSchema(data, schemas[name], name).length === 0; } catch (e) { problems.push(`build validator rejected schema ${name}: ${e.message}`); ours = null; }
    return { ours, ajv: ajv.getSchema(name)(data) === true };
  };

  // 2. the real configuration
  const real = Object.fromEntries(CONFIG_FILES.map((n) => [n, readJson(join(projectDir, 'config', `${n}.json`))]));
  for (const n of CONFIG_FILES) {
    const v = verdict(n, real[n]);
    if (!v.ours || !v.ajv) problems.push(`config/${n}.json should be valid (build validator ${v.ours}, Ajv ${v.ajv})`);
  }
  notes.push('config/*.json valid under both validators');

  // 3. the corpus
  let agree = 0;
  for (const [name, file, edit, expectValid] of CORPUS) {
    const d = clone(real[file]); edit(d);
    const v = verdict(file, d);
    if (v.ours !== v.ajv) problems.push(`validators disagree on "${name}": build validator ${v.ours}, Ajv ${v.ajv}`);
    else if (v.ours !== expectValid) problems.push(`"${name}" should be ${expectValid ? 'accepted' : 'rejected'} but was ${v.ours ? 'accepted' : 'rejected'}`);
    else agree++;
  }
  notes.push(`${agree}/${CORPUS.length} corpus cases: both validators agree and match the expected verdict`);

  // 4. the build refuses broken files and writes nothing
  const tmp = tempDir('schema');
  try {
    const cfgDir = join(tmp, 'config'), out = join(tmp, 'out');
    cpSync(join(projectDir, 'config'), cfgDir, { recursive: true });
    cpSync(join(projectDir, 'config'), join(tmp, 'noop'), { recursive: true });
    const bad = clone(real.client); bad.brand.nmae = 'x'; bad.flags.demo = 'yes';
    writeFileSync(join(cfgDir, 'client.json'), JSON.stringify(bad, null, 2));
    writeFileSync(join(cfgDir, 'menu.json'), '{ not json');
    cpSync(join(tmp, 'noop'), out, { recursive: true }); for (const f of readdirSync(out)) rmSync(join(out, f), { recursive: true });
    const r = spawnSync(process.execPath, [join(projectDir, 'build.mjs'), '--config', cfgDir, '--out', out], { encoding: 'utf8' });
    const text = r.stdout + r.stderr;
    if (r.status === 0) problems.push('the build accepted configuration that breaks its schema');
    if (!/client\.brand: unknown property "nmae"/.test(text)) problems.push(`build message should name client.brand "nmae": ${text.slice(0, 200)}`);
    if (!/client\.flags\.demo: expected boolean, got string/.test(text)) problems.push('build message should report client.flags.demo as the wrong type');
    if (!/config\/menu\.json: cannot be read as JSON/.test(text)) problems.push('build message should report invalid JSON in config/menu.json');
    if (existsSync(out) && readdirSync(out).length) problems.push('the build wrote files although the configuration was invalid');
    else notes.push('the build rejects broken configuration with path-qualified messages and writes nothing');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  return { problems, notes };
}

if (isMain(import.meta.url)) {
  const { problems, notes } = checkSchema();
  notes.forEach((n) => console.log('  ' + n));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:schema`);
  process.exit(problems.length ? 1 : 0);
}
