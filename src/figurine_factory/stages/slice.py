"""Bambu Studio headless slicing."""
from __future__ import annotations

import shutil
import subprocess
import zipfile
from pathlib import Path

from ..errors import SliceError


def find_bambu_studio() -> str:
    for candidate in (
        "bambu-studio",
        "/Applications/BambuStudio.app/Contents/MacOS/BambuStudio",
        "/usr/bin/bambu-studio",
    ):
        found = shutil.which(candidate) or (candidate if Path(candidate).exists() else None)
        if found:
            return found
    raise SliceError(
        "Bambu Studio CLI not found. Install it, or point at it with FIGURINE_BAMBU_CLI."
    )


def slice_3mf(mesh_3mf: Path, out_3mf: Path, printer: dict, plate: int = 0) -> Path:
    """Slice and verify. CLI-produced 3MFs are known to reimport badly (BambuStudio
    issue #2930), so the output is checked for G-code rather than trusted."""
    profiles = Path(printer["_profile_dir"])
    settings = f"{profiles / printer['machine_settings'].split('/')[-1]};{profiles / printer['process_settings'].split('/')[-1]}"
    cmd = [
        find_bambu_studio(),
        "--slice", str(plate),
        "--load-settings", settings,
        "--load-filaments", str(profiles / printer["filament_settings"].split("/")[-1]),
        "--curr-bed-type", printer.get("bed_type", "Textured PEI Plate"),
        "--export-3mf", str(out_3mf),
        str(mesh_3mf),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise SliceError(f"Bambu Studio exited {proc.returncode}:\n{proc.stderr[-2000:]}")
    verify_gcode(out_3mf)
    return out_3mf


def verify_gcode(path: Path) -> None:
    """A sliced 3MF must contain G-code. Exit code 0 alone is not proof."""
    if not path.exists():
        raise SliceError(f"slicer reported success but {path} does not exist")
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
    if not any(n.lower().endswith(".gcode") for n in names):
        raise SliceError(
            f"{path} has no G-code inside — it sliced to an empty plate.\n"
            f"Archive contains: {names[:10]}"
        )
