// Screenshot comparison with explicit tolerances (engineering/environment.json, "visual"). Same engine only.
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

// Returns { ok, differing, ratio, worstCell, reason?, diff? }. `diff` is a PNG buffer for review, produced only when the images differ.
export function comparePng(a, b, tol) {
  if (a.equals(b)) return { ok: true, differing: 0, ratio: 0, worstCell: 0 };
  const A = PNG.sync.read(a), B = PNG.sync.read(b);
  if (A.width !== B.width || A.height !== B.height) return { ok: false, differing: -1, ratio: 1, worstCell: -1, reason: `size ${A.width}x${A.height} vs ${B.width}x${B.height}` };
  const { width: w, height: h } = A;
  const mask = new PNG({ width: w, height: h });
  const differing = pixelmatch(A.data, B.data, mask.data, w, h, { threshold: tol.pixelThreshold, includeAA: false, diffMask: true });
  // The worst concentration of differing pixels in any tol.cell x tol.cell square (a small local change must not hide in a big page).
  const cols = Math.ceil(w / tol.cell), cells = new Uint32Array(cols * Math.ceil(h / tol.cell));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (mask.data[i + 3] > 0 && mask.data[i + 1] === 0) cells[Math.floor(y / tol.cell) * cols + Math.floor(x / tol.cell)]++;
  }
  const worstCell = cells.reduce((m, v) => Math.max(m, v), 0);
  const ratio = differing / (w * h);
  const ok = ratio <= tol.maxDiffRatio && worstCell <= tol.maxCellPixels;
  const out = { ok, differing, ratio, worstCell };
  if (differing > 0) {
    const review = new PNG({ width: w, height: h });
    pixelmatch(A.data, B.data, review.data, w, h, { threshold: tol.pixelThreshold, includeAA: false });
    out.diff = PNG.sync.write(review);
    if (!ok) out.reason = `${differing} pixels differ (${(ratio * 100).toFixed(4)}%), densest ${tol.cell}px cell has ${worstCell}`;
  }
  return out;
}
