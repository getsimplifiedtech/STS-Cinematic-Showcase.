// The framework snapshot (G6-8 Stage A, specification 16, section 10.9). A consumer that cannot download the private composite action (a public repository) carries a verified
// COPY of the files it needs from the framework repository, with an integrity record. This tool is the producer and the verifier. It binds no project (it imports nothing of the
// engineering that reads a manifest), so it can run before anything else in a workflow.
//
//   node tools/snapshot.mjs inventory --source <framework repo> --commit <40-hex> [--json]   every file under the roots, its role, whether it is public, and why
//   node tools/snapshot.mjs export    --source <framework repo> --commit <40-hex> --out <consumer repo> [--replace] [--expect-tree <snapshot tree id the owner approved>] [--allow-placeholders  (proof runs only: export although the notice still has open decisions)]
//   node tools/snapshot.mjs verify    --repo <consumer repo> [--against <framework repo>]
//
// What the record proves, and what it does not. The record names the framework repository, the exact commit and that commit's tree, and lists every public file with its mode, its
// git object id and its SHA-256, plus the object id of the whole set computed as a git tree. Anyone holding the files recomputes all of it from the bytes (verify --repo): the
// copy equals the record, no file is added, missing, altered or made executable. Only someone holding the private repository can show that the record equals the commit (verify
// --against): the selected set at that commit, by the profile at that commit, must be identical to the record, file by file, down to the object ids. A public repository's CI can
// do the first and cannot do the second; it detects drift and unreviewed edits, not a record forged together with its files.
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SNAPSHOT_RECORD = 'sts-framework-snapshot.json';
export const SNAPSHOT_SCHEMA = 'sts/framework-snapshot@1';
export const FRAMEWORK_REPOSITORY = 'getsimplifiedtech/sts-web-design-framework';
export const PROFILE_PATH = 'engineering/ci/snapshot-profile.json';
const SHA40 = /^[0-9a-f]{40}$/;
const SHA64 = /^[0-9a-f]{64}$/;
const RUNTIME_ARTEFACTS = ['node_modules', '.reports', '.selftest'];
const CLASS_VALUES = ['adapter-industry', 'devtool'];
// The production hard stop is pinned here, in the verifier itself, so that no way of running the verifier can leave it out (a missing pin is an error, never an empty list).
export const PROTECTED_SHA256 = { 'engineering/lib/authenticity.mjs': '0b57bc9888707192ecd544c45929836895776075c6817758c3fdce09b93a7eef' };
// A path of a snapshot is relative, POSIX, and has no segment that names the current folder, the parent, a git folder or nothing.
export function pathProblem(p) {
  if (typeof p !== 'string' || !p) return 'is empty';
  if (p.includes('\\') || p.includes('\0')) return 'has a backslash or a NUL character';
  if (p.startsWith('/')) return 'is absolute';
  for (const seg of p.split('/')) {
    if (!seg || seg === '.' || seg === '..' || seg.toLowerCase() === '.git') return `has the segment "${seg}"`;
    // names that some file systems treat as another name (a trailing dot or space, a stream suffix, an 8.3 alias of .git) or that hide characters
    if (/[. ]$/.test(seg) || seg.includes(':') || /^git~\d/i.test(seg) || /[\p{Cc}\u200b-\u200f\u2028-\u202e\u2060\ufeff]/u.test(seg)) return `has the segment "${seg}", which some file systems read as another name`;
  }
  return '';
}

const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const sha1 = (b) => createHash('sha1').update(b).digest();
export const blobOid = (buf) => sha1(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf])).toString('hex');

// ---- git tree object ids, computed from file contents alone ---------------------------------------------------------------------------------------------------------
// files: [{ path, mode ('100644' | '100755'), blob (40-hex) }] with POSIX paths relative to the root of the tree.
export function treeOid(files) {
  const root = { files: new Map(), dirs: new Map() };
  for (const f of files) {
    const parts = f.path.split('/');
    let node = root;
    for (const d of parts.slice(0, -1)) { if (!node.dirs.has(d)) node.dirs.set(d, { files: new Map(), dirs: new Map() }); node = node.dirs.get(d); }
    node.files.set(parts.at(-1), f);
  }
  const oidOf = (node) => {
    const entries = [
      ...[...node.files].map(([name, f]) => ({ key: Buffer.from(name), body: Buffer.concat([Buffer.from(`${f.mode} ${name}\0`), Buffer.from(f.blob, 'hex')]) })),
      ...[...node.dirs].map(([name, d]) => ({ key: Buffer.from(`${name}/`), body: Buffer.concat([Buffer.from(`40000 ${name}\0`), Buffer.from(oidOf(d), 'hex')]) })),
    ].sort((a, b) => Buffer.compare(a.key, b.key));
    const content = Buffer.concat(entries.map((e) => e.body));
    return sha1(Buffer.concat([Buffer.from(`tree ${content.length}\0`), content])).toString('hex');
  };
  return oidOf(root);
}

