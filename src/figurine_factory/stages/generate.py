"""Image-to-3D backends behind one interface, so the bake-off winner is a config change.

Decision D1: generation runs **locally on TRELLIS.2** (MIT). Hosted backends exist only
for the milestone-1 bake-off, on synthetic faces, and refuse to run without an explicit
per-run flag.
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


class Trellis2Backend:
    """Local TRELLIS.2 (microsoft/TRELLIS.2, MIT). Single image in, GLB out.

    Not exercised in CI: it needs a 24 GB NVIDIA GPU on Linux with CUDA 12.4, which no
    test runner here has. Run `figurine doctor` before trusting it.
    """

    name = "trellis2"

    def __init__(self, model_id: str = "microsoft/TRELLIS.2-4B"):
        self.model_id = model_id
        self.version = model_id
        self._pipeline = None

    def _load(self):
        if self._pipeline is not None:
            return self._pipeline
        try:
            from trellis2.pipelines import Trellis2ImageTo3DPipeline
        except ImportError as e:
            raise GenerationError(
                "TRELLIS.2 is not installed. Clone microsoft/TRELLIS.2 with submodules and "
                "run its setup.sh (CUDA 12.4, >= 24 GB VRAM, Linux). "
                "Run `figurine doctor` to check this machine first."
            ) from e
        self._pipeline = Trellis2ImageTo3DPipeline.from_pretrained(self.model_id).cuda()
        return self._pipeline

    def generate(self, reference_image: Path, seed: int, settings: dict) -> Path:
        from PIL import Image

        pipeline = self._load()
        out = Path(settings["out_dir"]) / "raw.glb"
        result = pipeline.run(Image.open(reference_image), seed=seed)
        result["mesh"][0].export(out)
        return out


def get_backend(name: str) -> Backend:
    if name == "trellis2":
        return Trellis2Backend()
    if name in HOSTED:
        raise NotImplementedError(
            f"hosted backend '{name}' is bake-off-only and not wired yet. "
            "Generate through the vendor UI on synthetic faces, drop the mesh in "
            "bakeoff/runs/, and score it with `figurine validate`."
        )
    if name == "hunyuan3d":
        raise NotImplementedError(
            "Hunyuan3D 2.1 is the D1 second fallback and is not wired. "
            "Read its Tencent Community License before enabling it."
        )
    raise GenerationError(f"unknown backend '{name}'. Known: {sorted(LOCAL | HOSTED)}")
