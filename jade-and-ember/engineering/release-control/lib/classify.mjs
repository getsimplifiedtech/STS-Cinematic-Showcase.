// Routine versus material changes (G6-3A proof of concept; owner decision D-G63-6). A release is ROUTINE only if it can be shown, mechanically, to change nothing but
// the words of already-approved pages. Everything else is MATERIAL and needs the owner. The rules are deliberately narrow and conservative:
//   identical   the delivered files are byte-for-byte the files already released (a rebuild, a dependency bump that changes no output)
//   text-only   only .html files changed, and for every one of them the page is identical once its TEXT is blanked: every tag, attribute, link, script, style,
//               comment and the number and place of text nodes are unchanged, and the amount of changed text is within a limit
//   material    anything else: a new or removed file, any non-HTML change, a changed link/attribute/script/style/JSON-LD/comment, a page with raw-text oddities,
//               a changed approval subject (search files, rights inventory, external destinations, production host), a first release
// A page is never "text-only" if the tokenizer meets something whose parsing browsers treat differently (raw-text elements other than script and style, `<!--` inside a
// script or style); those pages must be byte-identical to count as unchanged, or the change is material.

// Elements whose content browsers parse differently from ordinary markup (raw text, foreign content, scripting-dependent parsing). A page that contains one is never "text-only".
const EXOTIC_ELEMENTS = new Set(['plaintext', 'xmp', 'iframe', 'noembed', 'noframes', 'textarea', 'template', 'math', 'svg', 'noscript', 'object', 'embed', 'applet', 'frameset', 'frame']);
// The tokenizer accepts ONLY a strict, boring grammar; anything else marks the page "exotic" (it must be byte-identical to count as unchanged). Whitespace is the HTML set.
const WS = '[ \\t\\n\\r\\f]';
const NAME = '[A-Za-z][A-Za-z0-9:-]*';
const ATTR = `[A-Za-z_:][A-Za-z0-9_:.-]*(?:${WS}*=${WS}*(?:"[^"]*"|'[^']*'|[^ \\t\\n\\r\\f"'=<>\`]+))?`;
const START_TAG = new RegExp(`<(${NAME})((?:${WS}+${ATTR})*)${WS}*(/?)>`, 'y');
const END_TAG = new RegExp(`</(${NAME})${WS}*>`, 'y');
const DOCTYPE = /<!doctype html>/iy;
const TAG_START = /[A-Za-z/!?]/;
const MAX_TAG = 8192;

// Decodes a page as a browser would, or says it cannot: invalid UTF-8, a UTF-16 byte order mark or a NUL byte means "exotic".
export function decodePage(buf) {
  if (!Buffer.isBuffer(buf)) return { text: String(buf), ok: true };
  if ((buf[0] === 0xff && buf[1] === 0xfe) || (buf[0] === 0xfe && buf[1] === 0xff) || buf.includes(0)) return { text: '', ok: false };
  try { return { text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buf), ok: true }; } catch { return { text: '', ok: false }; }
}

// Replaces every maximal run of text outside tags/comments/script/style by \u0001 and returns the rest verbatim. Returns { blank, text, exotic }.
export function blankHtml(input) {
  const dec = decodePage(input);
  if (!dec.ok) return { blank: '', text: '', exotic: true };
  const html = dec.text, n = html.length;
  let out = '', text = '', i = 0, exotic = false, inText = false;
  const flush = () => { if (inText) { out += '\u0001'; inText = false; } };
  const at = (re, from) => { re.lastIndex = from; const m = re.exec(html.length - from > MAX_TAG ? html.slice(0, from + MAX_TAG) : html); return m && m.index === from ? m : null; };
  while (i < n) {
    const c = html[i];
    if (c !== '<') { inText = true; text += c; i++; continue; }
    const nx = html[i + 1];
    if (nx === undefined || !TAG_START.test(nx)) { inText = true; text += c; i++; continue; }   // a lone "<" is text for a browser too
    flush();
    if (html.startsWith('<!--', i)) {
      const e = html.indexOf('-->', i + 4), body = e < 0 ? null : html.slice(i + 4, e);
      if (body === null || body.startsWith('>') || body.startsWith('->') || body.includes('--!>') || body.includes('<!--') || body.endsWith('--!')) { exotic = true; out += html.slice(i); i = n; break; }
      out += html.slice(i, e + 3); i = e + 3; continue;
    }
    let m = at(DOCTYPE, i);
    if (m) { out += m[0]; i += m[0].length; continue; }
    m = at(START_TAG, i);
    if (m) {
      const name = m[1].toLowerCase(); out += m[0]; i += m[0].length;
      if (EXOTIC_ELEMENTS.has(name)) exotic = true;
      if (name === 'script' || name === 'style') {
        if (m[3] === '/') exotic = true;   // "<script/>" is not an empty element to a browser
        const close = new RegExp(`</${name}`, 'i'), rest = html.slice(i), k = rest.search(close);
        if (k < 0) { exotic = true; out += rest; i = n; break; }
        const raw = rest.slice(0, k);
        if (raw.includes('<!--')) exotic = true;
        if (rest.slice(k, k + name.length + 3).toLowerCase() !== `</${name}>`) exotic = true;   // only the plain end tag is trusted ("</script >" ends it for a browser, not for a regex)
        out += raw; i += raw.length;
        if (!exotic) { out += `</${name}>`; i += name.length + 3; }   // (the plain end tag, already checked above)
      }
      continue;
    }
    m = at(END_TAG, i);
    if (m) { const name = m[1].toLowerCase(); if (name === 'script' || name === 'style') exotic = true; out += m[0]; i += m[0].length; continue; }
    // anything else that starts like markup (<![CDATA[, <?, </ with junk, odd attributes, quotes in attribute names, unquoted values with quotes): not trusted
    exotic = true; out += c; i++;
  }
  flush();
  return { blank: out, text, exotic };
}

