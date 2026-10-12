// A small, invented, deterministic static site for testing the hosting adapters (G6-4, APR-JE-044). It is NOT Jade & Ember and not a client: a three-page "Fixture Bakery" with an inline
// script and a style attribute (so the CSP has hashes to compute), a real 404 page, the three search files for the indexable channel, fonts and media of fixed bytes (one "video" large
// enough to test Range). The same bytes every run, so golden outputs can be compared byte for byte.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const page = (title, body, { noindex }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
${noindex ? '<meta name="robots" content="noindex, nofollow">\n' : ''}<link rel="stylesheet" href="styles.css">
</head>
<body>
<header><a class="brand" href="index.html">Fixture Bakery</a> <a href="menu.html">Menu</a> <a href="about.html">About</a></header>
<main>
${body}
</main>
<script>document.documentElement.className = "js";</script>
</body>
</html>
`;
const det = (n, seed) => { const b = Buffer.alloc(n); let x = seed; for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; b[i] = x >> 16 & 0xff; } return b; };

// channel: 'demonstration' (every page noindex, no search files) or 'client-production' (indexable, robots.txt, sitemap.xml, llms.txt)
// with404: include a top-level 404.html (the real-404 requirement, D-P3-1)
export function writeFixtureSite(dir, { channel = 'client-production', with404 = true } = {}) {
  const noindex = channel === 'demonstration';
  rmSync(dir, { recursive: true, force: true });
  const put = (rel, content) => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), content); };
  put('index.html', page('Fixture Bakery', '<h1 style="--focus: 50% 40%">Fixture Bakery</h1>\n<p>Bread, made up for a test.</p>', { noindex }));
  put('menu.html', page('Menu | Fixture Bakery', '<h1>Menu</h1>\n<p>Loaf. Roll.</p>', { noindex }));
  put('about.html', page('About | Fixture Bakery', '<h1>About</h1>\n<p>An invented bakery.</p>', { noindex }));
  if (with404) put('404.html', page('Not found | Fixture Bakery', '<h1>Page not found</h1>\n<p><a href="index.html">Home</a></p>', { noindex }));
  put('styles.css', 'body{font-family:system-ui;margin:0}\n.js h1{color:#222}\n');
  put('site.js', '"use strict";\n');
  put('fonts/fixture.woff2', det(512, 7));
  put('media/loaf.webp', det(2048, 11));
  put('media/clip.mp4', det(8192, 13));
  if (!noindex) {
    put('robots.txt', 'User-agent: *\nAllow: /\nSitemap: https://fixture-bakery.example/sitemap.xml\n');
    put('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>https://fixture-bakery.example/</loc></url>\n<url><loc>https://fixture-bakery.example/menu</loc></url>\n<url><loc>https://fixture-bakery.example/about</loc></url>\n</urlset>\n');
    put('llms.txt', '# Fixture Bakery\n\nAn invented bakery used to test hosting adapters.\n');
  }
  return dir;
}
