// Routine versus material changes (G6-3A proof of concept; owner decision D-G63-6). A release is ROUTINE only if it can be shown, mechanically, to change nothing but
// the words of already-approved pages. Everything else is MATERIAL and needs the owner. The rules are deliberately narrow and conservative:
//   identical   the delivered files are byte-for-byte the files already released (a rebuild, a dependency bump that changes no output)
//   text-only   only .html files changed, and for every one of them the page is identical once its TEXT is blanked: every tag, attribute, link, script, style,
//               comment and the number and place of text nodes are unchanged, and the amount of changed text is within a limit
//   material    anything else: a new or removed file, any non-HTML change, a changed link/attribute/script/style/JSON-LD/comment, a page with raw-text oddities,
//               a changed approval subject (search files, rights inventory, external destinations, production host), a first release
// A page is never "text-only" if the tokenizer meets something whose parsing browsers treat differently (raw-text elements other than script and style, `<!--` inside a
// script or style); those pages must be byte-identical to count as unchanged, or the change is material.

const RAW_TEXT_ELEMENTS = /<(plaintext|xmp|iframe|noembed|noframes|textarea|template|math|svg)\b/i;
const TAG_START = /[A-Za-z/!?]/;

// Replaces every maximal run of text outside tags/comments/script/style by \u0001 and returns the rest verbatim. Returns { blank, text, exotic }.
export function blankHtml(html) {
  let out = '', text = '', i = 0, exotic = RAW_TEXT_ELEMENTS.test(html);
  const n = html.length;
  let inText = false;
  const flushText = () => { if (inText) { out += '\u0001'; inText = false; } };
  while (i < n) {
    const c = html[i];
    if (c === '<' && i + 1 < n && TAG_START.test(html[i + 1])) {
      flushText();
      if (html.startsWith('<!--', i)) {
        const e = html.indexOf('-->', i + 4);
        const end = e < 0 ? n : e + 3;
        out += html.slice(i, end); i = end; continue;
      }
      // a tag: up to the closing > outside quotes
      let j = i + 1, q = null;
      while (j < n) { const d = html[j]; if (q) { if (d === q) q = null; } else if (d === '"' || d === "'") q = d; else if (d === '>') break; j++; }
      const end = j < n ? j + 1 : n;
      const tag = html.slice(i, end);
      out += tag; i = end;
      const m = /^<(script|style)\b/i.exec(tag);
      if (m && !/\/\s*>$/.test(tag)) {
        const close = new RegExp(`</${m[1]}(?=[\\s/>])`, 'i');
        const rest = html.slice(i), k = rest.search(close);
        const raw = k < 0 ? rest : rest.slice(0, k);
        if (raw.includes('<!--') || k < 0) exotic = true;
        out += raw; i += raw.length;
      }
      continue;
    }
    inText = true; text += c; i++;
  }
  flushText();
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
    const x = blankHtml(a.toString('utf8')), y = blankHtml(b.toString('utf8'));
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
