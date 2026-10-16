#!/usr/bin/env python3
"""Contact sheets and before/after strips from the capture output. Pillow only.
  sheet.py strip  OUT.jpg  scale  label=path [label=path ...]      frames side by side, each captioned
  sheet.py crop   OUT.jpg  x,y,w,h  zoom  label=path ...           the same region cut out of each frame, enlarged (nearest neighbour), side by side
Usage example: python3 tools/sheet.py strip shots/choreography-mobile.jpg .5 p0=shots/mobile-390x844-p000.jpg p20=shots/mobile-390x844-p020.jpg"""
import sys
from PIL import Image, ImageDraw


def caption(im, text):
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 8 + 7 * len(text), 18], fill=(0, 0, 0))
    d.text((4, 3), text, fill=(255, 255, 255))
    return im


def load(spec):
    label, path = spec.split('=', 1)
    return label, Image.open(path).convert('RGB')


def strip(out, scale, specs, gap=6):
    ims = []
    for spec in specs:
        label, im = load(spec)
        im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
        ims.append(caption(im, label))
    sheet = Image.new('RGB', (sum(i.width for i in ims) + gap * (len(ims) - 1), max(i.height for i in ims)), (14, 13, 12))
    x = 0
    for im in ims:
        sheet.paste(im, (x, 0)); x += im.width + gap
    sheet.save(out, quality=86)


def crop(out, box, zoom, specs, gap=6):
    x, y, w, h = [int(v) for v in box.split(',')]
    ims = []
    for spec in specs:
        label, im = load(spec)
        c = im.crop((x, y, x + w, y + h)).resize((round(w * float(zoom)), round(h * float(zoom))), Image.NEAREST)
        ims.append(caption(c, label))
    sheet = Image.new('RGB', (sum(i.width for i in ims) + gap * (len(ims) - 1), max(i.height for i in ims)), (14, 13, 12))
    x = 0
    for im in ims:
        sheet.paste(im, (x, 0)); x += im.width + gap
    sheet.save(out, quality=88)


if __name__ == '__main__':
    mode = sys.argv[1]
    if mode == 'strip':
        strip(sys.argv[2], float(sys.argv[3]), sys.argv[4:])
    elif mode == 'crop':
        crop(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5:])
    else:
        sys.exit(__doc__)
