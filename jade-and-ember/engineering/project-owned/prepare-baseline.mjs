// PROJECT-OWNED (Jade & Ember): prepares the records for a new design baseline WITHOUT freezing anything.
//   node engineering/project-owned/prepare-baseline.mjs --commit <sha> --id firelight --label 1.0 --out <folder outside the repository>
// It reads a commit (never the working tree), and writes into --out the files a baseline record needs:
//   SHA256SUMS.source-tree.txt, the preview package ZIP with its two checksum lists, BASELINE.md (marked PROPOSED), baseline.proposed.json and a FREEZE-STEPS.md checklist.
// It creates no branch, tag or commit, pushes nothing, and touches neither engineering/baseline.json nor baselines/. Freezing is the owner's decision (see FREEZE-STEPS.md).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..', '..');
const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28 }).trim();
const sha = (b) => createHash('sha256').update(b).digest('hex');
const repoRoot = git(['rev-parse', '--show-toplevel'], projectRoot);
const projectPath = resolve(projectRoot).slice(repoRoot.length + 1);

const commit = git(['rev-parse', '--verify', `${arg('commit', 'HEAD')}^{commit}`], repoRoot);
const id = arg('id', 'firelight'), label = arg('label', '1.0');
const out = arg('out');
if (!out) { console.error('usage: --commit <sha> --id <name> --label <version> --out <folder>'); process.exit(2); }
const outDir = resolve(out);
if (outDir.startsWith(repoRoot + '/')) { console.error('--out must be outside the repository: this tool prepares records, it does not place them'); process.exit(2); }
mkdirSync(outDir, { recursive: true });

// 1. export the commit's project folder into a temporary folder (blobs only; the working tree is not read)
const tmp = mkdtempSync(join(tmpdir(), 'je-prep-'));
const names = git(['ls-tree', '-r', '-z', '--name-only', commit, projectPath], repoRoot).split('\0').filter(Boolean);
for (const p of names) {
  const t = join(tmp, p); mkdirSync(dirname(t), { recursive: true });
  writeFileSync(t, execFileSync('git', ['cat-file', 'blob', `${commit}:${p}`], { cwd: repoRoot, maxBuffer: 1 << 28 }));
}
const exported = join(tmp, projectPath);
writeFileSync(join(outDir, 'SHA256SUMS.source-tree.txt'), names.map((p) => `${sha(readFileSync(join(tmp, p)))}  ${p}`).join('\n') + '\n');

// 2. the delivered set, exactly as a visitor receives it: a fresh build of that commit
const delivered = join(tmp, 'delivered');
const manifest = JSON.parse(readFileSync(join(exported, 'sts.engineering.json'), 'utf8'));
// the same assembly as the framework's assembleCandidate: shared files, asset folders and the configuration folder are copied, then the pages are built into the folder
for (const f of [...manifest.delivery.sharedFiles, ...manifest.delivery.assetFolders, manifest.delivery.configDir]) cpSync(join(exported, f), join(delivered, f), { recursive: true });
execFileSync('node', ['build.mjs', '--out', delivered], { cwd: exported, stdio: 'pipe' });
const pages = JSON.parse(readFileSync(join(exported, manifest.delivery.pages.registry), 'utf8'))[manifest.delivery.pages.list].map((p) => p[manifest.delivery.pages.key]);
const walk = (d, base = '') => readdirSync(join(d, base), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(d, `${base}${e.name}/`) : [`${base}${e.name}`]);
const files = [...pages, ...manifest.delivery.sharedFiles, ...manifest.delivery.assetFolders.flatMap((f) => walk(delivered, `${f}/`))].filter((f) => existsSync(join(delivered, f))).sort();

