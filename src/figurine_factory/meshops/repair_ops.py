"""Repair operations. Each returns (mesh, record) so the manifest can show its work.

Order matters and is fixed by `pipeline()`: clean -> shells -> holes -> manifold
-> thicken -> orient -> base -> scale. Reordering breaks assumptions (basing before
orienting, for instance, glues the plinth to the wrong face).
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import trimesh


@dataclass
class OpRecord:
    op: str
    changed: bool
    detail: dict = field(default_factory=dict)


def clean(mesh: trimesh.Trimesh) -> tuple[trimesh.Trimesh, OpRecord]:
    before = (len(mesh.vertices), len(mesh.faces))
    mesh = mesh.copy()
    mesh.merge_vertices()
    mesh.update_faces(mesh.nondegenerate_faces())
    mesh.update_faces(mesh.unique_faces())
    mesh.remove_unreferenced_vertices()
    after = (len(mesh.vertices), len(mesh.faces))
    return mesh, OpRecord("clean", before != after, {"before": before, "after": after})


def keep_main_shell(
    mesh: trimesh.Trimesh, min_volume_frac: float = 0.005
) -> tuple[trimesh.Trimesh, OpRecord]:
    """Drop floating debris. Keeps the largest body plus anything above the fraction.

    Bodies are ranked by bounding-box volume, not mesh volume, because a non-watertight
    shell has no meaningful volume yet at this point in the pipeline.
    """
    bodies = mesh.split(only_watertight=False)
    if len(bodies) <= 1:
        return mesh, OpRecord("keep_main_shell", False, {"shells": len(bodies) or 1})

    sizes = np.array([float(np.prod(b.extents)) for b in bodies])
    largest = sizes.max()
    keep = sizes >= largest * min_volume_frac
    kept = [b for b, k in zip(bodies, keep) if k]
    merged = trimesh.util.concatenate(kept) if len(kept) > 1 else kept[0]
    return merged, OpRecord(
        "keep_main_shell",
        True,
        {"shells_before": len(bodies), "shells_after": len(kept), "dropped": int((~keep).sum())},
    )


def boundary_loops(mesh: trimesh.Trimesh) -> list[list[int]]:
    """Ordered vertex cycles for every open boundary of the mesh.

    An edge used by exactly one face is a boundary edge. In a well-formed hole each
    boundary vertex has exactly two boundary edges, so the loop can be walked. Loops
    that do not walk cleanly (a pinched vertex shared by two holes) are skipped rather
    than guessed at — validation will report them.
    """
    import networkx as nx

    edges, counts = np.unique(mesh.edges_sorted, axis=0, return_counts=True)
    boundary = edges[counts == 1]
    if len(boundary) == 0:
        return []

    g = nx.Graph()
    g.add_edges_from(boundary)
    loops: list[list[int]] = []
    for component in nx.connected_components(g):
        sub = g.subgraph(component)
        if any(d != 2 for _, d in sub.degree()):
            continue  # pinched or branching boundary: leave it for validation
        try:
            loops.append([int(v) for v in nx.cycle_basis(sub)[0]])
        except IndexError:
            continue
    return loops


def _loop_perimeter(mesh: trimesh.Trimesh, loop: list[int]) -> float:
    pts = mesh.vertices[loop]
    return float(np.linalg.norm(pts - np.roll(pts, -1, axis=0), axis=1).sum())


def fill_holes(
    mesh: trimesh.Trimesh, max_perimeter_mm: float = 25.0
) -> tuple[trimesh.Trimesh, OpRecord]:
    """Fill open boundaries. Small holes get a centroid fan; large ones are left open.

    trimesh's own fill_holes only closes triangle and quad holes, which is almost never
    what a generator leaves behind. Anything it cannot close is fanned from the hole's
    centroid. A hole larger than the cap is left open on purpose, so validation fails on
    it rather than stretching a lie across a missing arm.
    """
    mesh = mesh.copy()
    before_wt = bool(mesh.is_watertight)
    mesh.fill_holes()

    filled, skipped = 0, []
    for loop in boundary_loops(mesh):
        perimeter = _loop_perimeter(mesh, loop)
        if perimeter > max_perimeter_mm:
            skipped.append(round(perimeter, 2))
            continue
        centroid = mesh.vertices[loop].mean(axis=0)
        c_idx = len(mesh.vertices)
        new_faces = [[loop[i], loop[(i + 1) % len(loop)], c_idx] for i in range(len(loop))]
        mesh = trimesh.Trimesh(
            vertices=np.vstack([mesh.vertices, centroid]),
            faces=np.vstack([mesh.faces, np.array(new_faces)]),
            process=False,
        )
        filled += 1

    trimesh.repair.fix_normals(mesh)
    return mesh, OpRecord(
        "fill_holes",
        bool(mesh.is_watertight) != before_wt or filled > 0,
        {
            "watertight_before": before_wt,
            "watertight_after": bool(mesh.is_watertight),
            "holes_filled": filled,
            "holes_too_large_mm": skipped,
            "max_perimeter_mm": max_perimeter_mm,
        },
    )


def make_manifold(
    mesh: trimesh.Trimesh, fallback: str = "voxel", voxel_pitch_frac: float = 0.004
) -> tuple[trimesh.Trimesh, OpRecord]:
    """Local repair first; voxel remesh only if the mesh is still not watertight.

    Remeshing rounds off detail and costs likeness, so it is the fallback, never the
    default path.
    """
    mesh = mesh.copy()
    trimesh.repair.fix_inversion(mesh)
    trimesh.repair.fix_winding(mesh)
    trimesh.repair.fix_normals(mesh)
    if mesh.is_watertight:
        return mesh, OpRecord("make_manifold", True, {"method": "local"})

    if fallback == "none":
        return mesh, OpRecord("make_manifold", False, {"method": "local", "watertight": False})

    pitch = float(max(mesh.extents) * voxel_pitch_frac)
    remeshed = mesh.voxelized(pitch=pitch).fill().marching_cubes
    remeshed.merge_vertices()
    trimesh.repair.fix_normals(remeshed)
    return remeshed, OpRecord(
        "make_manifold",
        True,
        {"method": "voxel_remesh", "pitch_mm": round(pitch, 4), "watertight": bool(remeshed.is_watertight)},
    )


def orient_for_printing(
    mesh: trimesh.Trimesh,
    candidates: int = 64,
    max_overhang_deg: float = 45.0,
    w_overhang: float = 0.7,
    w_base: float = 0.3,
) -> tuple[trimesh.Trimesh, OpRecord]:
    """Search rotations; pick the one that minimises support area and maximises footprint.

    Score is lower-is-better: overhang fraction weighted against the inverse of the
    projected base-contact area.
    """
    mesh = mesh.copy()
    rng = np.random.default_rng(0)  # deterministic: orientation must be reproducible
    cos_limit = np.cos(np.radians(180.0 - max_overhang_deg))

    best = (float("inf"), np.eye(4))
    for i in range(candidates):
        rot = np.eye(4) if i == 0 else trimesh.transformations.random_rotation_matrix(rng.random(3))
        cand = mesh.copy()
        cand.apply_transform(rot)
        nz = cand.face_normals[:, 2]
        areas = cand.area_faces
        overhang = float(areas[nz < cos_limit].sum() / max(areas.sum(), 1e-9))
        floor = cand.bounds[0][2]
        contact = float(areas[(nz < -0.99) & (cand.triangles_center[:, 2] < floor + 0.5)].sum())
        base_frac = contact / max(float(np.prod(cand.extents[:2])), 1e-9)
        score = w_overhang * overhang - w_base * min(base_frac, 1.0)
        if score < best[0]:
            best = (score, rot)

    mesh.apply_transform(best[1])
    return mesh, OpRecord("orient", True, {"score": round(best[0], 4), "candidates": candidates})


def add_base(
    mesh: trimesh.Trimesh,
    shape: str = "rounded_square",
    height_mm: float = 3.0,
    margin_mm: float = 2.0,
) -> tuple[trimesh.Trimesh, OpRecord]:
    """Flatten the underside and union a plinth, so the model has real bed contact.

    Slices off everything below the lowest 0.2 mm of the model, then unions a plinth
    sized to the XY footprint plus a margin.
    """
    mesh = mesh.copy()
    lo = mesh.bounds[0]
    hi = mesh.bounds[1]
    footprint = hi[:2] - lo[:2]

    # Flatten: cut just above the lowest point so the contact face is a real plane.
    cut_z = float(lo[2] + 0.2)
    mesh = mesh.slice_plane(plane_origin=[0, 0, cut_z], plane_normal=[0, 0, 1], cap=True)

    radius = float(max(footprint) / 2 + margin_mm)
    if shape == "cylinder":
        plinth = trimesh.creation.cylinder(radius=radius, height=height_mm, sections=96)
    else:
        plinth = trimesh.creation.box(extents=[radius * 2, radius * 2, height_mm])

    center_xy = (hi[:2] + lo[:2]) / 2
    plinth.apply_translation([center_xy[0], center_xy[1], cut_z - height_mm / 2])

    combined = trimesh.boolean.union([mesh, plinth])
    if combined is None or combined.is_empty:
        combined = trimesh.util.concatenate([mesh, plinth])
        note = "boolean union failed; concatenated (validation will catch a bad join)"
    else:
        note = "boolean union"

    combined.apply_translation([0, 0, -combined.bounds[0][2]])  # sit on z=0
    return combined, OpRecord(
        "add_base", True, {"shape": shape, "height_mm": height_mm, "method": note}
    )


def scale_to_height(
    mesh: trimesh.Trimesh, target_height_mm: float = 100.0
) -> tuple[trimesh.Trimesh, OpRecord]:
    mesh = mesh.copy()
    current = float(mesh.extents[2])
    if current <= 0:
        raise ValueError("mesh has zero height; cannot scale")
    factor = target_height_mm / current
    mesh.apply_scale(factor)
    mesh.apply_translation([0, 0, -mesh.bounds[0][2]])
    return mesh, OpRecord(
        "scale", True, {"from_mm": round(current, 3), "to_mm": target_height_mm, "factor": round(factor, 5)}
    )
