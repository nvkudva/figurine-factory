"""Photos -> one stylized reference image, in a named, versioned style.

Blocked on decision D2 (single stylized reference vs multi-view). The preset loading
and hashing below is real: it is what makes every figurine in a set match.
"""
from __future__ import annotations

import hashlib
from pathlib import Path

import yaml


def load_preset(name: str, root: Path) -> tuple[dict, str]:
    """Return (preset, content_hash). The hash goes in the manifest, so style drift
    between runs shows up as a diff instead of a mystery."""
    path = root / "configs" / "presets" / "styles" / f"{name}.yaml"
    if not path.exists():
        available = sorted(p.stem for p in path.parent.glob("*.yaml"))
        raise FileNotFoundError(f"style preset '{name}' not found. Available: {available}")
    raw = path.read_bytes()
    return yaml.safe_load(raw), hashlib.sha256(raw).hexdigest()[:16]


def stylize(photos: list[Path], preset: dict, seed: int, out: Path) -> Path:
    raise NotImplementedError(
        "stylize is blocked on decision D2 (single stylized reference vs multi-view input). "
        "See docs/decisions.md."
    )
