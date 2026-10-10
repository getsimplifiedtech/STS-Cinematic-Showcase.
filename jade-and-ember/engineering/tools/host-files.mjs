// Writes the host configuration for the built site: node engineering/tools/host-files.mjs [--out host] [--prefix /subdir] [--http]
// Output: _headers (Netlify, Cloudflare Pages), nginx.conf, htaccess, csp-meta.html (for hosts that cannot set headers), HOSTING.txt.
// The files are generated from engineering/security.json and the freshly built pages (the CSP hashes depend on the pages). Nothing is deployed.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { assembleCandidate } from '../lib/site.mjs';
import { buildCsp, loadPolicy, renderApache, renderHeadersFile, renderNginx } from '../lib/security.mjs';
import { projectDir } from '../lib/git.mjs';

const arg = (n) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null; };
const out = resolve(arg('--out') || join(projectDir, 'host'));
const prefix = (arg('--prefix') || '').replace(/\/$/, '');
const https = !process.argv.includes('--http');
const dir = assembleCandidate(projectDir, 'host');
try {
  const policy = loadPolicy();
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, '_headers'), renderHeadersFile(dir, policy, { prefix, https }));
  writeFileSync(join(out, 'nginx.conf'), renderNginx(dir, policy, { https }));
  writeFileSync(join(out, 'htaccess'), renderApache(dir, policy, { https }));
  const meta = buildCsp(dir, policy, { https }).split('; ').filter((d) => !/^(frame-ancestors|report-uri|sandbox)\b/.test(d)).join('; ');
  writeFileSync(join(out, 'csp-meta.html'), `<!-- Only for a host that cannot send headers. Put inside <head>, before any script or stylesheet. frame-ancestors cannot be set by a meta tag, and a meta policy does not exist over file:// until the page is opened from a server. Not added to the delivered pages by default. -->\n<meta http-equiv="Content-Security-Policy" content="${meta.replace(/"/g, '&quot;')}">\n`);
  writeFileSync(join(out, 'HOSTING.txt'), `Generated host files for the Jade & Ember static site (${https ? 'HTTPS' : 'plain HTTP'}${prefix ? `, under ${prefix}/` : ', domain root'}).\n_headers   Netlify, Cloudflare Pages\nnginx.conf  nginx (inside the server block)\nhtaccess    Apache with mod_headers (save as .htaccess in the site folder)\ncsp-meta.html  fallback for hosts that cannot set headers (weaker: see engineering/ENG-SECURITY.md)\nThe CSP hashes belong to the exact built pages: regenerate after every rebuild.\nNothing here deploys anything.\n`);
  console.log(`wrote ${out}: _headers, nginx.conf, htaccess, csp-meta.html, HOSTING.txt`);
} finally { rmSync(dir, { recursive: true, force: true }); }
