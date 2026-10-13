// G6-8 Stage C, V2: compares the reports two full verification runs left in their .reports folders. A JSON report is flattened to path/value pairs and every pair that is not
// volatile (timestamps, durations, seals, digests of the verifying code, absolute paths, commits) must be equal; every PNG present in both must be byte-identical. What exists in only
// one folder is listed, not judged. Read only.
//   node compare-reports.mjs <baseline .reports> <migrated .reports> [--json]
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const [a, b] = process.argv.slice(2).filter((x) => !x.startsWith('--'));
if (!a || !b) { console.error('usage: compare-reports.mjs <baseline .reports> <migrated .reports> [--json]'); process.exit(2); }
const VOLATILE_KEY = /^(seconds|startedAt|finishedAt|duration|durationMs|elapsed|seal|engineDigest|registryDigest|commit|dirty|runner|generatedAt|date|timestamp|time)$/i;
const ABS = /\/(?:tmp|home|root|Users|var)\/[^\s"']+/g;
const walk = (d, base = d) => (existsSync(d) ? readdirSync(d).sort().flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p, base) : [relative(base, p)]; }) : []);
const flat = (o, p = '', out = new Map()) => {
  if (Array.isArray(o) && o.length && o.every((v) => v && typeof v === 'object' && typeof v.id === 'string')) o.forEach((v) => flat(v, `${p}[${v.id}]`, out));   // a list of records is keyed by id: a reordering is not a difference
  else if (Array.isArray(o)) o.forEach((v, i) => flat(v, `${p}[${i}]`, out));
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (VOLATILE_KEY.test(k)) continue; flat(v, p ? `${p}.${k}` : k, out); }
  else out.set(p, typeof o === 'string' ? o.replace(ABS, '<path>') : o);
  return out;
};
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const fa = walk(a), fb = walk(b), sb = new Set(fb), sa = new Set(fa);
const result = { common: { json: 0, png: 0, other: 0 }, differences: [], onlyBaseline: fa.filter((f) => !sb.has(f)), onlyMigrated: fb.filter((f) => !sa.has(f)), compared: [] };
for (const f of fa.filter((x) => sb.has(x))) {
  if (f.endsWith('.json')) {
    result.common.json++;
    let ja, jb;
    try { ja = flat(JSON.parse(readFileSync(join(a, f), 'utf8'))); jb = flat(JSON.parse(readFileSync(join(b, f), 'utf8'))); } catch (e) { result.differences.push({ file: f, path: '(unreadable)', baseline: String(e.message), migrated: '' }); continue; }
    let diffs = 0;
    for (const k of new Set([...ja.keys(), ...jb.keys()])) {
      if (JSON.stringify(ja.get(k)) !== JSON.stringify(jb.get(k))) { diffs++; result.differences.push({ file: f, path: k, baseline: ja.has(k) ? ja.get(k) : '(absent)', migrated: jb.has(k) ? jb.get(k) : '(absent)' }); }
    }
    result.compared.push({ file: f, fields: ja.size, differences: diffs });
  } else if (f.endsWith('.png')) {
    result.common.png++;
    if (sha(join(a, f)) !== sha(join(b, f))) result.differences.push({ file: f, path: '(bytes)', baseline: sha(join(a, f)).slice(0, 12), migrated: sha(join(b, f)).slice(0, 12) });
  } else result.common.other++;
}
if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 1));
else {
  console.log(`common files: ${result.common.json} JSON, ${result.common.png} PNG, ${result.common.other} other`);
  for (const c of result.compared) console.log(`  ${c.differences ? 'DIFF' : 'same'}  ${c.file}  (${c.fields} fields, ${c.differences} differing)`);
  console.log(`only in the baseline: ${result.onlyBaseline.length ? result.onlyBaseline.join(', ') : 'none'}`);
  console.log(`only in the migrated run: ${result.onlyMigrated.length ? result.onlyMigrated.join(', ') : 'none'}`);
  for (const d of result.differences) console.log(`  - ${d.file} ${d.path}: ${JSON.stringify(d.baseline)} -> ${JSON.stringify(d.migrated)}`);
  console.log(result.differences.length ? `DIFFERENT (${result.differences.length} difference(s))` : 'IDENTICAL (every non-volatile field and every common image)');
}
process.exit(result.differences.length ? 1 : 0);
