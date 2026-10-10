// Flash proxy for WCAG 2.3.1 (no more than three flashes in any one second). Decodes a video with ffmpeg to a small grayscale grid, converts to
// relative luminance, and counts reversals of large (>= 0.10) luminance steps in any one-second window, for the whole frame and for each
// quadrant. This is a conservative proxy for the Harding-style test, not the test itself; a real clip with strong flicker still needs a person.
import { spawnSync } from 'node:child_process';

export const ffmpegAvailable = () => spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' }).status === 0;

export function flashStats(path, { fps = 24, step = 0.10, darkLimit = 0.80 } = {}) {
  const W = 32, H = 18;
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', path, '-vf', `fps=${fps},scale=${W}:${H}:flags=area,format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`ffmpeg could not decode ${path}: ${String(r.stderr).slice(0, 120)}`);
  const buf = r.stdout, n = Math.floor(buf.length / (W * H));
  if (n < 2) return { frames: n, maxPerSecond: 0, worst: 'none', ok: true };
  const area = { whole: [0, 0, W, H], 'top-left': [0, 0, W / 2, H / 2], 'top-right': [W / 2, 0, W, H / 2], 'bottom-left': [0, H / 2, W / 2, H], 'bottom-right': [W / 2, H / 2, W, H] };
  const series = {};
  for (const [k, [x0, y0, x1, y1]] of Object.entries(area)) {
    series[k] = [];
    for (let f = 0; f < n; f++) { let s = 0, c = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { s += buf[f * W * H + y * W + x]; c++; } series[k].push(((s / c) / 255) ** 2.2); }
  }
  let max = 0, worst = 'none';
  for (const [k, L] of Object.entries(series)) {
    const reversals = [];   // frame index of each reversal of direction between significant steps
    let dir = 0;
    for (let f = 1; f < n; f++) {
      const d = L[f] - L[f - 1];
      if (Math.abs(d) >= step && Math.min(L[f], L[f - 1]) < darkLimit) { const s = Math.sign(d); if (dir !== 0 && s !== dir) reversals.push(f); dir = s; }
    }
    for (let i = 0; i < reversals.length; i++) { const inWindow = reversals.filter((f) => f >= reversals[i] && f < reversals[i] + fps).length; if (inWindow > max) { max = inWindow; worst = k; } }
  }
  return { frames: n, maxPerSecond: max, worst, ok: max <= 3 };
}
