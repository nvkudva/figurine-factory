"""Generate synthetic broken meshes. No photographs, no scans, no human likeness —
every fixture is procedural, which is why this project can have tests at all.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import trimesh

OUT = Path(__file__).parent


def good_figure() -> trimesh.Trimesh:
    """A crude but sound figure: sphere head on a capsule body, watertight."""
    body = trimesh.creation.capsule(height=40, radius=12, count=[32, 32])
    head = trimesh.creation.icosphere(subdivisions=3, radius=16)
    head.apply_translation([0, 0, 38])
    return trimesh.boolean.union([body, head])


def with_floating_shells(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    """Debris the generator hallucinated near the model."""
    debris = [trimesh.creation.icosphere(subdivisions=1, radius=1.2) for _ in range(4)]
    for i, d in enumerate(debris):
        d.apply_translation([25 + i * 3, 10, 20 + i * 8])
    return trimesh.util.concatenate([mesh] + debris)


def with_hole(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    """Non-watertight: punch out a contiguous patch of faces on the back of the head.

    A contiguous patch is what a generator actually leaves — a single ragged boundary,
    not scattered missing triangles.
    """
    m = mesh.copy()
    target = np.array([0.0, -14.0, 40.0])
    dist = np.linalg.norm(m.triangles_center - target, axis=1)
    m.update_faces(dist > 3.2)
    m.remove_unreferenced_vertices()
    return m


def with_thin_wall() -> trimesh.Trimesh:
    """A 0.35 mm fin — well under a 0.4 mm nozzle's 0.8 mm minimum."""
    body = trimesh.creation.box(extents=[20, 20, 40])
    fin = trimesh.creation.box(extents=[0.35, 12, 20])
    fin.apply_translation([10, 0, 25])
    return trimesh.util.concatenate([body, fin])


def main() -> None:
    good = good_figure()
    for name, mesh in {
        "good_figure": good,
        "floating_shells": with_floating_shells(good),
        "holey": with_hole(good),
        "thin_wall": with_thin_wall(),
    }.items():
        path = OUT / f"{name}.stl"
        mesh.export(path)
        print(f"wrote {path} — {len(mesh.faces)} faces, watertight={mesh.is_watertight}")


if __name__ == "__main__":
    main()
