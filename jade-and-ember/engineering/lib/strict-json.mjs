// JSON.parse that refuses what a reader and a machine could read differently: a key repeated inside one object ("status":"rejected" ... "status":"approved"
// is read as approved by JSON.parse, while a person reading the file sees both). Used for every record the release gate reads (G6-2 review, F3).
// Returns the parsed value or throws an Error whose message names the duplicate key.
export function parseStrictJson(text) {
  const value = JSON.parse(text);   // syntax and number/string rules are JSON.parse's
  const dup = findDuplicateKey(text);
  if (dup) throw new Error(`duplicate key "${dup}" in one object`);
  return value;
}

// A scanner over already-valid JSON text: tracks the key set of every open object.
function findDuplicateKey(s) {
  const stack = [];   // per open container: Set of keys for an object, null for an array
  let i = 0, expectKey = false;
  const str = () => {
    let j = i + 1, out = '';
    while (s[j] !== '"') { if (s[j] === '\\') { const n = s[j + 1] === 'u' ? 6 : 2; out += s.slice(j, j + n); j += n; } else { out += s[j]; j++; } }
    i = j + 1;
    return JSON.parse(`"${out}"`);
  };
  while (i < s.length) {
    const c = s[i];
    if (c === '{') { stack.push(new Set()); expectKey = true; i++; }
    else if (c === '[') { stack.push(null); expectKey = false; i++; }
    else if (c === '}' || c === ']') { stack.pop(); expectKey = false; i++; }
    else if (c === ',') { const top = stack[stack.length - 1]; expectKey = top instanceof Set; i++; }
    else if (c === '"') {
      const v = str();
      const top = stack[stack.length - 1];
      if (expectKey && top instanceof Set) { if (top.has(v)) return v; top.add(v); expectKey = false; }
    } else i++;
  }
  return null;
}