const short = commit.slice(0, 7);
const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot);
const startHere = `Jade & Ember ${label} (${id}) — complete five-page local preview (fictional restaurant concept by Simplified Tech Solutions)
Commit ${short} on ${branch}. Visual review only: not deployed, not merged.

HOW TO OPEN
1. Double-click index.html (works in most browsers), OR
2. Best: open a terminal in this folder and run   python3 serve.py   (Windows: py serve.py)
   then open http://localhost:8766/ . This serves the footage the way a real host does.

All images and footage are AI-generated concept media. Menu, prices, address, hours and the story chapters are invented samples. Every page is marked noindex.
`;
writeFileSync(join(delivered, 'START-HERE.txt'), startHere);
const serve = join(exported, 'serve.py');
const contents = [...files, 'START-HERE.txt', ...(existsSync(serve) ? ['serve.py'] : [])].sort();
if (existsSync(serve)) writeFileSync(join(delivered, 'serve.py'), readFileSync(serve));
writeFileSync(join(outDir, 'SHA256SUMS.preview-contents.txt'), contents.map((f) => `${sha(readFileSync(join(delivered, f)))}  ${f}`).join('\n') + '\n');

// 3. the preview package: a deterministic ZIP (fixed timestamps from the commit, sorted names)
const zipName = `jade-and-ember-${label}-preview.zip`;
const stamp = git(['show', '-s', '--format=%cI', commit], repoRoot);
const py = `
import sys, zipfile, datetime
src, dest, top, stamp = sys.argv[1:5]
t = datetime.datetime.fromisoformat(stamp).timetuple()[:6]
names = sys.stdin.read().split('\\n')
with zipfile.ZipFile(dest, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for n in names:
        if not n: continue
        zi = zipfile.ZipInfo(top + '/' + n, date_time=t); zi.compress_type = zipfile.ZIP_DEFLATED; zi.external_attr = 0o644 << 16
        z.writestr(zi, open(src + '/' + n, 'rb').read())
`;
execFileSync('python3', ['-c', py, delivered, join(outDir, zipName), zipName.replace(/\.zip$/, ''), stamp], { input: contents.join('\n') });
const zipBuf = readFileSync(join(outDir, zipName));
writeFileSync(join(outDir, 'SHA256SUMS.preview-package.txt'), `${sha(zipBuf)}  ${zipName}\n`);

// 4. the proposed machine-readable record and the human-readable record
const rec = {
  $comment: `Machine-readable record of the Jade & Ember ${label} (${id}) baseline. PROPOSED: this file is a draft and has not replaced engineering/baseline.json. Once the owner freezes it, these values never change.`,
  version: label,
  branch: `baseline/jade-and-ember-${id}-${label}`,
  commit,
  repositoryTree: git(['rev-parse', `${commit}^{tree}`], repoRoot),
  projectTree: git(['rev-parse', `${commit}:${projectPath}`], repoRoot),
  projectPath,
  recordsDir: `baselines/jade-and-ember-${id}-${label}`,
  sourceTreeChecksums: { file: 'SHA256SUMS.source-tree.txt', files: names.length },
  previewPackage: { file: zipName, sha256: sha(zipBuf), bytes: zipBuf.length },
};
writeFileSync(join(outDir, 'baseline.proposed.json'), JSON.stringify(rec, null, 2) + '\n');
writeFileSync(join(outDir, 'BASELINE.md'), `# Jade & Ember ${label} (${id}): PROPOSED design baseline

**Status: PROPOSED, NOT FROZEN.** Nothing here is in force until the owner approves it in the approvals log. No branch, tag, merge, deployment or publication has been made from this record.

| Item | Value |
|---|---|
| Source commit | \`${commit}\` (\`${short}\`) on \`${branch}\` |
| Git tree of the repository | \`${rec.repositoryTree}\` |
| Git tree of \`${projectPath}/\` | \`${rec.projectTree}\` |
| Proposed baseline branch | \`${rec.branch}\` (to be created at the commit above only when frozen) |
| Source files | ${names.length}, checksums in \`SHA256SUMS.source-tree.txt\` |
| Preview package | \`${zipName}\`, ${zipBuf.length} bytes, SHA-256 \`${sha(zipBuf)}\`; ${contents.length} files, listed in \`SHA256SUMS.preview-contents.txt\` |

Prepared by \`engineering/project-owned/prepare-baseline.mjs\` from the commit itself. The preview package is a fresh build of that commit plus START-HERE.txt and serve.py.
`);
rmSync(tmp, { recursive: true, force: true });
console.log(`prepared ${id} ${label} from ${short}: ${names.length} source files, ${contents.length} delivered files, ${zipName} ${zipBuf.length} B -> ${outDir}`);
