// Minimal JSON Schema validator with no dependencies, so `node build.mjs` still needs nothing but Node.
// It implements only the keywords the configuration schemas use; an unsupported keyword in a schema is itself an error, so a schema
// can never silently validate less than it says. checks/schema.mjs cross-checks this validator against Ajv (a full JSON Schema
// implementation, development only) on the real configuration and on a corpus of broken ones.

const SUPPORTED = new Set(['$schema', '$id', '$comment', 'title', 'description', '$defs', '$ref', 'type', 'enum', 'const', 'properties', 'required',
  'additionalProperties', 'items', 'minItems', 'maxItems', 'uniqueItems', 'minLength', 'maxLength', 'pattern', 'minimum', 'maximum', 'oneOf']);

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);
const isType = (v, t) => (t === 'number' ? typeof v === 'number' && Number.isFinite(v) : t === 'integer' ? Number.isInteger(v) : typeOf(v) === t);
const show = (v) => { const s = JSON.stringify(v); return s === undefined ? String(v) : s.length > 40 ? s.slice(0, 37) + '...' : s; };

// Returns an array of readable errors; empty means valid. `name` prefixes every path (for example "copy").
export function validateSchema(data, schema, name = '$') {
  const root = schema;
  const errors = [];
  const resolve = (s) => {
    if (!s.$ref) return s;
    const m = /^#\/\$defs\/([A-Za-z0-9_-]+)$/.exec(s.$ref);
    if (!m || !root.$defs?.[m[1]]) throw new Error(`schema error: unresolvable $ref ${s.$ref}`);
    return root.$defs[m[1]];
  };
  const walk = (v, s0, path) => {
    const s = resolve(s0);
    for (const k of Object.keys(s)) if (!SUPPORTED.has(k)) throw new Error(`schema error at ${path}: unsupported keyword "${k}"`);
    const err = (msg) => errors.push(`${path}: ${msg}`);
    if (s.oneOf) {
      const hits = s.oneOf.filter((alt) => { const sub = validateSchema(v, { ...alt, $defs: root.$defs }, path); return sub.length === 0; });
      if (hits.length !== 1) err(hits.length === 0 ? 'does not match any allowed form' : 'matches more than one allowed form');
      return;
    }
    if (s.type) {
      const types = Array.isArray(s.type) ? s.type : [s.type];
      if (!types.some((t) => isType(v, t))) return err(`expected ${types.join(' or ')}, got ${typeOf(v)}`);
    }
    if (s.const !== undefined && JSON.stringify(v) !== JSON.stringify(s.const)) err(`must be ${show(s.const)}`);
    if (s.enum && !s.enum.some((e) => JSON.stringify(e) === JSON.stringify(v))) err(`must be one of ${s.enum.map(show).join(', ')} (got ${show(v)})`);
    if (typeof v === 'string') {
      if (s.minLength !== undefined && v.length < s.minLength) err(`must be at least ${s.minLength} characters`);
      if (s.maxLength !== undefined && v.length > s.maxLength) err(`must be at most ${s.maxLength} characters`);
      if (s.pattern && !new RegExp(s.pattern, 'u').test(v)) err(`does not match the pattern ${s.pattern} (got ${show(v)})`);
    }
    if (typeof v === 'number') {
      if (s.minimum !== undefined && v < s.minimum) err(`must be at least ${s.minimum}`);
      if (s.maximum !== undefined && v > s.maximum) err(`must be at most ${s.maximum}`);
    }
    if (Array.isArray(v)) {
      if (s.minItems !== undefined && v.length < s.minItems) err(`needs at least ${s.minItems} items (has ${v.length})`);
      if (s.maxItems !== undefined && v.length > s.maxItems) err(`allows at most ${s.maxItems} items (has ${v.length})`);
      if (s.uniqueItems && new Set(v.map((x) => JSON.stringify(x))).size !== v.length) err('items must be unique');
      if (s.items) v.forEach((x, i) => walk(x, s.items, `${path}[${i}]`));
    } else if (v && typeof v === 'object') {
      for (const r of s.required || []) if (!(r in v)) err(`missing required property "${r}"`);
      for (const [k, x] of Object.entries(v)) {
        if (s.properties && k in s.properties) walk(x, s.properties[k], `${path}.${k}`);
        else if (s.additionalProperties === false) err(`unknown property "${k}" (not in the schema; check the spelling)`);
        else if (s.additionalProperties && typeof s.additionalProperties === 'object') walk(x, s.additionalProperties, `${path}.${k}`);
      }
    }
  };
  walk(data, schema, name);
  return errors;
}
