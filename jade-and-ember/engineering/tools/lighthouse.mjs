// node engineering/tools/lighthouse.mjs [--runs N] [--pages a.html,b.html] [--out DIR] [--summary FILE]     (npm run test:lighthouse)
// The direct Lighthouse runner that replaced Lighthouse CI (G6-1): serves the project folder, measures every page in a fresh Chromium, aggregates the runs
// and asserts the thresholds of engineering/lighthouse.json. Exit 0 when no "error" assertion failed; warnings are printed. Fails closed (see lib/lighthouse.mjs).
// --runs and --pages narrow a run for investigation and cannot lower the configured thresholds (a narrowed run is marked as such and the floor still applies to the file).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkFloor, evaluate, loadConfig, measureAll, validateConfig } from '../lib/lighthouse.mjs';
import { projectDir } from '../lib/git.mjs';

const arg = (n) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null; };
const cfg = loadConfig();
const problems = [...validateConfig(cfg), ...checkFloor(cfg)];
if (problems.length) { problems.forEach((p) => console.log('  - ' + p)); console.log('FAIL  lighthouse configuration'); process.exit(1); }
const narrowed = Boolean(arg('--runs') || arg('--pages'));
if (arg('--runs')) cfg.runs = Number(arg('--runs'));
if (arg('--pages')) cfg.pages = arg('--pages').split(',');
const outDir = arg('--out') || join(projectDir, '.lighthouseci');
const t0 = Date.now();
const { results, meta } = await measureAll(cfg, { outDir, log: (m) => console.log(`  measuring ${m}`) });
const ev = evaluate(cfg, results);
console.log(`\nLighthouse ${meta.lighthouseVersion || '?'}; ${meta.userAgent || ''}; ${cfg.runs} run(s) per page, ${cfg.aggregation} aggregation${narrowed ? ' (NARROWED RUN: not a verification of the configuration)' : ''}`);
for (const r of ev.rows) console.log(`  ${r.ok ? 'ok  ' : r.level === 'error' ? 'FAIL' : 'warn'} ${r.page.padEnd(18)} ${r.category.padEnd(16)} ${String(r.aggregate).padEnd(6)} >= ${r.minScore}  [${r.runs.join(', ')}]  (${r.level})`);
ev.warnings.forEach((w) => console.log('  warning: ' + w));
ev.errors.forEach((e) => console.log('  - ' + e));
if (arg('--summary')) writeFileSync(arg('--summary'), JSON.stringify({ lighthouse: meta.lighthouseVersion, userAgent: meta.userAgent, chrome: meta.chrome, config: cfg, narrowed, seconds: Math.round((Date.now() - t0) / 1000), rows: ev.rows, errors: ev.errors, warnings: ev.warnings, results }, null, 1));
console.log(`${ev.errors.length ? 'FAIL' : 'PASS'}  lighthouse (${ev.errors.length} error(s), ${ev.warnings.length} warning(s), ${Math.round((Date.now() - t0) / 1000)} s)`);
process.exit(ev.errors.length ? 1 : 0);
