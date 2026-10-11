// node engineering/tools/framework-matrix.mjs [--write]   Prints (or writes) engineering/FRAMEWORK-MIGRATION-MATRIX.md from framework-migration-matrix.json.
// Reads the repository; never touches the framework repository; extracts nothing.
import { writeFileSync } from 'node:fs';
import { approvalsText, classify, loadMatrix, MATRIX_MD, render, repoFiles, validate } from '../lib/framework-matrix.mjs';

const m = loadMatrix(), files = repoFiles();
const { problems, classification } = validate(m, files, approvalsText());
if (problems.length) { problems.forEach((p) => console.error('  - ' + p)); console.error('The matrix is not valid; nothing was written.'); process.exit(1); }
const md = render(m, classification);
if (process.argv.includes('--write')) { writeFileSync(MATRIX_MD, md); console.log(`wrote ${MATRIX_MD} (${md.length} characters)`); } else process.stdout.write(md);
void classify;
