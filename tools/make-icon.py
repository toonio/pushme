"""make-icon — draws the app icon and splash from code.

The mark is two chevrons pointing up: the thing the app asks you to do, and the only
direction the numbers are meant to go. Drawn here rather than stored as a binary so it
can be changed by changing a number, and so the repository holds no asset nobody can
edit.

Everything is drawn at 4x and scaled down, which is the cheapest anti-aliasing there is.

Run: python tools/make-icon.py
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
ASSETS = os.path.join(ROOT, 'assets')
WWW = os.path.join(ROOT, 'www')

BG = (14, 18, 23, 255)        # --bg
GO = (76, 201, 160, 255)      # --go
SS = 4                        # supersampling factor


def chevrons(size, colour, scale=1.0, dy=0.0):
    """Two stacked chevrons pointing up, centred, on a transparent canvas."""
    img = Image.new('RGBA', (size * SS, size * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = size * SS
    cx = s / 2
    cy = s / 2 + dy * s

    width = 0.52 * s * scale        # half-width of a chevron
    rise = 0.24 * s * scale         # how far the point sits above the ends
    thick = 0.13 * s * scale        # stroke thickness
    gap = 0.20 * s * scale          # vertical distance between the two

    for i, offset in enumerate((-gap * 0.55, gap * 0.55)):
        top = cy + offset
        # Outer edge, then the inner edge back, as one polygon: a thick V.
        d.polygon([
            (cx - width / 2, top + rise / 2),
            (cx, top - rise / 2),
            (cx + width / 2, top + rise / 2),
            (cx + width / 2, top + rise / 2 + thick),
            (cx, top - rise / 2 + thick),
            (cx - width / 2, top + rise / 2 + thick),
        ], fill=colour)

    return img.resize((size, size), Image.LANCZOS)


def rounded_bg(size, colour, radius_frac=0.22):
    img = Image.new('RGBA', (size * SS, size * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = size * SS
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * radius_frac), fill=colour)
    return img.resize((size, size), Image.LANCZOS)


def compose(size, rounded=True):
    base = rounded_bg(size, BG) if rounded else Image.new('RGBA', (size, size), BG)
    base.alpha_composite(chevrons(size, GO, scale=0.78))
    return base


def write(img, *parts):
    path = os.path.join(*parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)
    print('wrote', os.path.relpath(path, ROOT), img.size)


os.makedirs(ASSETS, exist_ok=True)

# @capacitor/assets input set.
write(compose(1024), ASSETS, 'icon.png')

# Adaptive icons: Android masks the outer third, so the mark is drawn smaller and the
# background is a plain field.
fg = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
fg.alpha_composite(chevrons(1024, GO, scale=0.50))
write(fg, ASSETS, 'icon-foreground.png')
write(Image.new('RGBA', (1024, 1024), BG), ASSETS, 'icon-background.png')

splash = Image.new('RGBA', (2732, 2732), BG)
splash.alpha_composite(chevrons(2732, GO, scale=0.22))
write(splash, ASSETS, 'splash.png')
write(splash, ASSETS, 'splash-dark.png')

# The web build's tab icon.
write(compose(180), WWW, 'icon-180.png')
write(compose(32), WWW, 'favicon.png')
