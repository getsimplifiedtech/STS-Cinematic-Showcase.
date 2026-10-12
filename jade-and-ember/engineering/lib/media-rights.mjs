// Media rights inventory (Gate 5 Phase 5, APR-JE-033). The inventory (engineering/media-rights-inventory.json) lists every image, video and font the
// demonstration delivers, where each came from, what is NOT yet established and which official terms a person must read. It asserts no right.
// This module checks that the inventory is complete and true to the files (hashes, sizes, one entry per file), that nothing is marked verified without
// a recorded rights-verification approval, that the generated media is never described as licensed, and (for fonts) that the licence text and the
// copyright notice shipped in fonts/LICENSES.txt exist and agree with the notice inside each font file.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { RIGHTS_CLAIM } from './search.mjs';

export const STATUSES = ['unverified', 'licence-text-shipped', 'verified'];
export const KINDS = ['image', 'video', 'font'];
const DOC_FILES = new Set(['PROVENANCE.md', 'LICENSES.txt']);
const sha256 = (b) => createHash('sha256').update(b).digest('hex');

// ---- the name table of a WOFF2 font (a minimal reader: header, table directory, one Brotli stream; the name table is never transformed)
const KNOWN_TAGS = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'];
export function readWoff2Names(buf) {
  if (buf.length < 48 || buf.toString('latin1', 0, 4) !== 'wOF2') return null;
  const numTables = buf.readUInt16BE(12), compressed = buf.readUInt32BE(20);
  let o = 48;
  const base128 = () => { let v = 0; for (let i = 0; i < 5; i++) { const b = buf[o++]; v = (v << 7) | (b & 0x7f); if (!(b & 0x80)) return v >>> 0; } throw new Error('bad UIntBase128'); };
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const flags = buf[o++]; let tag = KNOWN_TAGS[flags & 0x3f];
    if ((flags & 0x3f) === 63) { tag = buf.toString('latin1', o, o + 4); o += 4; }
    const version = flags >> 6, orig = base128();
    const transformed = (tag === 'glyf' || tag === 'loca') ? version === 0 : version !== 0;
    tables.push({ tag, length: transformed ? base128() : orig });
  }
  const data = brotliDecompressSync(buf.subarray(o, o + compressed));
  let off = 0, name = null;
  for (const t of tables) { if (t.tag === 'name') name = data.subarray(off, off + t.length); off += t.length; }
  if (!name) return {};
  const count = name.readUInt16BE(2), strings = name.readUInt16BE(4), out = {};
  for (let i = 0; i < count; i++) {
    const r = 6 + i * 12, platform = name.readUInt16BE(r), id = name.readUInt16BE(r + 6), len = name.readUInt16BE(r + 8), at = strings + name.readUInt16BE(r + 10);
    if (out[id] !== undefined && platform !== 3) continue;
    const raw = name.subarray(at, at + len);
    out[id] = platform === 3 || platform === 0 ? Buffer.from(raw).swap16().toString('utf16le') : raw.toString('latin1');
  }
  return out;
}

// ---- the licence file: sections "===== family (licence) =====" and the first paragraph after each header (the copyright notice)
export function licenceSections(text) {
  const parts = text.split(/^===== (.+?) =====$/m);
  const out = [];
  for (let i = 1; i < parts.length; i += 2) {
    const body = parts[i + 1].replace(/^\n+/, '');
    out.push({ header: parts[i], family: parts[i].split(' ')[0], notice: body.split(/\n\s*\n/)[0].trim(), body });
  }
  return out;
}
const STOP = new Set(['copyright', 'the', 'project', 'authors', 'author', 'inc', 'ltd', 'http', 'https', 'www', 'com', 'org', 'github', 'font', 'ttf', 'italic', 'wght', 'c']);
const tokens = (s) => new Set((String(s).toLowerCase().match(/[a-z]{3,}/g) || []).filter((w) => !STOP.has(w)));
// do two copyright notices name the same party? (shared holder or project word; years and punctuation are ignored)
export const noticesAgree = (a, b) => { const x = tokens(a), y = tokens(b); for (const w of x) if (y.has(w)) return true; return false; };

