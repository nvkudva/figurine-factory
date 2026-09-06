# CLAUDE.md

Photos of a family member → a print-ready 3D figurine on a Bambu printer, one command.
Spec in `prd.md`; settled choices in `docs/decisions.md`.

## The one rule

**No photograph of a person enters this repo, its history, or any test fixture.**

- Subject photos live in `work/` (gitignored). Run outputs go to `out/` (gitignored).
- `scripts/check_no_photos.py` runs as a pre-commit hook and blocks image binaries and
  anything under `work/` or `out/`. Do not add exceptions to it without being asked.
- Test fixtures are **procedural geometry** (`tests/fixtures/make_fixtures.py`). Never
  commit a scan, a photo, or a mesh derived from one.
- Hosted generators (`meshy`, `tripo`) raise unless `allow_upload=True` is passed per run.
  That guard is load-bearing — `tests/test_privacy.py` holds it. Do not weaken it.

## Commands

```bash
make dev        # editable install + dev deps + pre-commit hook
make fixtures   # regenerate synthetic test meshes (needed before tests)
make test       # pytest
make lint       # ruff
figurine doctor # check this machine against what the pipeline needs
```

## Architecture

Stages are pure functions `(inputs, config) -> outputs + record`, run in a fixed order:
intake → stylize → generate → repair → validate → slice.

- `meshops/` — the actual mesh work. `repair_ops.py` order is load-bearing: basing before
  orienting glues the plinth to the wrong face.
- `stages/validate.py` — **the point of the project.** Gates hard-fail with a named fix and
  a measured value. Never emit a mesh past a failed gate; a bad STL is worse than no STL.
- `manifest.py` — every run records model, seeds, settings, stats and gate results, so a
  good figurine is reproducible.

Thresholds live in `configs/default.yaml` and `configs/printers/*.yaml`, never in code.
Style presets live in `configs/presets/styles/*.yaml` and are content-hashed into the
manifest, which is what keeps a set of figurines matching.

## Conventions

- Repair and validation are testable without a GPU and must stay that way. Generation needs
  a 24 GB NVIDIA GPU (TRELLIS.2), so it is not covered by the suite — say so rather than
  implying coverage that does not exist.
- Measure topology on a vertex-merged copy. STL gives every triangle its own vertices, so
  raw shell counts are a file-format artifact, not a defect.
- Validation failures name the gate, the measured value, the threshold, and the likely fix.
