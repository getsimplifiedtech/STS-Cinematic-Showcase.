// PROJECT-OWNED: how this project puts a tag into the <head> of every page for the release dry run's social-image scenarios.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const ANCHOR = '<meta property="og:type" content="website">';
export function addHeadTag(root, tag) {
  const file = join(root, 'src', 'components', 'document.mjs');
  const text = readFileSync(file, 'utf8');
  if (!text.includes(ANCHOR)) throw new Error('the document component has no og:type tag to follow');
  writeFileSync(file, text.replace(ANCHOR, `${ANCHOR}\n${tag}`));
}
