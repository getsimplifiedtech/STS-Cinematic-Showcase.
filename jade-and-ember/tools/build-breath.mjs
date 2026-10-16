// Build for The Breath (Home page script). No dependencies: plain Node, STS-authored. It turns the four ES modules in client/ into ONE script, so the page makes one
// script request instead of three, and removes what a visitor never needs.
//   node tools/build-breath.mjs    writes breath.js (shipped) and .build/breath.lab.js (same code plus the lab hooks used by the test tooling; git-ignored, never shipped)
// What it does: concatenates the modules (each in its own scope, imports resolved by name), strips lab-only code, comments and surplus whitespace
// (including inside the GLSL shaders). What it does NOT do: rename identifiers (no mangling), tree-shake, or change behaviour. Whitespace is only removed where
// the language allows it; a newline is kept wherever it could end a statement. The result is checked by running the whole test matrix against it.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODULES = ['gl', 'steam', 'dish', 'breath'];

// ---- lab markers: a line that is only `//#lab` opens a block closed by `//#endlab`; a line that ends with `//#lab` is dropped on its own
function stripLab(text, keep) {
  if (keep) return text;
  const out = []; let inBlock = false;
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (t === '//#lab') { inBlock = true; continue; }
    if (t === '//#endlab') { inBlock = false; continue; }
    if (inBlock || /\/\/#lab\s*$/.test(line)) continue;
    out.push(line);
  }
  return out.join('\n');
}

// ---- GLSL text inside template literals
function glsl(chunk) {
  let t = chunk.replace(/\/\/[^\n]*/g, '');
  const lines = t.split('\n'), out = []; let buf = '';
  const flush = () => { if (buf) { out.push(buf); buf = ''; } };
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('#')) { flush(); out.push(line + '\n'); continue; }
    buf += ' ' + line;
  }
  flush();
  t = out.join('');
  // collapse whitespace, then drop it around punctuation (but never between two names/numbers, or between two + or two -)
  t = t.replace(/[ \t]+/g, ' ');
  t = t.replace(/ ?([{}()\[\];,=*\/<>?:!&|%^]) ?/g, '$1');
  t = t.replace(/\+\+/g, '\u0001').replace(/--/g, '\u0002');       // increment and decrement stay glued together
  t = t.replace(/ ?([+\-]) ?/g, (m, c, off, all) => {
    const before = all[off - 1], after = all[off + m.length];
    return (before === c || after === c) ? ` ${c} ` : c;     // keep `a - -b`, `a + +b` readable to the compiler
  });
  t = t.replace(/\u0001/g, '++').replace(/\u0002/g, '--');
  // a leading or trailing space at a chunk edge could be the only separator from the neighbouring ${...}
  const lead = /^\s/.test(chunk) ? '\n' : '', trail = /\s$/.test(chunk) ? '\n' : '';
  t = t.replace(/^[ \n]+/, '').replace(/[ ]+$/, '');
  return lead + t + (t.endsWith('\n') ? '' : trail);
}

