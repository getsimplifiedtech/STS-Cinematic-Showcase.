// Stages a hosting bundle for one adapter and checks it (G6-4, APR-JE-044): node engineering/tools/host-bundle.mjs --adapter cloudflare-pages|vercel|static --out <dir> [options]
//   --site <folder>            the DELIVERED folder (pages, assets, search files; no config/, no serve.py). Default: --candidate
//   --candidate                build the working tree's site and use it without its config/ folder
//   --url-style clean|extension   how pages are addressed publicly; default: client.seo.urlStyle of the configuration, else "extension". Cloudflare Pages needs "clean", a plain server "extension"
//   --base-url <url>           the public address of an indexable site (domain or subdomain root); optional for the demonstration
//   --channel demonstration|client-production    optional; it is READ from the pages and a different value is refused
//   --hsts-include-subdomains --hsts-authorisation <APPROVAL-REFERENCE>   HSTS includeSubDomains is off by default (D-P3-4); this needs the recorded per-client authorisation
//   --check <bundle> [--for-release] [--delivered <folder>]   check an existing bundle; --for-release turns the live blockers (a missing 404 page) into failures
//   --verify-served <folder> --bundle <bundle>   compare bytes fetched from a deployment (saved as files named by their public path) with the staged bundle (live checklist C-07)
// Nothing here reads a credential, contacts a host or deploys anything. The bundle is a folder on disk.
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { assembleCandidate } from '../lib/site.mjs';
import { isMain, projectDir, readJson } from '../lib/git.mjs';
import { checkBundle, readManifest, renderBundle, verifyServed } from '../adapters/hosting/index.mjs';
import { walkFiles } from '../adapters/hosting/common.mjs';

const argv = process.argv.slice(2);
const arg = (n, d = null) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : d; };
const has = (n) => argv.includes(n);

export async function main() {
  try {
    if (arg('--check')) {
      const r = checkBundle(resolve(arg('--check')), { forRelease: has('--for-release'), deliveredDir: arg('--delivered') ? resolve(arg('--delivered')) : null });
      r.notes.forEach((n) => console.log(`  ${n}`));
      r.blockers.forEach((b) => console.log(`  ${has('--for-release') ? 'BLOCKER' : 'open live blocker'} ${b.decision}/${b.risk}: ${b.text}`));
      r.problems.forEach((p) => console.log(`  - ${p}`));
      console.log(r.problems.length ? 'FAIL  bundle check' : 'PASS  bundle check');
      return r.problems.length ? 1 : 0;
    }
    if (arg('--verify-served')) {
      const dir = resolve(arg('--verify-served')), manifest = readManifest(resolve(arg('--bundle') || fail('--bundle <bundle> is required')));
      // a file saved as menu.html stands for the page at its public address (/menu on a clean-URL host); 404.html has no address of its own and is skipped
      const served = new Map(walkFiles(dir).filter((f) => f !== '404.html').map((f) => [f === 'index.html' ? '/' : manifest.urlStyle === 'clean' && f.endsWith('.html') ? `/${f.slice(0, -5)}` : `/${f}`, readFileSync(join(dir, f))]));
      const p = verifyServed(manifest, served);
      p.forEach((x) => console.log(`  - ${x}`));
      console.log(p.length ? 'FAIL  served bytes differ from the staged bundle' : 'PASS  served bytes equal the staged bundle');
      return p.length ? 1 : 0;
    }
    const adapter = arg('--adapter') || fail('--adapter cloudflare-pages|vercel|static is required');
    const out = resolve(arg('--out') || fail('--out <dir> is required'));
    let siteDir = arg('--site') ? resolve(arg('--site')) : null, cand = null, urlStyle = arg('--url-style');
    if (!siteDir) {
      cand = assembleCandidate(projectDir, 'host-bundle'); siteDir = cand;
      urlStyle = urlStyle || (readJson(join(projectDir, 'config', 'client.json')).seo.urlStyle || 'extension');
      rmSync(join(siteDir, 'config'), { recursive: true, force: true });
    }
    urlStyle = urlStyle || 'extension';
    const hsts = has('--hsts-include-subdomains') ? { includeSubDomains: true, authorisation: arg('--hsts-authorisation') } : null;
    try {
      const b = renderBundle(adapter, { siteDir, outDir: out, urlStyle, baseUrl: arg('--base-url'), channel: arg('--channel'), hsts });
      const c = checkBundle(out);
      console.log(`staged ${adapter} bundle in ${out}: ${b.manifest.files.length} files, channel ${b.manifest.channel}, urlStyle ${urlStyle}, manifest sha256 ${b.manifestSha256}`);
      b.blockers.forEach((x) => console.log(`  open live blocker ${x.decision}/${x.risk}: ${x.text}`));
      c.problems.forEach((p) => console.log(`  - ${p}`));
      console.log(`${c.problems.length ? 'FAIL' : 'PASS'}  bundle check (nothing was deployed; the bundle holds no credential)`);
      return c.problems.length ? 1 : 0;
    } finally { if (cand) rmSync(cand, { recursive: true, force: true }); }
  } catch (e) { console.error(`REFUSED${e.code ? ` [${e.code}]` : ''}: ${e.message}`); return 1; }
}
const fail = (m) => { throw new Error(m); };
if (isMain(import.meta.url)) process.exit(await main());
void cpSync; void mkdirSync; void readdirSync; void statSync;
