// Minimal ZIP writer and reader (stored or deflated entries, no encryption, no ZIP64): enough to package and unpack the delivered site in the
// checks without depending on a zip tool. Deterministic output: sorted names, fixed timestamp.
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { listFiles } from './git.mjs';

const TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export const crc32 = (buf) => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const DOS_TIME = 0, DOS_DATE = (2000 - 1980) << 9 | 1 << 5 | 1;   // 2000-01-01 00:00

// entries: [{ name, data: Buffer }] -> Buffer
export function zipBuffer(entries) {
  const locals = [], central = [];
  let offset = 0;
  for (const { name, data } of [...entries].sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const nameBuf = Buffer.from(name, 'utf8');
    const deflated = deflateRawSync(data, { level: 9 });
    const useDeflate = deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const crc = crc32(data);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(useDeflate ? 8 : 0, 8);
    h.writeUInt16LE(DOS_TIME, 10); h.writeUInt16LE(DOS_DATE, 12); h.writeUInt32LE(crc, 14); h.writeUInt32LE(body.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(nameBuf.length, 26);
    locals.push(h, nameBuf, body);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(useDeflate ? 8 : 0, 10);
    c.writeUInt16LE(DOS_TIME, 12); c.writeUInt16LE(DOS_DATE, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(body.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(nameBuf.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, nameBuf);
    offset += 30 + nameBuf.length + body.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

export const zipFolder = (dir) => zipBuffer(listFiles(dir).map((name) => ({ name, data: readFileSync(join(dir, name)) })));

// Extracts a ZIP buffer into dest. STRICT: the container is read the way every extractor reads it, or it is refused (G6-2 review, F2). A ZIP that tools disagree
// about (a repeated name, bytes between or after the entries, an entry the central directory does not list, a local header whose name differs, an extra field, a
// comment, a symlink or executable bit, an encrypted or streamed entry, an inflated size that is not the declared one) could show a verifier one file and an
// extractor another. This reader accepts only what zipBuffer() writes: entries tile the file exactly, in the central directory's order, with nothing else.
//   opts.names  a RegExp every entry name must match (default: a plain relative path of letters, digits, . _ - and /)
// Verifies every CRC. Returns the extracted names.
const NAME_OK = /^(?!\/)(?!.*\/\/)(?!.*(^|\/)\.\.?(\/|$))[A-Za-z0-9._\-/]+$/;
export function unzipTo(buf, dest, { names = NAME_OK } = {}) {
  const eocd = buf.length - 22;
  if (eocd < 0 || buf.readUInt32LE(eocd) !== 0x06054b50) throw new Error('not a ZIP file, or it carries a comment or trailing bytes after the end record');
  if (buf.readUInt16LE(eocd + 4) !== 0 || buf.readUInt16LE(eocd + 6) !== 0 || buf.readUInt16LE(eocd + 20) !== 0) throw new Error('multi-disk ZIP or archive comment');
  const count = buf.readUInt16LE(eocd + 10), cdSize = buf.readUInt32LE(eocd + 12), cdStart = buf.readUInt32LE(eocd + 16);
  if (buf.readUInt16LE(eocd + 8) !== count || cdStart + cdSize !== eocd) throw new Error('inconsistent central directory (it does not end where the end record begins)');
  let p = cdStart, expectOffset = 0;
  const seen = new Set(), out = [], files = [];
  for (let i = 0; i < count; i++) {
    if (p + 46 > eocd || buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory');
    const flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), disk = buf.readUInt16LE(p + 34), iattr = buf.readUInt16LE(p + 36), eattr = buf.readUInt32LE(p + 38), lho = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    p += 46 + nlen + xlen + clen;
    if (xlen || clen) throw new Error(`entry ${name} carries an extra field or a comment`);
    if (flags & 0x0009) throw new Error(`entry ${name} is encrypted or uses a data descriptor`);
    if (disk !== 0 || iattr !== 0 || (eattr >>> 16) !== 0 && (eattr >>> 16) !== 0x81a4 || (eattr & 0xffff) !== 0) throw new Error(`entry ${name} is not a plain file (special attributes, symlink or executable bit)`);
    if (method !== 0 && method !== 8) throw new Error(`entry ${name} uses an unsupported method`);
    if (name.endsWith('/') || !names.test(name)) throw new Error(`unsafe path in ZIP (or a name outside the plain set): ${JSON.stringify(name)}`);
    const key = name.normalize('NFC').toLowerCase();
    if (seen.has(key)) throw new Error(`the ZIP lists a name twice (or two names that differ only in case): ${name}`);
    seen.add(key);
    // the local header must be exactly where the previous entry ended, say the same, and be followed directly by the data
    if (lho !== expectOffset || buf.readUInt32LE(lho) !== 0x04034b50) throw new Error(`entry ${name} is not where the central directory says (gaps or hidden entries between files)`);
    const lflags = buf.readUInt16LE(lho + 6), lmethod = buf.readUInt16LE(lho + 8), lcrc = buf.readUInt32LE(lho + 14), lcsize = buf.readUInt32LE(lho + 18), lusize = buf.readUInt32LE(lho + 22), lnlen = buf.readUInt16LE(lho + 26), lxlen = buf.readUInt16LE(lho + 28);
    if (lxlen || lnlen !== nlen || buf.toString('utf8', lho + 30, lho + 30 + lnlen) !== name || lflags !== flags || lmethod !== method || lcrc !== crc || lcsize !== csize || lusize !== usize) throw new Error(`the local header of ${name} differs from its central directory entry`);
    const start = lho + 30 + lnlen;
    if (start + csize > cdStart) throw new Error(`entry ${name} runs into the central directory`);
    expectOffset = start + csize;
    const raw = buf.subarray(start, start + csize);
    let data;
    try { data = method === 8 ? inflateRawSync(raw, { maxOutputLength: usize + 1 }) : raw; } catch { throw new Error(`entry ${name} does not inflate to its declared size`); }
    if (data.length !== usize) throw new Error(`entry ${name} is ${data.length} bytes, its header says ${usize}`);
    if (crc32(data) !== crc) throw new Error(`CRC mismatch in ${name}`);
    files.push({ name, data });
  }
  if (expectOffset !== cdStart) throw new Error('bytes between the last entry and the central directory (a hidden entry or padding)');
  for (const { name, data } of files) { const target = join(dest, name); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, data); out.push(name); }
  return out;
}
