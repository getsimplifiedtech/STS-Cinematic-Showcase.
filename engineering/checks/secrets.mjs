// check:secrets (ENG-092). No credentials in the repository: the files of the working tree (tracked, and untracked but not ignored) and the
// text of every commit reachable from HEAD. Patterns cover private keys, cloud and platform tokens, JWTs, credentials in URLs and generic
// secret assignments. Workflow files must not reference the `secrets` context at all (the CI has no credentials, by design).
// A match is a failure; reviewed false positives go in secrets-allow.json with a reason. Matched text is never printed in full.
// An allowance may be BOUND to the content it was reviewed for (G6-7, specification 16, section 10.8): `sha256` is the SHA-256 of the file as reviewed and `count` the number of findings of
// that rule in it. If the file changes, or gains one more finding, the allowance stops covering it and the check fails. `allowAbsent` (only with a sha256) says the file lives on another
// branch and is not expected in every tree: absence is then not a finding. Without a sha256 an allowance matches by file and rule, as before.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { engDir, isMain, readJson, repoRoot } from '../lib/git.mjs';
import { record } from '../lib/project-records.mjs';
import { repositoryIdentity, secretsAllowancesFor } from '../lib/ci-exceptions.mjs';

const RULES = [
  ['private-key', /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/],
  ['aws-access-key', /\b(?:AKIA|ASIA|AGPA|AIDA|AROA)[0-9A-Z]{16}\b/],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ['slack-token', /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/],
  ['google-api-key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['stripe-key', /\b(?:sk|rk)_live_[0-9A-Za-z]{16,}\b/],
  ['llm-api-key', /\b(?:sk-ant-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{40,}|hf_[A-Za-z0-9]{30,})\b/],
  ['jwt', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/],
  ['url-credentials', /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@"']{2,}:[^\s/@"']{3,}@[^\s/"']+/i],
  ['bearer-token', /\bAuthorization['"]?\s*[:=]\s*['"]?Bearer\s+[A-Za-z0-9._~+/-]{20,}/i],
  ['secret-assignment', /\b(?:api[_-]?key|secret|passwd|password|access[_-]?token|auth[_-]?token|client[_-]?secret)['"]?\s*[:=]\s*['"][A-Za-z0-9_\-/+=.]{16,}['"]/i],
];
const TEXT = /\.(md|mjs|js|json|css|html|txt|py|ya?ml|sh|cfg|conf|ini|env|toml|xml|svg)$|^[^.]*$/i;
const SKIP = /(^|\/)(package-lock\.json|SHA256SUMS[^/]*|.*\.zip|.*\.webp|.*\.webm|.*\.mp4|.*\.woff2)$/;

export function scanText(name, text, rules = RULES) {
  const out = [];
  text.split('\n').forEach((line, i) => { for (const [id, re] of rules) { const m = re.exec(line); if (m) out.push({ rule: id, file: name, line: i + 1, sample: m[0].slice(0, 6) + '…', text: line.trim() }); } });
  return out;
}

export function checkSecrets({ root = repoRoot, history = true, allow = null } = {}) {
  const problems = [], notes = [];
  // the project's own reviewed false positives, and (only in the framework repository, from its private ci/exceptions.json) the hash-bound allowances for credential-shaped test values in vendored third-party tests
  const allowed = allow ? allow.entries : [...record('secrets-allow.json').entries, ...secretsAllowancesFor(repositoryIdentity(root))];
  const used = new Set();
  // an allowance is a reviewed false positive, never a silent one: it names the file and the rule and says why a reviewer accepted it
  const treeCount = new Map();
  allowed.forEach((a, i) => { if (a && a.allowAbsent && !/^[0-9a-f]{64}$/.test(a.sha256 || '')) problems.push(`secrets-allow.json entry ${i} (${a.file}, ${a.rule}): allowAbsent is allowed only on an entry bound to a sha256`); if (a && a.sha256 !== undefined && (!/^[0-9a-f]{64}$/.test(a.sha256) || !Number.isInteger(a.count) || a.count < 1)) problems.push(`secrets-allow.json entry ${i} (${a.file}, ${a.rule}): a sha256-bound allowance needs a 64-hex sha256 and a count of at least 1`); });
  allowed.forEach((a, i) => { if (!a || typeof a.reason !== 'string' || a.reason.trim().length < 30) problems.push(`secrets-allow.json entry ${i} (${a?.file}, ${a?.rule}) needs a reason of at least 30 characters that a reviewer can accept`); });
  const treeLines = new Map();   // for a hash-bound allowance: the exact lines the reviewed file holds
  const report = (f, inTree = false) => {
    // a history finding is named "<commit>:<path>"; a working-tree finding is named by its path alone, whatever the file is called
    const path = inTree ? f.file : f.file.replace(/^[0-9a-f]{7,40}:/, '');
    const ix = allowed.findIndex((a) => a.file === path && a.rule === f.rule);
    if (ix >= 0) {
      if (inTree) { used.add(ix); treeCount.set(ix, (treeCount.get(ix) || 0) + 1); (treeLines.get(ix) || treeLines.set(ix, new Set()).get(ix)).add(f.text); return; }
      // in history, a hash-bound allowance covers only a line the reviewed file holds now; any other line at that path (a real secret committed and later deleted) is a finding
      if (allowed[ix].sha256 === undefined || treeLines.get(ix)?.has(f.text)) { used.add(ix); return; }
    }
    problems.push(`${f.file}:${f.line} looks like a ${f.rule} (${f.sample}); remove and rotate it, or record a reviewed false positive in secrets-allow.json`);
  };
  const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 }).split('\0').filter(Boolean);
  let scanned = 0;
  for (const f of files) {
    if (SKIP.test(f) || !TEXT.test(f) || !existsSync(join(root, f))) continue;
    scanned++;
    const text = readFileSync(join(root, f), 'utf8');
    scanText(f, text).forEach((x) => report(x, true));
    if (/^\.github\/workflows\//.test(f) && /\$\{\{\s*secrets\./.test(text)) problems.push(`${f} reads the secrets context: the CI has no credentials by design`);
  }
  let commits = 0;
  if (history) {
    try {
      const log = execFileSync('git', ['log', '--format=@@%h', '-p', '-U0', '--text', 'HEAD'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 29 });
      let sha = '', file = '';
      for (const line of log.split('\n')) {
        if (line.startsWith('@@') && !line.startsWith('@@ ')) { sha = line.slice(2); commits++; continue; }
        if (line.startsWith('+++ b/')) { file = line.slice(6); continue; }
        if (!line.startsWith('+') || line.startsWith('+++') || SKIP.test(file) || !TEXT.test(file)) continue;
        for (const f of scanText(`${sha}:${file}`, line.slice(1))) { const key = `hist:${f.rule}:${file}:${f.text}`; if (!used.has(key)) { used.add(key); report({ ...f, line: 0 }); } }
      }
    } catch (e) { notes.push(`history scan skipped: ${String(e.message).split('\n')[0]}`); }
  }
  allowed.forEach((a, i) => {
    const full = join(root, ...String(a.file).split('/')), present = existsSync(full);
    if (a.sha256 !== undefined && present) {
      const got = createHash('sha256').update(readFileSync(full)).digest('hex');
      if (got !== a.sha256) problems.push(`secrets-allow.json entry ${i} (${a.file}, ${a.rule}): the file has changed since it was reviewed (SHA-256 ${got.slice(0, 12)}…, reviewed ${a.sha256.slice(0, 12)}…); review it again`);
      if ((treeCount.get(i) || 0) !== a.count) problems.push(`secrets-allow.json entry ${i} (${a.file}, ${a.rule}): ${treeCount.get(i) || 0} finding(s) in the file, ${a.count} reviewed`);
    }
    if (!used.has(i) && !(a.allowAbsent && !present)) problems.push(`secrets-allow.json entry ${i} (${a.file}, ${a.rule}) matches nothing: remove it`);
  });
  if (allowed.length) notes.push(`${allowed.length} reviewed allowance(s) (secrets-allow.json and the framework\'s own exceptions) (${allowed.filter((a) => a.sha256).length} bound to a file hash and a finding count): ${allowed.map((a) => `${a.file} [${a.rule}]`).join(', ')}`);
  notes.push(`${scanned} files in the working tree${history ? ` and the added lines of ${commits} commits` : ''} scanned for ${RULES.length} credential patterns: ${allowed.length ? 'none found beyond the allowances' : 'none found'}`);
  return { problems, notes };
}

if (isMain(import.meta.url)) {
  const { problems, notes } = checkSecrets();
  notes.forEach((n) => console.log('  ' + n));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:secrets`);
  process.exit(problems.length ? 1 : 0);
}
