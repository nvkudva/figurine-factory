# PRD — Figurine Factory

**One line:** turn 3–5 photos of a family member into a print-ready, stylized 3D figurine on a Bambu printer, with one command.

**Status:** draft, pre-milestone-1. Owner: Vijay. Last updated: 2026-09-05.

---

## 1. Problem

AI image-to-3D tools produce meshes that look fine on screen and fail in the slicer:
non-manifold edges, floating shells, sub-0.8 mm walls, no flat base, self-intersections.
Fixing each model by hand in Blender costs 45–90 minutes and does not get faster with
practice, because every model breaks differently.

**The product is the repair and validation stage.** Generation is a swappable backend.

## 2. Goal and success metric

| Metric | Target |
| --- | --- |
| Human time, figurine #1 | any (learning run) |
| Human time, figurine #2 and #3 | **< 30 minutes each**, of which < 5 min is mesh work |
| Manual mesh editing after milestone 6 | **zero** |
| Slicer acceptance of emitted 3MF | 100% — a bad mesh must hard-fail, never ship |
| Reproducibility | rerunning a manifest yields a mesh within tolerance of the original |

Human time = photo selection + prompt tweak + supervising the run + loading the plate.
Excludes GPU and print wall-clock.

## 3. Non-negotiable: privacy

These are photos of a child.

1. **Local-first generation.** Prefer a locally run open model (TRELLIS.2, MIT; Hunyuan3D 2.1,
   Tencent Community License) over any hosted service.
2. **No child photos in the repo, in git history, or in any test fixture.** Enforced by
   `.gitignore`, a pre-commit hook (`scripts/check_no_photos.py`), and synthetic-only fixtures.
   Photos live in an untracked `work/` directory outside version control.
3. **Hosted tools, bake-off only.** If a hosted generator is used for the milestone-1 bake-off,
   assets are deleted from the vendor afterwards and the deletion is recorded in the README
   with date and method. No hosted generator is used in the steady-state pipeline unless
   decision D1 says otherwise, explicitly.
4. **Faces never leave the machine in the default config.** The default profile is
   `generator: local`. Choosing a hosted generator requires an explicit `--allow-upload` flag
   so it can never happen by accident or by config drift.
5. Scope of subjects: my family only. No third parties, ever.

## 4. Pipeline

```
work/<subject>/photos/       3–5 angles, JPEG/PNG, untracked
        │
        ▼ intake       validate count/resolution/EXIF-strip, background segment
        ▼ stylize      → single stylized reference image, named style preset
        ▼ generate     → raw mesh (GLB/OBJ), via pluggable backend
        ▼ repair       → manifold, single shell, holes filled, based, oriented, scaled
        ▼ validate     → gates; hard-fail with a readable reason
        ▼ slice        → sliced .gcode.3mf for Bambu Studio
        │
        ▼ out/<subject>/<run_id>/  mesh + 3MF + manifest.json + report.md
```

Each stage is a pure function `(inputs, config) -> outputs + stage record`. Stages are
individually runnable, so a failed run resumes from the last good artifact rather than
regenerating.

## 5. Stage requirements

### 5.1 Intake
- Accept 3–5 images. Fail if fewer than 3 or more than 8.
- Minimum 1024 px on the short edge; face must occupy ≥ 15% of frame height.
- Strip EXIF (GPS especially) on copy into the run directory.
- Never copy source photos into the repo tree.

### 5.2 Stylize
- Produces **one** stylized reference image (see decision D2).
- Style is a **named preset** in `configs/presets/styles/*.yaml`: prompt, negative prompt,
  model, sampler, steps, seed policy, camera framing.
- The preset name and its content hash go in the manifest. Same preset + same seed = same
  look, so every figurine in a set matches.
- Default preset: `chibi_vinyl` — 1:2.2 head-to-body, matte vinyl toy, neutral A-pose,
  three-quarter front view, flat neutral background, no props.

### 5.3 Generate
- Backend interface: `generate(reference_image, seed, settings) -> mesh_path`.
- Backends: `trellis2`, `hunyuan3d`, `meshy`, `tripo`. Selected by config, not by code edit.
- Hosted backends refuse to run without `--allow-upload`.
- Records model version, seed, and every setting in the manifest.

### 5.4 Repair — the core of the project
Python, `trimesh` + `pymeshlab`, with Blender headless as an escape hatch for operations the
two cannot do cleanly.

Ordered operations:
1. Merge duplicate vertices, drop degenerate and duplicate faces, drop unreferenced vertices.
2. **Remove floating shells** — keep the largest connected component by volume; delete any
   component under `min_shell_volume_frac` (default 0.5% of the largest).
3. **Fill holes** up to `max_hole_perimeter`; larger holes are a validation failure, not a
   silent patch.
4. Fix winding, resolve self-intersections, make **manifold** (screened Poisson or voxel
   remesh as fallback when local repair fails).
5. **Thicken** regions below minimum wall thickness where thickening is geometrically safe;
   report where it is not.
6. **Orient for minimum supports** — search candidate rotations, score on overhang area above
   `max_overhang_angle` and on projected base area; pick the best.
7. **Add and flatten a base** — boolean-cut below the lowest stable plane, then union a
   cylindrical or rounded-square plinth of `base_height` (default 3 mm) with a chamfer.
8. **Scale to target height**, default **100 mm**, measured on the bounding box Z after basing.

Every operation records before/after stats.

### 5.5 Validate — gates that fail loudly
Hard-fail the run with a specific, human-readable reason. Never emit an STL/3MF that fails.