// how many characters differ between two strings, ignoring the common beginning and end
export function editSize(a, b) {
  let p = 0; const m = Math.min(a.length, b.length);
  while (p < m && a[p] === b[p]) p++;
  let s = 0;
  while (s < m - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  return (a.length - p - s) + (b.length - p - s);
}

export const DEFAULT_POLICY = Object.freeze({ maxTextEditChars: 4000 });

// prev, next: Map name -> Buffer (delivered files, without START-HERE.txt and serve.py). prevSubjects/nextSubjects: { search, rights, externalLinks, domain }.
// Returns { class: 'identical'|'text-only'|'material', reasons: [..], changes: [{ name, change }] }
export function classifyChange({ prev, next, prevSubjects, nextSubjects, prevTracked = {}, nextTracked = {}, policy = DEFAULT_POLICY }) {
  const reasons = [], changes = [];
  if (!prev) return { class: 'material', reasons: ['first release of this client: the owner decides it'], changes: [...next.keys()].sort().map((name) => ({ name, change: 'added' })) };
  for (const k of ['search', 'rights', 'externalLinks', 'domain']) if ((prevSubjects?.[k] ?? null) !== (nextSubjects?.[k] ?? null)) reasons.push(`the ${k} subject changed, so a person has to look at it again`);
  for (const k of [...new Set([...Object.keys(prevTracked), ...Object.keys(nextTracked)])].sort()) if ((prevTracked[k] ?? null) !== (nextTracked[k] ?? null)) reasons.push(`${k} changed: it is project data the gate relies on, so a person has to look at it`);
  const names = [...new Set([...prev.keys(), ...next.keys()])].sort();
  let editChars = 0, onlyText = true;
  for (const name of names) {
    const a = prev.get(name), b = next.get(name);
    if (a && b && a.equals(b)) continue;
    if (!a) { changes.push({ name, change: 'added' }); reasons.push(`new file ${name}`); onlyText = false; continue; }
    if (!b) { changes.push({ name, change: 'removed' }); reasons.push(`removed file ${name}`); onlyText = false; continue; }
    if (!/\.html$/.test(name)) { changes.push({ name, change: 'non-html' }); reasons.push(`${name} is not a page, so its change is not routine`); onlyText = false; continue; }
    const x = blankHtml(a), y = blankHtml(b);
    if (x.exotic || y.exotic) { changes.push({ name, change: 'structure' }); reasons.push(`${name} contains markup that browsers parse as raw text, so a change to it is not routine`); onlyText = false; continue; }
    if (x.blank !== y.blank) { changes.push({ name, change: 'structure' }); reasons.push(`${name}: a tag, attribute, link, script, style or comment changed`); onlyText = false; continue; }
    const size = editSize(x.text, y.text);
    editChars += size;
    changes.push({ name, change: 'text', chars: size });
  }
  if (!changes.length && !reasons.length) return { class: 'identical', reasons: ['the delivered files are the files already released'], changes };
  if (onlyText && !reasons.length) {
    if (editChars > policy.maxTextEditChars) return { class: 'material', reasons: [`${editChars} characters of text changed (routine limit ${policy.maxTextEditChars})`], changes };
    return { class: 'text-only', reasons: [`only the words of ${changes.length} page(s) changed (${editChars} characters)`], changes };
  }
  return { class: 'material', reasons, changes };
}
