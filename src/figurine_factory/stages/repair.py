"""Repair stage: raw generator output -> a mesh that should pass validation."""
from __future__ import annotations

from pathlib import Path

import trimesh

from ..meshops import repair_ops, stats


def load_mesh(path: Path) -> trimesh.Trimesh:
    """Load any generator output as a single Trimesh. GLB scenes get concatenated."""
    loaded = trimesh.load(path, force="mesh", process=False)
    if isinstance(loaded, trimesh.Scene):
        loaded = trimesh.util.concatenate(list(loaded.geometry.values()))
    if not isinstance(loaded, trimesh.Trimesh):
        raise TypeError(f"{path} did not load as a mesh (got {type(loaded).__name__})")
    return loaded


def repair(mesh: trimesh.Trimesh, cfg: dict) -> tuple[trimesh.Trimesh, dict]:
    """Run the fixed repair sequence. Returns the mesh and a record of every op."""
    before = stats.collect(mesh, measure_wall=True)
    records = []

    mesh, r = repair_ops.clean(mesh)
    records.append(r)
    mesh, r = repair_ops.keep_main_shell(mesh, cfg["min_shell_volume_frac"])
    records.append(r)
    mesh, r = repair_ops.fill_holes(mesh, cfg["max_hole_perimeter_mm"])
    records.append(r)
    mesh, r = repair_ops.make_manifold(mesh, cfg["remesh_fallback"])
    records.append(r)

    if cfg["orient"]["search"]:
        mesh, r = repair_ops.orient_for_printing(
            mesh,
            candidates=cfg["orient"]["candidates"],
            w_overhang=cfg["orient"]["weight_overhang"],
            w_base=cfg["orient"]["weight_base_area"],
        )
        records.append(r)

    if cfg["base"]["enabled"]:
        mesh, r = repair_ops.add_base(
            mesh,
            shape=cfg["base"]["shape"],
            height_mm=cfg["base"]["height_mm"],
            margin_mm=cfg["base"]["margin_mm"],
        )
        records.append(r)

    mesh, r = repair_ops.scale_to_height(mesh, cfg["scale"]["target_height_mm"])
    records.append(r)

    after = stats.collect(mesh, measure_wall=True)
    return mesh, {
        "before": before.to_dict(),
        "after": after.to_dict(),
        "operations": [rec.__dict__ for rec in records],
    }
