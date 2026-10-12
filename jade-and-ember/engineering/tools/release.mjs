// node engineering/tools/release.mjs <command>
//   gate [--channel <name>]     evaluate the release gate for this build; exit 1 unless every requirement of its channel is met
//   manifest [--out <file>]     print (or write) the release manifest for HEAD; never requires the gate to pass
//   search-digest               print the fingerprint of the generated search artifacts that a search-review record must carry
//   external-digest             print the digest of the external destinations this build delivers (what an external-links verification and review are bound to)
//   rights-digest               print the digest of the delivered media and fonts (what a rights-verification record is bound to)
//   sbom [--out <file>]         print (or write) the deterministic composite SBOM and its SHA-256
//   candidate                   print the candidate artifact digest and its parts (what every record is bound to; see G6-2-DESIGN.md section 3)
//   prepare                     if the gate passes: write release/ (package, manifest, SHA256SUMS, host files, and the records the approval relies on).
//                               Nothing is deployed.
// The channel is read from the CONFIGURATION (flags.demo, seo.noindex): --channel only asserts what you expect, and a mismatch is refused.
// A client-production build cannot be prepared without an in-force release approval bound to its candidate artifact digest and production host, rights
// verification, real-device, screen-reader, browser-matrix and CI evidence bound to the same digest, a stable version and a complete, sealed full
// verification on a clean tree.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { assembleCandidate, SHARED, pagesOf } from '../lib/site.mjs';
import { buildManifest, sha256hex } from '../lib/hashed.mjs';
import { attachBuild, collectContext, buildReleaseManifest, evaluateGate, searchDigest } from '../lib/release.mjs';
import { zipBuffer } from '../lib/zip.mjs';
import { startHereText } from '../lib/candidate.mjs';
import { engDir, listFiles, projectDir, readJson } from '../lib/git.mjs';
import { loadPolicy, renderApache, renderHeadersFile, renderNginx } from '../lib/security.mjs';

const arg = (n) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null; };
const cmd = process.argv[2];
const dir = assembleCandidate(projectDir, 'release');
const finish = (code) => { rmSync(dir, { recursive: true, force: true }); process.exit(code); };

