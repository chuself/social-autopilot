"""Paper and watercolour washes for the "ink & wash" reel style.

Bonasera's recipe (bonasera-ad/scripts/textures.py) in Operra's palette: the
washes are the brand gradient's colours (magenta, violet, blue, teal) softened
the way pigment dries, on warm paper. Seeded: a re-run gives identical files.
WebP, because stacked PNGs blew a render's page-load budget before.

    python studio/ink/textures.py
"""
import numpy as np
from PIL import Image, ImageFilter
from pathlib import Path

OUT = Path(__file__).resolve().parent / "tex"
OUT.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(23)


def fbm(h, w, octaves=6, base=4):
    acc = np.zeros((h, w))
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        n = base * 2**o
        small = rng.random((n + 1, int(n * w / h) + 1))
        img = Image.fromarray((small * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
        acc += amp * np.asarray(img, dtype=float) / 255
        tot += amp
        amp *= 0.55
    return acc / tot


# paper: warm cream with a quiet fibre grain
h, w = 1920, 1080
g = fbm(h, w, 7, 6)
fine = rng.normal(0, 1, (h, w))
paper = np.stack([249, 245, 238], -1)[None, None, :] + ((g - 0.5) * 9 + fine * 2.0)[..., None] * np.array([1, 0.98, 0.94])
Image.fromarray(np.clip(paper, 0, 255).astype(np.uint8)).save(OUT / "paper.webp", quality=82)


def wash(name, rgb, w=900, h=1100, seed_shift=0, edge=0.55, spread=0.46):
    """A soft blot with pigment pooled along its drying edge."""
    yy, xx = np.mgrid[0:h, 0:w]
    cx, cy = w / 2, h / 2
    r = np.sqrt(((xx - cx) / (w * spread)) ** 2 + ((yy - cy) / (h * spread)) ** 2)
    n = fbm(h, w, 6, 3 + seed_shift)
    shape = r + (n - 0.5) * 0.55
    alpha = np.clip((1.0 - shape) / 0.18, 0, 1)
    rim = np.exp(-(((shape - 0.9) / 0.07) ** 2)) * edge
    tex = fbm(h, w, 7, 8)
    density = 0.5 + 0.35 * tex + rim
    a = np.clip(alpha * density, 0, 1)
    col = np.array(rgb, dtype=float)[None, None, :] * (1.06 - 0.2 * (tex - 0.5))[..., None]
    rgba = np.dstack([np.clip(col, 0, 255), a * 255]).astype(np.uint8)
    Image.fromarray(rgba, "RGBA").filter(ImageFilter.GaussianBlur(1.2)).save(OUT / f"{name}.webp", quality=88)


# Operra's sweep (#E01FEE -> #B23BFF -> #7B54FF -> #3E86FF -> #1FA8F0) and teal
# #36D2BA, each softened toward how the pigment would sit on cream paper.
wash("wash-violet", (132, 104, 230), seed_shift=0)
wash("wash-violet-b", (150, 118, 236), seed_shift=1)
wash("wash-lilac", (186, 150, 240), seed_shift=2, edge=0.4)
wash("wash-blue", (82, 140, 226), seed_shift=3)
wash("wash-sky", (150, 186, 238), w=1100, h=700, seed_shift=4, edge=0.3, spread=0.48)
wash("wash-teal", (64, 186, 168), seed_shift=5)
wash("wash-magenta", (212, 96, 222), w=700, h=700, seed_shift=6, edge=0.45)
wash("wash-dusk", (176, 110, 214), w=1100, h=800, seed_shift=7, edge=0.35, spread=0.5)
wash("wash-rose", (226, 150, 196), w=800, h=600, seed_shift=8, edge=0.4)
# the cut: one big violet bloom that grows past the frame
wash("veil", (128, 98, 226), w=1400, h=1400, seed_shift=9, edge=0.5, spread=0.47)
wash("veil-teal", (70, 176, 160), w=1400, h=1400, seed_shift=10, edge=0.5, spread=0.47)
wash("veil-blue", (88, 132, 220), w=1400, h=1400, seed_shift=11, edge=0.5, spread=0.47)
print("ok", sorted(p.name for p in OUT.iterdir()))
