// The direct Lighthouse runner (Gate 6, G6-1, APR-JE-038). It replaces Lighthouse CI (@lhci/cli, 17 advisories, none reachable, unused by `verify`) with the
// `lighthouse` package itself, driven from Node: the site folder is served by the engineering static server, a fresh Chromium is started for every run with a
// remote-debugging port, Lighthouse measures the page, and the scores are checked against engineering/lighthouse.json.
//
// The logic that decides pass or fail (configuration validation, the floor that thresholds may not go below, aggregation of runs, assertions) is pure and
// is tested without a browser by check:selftest-gate6. The browser part fails closed: a run that errors, reports no score, lands on another URL, or a page
// that produces fewer runs than configured is a FAILURE, never a skipped assertion.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { engDir, projectDir, readJson } from './git.mjs';
import { serveSite } from './server.mjs';

export const AGGREGATIONS = ['optimistic', 'median', 'pessimistic'];
export const LEVELS = ['off', 'warn', 'error'];
export const loadConfig = (file = join(engDir, 'lighthouse.json')) => readJson(file);

// ---- configuration: well formed, and never below the recorded floor -----------------------------------------------------------------------------------------
export function validateConfig(cfg) {
  const p = [];
  if (!Array.isArray(cfg.pages) || !cfg.pages.length || cfg.pages.some((x) => typeof x !== 'string' || !/^[A-Za-z0-9._-]+\.html$/.test(x))) p.push('pages must be a non-empty list of page file names');
  if (!Number.isInteger(cfg.runs) || cfg.runs < 1) p.push(`runs must be a positive integer (got ${cfg.runs})`);
  if (!AGGREGATIONS.includes(cfg.aggregation)) p.push(`aggregation must be one of ${AGGREGATIONS.join(', ')} (got ${cfg.aggregation})`);
  const cats = cfg.categories || {};
  if (!Object.keys(cats).length) p.push('no category is asserted');
  for (const [id, a] of Object.entries(cats)) {
    if (!LEVELS.includes(a.level)) p.push(`category ${id}: level must be one of ${LEVELS.join(', ')}`);
    if (!(typeof a.minScore === 'number' && a.minScore >= 0 && a.minScore <= 1)) p.push(`category ${id}: minScore must be a number from 0 to 1`);
  }
  for (const [id, a] of Object.entries(cfg.audits || {})) {
    if (!LEVELS.includes(a.level)) p.push(`audit ${id}: level must be one of ${LEVELS.join(', ')}`);
    if (a.level === 'off' && !String(a.reason || '').trim()) p.push(`audit ${id}: an assertion switched off must state why`);
    if (a.level !== 'off' && !(typeof a.minScore === 'number' || a.minScore === undefined)) p.push(`audit ${id}: minScore must be a number`);
  }
  return p;
}

// The thresholds may be raised, never lowered: runs, every category's minimum, the categories that fail the command, and the aggregation are compared with the floor.
export function checkFloor(cfg, floor = cfg.floor) {
  const p = [];
  if (!floor) return ['the configuration records no floor'];
  if (cfg.runs < floor.runs) p.push(`runs ${cfg.runs} is below the floor ${floor.runs}`);
  for (const [id, min] of Object.entries(floor.categories)) {
    const a = (cfg.categories || {})[id];
    if (!a) { p.push(`category ${id} is no longer asserted`); continue; }
    if (a.minScore < min) p.push(`category ${id}: minScore ${a.minScore} is below the floor ${min}`);
    if (a.level === 'off') p.push(`category ${id} is switched off`);
    if ((floor.errorCategories || []).includes(id) && a.level !== 'error') p.push(`category ${id} must fail the command (error), not ${a.level}`);
    if (!(floor.errorCategories || []).includes(id) && a.level === 'off') p.push(`category ${id} is switched off`);
  }
  const order = floor.aggregationOrder;
  if (order.indexOf(cfg.aggregation) < order.indexOf(floor.minimumAggregation)) p.push(`aggregation ${cfg.aggregation} is weaker than ${floor.minimumAggregation}`);
  return p;
}

