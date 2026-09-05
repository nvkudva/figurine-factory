# Figurine Factory

Photos of a family member → a stylized, print-ready 3D figurine on a Bambu printer, in one
command. The output is the pipeline, not one model.

**Success metric:** the second and third figurine each take under **30 minutes** of my time,
with **zero** manual mesh editing.

Full spec: [`prd.md`](prd.md). Open questions: [`docs/decisions.md`](docs/decisions.md).

## Why this exists

AI image-to-3D tools produce meshes that look fine on screen and fail in the slicer:
non-manifold geometry, floating shells, sub-0.8 mm walls, no flat base. **The value here is
the repair and validation stage**, not the generation stage. Generators are swappable
backends chosen by config.

## Privacy — non-negotiable

These are photos of my child.

- Generation runs **locally** by default (TRELLIS.2, MIT; or Hunyuan3D 2.1).
- **No child photos in this repo, in git history, or in any test fixture.** Enforced by
  `.gitignore`, a pre-commit hook (`scripts/check_no_photos.py`), and procedurally generated
  test fixtures. Photos live in untracked `work/`.
- Hosted generators refuse to run without an explicit `--allow-upload` flag, which is only
  ever used with synthetic or public-domain faces during the bake-off.
- Any hosted assets are deleted afterwards and logged in
  [`bakeoff/deletion_log.md`](bakeoff/deletion_log.md).

## Status

| Milestone | State |
| --- | --- |
| 1. Generator bake-off | not started — see [`bakeoff/`](bakeoff/) |
| 2. Manual end-to-end figurine | not started |
| 3. Repair automated | **scaffolded** — `figurine repair` runs today on any mesh |
| 4. Validation gates | **scaffolded** — `figurine validate`, 8 gates, tested |
| 5. One-command run | blocked on D1 (generator choice) |
| 6. Second subject, no manual editing | not started |
| 7. README with comparison table + photos | not started |

Repair and validation are built first, against synthetic fixtures, because they are the value
and they do not depend on which generator wins.

## Install

```bash
make dev            # editable install + dev deps + pre-commit hook
make fixtures       # generate synthetic test meshes
make test
```

## Use

```bash
# Repair and validate a mesh from any generator, then write STL + manifest + report
figurine repair path/to/raw.glb --height 100

# Score a raw mesh against the print gates without changing it (this is the bake-off metric)
figurine validate path/to/raw.glb

# Full pipeline (blocked on decision D1)
figurine run work/<alias>/photos --style chibi_vinyl --height 100
```

Exit codes: `0` pass · `2` validation failure · `3` generation failure · `4` slicer failure.

## What a failure looks like

Gates fail loudly and name the fix. Nothing is written when a gate fails.

```
2 validation gate(s) failed:
  FAIL min_wall_thickness: 0.41 mm at 3 sites, needs >= 0.80 mm
       fix: scale up (--height above 100 mm) or use a style preset with chunkier extremities
  FAIL shell_count: 5, needs <= 1
       fix: lower repair.min_shell_volume_frac to drop more debris, or the base union failed
No mesh was written. A bad STL is worse than no STL.
```

## Repository layout

```
prd.md                          the spec
docs/decisions.md               D1 local vs hosted, D2 single vs multi-view, D3 resin vs FDM
configs/default.yaml            every threshold, in one place
configs/presets/styles/         named style presets — this is why a set matches
configs/printers/               nozzle, plate, Bambu Studio preset JSONs
src/figurine_factory/
  meshops/                      stats, repair operations, wall-thickness raycasting
  stages/                       intake, stylize, generate, repair, validate, slice
  manifest.py                   everything needed to reproduce a run
  report.py                     before/after mesh stat report
bakeoff/                        milestone 1 harness, scorecard, deletion log
tests/fixtures/make_fixtures.py procedural broken meshes — never a photograph
scripts/check_no_photos.py      pre-commit privacy guard
```

## Generator comparison

Empty until milestone 1. Vendor claims — Meshy's 97% figurine slicer pass rate, Tripo's
auto-repair — are hypotheses to test on my own inputs, not facts to build on.

| backend | slicer pass | watertight | repair min | likeness | style | total |
| --- | --- | --- | --- | --- | --- | --- |
| _pending_ | | | | | | |

## Printed results

Empty until milestone 2.
