// check:contracts (WP4, ENG-070 component tier). Runs every shared component and page renderer against contracts/components.json:
//   interface   every exported function has a contract, every contract has a function, the number of parameters matches
//   rendering   the guarantees listed in the contract (root element, required markup) and the common guarantees: balanced tags, no scripts or
//               event handlers, inline styles limited to declared custom properties, ids unique, ARIA references resolve, images have alt and
//               size, new-tab links are safe
//   escaping    hostile text injected into every declared input ends up escaped, never as markup
//   purity      deterministic; frozen input is accepted (nothing is modified)
//   behaviour   conditional output (owner note), the order link target, demonstration text only when the demo flag is on, page renderers
//               return one h1 and exactly the scripts they own
// Pure Node, no browser: it imports the components and calls them. No component is changed by this check.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig } from '../../src/lib/config.mjs';
import { tokenize } from '../lib/html.mjs';
import { engDir, isMain, projectDir, readJson } from '../lib/git.mjs';

const PAYLOAD = `"><img src=x onerror=alert(1)>&'`;
const clone = (o) => structuredClone(o);
const deepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };
const setPath = (obj, path, value) => { const keys = path.split('.'); let o = obj; for (const k of keys.slice(0, -1)) o = o[k]; if (!(keys.at(-1) in o)) throw new Error(`contract path "${path}" does not exist in the fixture`); o[keys.at(-1)] = value; };

// Generic guarantees over one HTML string. Returns a list of problems.
export function commonChecks(html, { inlineStyles = [], where = '' } = {}) {
  const out = [], { tags, errors } = tokenize(html);
  errors.forEach((e) => out.push(`${where}${e}`));
  const ids = new Set();
  for (const t of tags) {
    if (t.close) continue;
    if (t.name === 'script' && !t.attrs.src) out.push(`${where}inline <script>`);
    for (const a of Object.keys(t.attrs)) if (/^on/.test(a)) out.push(`${where}<${t.name}> has the event attribute ${a}`);
    for (const a of ['href', 'src']) if (/^\s*javascript:/i.test(t.attrs[a] || '')) out.push(`${where}<${t.name}> has a javascript: ${a}`);
    if (t.attrs.style !== undefined) { const props = [...t.attrs.style.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]); const other = t.attrs.style.replace(/--[a-z0-9-]+\s*:[^;]*;?/gi, '').trim(); if (other || props.some((p) => !inlineStyles.includes(p))) out.push(`${where}<${t.name}> has an inline style beyond the declared properties (${inlineStyles.join(', ') || 'none'}): ${t.attrs.style.slice(0, 40)}`); }
    if (t.attrs.id !== undefined) { if (ids.has(t.attrs.id)) out.push(`${where}duplicate id "${t.attrs.id}"`); ids.add(t.attrs.id); }
    if (t.name === 'img') for (const a of ['alt', 'width', 'height']) if (t.attrs[a] === undefined) out.push(`${where}<img> without ${a}`);
    if (t.name === 'a' && t.attrs.target === '_blank' && !/noopener/.test(t.attrs.rel || '') ) out.push(`${where}a target=_blank link without rel=noopener noreferrer`);
    if (t.name === 'a' && t.attrs.target === '_blank' && !/noreferrer/.test(t.attrs.rel || '')) out.push(`${where}a target=_blank link without noreferrer`);
  }
  for (const t of tags) if (!t.close) for (const a of ['aria-labelledby', 'aria-controls']) for (const ref of (t.attrs[a] || '').split(/\s+/).filter(Boolean)) if (!ids.has(ref) && !html.includes(`id="${ref}"`)) out.push(`${where}${a}="${ref}" points at no id in this markup`);
  return out;
}

const hostile = (html) => {
  const out = [];
  if (html.includes('<img src=x')) out.push('hostile text became an element');
  if (!html.includes('&lt;img src=x')) out.push('hostile text did not appear escaped');
  if (!html.includes('&amp;')) out.push('an ampersand was not escaped');
  if (tokenize(html).tags.some((t) => !t.close && Object.keys(t.attrs).some((a) => /^on/.test(a)))) out.push('hostile text created an event attribute');
  return out;
};

