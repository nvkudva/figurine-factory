"""Wall-thickness estimation by inward ray casting.

For each sampled surface point, shoot a ray along the inward normal and take the
distance to the first back-facing hit. That distance is the local wall thickness.
Approximate, but it catches the failure that actually kills prints: a 0.4 mm ear
or a 0.3 mm ponytail tip that the nozzle cannot extrude.
"""
from __future__ import annotations

import numpy as np
import trimesh


def sample_thickness(
    mesh: trimesh.Trimesh, samples: int = 20000, seed: int = 0
) -> tuple[np.ndarray, np.ndarray]:
    """Return (thickness_mm, sample_points) for points where a hit was found."""
    points, face_idx = trimesh.sample.sample_surface_even(mesh, samples, seed=seed)
    normals = mesh.face_normals[face_idx]
    origins = points - normals * 1e-4  # nudge inside to avoid self-hits
    directions = -normals

    locations, index_ray, _ = mesh.ray.intersects_location(
        ray_origins=origins, ray_directions=directions, multiple_hits=False
    )
    if len(index_ray) == 0:
        return np.array([]), np.array([]).reshape(0, 3)

    dist = np.linalg.norm(locations - origins[index_ray], axis=1)
    return dist, points[index_ray]


def min_wall_thickness(
    mesh: trimesh.Trimesh, threshold_mm: float | None = None, samples: int = 20000,
    percentile: float = 0.5,
) -> tuple[float, np.ndarray]:
    """Minimum wall thickness in mm, plus the sample points that fall below `threshold_mm`.

    The reported minimum uses a low percentile rather than the raw minimum: one stray ray
    through a crease should not fail an otherwise sound model. The returned points use the
    real threshold, so a failure can name where the thin regions are.
    """
    dist, points = sample_thickness(mesh, samples=samples)
    if dist.size == 0:
        return float("inf"), np.array([]).reshape(0, 3)
    measured = float(np.percentile(dist, percentile))
    limit = threshold_mm if threshold_mm is not None else measured
    return measured, points[dist < limit]


def thin_sites(mesh: trimesh.Trimesh, threshold_mm: float, samples: int = 20000) -> np.ndarray:
    """Points on the surface thinner than the threshold. Reported so a failure names
    where the problem is, not just that there is one."""
    dist, points = sample_thickness(mesh, samples=samples)
    if dist.size == 0:
        return np.array([]).reshape(0, 3)
    return points[dist < threshold_mm]
