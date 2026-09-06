# Figurine Factory

Photos of a family member → a stylized, print-ready 3D figurine on a Bambu printer, in one
command. The output is the pipeline, not one model.

**Success metric:** the second and third figurine each take under **30 minutes** of my time,
with **zero** manual mesh editing.

MIT licensed. Full spec: [`prd.md`](prd.md). Decisions: [`docs/decisions.md`](docs/decisions.md) —
local TRELLIS.2, a single stylized reference image, FDM.

## Why this exists

AI image-to-3D tools produce meshes that look fine on screen and fail in the slicer:
non-manifold geometry, floating shells, sub-0.8 mm walls, no flat base. **The value here is
the repair and validation stage**, not the generation stage. Generators are swappable
backends chosen by config.

## Privacy — non-negotiable

These are photos of my child.

- Generation runs **locally on TRELLIS.2** (MIT) — decided, see [D1](docs/decisions.md).
  Needs a 24 GB NVIDIA GPU on Linux; `figurine doctor` checks before you count on it.
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
| 3. Repair automated | **working** — `figurine repair` runs today on any mesh |
| 4. Validation gates | **working** — `figurine validate`, 8 gates, 15 tests green |
| 5. One-command run | generator chosen (TRELLIS.2); stylize + generate stages still to wire |
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
# Check this machine against what the pipeline needs
figurine doctor

# Repair and validate a mesh from any generator, then write STL + manifest + report
figurine repair path/to/raw.glb --height 100

# Score a raw mesh against the print gates without changing it (this is the bake-off metric)
figurine validate path/to/raw.glb

# Full pipeline (stylize + generate stages still to wire)
figurine run work/<alias>/photos --style chibi_vinyl --height 100
```

Exit codes: `0` pass · `2` validation failure · `3` generation failure · `4` slicer failure.

## What a failure looks like

Gates fail loudly and name the fix. Nothing is written when a gate fails.

```
$ figurine repair tests/fixtures/thin_wall.stl --height 20
2 validation gate(s) failed:
  FAIL shell_count: measured 2, needs <= 1
       fix: lower repair.min_shell_volume_frac to drop more debris, or the base union failed
  FAIL min_wall_thickness: measured 0.06 mm at 1848 sites, needs >= 0.80 mm
       fix: scale the figurine taller with --height, or use a style preset with chunkier
            extremities (thicker limbs, fused hair)
No mesh was written. A bad STL is worse than no STL.
```

And a run that passes writes the STL, a manifest, and a before/after report:

```
| stat                | before | after  |
| vertices            | 9264   | 1415   |
| shells              | 5      | 1      |
| watertight          | False  | True   |
| open boundary loops | 1      | 0      |
| min wall (mm)       | 2.26   | 3.40   |
| bbox (mm)           | [51.2, 32.0, 86.0] | [43.2, 43.2, 100.0] |
```

## Web UI

A local dashboard, three columns: **runs** with live mesh previews on the left, the
**object** centre stage, the **printer farm** on the right. Bun + React + Vite + CSS
Modules, with SQLite as the handoff between the Python pipeline and the UI.

The interface is dark-only on purpose — the neon reads against near-black and nowhere
else, and a glow palette with a light mode is two designs done badly. Colour carries
state and chrome; body text and numbers stay high-contrast.

Each printer is drawn rather than described: the gantry rides up as the job progresses
and the model is revealed bottom-up by a clip rectangle, so the picture *is* the progress
bar. Progress is derived from elapsed time against the job estimate rather than stored,
because a stored percentage goes stale the moment nothing updates it. Printers sort by
how much attention they need, so a paused machine never hides under a running one.

```bash
cd webui
bun install
bun run seed        # sample runs, so the UI works before the generator exists
bun run build
bun run api         # http://127.0.0.1:8757
```

`bun run api` alone serves the built app and the API on one origin. For frontend work,
run `bun run api` and `bun run ui` in two shells — Vite proxies `/api` to the Bun server.

Publish a real run into the UI:

```bash
figurine repair raw.glb --height 100
figurine publish out/<run_id>
```

The UI binds to **127.0.0.1 only** — this machine holds the photos and the meshes.
The seeded runs are labelled as mock in the sidebar so sample data never passes for a
real figurine. Half of them fail on purpose: the screen that says *which gate stopped
this figurine and what to do about it* is the one worth designing.

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
webui/                          Bun + React + Vite dashboard, SQLite-backed
  server/                       Bun.serve API, bun:sqlite queries, printer farm, seed
  src/                          React components with CSS Modules
src/figurine_factory/web/
  schema.sql                    one schema, shared by the Python writer and Bun reader
  sqlite_sink.py                publishes a run manifest into that database
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
