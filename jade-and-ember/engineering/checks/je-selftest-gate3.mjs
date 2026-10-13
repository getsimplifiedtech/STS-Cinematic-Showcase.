// check:selftest-gate3. Targeted negative tests for the Gate 3 checks. Each damages a COPY (of the delivered site, the policy, the package files,
// a scratch git repository, the workflow) in a way a real mistake could, runs the check, and requires it to report the defect.
// Nothing in the working tree or the baseline is touched. Options: --only <text>
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { engDir } from '../lib/git.mjs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { checkSecurity, checkSecurityStatic } from './security.mjs';
import { checkPrivacy, checkPrivacyStatic } from './privacy.mjs';
import { checkDepsStatic } from './deps.mjs';
import { checkSecrets } from './secrets.mjs';
import { checkTokens } from './tokens.mjs';
import { checkAssetsStatic, refsResolve } from './assets.mjs';
import { checkPortability, checkPortabilityStatic } from './portability.mjs';
import { checkCiFile } from './ci.mjs';
import { loadPolicy } from '../lib/security.mjs';
import { buildHashed } from '../lib/hashed.mjs';
import { unzipTo, zipBuffer } from '../lib/zip.mjs';
import { assembleCandidate } from '../lib/site.mjs';
import { isMain, projectDir, readJson, repoRoot, tempDir } from '../lib/git.mjs';

// Fake credentials are assembled at run time so that this file itself contains no credential-shaped text for check:secrets to find.
const J = (...p) => p.join('');
const edit = (file, fn) => writeFileSync(file, fn(readFileSync(file, 'utf8')));
const clone = (o) => JSON.parse(JSON.stringify(o));
const ciText = readFileSync(join(engDir, 'g6-8-evidence', 'legacy-direct-workflow.yml'), 'utf8');
const sandbox = [];
const site = () => { const d = assembleCandidate(projectDir, 'g3'); sandbox.push(d); return d; };
const scratch = (label) => { const d = tempDir(label); sandbox.push(d); return d; };

