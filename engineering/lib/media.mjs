// Minimal, dependency-free readers for the media formats the site ships. They read headers only (format, dimensions, duration, tracks).
// Each returns null when the bytes are not that format.
export const u16 = (b, o) => b.readUInt16LE(o);

export function sniff(buf) {
  if (buf.length < 12) return 'unknown';
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  if (buf.toString('latin1', 0, 4) === 'wOF2') return 'woff2';
  if (buf.readUInt32BE(0) === 0x1a45dfa3) return 'ebml';
  if (buf.toString('latin1', 4, 8) === 'ftyp') return 'mp4';
  return 'unknown';
}

export function readWebp(b) {
  if (sniff(b) !== 'webp') return null;
  const kind = b.toString('latin1', 12, 16);
  if (kind === 'VP8 ') return { codec: 'lossy', width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  if (kind === 'VP8L') return { codec: 'lossless', width: 1 + (b[21] | ((b[22] & 0x3f) << 8)), height: 1 + ((b[22] >> 6) | (b[23] << 2) | ((b[24] & 0x0f) << 10)) };
  if (kind === 'VP8X') return { codec: 'extended', width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)), animated: Boolean(b[20] & 0x02) };
  return null;
}

// ISO base media (MP4): moov > mvhd (timescale, duration) and trak > tkhd (size) + mdia > hdlr (video or sound).
export function readMp4(b) {
  if (sniff(b) !== 'mp4') return null;
  const out = { brand: b.toString('latin1', 8, 12), tracks: [], duration: null };
  const boxes = (start, end, fn) => {
    for (let o = start; o + 8 <= end;) {
      let size = b.readUInt32BE(o); const type = b.toString('latin1', o + 4, o + 8); let head = 8;
      if (size === 1) { size = Number(b.readBigUInt64BE(o + 8)); head = 16; } else if (size === 0) size = end - o;
      if (size < head) return;
      fn(type, o + head, o + size);
      o += size;
    }
  };
  boxes(0, b.length, (type, s, e) => {
    if (type !== 'moov') return;
    boxes(s, e, (t2, s2, e2) => {
      if (t2 === 'mvhd') { const v = b[s2]; const ts = b.readUInt32BE(s2 + (v === 1 ? 20 : 12)); const d = v === 1 ? Number(b.readBigUInt64BE(s2 + 24)) : b.readUInt32BE(s2 + 16); out.duration = d / ts; }
      if (t2 === 'trak') {
        const tr = { type: null, width: null, height: null, codec: null };
        boxes(s2, e2, (t3, s3, e3) => {
          if (t3 === 'tkhd') { const v = b[s3]; const w = s3 + (v === 1 ? 88 : 76); tr.width = b.readUInt32BE(w) / 65536; tr.height = b.readUInt32BE(w + 4) / 65536; }
          if (t3 === 'mdia') boxes(s3, e3, (t4, s4, e4) => {
            if (t4 === 'hdlr') tr.type = b.toString('latin1', s4 + 8, s4 + 12);
            if (t4 === 'minf') boxes(s4, e4, (t5, s5, e5) => { if (t5 === 'stbl') boxes(s5, e5, (t6, s6) => { if (t6 === 'stsd') tr.codec = b.toString('latin1', s6 + 12, s6 + 16); }); });
          });
        });
        out.tracks.push(tr);
      }
    });
  });
  return out;
}

// Matroska / WebM: Segment > Info (TimecodeScale, Duration) and Tracks > TrackEntry (TrackType, CodecID, Video > PixelWidth, PixelHeight).
export function readWebm(b) {
  if (sniff(b) !== 'ebml') return null;
  const out = { doctype: null, tracks: [], duration: null };
  let scale = 1000000;
  const vint = (o, keepMarker) => { const first = b[o]; let len = 1; while (len <= 8 && !(first & (0x80 >> (len - 1)))) len++; let v = keepMarker ? first : first & (0xff >> len); for (let i = 1; i < len; i++) v = v * 256 + b[o + i]; return { v, len, unknown: !keepMarker && v === 2 ** (7 * len) - 1 }; };
  const MASTER = new Set([0x18538067, 0x1549a966, 0x1654ae6b, 0xae, 0xe0, 0x1a45dfa3]);
  const walk = (start, end, ctx) => {
    for (let o = start; o < end;) {
      const id = vint(o, true), sz = vint(o + id.len, false); const ds = o + id.len + sz.len; const de = sz.unknown ? end : Math.min(end, ds + sz.v);
      if (MASTER.has(id.v)) { const nctx = id.v === 0xae ? { track: {} } : ctx; if (id.v === 0xae) out.tracks.push(nctx.track); walk(ds, de, nctx); }
      else if (id.v === 0x4282) out.doctype = b.toString('latin1', ds, de);
      else if (id.v === 0x2ad7b1) scale = b.readUIntBE(ds, de - ds);
      else if (id.v === 0x4489) out.duration = (de - ds === 8 ? b.readDoubleBE(ds) : b.readFloatBE(ds)) * scale / 1e9;
      else if (ctx?.track && id.v === 0x83) ctx.track.type = b[ds] === 1 ? 'vide' : b[ds] === 2 ? 'soun' : 'other';
      else if (ctx?.track && id.v === 0x86) ctx.track.codec = b.toString('latin1', ds, de);
      else if (ctx?.track && id.v === 0xb0) ctx.track.width = b.readUIntBE(ds, de - ds);
      else if (ctx?.track && id.v === 0xba) ctx.track.height = b.readUIntBE(ds, de - ds);
      o = de;
    }
  };
  walk(0, b.length, null);
  return out;
}
