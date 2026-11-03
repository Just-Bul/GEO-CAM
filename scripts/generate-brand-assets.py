"""Generates every icon / splash / in-app logo asset from the GEO-CAM logo.

Source: assets/images/geo-cam-logo-source.png (glowing logo on a black background).
Run from the project root:  python scripts/generate-brand-assets.py
Requires Pillow and NumPy.
"""
import os

import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "images", "geo-cam-logo-source.png")
ASSETS = os.path.join(ROOT, "assets")
IMAGES = os.path.join(ASSETS, "images")

# Regions of the 1254 x 1254 source (found by profiling non-black rows/columns).
EMBLEM_BOX = (60, 60, 1194, 918)   # pin + globe + orbit ring
WORDMARK_BOX = (100, 918, 1154, 1175)  # "GEO-CAM" + underline glow


def unscreen(rgb: Image.Image) -> Image.Image:
    """Black background -> transparency, keeping glows correct.

    alpha = brightest channel; colour = colour / alpha. Composited over black this
    reproduces the original exactly; over the camera preview the glow stays soft.
    """
    a = np.asarray(rgb.convert("RGB")).astype(np.float32) / 255.0
    alpha = a.max(axis=2)
    alpha = np.clip((alpha - 0.02) / 0.98, 0, 1)  # drop JPEG-ish near-black noise
    safe = np.maximum(alpha, 1e-4)[..., None]
    colour = np.clip(a / safe, 0, 1)
    out = np.dstack([colour, alpha]) * 255.0
    return Image.fromarray(out.round().astype(np.uint8), "RGBA")


def solid_interior(rgb: Image.Image, keyed: Image.Image) -> Image.Image:
    """Keeps enclosed dark areas (lens, ocean) opaque; only the outside glow fades.

    Everything the outside background cannot reach through dark pixels is treated
    as inside the emblem and gets the original colour at full opacity.
    """
    alpha = np.asarray(keyed.getchannel("A"))
    wall = Image.fromarray(np.where(alpha > 60, 255, 0).astype(np.uint8), "L")
    # Pad so a flood fill from (0, 0) can travel all around the outside.
    padded = Image.new("L", (wall.width + 2, wall.height + 2), 0)
    padded.paste(wall, (1, 1))
    ImageDraw.floodfill(padded, (0, 0), 128)
    outside = np.asarray(padded)[1:-1, 1:-1] == 128
    inside = ~outside
    original = np.asarray(rgb.convert("RGB")).astype(np.uint8)
    keyed_px = np.asarray(keyed).copy()
    keyed_px[inside, :3] = original[inside]
    keyed_px[inside, 3] = 255
    return Image.fromarray(keyed_px, "RGBA")


def trim(img: Image.Image, pad: int) -> Image.Image:
    box = img.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    img = img.crop(box)
    canvas = Image.new("RGBA", (img.width + pad * 2, img.height + pad * 2), (0, 0, 0, 0))
    canvas.paste(img, (pad, pad), img)
    return canvas


def fit(img: Image.Image, size: int, scale: float, background=(0, 0, 0, 0)) -> Image.Image:
    """Centres `img` on a square canvas, scaled so its longest side is `scale` of the canvas."""
    canvas = Image.new("RGBA", (size, size), background)
    target = int(size * scale)
    ratio = target / max(img.width, img.height)
    resized = img.resize((max(1, round(img.width * ratio)), max(1, round(img.height * ratio))), Image.LANCZOS)
    canvas.alpha_composite(resized, ((size - resized.width) // 2, (size - resized.height) // 2))
    return canvas


def main():
    source = Image.open(SRC).convert("RGB")
    full_rgba = unscreen(source)

    # iOS / legacy icon: the logo exactly as supplied (iOS icons must be opaque).
    source.resize((1024, 1024), Image.LANCZOS).save(os.path.join(ASSETS, "icon.png"))

    # Android adaptive icon: black background layer + logo foreground. Launchers
    # mask to the central ~66 %, so the logo is scaled to keep the wordmark visible.
    Image.new("RGB", (1024, 1024), (0, 0, 0)).save(os.path.join(ASSETS, "android-icon-background.png"))
    fit(trim(full_rgba, 0), 1024, 0.56).save(os.path.join(ASSETS, "android-icon-foreground.png"))

    # Themed (monochrome) icon: Android tints this single-colour shape, so a clean
    # drawn silhouette of the logo's pin-with-lens reads better than a traced bitmap.
    scale = 4  # draw large, then downsample for smooth edges
    size = 1024 * scale
    mono = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mono)
    cx, cy, r = size // 2, int(size * 0.42), int(size * 0.17)
    tip = int(size * 0.74)
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=255)
    d.polygon([(cx - int(r * 0.86), cy + int(r * 0.5)), (cx + int(r * 0.86), cy + int(r * 0.5)), (cx, tip)], fill=255)
    lens = int(r * 0.58)
    d.ellipse((cx - lens, cy - lens, cx + lens, cy + lens), fill=0)
    dot = int(r * 0.2)
    d.ellipse((cx - dot, cy - dot, cx + dot, cy + dot), fill=255)
    ring_w, ring_h, ring_t = int(r * 0.95), int(r * 0.3), int(r * 0.1)
    d.ellipse((cx - ring_w, tip - ring_h, cx + ring_w, tip + ring_h), outline=255, width=ring_t)
    mono = mono.resize((1024, 1024), Image.LANCZOS)
    mono_icon = Image.new("RGBA", (1024, 1024), (255, 255, 255, 0))
    mono_icon.putalpha(mono)
    mono_icon.save(os.path.join(ASSETS, "android-icon-monochrome.png"))

    # Splash: transparent logo on the native splash background (#000000). Android 12+
    # masks the splash icon to a circle over the central 2/3, so the logo is scaled
    # to fit inside that circle (same scale as the adaptive icon foreground).
    fit(trim(full_rgba, 0), 1024, 0.56).save(os.path.join(ASSETS, "splash-icon.png"))

    # Web favicon.
    source.resize((48, 48), Image.LANCZOS).save(os.path.join(ASSETS, "favicon.png"))

    # In-app artwork (transparent). The emblem keeps its dark lens/globe opaque.
    emblem_rgb = source.crop(EMBLEM_BOX)
    emblem = trim(solid_interior(emblem_rgb, unscreen(emblem_rgb)), 0)
    os.makedirs(IMAGES, exist_ok=True)
    trim(full_rgba, 8).resize((768, 768), Image.LANCZOS).save(os.path.join(IMAGES, "logo-full.png"))
    em = trim(emblem, 6)
    em.resize((512, round(512 * em.height / em.width)), Image.LANCZOS).save(os.path.join(IMAGES, "logo-emblem.png"))
    wm = trim(unscreen(source.crop(WORDMARK_BOX)), 6)
    wm.resize((640, round(640 * wm.height / wm.width)), Image.LANCZOS).save(os.path.join(IMAGES, "logo-wordmark.png"))
    print("Brand assets written.")


if __name__ == "__main__":
    main()
