#!/usr/bin/env python3
"""Prépare icon/splash Alerte : logo sans fond noir, splash sur vert #114b26."""
from __future__ import annotations

import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC_CANDIDATES = [
    ROOT / "client" / "dist" / "Eaux et Forets logo" / "android-chrome-512x512.png",
    ROOT / "client" / "public" / "Eaux et Forets logo" / "android-chrome-512x512.png",
]
OUT_ICON = ROOT / "assets" / "icon.png"
OUT_SPLASH = ROOT / "assets" / "splash.png"
OUT_PUBLIC_LOGO = ROOT / "client" / "public" / "logo_forets.png"
OUT_SPLASH_LOGO = ROOT / "android" / "app" / "src" / "main" / "res" / "drawable-nodpi" / "splash_logo.png"
OUT_DIST_LOGO_DIR = ROOT / "client" / "public" / "Eaux et Forets logo"

BRAND_GREEN = (17, 75, 38, 255)  # #114b26


def load_source() -> Image.Image:
    for p in SRC_CANDIDATES:
        if p.is_file():
            return Image.open(p).convert("RGBA")
    raise FileNotFoundError("Aucune source logo trouvée")


def remove_dark_background(img: Image.Image, threshold: int = 40) -> Image.Image:
    data = img.getdata()
    new = []
    for r, g, b, a in data:
        if r <= threshold and g <= threshold and b <= threshold:
            new.append((0, 0, 0, 0))
        else:
            new.append((r, g, b, a))
    out = Image.new("RGBA", img.size)
    out.putdata(new)
    return out


def fit_center(canvas: Image.Image, logo: Image.Image, scale: float) -> Image.Image:
    w, h = logo.size
    max_side = int(min(canvas.size) * scale)
    ratio = max_side / max(w, h)
    nw, nh = max(1, int(w * ratio)), max(1, int(h * ratio))
    resized = logo.resize((nw, nh), Image.Resampling.LANCZOS)
    x = (canvas.size[0] - nw) // 2
    y = (canvas.size[1] - nh) // 2
    canvas.paste(resized, (x, y), resized)
    return canvas


def main() -> None:
    raw = load_source()
    logo = remove_dark_background(raw)

    # Icône adaptive (1024) — fond transparent, Android ajoute #114b26
    icon_canvas = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    fit_center(icon_canvas, logo, 0.72)
    icon_canvas.save(OUT_ICON, "PNG")

    # Splash plein écran
    splash = Image.new("RGBA", (2732, 2732), BRAND_GREEN)
    fit_center(splash, logo, 0.42)
    splash.save(OUT_SPLASH, "PNG")

    # Logo in-app (fond transparent)
    public_logo = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    fit_center(public_logo, logo, 0.88)
    public_logo.save(OUT_PUBLIC_LOGO, "PNG")

    OUT_SPLASH_LOGO.parent.mkdir(parents=True, exist_ok=True)
    splash_logo = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    fit_center(splash_logo, logo, 0.88)
    splash_logo.save(OUT_SPLASH_LOGO, "PNG")

    dist_src = ROOT / "client" / "dist" / "Eaux et Forets logo"
    if dist_src.is_dir():
        OUT_DIST_LOGO_DIR.mkdir(parents=True, exist_ok=True)
        for f in dist_src.iterdir():
            if f.is_file():
                shutil.copy2(f, OUT_DIST_LOGO_DIR / f.name)

    print("OK:", OUT_ICON, OUT_SPLASH, OUT_PUBLIC_LOGO, OUT_SPLASH_LOGO)


if __name__ == "__main__":
    main()
