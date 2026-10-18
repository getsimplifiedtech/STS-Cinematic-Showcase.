// check:selftest-gate2. Targeted negative tests for the Gate 2 checks: each case damages a COPY of the delivered site (or of the project
// sources, for the contract check) in a way a real mistake could, runs the relevant check, and requires it to report the right defect.
// Nothing in the working tree or the baseline is touched. A check that stops detecting its defect fails here.
// Options: --only <text> runs the cases whose name contains the text.
import { appendFileSync, cpSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
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
import { hasRecord, record } from '../lib/project-records.mjs';
import { approvalsText, parseApprovals } from '../lib/approvals.mjs';
import { launchBrowser } from '../lib/browser.mjs';
import { serveSite } from '../lib/server.mjs';
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

// Which page the blocked-main-thread case runs on, and where it puts the stall. The stall must be visible to the project's own limit: a page whose blocking-time limit was raised by an approved
// exception (budgets.json exceptions.pages) cannot see a 700 ms stall, so the case runs on the first delivered page that keeps the shared limit and has a local script, and the loop is put at the
// top of that script (no inline script is added, so the inline-script limit and the script count are not involved). With no such page it falls back to an inline script on Home, as before.
const budgetExceptions = () => (hasRecord('budgets.json') ? record('budgets.json').exceptions?.pages ?? {} : {});
const localScriptOf = (dir, file) => { const m = /<script\b[^>]*\bsrc="([^"#?:]+\.js)"/.exec(readFileSync(join(dir, file), 'utf8')); return m && existsSync(join(dir, m[1])) ? m[1] : null; };
const STALL = 'for(var t=Date.now();Date.now()-t<700;);';
function stallTarget(dir) {
  const ex = budgetExceptions();
  for (const f of PG) if (!ex[f]?.limits?.blockingMs && localScriptOf(dir, f)) return { page: f, script: localScriptOf(dir, f) };
  return { page: 'index.html', script: null };
}
const stallMutate = (d) => { const t = stallTarget(d); if (t.script) edit(join(d, t.script), (x) => `${STALL}\n${x}`); else html(d, 'index.html', (x) => x.replace('<link rel="stylesheet" href="styles.css">', `<link rel="stylesheet" href="styles.css"><script>${STALL}</script>`)); };
const stallRun = (d) => checkBudgets({ root: d, browser: true, pages: [stallTarget(d).page] });

// ---- project-aware applicability (owner decision of 2026-10-18, Final Engineering Corrections). A generic case whose edit names the generic fixture's own markup can be declared not applicable by a
// project, in engineering/selftest-applicability.json, ONLY for a case that carries a `selectors` list below, and ONLY when every one of these holds (each failure is a problem, and the case then
// runs as usual): the case is named exactly; none of the selectors it names matches any element on the pages the case checks (measured in the browser, not claimed), so its edit is inert; the
// reason is written (40 characters or more) and names at least one of those selectors; the approval is in the approvals log; and the project's own same-named equivalent case, in a module of the
// project's own engineering folder, is run in this same run and must report no problem and `caught: <case>`. The generic fixture itself may never declare one.
export const APPLICABILITY_RECORD = 'selftest-applicability.json';
export const IS_REFERENCE = resolve(project.root) === resolve(coreDir, 'fixtures', 'generic');
export function applicabilityErrors(rec, { eligible, approvalIds, projectRoot, reference = false }) {
  const errors = [], entries = [];
  if (reference) return { errors: ['the generic fixture is the reference: it may not declare any generic case not applicable'], entries };
  if (!rec || typeof rec !== 'object' || Array.isArray(rec) || !Array.isArray(rec.entries)) return { errors: [`${APPLICABILITY_RECORD}: must be an object with an "entries" list`], entries };
  const extra = Object.keys(rec).filter((k) => !['$comment', 'entries'].includes(k));
  if (extra.length) errors.push(`${APPLICABILITY_RECORD}: unknown field(s) ${extra.join(', ')}`);
  const seen = new Set();
  rec.entries.forEach((e, i) => {
    const where = `${APPLICABILITY_RECORD} entry ${i + 1}${e && typeof e.case === 'string' ? ` (${e.case})` : ''}`;
    const bad = [];
    if (!e || typeof e !== 'object' || Array.isArray(e)) { errors.push(`${where}: must be an object`); return; }
    const unknown = Object.keys(e).filter((k) => !['case', 'reason', 'approval', 'equivalent'].includes(k));
    if (unknown.length) bad.push(`unknown field(s) ${unknown.join(', ')}`);
    if (typeof e.case !== 'string' || !eligible.has(e.case)) bad.push(`"case" must name, exactly, one of the generic cases that may be declared not applicable (${[...eligible.keys()].join('; ')})`);
    else if (seen.has(e.case)) bad.push('the case is declared twice'); else seen.add(e.case);
    const sels = eligible.get(e.case)?.selectors ?? [];
    if (typeof e.reason !== 'string' || e.reason.trim().length < 40) bad.push('"reason" is required: at least 40 characters saying what in the project\'s markup or behaviour is incompatible with the case');
    else if (sels.length && !sels.some((x) => e.reason.includes(x))) bad.push(`"reason" must name at least one of the selectors the case edits (${sels.join(', ')})`);
    if (typeof e.approval !== 'string' || !e.approval.trim()) bad.push('"approval" is required');
    else if (!approvalIds.includes(e.approval.trim())) bad.push(`approval "${e.approval}" is not in the approvals log`);
    const q = e.equivalent;
    if (!q || typeof q !== 'object' || Array.isArray(q)) bad.push('"equivalent" is required: { module, export, case } of the project\'s own same-named case');
    else {
      const qx = Object.keys(q).filter((k) => !['module', 'export', 'case'].includes(k));
      if (qx.length) bad.push(`equivalent: unknown field(s) ${qx.join(', ')}`);
      if (typeof q.module !== 'string' || !q.module.endsWith('.mjs') || isAbsolute(q.module) || q.module.includes('..') || q.module.includes('\\')) bad.push('equivalent.module must be a relative .mjs path inside the project');
      else {
        const abs = resolve(projectRoot, q.module), rel = relative(resolve(projectRoot, 'engineering'), abs);
        if (rel.startsWith('..') || isAbsolute(rel) || abs.startsWith(join(coreDir, 'checks') + sep)) bad.push('equivalent.module must be a file of the project\'s own engineering folder, not of the framework');
        else if (!existsSync(abs)) bad.push(`equivalent.module ${q.module} does not exist`);
      }
      if (typeof q.export !== 'string' || !q.export) bad.push('equivalent.export is required');
      if (q.case !== e.case) bad.push('equivalent.case must be the project\'s own case of the same name as the generic case it stands in for');
    }
    if (bad.length) errors.push(`${where}: ${bad.join('; ')}`); else entries.push(e);
  });
  return { errors, entries };
}
// Which of `selectors` match an element on any of `pages` of the assembled site (desktop and phone widths).
async function selectorsPresent(dir, pages, selectors) {
  const { browser } = await launchBrowser('chromium');
  const sv = serveSite(dir); const found = new Set();
  try {
    for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const ctx = await browser.newContext({ viewport: vp }); const page = await ctx.newPage();
      for (const f of pages) { await page.goto(sv.base + f); await page.waitForTimeout(800); for (const x of await page.evaluate((sels) => sels.filter((q) => document.querySelector(q)), selectors)) found.add(x); }
      await ctx.close();
    }
  } finally { await browser.close(); sv.close(); }
  return [...found];
}
// The project's own equivalent must run in this run and catch its defect.
async function equivalentCaught(root, e) {
  const q = e.equivalent;
  try {
    const mod = await import(pathToFileURL(resolve(root, q.module)).href);
    if (typeof mod[q.export] !== 'function') return `equivalent ${q.module}: no function "${q.export}" is exported`;
    const r = await mod[q.export]({ only: q.case });
    if (!r || !Array.isArray(r.problems) || !Array.isArray(r.notes)) return `equivalent ${q.module}: ${q.export} did not return { problems, notes }`;
    if (r.problems.length) return `the project's own equivalent of "${e.case}" reported a problem: ${String(r.problems[0]).slice(0, 220)}`;
    if (!r.notes.some((x) => x === `caught: ${q.case}`)) return `the project's own equivalent of "${e.case}" did not run and catch its defect (no "caught: ${q.case}" note)`;
    return null;
  } catch (err) { return `the project's own equivalent of "${e.case}" could not be run: ${String(err.message).split('\n')[0].slice(0, 200)}`; }
}
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
  ['forced-colors: hero text left on the photograph', (d) => css(d, '.hero-text,.hero h1,.hero .eyebrow{forced-color-adjust:none!important;color:#f6f1e7!important}'), (d) => checkForcedColors({ root: d, pages: IDX }), /text-(contrast|background)/, null, { selectors: ['.hero-text', '.hero h1', '.hero .eyebrow'] }],
  ['forced-colors: the menu button draws nothing', (d) => css(d, '.nav-toggle{forced-color-adjust:none!important;background:transparent!important;color:transparent!important;border:0!important;box-shadow:none!important}\n.nav-toggle::before,.nav-toggle::after,.nav-toggle span::before,.nav-toggle span::after{display:none!important}'), (d) => checkForcedColors({ root: d, pages: IDX }), /control-invisible|text-contrast|text-background/],
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
  ['budgets: the main thread blocked at load', stallMutate, stallRun, /blocking time/],
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
    // justified "not applicable" declarations of this project (see the comment at applicabilityErrors): honoured only when every condition holds; otherwise the case runs and the problem is reported
    const honoured = new Map();
    const eligible = new Map(cases.filter((c) => c[5]).map((c) => [c[0], c[5]]));
    if (hasRecord(APPLICABILITY_RECORD) && [...eligible.keys()].some((k) => !only || k.includes(only))) {
      let rec = null, ids = [];
      try { rec = record(APPLICABILITY_RECORD); } catch (e) { problems.push(`${APPLICABILITY_RECORD} cannot be read: ${e.message}`); }
      try { ids = parseApprovals(approvalsText()).map((r) => r.id); } catch { /* no approvals log: no approval can be found, and every entry says so */ }
      if (rec) {
        const v = applicabilityErrors(rec, { eligible, approvalIds: ids, projectRoot: project.root, reference: IS_REFERENCE });
        problems.push(...v.errors);
        if (v.entries.length) {
          const site = assembleCandidate(projectDir, 'g2-applicability'); cleanup.push(site);
          for (const e of v.entries) {
            if (only && !e.case.includes(only)) continue;
            const present = await selectorsPresent(site, IDX, eligible.get(e.case).selectors);
            if (present.length) { problems.push(`${APPLICABILITY_RECORD} (${e.case}): ${present.join(', ')} exist${present.length === 1 ? 's' : ''} on ${IDX.join(', ')}, so the case's edit is not inert here; it cannot be declared not applicable and it runs`); continue; }
            const why = await equivalentCaught(project.root, e);
            if (why) { problems.push(`${APPLICABILITY_RECORD} (${e.case}): ${why}; the case runs`); continue; }
            honoured.set(e.case, e);
          }
        }
      }
    }
    for (const [name, mutate, run, expect, mutateSrc] of cases) {
      if (only && !name.includes(only)) continue;
      if (name.startsWith('contracts:') && !HAS_CONTRACTS) continue;
      if (honoured.has(name)) { const e = honoured.get(name); notes.push(`not applicable, justified (${e.approval}): ${name}. None of ${eligible.get(name).selectors.join(', ')} exists on ${IDX.join(', ')}, so the edit is inert here. The project's own case "${e.equivalent.case}" (${e.equivalent.module}) ran in this run and caught its defect. Reason on record: ${e.reason.trim()}`); continue; }
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
    notes.push(`${n} targeted negative tests run in ${((Date.now() - t0) / 1000).toFixed(0)} s${honoured.size ? `; ${honoured.size} justified not applicable (each listed above with its project-owned equivalent, which ran and caught its defect), not counted as run` : ''}`);
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
