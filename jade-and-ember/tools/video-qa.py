#!/usr/bin/env python3
"""Hero-loop clip QA for Jade & Ember (Gate A, section 8 of docs/JADE_AND_EMBER_HERO_VIDEO_PLAN.md).

    python3 tools/video-qa.py clip.mp4 [--poster media/hero-wok.webp] [--json out.json]

Decodes the clip with ffmpeg (needs ffmpeg and ffprobe on PATH; numpy and Pillow in Python) and checks the numeric pass
criteria. It does NOT replace looking at the clip: texture swimming, edge crawl, morphing food, melted detail and new
objects are judged by eye. Thresholds are starting defaults and are meant to be calibrated on real footage.
Regions are percent boxes (x0, y0, x1, y1) of the frame, measured on the 1920x1080 poster.
"""
import argparse, json, subprocess, sys
import numpy as np
from PIL import Image

REGIONS = {
    # Regions are disjoint on purpose so one region's motion never contaminates another's measurement.
    # alive regions (motion expected)
    'flame':        (44, 8, 68, 56),
    'steam_left':   (27, 4, 44, 46),
    'burner_flame': (34, 84, 66, 99),
    # food: small motion only
    'food':         (31, 56, 70, 76),
    # rigid regions with real edges or texture: must not move
    'handle_left':  (21, 48, 30, 60),
    'handle_right': (74, 54, 81, 70),
    'burner_ring':  (29, 82, 33, 95),
    'pots':         (0, 20, 20, 60),
    'counter_right': (80, 75, 100, 100),
}
RIGID = ['handle_left', 'handle_right', 'burner_ring', 'pots', 'counter_right']
DRIFT_REGIONS = ['pots', 'counter_right']  # luma-drift proxy, away from the flame
DOWN = 4  # motion and structure metrics run on frames box-averaged 4x, so film grain and codec noise do not dominate
T = dict(rigid_ssim=0.97, food_ssim=0.85, food_jump=2.0, alive_flame=0.25, alive_steam=0.15, drift=0.06, endpoint_ssim=0.97,
         seam=3.0, flash_step=0.10, flash_per_s=3, min_w=1280, min_h=720, dur=(3.9, 5.6), fps=(23.0, 30.5),
         poster_ssim=0.90, poster_rgb=6.0)

def run(cmd):
    return subprocess.run(cmd, check=True, capture_output=True).stdout

def probe(path):
    j = json.loads(run(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height,r_frame_rate,nb_frames,duration',
                        '-show_entries', 'format=duration', '-of', 'json', path]))
    v = next(s for s in j['streams'] if s['codec_type'] == 'video')
    num, den = v['r_frame_rate'].split('/')
    return dict(w=int(v['width']), h=int(v['height']), fps=float(num) / float(den),
                dur=float(v.get('duration') or j['format']['duration']),
                audio=[s['codec_name'] for s in j['streams'] if s['codec_type'] == 'audio'])

