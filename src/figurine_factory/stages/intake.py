"""Photo intake. Validates and copies into the run directory with EXIF stripped."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

from ..errors import IntakeError

EXTS = {".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp"}


def collect_photos(folder: Path, cfg: dict) -> list[Path]:
    photos = sorted(p for p in folder.iterdir() if p.suffix.lower() in EXTS)
    if len(photos) < cfg["min_images"]:
        raise IntakeError(
            f"{folder} has {len(photos)} usable photos; need at least {cfg['min_images']}. "
            "Shoot front, both three-quarters, and a profile."
        )
    if len(photos) > cfg["max_images"]:
        raise IntakeError(f"{folder} has {len(photos)} photos; cap is {cfg['max_images']}.")
    return photos


def stage_photos(photos: list[Path], dest: Path, cfg: dict) -> list[Path]:
    """Copy into the run dir, re-encoding to drop EXIF (GPS above all)."""
    dest.mkdir(parents=True, exist_ok=True)
    staged = []
    for i, src in enumerate(photos):
        with Image.open(src) as im:
            if min(im.size) < cfg["min_short_edge_px"]:
                raise IntakeError(
                    f"{src.name} is {im.size[0]}x{im.size[1]}; need "
                    f"{cfg['min_short_edge_px']} px on the short edge."
                )
            clean = Image.new(im.mode, im.size)
            clean.putdata(list(im.getdata()))  # no EXIF carried over
            out = dest / f"{i:02d}.png"
            clean.save(out)
            staged.append(out)
    return staged
