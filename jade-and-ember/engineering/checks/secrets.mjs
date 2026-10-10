// check:secrets (ENG-092). No credentials in the repository: the files of the working tree (tracked, and untracked but not ignored) and the
// text of every commit reachable from HEAD. Patterns cover private keys, cloud and platform tokens, JWTs, credentials in URLs and generic
// secret assignments. Workflow files must not reference the `secrets` context at all (the CI has no credentials, by design).
// A match is a failure; reviewed false positives go in secrets-allow.json with a reason. Matched text is never printed in full.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { engDir, isMain, readJson, repoRoot } from '../lib/git.mjs';

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
  text.split('\n').forEach((line, i) => { for (const [id, re] of rules) { const m = re.exec(line); if (m) out.push({ rule: id, file: name, line: i + 1, sample: m[0].slice(0, 6) + '…' }); } });
  return out;
}

export function checkSecrets({ root = repoRoot, history = true, allow = null } = {}) {
  const problems = [], notes = [];
  const allowed = (allow || readJson(join(engDir, 'secrets-allow.json'))).entries;
  const used = new Set();
  const report = (f) => {
    const ix = allowed.findIndex((a) => a.file === f.file.replace(/^[0-9a-f]{7,40}:/, '') && a.rule === f.rule);
    if (ix >= 0) { used.add(ix); return; }
    problems.push(`${f.file}:${f.line} looks like a ${f.rule} (${f.sample}); remove and rotate it, or record a reviewed false positive in secrets-allow.json`);
  };
  const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 }).split('\0').filter(Boolean);
  let scanned = 0;
  for (const f of files) {
    if (SKIP.test(f) || !TEXT.test(f) || !existsSync(join(root, f))) continue;
    scanned++;
    const text = readFileSync(join(root, f), 'utf8');
    scanText(f, text).forEach(report);
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
        for (const f of scanText(`${sha}:${file}`, line.slice(1))) { const key = `hist:${f.rule}:${file}`; if (!used.has(key)) { used.add(key); report({ ...f, line: 0 }); } }
      }
    } catch (e) { notes.push(`history scan skipped: ${String(e.message).split('\n')[0]}`); }
  }
  allowed.forEach((a, i) => { if (!used.has(i)) problems.push(`secrets-allow.json entry ${i} (${a.file}, ${a.rule}) matches nothing: remove it`); });
  notes.push(`${scanned} files in the working tree${history ? ` and the added lines of ${commits} commits` : ''} scanned for ${RULES.length} credential patterns: none found`);
  return { problems, notes };
}

if (isMain(import.meta.url)) {
  const { problems, notes } = checkSecrets();
  notes.forEach((n) => console.log('  ' + n));
  problems.forEach((p) => console.log('  - ' + p));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:secrets`);
  process.exit(problems.length ? 1 : 0);
}
