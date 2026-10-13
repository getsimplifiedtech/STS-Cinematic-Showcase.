// A small, strict evaluator for the Node version ranges that package.json `engines` and the lockfile use (Gate 6, G6-1): does a given Node version satisfy
// "^22.22.0 || >= 24.8.0"? Supports ||, space-separated comparators, >= > <= < =, ^ and ~ on versions with a major of 1 or more, partial versions and x-ranges.
// Anything else is refused with an error, never guessed, so an unusual range cannot be waved through.
const norm = (r) => r.trim().replace(/(>=|<=|>|<|=|\^|~)\s+/g, '$1');
const num = (s) => { if (!/^\d+$/.test(s)) throw new Error(`unsupported version part "${s}"`); return Number(s); };

export function parseVersion(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v).trim());
  if (!m) throw new Error(`"${v}" is not an exact version`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
const partial = (s) => { const p = s.split('.'); if (p.length > 3 || !p[0]) throw new Error(`unsupported version "${s}"`); const wild = (x) => x === undefined || x === 'x' || x === 'X' || x === '*'; return { major: wild(p[0]) ? null : num(p[0]), minor: wild(p[1]) ? null : num(p[1]), patch: wild(p[2]) ? null : num(p[2]) }; };

// one comparator, as a predicate on [major, minor, patch]
function comparator(tok) {
  if (tok === '*' || tok === '' || /^[xX]$/.test(tok)) return () => true;
  const m = /^(>=|<=|>|<|=|\^|~)?(.+)$/.exec(tok);
  if (!m) throw new Error(`unsupported comparator "${tok}"`);
  const op = m[1] || '=', p = partial(m[2]);
  if (p.major === null) return () => true;
  const lo = [p.major, p.minor ?? 0, p.patch ?? 0];
  if (op === '>=') return (v) => cmp(v, lo) >= 0;
  if (op === '>') return p.minor === null ? (v) => v[0] > p.major : p.patch === null ? (v) => v[0] > p.major || (v[0] === p.major && v[1] > p.minor) : (v) => cmp(v, lo) > 0;
  if (op === '<') return (v) => cmp(v, lo) < 0;
  if (op === '<=') return p.minor === null ? (v) => v[0] <= p.major : p.patch === null ? (v) => v[0] < p.major || (v[0] === p.major && v[1] <= p.minor) : (v) => cmp(v, lo) <= 0;
  if (op === '^') { if (p.major === 0) throw new Error(`unsupported caret range "${tok}" (major 0)`); const hi = [p.major + 1, 0, 0]; return (v) => cmp(v, lo) >= 0 && cmp(v, hi) < 0; }
  if (op === '~') { const hi = p.minor === null ? [p.major + 1, 0, 0] : [p.major, p.minor + 1, 0]; return (v) => cmp(v, lo) >= 0 && cmp(v, hi) < 0; }
  // '=' (exact or x-range)
  if (p.minor === null) return (v) => v[0] === p.major;
  if (p.patch === null) return (v) => v[0] === p.major && v[1] === p.minor;
  return (v) => cmp(v, lo) === 0;
}

export function satisfies(version, range) {
  const v = parseVersion(version);
  // every comparator of every alternative is parsed first, so an unsupported one is refused even when an earlier comparator already decides the result
  const alts = norm(range).split('||').map((alt) => alt.trim().split(/\s+/).filter(Boolean).map(comparator));
  return alts.some((cs) => cs.every((c) => c(v)));
}