// ---- JS: strip comments, collapse whitespace, keep strings, template literals and regex literals verbatim (templates: GLSL-minified)
function minify(src) {
  let i = 0, out = '';
  const n = src.length;
  const isId = (c) => /[A-Za-z0-9_$]/.test(c || '');
  let lastSig = '';           // last significant (non-space) char written, to decide regex vs divide and where a newline matters
  let lastWord = '';
  const REGEX_AFTER = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^', '']);
  function code(stopAtBrace) {
    let depth = 0, ws = '', wsNl = false;
    const emitWs = (next) => {
      if (!ws && !wsNl) return;
      const prev = out[out.length - 1];
      let keep = '';
      if (wsNl && /[\w$)\]'"`]/.test(prev || '') && /[\w$(\[\'"`+\-\/!~.]/.test(next || '')) keep = '\n';       // may end a statement
      else if (isId(prev) && isId(next)) keep = ' ';
      else if ((prev === '+' && next === '+') || (prev === '-' && next === '-') || (prev === '/' && next === '/')) keep = ' ';
      out += keep; ws = ''; wsNl = false;
    };
    while (i < n) {
      const c = src[i], d = src[i + 1];
      if (c === ' ' || c === '\t' || c === '\r') { ws += c; i++; continue; }
      if (c === '\n') { wsNl = true; ws += c; i++; continue; }
      if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); if (src.slice(i, e).includes('\n')) wsNl = true; ws += ' '; i = e + 2; continue; }
      if (stopAtBrace) { if (c === '{') depth++; if (c === '}') { if (depth === 0) return; depth--; } }
      emitWs(c);
      if (c === '"' || c === "'") {
        let j = i + 1; while (src[j] !== c) { if (src[j] === '\\') j++; j++; }
        out += src.slice(i, j + 1); i = j + 1; lastSig = c; continue;
      }
      if (c === '`') {
        i++; out += '`'; let chunk = '';
        const flushChunk = () => { out += glsl(chunk); chunk = ''; };
        while (src[i] !== '`') {
          if (src[i] === '\\') { chunk += src[i] + src[i + 1]; i += 2; continue; }
          if (src[i] === '$' && src[i + 1] === '{') { flushChunk(); out += '${'; i += 2; code(true); out += '}'; i++; continue; }
          chunk += src[i++];
        }
        flushChunk(); out += '`'; i++; lastSig = '`'; continue;
      }
      if (c === '/' && (REGEX_AFTER.has(lastSig) || lastWord === 'return' || lastWord === 'typeof')) {      // a regex literal
        let j = i + 1, cls = false; while (j < n) { const x = src[j]; if (x === '\\') { j += 2; continue; } if (x === '[') cls = true; else if (x === ']') cls = false; else if (x === '/' && !cls) break; j++; }
        j++; while (/[a-z]/.test(src[j] || '')) j++;
        out += src.slice(i, j); i = j; lastSig = ')'; lastWord = ''; continue;
      }
      if (isId(c)) { let j = i; while (isId(src[j])) j++; lastWord = src.slice(i, j); out += lastWord; i = j; lastSig = lastWord[lastWord.length - 1]; if (/^(return|typeof|case|in|of|else|do|void|delete|new|throw|yield|await)$/.test(lastWord)) lastSig = ''; continue; }
      lastWord = ''; out += c; lastSig = c; i++;
    }
  }
  code(false);
  return out;
}

// ---- bundle: every module in its own scope; its exports are returned and destructured by name for the modules after it
function bundle(keepLab) {
  let all = '';
  for (const m of MODULES) {
    let text = stripLab(readFileSync(join(root, 'client', m + '.js'), 'utf8'), keepLab);
    const exported = [];
    text = text.replace(/^export\s+(?:async\s+)?(function|const|let|class)\s+([A-Za-z0-9_$]+)/gm, (_, kind, name) => { exported.push(name); return _.replace(/^export\s+/, ''); });
    text = text.replace(/^import\s+[^;]*;\s*$/gm, '');
    if (/\bimport\s*\{|\bexport\s/.test(text)) throw new Error(`unresolved import/export in client/${m}.js`);
    if (m === 'breath') all += `(()=>{\n${text}\n})();\n`;
    else all += `const {${exported.join(',')}}=(()=>{\n${text}\nreturn {${exported.join(',')}};\n})();\n`;
  }
  return all;
}

mkdirSync(join(root, '.build'), { recursive: true });
const report = {};
for (const [name, lab] of [['breath.js', false], ['breath.lab.js', true]]) {
  const raw = bundle(lab), min = `/* The Breath. STS-authored, no third-party code. Generated from the project's client sources. */\n${minify(raw)}\n`;
  const tmp = join(tmpdir(), name + '.check.mjs'); writeFileSync(tmp, min);
  const chk = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' }); if (chk.status) { console.error(chk.stderr); process.exit(1); }
  writeFileSync(join(root, name === 'breath.js' ? 'breath.js' : join('.build', name)), min);
  report[name] = { bytes: Buffer.byteLength(min), gzip: gzipSync(min).length, brotli: brotliCompressSync(min).length, unminifiedBundleBytes: Buffer.byteLength(raw), unminifiedGzip: gzipSync(raw).length };
}
console.log(JSON.stringify(report, null, 1));