export async function checkContracts({ root = projectDir } = {}) {
  const spec = readJson(join(engDir, 'contracts', 'components.json'));
  const problems = [], notes = [];
  const fail = (m) => problems.push(m);
  const load = (rel) => import(pathToFileURL(join(root, rel)).href);
  const cfg0 = loadConfig(root);
  const cfg = (patch) => { const c = clone(cfg0); patch?.(c); return c; };
  let assertions = 0;

  // ---- interface: exports against contracts
  const mods = {};
  for (const [name, c] of Object.entries(spec.components)) {
    mods[c.module] ??= await load(c.module);
    const fn = mods[c.module][name];
    assertions++;
    if (typeof fn !== 'function') { fail(`${name}: ${c.module} does not export a function "${name}"`); continue; }
    if (fn.length !== c.arity) fail(`${name}: has ${fn.length} parameter(s) before defaults; the contract says ${c.arity}`);
  }
  const files = [...readdirSync(join(root, 'src', 'components')).map((f) => `src/components/${f}`), 'src/lib/util.mjs'].filter((f) => f.endsWith('.mjs'));
  for (const f of files) {
    mods[f] ??= await load(f);
    for (const [k, v] of Object.entries(mods[f])) if (typeof v === 'function' && !spec.components[k]) fail(`${f} exports "${k}", which has no contract in contracts/components.json`);
    for (const [k, c] of Object.entries(spec.components)) assertions += 0 * (k === c.module ? 1 : 0);
  }
  for (const [name, c] of Object.entries(spec.components)) if (!files.includes(c.module)) fail(`${name}: contract names ${c.module}, which is not a component file`);

  const E = (n) => mods[spec.components[n].module][n];

  // ---- fixtures: how to call each fragment component. obj is cloned and edited for each hostile-input test.
  const sig = clone(cfg0.signature[0]);
  const F = {
    orderLink: { obj: () => ({ cfg: cfg0, cls: 'btn btn-ember' }), call: (o) => E('orderLink')(o.cfg, o.cls), skipClone: ['cfg'] },
    sealMark: { obj: () => cfg(), call: (c) => E('sealMark')(c) },
    frame: { obj: () => ({ src: 'media/x.webp', alt: 'A bowl of noodles on a dark table', width: 1200, height: 800, pos: '50% 60%', cls: '' }), call: (o) => E('frame')(o), variants: [(o) => E('frame')({ ...o, priority: true, loading: 'eager' })] },
    hours: { obj: () => cfg((c) => { c.demo = true; }), call: (c) => E('hours')(c, { variant: 'table' }), variants: [(c) => E('hours')(c, { variant: 'compact' })] },
    menuCategory: { obj: () => cfg().menu.categories[0], call: (o) => E('menuCategory')(o) },
    dish: { obj: () => clone(sig), call: (o) => E('dish')(o, { textFirst: false, index: 0 }), variants: [(o) => E('dish')(o, { textFirst: true, index: 1 })] },
    steps: { obj: () => [{ name: 'Choose', text: 'Pick dishes.', link: { href: 'menu.html', label: 'See the menu' } }, { name: 'Pay', text: 'On the platform.' }], call: (o) => E('steps')(o), variants: [(o) => E('steps')(o, { cls: 'wide' })] },
    ctaBand: { obj: () => ({ heading: 'Taste the fire.', text: 'Start with the menu.', tone: 'pine', id: 'order', secondary: { page: 'menu', label: 'See the menu' } }), call: (o) => E('ctaBand')(cfg0, o), variants: [(o) => E('ctaBand')(cfg0, { heading: o.heading, text: o.text })] },
    ownerNote: { obj: () => cfg((c) => { c.demo = true; c.live = false; }), call: (c) => E('ownerNote')(c) },
  };
  // the dish heat dots need a heat level to render; ensure the fixture has one
  if (!F.dish.obj().heat) F.dish.obj = () => ({ ...clone(sig), heat: 2 });

  for (const [name, f] of Object.entries(F)) {
    const c = spec.components[name], where = `${name}: `;
    let out;
    try { out = f.call(f.obj()); } catch (e) { fail(`${where}threw on valid input: ${e.message}`); continue; }
    assertions++;
    if (typeof out !== 'string') { fail(`${where}must return a string`); continue; }
    const outs = [out, ...(f.variants || []).map((v) => v(f.obj()))];
    for (const o of outs) { problems.push(...commonChecks(o, { inlineStyles: c.inlineStyles || [], where })); assertions++; }
    // root element
    const tags = tokenize(out).tags;
    const roots = tags.filter((t) => !t.close && t.depth === 0);
    if (roots.length !== 1 || roots[0].name !== c.root) fail(`${where}must render exactly one <${c.root}> root (found ${roots.map((r) => r.name).join(', ') || 'nothing'})`);
    for (const req of c.requires || []) { assertions++; if (!out.includes(req)) fail(`${where}output must contain ${req}`); }
    // escaping
    for (const path of c.escapes || []) {
      assertions++;
      const o = f.obj();
      try { setPath(o, path, PAYLOAD); } catch (e) { fail(`${where}${e.message}`); continue; }
      let h; try { h = f.call(o); } catch (e) { fail(`${where}threw on hostile text in ${path}: ${e.message}`); continue; }
      hostile(h).forEach((m) => fail(`${where}input "${path}": ${m}`));
    }
    // purity
    const a = f.call(f.obj()), b = f.call(f.obj());
    assertions += 2;
    if (a !== b) fail(`${where}is not deterministic`);
    try { f.call(deepFreeze(f.obj())); } catch (e) { fail(`${where}modifies its input (${e.message})`); }
  }

  // ---- behaviour that is not just markup
  const eq = (cond, msg) => { assertions++; if (!cond) fail(msg); };
  const o = (c) => E('ownerNote')(c);
  eq(o(cfg((c) => { c.demo = true; c.live = false; })).includes('owner-title'), 'ownerNote: must render in the demonstration with the example ordering button');
  eq(o(cfg((c) => { c.demo = false; c.live = false; })) === '', 'ownerNote: must be empty when the demonstration flag is off');
  eq(o(cfg((c) => { c.demo = true; c.live = true; })) === '', 'ownerNote: must be empty when the ordering URL is live');
  eq(E('hours')(cfg((c) => { c.demo = false; })).includes('(sample)') === false, 'hours: the "(sample)" caption belongs to the demonstration only');
  eq(E('esc')('<a href="x">&') === '&lt;a href=&quot;x&quot;&gt;&amp;', 'esc: must escape & < > and double quotes');
  eq(E('money')(18) === '$18' && E('money')('<b>') === '$&lt;b&gt;', 'money: must prefix $ and escape');
  eq(E('heat')(0) === '' && /role="img" aria-label="Heat 2 of 3"/.test(E('heat')(2)) && (E('heat')(3).match(/<i class="on">/g) || []).length === 3, 'heat: 0 is empty; n renders a labelled image with n lit dots');
  eq(E('pageHref')(cfg0, 'menu') === 'menu.html', 'pageHref: must return the page file');
  eq(((() => { try { E('pageHref')(cfg0, 'nope'); return false; } catch { return true; } })()), 'pageHref: must throw for an unknown page id (never write "undefined" into a link)');
  eq(E('ctaPage')(cfg0).id === 'order', 'ctaPage: must return the one page flagged cta');
  const live = cfg((c) => { c.live = true; c.client.ordering.url = 'https://order.example.test/x'; c.client.ordering.headerCta = 'direct'; });
  eq(E('orderTarget')(live, { direct: true }).attrs.includes('noopener noreferrer') && E('orderTarget')(live, { direct: true }).href.startsWith('https://'), 'orderTarget: a live URL, when asked directly, opens in a new tab safely');
  eq(E('orderTarget')(live).href === 'order-online.html' && E('orderTarget')(cfg0, { direct: true }).href === 'order-online.html', 'orderTarget: otherwise the Order page');
  eq(/^<a class="x" href="https:\/\/order\.example\.test\/x" target="_blank" rel="noopener noreferrer">/.test(E('orderLink')(live, 'x', { direct: true })), 'orderLink: the live direct link must be a safe new-tab link');
  eq(!/hero\.js|menu\.js/.test(E('frame')({ src: 'a', alt: 'b', width: 1, height: 1 })) && /fetchpriority="high"/.test(E('frame')({ src: 'a', alt: 'b', width: 1, height: 1, priority: true })) && !/loading="lazy"/.test(E('frame')({ src: 'a', alt: 'b', width: 1, height: 1, priority: true })), 'frame: the priority image has fetchpriority=high and is never lazy');
  { const t = E('dish')(sig, { textFirst: true }), n = E('dish')(sig, { textFirst: false }); eq(t.indexOf('<h3>') < t.indexOf('<figure') && n.indexOf('<figure') < n.indexOf('<h3>'), 'dish: textFirst must change the DOM order, not only the look'); }
  eq(!/<a /.test(E('steps')([{ name: 'a', text: 'b' }])) && /<a href="x"/.test(E('steps')([{ name: 'a', text: 'b', link: { href: 'x', label: 'y' } }])), 'steps: a link is rendered only when the item has one');
  eq((E('ctaBand')(cfg0, { heading: 'h', text: 't' }).match(/id="cta-title"/g) || []).length === 1 && E('ctaBand')(cfg0, { heading: 'h', text: 't' }).includes('aria-labelledby="cta-title"'), 'ctaBand: without an id, the section is still labelled by its heading');

  // ---- the document
  {
    const doc = E('document'), page = cfg0.pages[0];
    const body = { main: '<h1>x</h1>', scripts: ['hero.js'], extraHead: '' };
    const html = doc(cfg0, page, body);
    const { tags } = tokenize(html);
    const names = tags.filter((t) => !t.close).map((t) => t.name);
    eq(html.startsWith('<!doctype html>\n<html lang="en"'), 'document: must start with the doctype and a <html lang>');
    eq(names.filter((n) => n === 'main').length === 1 && html.includes('<main id="main">'), 'document: exactly one <main id="main">');
    eq(tags.find((t) => t.name === 'body') && html.indexOf('class="skip" href="#main"') > html.indexOf('<body>') && html.indexOf('class="skip"') < html.indexOf('<header'), 'document: the skip link comes first in the body and targets #main');
    eq(['header', 'footer', 'nav'].every((n) => names.includes(n)) && (html.match(/aria-label="Primary"/g) || []).length === 1 && (html.match(/aria-label="Footer"/g) || []).length === 1, 'document: a header, a footer and two labelled navigations (Primary, Footer)');
    eq((html.match(/aria-current="page"/g) || []).length >= 2 && /<a href="index\.html" aria-current="page">Home<\/a>/.test(html), 'document: the current page is marked aria-current="page"');
    eq(/<script src="site\.js" defer><\/script>\n<script src="hero\.js" defer><\/script>/.test(html) && !/<script(?![^>]*src=)[^>]*>(?!<\/script>)/.test(html.replace('<script>document.documentElement.className+=\' js\'</script>', '')), 'document: site.js then the page scripts, deferred; the only inline script is the one-line "js" class');
    eq(/<meta charset="utf-8">/.test(html) && /<meta name="viewport" content="width=device-width,initial-scale=1">/.test(html) && /<title>[^<]+<\/title>/.test(html) && /<meta name="description" content="[^"]{20,}">/.test(html), 'document: charset, viewport, title and a description in the head');
    eq(html.includes('<meta name="robots" content="noindex, nofollow">') && !html.includes('rel="canonical"'), 'document: noindex pages carry the robots meta and no canonical link');
    eq(html.includes('class="disclosure"') && html.includes('class="foot-disc"'), 'document: the demonstration shows the disclosure bar and footer disclosure');
    const client = doc(cfg((c) => { c.demo = false; c.client.seo.noindex = false; c.client.seo.baseUrl = 'https://x.example.test'; }), page, body);
    eq(!client.includes('class="disclosure"') && !client.includes('foot-disc') && !client.includes('noindex') && client.includes('<link rel="canonical" href="https://x.example.test/">'), 'document: a client build has no disclosure, no noindex, and a canonical link');
    problems.push(...commonChecks(html, { inlineStyles: [], where: 'document: ' }).filter((m) => !/inline <script>/.test(m)));
    for (const path of spec.components.document.escapes) { assertions++; const c = cfg((x) => { x.demo = true; }); try { setPath(c, path, PAYLOAD); } catch (e) { fail(`document: ${e.message}`); continue; } hostile(doc(c, c.pages[0], body)).forEach((m) => fail(`document: input "${path}": ${m}`)); }
    const m1 = doc(cfg0, page, body), m2 = doc(cfg0, page, body); eq(m1 === m2, 'document: not deterministic');
  }

  // ---- page renderers
  for (const [id, p] of Object.entries(spec.pages)) {
    const render = (await load(p.module)).default;
    eq(typeof render === 'function' && render.length === 1, `page ${id}: ${p.module} must default-export (cfg) => ({ main, scripts, extraHead? })`);
    const page = cfg0.byId[id];
    const out = render(cfg0, page);
    eq(out && typeof out.main === 'string', `page ${id}: must return { main }`);
    const h1s = (out.main.match(/<h1[\s>]/g) || []).length;
    eq(h1s === 1, `page ${id}: main must contain exactly one <h1> (found ${h1s})`);
    eq(JSON.stringify(out.scripts || []) === JSON.stringify(p.scripts), `page ${id}: must load exactly ${JSON.stringify(p.scripts)} (got ${JSON.stringify(out.scripts || [])})`);
    problems.push(...commonChecks(out.main, { inlineStyles: ['--pos', '--focus-d', '--focus-m'], where: `page ${id}: ` }));
    if (out.extraHead) problems.push(...commonChecks(out.extraHead, { where: `page ${id} head: ` }).filter((m) => !/<img>/.test(m)));
  }

  notes.push(`${Object.keys(spec.components).length} component and helper contracts and ${Object.keys(spec.pages).length} page renderers checked: interface, markup guarantees, hostile-input escaping, purity, conditional behaviour (${assertions} assertions)`);
  return { problems: [...new Set(problems)], notes };
}

if (isMain(import.meta.url)) {
  const t0 = Date.now();
  const { problems, notes } = await checkContracts();
  notes.forEach((n) => console.log('  ' + n));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:contracts (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  process.exit(problems.length ? 1 : 0);
}