def decode_gray(path, w, h):
    raw = run(['ffmpeg', '-v', 'error', '-i', path, '-an', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'])
    return np.frombuffer(raw, np.uint8).reshape(-1, h, w).astype(np.float32)

def first_rgb(path):
    raw = run(['ffmpeg', '-v', 'error', '-i', path, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-'])
    import io
    return Image.open(io.BytesIO(raw)).convert('RGB')

def box(a, k=7):
    c = np.cumsum(np.cumsum(np.pad(a, ((1, 0), (1, 0))), 0), 1)
    return (c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]) / (k * k)

def ssim(a, b):
    c1, c2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    ma, mb = box(a), box(b)
    va, vb, vab = box(a * a) - ma * ma, box(b * b) - mb * mb, box(a * b) - ma * mb
    return float((((2 * ma * mb + c1) * (2 * vab + c2)) / ((ma * ma + mb * mb + c1) * (va + vb + c2))).mean())

def down(a, k=DOWN):
    n, h, w = a.shape; h2, w2 = h // k * k, w // k * k
    return a[:, :h2, :w2].reshape(n, h2 // k, k, w2 // k, k).mean(axis=(2, 4))

def crop(frames, name):
    h, w = frames.shape[1:]
    x0, y0, x1, y1 = REGIONS[name]
    return frames[:, int(h * y0 / 100):int(h * y1 / 100), int(w * x0 / 100):int(w * x1 / 100)]

def check(path, poster=None):
    info = probe(path)
    g_full = decode_gray(path, info['w'], info['h'])
    n = len(g_full)
    g = down(g_full); del g_full
    res, rows = {}, []
    def add(name, ok, detail): rows.append((name, bool(ok), detail))

    add('format: resolution', info['w'] >= T['min_w'] and info['h'] >= T['min_h'], f"{info['w']}x{info['h']}")
    add('format: duration and fps', T['dur'][0] <= info['dur'] <= T['dur'][1] and T['fps'][0] <= info['fps'] <= T['fps'][1],
        f"{info['dur']:.2f}s @ {info['fps']:.1f}fps, {n} frames")
    add('format: silent (no audio stream)', not info['audio'], 'none' if not info['audio'] else f"audio: {info['audio']}")

    # rigid regions: SSIM of every frame against frame 0
    worst = (1.0, '')
    for r in RIGID:
        c = crop(g, r)
        s = min(ssim(c[0], c[i]) for i in range(1, n))
        if s < worst[0]: worst = (s, r)
    add('rigid objects stay rigid', worst[0] >= T['rigid_ssim'], f"worst region SSIM {worst[0]:.3f} ({worst[1]}), need >= {T['rigid_ssim']}")

    # food: close to frame 0, no sudden jumps
    f = crop(g, 'food')
    fs = min(ssim(f[0], f[i]) for i in range(1, n))
    jumps = np.abs(np.diff(f, axis=0)).mean(axis=(1, 2))
    FLOOR = 0.05  # below this the median step is noise, so a ratio is meaningless (a frozen clip is caught by the 'alive' check)
    ratio = float(jumps.max() / max(np.median(jumps), FLOOR))
    add('food keeps its look', fs >= T['food_ssim'] and ratio <= T['food_jump'],
        f"min SSIM {fs:.3f} (need >= {T['food_ssim']}); max/median step {ratio:.2f} (need <= {T['food_jump']})")

    # the scene is alive
    mads = {r: float(np.abs(np.diff(crop(g, r), axis=0)).mean()) for r in ('flame', 'steam_left')}
    add('flame and steam are alive', mads['flame'] >= T['alive_flame'] and mads['steam_left'] >= T['alive_steam'],
        f"mean frame-to-frame change flame {mads['flame']:.2f}, steam {mads['steam_left']:.2f} (need >= {T['alive_flame']} and >= {T['alive_steam']})")

    # luma drift in regions away from the flame
    d = np.stack([crop(g, r).mean(axis=(1, 2)) for r in DRIFT_REGIONS]).mean(axis=0)
    drift = float(np.abs(d - d[0]).max() / max(d[0], 1.0))
    add('no luma drift', drift <= T['drift'], f"max drift {drift*100:.1f}% of frame 0 (need <= {T['drift']*100:.0f}%)")

    # endpoints and seam
    e = ssim(g[0], g[-1])
    steps = np.abs(np.diff(g, axis=0)).mean(axis=(1, 2))
    close = float(np.abs(g[-1] - g[0]).mean())
    sratio = close / max(float(np.median(steps)), FLOOR)
    dup = e > 0.995 and close < 0.05
    add('endpoints match', e >= T['endpoint_ssim'], f"SSIM(first,last) {e:.3f} (need >= {T['endpoint_ssim']})" + ('; last frame duplicates first: drop it when looping' if dup else ''))
    add('loop seam is invisible', sratio <= T['seam'], f"closing step {close:.2f} vs median step {np.median(steps):.2f} = {sratio:.2f}x (need <= {T['seam']}x)")

    # photosensitivity proxy (frame mean luma). NOT a certified WCAG 2.3.1 test.
    m = g.mean(axis=(1, 2)); dm = np.diff(m) / np.maximum(m[:-1], 1.0)
    big = np.where(np.abs(dm) >= T['flash_step'])[0]
    rev = sum(1 for a, b in zip(big, big[1:]) if np.sign(dm[a]) != np.sign(dm[b]) and (b - a) < info['fps'])
    per_s = rev / info['dur']
    add('flash proxy (approximate)', per_s <= T['flash_per_s'], f"{rev} large opposite luma steps ({per_s:.1f}/s, need <= {T['flash_per_s']}/s)")

    if poster:
        p = Image.open(poster).convert('RGB').resize((info['w'], info['h']), Image.LANCZOS)
        c0 = first_rgb(path)
        pg = np.asarray(p.convert('L'), np.float32); cg = np.asarray(c0.convert('L'), np.float32)
        ps = ssim(pg, cg)
        dm_ = np.abs(np.asarray(p, np.float32).mean(axis=(0, 1)) - np.asarray(c0, np.float32).mean(axis=(0, 1))).max()
        add('frame 0 matches the poster', ps >= T['poster_ssim'] and dm_ <= T['poster_rgb'], f"SSIM {ps:.3f} (need >= {T['poster_ssim']}), worst channel-mean difference {dm_:.1f} levels (need <= {T['poster_rgb']})")
    return info, rows

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('clip'); ap.add_argument('--poster'); ap.add_argument('--json')
    a = ap.parse_args()
    info, rows = check(a.clip, a.poster)
    for name, ok, detail in rows:
        print(f"{'PASS' if ok else 'FAIL'}  {name:36} {detail}")
    fails = [r[0] for r in rows if not r[1]]
    print('\nNumeric checks: ' + ('all pass. Still needs the visual review (section 8).' if not fails else f'{len(fails)} failed: ' + '; '.join(fails)))
    if a.json: json.dump([dict(check=n, ok=o, detail=d) for n, o, d in rows], open(a.json, 'w'), indent=2)
    sys.exit(1 if fails else 0)

if __name__ == '__main__':
    main()
