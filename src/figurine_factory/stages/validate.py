"""Validation gates. The point of this project: fail loudly, never emit a bad mesh."""
from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np
import trimesh

from ..errors import ValidationFailure
from ..meshops import thickness


@dataclass
class GateResult:
    gate: str
    passed: bool
    measured: str
    requirement: str
    hint: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


def _gate(name, ok, measured, requirement, hint="") -> GateResult:
    return GateResult(name, bool(ok), str(measured), str(requirement), "" if ok else hint)


def run_gates(mesh: trimesh.Trimesh, cfg: dict, printer: dict) -> list[GateResult]:
    """Evaluate every gate. Always evaluates all of them, so one run reports every
    problem instead of making the user fix them one at a time."""
    nozzle = float(printer["nozzle_diameter_mm"])
    min_wall = cfg.get("min_wall_thickness_mm") or 2 * nozzle
    plate = printer["build_volume_mm"]
    max_overhang_deg = float(printer.get("max_overhang_angle_deg", 45))

    results: list[GateResult] = []
    bodies = mesh.split(only_watertight=False)
    shells = len(bodies) or 1

    results.append(
        _gate("watertight", mesh.is_watertight or not cfg["require_watertight"],
              mesh.is_watertight, "True",
              "raise repair.remesh_fallback to voxel, or the hole is too large to fill honestly")
    )
    results.append(
        _gate("winding_consistent", mesh.is_winding_consistent or not cfg["require_winding_consistent"],
              mesh.is_winding_consistent, "True",
              "normals are flipped somewhere; the generator output is likely double-sided")
    )
    results.append(
        _gate("shell_count", shells <= cfg["max_shells"], shells, f"<= {cfg['max_shells']}",
              "lower repair.min_shell_volume_frac to drop more debris, or the base union failed")
    )

    vol = float(mesh.volume) if mesh.is_watertight else float("nan")
    results.append(
        _gate("positive_volume", np.isfinite(vol) and vol > 0, round(vol, 1), "> 0 and finite",
              "inverted normals or a non-watertight mesh; check the watertight gate first")
    )

    measured_wall, thin = thickness.min_wall_thickness(mesh, threshold_mm=min_wall)
    results.append(
        _gate("min_wall_thickness", measured_wall >= min_wall,
              f"{measured_wall:.2f} mm at {len(thin)} sites", f">= {min_wall:.2f} mm",
              "scale the figurine taller with --height, or use a style preset with "
              "chunkier extremities (thicker limbs, fused hair)")
    )

    extents = mesh.extents
    fits = all(float(e) <= float(p) for e, p in zip(extents, plate))
    results.append(
        _gate("fits_plate", fits, [round(float(e), 1) for e in extents], f"<= {plate}",
              "lower --height, or split the model (out of scope for v1)")
    )

    nz = mesh.face_normals[:, 2]
    areas = mesh.area_faces
    cos_limit = np.cos(np.radians(180.0 - max_overhang_deg))
    overhang_frac = float(areas[nz < cos_limit].sum() / max(areas.sum(), 1e-9))
    results.append(
        _gate("overhang_area", overhang_frac <= cfg["max_overhang_area_frac"],
              f"{overhang_frac:.1%}", f"<= {cfg['max_overhang_area_frac']:.0%}",
              "re-run orientation search with more candidates, or accept supports explicitly")
    )

    floor = mesh.bounds[0][2]
    contact = float(areas[(nz < -0.99) & (mesh.triangles_center[:, 2] < floor + 0.2)].sum())
    footprint = float(np.prod(mesh.extents[:2]))
    base_frac = contact / max(footprint, 1e-9)
    results.append(
        _gate("base_area", base_frac >= cfg["min_base_area_frac"], f"{base_frac:.1%}",
              f">= {cfg['min_base_area_frac']:.0%}",
              "increase repair.base.margin_mm so the plinth is wider than the figure")
    )

    return results


def validate(mesh: trimesh.Trimesh, cfg: dict, printer: dict) -> list[GateResult]:
    """Run gates and raise on any failure. Callers must not write a mesh past this."""
    results = run_gates(mesh, cfg, printer)
    failures = [r for r in results if not r.passed]
    if failures:
        raise ValidationFailure(failures)
    return results
