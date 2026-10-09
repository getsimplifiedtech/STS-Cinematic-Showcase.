#!/usr/bin/env python3
"""Dry run for tools/video-qa.py. Builds synthetic 5 s, 24 fps clips from the real poster (media/hero-wok.webp) with known
faults, runs the checker on each, and confirms every clip passes or fails the checks it should. Costs nothing, uses no
generator. Usage: python3 tools/video-qa-selftest.py [workdir]   (needs ffmpeg, numpy, Pillow)"""
import importlib.util, os, subprocess, sys, tempfile
import numpy as np
from PIL import Image

here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('vqa', os.path.join(here, 'video-qa.py')); vqa = importlib.util.module_from_spec(spec); spec.loader.exec_module(vqa)
POSTER = os.path.join(here, '..', 'media', 'hero-wok.webp')
W, H, N = 1280, 720, 121          # 121 frames: frame 120 equals frame 0 (a closed loop)
base = np.asarray(Image.open(POSTER).convert('RGB').resize((W, H), Image.LANCZOS), np.float32)

def px(name):
    x0, y0, x1, y1 = vqa.REGIONS[name]
    return int(W * x0 / 100), int(H * y0 / 100), int(W * x1 / 100), int(H * y1 / 100)

def fshift(s, d, axis):
    i = int(np.floor(d)); f = d - i          # fractional shift: blend two integer rolls
    return (1 - f) * np.roll(s, i, axis=axis) + f * np.roll(s, i + 1, axis=axis)

def roll(img, name, dx=0.0, dy=0.0):
    x0, y0, x1, y1 = px(name); s = base[y0:y1, x0:x1]
    img[y0:y1, x0:x1] = fshift(fshift(s, dx, 1), dy, 0)

def shear(img, name, amp, phi, speed=3):
    x0, y0, x1, y1 = px(name)
    for y in range(y0, y1):
        img[y, x0:x1] = fshift(base[y, x0:x1], amp * np.sin(speed * phi + y / 22.0), 0)

def good(k, noise=1.0, alive=True):
    phi = 2 * np.pi * k / (N - 1); f = base.copy()
    if alive:
        shear(f, 'flame', 4, phi); x0, y0, x1, y1 = px('flame'); f[y0:y1, x0:x1] *= 1 + 0.06 * np.sin(2 * phi)
        roll(f, 'steam_left', 0, 6 * np.sin(phi)); shear(f, 'burner_flame', 3, phi, 2)
        roll(f, 'food', 1.0 * np.sin(5 * phi), 1.0 * np.sin(4 * phi))
    if noise: f += np.random.default_rng(k).normal(0, noise, f.shape)
    return f

def v_frozen(k): return good(k, alive=False, noise=0)
def v_wobble(k):
    f = good(k); phi = 2 * np.pi * k / (N - 1); return np.roll(f, int(round(5 * np.sin(phi))), axis=1)
def v_morph(k):
    f = good(k)
    if k > 60:
        x0, y0, x1, y1 = px('food'); f[y0:y1, x0:x1] = np.roll(f[y0:y1, x0:x1], 40, axis=1)[..., ::-1]
    return f
def v_endpoint(k):
    f = good(k); t = max(0, k - 80) / (N - 81)
    x0, y0, x1, y1 = px('flame'); f[y0:y1, x0:x1] = np.roll(f[y0:y1, x0:x1], int(60 * t), axis=1)
    return f * (1 + 0.04 * t) if False else f
def v_flash(k): return good(k) * (1.3 if (k // 3) % 2 else 0.75)
def v_drift(k): return good(k) * (1 + 0.15 * k / (N - 1))

def write(fn, path, w=W, h=H, audio=False):
    cmd = ['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', '24', '-i', '-']
    if audio: cmd += ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-shortest']
    cmd += (['-vf', f'scale={w}:{h}'] if (w, h) != (W, H) else []) + ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18'] + (['-c:a', 'aac'] if audio else []) + [path]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for k in range(N): p.stdin.write(np.clip(fn(k), 0, 255).astype(np.uint8).tobytes())
    p.stdin.close(); p.wait()

def crossfade(src, dst, d=1):
    L = vqa.probe(src)['dur']; a, b = L - d, L
    g = (f"[0:v]split=3[a][b][c];[a]trim=start=0:end={d},setpts=PTS-STARTPTS[head];[b]trim=start={d}:end={a},setpts=PTS-STARTPTS[mid];"
         f"[c]trim=start={a}:end={b},setpts=PTS-STARTPTS[tail];[tail][head]xfade=transition=fade:duration={d}:offset=0[blend];[blend][mid]concat=n=2:v=1:a=0[v]")
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-filter_complex', g, '-map', '[v]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', dst], check=True)

# name, generator, kwargs for write, checks that MUST fail ([] = must pass everything)
CASES = [
    ('good (closed loop)',        good,       {}, []),
    ('frozen scene',              v_frozen,   {}, ['flame and steam are alive']),
    ('wobbling frame',            v_wobble,   {}, ['rigid objects stay rigid']),
    ('food morphs mid-clip',      v_morph,    {}, ['food keeps its look']),
    ('flame ends elsewhere',      v_endpoint, {}, ['endpoints match']),
    ('strobing brightness',       v_flash,    {}, ['flash proxy (approximate)']),
    ('luma drifts +15%',          v_drift,    {}, ['no luma drift']),
    ('has an audio track',        good,       dict(audio=True), ['format: silent (no audio stream)']),
    ('too small (960x540)',       good,       dict(w=960, h=540), ['format: resolution']),
]

def main():
    work = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp(prefix='vqa-')
    os.makedirs(work, exist_ok=True); bad = 0
    print(f'working in {work}\n')
    for name, fn, kw, must_fail in CASES:
        path = os.path.join(work, name.split(' ')[0].strip('()') + str(abs(hash(name)) % 1000) + '.mp4'); write(fn, path, **kw)
        info, rows = vqa.check(path, POSTER if name.startswith('good') else None)
        failed = {r[0] for r in rows if not r[1]}
        ok = (failed == set()) if not must_fail else set(must_fail) <= failed
        extra = failed - set(must_fail)
        print(f"{'AS EXPECTED' if ok else 'UNEXPECTED '}  {name:26} fails: {sorted(failed) or 'none'}" + (f"   (also failed: {sorted(extra)})" if extra and ok else ''))
        bad += 0 if ok else 1
        if name.startswith('flame ends'):
            fixed = os.path.join(work, 'flame-ends-crossfaded.mp4'); crossfade(path, fixed)
            _, r2 = vqa.check(fixed)
            f2 = {r[0] for r in r2 if not r[1]}; ok2 = not ({'endpoints match', 'loop seam is invisible'} & f2)
            print(f"{'AS EXPECTED' if ok2 else 'UNEXPECTED '}  {'  -> after crossfade loop':26} fails: {sorted(f2) or 'none'}")
            bad += 0 if ok2 else 1
    print('\nSelf-test ' + ('passed: the checker passes a good clip and catches every seeded fault.' if not bad else f'FAILED in {bad} case(s).'))
    sys.exit(1 if bad else 0)

if __name__ == '__main__':
    main()
