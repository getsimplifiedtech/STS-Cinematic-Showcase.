// External links (Gate 5 Phase 5, APR-JE-033).   node engineering/tools/external-links.mjs <command>
//   inventory            list every external address in the delivered demonstration files, by kind and file (offline)
//   verify [--json] [--write --runner sandbox|github-actions|person --note "text" --run <url>]
//                        request each registered destination (HEAD, then GET when a server will not answer HEAD; redirects followed by hand and
//                        recorded; TLS verified; 15 s timeout; one retry) and classify the answer. Prints a table, or JSON with --json.
//                        --write appends the run to engineering/external-links-verification.json (history; nothing is overwritten).
// A result is verified | blocked | unavailable | inconclusive | insecure. Blocked and inconclusive are never passes. Where the network is closed
// (as in the development sandbox) every result is inconclusive and says so; no result is ever made up.
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assembleCandidate } from '../lib/site.mjs';
import { CLASSES, collectExternal, groupDestinations, registryDigest, verifyUrl } from '../lib/external.mjs';
import { engDir, projectDir } from '../lib/git.mjs';

const arg = (n) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null; };
const flag = (n) => process.argv.includes(n);
const registry = JSON.parse(readFileSync(join(engDir, 'external-destinations.json'), 'utf8'));
const cmd = process.argv[2];

if (cmd === 'inventory') {
  const dir = assembleCandidate(projectDir, 'extlinks');
  try {
    const found = collectExternal(dir);
    for (const g of groupDestinations(found)) console.log(`${g.kind.padEnd(8)} ${g.url}  [${g.files.join(', ')}]  x${g.count}`);
    const ids = [...new Set(found.filter((f) => f.kind === 'identifier').map((f) => f.url))];
    console.log(`identifiers (not destinations): ${ids.join(', ') || 'none'}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
} else if (cmd === 'verify') {
  const urls = [...new Set(registry.destinations.map((d) => d.url))];
  const results = [];
  for (const u of urls) {
    const kinds = registry.destinations.filter((d) => d.url === u).map((d) => d.kind);
    const r = await verifyUrl(u, { allowHttpStart: !kinds.includes('link') });   // a plain-text mention may be printed as http; a clickable link may not
    results.push({ url: u, kind: kinds.includes('link') ? 'link' : 'mention', class: r.class, finalUrl: r.finalUrl, finalStatus: r.finalStatus, chain: r.chain, attempts: r.attempts, detail: r.detail });
  }
  const date = new Date().toISOString().slice(0, 10);
  const run = { date, runner: { kind: arg('--runner') || 'person', description: arg('--note') || 'run by hand; the description of the network was not given' }, registryDigest: registryDigest(registry), results };
  if (arg('--run')) run.runner.run = arg('--run');
  if (flag('--json')) console.log(JSON.stringify(run, null, 2));
  else {
    for (const r of results) console.log(`${r.class.padEnd(12)} ${r.url}  ${r.detail}${r.chain.length > 1 ? `  [${r.chain.map((h) => h.status).join(' > ')}]` : ''}`);
    const tally = CLASSES.map((c) => `${results.filter((r) => r.class === c).length} ${c}`).join(', ');
    console.log(`${results.length} destinations: ${tally}. Only "verified" is a pass.`);
  }
  if (flag('--write')) {
    const path = join(engDir, 'external-links-verification.json');
    const file = JSON.parse(readFileSync(path, 'utf8'));
    const n = file.records.length + 1;
    file.records.push({ id: `EXTV-${n}`, ...run });
    writeFileSync(path, JSON.stringify(file, null, 2) + '\n');
    console.log(`appended EXTV-${n} to engineering/external-links-verification.json`);
  }
} else { console.log('usage: node engineering/tools/external-links.mjs inventory | verify [--json] [--write --runner sandbox|github-actions|person --note "text" --run <url>]'); process.exit(2); }
