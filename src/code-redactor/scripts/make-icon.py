#!/usr/bin/env python3
"""Derive desktop and website icons from the user-supplied logoP.png."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT.parents[1] / 'website'
SOURCE = ROOT / 'assets' / 'logoP.png'

if not SOURCE.is_file():
    raise SystemExit(f'Missing source logo: {SOURCE}')

source = Image.open(SOURCE).convert('RGBA')
bounds = source.getchannel('A').getbbox()
if bounds is None:
    raise SystemExit('The source logo is fully transparent')
source = source.crop(bounds)


def icon(size):
    # Preserve the supplied artwork's proportions and transparent corners.
    inset = max(1, round(size * 0.018))
    factor = min((size - 2 * inset) / source.width, (size - 2 * inset) / source.height)
    width, height = round(source.width * factor), round(source.height * factor)
    resized = source.resize((width, height), Image.Resampling.LANCZOS)
    image = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    image.alpha_composite(resized, ((size - width) // 2, (size - height) // 2))
    return image


for folder in (ROOT / 'images', ROOT / 'build', ROOT / 'build' / 'icons', SITE / 'img'):
    folder.mkdir(parents=True, exist_ok=True)

master = icon(1024)
master.resize((512, 512), Image.Resampling.LANCZOS).save(ROOT / 'images' / 'icon.png')
master.resize((512, 512), Image.Resampling.LANCZOS).save(ROOT / 'build' / 'icon.png')
master.resize((256, 256), Image.Resampling.LANCZOS).save(SITE / 'img' / 'icon.png')
for size in (16, 32, 48, 64, 128, 256, 512):
    master.resize((size, size), Image.Resampling.LANCZOS).save(ROOT / 'build' / 'icons' / f'{size}x{size}.png')
master.save(ROOT / 'build' / 'icon.ico', format='ICO', sizes=[(s, s) for s in (16, 24, 32, 48, 64, 128, 256)])
master.save(SITE / 'favicon.ico', format='ICO', sizes=[(s, s) for s in (16, 32, 48)])

master.save(ROOT / 'build' / 'icon.icns', format='ICNS')
print('Updated app, installer and website icons from assets/logoP.png')