// ---- aggregation and assertion --------------------------------------------------------------------------------------------------------------------------------
export function aggregate(scores, method) {
  if (!AGGREGATIONS.includes(method)) throw new Error(`unknown aggregation "${method}"`);
  if (!scores.length || scores.some((s) => typeof s !== 'number' || Number.isNaN(s))) return null;   // no score, or an unusable one: fail closed
  const s = [...scores].sort((a, b) => a - b);
  if (method === 'optimistic') return s[s.length - 1];
  if (method === 'pessimistic') return s[0];
  return s[Math.floor((s.length - 1) / 2)];   // median; the lower of the two middle values for an even count
}

// results: [{ page, runs: [{ ok, error?, finalUrl?, scores: { categoryId: number|null }, audits?: { id: score } }] }]
// returns { rows, errors, warnings }: one row per page and asserted category; `errors` fail the command, `warnings` are printed only.
export function evaluate(cfg, results) {
  const rows = [], errors = [], warnings = [];
  const bad = (m) => errors.push(m);
  for (const page of cfg.pages) {
    const r = results.find((x) => x.page === page);
    if (!r) { bad(`${page}: no result at all`); continue; }
    if (r.runs.length < cfg.runs) bad(`${page}: ${r.runs.length} of ${cfg.runs} runs were produced`);
    for (const [i, run] of r.runs.entries()) if (!run.ok) bad(`${page}: run ${i + 1} failed (${run.error || 'no reason given'})`);
    const good = r.runs.filter((x) => x.ok);
    for (const [id, a] of Object.entries(cfg.categories)) {
      if (a.level === 'off') continue;
      const scores = good.map((x) => x.scores?.[id]);
      const agg = good.length < cfg.runs ? null : aggregate(scores, cfg.aggregation);
      const ok = agg !== null && agg >= a.minScore;
      rows.push({ page, category: id, level: a.level, minScore: a.minScore, runs: scores, aggregate: agg, ok });
      if (!ok) (a.level === 'error' ? errors : warnings).push(agg === null ? `${page}: ${id} has no usable score in ${cfg.runs} runs` : `${page}: ${id} ${agg} is below ${a.minScore} (${cfg.aggregation} of ${scores.join(', ')})`);
    }
    for (const [id, a] of Object.entries(cfg.audits || {})) {
      if (a.level === 'off' || a.minScore === undefined) continue;
      const scores = good.map((x) => x.audits?.[id]);
      const agg = good.length < cfg.runs ? null : aggregate(scores, cfg.aggregation);
      const ok = agg !== null && agg >= a.minScore;
      rows.push({ page, category: `audit:${id}`, level: a.level, minScore: a.minScore, runs: scores, aggregate: agg, ok });
      if (!ok) (a.level === 'error' ? errors : warnings).push(`${page}: audit ${id} ${agg} is below ${a.minScore}`);
    }
  }
  return { rows, errors, warnings };
}

// ---- the browser part -----------------------------------------------------------------------------------------------------------------------------------------
export async function findChrome() {
  for (const p of [process.env.CHROMIUM_PATH, process.env.CHROME_PATH]) if (p && existsSync(p)) return p;
  try { const { chromium } = await import('playwright'); const p = chromium.executablePath(); if (p && existsSync(p)) return p; } catch { /* fall through */ }
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (existsSync(root)) for (const d of readdirSync(root).filter((n) => /^chromium-\d+$/.test(n)).sort().reverse()) { const p = join(root, d, 'chrome-linux', 'chrome'); if (existsSync(p)) return p; }
  throw new Error('no Chromium found: set CHROMIUM_PATH, or run `npx playwright install chromium`');
}

