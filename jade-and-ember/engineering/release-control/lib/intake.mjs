// Artifact intake and verification (G6-3A proof of concept). RC does not trust the package it is given and does not re-implement what the repository already checks:
// it runs the EXISTING package verifier (lib/release-package.mjs: checksums, manifest schema, candidate digest recomputed from the ZIP's own bytes, security headers, SBOM,
// external links, rights, supply chain, verification record, reviewer table, channel text) with RC's own tooling and RC's own authenticity decision, then derives the
// facts RC itself needs (the delivered files, the subjects a person has to approve) from the package bytes, never from the manifest alone.
import { lstatSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { RcError, sha256 } from './util.mjs';
import { LIMITS } from './state.mjs';
import { verifyPackage } from '../../lib/release-package.mjs';
import { unzipTo } from '../../lib/zip.mjs';
import { deliveredDestinations } from '../../lib/external-gate.mjs';
import { deliveredMediaDigest } from '../../lib/media-rights.mjs';
import { canonicalJson } from './util.mjs';

export const NOT_DELIVERED = new Set(['START-HERE.txt', 'serve.py']);   // added to the ZIP when it is packed; never part of the live site

// every file of a package folder, refusing symlinks, devices and nested oddities; returns [{ rel, size }]
export function plainTree(dir, limits = LIMITS) {
  const out = [];
  const walk = (d, pre) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name), st = lstatSync(p), rel = pre ? `${pre}/${name}` : name;
      if (st.isSymbolicLink()) throw new RcError('unsafe-package', `${rel} is a symbolic link`);
      if (st.isDirectory()) { walk(p, rel); continue; }
      if (!st.isFile()) throw new RcError('unsafe-package', `${rel} is not a plain file`);
      out.push({ rel, size: st.size });
      if (out.length > limits.maxEntries) throw new RcError('package-too-large', `more than ${limits.maxEntries} files`);
    }
  };
  walk(dir, '');
  if (out.reduce((s, f) => s + f.size, 0) > limits.maxPackageBytes) throw new RcError('package-too-large', `more than ${limits.maxPackageBytes} bytes`);
  return out;
}
// one digest over every file of a folder: any change to any file changes it
export function treeDigest(dir) {
  return sha256(plainTree(dir, { maxEntries: 1e6, maxPackageBytes: Infinity }).map((f) => `${sha256(readFileSync(join(dir, f.rel)))}  ${f.rel}`).join('\n'));
}
export const filesDigest = (map) => sha256(canonicalJson(Object.fromEntries([...map.entries()].sort(([a], [b]) => (a < b ? -1 : 1)))));

// packageDir: a prepared release/ folder (already copied into RC's own storage). siteOut: where to extract the delivered site (created). hook: the authenticity decision.
// the exact top level of a prepared package; the verifier checks what it needs, so anything else would be unexamined content riding along
const TOP = new Set(['release-manifest.json', 'SHA256SUMS.txt', 'sbom.cdx.json', 'host', 'records', 'data']);
const HOST = new Set(['_headers', 'nginx.conf', 'htaccess']);
export function layoutProblems(dir) {
  const files = plainTree(dir, { maxEntries: 1e6, maxPackageBytes: Infinity }).map((f) => f.rel);
  return files.filter((rel) => { const [top, second] = rel.split('/'); if (rel.split('/').length === 1) return !(TOP.has(rel) || /^[A-Za-z0-9._-]+\.zip$/.test(rel)); if (!TOP.has(top)) return true; return top === 'host' && !(rel.split('/').length === 2 && HOST.has(second)); });
}

export function intake({ packageDir, tooling, hook, siteOut, verify = verifyPackage }) {
  plainTree(packageDir);
  const stray = layoutProblems(packageDir);
  if (stray.length) throw new RcError('unexpected-files', `the package holds files a prepared package does not hold: ${stray.slice(0, 3).join(', ')}`);
  let pv;
  try { pv = verify(packageDir, { eng: tooling, authenticity: hook }); } catch (e) { pv = { ok: false, checks: [{ id: 'verifier', ok: false, detail: `the package verifier could not judge the package (${String(e.message).slice(0, 120)})` }] }; }
  const failing = pv.checks.filter((c) => !c.ok).map((c) => c.id);
  const zips = readdirSync(packageDir).filter((f) => f.endsWith('.zip'));
  let manifest = null, siteFiles = null, subjects = null, zipSha = null;
  if (zips.length === 1) {
    const zip = readFileSync(join(packageDir, zips[0]));
    zipSha = sha256(zip);
    try { manifest = JSON.parse(readFileSync(join(packageDir, 'release-manifest.json'), 'utf8')); } catch { /* reported by the verifier */ }
    if (manifest && failing.every((f) => f === 'authenticity')) {   // the delivered site is only unpacked for a package the verifier accepts on every point but the one RC decides itself
      try {
        mkdirSync(siteOut, { recursive: true });
        unzipTo(zip, siteOut);
        siteFiles = new Map(plainTree(siteOut).filter((f) => !NOT_DELIVERED.has(f.rel)).map((f) => [f.rel, readFileSync(join(siteOut, f.rel))]));
        const ext = deliveredDestinations(siteOut, { baseUrl: manifest.configuration?.baseUrl });
        let domain = null; try { domain = new URL(manifest.configuration.baseUrl).hostname.toLowerCase(); } catch { /* none */ }
        subjects = { search: manifest.search?.artifactsDigest ?? null, rights: deliveredMediaDigest(siteOut), externalLinks: ext.digest, domain };
      } catch { siteFiles = null; subjects = null; }
    }
  }
  return { checks: pv.checks, failing, manifest, siteFiles, subjects, zipSha, zipName: zips[0] || null };
}
