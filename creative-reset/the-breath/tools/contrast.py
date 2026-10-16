#!/usr/bin/env python3
"""WCAG contrast of the page text against what is actually behind it in the rendered frames. Pillow and numpy only.
Input: shots/_contrast/{desktop,mobile}.json and the matching PNGs written by `capture.mjs --only=contrast` (frames rendered WITHOUT the text).
For each text box: the background luminance is taken per pixel under the box; the contrast ratio is computed against the 95th-percentile (brightest
reasonable) background pixel, which is the worst case for light text, and against the mean. Large text is >= 24px, or >= 18.66px and bold (WCAG 3:1);
everything else needs 4.5:1. Text shadows are ignored (they only help). Output: shots/contrast-results.json and a summary on stdout.
Headless render, software GL: colours are the page's own, but the cloud differs frame to frame, so this samples the sequence, it does not prove every frame."""
import json, re, sys, os
import numpy as np
from PIL import Image

root = os.path.join(os.path.dirname(__file__), '..', 'shots')
d = os.path.join(root, '_contrast')


def lin(c):
    c = c / 255.0
    return np.where(c <= 0.03928, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def lum(rgb):
    r, g, b = lin(rgb[..., 0]), lin(rgb[..., 1]), lin(rgb[..., 2])
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def parse(c):
    m = re.findall(r'[\d.]+', c)
    return [float(x) for x in m[:3]]


out, worst = {}, []
for tag in ('desktop', 'mobile'):
    meta = json.load(open(os.path.join(d, tag + '.json')))
    rows = []
    for spot in meta['spots']:
        im = np.asarray(Image.open(os.path.join(d, f"{tag}-{spot['name']}.png")).convert('RGB')).astype(float)
        H, W = im.shape[:2]
        for b in spot['boxes']:
            x0, y0, x1, y1 = max(0, int(b['x'])), max(0, int(b['y'])), min(W, int(b['x'] + b['w'])), min(H, int(b['y'] + b['h']))
            if x1 - x0 < 2 or y1 - y0 < 2:
                continue
            bg = lum(im[y0:y1, x0:x1].reshape(-1, 3))
            fg = lum(np.array([parse(b['color'])]))[0]
            fg = fg  # text is opaque rice; opacity ramps are mid-transition and excluded (only boxes with opacity > .5 are listed)
            hi, mean = np.percentile(bg, 95), bg.mean()
            ratio = lambda l: (max(fg, l) + 0.05) / (min(fg, l) + 0.05)
            large = b['size'] >= 24 or (b['size'] >= 18.66 and b['weight'] >= 700)
            need = 3.0 if large else 4.5
            r = dict(spot=spot['name'], p=spot['p'], sel=b['sel'], text=b['text'], sizePx=round(b['size'], 1), large=bool(large), need=need,
                     worstCase=round(ratio(hi), 2), mean=round(ratio(mean), 2), opacity=b['opacity'], pass_worst=bool(ratio(hi) >= need))
            rows.append(r)
            worst.append((r['worstCase'] - need, tag, r))
    out[tag] = rows
json.dump(out, open(os.path.join(root, 'contrast-results.json'), 'w'), indent=1)
fails = [w for w in worst if not w[2]['pass_worst']]
print(f"{len(worst)} text boxes measured, {len(fails)} below their threshold in the worst-case (95th percentile) reading")
for _, tag, r in sorted(worst, key=lambda w: w[0])[:10]:
    print(f"{tag:8} {r['spot']:9} {r['text'][:24]:24} {r['sizePx']:>5}px need {r['need']} worst {r['worstCase']:>5} mean {r['mean']:>5} {'OK' if r['pass_worst'] else 'BELOW'}")
