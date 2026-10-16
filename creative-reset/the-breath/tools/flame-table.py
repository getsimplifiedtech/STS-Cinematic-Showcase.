#!/usr/bin/env python3
"""Regenerate the FLAME brightness table in src/breath.js after the flame clip changes. Needs ffmpeg and numpy (both already on the machine; nothing is installed).
Prints a JSON array: mean brightness of each frame (scaled to 24x14, weighted like the old runtime probe), 5th to 95th percentile mapped to 0..99.
Usage: python3 tools/flame-table.py media/hero-wok-v2.mp4"""
import subprocess, sys, json
import numpy as np
src = sys.argv[1]
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', src, '-vf', 'scale=24:14:flags=area,format=rgb24', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True, check=True).stdout
d = np.frombuffer(raw, dtype=np.uint8); n = d.size // (24 * 14 * 3)
f = d[:n * 24 * 14 * 3].reshape(n, 24 * 14, 3).astype(float)
lum = (f[..., 0] * .5 + f[..., 1] * .35 + f[..., 2] * .15).mean(axis=1) / 255
lo, hi = np.percentile(lum, 5), np.percentile(lum, 95)
print(json.dumps([int(round(x * 99)) for x in np.clip((lum - lo) / (hi - lo), 0, 1)]))
