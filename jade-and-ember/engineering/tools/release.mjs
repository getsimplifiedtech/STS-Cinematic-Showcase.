// node engineering/tools/release.mjs <command>
//   gate [--channel <name>]     evaluate the release gate for this build; exit 1 unless every requirement of its channel is met
//   manifest [--out <file>]     print (or write) the release manifest for HEAD; never requires the gate to pass
//   search-digest               print the fingerprint of the generated search artifacts that a search-review approval must carry
//   prepare                     if the gate passes: write release/ (package, manifest, SHA256SUMS, host files). Nothing is deployed.
// The channel is read from the CONFIGURATION (flags.demo, seo.noindex): --channel only asserts what you expect, and a mismatch is refused.
// A client-production build cannot be prepared without a recorded release approval for its exact version and commit, rights verification,
// real-device, screen-reader, browser-matrix and CI evidence, a stable version and a passing full verification on a clean tree.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { assembleCandidate, SHARED, pagesOf } from '../lib/site.mjs';
import { buildManifest, sha256hex } from '../lib/hashed.mjs';
import { collectContext, buildReleaseManifest, evaluateGate, searchDigest, searchFilesPresent } from '../lib/release.mjs';
import { zipBuffer } from '../lib/zip.mjs';
import { listFiles, projectDir, readJson } from '../lib/git.mjs';
import { loadPolicy, renderApache, renderHeadersFile, renderNginx } from '../lib/security.mjs';

const arg = (n) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null; };
const cmd = process.argv[2];
const dir = assembleCandidate(projectDir, 'release');
const finish = (code) => { rmSync(dir, { recursive: true, force: true }); process.exit(code); };

try {
  const ctx = collectContext();
  const asked = arg('--channel');
  if (asked && asked !== ctx.channel) { console.error(`REFUSED: this build is a ${ctx.channel} build (configuration: demo ${ctx.client.flags.demo}, noindex ${ctx.client.seo.noindex}); it cannot be released as "${asked}".`); finish(1); }
  const withAssets = { ...ctx, assetsTree: buildManifest(dir).treeSha256, searchDigest: searchDigest(dir), siteHasSearchFiles: ctx.channel === 'demonstration' ? undefined : searchFilesPresent(dir) };
  const gate = evaluateGate(withAssets);
  const show = () => { console.log(`channel: ${gate.channel}   version: ${ctx.version.version}   commit: ${ctx.git.commit.slice(0, 7)}${ctx.git.dirty ? ' (dirty)' : ''}`); for (const r of gate.requirements) console.log(`  ${r.ok ? 'ok  ' : 'FAIL'}  ${r.id}: ${r.detail}`); console.log(`gate: ${gate.allowed ? 'ALLOWED' : 'BLOCKED'}   deployment approved: ${gate.deploymentApproved} (nothing here deploys)`); };
  if (cmd === 'gate') { show(); finish(gate.allowed ? 0 : 1); }
  if (cmd === 'search-digest') {
    const d = searchDigest(dir);
    if (!d) { console.log('This build has no search artifacts (the fictional demonstration is noindex and publishes none).'); finish(0); }
    console.log(`digest: ${d}\n\nReview exactly these files before recording a search-review row in docs/JADE_AND_EMBER_APPROVALS.md (Type: search-review; Decision: "Reviewed by <name> on <date>: business facts, structured data, crawler policy. digest: ${d}"):`);
    for (const f of ['sitemap.xml', 'robots.txt', 'llms.txt']) console.log(`  ${f}`);
    console.log('  the Home page JSON-LD block\nCheck: every fact (name, address, phone, hours, cuisine, ordering link) against the client; the schema.org type; the crawler classes; the production domain.');
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
    const start = `Jade & Ember ${ctx.version.version} (${ctx.channel})\nSource commit ${ctx.git.commit}\n\nOpen index.html in a browser: double-click it. Nothing else is needed.\nOptional: python3 serve.py  (then http://localhost:8766/) to serve it with video seeking.\n\n${ctx.channel === 'demonstration' ? 'This is a FICTIONAL demonstration of a website design by Simplified Tech Solutions. It is not approved for public deployment or for client production.\n' : ''}Verify: sha256sum -c SHA256SUMS.txt (next to this package) and compare release-manifest.json.\n`;
    entries.push({ name: 'START-HERE.txt', data: Buffer.from(start) }, { name: 'serve.py', data: readFileSync(join(projectDir, 'serve.py')) });
    const zipName = ctx.channel === 'demonstration' ? ctx.version.previewPackage : `jade-and-ember-${ctx.version.version}-site.zip`;
    const zip = zipBuffer(entries);
    writeFileSync(join(out, zipName), zip);
    const manifest = buildReleaseManifest(ctx, { siteDir: dir, packageInfo: { name: zipName, bytes: zip.length, sha256: sha256hex(zip) } });
    writeFileSync(join(out, 'release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    const sums = ['release-manifest.json', zipName].map((n) => `${sha256hex(readFileSync(join(out, n)))}  ${n}`).join('\n') + '\n';
    writeFileSync(join(out, 'SHA256SUMS.txt'), sums);
    const pol = loadPolicy(); mkdirSync(join(out, 'host'), { recursive: true });
    writeFileSync(join(out, 'host', '_headers'), renderHeadersFile(dir, pol, { https: true })); writeFileSync(join(out, 'host', 'nginx.conf'), renderNginx(dir, pol, { https: true })); writeFileSync(join(out, 'host', 'htaccess'), renderApache(dir, pol, { https: true }));
    console.log(`\nprepared ${out}: ${zipName} (${zip.length} bytes), release-manifest.json, SHA256SUMS.txt, host/. Nothing was deployed.`);
    finish(0);
  }
  console.error('usage: release.mjs gate|manifest|prepare|search-digest [--channel demonstration|client-production]'); finish(2);
} catch (e) { console.error(e.stack || e.message); finish(2); }
void readJson;