// ---- the profile ------------------------------------------------------------------------------------------------------------------------------------------------------------
export function globToRegExp(pattern) {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*' && pattern[i + 1] === '*') { if (pattern[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i += 1; } }
    else if (c === '*') re += '[^/]*';
    else re += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}
export function parseProfile(text) {
  const p = JSON.parse(text);
  const problems = [];
  if (p.schema !== 'sts/snapshot-profile@1') problems.push('the snapshot profile has the wrong schema');
  if (!Array.isArray(p.roots) || !p.roots.length) problems.push('the snapshot profile names no root');
  if (!Array.isArray(p.rules) || !p.rules.length) problems.push('the snapshot profile has no rule');
  for (const [i, r] of (p.rules || []).entries()) {
    if (typeof r.pattern !== 'string' || typeof r.role !== 'string' || typeof r.public !== 'boolean') problems.push(`rule ${i} needs a pattern, a role and public true or false`);
    if (r.public === false && !(typeof r.note === 'string' && r.note.length >= 20)) problems.push(`rule ${i} (${r.pattern}) excludes files without a reason of at least 20 characters`);
    for (const f of r.flags || []) if (!['governance', 'security', 'thirdParty', 'licence'].includes(f)) problems.push(`rule ${i} (${r.pattern}) has an unknown flag ${f}`);
  }
  if (!Array.isArray(p.protected)) problems.push('the snapshot profile has no list of protected files');
  const classes = p.classes ?? {};
  if (typeof classes !== 'object' || Array.isArray(classes) || classes === null) problems.push('the snapshot profile classes must be an object of path to class');
  else for (const [path, c] of Object.entries(classes)) { if (!CLASS_VALUES.includes(c)) problems.push(`classes: ${path} has the unknown class ${c}`); if (pathProblem(path)) problems.push(`classes: ${path} ${pathProblem(path)}`); }
  if (problems.length) throw new Error(problems.join('; '));
  return { ...p, classes, compiled: p.rules.map((r) => ({ ...r, re: globToRegExp(r.pattern) })) };
}
const inRoots = (profile, path) => profile.roots.some((r) => path === r || path.startsWith(`${r}/`));
export function classify(profile, path) {
  const rule = profile.compiled.find((r) => r.re.test(path));
  return rule ? { rule: rule.pattern, role: rule.role, public: rule.public, flags: rule.flags || [], note: rule.note || '' } : null;
}

