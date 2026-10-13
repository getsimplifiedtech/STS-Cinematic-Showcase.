// check:determinism. The build is a pure function of the configuration and the sources.
//   1. two builds into fresh folders are byte-identical, and the build writes exactly the pages in the page registry
//   2. the pages committed in the project folder equal a fresh build (no stale output)
//   3. a build under a different time zone, locale, working directory, project path, file timestamps and NODE_ENV gives the same bytes
//   4. the output carries no absolute paths, timestamps or machine names; UTF-8, LF line endings, one final newline
//   5. the build sources contain no clock, random, environment or locale-dependent calls
// Run: node engineering/checks/determinism.mjs
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, mkdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { hostname } from 'node:os';
import { isMain, listFiles, projectDir, readJson, sha256, tempDir } from '../lib/git.mjs';
import { buildCommand, buildCommandText, coreDir, project } from '../lib/project.mjs';
import { pagesOf } from '../lib/site.mjs';

function build(root, out, env = {}, cwd = root) {
  mkdirSync(out, { recursive: true });
  const [cmd, args] = buildCommand(root, out);
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', env: { ...process.env, ...env } });
  return { status: r.status, text: r.stdout + r.stderr };
}
const digest = (dir) => Object.fromEntries(readdirSync(dir).sort().map((f) => [f, sha256(readFileSync(join(dir, f)))]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const diffNames = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]);

export function checkDeterminism({ root = projectDir } = {}) {
  const problems = [], notes = [];
  const pages = pagesOf(root);
  const tmp = tempDir('determinism');
  try {
    // 1. two builds
    const a = join(tmp, 'a'), b = join(tmp, 'b');
    for (const out of [a, b]) { const r = build(root, out); if (r.status !== 0) { problems.push(`build failed: ${r.text}`); return { problems, notes }; } }
    const da = digest(a), db = digest(b);
    if (!same(da, db)) problems.push(`two builds differ: ${diffNames(da, db).join(', ')}`);
    // 404.html is the one delivered page that is not in the page registry (the host serves it for a missing path; specification 16, section 7)
    const expected = [...pages, ...(da['404.html'] ? ['404.html'] : [])].sort();
    if (!same(Object.keys(da), expected)) problems.push(`build wrote ${Object.keys(da).join(', ')}; the page registry lists ${[...pages].sort().join(', ')}`);
    else notes.push(`two builds identical (${pages.length} pages${da['404.html'] ? ' and 404.html' : ''}, nothing else written)`);

    // 2. committed output
    const stale = expected.filter((f) => !existsSync(join(root, f)) || sha256(readFileSync(join(root, f))) !== da[f]);
    if (stale.length) problems.push(`committed pages differ from a fresh build (run "${buildCommandText}"): ${stale.join(', ')}`);
    else notes.push('committed pages equal a fresh build');

    // 3. a different environment: copy of the project in another path with old timestamps, other zone, locale, cwd and NODE_ENV
    // A project that lives inside the engineering's own folder (the generic fixture) imports the engineering by relative path, so the copy keeps that layout: the
    // engineering folder is copied with the project at the same offset inside it. Any other project is copied on its own.
    const inCore = root.startsWith(coreDir + sep);
    // a project beside the engineering (the engineering inside the repository, the project in a folder of its own) is copied with the engineering at the same offset, because the project's
    // own code may import the engineering by relative path; a project that carries the engineering in its own folder is copied alone
    const coreBeside = !inCore && !coreDir.startsWith(root + sep) && !relative(project.repoRoot, coreDir).startsWith('..') && !relative(project.repoRoot, root).startsWith('..');   // a root outside the repository (a temporary copy, as the self-tests make) has no offset to keep: it is copied alone, never onto itself
    const copyBase = join(tmp, 'copy with space');
    const copy = inCore ? join(copyBase, 'engineering', relative(coreDir, root)) : coreBeside ? join(copyBase, relative(project.repoRoot, root)) : join(copyBase, 'je');
    const filter = (s) => !/node_modules|[\\/]shots|[\\/]\.lighthouseci|[\\/]\.git$/.test(s);
    if (coreBeside) cpSync(coreDir, join(copyBase, relative(project.repoRoot, coreDir)), { recursive: true, filter });
    cpSync(inCore ? coreDir : root, inCore ? join(copyBase, 'engineering') : copy, { recursive: true, filter });
    const old = new Date('2001-02-03T04:05:06Z');
    for (const f of listFiles(copy)) utimesSync(join(copy, f), old, old);
    const c = join(tmp, 'c');
    const r = build(copy, c, { TZ: 'Pacific/Kiritimati', LC_ALL: 'tr_TR.UTF-8', LANG: 'tr_TR.UTF-8', NODE_ENV: 'production', TMPDIR: tmp }, tmp);
    if (r.status !== 0) problems.push(`build in a different environment failed: ${r.text}`);
    else if (!same(digest(c), da)) problems.push(`build differs under a different time zone, locale, path, cwd or timestamps: ${diffNames(digest(c), da).join(', ')}`);
    else notes.push('identical under another time zone, locale, working directory, project path, file timestamps and NODE_ENV');

    // 4. what is in the output
    const leaks = [
      [/[A-Za-z]:\\|\/(home|tmp|root|Users|var)\//, 'an absolute file path'],
      [/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, 'a timestamp'],
      [new RegExp(hostname().replace(/[.*+?^${}()|[\]\\]/g, '\\\\$&')), 'the machine name'],
    ];
    for (const f of pages) {
      const buf = readFileSync(join(a, f)), text = buf.toString('utf8');
      for (const [re, what] of leaks) if (re.test(text)) problems.push(`${f} contains ${what}`);
      if (buf[0] === 0xef && buf[1] === 0xbb) problems.push(`${f} starts with a byte-order mark`);
      if (text.includes('\r')) problems.push(`${f} contains CR characters`);
      if (!text.endsWith('</html>\n') || text.endsWith('\n\n')) problems.push(`${f} must end with exactly one newline after </html>`);
      if (Buffer.from(text, 'utf8').compare(buf) !== 0) problems.push(`${f} is not valid UTF-8`);
    }
    if (!problems.length) notes.push('output has no absolute paths, timestamps, machine names, BOM or CR; ends with one newline');

    // 5. nondeterministic APIs in the build sources
    const forbidden = /\b(Date\.now|new Date|Math\.random|performance\.now|randomUUID|crypto\.random\w*|process\.env|os\.hostname|hostname\(\)|toLocale\w*|localeCompare|Intl\.)/;
    const sources = project.delivery.sourceRoots.flatMap((r) => (statSync(join(root, r)).isDirectory() ? listFiles(join(root, r)).map((f) => `${r}/${f}`) : [r]));
    for (const f of sources) {
      readFileSync(join(root, f), 'utf8').split('\n').forEach((line, i) => {
        if (forbidden.test(line.replace(/\/\/.*$/, ''))) problems.push(`${f}:${i + 1} uses a clock, random, environment or locale-dependent call: ${line.trim().slice(0, 80)}`);
      });
    }
    notes.push(`${sources.length} build source files scanned for clock, random, environment and locale calls`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  return { problems, notes };
}

if (isMain(import.meta.url)) {
  const { problems, notes } = checkDeterminism();
  notes.forEach((n) => console.log('  ' + n));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:determinism`);
  process.exit(problems.length ? 1 : 0);
}