try {
  const ctx = collectContext();
  const asked = arg('--channel');
  if (asked && asked !== ctx.channel) { console.error(`REFUSED: this build is a ${ctx.channel} build (configuration: demo ${ctx.client.flags.demo}, noindex ${ctx.client.seo.noindex}); it cannot be released as "${asked}".`); finish(1); }
  const withAssets = attachBuild(ctx, dir);
  const gate = evaluateGate(withAssets);
  const show = () => { console.log(`channel: ${gate.channel}   version: ${ctx.version.version}   candidate: ${withAssets.candidate.digest.slice(0, 16)}…   commit: ${ctx.git.commit.slice(0, 7)}${ctx.git.dirty ? ' (dirty)' : ''}`); for (const r of gate.requirements) console.log(`  ${r.ok ? 'ok  ' : 'FAIL'}  ${r.id}: ${r.detail}`); console.log(`gate: ${gate.allowed ? 'ALLOWED' : 'BLOCKED'}   deployment approved: ${gate.deploymentApproved} (nothing here deploys)`); };
  if (cmd === 'gate') { show(); finish(gate.allowed ? 0 : 1); }
  if (cmd === 'candidate') {
    console.log(`candidate artifact digest: ${withAssets.candidate.digest}\nchannel ${withAssets.candidate.channel}, version ${withAssets.candidate.version}\n${JSON.stringify(withAssets.candidate.parts, null, 2)}`);
    finish(0);
  }
  if (cmd === 'search-digest') {
    const d = searchDigest(dir);
    if (!d) { console.log('This build has no search artifacts (the fictional demonstration is noindex and publishes none).'); finish(0); }
    console.log(`digest: ${d}\n\nReview exactly these files before an authorised reviewer records a search-review (npm run release:record -- template search-review prints the record with this digest filled in; the decision, the reviewer and the rationale are theirs to write):`);
    for (const f of ['sitemap.xml', 'robots.txt', 'llms.txt']) console.log(`  ${f}`);
    console.log('  the Home page JSON-LD block\nCheck: every fact (name, address, phone, hours, cuisine, ordering link) against the client; the schema.org type; the crawler classes; the production domain.');
    finish(0);
  }
  if (cmd === 'external-digest') {
    console.log(`external destinations delivered by this build: ${withAssets.ext.destinations.length}\ndigest: ${withAssets.ext.digest}`);
    for (const d of withAssets.ext.destinations) console.log(`  ${d.kind.padEnd(8)} ${d.url}  [${d.files.join(', ')}]`);
    console.log('\nVerify exactly this list on a networked runner (node engineering/tools/external-links.mjs verify --delivered --write --runner github-actions|person --note "..."), then a person opens each destination and records an external-links-review (npm run release:record -- template external-links-review).');
    finish(0);
  }
  if (cmd === 'rights-digest') {
    console.log(`digest of the delivered media and fonts: ${withAssets.mediaDigest}\nA rights-verification record carries it as subject.inventory; changing any image, video, font or licence file changes it.`);
    finish(0);
  }
  if (cmd === 'sbom') {
    if (arg('--out')) { writeFileSync(resolve(arg('--out')), withAssets.sbomText); console.log(`wrote ${arg('--out')}`); } else process.stdout.write(withAssets.sbomText);
    console.error(`sbom sha256 ${withAssets.sbomSha256}${withAssets.sbomProblems.length ? `; INCOMPLETE: ${withAssets.sbomProblems[0]}` : ''}`);
    finish(0);
  }
  if (cmd === 'manifest') {
    const m = JSON.stringify(buildReleaseManifest(ctx, { siteDir: dir }), null, 2) + '\n';
    if (arg('--out')) { writeFileSync(resolve(arg('--out')), m); console.log(`wrote ${arg('--out')}`); } else process.stdout.write(m);
    finish(0);
  }
  if (cmd === 'prepare') {
    show();
    if (!gate.allowed) { console.error('\nNOT PREPARED: the release gate blocks this build. Nothing was written.'); finish(1); }
    const out = resolve(projectDir, 'release'); rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
    const names = [...pagesOf(dir), ...SHARED, ...(ctx.channel === 'client-production' ? ['sitemap.xml', 'robots.txt', 'llms.txt'] : []), ...listFiles(join(dir, 'fonts')).map((f) => `fonts/${f}`), ...listFiles(join(dir, 'media')).map((f) => `media/${f}`)];
    const entries = names.filter((n) => { try { readFileSync(join(dir, n)); return true; } catch { return false; } }).map((name) => ({ name, data: readFileSync(join(dir, name)) }));
    const start = startHereText({ version: ctx.version.version, channel: ctx.channel, commit: ctx.git.commit, candidate: withAssets.candidate.digest });
    entries.push({ name: 'START-HERE.txt', data: Buffer.from(start) }, { name: 'serve.py', data: readFileSync(join(projectDir, 'serve.py')) });
    const zipName = ctx.channel === 'demonstration' ? ctx.version.previewPackage : `jade-and-ember-${ctx.version.version}-site.zip`;
    if (!/^[A-Za-z0-9._-]+\.zip$/.test(zipName)) { console.error(`REFUSED: the package name ${JSON.stringify(zipName)} is not a plain file name`); finish(1); }
    const zip = zipBuffer(entries);
    writeFileSync(join(out, zipName), zip);
    const manifest = buildReleaseManifest(ctx, { siteDir: dir, packageInfo: { name: zipName, bytes: zip.length, sha256: sha256hex(zip) } });
    writeFileSync(join(out, 'release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    // the records the approval relies on travel with the package so a recipient can audit them without the repository (G6-2, design section 6)
    for (const family of ['approvals', 'evidence', 'deployments']) { const from = join(engDir, 'release', family); if (existsSync(from)) cpSync(from, join(out, 'records', family), { recursive: true, filter: (f) => !/README\.md$/.test(f) }); }
    mkdirSync(join(out, 'records'), { recursive: true });
    writeFileSync(join(out, 'records', 'verification.json'), JSON.stringify(ctx.verify, null, 2) + '\n');
    // G6-3: the composite SBOM travels with the package; the histories and registers its requirements were judged by travel in records/ so a recipient can re-judge them
    writeFileSync(join(out, 'sbom.cdx.json'), withAssets.sbomText);
    for (const [from, to] of [[join(engDir, 'external-links-verification.json'), 'external-links-verification.json'], [join(engDir, 'supply-chain-verification.json'), 'supply-chain-verification.json'], [join(engDir, 'dependencies.json'), 'dependencies.json'], [join(engDir, 'media-rights-inventory.json'), 'media-rights-inventory.json']]) if (existsSync(from)) cpSync(from, join(out, 'records', to));
    cpSync(join(engDir, 'release', 'reviewers.json'), join(out, 'records', 'reviewers.json')); cpSync(join(engDir, 'release', 'demonstrations.json'), join(out, 'records', 'demonstrations.json'));
    const sums = ['release-manifest.json', zipName, 'sbom.cdx.json'].map((n) => `${sha256hex(readFileSync(join(out, n)))}  ${n}`).join('\n') + '\n';
    writeFileSync(join(out, 'SHA256SUMS.txt'), sums);
    const pol = loadPolicy(); mkdirSync(join(out, 'host'), { recursive: true });
    writeFileSync(join(out, 'host', '_headers'), renderHeadersFile(dir, pol, { https: true })); writeFileSync(join(out, 'host', 'nginx.conf'), renderNginx(dir, pol, { https: true })); writeFileSync(join(out, 'host', 'htaccess'), renderApache(dir, pol, { https: true }));
    console.log(`\nprepared ${out}: ${zipName} (${zip.length} bytes), release-manifest.json, SHA256SUMS.txt, host/. Nothing was deployed.`);
    finish(0);
  }
  console.error('usage: release.mjs gate|manifest|prepare|search-digest|external-digest|rights-digest|sbom|candidate [--channel demonstration|client-production]'); finish(2);
} catch (e) { console.error(e.stack || e.message); finish(2); }
void readJson;
