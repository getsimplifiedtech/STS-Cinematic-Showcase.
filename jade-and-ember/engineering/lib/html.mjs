// A small HTML tokenizer for contract tests: enough to check balance, attributes, ids and references in the markup the build generates.
// Not a general parser; the build's own output is regular. Returns { tags, errors }.
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const TAG = /<!--[\s\S]*?-->|<!doctype[^>]*>|<(\/?)([A-Za-z][A-Za-z0-9-]*)((?:\s+[^\s"'<>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/gi;

export function attrsOf(src) {
  const out = {};
  for (const m of src.matchAll(/([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  return out;
}

export function tokenize(html) {
  const tags = [], errors = [], stack = [];
  let last = 0;
  const text = (s) => { if (/[<>]/.test(s.replace(/<!--[\s\S]*?-->/g, ''))) errors.push(`stray "<" or ">" in text: ${s.trim().slice(0, 40)}`); };
  for (const m of html.matchAll(TAG)) {
    text(html.slice(last, m.index)); last = m.index + m[0].length;
    if (m[0].startsWith('<!')) continue;
    const name = m[2].toLowerCase(), closing = m[1] === '/';
    if (closing) {
      const open = stack.pop();
      if (!open || open.name !== name) errors.push(`</${name}> closes ${open ? '<' + open.name + '>' : 'nothing'}`);
      tags.push({ name, close: true });
    } else {
      const t = { name, attrs: attrsOf(m[3] || ''), depth: stack.length };
      tags.push(t);
      if (!VOID.has(name) && m[4] !== '/') stack.push(t);
    }
  }
  text(html.slice(last));
  for (const open of stack) errors.push(`<${open.name}> is never closed`);
  return { tags, errors };
}