const freePort = () => new Promise((res, rej) => { const s = createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function startChrome(cfg, exe) {
  const port = await freePort(), dir = mkdtempSync(join(tmpdir(), 'je-lh-'));
  const noSandbox = cfg.chrome.noSandboxWhenRoot && typeof process.getuid === 'function' && process.getuid() === 0;
  const args = [...cfg.chrome.flags, ...(noSandbox ? ['--no-sandbox'] : []), `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, 'about:blank'];
  const proc = spawn(exe, args, { stdio: 'ignore' });
  let exited = null; proc.once('exit', (c, s) => { exited = `${c ?? s}`; });
  for (let i = 0; i < 150; i++) {
    if (exited !== null) { rmSync(dir, { recursive: true, force: true }); throw new Error(`Chromium exited at start (${exited})`); }
    try { const r = await fetch(`http://127.0.0.1:${port}/json/version`); if (r.ok) return { port, stop: async () => { proc.kill('SIGKILL'); await sleep(100); rmSync(dir, { recursive: true, force: true }); } }; } catch { /* not listening yet */ }
    await sleep(200);
  }
  proc.kill('SIGKILL'); rmSync(dir, { recursive: true, force: true });
  throw new Error('Chromium did not open its debugging port within 30 s');
}

// One measurement: a fresh Chromium, one Lighthouse run, always cleaned up. Never throws: a failure is returned as { ok: false, error }.
export async function measureOnce(cfg, exe, url, lighthouse, { keepReport = null } = {}) {
  let chrome;
  try {
    chrome = await startChrome(cfg, exe);
    const res = await lighthouse(url, { port: chrome.port, output: 'json', logLevel: 'error', onlyCategories: Object.keys(cfg.categories) });
    const lhr = res?.lhr;
    if (!lhr) return { ok: false, error: 'Lighthouse returned no result' };
    if (lhr.runtimeError) return { ok: false, error: `${lhr.runtimeError.code}: ${lhr.runtimeError.message}` };
    if (new URL(lhr.finalDisplayedUrl || lhr.finalUrl).pathname !== new URL(url).pathname) return { ok: false, error: `the page ended at ${lhr.finalDisplayedUrl || lhr.finalUrl}, not ${url}` };
    const scores = Object.fromEntries(Object.keys(cfg.categories).map((id) => [id, lhr.categories?.[id]?.score ?? null]));
    const audits = Object.fromEntries(Object.keys(cfg.audits || {}).map((id) => [id, lhr.audits?.[id]?.score ?? null]));
    if (keepReport) writeFileSync(keepReport, JSON.stringify(lhr));
    const complete = Object.values(scores).every((s) => typeof s === 'number');
    return { ok: complete, error: complete ? undefined : `missing category score (${JSON.stringify(scores)})`, finalUrl: lhr.finalUrl, scores, audits, lighthouseVersion: lhr.lighthouseVersion, userAgent: lhr.environment?.hostUserAgent };
  } catch (e) {
    return { ok: false, error: String(e.message || e).split('\n')[0] };
  } finally { if (chrome) await chrome.stop(); }
}

// Serves `root`, measures every configured page `cfg.runs` times, and returns { results, meta }.
export async function measureAll(cfg, { root = projectDir, outDir = null, log = () => {} } = {}) {
  const exe = await findChrome();
  const mod = await import('lighthouse');
  const lighthouse = mod.default;
  const site = serveSite(root);
  const results = [];
  let meta = { chrome: exe };
  try {
    if (outDir) mkdirSync(outDir, { recursive: true });
    for (const page of cfg.pages) {
      const runs = [];
      for (let i = 1; i <= cfg.runs; i++) {
        log(`${page} run ${i}/${cfg.runs}`);
        const run = await measureOnce(cfg, exe, `${site.base}${page}`, lighthouse, { keepReport: outDir ? join(outDir, `${page.replace(/\.html$/, '')}-run${i}.json`) : null });
        if (run.lighthouseVersion) meta = { ...meta, lighthouseVersion: run.lighthouseVersion, userAgent: run.userAgent };
        runs.push(run);
      }
      results.push({ page, runs });
    }
  } finally { site.close(); }
  return { results, meta };
}