| Gate | Default | Rationale |
| --- | --- | --- |
| `is_watertight` | true | slicer will not fill it otherwise |
| `is_winding_consistent` | true | flipped normals become voids |
| `shell_count` | 1 | floating shells print as debris |
| `open_boundary_loops` | 0 | after fill, none should remain |
| `min_wall_thickness` | ≥ 2 × nozzle (0.8 mm at 0.4 mm) | thinner walls are not extruded |
| `min_feature_size` | ≥ 1.2 mm | fingers and hair spikes snap off |
| `base_flatness` | ≥ 90% of base ring in contact plane | warping and bed adhesion |
| `base_area_frac` | ≥ 8% of the model's XY footprint | tip-over on the plate |
| `overhang_area_frac` | ≤ 25% above 45° | support-heavy models look bad |
| `bbox` | fits plate, 256 × 256 × 256 mm | trivially fatal otherwise |
| `volume` | > 0 and finite | catches inverted normals |
| `self_intersections` | 0 | slicer artifacts |

Failure output names the gate, the measured value, the threshold, and the most likely fix.
Example: `FAIL min_wall_thickness: 0.41 mm at 3 sites (needs ≥ 0.80 mm for a 0.4 mm nozzle). Sites: left hand, right ear, ponytail tip. Try --scale-height 130 or a style preset with chunkier extremities.`

### 5.6 Slice
- Bambu Studio CLI, headless:
  `bambu-studio --slice 0 --load-settings "machine.json;process.json" --load-filaments "filament.json" --export-3mf out.gcode.3mf model.3mf`
- Verify the CLI exit code **and** that the output 3MF contains G-code — CLI slicing is known
  to produce 3MFs that reimport badly, so this is checked, not assumed.
- Machine/process/filament profiles are checked into `configs/printers/`.

## 6. Cross-cutting requirements

- **One command:** `figurine run work/kai/photos --style chibi_vinyl --height 100`.
- **Manifest:** every run writes `manifest.json` — run id, timestamp, git SHA, subject alias
  (never a real name in an artifact that could be shared), style preset + hash, generator
  backend + model version, every seed, every setting, per-stage timing, all mesh stats
  before and after, all gate results, tool versions. A good result is reproducible from it.
  `figurine replay manifest.json` re-executes it.
- **Report:** `report.md` per run — before/after table (vertices, faces, shells, boundary
  loops, holes filled, min wall, volume, bbox, watertight y/n) plus turntable renders.
- **Style presets** are versioned files, so a set of figurines matches.
- **Exit codes:** 0 pass, 2 validation failure, 3 generation failure, 4 slicer failure.

## 7. Milestones

| # | Milestone | Done when |
| --- | --- | --- |
| 1 | Generator bake-off | 3+ generators × 3 reference images, scored table in README, winner chosen on numbers |
| 2 | Manual end-to-end | one figurine printed, every step by hand, timed and written down |
| 3 | Repair automated | repair stage reproduces the manual fixes on the milestone-2 mesh |
| 4 | Validation gates | gates fail loudly on 3 known-bad meshes and pass the known-good one |
| 5 | One-command run | `figurine run` produces a sliced 3MF from a photo folder |
| 6 | Second subject | printed with **zero** manual mesh editing, under 30 min of human time |
| 7 | README | comparison table, printed photos, hosted-asset deletion record |

## 8. Bake-off (milestone 1)

Same 3 reference images through: **TRELLIS.2** (local, MIT), **Meshy** (hosted — claims 97%
slicer pass rate on figurines and Bambu 3MF export), **Tripo** (hosted — claims auto-repair
and clean topology). Optionally **Hunyuan3D 2.1** (local) as a fourth.

Vendor claims are hypotheses. They are tested on my own images, not accepted.

Score each 0–5 unless noted:

| Criterion | Weight | How measured |
| --- | --- | --- |
| Slicer pass rate | 30% | fraction of 3 that slice with no manual edit |
| Watertightness | 20% | `trimesh` watertight + shell count + boundary loops, raw output |
| Manual repair minutes | 25% | stopwatch, to first sliceable mesh |
| Likeness | 15% | blind 1–5 from 3 family members |
| Style consistency | 10% | do the 3 look like the same toy line |

Bake-off images are **synthetic or public-domain faces**, never my child's photos —
that is the whole point of not shipping his face to three vendors. Likeness is judged on the
local winner using his photos, locally, as a separate step.

Deliverable: `bakeoff/scorecard.csv` + a written verdict with numbers in the README.
Every hosted account's assets are deleted afterwards; the deletion is logged.

## 9. Out of scope, v1

Full-body rigging. Multicolor / AMS painting. Likeness fine-tuning (LoRA on a child's face —
deliberately excluded, on privacy grounds as well as scope). Web UI. Anyone outside my family.

## 10. Open decisions

Tracked in `docs/decisions.md`. D1 local vs hosted, D2 single vs multi-view reference,
D3 resin vs FDM. **These block coding of the generate stage. They do not block repair,
validate, or slice**, which is where the value is — so those are built first, against
fixture meshes.

## 11. Known risks

| Risk | Mitigation |
| --- | --- |
| TRELLIS.2 needs ≥ 24 GB VRAM, Linux-only | check local GPU before committing to D1; cloud GPU with a synthetic reference is a fallback |
| Poisson remesh destroys likeness while making a mesh manifold | remesh is a fallback, not the default; likeness diffed against pre-repair render |
| Bambu CLI 3MFs reimport badly (known issue #2930) | verify G-code presence in output; keep a plain-3MF path as fallback |
| Auto-orientation picks a pose that slices well and looks wrong | orientation is overridable in config and shown in the report |
| Style drift across runs | preset content hash pinned in the manifest; drift is a test failure |