// ---- the inventory against the files
export function mediaRightsProblems({ inventory, root, approvals = [], licenceText = null }) {
  const problems = [], notices = [];
  const bad = (key, detail) => problems.push({ key, detail });
  if (!inventory || !Array.isArray(inventory.assets) || !Array.isArray(inventory.terms)) return { problems: [{ key: 'inventory', detail: 'the media rights inventory has no assets or terms list' }], notices };
  const termIds = new Set();
  for (const t of inventory.terms) {
    if (!/^T-[A-Z0-9-]+$/.test(t.id || '')) { bad(`terms:${t.id}`, `term id "${t.id}" must look like T-HF-TOS`); continue; }
    if (termIds.has(t.id)) bad(`terms:${t.id}`, `term ${t.id} is listed twice`);
    termIds.add(t.id);
    if (t.url !== null && !/^https:\/\//.test(t.url || '')) bad(`terms:${t.id}`, `term ${t.id}: url must be an https address (or null when the owner has to capture it)`);
    if (typeof t.establishes !== 'string' || t.establishes.trim().length < 20) bad(`terms:${t.id}`, `term ${t.id}: establishes must say what a person has to find out`);
    if (!['not-reviewed', 'reviewed'].includes(t.status)) bad(`terms:${t.id}`, `term ${t.id}: status must be not-reviewed or reviewed`);
    if (t.status === 'reviewed' && !(/^\d{4}-\d{2}-\d{2}$/.test(t.reviewedOn || '') && t.reviewedBy)) bad(`terms:${t.id}`, `term ${t.id}: a reviewed term needs reviewedOn and reviewedBy`);
  }
  const rightsRows = approvals.filter((r) => String(r.type).toLowerCase().includes('rights-verification'));
  const files = [];
  for (const dir of ['media', 'fonts']) if (existsSync(join(root, dir))) for (const f of readdirSync(join(root, dir)).sort()) if (!DOC_FILES.has(f)) files.push(`${dir}/${f}`);
  const byPath = new Map();
  for (const a of inventory.assets) {
    if (byPath.has(a.path)) bad(`dup:${a.path}`, `${a.path} is listed twice in the rights inventory`);
    byPath.set(a.path, a);
  }
  for (const f of files) if (!byPath.has(f)) bad(`missing:${f}`, `${f} is delivered but has no entry in the media rights inventory (every image, video and font needs one)`);
  const fonts = licenceText ? licenceSections(licenceText) : [];
  for (const [path, a] of byPath) {
    const w = path;
    if (!existsSync(join(root, path))) { bad(`gone:${path}`, `${path} is in the rights inventory but is not delivered`); continue; }
    const buf = readFileSync(join(root, path));
    if (a.sha256 !== sha256(buf) || a.bytes !== buf.length) bad(`changed:${path}`, `${w} has changed since the rights inventory was written (hash or size differs): the review no longer describes this file`);
    if (!KINDS.includes(a.kind)) bad(`kind:${path}`, `${w}: kind must be one of ${KINDS.join(', ')}`);
    if (!a.rights || !STATUSES.includes(a.rights.status)) { bad(`status:${path}`, `${w}: rights.status must be one of ${STATUSES.join(', ')}`); continue; }
    if (a.rights.status === 'verified') {
      if (!a.rights.approval || !rightsRows.some((r) => r.id === a.rights.approval)) bad(`verified:${path}`, `${w} is marked verified but no rights-verification approval row ${a.rights.approval || '(none named)'} exists: nothing may be marked verified without a recorded approval`);
    }
    if (a.kind === 'image' || a.kind === 'video') {
      if (a.rights.status === 'licence-text-shipped') bad(`status:${path}`, `${w}: generated media cannot be "licence-text-shipped"; it is unverified until a rights-verification approval exists`);
      if (!a.origin || !a.origin.service || !/^\d{4}-\d{2}-\d{2}$/.test(a.origin.generatedOn || '')) bad(`origin:${path}`, `${w}: origin.service and origin.generatedOn are required for generated media`);
      if (!Array.isArray(a.termsToVerify) || !a.termsToVerify.length) bad(`terms:${path}`, `${w}: termsToVerify must name the official terms a person has to read`);
      else for (const id of a.termsToVerify) if (!termIds.has(id)) bad(`terms:${path}`, `${w}: termsToVerify names ${id}, which is not in the terms list`);
    }
    if (a.kind === 'font') {
      const sec = fonts.find((s) => s.family === a.licenceSection);
      if (!sec) bad(`licence:${path}`, `${w}: fonts/LICENSES.txt has no section "${a.licenceSection}"`);
      else {
        if (!/SIL OPEN FONT LICENSE Version 1\.1/i.test(sec.body)) bad(`licence:${path}`, `${w}: the "${sec.family}" section of fonts/LICENSES.txt does not contain the SIL Open Font License 1.1 text`);
        if (!sec.notice || sec.notice.length < 5) bad(`licence:${path}`, `${w}: the "${sec.family}" section has no copyright notice`);
        const embedded = readWoff2Names(buf);
        if (embedded && embedded[0] && sec.notice && !noticesAgree(sec.notice, embedded[0])) notices.push({ family: sec.family, path, detail: `${path}: the copyright notice inside the font file ("${embedded[0].trim()}") names a different party from the notice shipped in fonts/LICENSES.txt ("${sec.notice.split('\n')[0].trim()}")` });
      }
      if (a.rights.status === 'unverified') bad(`status:${path}`, `${w}: a font whose licence text is shipped is "licence-text-shipped", not "unverified"`);
    }
    for (const k of ['useNow', 'clientUse']) if (typeof a[k] !== 'string' || a[k].trim().length < 15) bad(`${k}:${path}`, `${w}: ${k} must say what use is permitted now / for a client`);
  }
  // the inventory must never describe the media as licensed, owned or cleared
  if (RIGHTS_CLAIM.test(JSON.stringify(inventory))) bad('wording', 'the media rights inventory contains wording that claims a right (licensed, rights-cleared, royalty-free ...): it must only say what is established and what is not');
  return { problems, notices };
}

// A fingerprint of the delivered media and fonts, for a future rights-verification approval to be bound to (the proposed release requirement).
export function mediaInventoryDigest(inventory) {
  return createHash('sha256').update(JSON.stringify((inventory.assets || []).map((a) => [a.path, a.sha256]).sort())).digest('hex');
}

// ---- the release side (G6-3, APR-JE-040; decision D-P5-4, finding RG-03)
// A fingerprint of every file the release delivers under media/ and fonts/ (path and content), for a rights-verification record to be bound to. Changing, adding or
// removing any image, video, font or licence file changes it, so a verification never silently covers media it did not see.
export function deliveredMediaDigest(siteDir) {
  const rows = [];
  for (const dir of ['media', 'fonts']) if (existsSync(join(siteDir, dir))) for (const f of readdirSync(join(siteDir, dir)).sort()) rows.push([`${dir}/${f}`, sha256(readFileSync(join(siteDir, dir, f)))]);
  return sha256(JSON.stringify(rows));
}

// Does the build carry any media whose use is not established? rightsIds: the ids of the rights-verification records IN FORCE for this candidate and these
// files (rejected, revoked, superseded and mismatched records are not in the list), so revoking or rejecting a record un-verifies everything it covered.
// Returns { ok, detail, problems }.
export function rightsClearance({ inventory, siteDir, rightsIds, findingIds, blockingFindings }) {
  const licencePath = join(siteDir, 'fonts', 'LICENSES.txt');
  const licenceText = existsSync(licencePath) ? readFileSync(licencePath, 'utf8') : null;
  const base = mediaRightsProblems({ inventory, root: siteDir, approvals: rightsIds.map((id) => ({ id, type: 'rights-verification' })), licenceText });
  const problems = base.problems.map((p) => p.detail);
  for (const n of base.notices) problems.push(n.detail);
  const termById = new Map((inventory?.terms || []).map((t) => [t.id, t]));
  for (const a of inventory?.assets || []) {
    const st = a.rights?.status;
    if (a.kind === 'image' || a.kind === 'video') {
      if (st !== 'verified') problems.push(`${a.path} is ${st || 'without a status'}, not verified: no rights-verification record covers its use`);
      else if (!rightsIds.includes(a.rights.approval)) problems.push(`${a.path} names ${a.rights.approval || 'no record'}, which is not an in-force rights verification of this build (rejected, revoked, superseded, for other media or not made)`);
    } else if (a.kind === 'font' && !['licence-text-shipped', 'verified'].includes(st)) problems.push(`${a.path} is ${st || 'without a status'}: a font needs its licence text shipped`);
    for (const id of a.termsToVerify || []) { const t = termById.get(id); if (!t || t.status !== 'reviewed') problems.push(`${a.path}: the terms ${id} have not been reviewed by a person (dated, authoritative evidence is the owner's task, D-P5-5)`); }
  }
  const open = (blockingFindings || []).filter((id) => (findingIds || []).includes(id));
  for (const id of open) problems.push(`finding ${id} is still open: it is resolved, not merely accepted, before a client release`);
  const uniq = [...new Set(problems)];
  return { ok: uniq.length === 0, problems: uniq, detail: uniq.length ? `${uniq.length} problem(s): ${uniq.slice(0, 3).join('; ')}` : `${(inventory?.assets || []).length} assets: every image and video verified by an in-force rights verification, fonts with their licence text, terms reviewed, findings closed` };
}