// ---- reading a commit of the framework repository ---------------------------------------------------------------------------------------------------------------
const git = (cwd, args, opts = {}) => execFileSync('git', args, { cwd, maxBuffer: 1 << 28, ...opts });
export function readCommit(source, commit) {
  if (!SHA40.test(commit || '')) throw new Error('--commit must be a full 40-character lower-case commit SHA');
  let kind = '';
  try { kind = git(source, ['cat-file', '-t', commit], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* not an object */ }
  if (kind !== 'commit') throw new Error(`${commit} is not a commit of ${source}`);
  const tree = git(source, ['rev-parse', `${commit}^{tree}`], { encoding: 'utf8' }).trim();
  const raw = git(source, ['ls-tree', '-r', '-z', '--full-tree', commit]);
  const entries = raw.toString('utf8').split('\0').filter(Boolean).map((l) => { const m = /^(\d+) (\w+) ([0-9a-f]{40})\t(.*)$/s.exec(l); if (!m) throw new Error(`an entry of the tree cannot be read (only SHA-1 repositories are supported): ${l.slice(0, 80)}`); return { mode: m[1], type: m[2], oid: m[3], path: m[4] }; });
  // every blob of the entries is read in one git process; a blob outside the cache is read singly
  const cache = new Map();
  const wanted = [...new Set(entries.filter((e) => e.type === 'blob').map((e) => e.oid))];
  const r = spawnSync('git', ['cat-file', '--batch'], { cwd: source, input: `${wanted.join('\n')}\n`, maxBuffer: 1 << 29 });
  if (r.status === 0) {
    let at = 0;
    const buf = r.stdout;
    while (at < buf.length) {
      const nl = buf.indexOf(10, at);
      const [oid, type, size] = buf.subarray(at, nl).toString().split(' ');
      if (type !== 'blob') break;
      const n = Number(size);
      cache.set(oid, buf.subarray(nl + 1, nl + 1 + n));
      at = nl + 1 + n + 1;
    }
  }
  const blob = (oid) => cache.get(oid) ?? git(source, ['cat-file', 'blob', oid]);
  return { commit, tree, entries, blob };
}

// Every file under the roots at the commit, classified. A file that matches no rule, a link or a submodule is an error: nothing is public by default.
export function inventory(source, commit) {
  const c = readCommit(source, commit);
  const profileEntry = c.entries.find((e) => e.path === PROFILE_PATH);
  if (!profileEntry) throw new Error(`${PROFILE_PATH} is missing at ${commit}`);
  const profileText = c.blob(profileEntry.oid).toString('utf8');
  const profile = parseProfile(profileText);
  const rows = [], problems = [], seen = new Map();
  for (const e of c.entries) {
    if (!inRoots(profile, e.path)) continue;
    const bad = pathProblem(e.path);
    if (bad) { problems.push(`${e.path}: the path ${bad}`); continue; }
    const low = e.path.toLowerCase();
    if (seen.has(low)) problems.push(`${e.path}: differs only in letter case from ${seen.get(low)} (the two cannot live together on every file system)`);
    seen.set(low, e.path);
    if (e.type !== 'blob' || !['100644', '100755'].includes(e.mode)) { problems.push(`${e.path}: a ${e.type} of mode ${e.mode} (only regular files can be part of a snapshot)`); continue; }
    const cls = classify(profile, e.path);
    if (!cls) { problems.push(`${e.path}: matches no rule of the snapshot profile`); continue; }
    const body = c.blob(e.oid);
    rows.push({ path: e.path, mode: e.mode, blob: e.oid, bytes: body.length, sha256: sha256(body), ...cls });
  }
  rows.sort((a, b) => (a.path < b.path ? -1 : 1));
  return { commit: c.commit, tree: c.tree, profile, profileText, profileBlob: profileEntry.oid, rows, problems, read: c };
}

// The class of a file (the purity scan skips development tools and industry adapters) is stated in the hashed profile, so that the consumer does not need the private manifest and
// cannot change it without changing the profile. At the framework the profile must agree with the extraction manifest (verifyAgainst, which the producer runs on every export; no other check compares them).
const classOf = (profile, path) => profile.classes[path];
function manifestClassesOf(read) {
  const m = read.entries.find((e) => e.path === 'engineering/EXTRACTION-MANIFEST.json');
  if (!m) return new Map();
  const files = JSON.parse(read.blob(m.oid).toString('utf8')).files || [];
  return new Map(files.filter((f) => f.class === 'adapter-industry' || f.class === 'devtool').map((f) => [f.destination, f.class]));
}

export function buildRecord(source, commit) {
  const inv = inventory(source, commit);
  if (inv.problems.length) throw new Error(`the inventory has problems:\n  - ${inv.problems.join('\n  - ')}`);
  const pub = inv.rows.filter((r) => r.public);
  for (const p of Object.keys(inv.profile.classes)) if (!pub.some((r) => r.path === p)) throw new Error(`the profile gives a class to ${p}, which is not a public file`);
  const files = pub.map((r) => ({ path: r.path, mode: r.mode, blob: r.blob, sha256: r.sha256, bytes: r.bytes, ...(classOf(inv.profile, r.path) ? { class: classOf(inv.profile, r.path) } : {}) }));
  const protectedFiles = Object.fromEntries(inv.profile.protected.map((p) => [p, files.find((f) => f.path === p)?.sha256 ?? null]));
  for (const [p, h] of Object.entries(protectedFiles)) if (!h) throw new Error(`the protected file ${p} is not part of the public set`);
  return {
    schema: SNAPSHOT_SCHEMA,
    framework: { repository: FRAMEWORK_REPOSITORY, commit: inv.commit, tree: inv.tree },
    profile: { path: PROFILE_PATH, sha256: sha256(Buffer.from(inv.profileText)), blob: inv.profileBlob },
    roots: inv.profile.roots,
    protected: protectedFiles,
    snapshotTree: treeOid(files),
    totals: { files: files.length, bytes: files.reduce((n, f) => n + f.bytes, 0), excluded: inv.rows.length - pub.length },
    files,
  };
}

// ---- verification -----------------------------------------------------------------------------------------------------------------------------------------------------------
function trackedUnder(repo, roots) {
  // Only the folders the engineering itself creates when it runs are skipped, and only directly under a root.
  const skipped = new Set(roots.flatMap((r) => RUNTIME_ARTEFACTS.map((n) => `${r}/${n}`)));
  const walk = (rel) => {
    let st;
    try { st = lstatSync(join(repo, rel)); } catch { return []; }
    if (!st.isDirectory()) return [rel];
    return readdirSync(join(repo, rel)).sort().flatMap((n) => (skipped.has(`${rel}/${n}`) ? [] : walk(`${rel}/${n}`)));
  };
  if (existsSync(join(repo, '.git'))) {
    let out;
    try { out = git(repo, ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...roots], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { throw new Error(`git cannot list the files of ${repo} (${String(e.stderr || e.message).trim().split('\n')[0]}); a snapshot is not verified from a guess`); }
    return out.split('\0').filter(Boolean).filter((p) => { try { lstatSync(join(repo, p)); return true; } catch { return false; } }).sort();
  }
  return roots.flatMap(walk).sort();
}

export function readRecord(repo, name = SNAPSHOT_RECORD) {
  const p = join(repo, name);
  if (!existsSync(p)) return { problems: [`${name} is missing`] };
  let r;
  try { r = JSON.parse(readFileSync(p, 'utf8')); } catch (e) { return { problems: [`${name} is not valid JSON: ${e.message}`] }; }
  if (!r || typeof r !== 'object' || Array.isArray(r)) return { problems: [`${name} is not a JSON object`] };
  const problems = [];
  const keysOf = (o, allowed, where) => { for (const k of Object.keys(o || {})) if (!allowed.includes(k)) problems.push(`${where}: the unknown key ${k}`); };
  keysOf(r, ['schema', 'framework', 'profile', 'roots', 'protected', 'snapshotTree', 'totals', 'files'], name);
  keysOf(r.framework, ['repository', 'commit', 'tree'], `${name} framework`);
  keysOf(r.profile, ['path', 'sha256', 'blob'], `${name} profile`);
  keysOf(r.totals, ['files', 'bytes', 'excluded'], `${name} totals`);
  if (r.schema !== SNAPSHOT_SCHEMA) problems.push(`${name}: the schema is not ${SNAPSHOT_SCHEMA}`);
  if (r.framework?.repository !== FRAMEWORK_REPOSITORY) problems.push(`${name}: the framework repository must be ${FRAMEWORK_REPOSITORY}`);
  if (!SHA40.test(r.framework?.commit || '') || !SHA40.test(r.framework?.tree || '') || !SHA40.test(r.snapshotTree || '')) problems.push(`${name}: the commit, its tree and the snapshot tree must be full 40-hex ids`);
  if (!Array.isArray(r.files) || !r.files.length) problems.push(`${name}: lists no file`);
  else for (const f of r.files) {
    if (!(f && typeof f.path === 'string' && ['100644', '100755'].includes(f.mode) && SHA40.test(f.blob || '') && SHA64.test(f.sha256 || '') && Number.isInteger(f.bytes) && f.bytes >= 0)) { problems.push(`${name}: a file entry is malformed (${JSON.stringify(f).slice(0, 80)})`); break; }
    keysOf(f, ['path', 'mode', 'blob', 'sha256', 'bytes', 'class'], `${name} ${f.path}`);
    if (pathProblem(f.path)) { problems.push(`${name}: the path ${f.path} ${pathProblem(f.path)}`); break; }
  }
  if (!Array.isArray(r.roots) || !r.roots.length || r.roots.some((x) => typeof x !== 'string' || pathProblem(x))) problems.push(`${name}: the roots are malformed`);
  return { record: r, problems };
}

// Public verification: the files in `repo` are exactly the files of the record. `protectedHashes` pins the files that may never differ (the production hard stop).
export function verifyRepo(repo, { name = SNAPSHOT_RECORD, protectedHashes = PROTECTED_SHA256 } = {}) {
  const { record, problems } = readRecord(repo, name);
  const notes = [];
  if (!record || problems.length) return { problems, notes, record };
  // the pin of the verifier always applies; a caller may add pins, never remove one
  protectedHashes = { ...protectedHashes, ...PROTECTED_SHA256 };
  const want = new Map(record.files.map((f) => [f.path, f]));
  if (want.size !== record.files.length) problems.push('the record lists a path twice');
  for (const p of want.keys()) if (!record.roots.some((r) => p.startsWith(`${r}/`)) || p.split('/').includes('..') || p.startsWith('/')) problems.push(`${p}: is not inside a root of the snapshot`);
  const have = trackedUnder(repo, record.roots);
  const haveSet = new Set(have);
  for (const p of have) if (!want.has(p)) problems.push(`${p}: is in the snapshot folders but not in the record (an added file)`);
  for (const p of want.keys()) if (!haveSet.has(p)) problems.push(`${p}: is in the record but missing from the snapshot folders`);
  const checked = [];
  for (const f of record.files) {
    const abs = join(repo, f.path);
    if (!haveSet.has(f.path)) continue;
    let st;
    try { st = lstatSync(abs); } catch { continue; }
    if (!st.isFile()) { problems.push(`${f.path}: is not a regular file`); continue; }
    const buf = readFileSync(abs);
    const mode = st.mode & 0o111 ? '100755' : '100644';
    if (mode !== f.mode) problems.push(`${f.path}: mode ${mode}, the record says ${f.mode}`);
    if (buf.length !== f.bytes) problems.push(`${f.path}: ${buf.length} bytes, the record says ${f.bytes}`);
    if (sha256(buf) !== f.sha256) problems.push(`${f.path}: SHA-256 differs from the record (${sha256(buf).slice(0, 12)}… against ${f.sha256.slice(0, 12)}…)`);
    if (blobOid(buf) !== f.blob) problems.push(`${f.path}: git object id differs from the record`);
    checked.push(f);
  }
  if (!problems.length && treeOid(record.files) !== record.snapshotTree) problems.push('the record\'s own snapshotTree does not match the files it lists');
  if (!record.totals || record.totals.files !== record.files.length || record.totals.bytes !== record.files.reduce((n, f) => n + f.bytes, 0) || !Number.isInteger(record.totals.excluded)) problems.push('the record\'s totals are missing or do not match the files it lists');
  // the profile that selected the set is itself part of the set, and must agree with the record
  const profileFile = record.files.find((f) => f.path === record.profile?.path);
  if (!profileFile) problems.push('the snapshot profile is not part of the snapshot');
  else {
    if (profileFile.sha256 !== record.profile.sha256) problems.push('the record\'s profile hash differs from the profile file it lists');
    if (profileFile.blob !== record.profile.blob) problems.push('the record\'s profile object id differs from the profile file it lists');
    if (existsSync(join(repo, profileFile.path))) {
      try {
        const profile = parseProfile(readFileSync(join(repo, profileFile.path), 'utf8'));
        for (const f of record.files) { const c = classify(profile, f.path); if (!c) problems.push(`${f.path}: matches no rule of the profile`); else if (!c.public) problems.push(`${f.path}: the profile excludes this file, but the snapshot carries it`); }
        if (JSON.stringify(profile.roots) !== JSON.stringify(record.roots)) problems.push('the roots of the record differ from the roots of the profile');
        if (JSON.stringify(profile.protected) !== JSON.stringify(Object.keys(record.protected || {}))) problems.push('the protected files of the record differ from those of the profile');
        // the class of each file is the profile\'s (hashed above), not a statement of the record
        for (const f of record.files) if (f.class !== classOf(profile, f.path)) problems.push(`${f.path}: the record says class ${f.class ?? 'none'}, the profile says ${classOf(profile, f.path) ?? 'none'}`);
        for (const path of Object.keys(profile.classes)) if (!want.has(path)) problems.push(`${path}: the profile gives it a class, but it is not part of the snapshot`);
      } catch (e) { problems.push(`the profile cannot be read: ${e.message}`); }
    }
  }
  for (const [p, h] of Object.entries(protectedHashes)) {
    const f = want.get(p);
    if (!f) problems.push(`${p}: the protected file is not part of the snapshot`);
    else if (f.sha256 !== h) problems.push(`${p}: the record carries ${f.sha256.slice(0, 12)}…, the verifying code pins ${h.slice(0, 12)}…`);
    if (record.protected?.[p] !== h) problems.push(`${p}: the record's protected hash differs from the pinned one`);
  }
  if (!problems.length) notes.push(`snapshot of ${record.framework.repository} at ${record.framework.commit.slice(0, 12)}…: ${record.files.length} files, ${record.totals.bytes} bytes, snapshot tree ${record.snapshotTree.slice(0, 12)}…; every file equals its record (SHA-256, git object id, mode), no file added or missing`);
  return { problems, notes, record };
}

// Private verification: the record equals the framework repository at the commit it names, file by file.
export function verifyAgainst(record, source) {
  const problems = [];
  let inv;
  try { inv = inventory(source, record.framework.commit); } catch (e) { return { problems: [`the commit cannot be read in ${source}: ${e.message}`] }; }
  problems.push(...inv.problems);
  if (inv.tree !== record.framework.tree) problems.push(`the commit's tree is ${inv.tree}, the record says ${record.framework.tree}`);
  if (inv.profileBlob !== record.profile.blob || sha256(Buffer.from(inv.profileText)) !== record.profile.sha256) problems.push('the profile at the commit is not the profile the record names');
  // the classes of the profile are the classes of the private extraction manifest, for every public file
  // (a tree that has no extraction manifest, such as a scratch framework built by a self-test, has nothing to compare with)
  if (inv.read.entries.some((e) => e.path === 'engineering/EXTRACTION-MANIFEST.json')) {
    const manifestClasses = manifestClassesOf(inv.read);
    const pubPaths = new Set(inv.rows.filter((r) => r.public).map((r) => r.path));
    for (const [path, c] of manifestClasses) if (pubPaths.has(path) && inv.profile.classes[path] !== c) problems.push(`${path}: the extraction manifest says class ${c}, the profile ${inv.profile.classes[path] ?? 'none'}`);
    for (const [path, c] of Object.entries(inv.profile.classes)) if (manifestClasses.get(path) !== c) problems.push(`${path}: the profile says class ${c}, the extraction manifest ${manifestClasses.get(path) ?? 'none'}`);
  }
  const wantRows = inv.rows.filter((r) => r.public).map((r) => ({ path: r.path, mode: r.mode, blob: r.blob, sha256: r.sha256, bytes: r.bytes, ...(classOf(inv.profile, r.path) ? { class: classOf(inv.profile, r.path) } : {}) }));
  const a = new Map(wantRows.map((r) => [r.path, r])), b = new Map(record.files.map((r) => [r.path, r]));
  for (const p of a.keys()) if (!b.has(p)) problems.push(`${p}: is public at the commit but not in the record`);
  for (const p of b.keys()) if (!a.has(p)) problems.push(`${p}: is in the record but is not a public file at the commit`);
  for (const [p, r] of a) { const x = b.get(p); if (x && ['mode', 'blob', 'sha256', 'bytes', 'class'].some((k) => x[k] !== r[k])) problems.push(`${p}: differs from the commit (${['mode', 'blob', 'sha256', 'bytes', 'class'].filter((k) => x[k] !== r[k]).join(', ')})`); }
  if (treeOid(wantRows) !== record.snapshotTree) problems.push('the snapshot tree computed from the commit differs from the record');
  return { problems, inventory: inv };
}

// ---- export -----------------------------------------------------------------------------------------------------------------------------------------------------------
// The real path of a folder that may not exist yet: the real path of its nearest existing ancestor, plus the names below it. Nothing is created.
function realTarget(p) {
  const rest = [];
  let cur = resolve(p);
  while (!existsSync(cur) && !isLink(cur)) { rest.unshift(cur.slice(dirname(cur).length + 1)); cur = dirname(cur); }
  return join(realpathSync(cur), ...rest);
}
const isLink = (p) => { try { return lstatSync(p).isSymbolicLink(); } catch { return false; } };
// no existing component of `rel` below `base` may be a link (a link would carry a write or a removal out of the output folder)
function linkBelow(base, rel) {
  let cur = base;
  for (const seg of rel.split('/')) {
    cur = join(cur, seg);
    let st; try { st = lstatSync(cur); } catch { return ''; }
    if (st.isSymbolicLink()) return cur;
  }
  return '';
}

export function exportSnapshot({ source, commit, out, replace = false, name = SNAPSHOT_RECORD, protectedHashes = PROTECTED_SHA256, expectTree = '', allowPlaceholders = false }) {
  if (typeof out !== 'string' || !out) throw new Error('--out <consumer repository folder> is required');
  const srcTop = realpathSync(resolve(git(source, ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()));
  const inside = (d) => d === srcTop || d.startsWith(srcTop + sep);
  // every check below runs before anything is created, removed or written
  const dest = realTarget(out);
  if (inside(resolve(out)) || inside(dest)) throw new Error('the output folder is inside the framework repository (or resolves into it through a link); a snapshot is written into a consumer repository');
  const record = buildRecord(source, commit);
  if (expectTree && record.snapshotTree !== expectTree) throw new Error(`the public set at ${commit} has the snapshot tree ${record.snapshotTree}, not the approved ${expectTree}`);
  const c = readCommit(source, commit);
  // a notice that still asks a person to decide something is not published
  if (!allowPlaceholders) for (const f of record.files) if (/NOTICE\.md$/.test(f.path) && /\[to be confirmed[^\]]*\]/i.test(c.blob(f.blob).toString('utf8'))) throw new Error(`${f.path} still contains "[to be confirmed]"; the notice is completed by the owner before a snapshot is exported`);
  for (const rel of [...record.roots, ...record.files.map((f) => f.path), name]) {
    const l = linkBelow(dest, rel);
    if (l) throw new Error(`${l} is a link; a snapshot is never written or removed through a link`);
  }
  try { const st = lstatSync(join(dest, name)); if (st.nlink > 1) throw new Error(`${join(dest, name)} has other hard links; it is not overwritten`); } catch (e) { if (e.message.includes('hard links')) throw e; }
  for (const r of record.roots) if (existsSync(join(dest, r)) && !replace) throw new Error(`${join(dest, r)} exists; pass --replace to replace the snapshot folders`);
  // --replace removes the two snapshot folders; it does so only where a snapshot already is: a well-formed record of this framework naming the same folders, and nothing in those
  // folders that the record does not list (a folder that merely has an engineering/ of its own, or files of someone else, is never removed)
  if (replace && record.roots.some((r) => existsSync(join(dest, r)))) {
    const old = readRecord(dest, name);
    const refuse = () => { throw new Error(`--replace needs an existing snapshot (a valid ${name} naming the same folders, and no file in them that it does not list) in ${dest}; refusing to remove folders that were not written by this tool`); };
    if (old.problems.length || JSON.stringify(old.record.roots) !== JSON.stringify(record.roots)) refuse();
    const listed = new Set(old.record.files.map((f) => f.path));
    if (trackedUnder(dest, record.roots).some((p) => !listed.has(p))) refuse();
  }
  mkdirSync(dest, { recursive: true });
  const within = (target) => { const real = realpathSync(dirname(target)); return real === dest || real.startsWith(dest + sep); };
  if (replace) for (const r of record.roots) rmSync(join(dest, r), { recursive: true, force: true });
  for (const f of record.files) {
    const target = join(dest, f.path);
    mkdirSync(dirname(target), { recursive: true });
    if (!within(target)) throw new Error(`${f.path} would be written outside ${dest}`);
    writeFileSync(target, c.blob(f.blob));
    chmodSync(target, f.mode === '100755' ? 0o755 : 0o644);
  }
  writeFileSync(join(dest, name), `${JSON.stringify(record, null, 1)}\n`);
  const v = verifyRepo(dest, { name, protectedHashes });
  const w = verifyAgainst(record, source);
  const problems = [...v.problems, ...w.problems];
  if (problems.length) throw new Error(`the exported snapshot does not verify:\n  - ${problems.join('\n  - ')}`);
  return { record, notes: v.notes };
}

// ---- the inventory as a document --------------------------------------------------------------------------------------------------------------------------------------
export function inventoryMarkdown(inv) {
  const pub = inv.rows.filter((r) => r.public), ex = inv.rows.filter((r) => !r.public);
  const sum = (rows) => rows.reduce((n, r) => n + r.bytes, 0);
  const lines = [];
  lines.push('# Snapshot inventory (generated by `engineering/tools/snapshot.mjs inventory`; do not edit)');
  lines.push('');
  lines.push(`Generated from framework commit \`${inv.commit}\` (tree \`${inv.tree}\`). The public set has the snapshot tree id \`${treeOid(pub)}\`: a later commit that changes no public file leaves it unchanged, and any change to a public file changes it. ${inv.rows.length} files under the roots (${inv.profile.roots.join(', ')}): **${pub.length} public** (${sum(pub)} bytes), **${ex.length} excluded** (${sum(ex)} bytes). The profile is \`${PROFILE_PATH}\` (SHA-256 \`${sha256(Buffer.from(inv.profileText)).slice(0, 16)}…\`).`);
  lines.push('');
  const roles = new Map();
  for (const r of inv.rows) { const k = `${r.public ? 'public' : 'excluded'} / ${r.role}`; const x = roles.get(k) || { n: 0, b: 0 }; x.n++; x.b += r.bytes; roles.set(k, x); }
  lines.push('| Decision / role | Files | Bytes |', '|---|---|---|');
  for (const [k, v] of [...roles].sort()) lines.push(`| ${k} | ${v.n} | ${v.b} |`);
  lines.push('');
  const flagged = (flag) => inv.rows.filter((r) => r.flags.includes(flag));
  lines.push('## Files carrying a sensitivity flag', '');
  for (const flag of ['governance', 'security', 'thirdParty', 'licence']) {
    const list = flagged(flag);
    lines.push(`**${flag}** (${list.length}): ${list.length ? list.map((r) => `\`${r.path}\` (${r.public ? 'public' : 'excluded'})`).join(', ') : 'none'}`, '');
  }
  lines.push('## Excluded files', '', '| File | Role | Bytes | Why it stays private |', '|---|---|---|---|');
  for (const r of ex) lines.push(`| \`${r.path}\` | ${r.role} | ${r.bytes} | ${r.note.replace(/\|/g, '/')} |`);
  lines.push('', '## Public files', '', '| File | Role | Bytes | Flags |', '|---|---|---|---|');
  for (const r of pub) lines.push(`| \`${r.path}\` | ${r.role} | ${r.bytes} | ${r.flags.join(', ')} |`);
  lines.push('');
  return lines.join('\n');
}

// ---- command line -----------------------------------------------------------------------------------------------------------------------------------------------------
const isMain = (metaUrl) => Boolean(process.argv[1]) && pathToFileURL(resolve(process.argv[1])).href === metaUrl;
async function cli() {
  const [cmd, ...rest] = process.argv.slice(2), a = {};
  const VALUED = ['source', 'commit', 'out', 'against', 'repo', 'expect-tree'], BOOLEAN = ['replace', 'json', 'allow-placeholders'];
  const usage = (m) => { console.error(`snapshot: ${m}\nusage: snapshot.mjs inventory|export|verify (see the header of this file)`); process.exit(2); };
  for (let i = 0; i < rest.length; i++) {
    const m = /^--([a-z-]+)(?:=(.*))?$/s.exec(rest[i]);
    if (!m) usage(`unexpected argument ${rest[i]}`);
    const [, k, inline] = m;
    if (BOOLEAN.includes(k)) { if (inline !== undefined) usage(`--${k} takes no value`); a[k] = true; }
    else if (VALUED.includes(k)) { const v = inline !== undefined ? inline : rest[++i]; if (!v || v.startsWith('--')) usage(`--${k} needs a value`); a[k] = v; }
    else usage(`unknown flag --${k}`);
  }
  const here = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const source = resolve(a.source || here);
  if (cmd === 'inventory') {
    const inv = inventory(source, a.commit);
    if (inv.problems.length) { inv.problems.forEach((p) => console.error('  - ' + p)); process.exit(1); }
    process.stdout.write(a.json ? `${JSON.stringify({ commit: inv.commit, tree: inv.tree, rows: inv.rows }, null, 1)}\n` : inventoryMarkdown(inv));
  } else if (cmd === 'export') {
    const r = exportSnapshot({ source, commit: a.commit, out: a.out, replace: Boolean(a.replace), allowPlaceholders: Boolean(a['allow-placeholders']), expectTree: a['expect-tree'] || '' });
    console.log(r.notes.join('\n'));
  } else if (cmd === 'verify') {
    const repo = resolve(a.repo || process.cwd());
    const r = verifyRepo(repo);
    let problems = r.problems;
    if (a.against && r.record) problems = [...problems, ...verifyAgainst(r.record, resolve(a.against)).problems];
    r.notes.forEach((n) => console.log('  ' + n));
    problems.forEach((p) => console.log('  - ' + p));
    console.log(`${problems.length ? 'FAIL' : 'PASS'}  snapshot${a.against ? ' (and against the framework repository)' : ''}`);
    process.exit(problems.length ? 1 : 0);
  } else { console.error('usage: snapshot.mjs inventory|export|verify (see the header of this file)'); process.exit(2); }
}
if (isMain(import.meta.url)) cli().catch((e) => { console.error(`snapshot: ${e.message}`); process.exit(1); });
