// Validates the four configuration files against engineering/schemas/*.schema.json before the build reads them.
// Structure and types only. Cross-file rules (page registry against copy, files that must exist, demo-text leaks) stay in src/lib/config.mjs.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSchema } from './schema.mjs';

export const CONFIG_FILES = ['client', 'menu', 'copy', 'site'];
const schemaDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'schemas');
export const loadSchema = (name) => JSON.parse(readFileSync(join(schemaDir, `${name}.schema.json`), 'utf8'));

// Returns readable errors for every file (unreadable files and invalid JSON included). Empty means all four files fit their schemas.
export function configSchemaErrors(configDir) {
  const errors = [];
  for (const name of CONFIG_FILES) {
    let data;
    try { data = JSON.parse(readFileSync(join(configDir, `${name}.json`), 'utf8')); } catch (e) { errors.push(`config/${name}.json: cannot be read as JSON (${e.message})`); continue; }
    errors.push(...validateSchema(data, loadSchema(name), name));
  }
  return errors;
}
