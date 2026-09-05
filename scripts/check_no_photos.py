"""Pre-commit guard: no photos or subject media may enter git history.

Blocks image/mesh binaries anywhere except an explicit allowlist, and blocks any
path under work/ or out/. Exit 1 stops the commit.
"""
from __future__ import annotations

import sys
from pathlib import Path

BLOCKED_SUFFIXES = {
    ".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp", ".tiff", ".bmp",
    ".mov", ".mp4", ".glb", ".gltf", ".obj", ".ply", ".3mf",
}
BLOCKED_DIRS = ("work/", "out/")
ALLOWED_PREFIXES = ("docs/img/", "bakeoff/reference/", "tests/fixtures/")


def is_blocked(path: str) -> str | None:
    p = Path(path)
    if any(path.startswith(d) for d in BLOCKED_DIRS):
        return "lives under an untracked subject directory"
    if p.suffix.lower() in BLOCKED_SUFFIXES:
        if any(path.startswith(a) for a in ALLOWED_PREFIXES):
            return None
        return f"{p.suffix} media outside the allowlist {ALLOWED_PREFIXES}"
    return None


def main(argv: list[str]) -> int:
    offenders = [(f, r) for f in argv if (r := is_blocked(f))]
    if not offenders:
        return 0
    print("BLOCKED: privacy guard refused these files.\n")
    for f, reason in offenders:
        print(f"  {f}\n      {reason}")
    print(
        "\nNo photo of a person belongs in this repo or its history.\n"
        "Keep subject media in work/ (untracked). If this is a synthetic fixture,\n"
        "put it under tests/fixtures/ or bakeoff/reference/."
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