// [name, async () => problems[], expected regex]
const cases = [
  // ---- security policy and pages (static)
  ['security: unsafe-inline added to script-src', () => { const p = clone(loadPolicy()); p.csp['script-src'].push("'unsafe-inline'"); return checkSecurityStatic({ root: site(), policy: p }).problems; }, /unsafe-inline/],
  ['security: default-src opened to self', () => { const p = clone(loadPolicy()); p.csp['default-src'] = ["'self'"]; return checkSecurityStatic({ root: site(), policy: p }).problems; }, /default-src must be 'none'/],
  ['security: an external image host allowed', () => { const p = clone(loadPolicy()); p.csp['img-src'].push('https://cdn.example.test'); return checkSecurityStatic({ root: site(), policy: p }).problems; }, /external source|allows https/],
  ['security: frame-ancestors dropped', () => { const p = clone(loadPolicy()); delete p.csp['frame-ancestors']; return checkSecurityStatic({ root: site(), policy: p }).problems; }, /frame-ancestors/],
  ['security: data: allowed for scripts', () => { const p = clone(loadPolicy()); p.csp['script-src'].push('data:'); return checkSecurityStatic({ root: site(), policy: p }).problems; }, /allows data:/],
  ['security: the style hashes left out of the policy', () => { const p = clone(loadPolicy()); p.csp['style-src-attr'] = ["'unsafe-hashes'"]; return checkSecurityStatic({ root: site(), policy: p }).problems; }, /style-attribute hashes/],
  ['security: a page gains an inline event handler', () => { const d = site(); edit(join(d, 'menu.html'), (t) => t.replace('<main id="main">', '<main id="main" onclick="x()">')); return checkSecurityStatic({ root: d }).problems; }, /event handler/],
  ['security: a page gains a second inline script', () => { const d = site(); edit(join(d, 'visit-us.html'), (t) => t.replace('</body>', '<script>var a=1</script></body>')); return checkSecurityStatic({ root: d }).problems; }, /inline scripts|hashes/],
  ['security: a page gains a <style> element', () => { const d = site(); edit(join(d, 'our-story.html'), (t) => t.replace('</head>', '<style>body{}</style></head>')); return checkSecurityStatic({ root: d }).problems; }, /<style>/],
  ['security: HTTP enforcement without the style hashes breaks the site (browser)', async () => { const p = clone(loadPolicy()); p.csp['style-src-attr'] = ["'unsafe-hashes'"]; return (await checkSecurity({ policy: p })).problems; }, /CSP violations|differs|computed style|style/],
  // ---- privacy
  ['privacy: localStorage in a script', () => { const d = site(); appendFileSync(join(d, 'site.js'), "\nlocalStorage.setItem('seen','1');\n"); return checkPrivacyStatic({ root: d }).problems; }, /localStorage/],
  ['privacy: a cookie in a script', () => { const d = site(); appendFileSync(join(d, 'menu.js'), "\ndocument.cookie='a=b';\n"); return checkPrivacyStatic({ root: d }).problems; }, /document\.cookie/],
  ['privacy: fetch in a script', () => { const d = site(); appendFileSync(join(d, 'hero.js'), "\nfetch('/x');\n"); return checkPrivacyStatic({ root: d }).problems; }, /fetch\(/],
  ['privacy: a tracking pixel', () => { const d = site(); edit(join(d, 'index.html'), (t) => t.replace('</body>', '<img src="https://t.example.test/p.gif" alt="" width="1" height="1"></body>')); return checkPrivacyStatic({ root: d }).problems; }, /another origin/],
  ['privacy: a web-font host and a preconnect', () => { const d = site(); edit(join(d, 'index.html'), (t) => t.replace('<link rel="stylesheet" href="styles.css">', '<link rel="preconnect" href="https://fonts.example.test"><link rel="stylesheet" href="https://fonts.example.test/css">')); return checkPrivacyStatic({ root: d }).problems; }, /another origin|before the visitor/],
  ['privacy: an outbound link to an unlisted host', () => { const d = site(); edit(join(d, 'visit-us.html'), (t) => t.replace('</main>', '<p><a href="https://ads.example.test/">x</a></p></main>')); return checkPrivacyStatic({ root: d }).problems; }, /not an allowed host/],
  ['privacy: a new-tab link without noopener', () => { const d = site(); edit(join(d, 'visit-us.html'), (t) => t.replace('</main>', '<p><a href="https://getsimplifiedtech.com/" target="_blank">x</a></p></main>')); return checkPrivacyStatic({ root: d }).problems; }, /noopener/],
  ['privacy: storage hidden from the static scan is caught in the browser', async () => { const d = site(); appendFileSync(join(d, 'site.js'), "\nwindow['local'+'Storage'].setItem('seen','1');\n"); return (await checkPrivacy({ root: d, pages: ['index.html'] })).problems; }, /stored data/],
  // ---- dependencies
  ['deps: a runtime dependency', () => { const d = scratch('deps'); cpSync(join(projectDir, 'package-lock.json'), join(d, 'package-lock.json')); const p = readJson(join(projectDir, 'package.json')); p.dependencies = { 'left-pad': '1.3.0' }; writeFileSync(join(d, 'package.json'), JSON.stringify(p)); return checkDepsStatic({ root: d }).problems; }, /runtime dependencies/],
  ['deps: a version range', () => { const d = scratch('deps'); cpSync(join(projectDir, 'package-lock.json'), join(d, 'package-lock.json')); const p = readJson(join(projectDir, 'package.json')); p.devDependencies.ajv = '^8.20.0'; writeFileSync(join(d, 'package.json'), JSON.stringify(p)); return checkDepsStatic({ root: d }).problems; }, /pin an exact version/],
  ['deps: a lockfile entry without integrity', () => { const d = scratch('deps'); cpSync(join(projectDir, 'package.json'), join(d, 'package.json')); const l = readJson(join(projectDir, 'package-lock.json')); delete l.packages['node_modules/ajv'].integrity; writeFileSync(join(d, 'package-lock.json'), JSON.stringify(l)); return checkDepsStatic({ root: d }).problems; }, /no sha512 integrity/],
  ['deps: a git-hosted package', () => { const d = scratch('deps'); cpSync(join(projectDir, 'package.json'), join(d, 'package.json')); const l = readJson(join(projectDir, 'package-lock.json')); l.packages['node_modules/ajv'].resolved = 'git+https://example.test/ajv.git'; writeFileSync(join(d, 'package-lock.json'), JSON.stringify(l)); return checkDepsStatic({ root: d }).problems; }, /not resolved from the npm registry/],
  ['deps: a disallowed licence', () => { const d = scratch('deps'); cpSync(join(projectDir, 'package.json'), join(d, 'package.json')); const l = readJson(join(projectDir, 'package-lock.json')); l.packages['node_modules/ajv'].license = 'GPL-3.0-only'; writeFileSync(join(d, 'package-lock.json'), JSON.stringify(l)); return checkDepsStatic({ root: d }).problems; }, /not on the allow-list/],
  ['deps: lockfile out of step with package.json', () => { const d = scratch('deps'); cpSync(join(projectDir, 'package-lock.json'), join(d, 'package-lock.json')); const p = readJson(join(projectDir, 'package.json')); delete p.devDependencies.yaml; writeFileSync(join(d, 'package.json'), JSON.stringify(p)); return checkDepsStatic({ root: d }).problems; }, /root entry differs/],
  // ---- secrets
  ...[
    ['an AWS access key', 'notes.md', `key ${J('AKIA', 'IOSFODNN7EXAMPLE')} here`, /aws-access-key/],
    ['a private key block', 'k.txt', J('-----BEGIN RSA ', 'PRIVATE KEY-----'), /private-key/],
    ['a GitHub token', 'ci.md', `token ${J('gh', 'p_abcdefghijklmnopqrstuvwxyz0123456789')}`, /github-token/],
    ['a password assignment', 'config.json', `{"${J('pass', 'word')}": "correct-horse-battery-staple-9"}`, /secret-assignment/],
    ['credentials in a URL', 'db.txt', `postgres://admin:${J('s3cret', 'pass')}@db.example.test/app`, /url-credentials/],
    ['a JWT', 'jwt.txt', J('eyJhbGciOiJIUzI1NiJ9', '.eyJzdWIiOiIxMjM0NTY3ODkwIn0', '.abcdefghijklmnop'), /jwt/],
    ['the secrets context in a workflow', '.github/workflows/x.yml', `env:\n  A: \${{ ${J('secr', 'ets')}.TOKEN }}`, /secrets context/],
  ].map(([name, file, text, re]) => [`secrets: ${name}`, () => { const r = scratch('secrets'); execFileSync('git', ['init', '-q'], { cwd: r }); mkdirSync(join(r, file, '..'), { recursive: true }); writeFileSync(join(r, file), text + '\n'); return checkSecrets({ root: r, history: false, allow: { entries: [] } }).problems; }, re]),
  ['secrets: a secret committed and later deleted is found in history', () => { const r = scratch('secrets'); const g = (...a) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: r }); g('init', '-q'); writeFileSync(join(r, 'a.md'), `${J('AKIA', 'IOSFODNN7EXAMPLE')}\n`); g('add', '.'); g('commit', '-qm', 'one'); writeFileSync(join(r, 'a.md'), 'clean\n'); g('commit', '-qam', 'two'); return checkSecrets({ root: r, history: true, allow: { entries: [] } }).problems; }, /aws-access-key/],
  ['secrets: a stale allowlist entry', () => { const r = scratch('secrets'); execFileSync('git', ['init', '-q'], { cwd: r }); writeFileSync(join(r, 'a.md'), 'clean\n'); return checkSecrets({ root: r, history: false, allow: { entries: [{ file: 'a.md', rule: 'jwt', reason: 'x' }] } }).problems; }, /matches nothing/],
  // ---- tokens
  ['tokens: the ember colour changed', () => { const d = scratch('tok'); cpSync(join(projectDir, 'styles.css'), join(d, 'styles.css')); edit(join(d, 'styles.css'), (t) => t.replace('--ember:#f08a3c', '--ember:#f08a3d')); return checkTokens({ root: d, pagesRoot: projectDir }).problems; }, /token --ember changed/],
  ['tokens: a token removed', () => { const d = scratch('tok'); cpSync(join(projectDir, 'styles.css'), join(d, 'styles.css')); edit(join(d, 'styles.css'), (t) => t.replace('--line:#3f6b5c;', '')); return checkTokens({ root: d, pagesRoot: projectDir }).problems; }, /--line was removed/],
  ['tokens: a variable that is never defined', () => { const d = scratch('tok'); cpSync(join(projectDir, 'styles.css'), join(d, 'styles.css')); appendFileSync(join(d, 'styles.css'), '\n.x{color:var(--nope)}\n'); return checkTokens({ root: d, pagesRoot: projectDir }).problems; }, /never defined/],
  ['tokens: a new hard-coded colour', () => { const d = scratch('tok'); cpSync(join(projectDir, 'styles.css'), join(d, 'styles.css')); appendFileSync(join(d, 'styles.css'), '\n.x{color:#ff00aa}\n'); return checkTokens({ root: d, pagesRoot: projectDir }).problems; }, /hard-coded colours/],
  ['tokens: low contrast between a recorded pair', () => { const d = scratch('tok'); cpSync(join(projectDir, 'styles.css'), join(d, 'styles.css')); edit(join(d, 'styles.css'), (t) => t.replace('--rice:#f1ebdb', '--rice:#777777')); return checkTokens({ root: d, pagesRoot: projectDir }).problems; }, /under 4\.5:1/],
  ['tokens: a spacing scale that stops growing', () => { const d = scratch('tok'); cpSync(join(projectDir, 'styles.css'), join(d, 'styles.css')); edit(join(d, 'styles.css'), (t) => t.replace('--s5:24px', '--s5:8px')); return checkTokens({ root: d, pagesRoot: projectDir }).problems; }, /only grow/],
  // ---- assets
  ['assets: a delivered file changed', () => { const d = site(); appendFileSync(join(d, 'styles.css'), '\n/* x */\n'); return checkAssetsStatic({ root: d }).problems; }, /differs from assets\.manifest\.json|differ from the v0\.8/],
  ['assets: a media file replaced', () => { const d = site(); appendFileSync(join(d, 'media', 'dish-mapo.webp'), Buffer.alloc(10, 1)); return checkAssetsStatic({ root: d }).problems; }, /assets\.manifest\.json|v0\.8/],
  ['assets: a hashed copy with a missing file', () => { const d = site(); const h = scratch('hashed'); buildHashed(d, h); rmSync(join(h, 'media', readFileNames(join(h, 'media')).find((n) => n.endsWith('.webm')))); return refsResolve(h); }, /does not exist/],
  ['assets: a script that names an asset cannot be hashed', () => { const d = site(); appendFileSync(join(d, 'menu.js'), "\nconst x = 'media/hero-wok.webp';\n"); const h = scratch('hashed'); try { buildHashed(d, h); return []; } catch (e) { return [e.message]; } }, /cannot be hashed safely/],
  // ---- portability
  ['portability: a file name with a space', () => { const d = site(); writeFileSync(join(d, 'media', 'my photo.webp'), 'x'); return checkPortabilityStatic({ root: d }).problems; }, /file names must be/],
  ['portability: two names that differ only by case', () => { const d = site(); writeFileSync(join(d, 'media', 'Dish-Mapo.webp'), 'x'); return checkPortabilityStatic({ root: d }).problems; }, /differ only by case/],
  ['portability: a symbolic link', () => { const d = site(); symlinkSync(join(d, 'styles.css'), join(d, 'alias.css')); return checkPortabilityStatic({ root: d }).problems; }, /symbolic link/],
  ['portability: a <base> element', () => { const d = site(); edit(join(d, 'index.html'), (t) => t.replace('<head>', '<head>\n<base href="/">')); return checkPortabilityStatic({ root: d }).problems; }, /<base>/],
  ['portability: a root-absolute stylesheet link breaks a subdirectory deployment (browser)', async () => { const d = site(); for (const f of ['index.html', 'menu.html', 'our-story.html', 'visit-us.html', 'order-online.html']) edit(join(d, f), (t) => t.replace('href="styles.css"', 'href="/styles.css"')); return (await checkPortability({ root: d })).problems; }, /outside the site folder|404|did not render|could not complete|did not load/],
  ['portability: a ZIP with a path that escapes the folder is refused', () => { const d = scratch('zip'); try { unzipTo(zipBuffer([{ name: '../evil.txt', data: Buffer.from('x') }]), d); return []; } catch (e) { return [e.message]; } }, /unsafe path/],
  ['portability: a corrupted ZIP is detected', () => { const d = scratch('zip'); const z = zipBuffer([{ name: 'a.txt', data: Buffer.from('hello hello hello hello hello') }]); z[40] ^= 0xff; try { unzipTo(z, d); return []; } catch (e) { return [e.message]; } }, /CRC|inflate|invalid|incorrect|unexpected/i],
  // ---- CI
  ...[
    ['write-all permissions', (t) => t.replace('permissions:\n  contents: read', 'permissions: write-all'), /permissions/],
    ['a job that widens permissions', (t) => t.replace('    timeout-minutes: 40', '    timeout-minutes: 40\n    permissions:\n      contents: write'), /widens permissions/],
    ['an action pinned to a tag instead of a SHA', (t) => t.replace('actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1', 'actions/checkout@v7'), /not pinned to a full commit SHA/],
    ['an action that is not on the list', (t) => t.replace('actions/setup-node@820762786026740c76f36085b0efc47a31fe5020', 'someone/setup@820762786026740c76f36085b0efc47a31fe5020'), /not on the allowed list/],
    ['the secrets context', (t) => t.replace("STS_REQUIRE_AUDIT: '1'", "STS_REQUIRE_AUDIT: '1'\n      API_TOKEN: ${{ secrets.API_TOKEN }}"), /secrets|credential-like/],
    ['pull_request_target', (t) => t.replace('  pull_request:\n', '  pull_request_target:\n'), /pull_request_target/],
    ['a deployment step', (t) => t.replace('        run: npm run verify\n', '        run: npm run verify\n      - name: Deploy\n        run: npx netlify deploy --prod\n'), /cloud or deployment tool/],
    ['a git push', (t) => t.replace('        run: npm run verify\n', '        run: npm run verify && git push origin HEAD\n'), /git push/],
    ['an AI service call', (t) => t.replace('        run: npm run verify\n', '        run: npm run verify\n      - name: Review\n        run: curl https://api.anthropic.com/v1/messages\n'), /AI or generation service/],
    ['no timeout', (t) => t.replace('    timeout-minutes: 40\n', ''), /timeout-minutes/],
    ['npm install instead of npm ci', (t) => t.replace('npm ci --ignore-scripts --engine-strict\n\n      - name: Install Chromium', 'npm install\n\n      - name: Install Chromium'), /npm ci/],
    ['install scripts allowed', (t) => t.replace('npm ci --ignore-scripts --engine-strict\n\n      - name: Install Chromium', 'npm ci --engine-strict\n\n      - name: Install Chromium'), /--ignore-scripts/],
    ['an expression in a run script', (t) => t.replace('        run: npm run verify\n', '        run: echo "${{ github.event.head_commit.message }}" && npm run verify\n'), /expression/],
    ['credentials persisted by the checkout', (t) => t.replace('persist-credentials: false', 'persist-credentials: true'), /persist-credentials/],
    ['pushes from any branch', (t) => t.replace('branches: [feature/jade-and-ember-v0.9]', "branches: ['**']"), /development branch only/],
    ['the blocking job may fail silently', (t) => t.replace('    timeout-minutes: 40\n', '    timeout-minutes: 40\n    continue-on-error: true\n'), /continue-on-error|npm run verify|floating/],
    ['the verify step removed', (t) => t.replace('        run: npm run verify\n', '        run: echo skipped\n'), /must run npm run verify/],
  ].map(([name, fn, re]) => [`ci: ${name}`, () => checkCiFile(fn(ciText), { docs: false }).problems, re]),
];
const readFileNames = (d) => require_readdir(d);
import { readdirSync } from 'node:fs';
function require_readdir(d) { return readdirSync(d); }

