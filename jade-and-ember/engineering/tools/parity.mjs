// Parity proof for the G6-5 refactor (APR-JE-046): the same verification, before and after, must give the same report. Read only; it runs nothing.
//   node engineering/tools/parity.mjs normalise <verify-log>                 print the log with everything that legitimately varies between two runs removed
//   node engineering/tools/parity.mjs compare <reference> <log> [--allow f]  compare two logs (either raw or already normalised); every line that differs
//                                                                            must be pinned in the allow file with its reason, or the comparison fails
// What is removed: timings, measured milliseconds (and which event was slowest), temporary paths, ports, the commit a manifest names, and the engine digest and seal of the verification record
// (the verifying code is the thing being changed, so its digest differs by construction). What is kept: every check result, every note, every "caught:" line (so the
// self-test cases are counted line by line), the delivered tree hash and the candidate artifact digest.
import { readFileSync } from 'node:fs';
import { isMain } from '../lib/git.mjs';

export function normalise(text) {
  return text
    .split('\n')
    .map((l) => l
      .replace(/\((\d+(?:\.\d+)?) s\)/g, '(T s)')
      .replace(/^(\s+(?:PASS|FAIL)\s+\S+)\s+\d+(?:\.\d+)? s\b/, '$1 T s')
      .replace(/\b\d+(?:\.\d+)? ms\b/g, 'N ms')
      .replace(/slowest event: \w+/g, 'slowest event: EVENT')
      .replace(/, \d+ s\)/g, ', T s)')
      .replace(/\b\d+(?:\.\d+)? min\b/g, 'T min')
      .replace(/(\/tmp\/|\/var\/folders\/)\S+/g, 'TMP')
      .replace(/127\.0\.0\.1:\d+/g, '127.0.0.1:PORT')
      .replace(/manifest for [0-9a-f]{7,40}/g, 'manifest for COMMIT')
      .replace(/\b\d+ text files scanned/, 'N text files scanned')
      .replace(/\b\d+ files in the working tree and the added lines of \d+ commits/, 'N files in the working tree and the added lines of N commits')
      .replace(/\b\d+ files in (\d+ components)/, 'N files in $1')
      .replace(/engine [0-9a-f]{16}…/g, 'engine ENGINE…')
      .replace(/seal [0-9a-f]{64}/g, 'seal SEAL')
      .trimEnd())
    .filter((l, i, a) => !(l === '' && a[i - 1] === ''))
    .join('\n');
}

// the longest common subsequence of two line arrays, to a list of { op: '-' | '+', line }
export function lineDiff(a, b) {
  const n = a.length, m = b.length;
  const t = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { i++; j++; } else if (t[i + 1][j] >= t[i][j + 1]) out.push({ op: '-', line: a[i++] }); else out.push({ op: '+', line: b[j++] });
  }
  while (i < n) out.push({ op: '-', line: a[i++] });
  while (j < m) out.push({ op: '+', line: b[j++] });
  return out;
}

// allow: [{ id, reason, was: <normalised line or null>, now: <normalised line or null> }]; each entry is spent by exactly the differences it names
export function compare(reference, log, allow = []) {
  const diff = lineDiff(normalise(reference).split('\n'), normalise(log).split('\n'));
  const spent = new Map();
  const unexpected = [];
  for (const d of diff) {
    const hit = allow.find((a) => (d.op === '-' ? a.was === d.line : a.now === d.line));
    if (hit) spent.set(hit, (spent.get(hit) || 0) + 1); else unexpected.push(d);
  }
  const unused = allow.filter((a) => !spent.has(a));
  return { differences: diff.length, unexpected, unused, allowed: [...spent.entries()].map(([a, n]) => ({ id: a.id, reason: a.reason, lines: n })) };
}

if (isMain(import.meta.url)) {
  const [cmd, ...rest] = process.argv.slice(2);
  const flag = rest.indexOf('--allow');
  const allowFile = flag > -1 ? rest.splice(flag, 2)[1] : null;
  if (cmd === 'normalise' && rest.length === 1) {
    console.log(normalise(readFileSync(rest[0], 'utf8')));
  } else if (cmd === 'compare' && rest.length === 2) {
    const allow = allowFile ? JSON.parse(readFileSync(allowFile, 'utf8')).differences : [];
    const r = compare(readFileSync(rest[0], 'utf8'), readFileSync(rest[1], 'utf8'), allow);
    console.log(`${r.differences} differing line(s): ${r.differences - r.unexpected.length} pinned in the allow file, ${r.unexpected.length} unexpected`);
    for (const a of r.allowed) console.log(`  allowed ${a.id} (${a.lines} line${a.lines === 1 ? '' : 's'}): ${a.reason}`);
    for (const u of r.unused) console.log(`  UNUSED allow entry ${u.id}: it names a difference that did not occur`);
    for (const u of r.unexpected) console.log(`  ${u.op} ${u.line}`);
    console.log(r.unexpected.length || r.unused.length ? 'PARITY FAILED' : 'PARITY holds');
    process.exit(r.unexpected.length || r.unused.length ? 1 : 0);
  } else {
    console.error('usage: parity.mjs normalise <log> | compare <reference> <log> [--allow <file>]');
    process.exit(2);
  }
}
