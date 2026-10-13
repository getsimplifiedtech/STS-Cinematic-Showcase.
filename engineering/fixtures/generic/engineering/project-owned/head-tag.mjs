// PROJECT-OWNED (generic fixture): how this project puts a tag into the <head> of every page, for the release dry run's social-image scenarios (fixtures.headTag in the manifest,
// lib/fixtures.mjs). It edits the project's own head template under `root` (a throwaway copy) so that the next build carries the tag.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ANCHOR = '<meta property="og:type" content="website">';
export function addHeadTag(root, tag) {
  const file = join(root, 'src', 'render.mjs');
  const text = readFileSync(file, 'utf8');
  if (!text.includes(ANCHOR)) throw new Error('the fixture head template has no og:type tag to follow');
  writeFileSync(file, text.replace(ANCHOR, `${ANCHOR}\n${tag}`));
}