export async function checkSelftestGate3({ only = null } = {}) {
  const problems = [], notes = [];
  const t0 = Date.now();
  let n = 0;
  try {
    for (const [name, run, expect] of cases) {
      if (only && !name.includes(only)) continue;
      let r;
      try { r = await run(); } catch (e) { r = [`check crashed: ${e.message}`]; }
      n++;
      if (!r.length) problems.push(`${name}: nothing was reported; the defect went undetected`);
      else if (!expect.test(r.join('\n'))) problems.push(`${name}: reported something else (${r[0].slice(0, 150)}), expected ${expect}`);
      else notes.push(`caught: ${name}`);
    }
    // the untouched workflow passes
    if (!only) { n++; const ok = checkCiFile(ciText, { docs: false }); if (ok.problems.length) problems.push(`ci: the real workflow must pass its own check (${ok.problems[0]})`); else notes.push('the real workflow passes the CI check'); }
    notes.push(`${n} targeted negative tests run in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  } finally { sandbox.forEach((d) => { try { rmSync(d, { recursive: true, force: true }); } catch { /* gone */ } }); }
  return { problems, notes };
}

if (isMain(import.meta.url)) {
  const i = process.argv.indexOf('--only');
  const { problems, notes } = await checkSelftestGate3({ only: i > -1 ? process.argv[i + 1] : null });
  notes.forEach((x) => console.log('  ' + x));
  problems.forEach((x) => console.log('  - ' + x));
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  check:selftest-gate3`);
  process.exit(problems.length ? 1 : 0);
}
