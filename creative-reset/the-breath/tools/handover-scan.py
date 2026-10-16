#!/usr/bin/env python3
"""Is any frame of the handover empty? Reads frames written by frames.mjs (HIDE=1, text hidden) and reports, per frame, the mean luminance and the
95th-percentile luminance (0..255, Rec.709 on the sRGB values) plus the share of pixels brighter than 40. A frame counts as 'near-black' when its 95th
percentile is under 38 (about 15% grey): nothing in it but soot. Usage: handover-scan.py OUT.json label=prefix [label=prefix ...] -- p p p ..."""
import sys, json
import numpy as np
from PIL import Image
out = sys.argv[1]; i = sys.argv.index('--'); specs = sys.argv[2:i]; ps = [float(x) for x in sys.argv[i + 1:]]
res = {}
for spec in specs:
    label, prefix = spec.split('=', 1); rows = []
    for p in ps:
        f = f"{prefix}-p{int(round(p * 100)):03d}.jpg"
        a = np.asarray(Image.open(f).convert('RGB')).astype(float)
        y = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
        rows.append(dict(p=p, mean=round(float(y.mean()), 1), p95=round(float(np.percentile(y, 95)), 1), lit=round(float((y > 40).mean()), 3), nearBlack=bool(np.percentile(y, 95) < 38)))
    res[label] = rows
    print(label, ' '.join(f"{r['p']:.2f}:{r['p95']:.0f}{'!' if r['nearBlack'] else ''}" for r in rows))
json.dump(res, open(out, 'w'), indent=1)
