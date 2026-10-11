// A fingerprint of exactly what search engines and AI readers will be given: sitemap.xml, robots.txt, llms.txt and the Home page JSON-LD.
// The human search review is bound to it, so changing any fact, URL or crawler rule invalidates the review. (Moved out of release.mjs in G6-2 so
// that the candidate digest can use it without a circular import; release.mjs re-exports both functions.)
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const sha = (s) => createHash('sha256').update(s).digest('hex');

export function searchDigest(siteDir) {
  const part = (name, text) => `${name}\n${text.length}\n${text}\n`;
  const read = (f) => { try { return readFileSync(join(siteDir, f), 'utf8'); } catch { return null; } };
  const sitemap = read('sitemap.xml');
  if (sitemap === null) return null;
  const ld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(read('index.html') || '');
  return sha(part('sitemap.xml', sitemap) + part('robots.txt', read('robots.txt') || '') + part('llms.txt', read('llms.txt') || '') + part('json-ld', ld ? ld[1] : ''));
}
export const searchFilesPresent = (siteDir) => ['sitemap.xml', 'robots.txt', 'llms.txt'].every((f) => existsSync(join(siteDir, f)));
