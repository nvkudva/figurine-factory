"""Preflight checks. Decision D1 makes local generation a hardware prerequisite,
so find out before the bake-off, not during it.
"""
from __future__ import annotations

import platform
import shutil
import subprocess
from dataclasses import dataclass

MIN_VRAM_GB = 24  # TRELLIS.2's documented floor


@dataclass
class Check:
    name: str
    ok: bool
    detail: str
    blocking: str = ""  # what it blocks; empty means advisory only


def _nvidia_vram_gb() -> float | None:
    if not shutil.which("nvidia-smi"):
        return None
    try:
        out = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=memory.total", "--format=csv,noheader,nounits"],
            text=True, stderr=subprocess.DEVNULL, timeout=15,
        )
    except Exception:
        return None
    values = [float(line) for line in out.split() if line.strip().isdigit()]
    return max(values) / 1024 if values else None


def run_checks() -> list[Check]:
    checks: list[Check] = []

    vram = _nvidia_vram_gb()
    if vram is None:
        checks.append(Check(
            "gpu", False, "no NVIDIA GPU visible (nvidia-smi absent or returned nothing)",
            "local TRELLIS.2 generation — rent a GPU and feed it the stylized reference, "
            "never a photograph (docs/decisions.md, D1)",
        ))
    else:
        checks.append(Check(
            "gpu", vram >= MIN_VRAM_GB, f"{vram:.1f} GB VRAM (need >= {MIN_VRAM_GB} GB)",
            "" if vram >= MIN_VRAM_GB else "local TRELLIS.2 — see the D1 fallback",
        ))

    is_linux = platform.system() == "Linux"
    checks.append(Check(
        "os", is_linux, platform.platform(),
        "" if is_linux else "TRELLIS.2 is tested on Linux only; repair and validation run anywhere",
    ))

    for pkg in ("trimesh", "numpy", "manifold3d"):
        try:
            from importlib.metadata import version
            checks.append(Check(f"pkg:{pkg}", True, version(pkg)))
        except Exception:
            checks.append(Check(f"pkg:{pkg}", False, "not installed", "repair stage"))

    bambu = shutil.which("bambu-studio")
    checks.append(Check(
        "bambu-studio", bool(bambu), bambu or "not on PATH",
        "" if bambu else "the slice stage — repair and validate still run",
    ))

    return checks
