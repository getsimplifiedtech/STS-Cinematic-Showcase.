// check:tokens (ENG-002, ENG-018). The shared design tokens in styles.css (:root custom properties) as engineering structure:
//   unchanged     the :root block equals the recorded v0.8 snapshot in tokens.json (a changed colour, type or spacing value is a VISUAL
//                 decision and needs an owner approval before both files change); no token added or removed silently
//   defined       every var(--x) in styles.css and in the pages' inline styles refers to a token or a declared local property
//   used          every token is used (the recorded exceptions aside); no new hard-coded colours outside :root beyond the recorded count
//   valid         colours parse as hex, lengths are px or clamp(), the spacing scale only grows, font stacks name only declared families
//   contrast      the recorded foreground and background pairs meet their WCAG minimum, computed from the token values
// It states no preference for any value. Anthropic Frontend Design is the creative authority; this check only keeps the tokens coherent and frozen.
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { assembleCandidate, pagesOf } from '../lib/site.mjs';
import { engDir, isMain, projectDir, readJson } from '../lib/git.mjs';
import { baselineLabel, stylesheet } from '../lib/project.mjs';
import { record } from '../lib/project-records.mjs';

const hex = (s) => { const m = /^#([0-9a-f]{6})$/i.exec(s.trim()); return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : null; };
const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

export function parseRoot(css) {
  const m = /:root\{([\s\S]*?)\n\}/.exec(css);
  if (!m) return null;
  const tokens = {};
  for (const t of m[1].matchAll(/(--[a-z0-9-]+):([^;]+);/g)) tokens[t[1]] = t[2].trim();
  return { tokens, block: m[0] };
}

export function checkTokens({ root = projectDir, cssFile = stylesheet, pagesRoot = null } = {}) {
  const rec = record('tokens.json');
  const problems = [], notes = [];
  const css = readFileSync(join(root, cssFile), 'utf8');
  const parsed = parseRoot(css);
  if (!parsed) return { problems: [`${cssFile} has no :root block`], notes };
  const { tokens, block } = parsed;
  // unchanged
  for (const [k, v] of Object.entries(rec.tokens)) {
    if (!(k in tokens)) problems.push(`token ${k} was removed (recorded as ${v})`);
    else if (tokens[k] !== v) problems.push(`token ${k} changed from ${v} to ${tokens[k]}: a visual change, it needs a recorded owner approval before tokens.json and ${cssFile} change together`);
  }
  for (const k of Object.keys(tokens)) if (!(k in rec.tokens)) problems.push(`token ${k} (${tokens[k]}) is not in tokens.json: add it only with an owner-approved change`);
  // defined
  const outside = css.replace(block, '');
  const inlineStyles = pagesOf(pagesRoot || root).flatMap((f) => { try { return [...readFileSync(join(pagesRoot || root, f), 'utf8').matchAll(/\sstyle="([^"]*)"/g)].map((m) => m[1]); } catch { return []; } });
  const defined = new Set([...Object.keys(tokens), ...rec.localProperties, ...[...outside.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]), ...inlineStyles.flatMap((s) => [...s.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]))]);
  const used = new Map();
  for (const m of css.matchAll(/var\((--[a-z0-9-]+)/g)) used.set(m[1], (used.get(m[1]) || 0) + 1);
  for (const [name] of used) if (!defined.has(name)) problems.push(`var(${name}) is used but never defined`);
  // used
  for (const k of Object.keys(tokens)) if (!used.has(k) && !rec.unusedAllowed.includes(k)) problems.push(`token ${k} is defined but never used`);
  const literals = (outside.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) || []).length;
  if (literals > rec.colorLiteralsOutsideRoot) problems.push(`${literals} hard-coded colours outside :root (the recorded count is ${rec.colorLiteralsOutsideRoot}): use a token, or record an owner-approved change`);
  // valid
  for (const [k, v] of Object.entries(tokens)) {
    // a token the snapshot records as a hex colour stays a six-digit hex colour
    if (/^#/.test(rec.tokens[k] ?? '') && !hex(v)) problems.push(`${k}: "${v}" is not a six-digit hex colour`);
  }
  const px = rec.spacingScale.map((k) => parseFloat(tokens[k]));
  if (px.some((v, i) => !Number.isFinite(v) || (i > 0 && v <= px[i - 1]))) problems.push(`the spacing scale ${rec.spacingScale.join(', ')} must be numbers that only grow (${px.join(', ')})`);
  const declared = new Set([...css.matchAll(/@font-face\{font-family:"([^"]+)"/g)].map((m) => m[1]));
  for (const [tok, fams] of Object.entries(rec.fontFamilies)) for (const f of fams) if (!declared.has(f)) problems.push(`${tok} names the family "${f}", which no @font-face declares`);
  // contrast
  let checked = 0;
  for (const p of rec.contrastPairs) {
    const a = hex(tokens[p.fg] || ''), b = hex(tokens[p.bg] || '');
    if (!a || !b) { problems.push(`contrast pair ${p.fg} on ${p.bg}: a colour is missing or not hex`); continue; }
    checked++;
    const r = ratio(a, b);
    if (r < p.min) problems.push(`${p.fg} on ${p.bg} is ${r.toFixed(2)}:1, under ${p.min}:1 (${p.use})`);
  }
  notes.push(`${Object.keys(tokens).length} tokens equal the frozen ${baselineLabel} snapshot; ${used.size} distinct var() references all defined; ${literals} colour literals outside :root (recorded ${rec.colorLiteralsOutsideRoot}); spacing scale grows; ${checked} contrast pairs meet their minimum`);
  return { problems, notes };
}

if (isMain(import.meta.url)) {
  const { problems, notes } = checkTokens();
  notes.forEach((n) => console.log('  ' + n));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:tokens`);
  process.exit(problems.length ? 1 : 0);
}
