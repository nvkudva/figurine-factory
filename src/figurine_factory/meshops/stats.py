"""Mesh statistics, captured before and after repair so the report can diff them."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field

import numpy as np
import trimesh


@dataclass
class MeshStats:
    vertices: int
    faces: int
    shells: int
    watertight: bool
    winding_consistent: bool
    open_boundary_loops: int
    volume_mm3: float
    area_mm2: float
    bbox_mm: list[float]
    euler_number: int
    degenerate_faces: int
    duplicate_faces: int
    min_wall_mm: float | None = None
    self_intersections: int | None = None
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


def _open_boundary_loops(mesh: trimesh.Trimesh) -> int:
    """Count edges used by exactly one face, grouped into loops."""
    edges = mesh.edges_sorted
    _, counts = np.unique(edges, axis=0, return_counts=True)
    boundary_edges = int((counts == 1).sum())
    if boundary_edges == 0:
        return 0
    # Group boundary edges into connected loops.
    import networkx as nx

    uniq, cnt = np.unique(edges, axis=0, return_counts=True)
    g = nx.Graph()
    g.add_edges_from(uniq[cnt == 1])
    return nx.number_connected_components(g)


def collect(mesh: trimesh.Trimesh, *, measure_wall: bool = False) -> MeshStats:
    """Snapshot a mesh. Cheap enough to run at every stage boundary.

    Topology is measured on a vertex-merged copy. STL stores every triangle with its own
    three vertices, so shell and boundary counts on a raw STL would otherwise report one
    shell per face — a artifact of the file format, not a defect in the model.
    """
    topo = mesh.copy()
    topo.merge_vertices()
    bodies = topo.split(only_watertight=False)

    min_wall = None
    if measure_wall:
        from .thickness import min_wall_thickness

        min_wall = round(min_wall_thickness(topo, samples=5000)[0], 3)

    return MeshStats(
        vertices=int(len(mesh.vertices)),
        faces=int(len(mesh.faces)),
        shells=int(len(bodies)) if len(bodies) else 1,
        watertight=bool(topo.is_watertight),
        winding_consistent=bool(topo.is_winding_consistent),
        open_boundary_loops=_open_boundary_loops(topo),
        volume_mm3=float(topo.volume) if topo.is_watertight else float("nan"),
        area_mm2=float(topo.area),
        bbox_mm=[float(x) for x in mesh.extents],
        euler_number=int(topo.euler_number),
        degenerate_faces=int((~mesh.nondegenerate_faces()).sum()),
        duplicate_faces=int(len(mesh.faces) - len(np.unique(np.sort(mesh.faces, axis=1), axis=0))),
        min_wall_mm=min_wall,
    )


def diff_table(before: MeshStats, after: MeshStats) -> str:
    """Markdown before/after table for the run report."""
    rows = [
        ("vertices", before.vertices, after.vertices),
        ("faces", before.faces, after.faces),
        ("shells", before.shells, after.shells),
        ("watertight", before.watertight, after.watertight),
        ("winding consistent", before.winding_consistent, after.winding_consistent),
        ("open boundary loops", before.open_boundary_loops, after.open_boundary_loops),
        ("volume (mm^3)", round(before.volume_mm3, 1), round(after.volume_mm3, 1)),
        ("bbox (mm)", [round(v, 1) for v in before.bbox_mm], [round(v, 1) for v in after.bbox_mm]),
        ("min wall (mm)", before.min_wall_mm, after.min_wall_mm),
    ]
    out = ["| stat | before | after |", "| --- | --- | --- |"]
    out += [f"| {n} | {b} | {a} |" for n, b, a in rows]
    return "\n".join(out)
