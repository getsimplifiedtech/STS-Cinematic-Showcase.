// Pixel size of a WebP file (lossy, lossless or extended), read from its header. Lets a component declare real width and height without the config repeating them.
import { openSync, readSync, closeSync } from 'node:fs';

export function webpSize(file) {
  let fd;
  try {
    fd = openSync(file, 'r');
    const b = Buffer.alloc(32);
    readSync(fd, b, 0, 32, 0);
    if (b.toString('latin1', 0, 4) !== 'RIFF' || b.toString('latin1', 8, 12) !== 'WEBP') return null;
    const kind = b.toString('latin1', 12, 16);
    if (kind === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    if (kind === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    if (kind === 'VP8L') { const v = b.readUInt32LE(21); return { width: (v & 0x3fff) + 1, height: ((v >> 14) & 0x3fff) + 1 }; }
    return null;
  } catch { return null; } finally { if (fd !== undefined) closeSync(fd); }
}
