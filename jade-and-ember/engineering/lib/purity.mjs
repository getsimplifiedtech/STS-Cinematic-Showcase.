// The purity review (R-07, G6-5, APR-JE-046): would this reusable code still be correct on a non-restaurant site hosted on Vercel with no baseline? The matrix says which
// files are reusable engineering (classes universal, universal-redesign and adapter-hosting); this module scans exactly those for the things that make code about ONE
// project: its name, its record ids, its baseline label, its restaurant vocabulary, its file names and its markup selectors. A finding is either removed (the value
// moves to sts.engineering.json) or listed in engineering/purity-allow.json with a reason a reviewer accepted. Comments are not scanned: a comment may cite where a
// rule came from; a string, a regular expression or an identifier may not hard-code it.
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

// replaces comments by spaces (line breaks kept), leaving strings, template literals and regular expressions alone
const KEYWORDS_BEFORE_REGEX = new Set(['return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'throw', 'new', 'else', 'do', 'yield', 'await']);
export function stripComments(src) {
  const out = [], stack = [];          // stack: 'T' inside a template literal, { depth } inside a ${ } expression
  const n = src.length;
  let i = 0, prev = '', word = '';
  const copy = (s) => { out.push(s); i += s.length; };
  while (i < n) {
    const c = src[i], d = src[i + 1], top = stack[stack.length - 1];
    if (top === 'T') {
      if (c === '\\') { copy(src.slice(i, i + 2)); continue; }
      if (c === '`') { stack.pop(); copy(c); prev = '`'; word = ''; continue; }
      if (c === '$' && d === '{') { stack.push({ depth: 0 }); copy('${'); prev = '{'; word = ''; continue; }
      copy(c); continue;
    }
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') { out.push(' '); i++; } continue; }
    if (c === '/' && d === '*') { while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out.push(src[i] === '\n' ? '\n' : ' '); i++; } out.push('  '); i += 2; continue; }
    if (c === '"' || c === "'") { let j = i + 1; while (j < n && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1; copy(src.slice(i, j + 1)); prev = c; word = ''; continue; }
    if (c === '`') { stack.push('T'); copy(c); continue; }
    if (c === '{') { if (top) top.depth++; copy(c); prev = c; word = ''; continue; }
    if (c === '}') { if (top && top.depth === 0) { stack.pop(); copy(c); prev = '}'; word = ''; continue; } if (top) top.depth--; copy(c); prev = c; word = ''; continue; }
    if (/[A-Za-z_$]/.test(c)) { let j = i; while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j++; word = src.slice(i, j); copy(word); prev = 'a'; continue; }
    if (c === '/' && (prev === '' || /[(,=:[!&|?{};+\-*%<>~^}]/.test(prev) || (prev === 'a' && KEYWORDS_BEFORE_REGEX.has(word)))) {   // a regular expression literal
      let j = i + 1, cls = false;
      while (j < n && (src[j] !== '/' || cls) && src[j] !== '\n') { if (src[j] === '\\') j++; else if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; j++; }
      j++; while (j < n && /[a-z]/.test(src[j])) j++;
      copy(src.slice(i, j)); prev = '/'; word = ''; continue;
    }
    copy(c);
    if (!/\s/.test(c)) { prev = c; word = ''; }
  }
  return out.join('');
}

export const FORBIDDEN = [
  { id: 'project-name', re: /jade|ember/i, what: 'the project name' },
  { id: 'record-id', re: /\b(?:APR|DEMO|REL|DEP|RIGHTS|SRCH)-JE\b/, what: 'a project record id prefix' },
  { id: 'baseline-label', re: /\bv0\.8\b/, what: 'the baseline label' },
  { id: 'industry-word', re: /\b(?:dish(?:es)?|menu|restaurant|chef|cuisine|wok|kitchen)\b/i, what: 'restaurant vocabulary' },
  { id: 'site-file', re: /\b(?:styles\.css|site\.js|hero\.js|menu\.js)\b/, what: 'a file of this site' },
  { id: 'project-layout', re: /\.\.\/\.\.\/src\/|\bbuild\.mjs\b|\/src\/lib\//, what: 'the project\'s builder or source layout' },
  { id: 'site-selector', re: /['"`](?:\.nav-toggle|#site-nav|\.pause|\.hero-video|\.foot-nav|\.jump)\b|data-ambient-root|\ba\.brand\b|classList\.contains\(['"]skip['"]\)/, what: 'a selector of this site\'s markup' },
];

// findings in one file: [{ file, line, rule, text }]
export function scan(file, src) {
  const out = [];
  const lines = stripComments(src).split('\n');
  lines.forEach((text, k) => { for (const f of FORBIDDEN) if (f.re.test(text)) out.push({ file, line: k + 1, rule: f.id, text: text.trim().slice(0, 140) }); });
  return out;
}

export const scanFile = (root, rel) => scan(rel, readFileSync(join(root, rel), 'utf8'));
export const relPosix = (root, p) => relative(root, p).split('\\').join('/');
