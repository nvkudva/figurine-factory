"""Image-to-3D backends behind one interface, so the bake-off winner is a config change.

Backends are stubs until decision D1 (local vs hosted) is settled — see docs/decisions.md.
The privacy guard below is not a stub and is enforced now.
"""
from __future__ import annotations

from pathlib import Path
from typing import Protocol

from ..errors import GenerationError

HOSTED = {"meshy", "tripo"}
LOCAL = {"trellis2", "hunyuan3d"}


class Backend(Protocol):
    name: str
    version: str

    def generate(self, reference_image: Path, seed: int, settings: dict) -> Path: ...


def guard_upload(backend: str, allow_upload: bool) -> None:
    """Hosted backends may not run unless the operator opted in for this run.

    This exists so a config edit, a merged branch, or a default change can never send a
    child's face to a vendor by accident. The flag is per-run and never persisted.
    """
    if backend in HOSTED and not allow_upload:
        raise GenerationError(
            f"backend '{backend}' uploads the reference image to a third party.\n"
            "Refusing. Pass --allow-upload only for synthetic or public-domain bake-off "
            "images, never for family photos. See prd.md section 3."
        )


def get_backend(name: str) -> Backend:
    raise NotImplementedError(
        f"backend '{name}' is not implemented yet — blocked on decision D1 "
        "(local GPU vs hosted). See docs/decisions.md."
    )
