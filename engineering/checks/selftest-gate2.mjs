// check:selftest-gate2. Targeted negative tests for the Gate 2 checks: each case damages a COPY of the delivered site (or of the project
// sources, for the contract check) in a way a real mistake could, runs the relevant check, and requires it to report the right defect.
// Nothing in the working tree or the baseline is touched. A check that stops detecting its defect fails here.
// Options: --only <text> runs the cases whose name contains the text.
import { appendFileSync, cpSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { checkKeyboard } from './keyboard.mjs';
import { checkReflow } from './reflow.mjs';
import { checkForcedColors } from './forced-colors.mjs';
import { checkA11yTree } from './a11y-tree.mjs';
import { checkOrder } from './order.mjs';
import { checkBudgets } from './budgets.mjs';
import { checkMedia } from './media.mjs';
import { checkContracts } from './contracts.mjs';
import { flashStats, ffmpegAvailable } from '../lib/flash.mjs';
import { reconcile } from '../lib/findings.mjs';
import { assembleCandidate, pagesOf } from '../lib/site.mjs';
import { coreDir, project } from '../lib/project.mjs';
import { loadEntries } from '../lib/registry.mjs';
import { isMain, listFiles, projectDir, tempDir } from '../lib/git.mjs';
import { spawnSync } from 'node:child_process';

const edit = (file, fn) => writeFileSync(file, fn(readFileSync(file, 'utf8')));
// the project's own pages, stylesheet and media: the cases name a role, not a file
const PG = pagesOf(projectDir), pg = (i) => PG[Math.min(i, PG.length - 1)];
const CSSFILE = project.delivery.stylesheet;
const firstMedia = () => readdirSync(join(projectDir, 'media')).filter((f) => /\.webp$/.test(f)).sort()[0];
const OWN = project.root.startsWith(coreDir + sep);
const treeHash = (d) => { const h = createHash('sha256'); for (const f of listFiles(d)) { h.update(f); h.update(readFileSync(join(d, f))); } return h.digest('hex'); };
const css = (d, text) => appendFileSync(join(d, CSSFILE), `\n${text}\n`);
const html = (d, file, fn) => edit(join(d, file), fn);
const IDX = ['index.html'];
const HAS_CONTRACTS = loadEntries({ coreRoot: coreDir, manifest: project.manifest }).some((e) => e.id === 'check:contracts');   // the component contracts belong to the industry adapter that declares them

// [name, check kind, mutate(dir), run(dir) -> result, expected regex over the problem list]
const cases = [
  // ---- keyboard
  ['keyboard: a positive tabindex', (d) => html(d, 'index.html', (t) => t.replace(`<a href="${pg(1)}">`, `<a tabindex="5" href="${pg(1)}">`)), (d) => checkKeyboard({ root: d, pages: IDX }), /positive-tabindex|:order:/],
  ['keyboard: a link taken out of the tab order', (d) => html(d, 'index.html', (t) => t.replace('<a class="btn top-cta"', '<a tabindex="-1" class="btn top-cta"')), (d) => checkKeyboard({ root: d, pages: IDX }), /unreachable|tabindex/],
  ['keyboard: focus outlines removed', (d) => css(d, '*:focus,*:focus-visible{outline:0!important;box-shadow:none!important;background-image:none!important}\na:focus-visible,button:focus-visible{background:transparent!important;color:inherit!important;text-decoration:none!important;border-color:transparent!important;filter:none!important}'), (d) => checkKeyboard({ root: d, pages: IDX }), /focus-visible/],
  ['keyboard: a fixed panel covers the focused element', (d) => html(d, 'index.html', (t) => t.replace('</body>', '<div id="cover" style="position:fixed;left:0;right:0;bottom:0;height:300px;background:#000;z-index:9999"></div></body>')), (d) => checkKeyboard({ root: d, pages: IDX }), /obscured/],
  ['keyboard: the skip link removed', (d) => html(d, 'index.html', (t) => t.replace(/<a class="skip"[^>]*>[^<]*<\/a>\n/, '')), (d) => checkKeyboard({ root: d, pages: IDX }), /skip-link-first/],
  ['keyboard: primary buttons shrunk below 44 px', (d) => css(d, '.btn,.top-cta{min-height:0!important;height:30px!important;padding-block:0!important;line-height:30px!important}'), (d) => checkKeyboard({ root: d, pages: IDX }), /target-44/],
  // ---- reflow
  ['reflow: a fixed minimum width', (d) => css(d, 'body{min-width:900px}'), (d) => checkReflow({ root: d, pages: IDX }), /horizontal-scroll/],
  ['reflow: text clipped by fixed-height boxes', (d) => css(d, 'p{height:1.25em!important;overflow:hidden!important}'), (d) => checkReflow({ root: d, pages: IDX }), /clipped/],
  ['reflow: text pulled over other text', (d) => css(d, 'p,.lead{margin-top:-2.2em!important}'), (d) => checkReflow({ root: d, pages: IDX }), /text-overlap|overlap/],
  // ---- forced colours
  ['forced-colors: button text made invisible', (d) => css(d, '.btn{forced-color-adjust:none!important;background:#fff!important;color:#fff!important}'), (d) => checkForcedColors({ root: d, pages: IDX }), /text-(contrast|background)/],
  ['forced-colors: hero text left on the photograph', (d) => css(d, '.hero-text,.hero h1,.hero .eyebrow{forced-color-adjust:none!important;color:#f6f1e7!important}'), (d) => checkForcedColors({ root: d, pages: IDX }), /text-(contrast|background)/],
  ['forced-colors: the menu button draws nothing', (d) => css(d, '.nav-toggle{forced-color-adjust:none!important;background:transparent!important;color:transparent!important;border:0!important;box-shadow:none!important}\n.nav-toggle::before,.nav-toggle::after,.nav-toggle span::before,.nav-toggle span::after{display:none!important}'), (d) => checkForcedColors({ root: d, pages: IDX }), /control-invisible|text-contrast/],
  // ---- accessibility tree
  ['a11y-tree: an image loses its alt text', (d) => html(d, 'index.html', (t) => t.replace(/(<img[^>]*?) alt="[^"]+"/, '$1')), (d) => checkA11yTree({ root: d, pages: IDX }), /name-missing|alt/],
  ['a11y-tree: a heading level is skipped', (d) => html(d, 'index.html', (t) => t.replace('<h2>', '<h5>').replace(/(<h5>[^<]*)<\/h2>/, '$1</h5>')), (d) => checkA11yTree({ root: d, pages: IDX }), /heading-skip/],
  ['a11y-tree: <main> removed', (d) => html(d, 'index.html', (t) => t.replace(/<main id="main"[^>]*>/, '<div id="main">').replace('</main>', '</div>')), (d) => checkA11yTree({ root: d, pages: IDX }), /landmark-count:main|landmark-order/],
  ['a11y-tree: two navigations with the same name', (d) => html(d, 'index.html', (t) => t.replace('aria-label="Footer"', 'aria-label="Primary"')), (d) => checkA11yTree({ root: d, pages: IDX }), /navigation-unique/],
  ['a11y-tree: aria-labelledby points nowhere', (d) => html(d, 'index.html', (t) => t.replace('<section class="wrap" id="process">', '<section class="wrap" id="process" aria-labelledby="sig-title-x">')), (d) => checkA11yTree({ root: d, pages: IDX }), /aria-reference/],
  ['a11y-tree: a link with no name', (d) => html(d, 'index.html', (t) => t.replace('</main>', `<p><a href="${pg(1)}"></a></p></main>`)), (d) => checkA11yTree({ root: d, pages: IDX }), /name-missing/],
  // ---- reading order
  ['order: a column reversed with CSS', (d) => readFileSync(join(d, CSSFILE), 'utf8').includes('.cards') && css(d, '@media (min-width:960px){.cards{display:flex!important;flex-direction:column-reverse!important}}'), (d) => checkOrder({ root: d, pages: [pg(1)] }), new RegExp(`order:${pg(1).replace('.', '\\.')}@desktop`)],
  // ---- budgets
  ['budgets: 30 KB added to the stylesheet', (d) => appendFileSync(join(d, CSSFILE), `\n/* ${Buffer.from(Array.from({ length: 30000 }, (_, i) => (i * 7919 + (i >> 3) * 31) & 255)).toString('base64').slice(0, 30000)} */\n`), (d) => checkBudgets({ root: d, browser: false }), /stylesheet \(gzip\)|initial transfer|more than \d+% above|full page weight/],
  ['budgets: a 120 KB image', (d) => appendFileSync(join(d, 'media', firstMedia()), Buffer.alloc(120000, 7)), (d) => checkBudgets({ root: d, browser: false }), /largest image|delivered/],
  ['budgets: a third script', (d) => { writeFileSync(join(d, 'extra.js'), '/* x */'); html(d, pg(1), (t) => t.replace('</body>', '<script src="extra.js" defer></script></body>')); }, (d) => checkBudgets({ root: d, browser: false }), /scripts requested|more than \d+% above/],
  ['budgets: a large inline script', (d) => html(d, pg(3), (t) => t.replace('</head>', `<script>${'var a=0;'.repeat(5000)}</script></head>`)), (d) => checkBudgets({ root: d, browser: false }), /inline script bytes/],
  ['budgets: the main thread blocked at load', (d) => html(d, 'index.html', (t) => t.replace('<link rel="stylesheet" href="styles.css">', '<link rel="stylesheet" href="styles.css"><script>for(var t=Date.now();Date.now()-t<700;);</script>')), (d) => checkBudgets({ root: d, browser: true, pages: IDX }), /blocking time/],
  ['budgets: a slow click handler', (d) => html(d, 'index.html', (t) => t.replace('<link rel="stylesheet" href="styles.css">', '<link rel="stylesheet" href="styles.css"><script>document.addEventListener(\'click\',function(){for(var t=Date.now();Date.now()-t<700;);},true)</script>')), (d) => checkBudgets({ root: d, browser: true, pages: IDX }), /interaction handler time/],
  // ---- media
  ['media: a WebP that is not a WebP', (d) => { const f = join(d, 'media', firstMedia()); const b = readFileSync(f); b.write('XXXX', 0); writeFileSync(f, b); }, (d) => checkMedia({ root: d, browser: false }), /media:format/],
  ['media: alt text that is a file name', (d) => html(d, 'index.html', (t) => t.replace(/<img([^>]*) alt="[^"]*"/, '<img$1 alt="press-hero.webp"')), (d) => checkMedia({ root: d, browser: false }), /alt-filename|alt-short/],
  ['media: width and height that do not match the file', (d) => html(d, 'index.html', (t) => t.replace(/width="1200" height="675"/, 'width="1200" height="400"')), (d) => checkMedia({ root: d, browser: false }), /dimensions-ratio/],
  ['media: a media file without provenance', (d) => { writeFileSync(join(d, 'media', 'extra.webp'), readFileSync(join(d, 'media', firstMedia()))); }, (d) => checkMedia({ root: d, browser: false }), /orphan|provenance-row/],
  // ---- contracts (project sources)
  ['contracts: escaping removed from esc()', null, (d) => checkContracts({ root: d }), /hostile text became an element|esc:/, (d) => edit(join(d, 'src/lib/util.mjs'), (t) => t.replace(/export const esc = .*\n/, 'export const esc = (s) => String(s);\n'))],
  ['contracts: a frame without alt', null, (d) => checkContracts({ root: d }), /<img> without alt|alt/, (d) => edit(join(d, 'src/components/frame.mjs'), (t) => t.replace('alt="${esc(alt)}" ', ''))],
  ['contracts: a component without a contract', null, (d) => checkContracts({ root: d }), /has no contract/, (d) => appendFileSync(join(d, 'src/components/steps.mjs'), '\nexport function badge(x) { return `<b>${x}</b>`; }\n')],
  ['contracts: an extra parameter', null, (d) => checkContracts({ root: d }), /parameter/, (d) => edit(join(d, 'src/components/cta-band.mjs'), (t) => t.replace('secondary = null }) {', 'secondary = null }, third) {'))],
  ['contracts: a section labelled by an id that does not exist', null, (d) => checkContracts({ root: d }), /points at no id|labelledby/, (d) => edit(join(d, 'src/components/cta-band.mjs'), (t) => t.replace('aria-labelledby="${esc(id || \'cta\')}-title"', 'aria-labelledby="${esc(id || \'cta\')}-heading"'))],
  ['contracts: the owner note shown in a client build', null, (d) => checkContracts({ root: d }), /ownerNote/, (d) => edit(join(d, 'src/components/owner-note.mjs'), (t) => t.replace("if (!cfg.demo || cfg.live) return '';", "if (cfg.live) return '';"))],
  ['contracts: the skip link removed from the document', null, (d) => checkContracts({ root: d }), /skip link/, (d) => edit(join(d, 'src/components/document.mjs'), (t) => t.replace('<a class="skip" href="#main">Skip to content</a>\n', ''))],
  ['contracts: a script injected through a component', null, (d) => checkContracts({ root: d }), /inline <script>|event attribute/, (d) => edit(join(d, 'src/components/steps.mjs'), (t) => t.replace('<ol class="steps', '<ol onclick="x()" class="steps'))],
];

export async function checkSelftestGate2({ only = null } = {}) {
  const problems = [], notes = [];
  const cleanup = [];
  const t0 = Date.now();
  try {
    let n = 0;
    for (const [name, mutate, run, expect, mutateSrc] of cases) {
      if (only && !name.includes(only)) continue;
      if (name.startsWith('contracts:') && !HAS_CONTRACTS) continue;
      let dir;
      if (mutateSrc) { dir = tempDir('g2src'); cleanup.push(dir); cpSync(projectDir, dir, { recursive: true, filter: (s) => !/node_modules|[\\/]shots$|[\\/]\.reports|[\\/]\.lighthouseci|__pycache__/.test(s) }); mutateSrc(dir); }
      else {
        dir = assembleCandidate(projectDir, 'g2'); cleanup.push(dir);
        const before = treeHash(dir); mutate(dir);
        // These edits name the generic fixture's markup. On another project an edit may match nothing: that is reported, case by case, as not applicable (the project supplies its own
        // cases for its markup), and is a failure only on the fixture itself, where it would mean the fixture drifted from its cases.
        if (treeHash(dir) === before) { if (OWN) problems.push(`${name}: the edit changed nothing in the fixture, so the case would prove nothing`); else notes.push(`not applicable: ${name} (the edit matches nothing in ${project.name}'s markup)`); continue; }
      }
      let r;
      try { r = await run(dir); } catch (e) { r = { problems: [`check crashed: ${e.message}`] }; }
      n++;
      if (!r.problems.length) problems.push(`${name}: the check reported nothing; the defect went undetected`);
      else if (!expect.test(r.problems.join('\n'))) problems.push(`${name}: reported something else (${r.problems[0].slice(0, 140)}), expected ${expect}`);
      else notes.push(`caught: ${name}`);
    }
    if (!only) {
      // flashing: a synthetic strobe must be caught, the shipped loop must pass
      if (ffmpegAvailable()) {
        const d = tempDir('g2flash'); cleanup.push(d);
        const f = join(d, 'strobe.mp4');
        const r = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', "color=c=white:s=64x36:r=24:d=3,format=gray,geq=lum='255*lt(mod(N\\,4)\\,2)'", '-c:v', 'mpeg4', '-y', f]);
        if (r.status === 0) { n++; const st = flashStats(f); if (st.ok || st.maxPerSecond < 4) problems.push(`flash: a synthetic strobe was not caught (${JSON.stringify(st)})`); else notes.push(`caught: flash: a 6 Hz strobe (${st.maxPerSecond} reversals per second)`); }
        else notes.push('flash negative test skipped: ffmpeg could not synthesise a strobe');
      }
      // findings register: new, vanished and worse findings
      { n++;
        const known = [{ id: 'T-1', check: 'x', key: 'x:known', status: 'open', maxValue: 10 }, { id: 'T-2', check: 'x', key: 'x:gone', status: 'open' }];
        const r = reconcile('x', [{ key: 'x:known', detail: 'd', value: 12 }, { key: 'x:new', detail: 'n' }], known);
        const ok = r.problems.some((p) => /x:new/.test(p)) && r.problems.some((p) => /worse than the known finding T-1/.test(p)) && r.problems.some((p) => /T-2 no longer occurs/.test(p));
        if (!ok) problems.push(`findings register must fail on a new finding, a worse one and a vanished one (got ${JSON.stringify(r.problems)})`); else notes.push('caught: findings register: a new finding, a worse finding and a stale entry'); }
    }
    notes.push(`${n} targeted negative tests run in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  } finally { cleanup.forEach((d) => { try { rmSync(d, { recursive: true, force: true }); } catch { /* gone */ } }); }
  return { problems, notes };
}

if (isMain(import.meta.url)) {
  const i = process.argv.indexOf('--only');
  const { problems, notes } = await checkSelftestGate2({ only: i > -1 ? process.argv[i + 1] : null });
  notes.forEach((n) => console.log('  ' + n));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:selftest-gate2`);
  process.exit(problems.length ? 1 : 0);
}
